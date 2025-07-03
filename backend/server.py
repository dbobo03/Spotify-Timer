from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
from pathlib import Path
import spotipy
from spotipy.oauth2 import SpotifyOAuth
import urllib.parse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Spotify configuration
SPOTIFY_CLIENT_ID = os.environ.get('SPOTIFY_CLIENT_ID')
SPOTIFY_CLIENT_SECRET = os.environ.get('SPOTIFY_CLIENT_SECRET')
REDIRECT_URI = os.environ.get('REDIRECT_URI', 'https://spotify-timer.vercel.app/api/auth/callback')

def get_spotify_oauth():
    return SpotifyOAuth(
        client_id=SPOTIFY_CLIENT_ID,
        client_secret=SPOTIFY_CLIENT_SECRET,
        redirect_uri=REDIRECT_URI,
        scope="user-read-playback-state user-modify-playback-state user-read-private streaming user-read-email",
        show_dialog=True
    )

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Basic routes
@api_router.get("/")
async def root():
    return {"message": "Spotify Timer API"}

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
            access_token = token_info["access_token"]
            refresh_token = token_info["refresh_token"]
            expires_in = token_info["expires_in"]
            
            # Get frontend URL
            frontend_url = 'https://spotify-timer.vercel.app'
            
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

# Include the API router
app.include_router(api_router)

# For Vercel
def handler(request):
    return app(request)