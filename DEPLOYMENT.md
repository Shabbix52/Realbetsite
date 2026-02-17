# Deployment Guide - Hybrid (Vercel + Railway)

This guide covers deploying the frontend to **Vercel** and backend to **Railway**.

---

## 📦 Part 1: Deploy Backend to Railway

### Step 1: Prepare Backend

Railway is already hosting your PostgreSQL and Redis. Now we'll deploy the Express server.

1. **Create `Procfile`** (optional, Railway auto-detects):
   ```bash
   cd server
   echo "web: node index.js" > Procfile
   ```

2. **Ensure `package.json` has start script:**
   ```json
   {
     "scripts": {
       "start": "node index.js"
     }
   }
   ```

### Step 2: Deploy to Railway

#### Option A: Railway CLI
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to existing project (where your DB/Redis are)
cd server
railway link

# Deploy
railway up
```

#### Option B: Railway Dashboard
1. Go to https://railway.app/dashboard
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your repo
4. Set **Root Directory** to `server/`
5. Railway auto-detects Node.js and deploys

### Step 3: Set Environment Variables in Railway

Go to your Railway project → **Variables** tab:

```env
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret
TWITTER_CALLBACK_URL=https://your-railway-app.up.railway.app/auth/twitter/callback

DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_CALLBACK_URL=https://your-railway-app.up.railway.app/auth/discord/callback
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_discord_server_id

DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

PORT=3001
CLIENT_URL=https://your-vercel-app.vercel.app
```

**Note:** `${{Postgres.DATABASE_URL}}` automatically references your Railway PostgreSQL. Same for Redis.

### Step 4: Get Railway Backend URL

After deployment, Railway gives you a URL like:
```
https://your-app-name.up.railway.app
```

**Save this URL** — you'll need it for Vercel frontend config.

---

## 🌐 Part 2: Deploy Frontend to Vercel

### Step 1: Update `vite.config.ts` for Production

Since Vercel hosts the frontend and Railway hosts the backend, we need to proxy API calls in production:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

**Alternative (Preferred):** Update frontend to use absolute URLs instead of `/auth` proxy.

In `src/screens/BoxesScreen.tsx` and other files that call `/auth/*`, replace with:

```ts
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Instead of:
fetch('/auth/scores', ...)

// Use:
fetch(`${API_URL}/auth/scores`, ...)
```

### Step 2: Create `.env.production`

```env
VITE_API_URL=https://your-railway-app.up.railway.app
```

### Step 3: Deploy to Vercel

#### Option A: Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy (from project root, not server/)
cd c:\Users\PMLS\Desktop\lovable
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Scope: Your account
# - Link to existing project? No
# - Project name: realbet-landing (or your choice)
# - Directory: ./ (press Enter)
# - Override settings? No

# Deploy to production
vercel --prod
```

#### Option B: Vercel Dashboard (Recommended)
1. Go to https://vercel.com/new
2. **Import Git Repository** → Connect GitHub
3. Select your repo
4. **Root Directory:** Leave as `./` (project root)
5. **Framework Preset:** Vite (auto-detected)
6. **Build Command:** `npm run build`
7. **Output Directory:** `dist`
8. **Environment Variables:**
   ```
   VITE_API_URL=https://your-railway-app.up.railway.app
   ```
9. Click **Deploy**

### Step 4: Update Twitter/Discord OAuth Apps

Go to Twitter/Discord Developer Portals and add new callback URLs:

**Twitter:**
- Callback URL: `https://your-railway-app.up.railway.app/auth/twitter/callback`
- Website URL: `https://your-vercel-app.vercel.app`

**Discord:**
- Redirect URI: `https://your-railway-app.up.railway.app/auth/discord/callback`

---

## 🔧 Part 3: Configure CORS

Update `server/index.js`:

```js
app.use(cors({ 
  origin: [
    'http://localhost:5173',
    'https://your-vercel-app.vercel.app',
    'https://your-vercel-app-*.vercel.app' // Preview deployments
  ],
  credentials: true
}));
```

---

## ✅ Part 4: Verify Deployment

### Test Checklist:
- [ ] Visit `https://your-vercel-app.vercel.app`
- [ ] Click "ENTER THE HOUSE" → Opens boxes screen
- [ ] Click "Follow @Realbet on X" → OAuth popup opens
- [ ] Complete Twitter OAuth → Profile loads, scores save
- [ ] Open boxes → Points randomized correctly
- [ ] Refresh page → Scores persist (localStorage + DB)
- [ ] Complete flow → VIP card shows your Twitter profile
- [ ] Share button → Tweet intent opens
- [ ] Claim button unlocks → Links to realbet.io

---

## 🔄 Update Workflow

### When you make changes:

**Frontend changes:**
```bash
git add .
git commit -m "Update frontend"
git push
# Vercel auto-deploys on push
```

**Backend changes:**
```bash
cd server
railway up
# Or push to main branch (Railway auto-deploys)
```

---

## 🐛 Troubleshooting

### "Failed to fetch" errors on Vercel
- Check `VITE_API_URL` is set correctly
- Verify Railway backend is running (check logs)
- Check CORS settings in `server/index.js`

### OAuth popup doesn't work
- Verify callback URLs in Twitter/Discord apps match Railway URL
- Check `TWITTER_CALLBACK_URL` and `DISCORD_CALLBACK_URL` in Railway env vars
- Ensure `CLIENT_URL` in Railway points to Vercel URL

### Database connection errors on Railway
- Check `DATABASE_URL` uses Railway's internal reference: `${{Postgres.DATABASE_URL}}`
- Verify SSL config: `ssl: { rejectUnauthorized: false }`

### Scores not persisting
- Check Railway backend logs for DB errors
- Test `/auth/scores` endpoint: `curl https://your-railway-app.up.railway.app/auth/scores/123`
- Verify PostgreSQL is running on Railway

---

## 📊 Cost Estimate

**Vercel:**
- Free tier: 100GB bandwidth/month, unlimited requests
- This app fits easily in free tier

**Railway:**
- PostgreSQL: ~$5/month
- Redis: ~$5/month  
- Express backend: ~$5/month (runs 24/7)
- **Total:** ~$15/month

**Alternative:** Use Vercel's free PostgreSQL (Vercel Postgres) and Vercel KV (Redis) to stay 100% free, but requires Option 1 (serverless functions).

---

## 🚀 Next Steps

1. Deploy backend to Railway (Part 1)
2. Get Railway URL
3. Deploy frontend to Vercel (Part 2)
4. Update OAuth apps (Part 3)
5. Test full flow (Part 4)

**Estimated time:** 15-20 minutes

---

Need help? Check Railway logs:
```bash
railway logs
```

Check Vercel deployments:
```bash
vercel logs
```
