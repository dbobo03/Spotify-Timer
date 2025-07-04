import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// Spotify configuration
const SPOTIFY_CLIENT_ID = 'b8df048a15f4402a866d7253a435139e';
const SPOTIFY_REDIRECT_URI = 'https://spotify-timer.vercel.app';

// Timer presets in minutes and seconds for easy testing
const TIMER_PRESETS = [
  { label: "10s", value: 10/60, unit: "seconds" },
  { label: "30s", value: 30/60, unit: "seconds" },
  { label: "1m", value: 1, unit: "minutes" },
  { label: "5m", value: 5, unit: "minutes" },
  { label: "10m", value: 10, unit: "minutes" },
  { label: "15m", value: 15, unit: "minutes" },
  { label: "30m", value: 30, unit: "minutes" },
  { label: "45m", value: 45, unit: "minutes" },
  { label: "60m", value: 60, unit: "minutes" }
];

// Days of the week
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Time slots from 7:00 to 17:00 (30-min intervals)
const generateTimeSlots = () => {
  const slots = [];
  for (let hour = 7; hour <= 17; hour++) {
    slots.push(`${hour.toString().padStart(2, '0')}:00`);
    if (hour < 17) {
      slots.push(`${hour.toString().padStart(2, '0')}:30`);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();

// Calendar helper functions
const getMonthName = (monthIndex) => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[monthIndex];
};

const getDaysInMonth = (year, month) => {
  return new Date(year, month + 1, 0).getDate();
};

const getFirstDayOfMonth = (year, month) => {
  return new Date(year, month, 1).getDay(); // 0 = Sunday
};

const SpotifyTimer = () => {
  // Authentication state
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [user, setUser] = useState(null);

  // Track selection state - separate for scheduled and manual
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedTracks, setSelectedTracks] = useState([]); // For manual timer (20 slots)
  const [selectedPlaylists, setSelectedPlaylists] = useState([]); // For scheduled playback
  const [scheduledPlaylists, setScheduledPlaylists] = useState([]); // Dedicated for scheduled system
  const [isSearching, setIsSearching] = useState(false);
  const [searchType, setSearchType] = useState('tracks'); // 'tracks' or 'playlists'

  // Timer state - separate systems
  const [timerDuration, setTimerDuration] = useState(30); // minutes - manual timer
  const [playDuration, setPlayDuration] = useState(30); // seconds - both systems
  const [timeRemaining, setTimeRemaining] = useState(30 * 60); // seconds - manual timer
  const [isTimerRunning, setIsTimerRunning] = useState(false); // manual timer
  const [isPlaying, setIsPlaying] = useState(false); // both systems
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0); // manual timer tracks
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(0); // scheduled playlists
  const [trackPositions, setTrackPositions] = useState({}); // remember positions for scheduled
  const [playlistPositions, setPlaylistPositions] = useState({}); // remember playlist positions

  // Enhanced features
  const [activeTab, setActiveTab] = useState('welcome'); // welcome, timer, schedule, tracks, playlists
  const [scheduleType, setScheduleType] = useState('weekly'); // 'weekly' or 'calendar'
  const [weeklySchedule, setWeeklySchedule] = useState({});
  const [calendarSchedule, setCalendarSchedule] = useState({}); // date-based schedule
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [playbackTimingMode, setPlaybackTimingMode] = useState('start');
  const [absoluteTimeMode, setAbsoluteTimeMode] = useState(false);
  const [absoluteTimeSlots, setAbsoluteTimeSlots] = useState({
    hourly: false,
    halfHourly: false,
    custom: {}
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [currentlyPlaying, setCurrentlyPlaying] = useState(null);
  const [devices, setDevices] = useState([]);
  const [customTimerInput, setCustomTimerInput] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Refs for intervals
  const timerIntervalRef = useRef(null);
  const playbackIntervalRef = useRef(null);
  const absoluteTimerRef = useRef(null);

  // Initialize app
  useEffect(() => {
    // Load saved settings from localStorage (available without login)
    loadLocalSettings();

    // Check for tokens in URL hash (Spotify implicit flow)
    const hash = window.location.hash.substring(1);
    const hashParams = new URLSearchParams(hash);
    const accessTokenFromHash = hashParams.get('access_token');
    const expiresIn = hashParams.get('expires_in');
    
    // Also check query parameters (for backward compatibility)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const accessTokenFromUrl = urlParams.get('access_token');
    const refreshTokenFromUrl = urlParams.get('refresh_token');
    
    if (accessTokenFromHash) {
      // Handle Spotify implicit flow token
      setAccessToken(accessTokenFromHash);
      setIsLoggedIn(true);
      
      localStorage.setItem('spotify_access_token', accessTokenFromHash);
      
      // Clean up URL
      window.history.replaceState({}, document.title, '/');
      setActiveTab('timer');
    } else if (accessTokenFromUrl && refreshTokenFromUrl) {
      // Handle direct token callback from backend redirect
      setAccessToken(accessTokenFromUrl);
      setRefreshToken(refreshTokenFromUrl);
      setIsLoggedIn(true);
      
      localStorage.setItem('spotify_access_token', accessTokenFromUrl);
      localStorage.setItem('spotify_refresh_token', refreshTokenFromUrl);
      
      // Clean up URL
      window.history.replaceState({}, document.title, '/');
      setActiveTab('timer');
    } else if (code) {
      handleAuthCallback(code);
    } else {
      // Try to load stored tokens
      const storedAccessToken = localStorage.getItem('spotify_access_token');
      const storedRefreshToken = localStorage.getItem('spotify_refresh_token');
      
      if (storedAccessToken) {
        setAccessToken(storedAccessToken);
        setRefreshToken(storedRefreshToken);
        setIsLoggedIn(true);
      }
    }

    // Request notification permission
    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        setNotificationsEnabled(permission === 'granted');
      });
    }

    // Initialize schedules
    initializeWeeklySchedule();
    initializeCalendarSchedule();
  }, []);

  // Load user profile when access token is available
  useEffect(() => {
    if (accessToken) {
      loadUserProfile();
      loadDevices();
      loadTimerSettings();
      setIsLoggedIn(true);
    }
  }, [accessToken]);

  // Save settings to localStorage whenever they change
  useEffect(() => {
    saveLocalSettings();
  }, [weeklySchedule, calendarSchedule, timerDuration, playDuration, playbackTimingMode, absoluteTimeMode, absoluteTimeSlots, selectedTracks, selectedPlaylists]);

  const loadLocalSettings = () => {
    try {
      const saved = localStorage.getItem('spotify_timer_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        setWeeklySchedule(settings.weeklySchedule || {});
        setCalendarSchedule(settings.calendarSchedule || {});
        setTimerDuration(settings.timerDuration || 30);
        setPlayDuration(settings.playDuration || 30);
        setPlaybackTimingMode(settings.playbackTimingMode || 'start');
        setAbsoluteTimeMode(settings.absoluteTimeMode || false);
        setAbsoluteTimeSlots(settings.absoluteTimeSlots || { hourly: false, halfHourly: false, custom: {} });
        setSelectedTracks(settings.selectedTracks || []);
        setSelectedPlaylists(settings.selectedPlaylists || []);
      }
    } catch (error) {
      console.error('Error loading local settings:', error);
    }
  };

  const saveLocalSettings = () => {
    try {
      const settings = {
        weeklySchedule,
        calendarSchedule,
        timerDuration,
        playDuration,
        playbackTimingMode,
        absoluteTimeMode,
        absoluteTimeSlots,
        selectedTracks,
        selectedPlaylists
      };
      localStorage.setItem('spotify_timer_settings', JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving local settings:', error);
    }
  };

  const initializeWeeklySchedule = () => {
    const schedule = {};
    DAYS.forEach(day => {
      schedule[day] = {
        wholeDay: false,
        timeSlots: {}
      };
      TIME_SLOTS.forEach(slot => {
        schedule[day].timeSlots[slot] = false;
      });
    });
    setWeeklySchedule(prev => ({ ...schedule, ...prev }));
  };

  const initializeCalendarSchedule = () => {
    // Calendar schedule will be populated as needed
    setCalendarSchedule(prev => prev || {});
  };

  // Timer and authentication functions (same as before but moved down)
  // No longer needed - handled by URL hash parsing
  const handleAuthCallback = async (code) => {
    console.log('Auth callback deprecated - using direct token flow');
  };

  const handleLogin = async () => {
    try {
      // Direct Spotify OAuth (PKCE flow)
      const clientId = 'b8df048a15f4402a866d7253a435139e';
      const redirectUri = 'https://spotify-timer.vercel.app';
      const scopes = 'user-read-playback-state user-modify-playback-state user-read-private streaming user-read-email';
      
      const authUrl = `https://accounts.spotify.com/authorize?` +
        `client_id=${clientId}&` +
        `response_type=token&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `show_dialog=true`;
      
      window.location.href = authUrl;
    } catch (error) {
      console.error('Login error:', error);
      alert('Failed to start login process');
    }
  };

  const loadUserProfile = async () => {
    try {
      if (!accessToken) return;
      
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        console.error('Failed to load user profile');
      }
    } catch (error) {
      console.error('Failed to load user profile:', error);
    }
  };

  const refreshAccessToken = async () => {
    console.log('Token refresh not needed in implicit flow');
    // Implicit flow tokens can't be refreshed - need re-authentication
  };

  const loadDevices = async () => {
    try {
      if (!accessToken) return;
      
      const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices || []);
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  const loadTimerSettings = async () => {
    try {
      // Use localStorage for settings (no backend needed)
      const settings = localStorage.getItem('timer_settings');
      if (settings) {
        const parsedSettings = JSON.parse(settings);
        setTimerDuration(parsedSettings.timer_duration_minutes || 30);
        setPlayDuration(parsedSettings.play_duration_seconds || 30);
        setSelectedTracks(parsedSettings.selected_tracks || []);
      }
    } catch (error) {
      console.error('Failed to load timer settings:', error);
    }
  };

  const saveTimerSettings = async () => {
    try {
      // Save to localStorage instead of backend
      const settings = {
        timer_duration_minutes: timerDuration,
        play_duration_seconds: playDuration,
        selected_tracks: selectedTracks
      };
      localStorage.setItem('timer_settings', JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save timer settings:', error);
    }
  };

  const searchTracks = async () => {
    if (!searchQuery.trim() || !accessToken) return;
    
    setIsSearching(true);
    try {
      if (searchType === 'tracks') {
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=10`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data.tracks.items);
        }
      } else {
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=playlist&limit=10`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data.playlists.items);
        }
      }
    } catch (error) {
      console.error('Search failed:', error);
      alert('Search failed. Please log in to Spotify first.');
    } finally {
      setIsSearching(false);
    }
  };

  const selectTrack = (track) => {
    if (selectedTracks.length >= 20) {
      alert('You can select up to 20 tracks for the manual timer');
      return;
    }
    
    // Allow duplicates - add each selection as a new entry
    const trackWithId = {
      ...track,
      selectionId: `${track.id}_${Date.now()}_${selectedTracks.length}` // unique selection ID
    };
    
    const newTracks = [...selectedTracks, trackWithId];
    setSelectedTracks(newTracks);
    if (accessToken) saveTimerSettings();
  };

  const removeTrack = (selectionId) => {
    const newTracks = selectedTracks.filter(track => track.selectionId !== selectionId);
    setSelectedTracks(newTracks);
    if (accessToken) saveTimerSettings();
  };

  const selectScheduledPlaylist = (playlist) => {
    if (scheduledPlaylists.find(p => p.id === playlist.id)) {
      alert('Playlist already selected for scheduled playback');
      return;
    }
    
    const newPlaylists = [...scheduledPlaylists, playlist];
    setScheduledPlaylists(newPlaylists);
    if (accessToken) saveLocalSettings();
  };

  const removeScheduledPlaylist = (playlistId) => {
    const newPlaylists = scheduledPlaylists.filter(playlist => playlist.id !== playlistId);
    setScheduledPlaylists(newPlaylists);
    if (accessToken) saveLocalSettings();
  };

  const removeTrack = (selectionId) => {
    const newTracks = selectedTracks.filter(track => track.selectionId !== selectionId);
    setSelectedTracks(newTracks);
    if (accessToken) saveTimerSettings();
  };

  const selectScheduledPlaylist = (playlist) => {
    if (scheduledPlaylists.find(p => p.id === playlist.id)) {
      alert('Playlist already selected for scheduled playback');
      return;
    }
    
    const newPlaylists = [...scheduledPlaylists, playlist];
    setScheduledPlaylists(newPlaylists);
    if (accessToken) saveLocalSettings();
  };

  const removeScheduledPlaylist = (playlistId) => {
    const newPlaylists = scheduledPlaylists.filter(playlist => playlist.id !== playlistId);
    setScheduledPlaylists(newPlaylists);
    if (accessToken) saveLocalSettings();
  };

  const selectPlaylist = (playlist) => {
    if (selectedPlaylists.find(p => p.id === playlist.id)) {
      alert('Playlist already selected');
      return;
    }
    
    const newPlaylists = [...selectedPlaylists, playlist];
    setSelectedPlaylists(newPlaylists);
  };

  const removeTrack = (trackId) => {
    const newTracks = selectedTracks.filter(t => t.id !== trackId);
    setSelectedTracks(newTracks);
    if (accessToken) saveTimerSettings();
  };

  const removePlaylist = (playlistId) => {
    const newPlaylists = selectedPlaylists.filter(p => p.id !== playlistId);
    setSelectedPlaylists(newPlaylists);
  };

  // Calendar functions
  const formatDateKey = (date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const toggleCalendarScheduleSlot = (date, timeSlot) => {
    const dateKey = formatDateKey(date);
    setCalendarSchedule(prev => ({
      ...prev,
      [dateKey]: {
        ...prev[dateKey],
        timeSlots: {
          ...prev[dateKey]?.timeSlots,
          [timeSlot]: !prev[dateKey]?.timeSlots?.[timeSlot]
        }
      }
    }));
  };

  const toggleCalendarWholeDay = (date) => {
    const dateKey = formatDateKey(date);
    const allSelected = !calendarSchedule[dateKey]?.wholeDay;
    
    setCalendarSchedule(prev => {
      const newTimeSlots = {};
      TIME_SLOTS.forEach(slot => {
        newTimeSlots[slot] = allSelected;
      });
      
      return {
        ...prev,
        [dateKey]: {
          wholeDay: allSelected,
          timeSlots: newTimeSlots
        }
      };
    });
  };

  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const days = [];
    
    // Empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateKey = formatDateKey(date);
      const hasSchedule = calendarSchedule[dateKey] && Object.values(calendarSchedule[dateKey].timeSlots || {}).some(slot => slot);
      const isSelected = selectedDate && formatDateKey(selectedDate) === dateKey;
      const isToday = new Date().toDateString() === date.toDateString();
      
      days.push(
        <div 
          key={day} 
          className={`calendar-day ${hasSchedule ? 'has-schedule' : ''} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}`}
          onClick={() => setSelectedDate(date)}
        >
          <span className="day-number">{day}</span>
          {hasSchedule && <div className="schedule-indicator"></div>}
        </div>
      );
    }
    
    return (
      <div className="calendar">
        <div className="calendar-header">
          <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>‹</button>
          <h3>{getMonthName(month)} {year}</h3>
          <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>›</button>
        </div>
        <div className="calendar-weekdays">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="weekday">{day}</div>
          ))}
        </div>
        <div className="calendar-grid">
          {days}
        </div>
      </div>
    );
  };

  // Timer and playback functions
  // Timer logic
  useEffect(() => {
    if (isTimerRunning && timeRemaining > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            // Timer expired - trigger music playback
            triggerMusicPlayback();
            return timerDuration * 60; // Reset timer
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerIntervalRef.current);
    }

    return () => clearInterval(timerIntervalRef.current);
  }, [isTimerRunning, timeRemaining, timerDuration]);

  // Music playback logic
  useEffect(() => {
    if (isPlaying) {
      playbackIntervalRef.current = setTimeout(() => {
        setIsPlaying(false);
        
        // Handle different timing modes
        if (playbackTimingMode === 'end') {
          // Reset timer after music ends
          setTimeRemaining(timerDuration * 60);
        }
        // For 'start' mode, timer already resets when music starts
        
        showNotification('Music segment finished', 'Ready for next timer cycle');
      }, playDuration * 1000);
    } else {
      clearTimeout(playbackIntervalRef.current);
    }

    return () => clearTimeout(playbackIntervalRef.current);
  }, [isPlaying, playDuration, playbackTimingMode, timerDuration]);

  const triggerMusicPlayback = async () => {
    if (selectedTracks.length === 0 && selectedPlaylists.length === 0) {
      showNotification('No music selected', 'Please select tracks or playlists first');
      setIsTimerRunning(false);
      return;
    }

    setIsPlaying(true);
    
    // Show notification
    showNotification('Timer expired!', 'Playing your selected music');
    
    // Play music via Spotify Web Playback SDK (if available)
    try {
      await playCurrentTrack();
    } catch (error) {
      console.error('Playback failed:', error);
      showNotification('Playback failed', 'Please check your Spotify connection');
    }
  };

  const playCurrentTrack = async () => {
    if (!accessToken) return;

    const allTracks = [...selectedTracks];
    if (allTracks.length === 0) return;

    const currentTrack = allTracks[currentTrackIndex % allTracks.length];
    
    try {
      // Start playback
      const response = await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: [currentTrack.uri],
          position_ms: trackPositions[currentTrack.uri] || 0
        })
      });

      if (response.ok) {
        // Move to next track for next cycle
        setCurrentTrackIndex(prev => prev + 1);
        
        // Update track position for resume functionality
        setTimeout(() => {
          setTrackPositions(prev => ({
            ...prev,
            [currentTrack.uri]: (prev[currentTrack.uri] || 0) + (playDuration * 1000)
          }));
        }, playDuration * 1000);
      } else {
        throw new Error('Playback request failed');
      }
    } catch (error) {
      console.error('Error playing track:', error);
      throw error;
    }
  };

  const showNotification = (title, body) => {
    if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico'
      });
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Clean up intervals on unmount
  useEffect(() => {
    return () => {
      clearInterval(timerIntervalRef.current);
      clearTimeout(playbackIntervalRef.current);
      clearInterval(absoluteTimerRef.current);
    };
  }, []);

  // Welcome page (accessible without login)
  const renderWelcomePage = () => (
    <div className="welcome-page">
      <div className="hero-section">
        <h1>🎵 Spotify Timer Pro</h1>
        <p className="hero-subtitle">Advanced music scheduling with calendar support</p>
        <div className="hero-features">
          <div className="feature-item">📅 Calendar Scheduling</div>
          <div className="feature-item">🎯 Precise Timing</div>
          <div className="feature-item">📱 Mobile Ready</div>
          <div className="feature-item">🎵 Playlist Support</div>
        </div>
      </div>
      
      <div className="welcome-content">
        <div className="feature-section">
          <h2>Getting Started</h2>
          <div className="step-cards">
            <div className="step-card">
              <div className="step-number">1</div>
              <h3>Set Your Schedule</h3>
              <p>Configure when you want music to play using our weekly or calendar view</p>
              <button 
                className="action-btn secondary"
                onClick={() => setActiveTab('schedule')}
              >
                Set Schedule
              </button>
            </div>
            
            <div className="step-card">
              <div className="step-number">2</div>
              <h3>Configure Settings</h3>
              <p>Customize timer duration, play length, and timing preferences</p>
              <button 
                className="action-btn secondary"
                onClick={() => setShowSettings(true)}
              >
                Configure Settings
              </button>
            </div>
            
            <div className="step-card">
              <div className="step-number">3</div>
              <h3>Connect Spotify</h3>
              <p>Log in to Spotify to select tracks and start your timer</p>
              <button 
                className="action-btn primary"
                onClick={handleLogin}
              >
                Login with Spotify
              </button>
            </div>
          </div>
        </div>

        <div className="feature-section">
          <h2>Features</h2>
          <div className="features-grid">
            <div className="feature-card">
              <h3>📅 Advanced Scheduling</h3>
              <p>Set schedules months in advance with our calendar view, or use weekly recurring patterns</p>
            </div>
            <div className="feature-card">
              <h3>🎵 Music Control</h3>
              <p>Play 30-second segments from your favorite tracks or entire playlists with precise timing</p>
            </div>
            <div className="feature-card">
              <h3>⚙️ Flexible Timing</h3>
              <p>Choose between relative timers or absolute time scheduling (every hour, half-hour, etc.)</p>
            </div>
            <div className="feature-card">
              <h3>📱 Mobile Ready</h3>
              <p>Optimized for mobile devices - works perfectly on your phone throughout the day</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // If user is not logged in, show welcome page with limited features
  if (!isLoggedIn) {
    return (
      <div className="spotify-timer">
        {/* Header */}
        <div className="header">
          <h1>🎵 Spotify Timer Pro</h1>
          <div className="user-info">
            <button 
              className="settings-btn"
              onClick={() => setShowSettings(!showSettings)}
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="tab-navigation">
          <button 
            className={activeTab === 'welcome' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('welcome')}
          >
            Home
          </button>
          <button 
            className={activeTab === 'schedule' ? 'tab-btn active' : 'tab-btn'}
            onClick={() => setActiveTab('schedule')}
          >
            Schedule
          </button>
          <button 
            className="tab-btn disabled"
            onClick={() => alert('Please log in to Spotify to access tracks')}
          >
            Tracks
          </button>
          <button 
            className="tab-btn disabled"
            onClick={() => alert('Please log in to Spotify to access playlists')}
          >
            Playlists
          </button>
        </div>

        {/* Content based on active tab */}
        {activeTab === 'welcome' && renderWelcomePage()}

        {/* Schedule Tab (accessible without login) */}
        {activeTab === 'schedule' && (
          <div className="schedule-section">
            <div className="schedule-header">
              <h3>Schedule Configuration</h3>
              <p>Set when your timer should be active (works without Spotify login)</p>
              
              <div className="schedule-type-toggle">
                <button
                  onClick={() => setScheduleType('weekly')}
                  className={scheduleType === 'weekly' ? 'toggle-btn active' : 'toggle-btn'}
                >
                  Weekly Pattern
                </button>
                <button
                  onClick={() => setScheduleType('calendar')}
                  className={scheduleType === 'calendar' ? 'toggle-btn active' : 'toggle-btn'}
                >
                  Calendar View
                </button>
              </div>
            </div>

            {scheduleType === 'weekly' && (
              <div className="weekly-schedule-section">
                <h4>Weekly Recurring Schedule</h4>
                <p>Select time slots for each day (7:00 AM - 5:00 PM)</p>
                
                <div className="weekly-schedule">
                  <div className="schedule-header-weekly">
                    <div className="time-label">Time</div>
                    {DAYS.map(day => (
                      <div key={day} className="day-header">
                        <div className="day-name">{day.substring(0, 3)}</div>
                        <label className="whole-day-checkbox">
                          <input
                            type="checkbox"
                            checked={weeklySchedule[day]?.wholeDay || false}
                            onChange={() => {
                              const allSelected = !weeklySchedule[day]?.wholeDay;
                              setWeeklySchedule(prev => {
                                const newTimeSlots = {};
                                TIME_SLOTS.forEach(slot => {
                                  newTimeSlots[slot] = allSelected;
                                });
                                
                                return {
                                  ...prev,
                                  [day]: {
                                    wholeDay: allSelected,
                                    timeSlots: newTimeSlots
                                  }
                                };
                              });
                            }}
                          />
                          All Day
                        </label>
                      </div>
                    ))}
                  </div>
                  
                  <div className="schedule-grid">
                    {TIME_SLOTS.map(timeSlot => (
                      <div key={timeSlot} className="schedule-row">
                        <div className="time-slot-label">{timeSlot}</div>
                        {DAYS.map(day => (
                          <div key={`${day}-${timeSlot}`} className="schedule-cell">
                            <input
                              type="checkbox"
                              checked={weeklySchedule[day]?.timeSlots?.[timeSlot] || false}
                              onChange={() => {
                                setWeeklySchedule(prev => ({
                                  ...prev,
                                  [day]: {
                                    ...prev[day],
                                    timeSlots: {
                                      ...prev[day]?.timeSlots,
                                      [timeSlot]: !prev[day]?.timeSlots?.[timeSlot]
                                    }
                                  }
                                }));
                              }}
                              className="schedule-checkbox"
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {scheduleType === 'calendar' && (
              <div className="calendar-schedule-section">
                <h4>Calendar-Based Scheduling</h4>
                <p>Set schedules for specific dates (months in advance)</p>
                
                <div className="calendar-container">
                  {renderCalendar()}
                  
                  {selectedDate && (
                    <div className="date-schedule-config">
                      <h4>Schedule for {selectedDate.toLocaleDateString()}</h4>
                      
                      <label className="whole-day-checkbox">
                        <input
                          type="checkbox"
                          checked={calendarSchedule[formatDateKey(selectedDate)]?.wholeDay || false}
                          onChange={() => toggleCalendarWholeDay(selectedDate)}
                        />
                        Whole Day
                      </label>
                      
                      <div className="time-slots-config">
                        {TIME_SLOTS.map(timeSlot => (
                          <label key={timeSlot} className="time-slot-checkbox">
                            <input
                              type="checkbox"
                              checked={calendarSchedule[formatDateKey(selectedDate)]?.timeSlots?.[timeSlot] || false}
                              onChange={() => toggleCalendarScheduleSlot(selectedDate, timeSlot)}
                            />
                            {timeSlot}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Settings Panel (accessible without login) */}
        {showSettings && (
          <div className="settings-panel">
            <h3>Timer Settings</h3>
            <p>Configure your preferences (saved locally)</p>
            
            {/* Timer Mode Toggle */}
            <div className="setting-group">
              <label>Timer Mode</label>
              <div className="toggle-group">
                <button
                  onClick={() => setAbsoluteTimeMode(false)}
                  className={!absoluteTimeMode ? 'toggle-btn active' : 'toggle-btn'}
                >
                  Relative Timer
                </button>
                <button
                  onClick={() => setAbsoluteTimeMode(true)}
                  className={absoluteTimeMode ? 'toggle-btn active' : 'toggle-btn'}
                >
                  Absolute Time
                </button>
              </div>
            </div>

            {/* Playback Timing Mode */}
            <div className="setting-group">
              <label>Cycle Calculation</label>
              <div className="toggle-group">
                <button
                  onClick={() => setPlaybackTimingMode('start')}
                  className={playbackTimingMode === 'start' ? 'toggle-btn active' : 'toggle-btn'}
                >
                  From Start
                </button>
                <button
                  onClick={() => setPlaybackTimingMode('end')}
                  className={playbackTimingMode === 'end' ? 'toggle-btn active' : 'toggle-btn'}
                >
                  From End
                </button>
              </div>
              <small>From Start: Timer starts when song begins | From End: Timer starts when song ends</small>
            </div>

            {/* Timer Duration (only for relative mode) */}
            {!absoluteTimeMode && (
              <div className="setting-group">
                <label>Timer Duration</label>
                <div className="timer-presets">
                  {TIMER_PRESETS.map(preset => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        setTimerDuration(preset.value);
                        setTimeRemaining(preset.value * 60);
                      }}
                      className={Math.abs(timerDuration - preset.value) < 0.1 ? 'preset-btn active' : 'preset-btn'}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Play Duration */}
            <div className="setting-group">
              <label>Play Duration (seconds)</label>
              <input
                type="range"
                min="10"
                max="60"
                value={playDuration}
                onChange={(e) => setPlayDuration(parseInt(e.target.value))}
              />
              <span>{playDuration}s</span>
            </div>

            <div className="settings-footer">
              <p><strong>Note:</strong> To start playing music, you'll need to log in to Spotify</p>
              <button className="action-btn primary" onClick={handleLogin}>
                Login with Spotify
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Timer logic
  useEffect(() => {
    if (isTimerRunning && timeRemaining > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            // Timer expired - trigger music playback
            triggerMusicPlayback();
            return timerDuration * 60; // Reset timer
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerIntervalRef.current);
    }

    return () => clearInterval(timerIntervalRef.current);
  }, [isTimerRunning, timeRemaining, timerDuration]);

  // Music playback logic
  useEffect(() => {
    if (isPlaying) {
      playbackIntervalRef.current = setTimeout(() => {
        setIsPlaying(false);
        
        // Handle different timing modes
        if (playbackTimingMode === 'end') {
          // Reset timer after music ends
          setTimeRemaining(timerDuration * 60);
        }
        // For 'start' mode, timer already resets when music starts
        
        showNotification('Music segment finished', 'Ready for next timer cycle');
      }, playDuration * 1000);
    } else {
      clearTimeout(playbackIntervalRef.current);
    }

    return () => clearTimeout(playbackIntervalRef.current);
  }, [isPlaying, playDuration, playbackTimingMode, timerDuration]);

  const triggerMusicPlayback = async () => {
    if (selectedTracks.length === 0 && selectedPlaylists.length === 0) {
      showNotification('No music selected', 'Please select tracks or playlists first');
      setIsTimerRunning(false);
      return;
    }

    setIsPlaying(true);
    
    // Show notification
    showNotification('Timer expired!', 'Playing your selected music');
    
    // Play music via Spotify Web Playback SDK (if available)
    try {
      await playCurrentTrack();
    } catch (error) {
      console.error('Playback failed:', error);
      showNotification('Playback failed', 'Please check your Spotify connection');
    }
  };

  const playCurrentTrack = async () => {
    if (!accessToken) return;

    const allTracks = [...selectedTracks];
    if (allTracks.length === 0) return;

    const currentTrack = allTracks[currentTrackIndex % allTracks.length];
    
    try {
      // Start playback
      const response = await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: [currentTrack.uri],
          position_ms: trackPositions[currentTrack.uri] || 0
        })
      });

      if (response.ok) {
        // Move to next track for next cycle
        setCurrentTrackIndex(prev => prev + 1);
        
        // Update track position for resume functionality
        setTimeout(() => {
          setTrackPositions(prev => ({
            ...prev,
            [currentTrack.uri]: (prev[currentTrack.uri] || 0) + (playDuration * 1000)
          }));
        }, playDuration * 1000);
      } else {
        throw new Error('Playback request failed');
      }
    } catch (error) {
      console.error('Error playing track:', error);
      throw error;
    }
  };

  const showNotification = (title, body) => {
    if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico'
      });
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Clean up intervals on unmount
  useEffect(() => {
    return () => {
      clearInterval(timerIntervalRef.current);
      clearTimeout(playbackIntervalRef.current);
      clearInterval(absoluteTimerRef.current);
    };
  }, []);

  // Automatic Schedule Monitoring
  useEffect(() => {
    // Start monitoring scheduled times every minute
    const scheduleMonitor = setInterval(() => {
      checkScheduledPlayback();
    }, 60000); // Check every minute

    // Also check immediately
    checkScheduledPlayback();

    return () => clearInterval(scheduleMonitor);
  }, [weeklySchedule, calendarSchedule, selectedTracks, selectedPlaylists, accessToken]);

  const checkScheduledPlayback = () => {
    if (!accessToken || isTimerRunning || isPlaying) {
      // Don't interfere with manual timer or current playback
      return;
    }

    const now = new Date();
    const currentDay = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1]; // Convert Sunday=0 to our array
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${Math.floor(now.getMinutes() / 30) * 30 === now.getMinutes() ? now.getMinutes().toString().padStart(2, '0') : Math.floor(now.getMinutes() / 30) * 30}`;
    const currentDateKey = formatDateKey(now);

    let shouldPlay = false;

    // Check calendar schedule first (takes priority)
    if (calendarSchedule[currentDateKey]) {
      if (calendarSchedule[currentDateKey].wholeDay) {
        shouldPlay = true;
      } else if (calendarSchedule[currentDateKey].timeSlots?.[currentTime]) {
        shouldPlay = true;
      }
    }
    // Check weekly schedule if no calendar override
    else if (weeklySchedule[currentDay]) {
      if (weeklySchedule[currentDay].wholeDay) {
        shouldPlay = true;
      } else if (weeklySchedule[currentDay].timeSlots?.[currentTime]) {
        shouldPlay = true;
      }
    }

    if (shouldPlay) {
      triggerScheduledPlayback();
    }
  };

  const triggerScheduledPlayback = async () => {
    if (selectedTracks.length === 0 && selectedPlaylists.length === 0) {
      showNotification('Scheduled time reached!', 'No music selected - please add tracks or playlists');
      return;
    }

    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });

    showNotification(
      `🎵 Scheduled Music Time! ${timeString}`, 
      `Playing your music for ${playDuration} seconds`
    );

    // Set playing state and trigger music
    setIsPlaying(true);
    
    try {
      await playCurrentTrack();
    } catch (error) {
      console.error('Scheduled playback failed:', error);
      showNotification('Playback failed', 'Please check your Spotify connection and premium status');
      setIsPlaying(false);
    }
  };

  const formatDateKey = (date) => {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  };
  useEffect(() => {
    if (isTimerRunning && timeRemaining > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            // Timer expired - trigger music playback
            triggerMusicPlayback();
            return timerDuration * 60; // Reset timer
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerIntervalRef.current);
    }

    return () => clearInterval(timerIntervalRef.current);
  }, [isTimerRunning, timeRemaining, timerDuration]);

  // Music playback logic
  useEffect(() => {
    if (isPlaying) {
      playbackIntervalRef.current = setTimeout(() => {
        setIsPlaying(false);
        
        // Handle different timing modes
        if (playbackTimingMode === 'end') {
          // Reset timer after music ends
          setTimeRemaining(timerDuration * 60);
        }
        // For 'start' mode, timer already resets when music starts
        
        showNotification('Music segment finished', 'Ready for next timer cycle');
      }, playDuration * 1000);
    } else {
      clearTimeout(playbackIntervalRef.current);
    }

    return () => clearTimeout(playbackIntervalRef.current);
  }, [isPlaying, playDuration, playbackTimingMode, timerDuration]);

  const triggerMusicPlayback = async () => {
    if (selectedTracks.length === 0 && selectedPlaylists.length === 0) {
      showNotification('No music selected', 'Please select tracks or playlists first');
      setIsTimerRunning(false);
      return;
    }

    setIsPlaying(true);
    
    // Show notification
    showNotification('Timer expired!', 'Playing your selected music');
    
    // Play music via Spotify Web Playback SDK (if available)
    try {
      await playCurrentTrack();
    } catch (error) {
      console.error('Playback failed:', error);
      showNotification('Playback failed', 'Please check your Spotify connection');
    }
  };

  const playCurrentTrack = async () => {
    if (!accessToken) return;

    const allTracks = [...selectedTracks];
    if (allTracks.length === 0) return;

    const currentTrack = allTracks[currentTrackIndex % allTracks.length];
    
    try {
      // Start playback
      const response = await fetch('https://api.spotify.com/v1/me/player/play', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uris: [currentTrack.uri],
          position_ms: trackPositions[currentTrack.uri] || 0
        })
      });

      if (response.ok) {
        // Move to next track for next cycle
        setCurrentTrackIndex(prev => prev + 1);
        
        // Update track position for resume functionality
        setTimeout(() => {
          setTrackPositions(prev => ({
            ...prev,
            [currentTrack.uri]: (prev[currentTrack.uri] || 0) + (playDuration * 1000)
          }));
        }, playDuration * 1000);
      } else {
        throw new Error('Playback request failed');
      }
    } catch (error) {
      console.error('Error playing track:', error);
      throw error;
    }
  };

  const showNotification = (title, body) => {
    if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico'
      });
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Clean up intervals on unmount
  useEffect(() => {
    return () => {
      clearInterval(timerIntervalRef.current);
      clearTimeout(playbackIntervalRef.current);
      clearInterval(absoluteTimerRef.current);
    };
  }, []);

  // If user doesn't have premium, show upgrade message
  if (user && user.product !== 'premium') {
    return (
      <div className="spotify-timer">
        <div className="premium-required">
          <h2>Spotify Premium Required</h2>
          <p>This app requires Spotify Premium to control playback.</p>
          <a href="https://www.spotify.com/premium/" target="_blank" rel="noopener noreferrer" className="upgrade-btn">
            Upgrade to Premium
          </a>
          <button onClick={() => {
            localStorage.clear();
            window.location.reload();
          }} className="logout-btn">
            Logout
          </button>
        </div>
      </div>
    );
  }

  // Main logged-in interface
  return (
    <div className="spotify-timer">
      {/* Header */}
      <div className="header">
        <h1>🎵 Spotify Timer Pro</h1>
        <div className="user-info">
          <span>Welcome, {user?.display_name}</span>
          <button 
            className="settings-btn"
            onClick={() => setShowSettings(!showSettings)}
          >
            ⚙️
          </button>
          <button 
            className="logout-btn-small"
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tab-navigation">
        <button 
          className={activeTab === 'timer' ? 'tab-btn active' : 'tab-btn'}
          onClick={() => setActiveTab('timer')}
        >
          Timer
        </button>
        <button 
          className={activeTab === 'schedule' ? 'tab-btn active' : 'tab-btn'}
          onClick={() => setActiveTab('schedule')}
        >
          Schedule
        </button>
        <button 
          className={activeTab === 'tracks' ? 'tab-btn active' : 'tab-btn'}
          onClick={() => setActiveTab('tracks')}
        >
          Tracks
        </button>
        <button 
          className={activeTab === 'playlists' ? 'tab-btn active' : 'tab-btn'}
          onClick={() => setActiveTab('playlists')}
        >
          Playlists
        </button>
      </div>

      {/* Timer Tab */}
      {activeTab === 'timer' && (
        <div className="timer-section">
          {/* Timer Display */}
          <div className="timer-display">
            <div className="time-remaining">
              {timeRemaining === 0 && isPlaying ? 'PLAYING...' : formatTime(timeRemaining)}
            </div>
            <div className="timer-info">
              Timer: {timerDuration >= 1 ? `${timerDuration} min` : `${Math.round(timerDuration * 60)}s`} | Play: {playDuration}s | Items: {selectedTracks.length + selectedPlaylists.length}
            </div>
            {(Object.keys(weeklySchedule).some(day => weeklySchedule[day]?.wholeDay || Object.keys(weeklySchedule[day]?.timeSlots || {}).length > 0) ||
              Object.keys(calendarSchedule).length > 0) && (
              <div className="schedule-status">
                🕐 Automatic scheduling active - monitoring for scheduled times
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="controls">
            <button 
              onClick={() => setIsTimerRunning(true)} 
              disabled={isTimerRunning || (selectedTracks.length === 0 && selectedPlaylists.length === 0)}
              className="control-btn start-btn"
            >
              START
            </button>
            <button 
              onClick={() => setIsTimerRunning(false)} 
              disabled={!isTimerRunning}
              className="control-btn stop-btn"
            >
              STOP
            </button>
            <button 
              onClick={() => {
                setIsTimerRunning(false);
                setIsPlaying(false);
                setTimeRemaining(timerDuration * 60);
              }}
              className="control-btn full-stop-btn"
            >
              FULL STOP
            </button>
          </div>
        </div>
      )}

      {/* Schedule Tab - Same as in logged-out state but with additional features */}
      {activeTab === 'schedule' && (
        <div className="schedule-section">
          <div className="schedule-header">
            <h3>Schedule Configuration</h3>
            <p>Set when your timer should be active</p>
            
            <div className="schedule-type-toggle">
              <button
                onClick={() => setScheduleType('weekly')}
                className={scheduleType === 'weekly' ? 'toggle-btn active' : 'toggle-btn'}
              >
                Weekly Pattern
              </button>
              <button
                onClick={() => setScheduleType('calendar')}
                className={scheduleType === 'calendar' ? 'toggle-btn active' : 'toggle-btn'}
              >
                Calendar View
              </button>
            </div>
          </div>

          {scheduleType === 'weekly' && (
            <div className="weekly-schedule-section">
              <h4>Weekly Recurring Schedule</h4>
              <p>Select time slots for each day (7:00 AM - 5:00 PM)</p>
              
              <div className="weekly-schedule">
                <div className="schedule-header-weekly">
                  <div className="time-label">Time</div>
                  {DAYS.map(day => (
                    <div key={day} className="day-header">
                      <div className="day-name">{day.substring(0, 3)}</div>
                      <label className="whole-day-checkbox">
                        <input
                          type="checkbox"
                          checked={weeklySchedule[day]?.wholeDay || false}
                          onChange={() => {
                            const allSelected = !weeklySchedule[day]?.wholeDay;
                            setWeeklySchedule(prev => {
                              const newTimeSlots = {};
                              TIME_SLOTS.forEach(slot => {
                                newTimeSlots[slot] = allSelected;
                              });
                              
                              return {
                                ...prev,
                                [day]: {
                                  wholeDay: allSelected,
                                  timeSlots: newTimeSlots
                                }
                              };
                            });
                          }}
                        />
                        All Day
                      </label>
                    </div>
                  ))}
                </div>
                
                <div className="schedule-grid">
                  {TIME_SLOTS.map(timeSlot => (
                    <div key={timeSlot} className="schedule-row">
                      <div className="time-slot-label">{timeSlot}</div>
                      {DAYS.map(day => (
                        <div key={`${day}-${timeSlot}`} className="schedule-cell">
                          <input
                            type="checkbox"
                            checked={weeklySchedule[day]?.timeSlots?.[timeSlot] || false}
                            onChange={() => {
                              setWeeklySchedule(prev => ({
                                ...prev,
                                [day]: {
                                  ...prev[day],
                                  timeSlots: {
                                    ...prev[day]?.timeSlots,
                                    [timeSlot]: !prev[day]?.timeSlots?.[timeSlot]
                                  }
                                }
                              }));
                            }}
                            className="schedule-checkbox"
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {scheduleType === 'calendar' && (
            <div className="calendar-schedule-section">
              <h4>Calendar-Based Scheduling</h4>
              <p>Set schedules for specific dates (months in advance)</p>
              
              <div className="calendar-container">
                {renderCalendar()}
                
                {selectedDate && (
                  <div className="date-schedule-config">
                    <h4>Schedule for {selectedDate.toLocaleDateString()}</h4>
                    
                    <label className="whole-day-checkbox">
                      <input
                        type="checkbox"
                        checked={calendarSchedule[formatDateKey(selectedDate)]?.wholeDay || false}
                        onChange={() => toggleCalendarWholeDay(selectedDate)}
                      />
                      Whole Day
                    </label>
                    
                    <div className="time-slots-config">
                      {TIME_SLOTS.map(timeSlot => (
                        <label key={timeSlot} className="time-slot-checkbox">
                          <input
                            type="checkbox"
                            checked={calendarSchedule[formatDateKey(selectedDate)]?.timeSlots?.[timeSlot] || false}
                            onChange={() => toggleCalendarScheduleSlot(selectedDate, timeSlot)}
                          />
                          {timeSlot}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tracks Tab */}
      {activeTab === 'tracks' && (
        <div className="track-selection">
          <h3>Selected Tracks ({selectedTracks.length}/10)</h3>
          
          {/* Search */}
          <div className="search-section">
            <div className="search-input">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for tracks..."
                onKeyPress={(e) => e.key === 'Enter' && searchTracks()}
              />
              <button onClick={searchTracks} disabled={isSearching}>
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>

          {/* Selected Tracks */}
          {selectedTracks.length > 0 && (
            <div className="selected-tracks">
              <h4>Your Tracks:</h4>
              {selectedTracks.map((track, index) => (
                <div key={track.id} className="track-item selected">
                  <span className="track-number">{index + 1}.</span>
                  {track.album?.images?.[2] && (
                    <img src={track.album.images[2].url} alt={track.name} className="track-image-small" />
                  )}
                  <div className="track-info">
                    <div className="track-name">{track.name}</div>
                    <div className="track-artist">{track.artists?.map(a => a.name).join(', ')}</div>
                  </div>
                  <button onClick={() => removeTrack(track.id)} className="remove-btn">×</button>
                </div>
              ))}
            </div>
          )}

          {/* Search Results */}
          {searchResults.length > 0 && searchType === 'tracks' && (
            <div className="search-results">
              <h4>Search Results:</h4>
              {searchResults.map((track) => (
                <div key={track.id} className="track-item">
                  {track.album?.images?.[2] && (
                    <img src={track.album.images[2].url} alt={track.name} className="track-image-small" />
                  )}
                  <div className="track-info">
                    <div className="track-name">{track.name}</div>
                    <div className="track-artist">{track.artists?.map(a => a.name).join(', ')}</div>
                  </div>
                  <button 
                    onClick={() => selectTrack(track)} 
                    disabled={selectedTracks.length >= 10 || selectedTracks.find(t => t.id === track.id)}
                    className="select-btn"
                  >
                    {selectedTracks.find(t => t.id === track.id) ? 'Selected' : 'Select'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Playlists Tab */}
      {activeTab === 'playlists' && (
        <div className="playlist-selection">
          <h3>Selected Playlists ({selectedPlaylists.length})</h3>
          
          {/* Search Type Toggle */}
          <div className="search-type-toggle">
            <button
              onClick={() => setSearchType('playlists')}
              className={searchType === 'playlists' ? 'toggle-btn active' : 'toggle-btn'}
            >
              Search Playlists
            </button>
          </div>

          {/* Search */}
          <div className="search-section">
            <div className="search-input">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for playlists..."
                onKeyPress={(e) => e.key === 'Enter' && searchTracks()}
              />
              <button onClick={searchTracks} disabled={isSearching}>
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>

          {/* Selected Playlists */}
          {selectedPlaylists.length > 0 && (
            <div className="selected-playlists">
              <h4>Your Playlists:</h4>
              {selectedPlaylists.map((playlist, index) => (
                <div key={playlist.id} className="playlist-item selected">
                  <span className="playlist-number">{index + 1}.</span>
                  {playlist.images?.[0] && (
                    <img src={playlist.images[0].url} alt={playlist.name} className="playlist-image-small" />
                  )}
                  <div className="playlist-info">
                    <div className="playlist-name">{playlist.name}</div>
                    <div className="playlist-description">{playlist.description}</div>
                    <div className="playlist-tracks">{playlist.tracks?.total} tracks</div>
                  </div>
                  <button onClick={() => removePlaylist(playlist.id)} className="remove-btn">×</button>
                </div>
              ))}
            </div>
          )}

          {/* Search Results */}
          {searchResults.length > 0 && searchType === 'playlists' && (
            <div className="search-results">
              <h4>Search Results:</h4>
              {searchResults.map((playlist) => (
                <div key={playlist.id} className="playlist-item">
                  {playlist.images?.[0] && (
                    <img src={playlist.images[0].url} alt={playlist.name} className="playlist-image-small" />
                  )}
                  <div className="playlist-info">
                    <div className="playlist-name">{playlist.name}</div>
                    <div className="playlist-description">{playlist.description}</div>
                    <div className="playlist-tracks">{playlist.tracks?.total} tracks</div>
                  </div>
                  <button 
                    onClick={() => selectPlaylist(playlist)} 
                    disabled={selectedPlaylists.find(p => p.id === playlist.id)}
                    className="select-btn"
                  >
                    {selectedPlaylists.find(p => p.id === playlist.id) ? 'Selected' : 'Select'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="settings-overlay">
          <div className="settings-modal">
            <div className="settings-header">
              <h3>Settings</h3>
              <button 
                className="close-btn"
                onClick={() => setShowSettings(false)}
              >
                ×
              </button>
            </div>
            
            <div className="settings-content">
              <div className="setting-group">
                <h4>Timer Settings</h4>
                <div className="timer-presets">
                  <label>Quick Timer Presets:</label>
                  <div className="preset-buttons">
                    {TIMER_PRESETS.map(preset => (
                      <button
                        key={preset.label}
                        onClick={() => setTimerDuration(preset.value)}
                        className={timerDuration === preset.value ? 'preset-btn active' : 'preset-btn'}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="custom-timer">
                  <label>Custom Timer (minutes):</label>
                  <input
                    type="number"
                    value={customTimerInput}
                    onChange={(e) => setCustomTimerInput(e.target.value)}
                    placeholder="Enter minutes"
                    min="0.1"
                    max="120"
                    step="0.1"
                  />
                  <button 
                    onClick={() => {
                      const minutes = parseFloat(customTimerInput);
                      if (minutes && minutes > 0 && minutes <= 120) {
                        setTimerDuration(minutes);
                        setTimeRemaining(minutes * 60);
                        setCustomTimerInput('');
                      }
                    }}
                    className="set-timer-btn"
                  >
                    Set Timer
                  </button>
                </div>
              </div>

              <div className="setting-group">
                <h4>Playback Settings</h4>
                <div className="play-duration-setting">
                  <label>Play Duration: {playDuration} seconds</label>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    value={playDuration}
                    onChange={(e) => setPlayDuration(parseInt(e.target.value))}
                    className="duration-slider"
                  />
                  <div className="slider-labels">
                    <span>10s</span>
                    <span>30s</span>
                    <span>60s</span>
                  </div>
                </div>
                
                <div className="playback-timing">
                  <label>Timer Restart Mode:</label>
                  <div className="timing-buttons">
                    <button
                      onClick={() => setPlaybackTimingMode('start')}
                      className={playbackTimingMode === 'start' ? 'timing-btn active' : 'timing-btn'}
                    >
                      When Music Starts
                    </button>
                    <button
                      onClick={() => setPlaybackTimingMode('end')}
                      className={playbackTimingMode === 'end' ? 'timing-btn active' : 'timing-btn'}
                    >
                      When Music Ends
                    </button>
                  </div>
                  <p className="timing-description">
                    {playbackTimingMode === 'start' 
                      ? 'Timer restarts immediately when music begins playing (30s intervals)'
                      : 'Timer restarts after the music interval finishes playing (30s + timer duration)'}
                  </p>
                </div>
              </div>

              <div className="setting-group">
                <h4>Notifications</h4>
                <div className="notification-setting">
                  <label>
                    <input
                      type="checkbox"
                      checked={notificationsEnabled}
                      onChange={(e) => setNotificationsEnabled(e.target.checked)}
                    />
                    Enable browser notifications
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpotifyTimer;