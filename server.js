/**
 * DJQ - Session-Based Song Request Queue System
 * 
 * ARCHITECTURE: Full Session Isolation
 * =====================================
 * This application is designed to support hundreds of simultaneous sessions
 * with complete isolation between sessions. Key isolation mechanisms:
 * 
 * 1. DATABASE ISOLATION:
 *    - All submissions are linked to session_id via FOREIGN KEY
 *    - All queries filter by session_id (no cross-session data leakage)
 *    - Settings (welcome_message, subtitle_message, background) stored per session
 * 
 * 2. API ENDPOINT ISOLATION:
 *    - All endpoints require sessionId parameter
 *    - GET /api/submissions?sessionId=XXXX - returns only that session's submissions
 *    - POST /api/submit - requires sessionId in body, validates session exists
 *    - DELETE /api/clear - deletes only submissions for specified sessionId
 *    - GET /api/settings?sessionId=XXXX - returns only that session's settings
 *    - POST /api/update-settings - updates only the specified session's settings
 * 
 * 3. CLIENT-SIDE ISOLATION:
 *    - localStorage keys are prefixed with sessionId (e.g., 'playedSongs_XXXX')
 *    - Each session's customization state is isolated
 *    - No global state that could leak between sessions
 * 
 * 4. SCALABILITY:
 *    - SQLite with proper indexing on session_id for fast queries
 *    - Stateless API design (no in-memory session state)
 *    - Can be horizontally scaled by moving to PostgreSQL/MySQL with same schema
 * 
 * 5. SESSION LIFECYCLE:
 *    - Sessions have no time limit (permanent until manually deleted)
 *    - Each session has unique 4-character alphanumeric ID
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Spotify API configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
let spotifyAccessToken = null;
let tokenExpiry = null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Spotify API functions
async function getSpotifyAccessToken() {
  if (spotifyAccessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return spotifyAccessToken;
  }

  try {
    const response = await axios.post('https://accounts.spotify.com/api/token', 
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64')
        }
      }
    );

    spotifyAccessToken = response.data.access_token;
    tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 minute buffer
    return spotifyAccessToken;
  } catch (error) {
    console.error('Error getting Spotify access token:', error.message);
    return null;
  }
}

async function verifyWithSpotify(songName, artistName) {
  try {
    const token = await getSpotifyAccessToken();
    if (!token) return null;

    const query = `track:${songName} artist:${artistName}`;
    const response = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.tracks.items.length > 0) {
      const track = response.data.tracks.items[0];
      return {
        spotify_song_name: track.name,
        spotify_artist: track.artists[0].name,
        spotify_id: track.id,
        spotify_popularity: track.popularity,
        spotify_preview_url: track.preview_url,
        spotify_external_urls: track.external_urls
      };
    }
    return null;
  } catch (error) {
    console.error('Error verifying with Spotify:', error.message);
    return null;
  }
}

// Get audio features (BPM and key) from Spotify
async function getSpotifyAudioFeatures(trackId) {
  try {
    const token = await getSpotifyAccessToken();
    if (!token) {
      console.log('No Spotify token available');
      return null;
    }

    console.log(`Fetching audio features for track: ${trackId}`);
    const response = await axios.get(`https://api.spotify.com/v1/audio-features/${trackId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const features = response.data;
    console.log('Raw Spotify audio features:', features);
    
    // Convert Spotify key to regular key notation
    const keyNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const modeNames = ['minor', 'major'];
    const regularKey = features.key !== -1 && features.mode !== -1 
      ? `${keyNames[features.key]} ${modeNames[features.mode]}`
      : null;
    
    // Convert to Camelot key
    const camelotKey = convertToCamelotKey(features.key, features.mode);
    
    const result = {
      bpm: features.tempo ? Math.round(features.tempo) : null,
      key_regular: regularKey,
      key_camelot: camelotKey
    };
    
    console.log('Processed audio features:', result);
    return result;
  } catch (error) {
    console.error('Error getting Spotify audio features:', error.message);
    if (error.response) {
      console.error('Spotify API response:', error.response.status, error.response.data);
    }
    return null;
  }
}

// Convert Spotify key and mode to Camelot key
function convertToCamelotKey(key, mode) {
  if (key === -1 || mode === -1) return null;
  
  // Camelot wheel mapping
  // Major keys (mode = 1): 8A, 3A, 10A, 5A, 12A, 7A, 2A, 9A, 4A, 11A, 6A, 1A
  // Minor keys (mode = 0): 5B, 12B, 7B, 2B, 9B, 4B, 11B, 6B, 1B, 8B, 3B, 10B
  const camelotMajor = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
  const camelotMinor = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];
  
  if (mode === 1) {
    return `${camelotMajor[key]}A`;
  } else {
    return `${camelotMinor[key]}B`;
  }
}

// Initialize SQLite database
// On Vercel, use /tmp directory (writable but not persistent)
// On Render, use project directory (persistent disk storage)
// For production, consider migrating to PostgreSQL or another cloud database
const dbPath = process.env.VERCEL ? '/tmp/song_requests.db' : 'song_requests.db';
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    
    // Create sessions table
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      welcome_message TEXT,
      subtitle_message TEXT,
      background TEXT
    )`);
    
    // Add columns to existing sessions table if they don't exist
    db.run(`ALTER TABLE sessions ADD COLUMN welcome_message TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding welcome_message column:', err.message);
      }
    });
    
    db.run(`ALTER TABLE sessions ADD COLUMN subtitle_message TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding subtitle_message column:', err.message);
      }
    });
    
    db.run(`ALTER TABLE sessions ADD COLUMN background TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding background column:', err.message);
      }
    });
    
    // Create table if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      song_name TEXT NOT NULL,
      artist TEXT NOT NULL,
      user_name TEXT,
      original_song_name TEXT,
      original_artist TEXT,
      bpm INTEGER,
      key_camelot TEXT,
      key_regular TEXT,
      spotify_fetched INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    )`);
    
    // Add spotify_fetched column to existing table if it doesn't exist
    db.run(`ALTER TABLE submissions ADD COLUMN spotify_fetched INTEGER DEFAULT 0`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding spotify_fetched column:', err.message);
      }
    });
    
    // Add session_id column to existing table if it doesn't exist
    db.run(`ALTER TABLE submissions ADD COLUMN session_id TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding session_id column:', err.message);
      }
    });
    
    // Create index on session_id for performance (critical for scaling to hundreds of sessions)
    db.run(`CREATE INDEX IF NOT EXISTS idx_submissions_session_id ON submissions(session_id)`, (err) => {
      if (err) {
        console.error('Error creating session_id index:', err.message);
      } else {
        console.log('Session isolation index created/verified');
      }
    });
    
    // Add new columns to existing table if they don't exist
    db.run(`ALTER TABLE submissions ADD COLUMN bpm INTEGER`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding bpm column:', err.message);
      }
    });
    
    db.run(`ALTER TABLE submissions ADD COLUMN key_camelot TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding key_camelot column:', err.message);
      }
    });
    
    db.run(`ALTER TABLE submissions ADD COLUMN original_song_name TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding original_song_name column:', err.message);
      }
    });
    
    db.run(`ALTER TABLE submissions ADD COLUMN original_artist TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding original_artist column:', err.message);
      }
    });
    
    db.run(`ALTER TABLE submissions ADD COLUMN key_regular TEXT`, (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding key_regular column:', err.message);
      }
    });
  }
});

// Function to enhance song data with Spotify API only
async function enhanceSongData(songName, artist) {
  try {
    // First, search for the track on Spotify
    const spotifyData = await verifyWithSpotify(songName, artist);
    
    if (!spotifyData) {
      console.log('No Spotify match found for:', songName, 'by', artist);
      // Return original data if Spotify doesn't find a match
      return {
        corrected_song_name: songName,
        corrected_artist: artist,
        bpm: null,
        key_camelot: null,
        key_regular: null,
        spotify_verified: false,
        spotify_data: null
      };
    }
    
    console.log('Spotify match found:', spotifyData);
    
    // Get audio features (BPM and key) from Spotify
    const audioFeatures = await getSpotifyAudioFeatures(spotifyData.spotify_id);
    
    return {
      corrected_song_name: spotifyData.spotify_song_name,
      corrected_artist: spotifyData.spotify_artist,
      bpm: audioFeatures ? audioFeatures.bpm : null,
      key_camelot: audioFeatures ? audioFeatures.key_camelot : null,
      key_regular: audioFeatures ? audioFeatures.key_regular : null,
      spotify_verified: true,
      spotify_data: spotifyData
    };
  } catch (error) {
    console.error('Error enhancing song data with Spotify:', error);
    // Return original data if Spotify fails
    return {
      corrected_song_name: songName,
      corrected_artist: artist,
      bpm: null,
      key_camelot: null,
      key_regular: null,
      spotify_verified: false,
      spotify_data: null
    };
  }
}

// Helper function to generate a 4-character alphanumeric code
function generateShortCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper function to generate unique session ID (4-character code)
function generateSessionId(callback) {
  let attempts = 0;
  const maxAttempts = 100;
  
  function tryGenerate() {
    attempts++;
    if (attempts > maxAttempts) {
      console.error('Failed to generate unique session ID after', maxAttempts, 'attempts');
      return callback(null); // Return null to indicate failure
    }
    
    const sessionId = generateShortCode();
    
    // Check if this ID already exists
    db.get('SELECT id FROM sessions WHERE id = ?', [sessionId], (err, row) => {
      if (err) {
        console.error('Error checking session ID:', err);
        // Return error instead of infinite retry
        return callback(null);
      }
      
      if (row) {
        // ID already exists, try again
        return tryGenerate();
      }
      
      // ID is unique, return it
      callback(sessionId);
    });
  }
  
  tryGenerate();
}


// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/session/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin/:sessionId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/qr/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const baseUrl = req.protocol + '://' + req.get('host');
    // Use shorter URL format: djq.com/XXXX
    const qrCodeDataURL = await QRCode.toDataURL(`${baseUrl}/${sessionId}`);
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>QR Code - Song Requests</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 min-h-screen flex items-center justify-center p-4">
        <div class="bg-white rounded-lg shadow-lg p-8 text-center max-w-md w-full">
          <h1 class="text-2xl font-bold text-gray-800 mb-4">Song Request QR Code</h1>
          <div class="mb-4">
            <img src="${qrCodeDataURL}" alt="QR Code" class="mx-auto">
          </div>
          <p class="text-gray-600 mb-4">Scan this QR code to submit a song request</p>
          <a href="/admin/${sessionId}" class="inline-block bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors">
            Go to Admin Dashboard
          </a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// API Routes - Session Management (must be before catch-all route)
app.post('/api/sessions', (req, res) => {
  console.log('POST /api/sessions called');
  const { name } = req.body;
  console.log('Request body:', { name });
  
  if (!name || name.trim() === '') {
    console.log('Session name validation failed');
    return res.status(400).json({ error: 'Session name is required' });
  }
  
  // Generate unique session ID
  console.log('Generating session ID...');
  generateSessionId((sessionId) => {
    console.log('Session ID generated:', sessionId);
    
    if (!sessionId) {
      console.error('Failed to generate session ID');
      return res.status(500).json({ error: 'Failed to generate unique session ID' });
    }
    
    const sessionName = name.trim();
    console.log('Creating session:', { sessionId, sessionName });
    
    // Set default values: session name as welcome message, default subtitle, black background
    const stmt = db.prepare('INSERT INTO sessions (id, name, welcome_message, subtitle_message, background) VALUES (?, ?, ?, ?, ?)');
    stmt.run([sessionId, sessionName, sessionName, 'Submit your song below', '#000'], function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to create session' });
      }
      
      console.log('Session created successfully:', sessionId);
      res.json({
        success: true,
        session: {
          id: sessionId,
          name: sessionName,
          createdAt: new Date().toISOString()
        }
      });
    });
    stmt.finalize();
  });
});

app.get('/api/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  db.get('SELECT * FROM sessions WHERE id = ?', [sessionId], (err, session) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to get session' });
    }
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json({ success: true, session: session });
  });
});

app.get('/api/sessions', (req, res) => {
  db.all('SELECT * FROM sessions WHERE is_active = 1 ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to get sessions' });
    }
    
    res.json({ success: true, sessions: rows });
  });
});

// API Routes
app.post('/api/submit', (req, res) => {
  const { songName, artist, userName, sessionId, spotifyId } = req.body;
  console.log('Received submission:', { songName, artist, sessionId, spotifyId: spotifyId || 'none' });

  // Validation
  if (!songName || !artist) {
    return res.status(400).json({ error: 'Song name and artist are required' });
  }

  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }
  
  // Verify session exists
  db.get('SELECT * FROM sessions WHERE id = ?', [sessionId], async (err, session) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to verify session' });
    }
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let bpm = null;
    let keyCamelot = null;
    let keyRegular = null;

    // If Spotify ID was provided, fetch BPM and key BEFORE saving
    if (spotifyId) {
      console.log(`Fetching audio features for Spotify ID: ${spotifyId}`);
      try {
        const audioFeatures = await getSpotifyAudioFeatures(spotifyId);
        if (audioFeatures) {
          console.log(`Audio features received:`, audioFeatures);
          bpm = audioFeatures.bpm;
          keyCamelot = audioFeatures.key_camelot;
          keyRegular = audioFeatures.key_regular;
        } else {
          console.log(`No audio features returned, saving without BPM/key`);
        }
      } catch (error) {
        console.error('Error fetching Spotify audio features:', error);
      }
    } else {
      console.log('No Spotify ID provided - saving without audio features');
    }

    // Determine if Spotify was used (spotifyId was provided and we attempted to fetch)
    const spotifyFetched = spotifyId ? 1 : 0;
    
    // Now save the submission with the fetched data
    const stmt = db.prepare('INSERT INTO submissions (session_id, song_name, artist, user_name, original_song_name, original_artist, bpm, key_camelot, key_regular, spotify_fetched) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    stmt.run([sessionId, songName, artist, userName || null, songName, artist, bpm, keyCamelot, keyRegular, spotifyFetched], function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to save submission' });
      }
      
      console.log(`✓ Submission saved: ID=${this.lastID}, BPM=${bpm || 'none'}, Key=${keyCamelot || 'none'}`);
      res.json({ 
        success: true, 
        message: 'Submission saved successfully',
        id: this.lastID
      });
    });
    stmt.finalize();
  });
});

app.get('/api/submissions', (req, res) => {
  const { sessionId } = req.query;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }
  
  // Verify session exists
  db.get('SELECT * FROM sessions WHERE id = ?', [sessionId], (err, session) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to fetch submissions' });
    }
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Fetch submissions for session
    db.all('SELECT * FROM submissions WHERE session_id = ? ORDER BY created_at DESC', [sessionId], (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to fetch submissions' });
      }
      
      // Convert SQLite datetime strings to ISO format (UTC)
      // SQLite CURRENT_TIMESTAMP stores in server's local time, convert to UTC ISO format
      const formattedRows = rows.map(row => {
        if (row.created_at && typeof row.created_at === 'string') {
          // SQLite format: "YYYY-MM-DD HH:MM:SS" (server's local time)
          // Convert to ISO format by treating as UTC (since SQLite stores without timezone)
          // Format: "YYYY-MM-DDTHH:MM:SS.sssZ"
          const sqliteDate = row.created_at.trim();
          // Add 'Z' to indicate UTC, or let client parse as local
          // Actually, best to send as ISO with timezone
          if (sqliteDate.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
            // Convert SQLite datetime to ISO format
            row.created_at = sqliteDate.replace(' ', 'T') + '.000Z';
          }
        }
        return row;
      });
      
      res.json(formattedRows);
    });
  });
});

app.delete('/api/clear', (req, res) => {
  const { sessionId } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }
  
  db.run('DELETE FROM submissions WHERE session_id = ?', [sessionId], function(err) {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to clear submissions' });
    }
    
    console.log(`Cleared ${this.changes} submissions from session ${sessionId}`);
    res.json({ 
      success: true, 
      message: `Cleared ${this.changes} submissions`,
      deletedCount: this.changes 
    });
  });
});

// Update settings for a specific session
app.post('/api/update-settings', (req, res) => {
  const { sessionId, welcomeMessage, subtitleMessage, background } = req.body;
  
  if (!sessionId) {
    return res.status(400).json({ error: 'Session ID is required' });
  }
  
  db.run(
    'UPDATE sessions SET welcome_message = ?, subtitle_message = ?, background = ? WHERE id = ?',
    [welcomeMessage || null, subtitleMessage || null, background || null, sessionId],
    function(err) {
      if (err) {
        console.error('Error updating settings:', err);
        return res.status(500).json({ error: 'Failed to update settings' });
      }
      
      console.log('Settings updated for session:', sessionId);
      res.json({ success: true });
    }
  );
});

// Get settings for a specific session
app.get('/api/settings', (req, res) => {
  const sessionId = req.query.sessionId;
  
  if (!sessionId) {
    // Return default settings if no sessionId provided
    return res.json({
      welcomeMessage: null,
      subtitleMessage: 'Submit your song below',
      background: '#000'
    });
  }
  
  db.get(
    'SELECT name, welcome_message, subtitle_message, background FROM sessions WHERE id = ?',
    [sessionId],
    (err, row) => {
      if (err) {
        console.error('Error fetching settings:', err);
        return res.status(500).json({ error: 'Failed to fetch settings' });
      }
      
      if (!row) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Default welcome message to session name if not set or empty
      const welcomeMessage = (row.welcome_message && row.welcome_message.trim() !== '') 
        ? row.welcome_message 
        : row.name;
      
      // Default background to black if not set or empty
      const background = (row.background && row.background.trim() !== '') 
        ? row.background 
        : '#000';
      
      // Default subtitle to "Submit your song below" if not set or empty
      const subtitleMessage = (row.subtitle_message && row.subtitle_message.trim() !== '') 
        ? row.subtitle_message 
        : 'Submit your song below';
      
      res.json({
        welcomeMessage: welcomeMessage,
        subtitleMessage: subtitleMessage,
        background: background
      });
    }
  );
});

// API endpoint for Spotify song suggestions
app.get('/api/spotify/suggestions', async (req, res) => {
  const query = req.query.q;
  
  if (!query || query.trim().length === 0) {
    return res.json({ suggestions: [] });
  }
  
  try {
    const token = await getSpotifyAccessToken();
    if (!token) {
      return res.status(500).json({ error: 'Failed to get Spotify access token' });
    }
    
    // Search for tracks matching the query (songs starting with or containing the query)
    const searchQuery = query.trim();
    const response = await axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=10`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.data.tracks && response.data.tracks.items) {
      const tracks = response.data.tracks.items;
      
      // Extract Spotify IDs to fetch audio features (BPM) in batch
      const trackIds = tracks.map(track => track.id);
      
      // Fetch audio features for all tracks at once (batch endpoint supports up to 100)
      let audioFeaturesMap = {};
      try {
        const featuresResponse = await axios.get(`https://api.spotify.com/v1/audio-features?ids=${trackIds.join(',')}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        // Create a map of trackId -> audio features
        if (featuresResponse.data && featuresResponse.data.audio_features) {
          featuresResponse.data.audio_features.forEach((features, index) => {
            if (features && features.tempo) {
              audioFeaturesMap[trackIds[index]] = {
                bpm: Math.round(features.tempo),
                key: features.key !== -1 && features.mode !== -1 
                  ? convertToCamelotKey(features.key, features.mode)
                  : null
              };
            }
          });
        }
      } catch (error) {
        console.error('Error fetching audio features for suggestions:', error.message);
        // Continue without BPM if this fails
      }
      
      // Build suggestions with BPM info
      const suggestions = tracks.map(track => {
        const features = audioFeaturesMap[track.id];
        return {
          songName: track.name,
          artist: track.artists.map(a => a.name).join(', '),
          album: track.album.name,
          spotifyId: track.id,
          bpm: features ? features.bpm : null,
          key: features ? features.key : null
        };
      });
      
      return res.json({ suggestions });
    }
    
    res.json({ suggestions: [] });
  } catch (error) {
    console.error('Error fetching Spotify suggestions:', error.message);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Route for 4-character session codes at root level (e.g., /A1B2)
// This must be AFTER all API routes and specific routes
app.get('/:sessionCode', (req, res) => {
  const { sessionCode } = req.params;
  // Check if it's a 4-character alphanumeric code
  if (/^[A-Z0-9]{4}$/i.test(sessionCode)) {
    // Redirect to session page
    return res.redirect(`/session/${sessionCode}`);
  }
  // If not a valid session code, show 404
  res.status(404).send('Session not found');
});

// Export app for Vercel serverless functions
module.exports = app;

// Start server only when not running on Vercel (local development)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit http://localhost:${PORT} for the user form`);
    console.log(`Visit http://localhost:${PORT}/admin for the admin dashboard`);
    console.log(`Visit http://localhost:${PORT}/qr for the QR code`);
  });
  
  // Graceful shutdown (only in non-serverless environments)
  process.on('SIGINT', () => {
    db.close((err) => {
      if (err) {
        console.error(err.message);
      }
      console.log('Database connection closed.');
      process.exit(0);
    });
  });
}
