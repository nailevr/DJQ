# Deploying DJQ to Vercel

## Prerequisites
1. A Vercel account (sign up at https://vercel.com)
2. Vercel CLI installed: `npm i -g vercel`
3. Git repository connected (recommended)

## Important Notes

⚠️ **SQLite Database Limitation**: SQLite on Vercel's serverless environment stores data in `/tmp` which is **not persistent**. Data will be lost when functions scale down or restart. For production use, consider migrating to:
- **Vercel Postgres** (recommended)
- **Turso** (serverless SQLite)
- **Supabase**
- **PlanetScale**

For now, the app is configured to work on Vercel but data won't persist long-term.

## Deployment Steps

### Option 1: Deploy via Vercel CLI (Recommended)

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy** (from project root):
   ```bash
   vercel
   ```
   Follow the prompts:
   - Link to existing project? (if you've deployed before) or create new
   - Which scope? (select your account/team)
   - Project name? (e.g., `djq` or `song-request-app`)
   - Directory? (press Enter for current directory)
   - Override settings? (No)

4. **Set Environment Variables**:
   ```bash
   vercel env add SPOTIFY_CLIENT_ID
   vercel env add SPOTIFY_CLIENT_SECRET
   ```
   Enter your Spotify credentials when prompted.

5. **Redeploy with environment variables**:
   ```bash
   vercel --prod
   ```

### Option 2: Deploy via Vercel Dashboard

1. **Push your code to GitHub** (if not already):
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Import Project on Vercel**:
   - Go to https://vercel.com/dashboard
   - Click "Add New Project"
   - Import your Git repository
   - Vercel will auto-detect settings

3. **Configure Environment Variables**:
   - In project settings, go to "Environment Variables"
   - Add:
     - `SPOTIFY_CLIENT_ID` = your Spotify client ID
     - `SPOTIFY_CLIENT_SECRET` = your Spotify client secret
   - Click "Save"

4. **Deploy**:
   - Vercel will automatically deploy on every push to your main branch
   - Or click "Deploy" manually

## Environment Variables Required

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `SPOTIFY_CLIENT_ID` | Spotify API Client ID | https://developer.spotify.com/dashboard |
| `SPOTIFY_CLIENT_SECRET` | Spotify API Client Secret | https://developer.spotify.com/dashboard |

## Testing After Deployment

1. Visit your Vercel deployment URL (e.g., `https://your-app.vercel.app`)
2. Create a new session
3. Test submitting a song request
4. Check the admin dashboard

## Database Migration for Production

As mentioned, SQLite on Vercel is not persistent. To make this production-ready:

1. **Set up Vercel Postgres**:
   ```bash
   vercel postgres create
   ```

2. **Install PostgreSQL client**:
   ```bash
   npm install @vercel/postgres
   ```

3. **Update `server.js`** to use PostgreSQL instead of SQLite

4. **Migrate schema** to PostgreSQL format

## Troubleshooting

- **"Cannot find module" errors**: Ensure all dependencies are in `package.json`
- **Database errors**: Check that SQLite file path is correct (`/tmp` on Vercel)
- **Spotify API errors**: Verify environment variables are set correctly
- **Static files not loading**: Check that `public/` folder is being served

## Support

For issues, check:
- Vercel logs: `vercel logs`
- Vercel dashboard → Your project → Deployments → View Function Logs

