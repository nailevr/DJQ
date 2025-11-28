# Updating Render Deployment

Your Render deployment at **https://djq.onrender.com/** needs to be updated with the latest code.

## Steps to Update Render

### Option 1: Automatic Deployment (Recommended)
If your Render service is connected to GitHub, it should automatically deploy when you push to the main branch.

**Push your changes:**
```bash
git push origin main
```

Render will automatically detect the push and deploy the latest version.

### Option 2: Manual Deploy via Render Dashboard
1. Go to https://dashboard.render.com
2. Select your `djq` service
3. Click "Manual Deploy" → "Deploy latest commit"

## Required Environment Variables on Render

Make sure these environment variables are set in your Render dashboard:

1. Go to your service → **Environment** tab
2. Add/verify these variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `SPOTIFY_CLIENT_ID` | `4b8589134f1c4234a4c1ec33d39e4ccf` | Spotify API Client ID |
| `SPOTIFY_CLIENT_SECRET` | `3d0fd20d94d94cd1944c6b5a8b2ce18e` | Spotify API Client Secret |
| `PORT` | `10000` | Server port (Render sets this automatically) |

**To set environment variables:**
1. Go to Render Dashboard → Your Service → Environment
2. Click "Add Environment Variable"
3. Add each variable with its value
4. Save changes
5. Render will automatically redeploy

## Database on Render

✅ **Good News**: Render provides persistent disk storage, so your SQLite database will persist between deployments, unlike Vercel's serverless environment.

The database file `song_requests.db` will be stored in your project directory and persist across deployments.

## Verify Deployment

After deployment completes:
1. Visit https://djq.onrender.com/
2. Check that you see the new splash screen and session creation form
3. Test creating a session
4. Test submitting a song request with Spotify suggestions

## Troubleshooting

- **Old content still showing?** Clear your browser cache or wait a few minutes for the deployment to fully propagate
- **Spotify features not working?** Verify environment variables are set correctly in Render dashboard
- **Database errors?** Check Render logs for any SQLite file permission issues

## Render vs Vercel

- **Render**: Better for SQLite (persistent disk storage)
- **Vercel**: Serverless, better for scaling but requires cloud database for persistence

For production, Render is currently better suited for this app due to SQLite persistence.

