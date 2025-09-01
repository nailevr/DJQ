const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }
});

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

  const stmt = db.prepare('INSERT INTO submissions (song_name, artist, user_name) VALUES (?, ?, ?)');
  stmt.run([songName, artist, userName || null], function(err) {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to save submission' });
    }
    
    res.json({ 
      success: true, 
      message: 'Submission saved successfully',
      id: this.lastID 
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
