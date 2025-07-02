from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import spotipy
from spotipy.oauth2 import SpotifyOAuth
import urllib.parse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Spotify configuration
SPOTIFY_CLIENT_ID = os.environ['SPOTIFY_CLIENT_ID']
SPOTIFY_CLIENT_SECRET = os.environ['SPOTIFY_CLIENT_SECRET']
SPOTIFY_REDIRECT_URI = os.environ['REDIRECT_URI']
SPOTIFY_SCOPE = "user-read-playback-state user-modify-playback-state user-read-private streaming user-read-email"

def get_spotify_oauth():
    return SpotifyOAuth(
        client_id=SPOTIFY_CLIENT_ID,
        client_secret=SPOTIFY_CLIENT_SECRET,
        redirect_uri=SPOTIFY_REDIRECT_URI,
        scope=SPOTIFY_SCOPE,
        show_dialog=True
    )

# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

class TimerSettings(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    timer_duration_minutes: int = 30
    play_duration_seconds: int = 30
    selected_tracks: List[dict] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

class TimerSettingsCreate(BaseModel):
    user_id: str
    timer_duration_minutes: int = 30
    play_duration_seconds: int = 30
    selected_tracks: List[dict] = []

class PlayTrackRequest(BaseModel):
    track_uri: str
    position_ms: int = 0
    device_id: Optional[str] = None

class TransferPlaybackRequest(BaseModel):
    device_ids: List[str]
    play: bool = False

class TrackPosition(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    track_uri: str
    current_position_ms: int = 0
    last_played_at: datetime = Field(default_factory=datetime.utcnow)

# Basic routes
@api_router.get("/")
async def root():
    return {"message": "Spotify Timer API"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]

# Spotify Authentication Routes
@api_router.get("/auth/login")
async def spotify_login():
    """Generate Spotify authorization URL"""
    sp_oauth = get_spotify_oauth()
    auth_url = sp_oauth.get_authorize_url()
    return {"auth_url": auth_url}

@api_router.get("/auth/callback")
async def spotify_callback(code: str):
    """Handle Spotify OAuth callback"""
    try:
        sp_oauth = get_spotify_oauth()
        token_info = sp_oauth.get_access_token(code)
        
        if token_info:
            # Redirect to frontend with tokens as URL parameters
            from fastapi.responses import RedirectResponse
            import urllib.parse
            
            access_token = token_info["access_token"]
            refresh_token = token_info["refresh_token"]
            expires_in = token_info["expires_in"]
            
            # Get frontend URL from environment or construct it
            frontend_url = os.environ.get('FRONTEND_URL', 'https://d01819a1-dc26-483e-981d-fb955f8feaf3.preview.emergentagent.com')
            
            # Create callback URL with tokens
            callback_url = f"{frontend_url}?access_token={urllib.parse.quote(access_token)}&refresh_token={urllib.parse.quote(refresh_token)}&expires_in={expires_in}"
            
            return RedirectResponse(url=callback_url)
        else:
            raise HTTPException(status_code=400, detail="Failed to get access token")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Authentication failed: {str(e)}")

@api_router.post("/auth/refresh")
async def refresh_token(refresh_token: str):
    """Refresh Spotify access token"""
    try:
        sp_oauth = get_spotify_oauth()
        token_info = sp_oauth.refresh_access_token(refresh_token)
        return {
            "access_token": token_info["access_token"],
            "expires_in": token_info.get("expires_in", 3600)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Token refresh failed: {str(e)}")

# Spotify User Routes
@api_router.get("/spotify/user")
async def get_user_profile(access_token: str = Query(...)):
    """Get Spotify user profile"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        profile = sp.me()
        return {
            "id": profile["id"],
            "display_name": profile["display_name"],
            "email": profile.get("email"),
            "product": profile["product"],
            "is_premium": profile["product"] == "premium"
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Failed to get user profile: {str(e)}")

# Spotify Search Routes
@api_router.get("/spotify/search")
async def search_tracks(q: str = Query(...), access_token: str = Query(...)):
    """Search for tracks on Spotify"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        results = sp.search(q, limit=20, type='track')
        
        tracks = []
        for track in results['tracks']['items']:
            tracks.append({
                "id": track["id"],
                "name": track["name"],
                "uri": track["uri"],
                "duration_ms": track["duration_ms"],
                "artists": [{"name": artist["name"]} for artist in track["artists"]],
                "album": {
                    "name": track["album"]["name"],
                    "images": track["album"]["images"]
                }
            })
        
        return {"tracks": tracks}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Search failed: {str(e)}")

@api_router.get("/spotify/search-playlists")
async def search_playlists(q: str = Query(...), access_token: str = Query(...)):
    """Search for playlists on Spotify"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        results = sp.search(q, limit=20, type='playlist')
        
        playlists = []
        for playlist in results['playlists']['items']:
            playlists.append({
                "id": playlist["id"],
                "name": playlist["name"],
                "uri": playlist["uri"],
                "description": playlist.get("description", ""),
                "images": playlist.get("images", []),
                "tracks": {
                    "total": playlist["tracks"]["total"]
                },
                "owner": {
                    "display_name": playlist["owner"]["display_name"]
                }
            })
        
        return {"playlists": playlists}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Playlist search failed: {str(e)}")

# Spotify Playback Routes
@api_router.put("/spotify/transfer-playback")
async def transfer_playback(
    request: TransferPlaybackRequest,
    access_token: str = Query(...)
):
    """Transfer playback to a specific device"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        sp.transfer_playback(device_id=request.device_ids[0], force_play=request.play)
        return {"status": "transferred", "device_id": request.device_ids[0]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Transfer failed: {str(e)}")

@api_router.post("/spotify/play")
async def start_playback(
    request: PlayTrackRequest,
    access_token: str = Query(...)
):
    """Start track playback"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        
        # Get available devices
        devices = sp.devices()
        if not devices['devices']:
            raise HTTPException(status_code=404, detail="No active devices found. Please open Spotify on a device.")
        
        # Use specified device or first available
        target_device = request.device_id
        if not target_device:
            target_device = devices['devices'][0]['id']
        
        sp.start_playback(
            device_id=target_device,
            uris=[request.track_uri],
            position_ms=request.position_ms
        )
        
        return {
            "status": "playing",
            "track_uri": request.track_uri,
            "position_ms": request.position_ms,
            "device_id": target_device
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Playback failed: {str(e)}")

@api_router.post("/spotify/pause")
async def pause_playback(device_id: Optional[str] = None, access_token: str = Query(...)):
    """Pause playback"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        sp.pause_playback(device_id=device_id)
        return {"status": "paused"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Pause failed: {str(e)}")

@api_router.get("/spotify/playback")
async def get_playback_state(access_token: str = Query(...)):
    """Get current playback state"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        state = sp.current_playback()
        
        if not state:
            return {"is_playing": False, "device": None}
        
        return {
            "is_playing": state.get("is_playing", False),
            "progress_ms": state.get("progress_ms", 0),
            "device": {
                "id": state["device"]["id"],
                "name": state["device"]["name"],
                "type": state["device"]["type"]
            } if state.get("device") else None,
            "track": {
                "id": state["item"]["id"],
                "name": state["item"]["name"],
                "uri": state["item"]["uri"],
                "duration_ms": state["item"]["duration_ms"]
            } if state.get("item") else None
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get playback state: {str(e)}")

@api_router.get("/spotify/devices")
async def get_devices(access_token: str = Query(...)):
    """Get available Spotify devices"""
    try:
        sp = spotipy.Spotify(auth=access_token)
        devices = sp.devices()
        return devices
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get devices: {str(e)}")

# Timer Settings Routes
@api_router.post("/timer/settings")
async def save_timer_settings(settings: TimerSettingsCreate):
    """Save timer settings for a user"""
    try:
        # Remove existing settings for this user
        await db.timer_settings.delete_many({"user_id": settings.user_id})
        
        # Save new settings
        settings_dict = settings.dict()
        settings_obj = TimerSettings(**settings_dict)
        await db.timer_settings.insert_one(settings_obj.dict())
        
        return settings_obj
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to save settings: {str(e)}")

@api_router.get("/timer/settings/{user_id}")
async def get_timer_settings(user_id: str):
    """Get timer settings for a user"""
    try:
        settings = await db.timer_settings.find_one({"user_id": user_id})
        if settings:
            return TimerSettings(**settings)
        else:
            # Return default settings
            return TimerSettings(user_id=user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get settings: {str(e)}")

# Track Position Routes
@api_router.post("/timer/track-position")
async def save_track_position(position: TrackPosition):
    """Save current track position"""
    try:
        # Update or create track position
        await db.track_positions.update_one(
            {"user_id": position.user_id, "track_uri": position.track_uri},
            {"$set": position.dict()},
            upsert=True
        )
        return {"status": "saved", "position_ms": position.current_position_ms}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to save position: {str(e)}")

@api_router.get("/timer/track-position/{user_id}/{track_uri}")
async def get_track_position(user_id: str, track_uri: str):
    """Get saved track position"""
    try:
        # URL decode the track_uri
        decoded_uri = urllib.parse.unquote(track_uri)
        position = await db.track_positions.find_one({"user_id": user_id, "track_uri": decoded_uri})
        if position:
            return TrackPosition(**position)
        else:
            return TrackPosition(user_id=user_id, track_uri=decoded_uri, current_position_ms=0)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get position: {str(e)}")

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()