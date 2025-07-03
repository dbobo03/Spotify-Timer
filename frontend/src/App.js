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

  // Track selection state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedTracks, setSelectedTracks] = useState([]);
  const [selectedPlaylists, setSelectedPlaylists] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchType, setSearchType] = useState('tracks'); // 'tracks' or 'playlists'

  // Timer state
  const [timerDuration, setTimerDuration] = useState(30); // minutes
  const [playDuration, setPlayDuration] = useState(30); // seconds
  const [timeRemaining, setTimeRemaining] = useState(30 * 60); // seconds
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [trackPositions, setTrackPositions] = useState({});

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
      setupAbsoluteTimeMonitoring();
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
      const response = await axios.get(`${API}/spotify/devices?access_token=${accessToken}`);
      setDevices(response.data.devices || []);
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  };

  const loadTimerSettings = async () => {
    if (!user?.id) return;
    
    try {
      const response = await axios.get(`${API}/timer/settings/${user.id}`);
      const settings = response.data;
      
      setTimerDuration(settings.timer_duration_minutes);
      setPlayDuration(settings.play_duration_seconds);
      setSelectedTracks(settings.selected_tracks);
    } catch (error) {
      console.error('Failed to load timer settings:', error);
    }
  };

  const saveTimerSettings = async () => {
    if (!user?.id) return;
    
    try {
      await axios.post(`${API}/timer/settings`, {
        user_id: user.id,
        timer_duration_minutes: timerDuration,
        play_duration_seconds: playDuration,
        selected_tracks: selectedTracks
      });
    } catch (error) {
      console.error('Failed to save timer settings:', error);
    }
  };

  const searchTracks = async () => {
    if (!searchQuery.trim() || !accessToken) return;
    
    setIsSearching(true);
    try {
      if (searchType === 'tracks') {
        const response = await axios.get(`${API}/spotify/search?q=${encodeURIComponent(searchQuery)}&access_token=${accessToken}`);
        setSearchResults(response.data.tracks || []);
      } else if (searchType === 'playlists') {
        // Search for playlists
        const response = await axios.get(`${API}/spotify/search-playlists?q=${encodeURIComponent(searchQuery)}&access_token=${accessToken}`);
        setSearchResults(response.data.playlists || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
      alert('Search failed. Please log in to Spotify first.');
    } finally {
      setIsSearching(false);
    }
  };

  const selectTrack = (track) => {
    if (selectedTracks.length >= 10) {
      alert('You can select up to 10 tracks');
      return;
    }
    
    if (selectedTracks.find(t => t.id === track.id)) {
      alert('Track already selected');
      return;
    }
    
    const newTracks = [...selectedTracks, track];
    setSelectedTracks(newTracks);
    if (accessToken) saveTimerSettings();
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

  // Rest of the timer and playback functions...
  const playCurrentTrack = async () => {
    if (!accessToken) {
      alert('Please log in to Spotify to play music');
      setActiveTab('welcome');
      return;
    }

    if (selectedTracks.length === 0 && selectedPlaylists.length === 0) {
      if (notificationsEnabled) {
        new Notification('Spotify Timer', {
          body: 'Please select at least one track or playlist',
          icon: '/favicon.ico'
        });
      }
      return;
    }
    
    // Implementation continues...
    // (Same playback logic as before)
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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

  // If user doesn't have premium, show upgrade message
  if (user && !user.is_premium) {
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
          {/* Same schedule content as above */}
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
    </div>
  );
};

export default SpotifyTimer;