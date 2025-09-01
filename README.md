# Song Request App 🎵

A full-stack web application for managing song requests with a mobile-friendly user interface and admin dashboard.

## Features

### User-Facing Side
- 📱 Mobile-optimized responsive form
- 🎯 QR code access for easy sharing
- ✅ Form validation (Song Name & Artist required)
- 🎉 Success confirmation modal
- 🎨 Beautiful gradient design with TailwindCSS

### Admin Dashboard
- 📊 Real-time submissions table
- 📈 Statistics (total requests, today's requests)
- 🔄 Auto-refresh every 5 seconds
- 📱 Mobile-responsive admin interface
- 🎯 QR code generator for easy sharing

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite
- **Frontend**: HTML + TailwindCSS + Vanilla JavaScript
- **QR Code**: qrcode npm package
- **Deployment**: Ready for Vercel/Railway

## Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Access the application**:
   - User form: http://localhost:3000
   - Admin dashboard: http://localhost:3000/admin
   - QR code: http://localhost:3000/qr

## Project Structure

```
Queue/
├── server.js              # Express server with API routes
├── package.json           # Dependencies and scripts
├── song_requests.db       # SQLite database (created automatically)
└── public/
    ├── index.html         # User-facing song request form
    └── admin.html         # Admin dashboard
```

## API Endpoints

- `GET /` - User form page
- `GET /admin` - Admin dashboard
- `GET /qr` - QR code generator
- `POST /api/submit` - Submit song request
- `GET /api/submissions` - Get all submissions

## Database Schema

```sql
CREATE TABLE submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    song_name TEXT NOT NULL,
    artist TEXT NOT NULL,
    user_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Deployment

### Vercel Deployment

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```

3. **Environment Variables** (if needed):
   - `PORT`: Set to 3000 or let Vercel handle it

### Railway Deployment

1. **Connect your GitHub repository to Railway**
2. **Railway will automatically detect the Node.js app**
3. **Deploy with one click**

### Environment Variables

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (production/development)

## Usage

1. **Generate QR Code**: Visit `/qr` to get a QR code that links to the user form
2. **Share QR Code**: Users can scan the QR code to access the song request form
3. **Monitor Requests**: Use the admin dashboard at `/admin` to view all submissions
4. **Auto-refresh**: The dashboard automatically refreshes every 5 seconds

## Customization

- **Styling**: Modify TailwindCSS classes in the HTML files
- **Validation**: Update form validation in the JavaScript sections
- **Database**: Modify the SQLite schema in `server.js`
- **Auto-refresh**: Change the refresh interval in `admin.html`

## Browser Support

- ✅ Chrome (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Edge
- ✅ Mobile browsers

## License

MIT License - feel free to use this project for your events!
