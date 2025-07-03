from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from mangum import Mangum
import os
import requests
import urllib.parse
import base64

app = FastAPI()

# Spotify configuration
CLIENT_ID = os.environ.get('SPOTIFY_CLIENT_ID', 'b8df048a15f4402a866d7253a435139e')
CLIENT_SECRET = os.environ.get('SPOTIFY_CLIENT_SECRET', 'a88333b28daf49ea927f159c6454dd60')
REDIRECT_URI = 'https://spotify-timer.vercel.app/api/auth/callback'

@app.get("/api/")
async def root():
    return {"message": "Spotify Timer API"}

@app.get("/api/auth/login")
async def spotify_login():
    """Generate Spotify authorization URL"""
    params = {
        'client_id': CLIENT_ID,
        'response_type': 'code',
        'redirect_uri': REDIRECT_URI,
        'scope': 'user-read-playback-state user-modify-playback-state user-read-private streaming user-read-email',
        'show_dialog': 'true'
    }
    
    auth_url = 'https://accounts.spotify.com/authorize?' + urllib.parse.urlencode(params)
    return {"auth_url": auth_url}

@app.get("/api/auth/callback")
async def spotify_callback(code: str):
    """Handle Spotify OAuth callback"""
    try:
        # Exchange code for tokens
        token_url = 'https://accounts.spotify.com/api/token'
        
        auth_header = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
        
        headers = {
            'Authorization': f'Basic {auth_header}',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
        
        data = {
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': REDIRECT_URI
        }
        
        response = requests.post(token_url, headers=headers, data=data)
        
        if response.status_code == 200:
            token_info = response.json()
            access_token = token_info['access_token']
            refresh_token = token_info['refresh_token']
            expires_in = token_info['expires_in']
            
            # Redirect to frontend with tokens
            frontend_url = 'https://spotify-timer.vercel.app'
            callback_url = f"{frontend_url}?access_token={urllib.parse.quote(access_token)}&refresh_token={urllib.parse.quote(refresh_token)}&expires_in={expires_in}"
            
            return RedirectResponse(url=callback_url)
        else:
            raise HTTPException(status_code=400, detail="Failed to get access token")
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Authentication failed: {str(e)}")

# Vercel handler
handler = Mangum(app)