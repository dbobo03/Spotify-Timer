# 🎵 Spotify Timer Pro

Advanced music scheduling app with calendar integration and precise timing controls.

## Features

- 📅 **Calendar Scheduling** - Set schedules months in advance
- 🎯 **Precise Timing** - Customizable timer and play durations  
- 📱 **Mobile Ready** - PWA with app-like experience
- 🎵 **Music Control** - Support for tracks and playlists
- ⚙️ **Advanced Settings** - Flexible timing and playback options

## Deployment

### Vercel Deployment

1. **Connect GitHub Repository**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

2. **Deploy to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Vercel will auto-detect the configuration

3. **Environment Variables**
   Set these in Vercel dashboard:
   ```
   SPOTIFY_CLIENT_ID=b8df048a15f4402a866d7253a435139e
   SPOTIFY_CLIENT_SECRET=a88333b28daf49ea927f159c6454dd60
   MONGO_URL=your_mongodb_connection_string
   ```

4. **Update Spotify Redirect URI**
   Add your Vercel domain to Spotify app:
   ```
   https://YOUR_APP_NAME.vercel.app/auth/callback
   ```

## Local Development

```bash
# Install dependencies
npm install

# Start development server
cd frontend && npm start

# Start backend (in another terminal)
cd backend && python server.py
```

## Mobile App Installation

This is a Progressive Web App (PWA) that can be installed like a native app:

### iOS (iPhone/iPad)
1. Open in Safari
2. Tap Share button
3. Select "Add to Home Screen"
4. App will appear on your home screen

### Android
1. Open in Chrome
2. Tap the menu (3 dots)
3. Select "Add to Home screen" or "Install app"

## Tech Stack

- **Frontend**: React, CSS3, PWA
- **Backend**: FastAPI, Python
- **Database**: MongoDB
- **API**: Spotify Web API
- **Deployment**: Vercel

## License

MIT License - Feel free to use and modify!