const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key-here'
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize SQLite database
const db = new sqlite3.Database('song_requests.db', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    // Create table if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_name TEXT NOT NULL,
      artist TEXT NOT NULL,
      user_name TEXT,
      original_song_name TEXT,
      original_artist TEXT,
      bpm INTEGER,
      key_camelot TEXT,
      key_regular TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
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

// Function to enhance song data with OpenAI
async function enhanceSongData(songName, artist) {
  try {
    const prompt = `You are a professional DJ and music expert. I need you to:

1. ONLY correct the song name and artist name if there are obvious spelling errors (like "taylor swift" → "Taylor Swift" or "beatles" → "The Beatles")
2. Provide the BPM (beats per minute) 
3. Provide the Camelot key (like 8A, 5B, etc.) - this is CRITICAL for DJ mixing
4. Provide the regular musical key (like A, A#, B, C, C#, D, D#, E, F, F#, G, G#)

For the song "${songName}" by "${artist}":
- Search for the official track information from multiple sources
- Check tunebat.com, Mixed In Key, Beatport, Spotify, Apple Music, and other music databases
- Look for official releases, remixes, and DJ charts
- For popular songs, make educated estimates based on your knowledge if exact data isn't available
- BPM should be a reasonable number (typically 60-200 for most songs)
- Keys should follow standard music theory (C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
- If you cannot find reliable information, use "Unknown" for missing data
- DO NOT change the song name unless there are clear spelling errors

Camelot keys follow this pattern:
- Major keys: 1A, 2A, 3A, 4A, 5A, 6A, 7A, 8A, 9A, 10A, 11A, 12A
- Minor keys: 1B, 2B, 3B, 4B, 5B, 6B, 7B, 8B, 9B, 10B, 11B, 12B

Regular keys are: A, A#, B, C, C#, D, D#, E, F, F#, G, G# (with major/minor: A major, A minor, etc.)

**IMPORTANT: You must respond with ONLY valid JSON. Do not include any explanations or additional text. Start your response with { and end with }.**

If the song is popular and you know it exists, make your best estimate for BPM and key based on your knowledge.

{
  "corrected_song_name": "corrected song name",
  "corrected_artist": "corrected artist name", 
  "bpm": number,
  "key_camelot": "key like 8A, 5B, etc. or 'Unknown' if not found",
  "key_regular": "key like A major, A minor, etc. or 'Unknown' if not found"
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a professional DJ with access to music databases and charts. You have extensive knowledge of songs, artists, BPMs, and Camelot keys. Search multiple sources for information, prioritizing tunebat.com when available. Be very conservative with song name corrections - only fix obvious spelling errors like capitalization or missing articles. Do NOT change song names unless there are clear spelling mistakes. Always respond with ONLY valid JSON format. If you cannot find accurate information, use 'Unknown' rather than guessing."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 300
    });

    const response = completion.choices[0].message.content.trim();
    console.log('OpenAI Response:', response);
    
    // Try to extract JSON from the response if it's not pure JSON
    let jsonResponse = response;
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonResponse = jsonMatch[0];
    }
    
    console.log('Extracted JSON:', jsonResponse);
    const enhancedData = JSON.parse(jsonResponse);
    
    return {
      corrected_song_name: enhancedData.corrected_song_name || songName,
      corrected_artist: enhancedData.corrected_artist || artist,
      bpm: enhancedData.bpm || null,
      key_camelot: enhancedData.key_camelot || null,
      key_regular: enhancedData.key_regular || null
    };
  } catch (error) {
    console.error('OpenAI API error:', error);
    // Return original data if OpenAI fails
    return {
      corrected_song_name: songName,
      corrected_artist: artist,
      bpm: null,
      key_camelot: null,
      key_regular: null
    };
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/qr', async (req, res) => {
  try {
    const baseUrl = req.protocol + '://' + req.get('host');
    const qrCodeDataURL = await QRCode.toDataURL(`${baseUrl}/`);
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
          <a href="/admin" class="inline-block bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors">
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

// API Routes
app.post('/api/submit', (req, res) => {
  const { songName, artist, userName } = req.body;

  // Validation
  if (!songName || !artist) {
    return res.status(400).json({ error: 'Song name and artist are required' });
  }

  // Save submission immediately with original data
  const stmt = db.prepare('INSERT INTO submissions (song_name, artist, user_name, original_song_name, original_artist, bpm, key_camelot, key_regular) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  stmt.run([songName, artist, userName || null, songName, artist, null, null, null], function(err) {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to save submission' });
    }
    
    const submissionId = this.lastID;
    
    // Return success immediately
    res.json({ 
      success: true, 
      message: 'Submission saved successfully',
      id: submissionId
    });
    
    // Process OpenAI enhancement in the background
    enhanceSongData(songName, artist)
      .then(enhancedData => {
        // Update the record with enhanced data
        const updateStmt = db.prepare('UPDATE submissions SET song_name = ?, artist = ?, bpm = ?, key_camelot = ?, key_regular = ? WHERE id = ?');
        updateStmt.run([
          enhancedData.corrected_song_name,
          enhancedData.corrected_artist,
          enhancedData.bpm,
          enhancedData.key_camelot,
          enhancedData.key_regular,
          submissionId
        ], function(err) {
          if (err) {
            console.error('Error updating submission with enhanced data:', err);
          } else {
            console.log(`Enhanced data updated for submission ${submissionId}`);
          }
        });
        updateStmt.finalize();
      })
      .catch(error => {
        console.error('Error enhancing song data in background:', error);
      });
  });
  stmt.finalize();
});

app.get('/api/submissions', (req, res) => {
  db.all('SELECT * FROM submissions ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to fetch submissions' });
    }
    res.json(rows);
  });
});

app.delete('/api/clear', (req, res) => {
  db.run('DELETE FROM submissions', [], function(err) {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to clear submissions' });
    }
    
    console.log(`Cleared ${this.changes} submissions from database`);
    res.json({ 
      success: true, 
      message: `Cleared ${this.changes} submissions`,
      deletedCount: this.changes 
    });
  });
});

// Store settings in memory (you could also use a database table)
let appSettings = {
  welcomeMessage: "Welcome to CAB's Karaoke Night",
  subtitleMessage: "Let me hear you, Bereans!🫵",
  background: "agifcolossal3opt1.gif"
};

app.post('/api/update-settings', (req, res) => {
  const { welcomeMessage, subtitleMessage, background } = req.body;
  
  appSettings.welcomeMessage = welcomeMessage;
  appSettings.subtitleMessage = subtitleMessage;
  appSettings.background = background;
  
  console.log('Settings updated:', appSettings);
  res.json({ success: true, settings: appSettings });
});

app.get('/api/settings', (req, res) => {
  res.json(appSettings);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} for the user form`);
  console.log(`Visit http://localhost:${PORT}/admin for the admin dashboard`);
  console.log(`Visit http://localhost:${PORT}/qr for the QR code`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Database connection closed.');
    process.exit(0);
  });
});
