# RealBet Season 1 Landing Page

A multi-screen interactive landing page for RealBet's Season 1 allocation campaign with Twitter/Discord OAuth, mystery box mechanics, VIP card generation, and follower-based point allocation.

---

##  Architecture

**Frontend:** React + TypeScript + Vite + Tailwind CSS + Framer Motion  
**Backend:** Express.js + PostgreSQL + Redis  
**Auth:** Twitter OAuth 2.0 (PKCE), Discord OAuth 2.0  
**Deployment:** Frontend  Vercel, Backend + DB  Railway

---

##  Project Structure

```
lovable/
 src/
    App.tsx                    # Main app, screen routing, user state
    main.tsx                   # React entry point
    index.css                  # Global CSS, glass-panel, grain overlay, keyframes
    config.ts                  # API URL helper (dev proxy vs production)
    tierConfig.ts              # Follower tier definitions, allocation math
    global.d.ts                # Global type declarations
    vite-env.d.ts              # Vite env types
    components/
       GlowEffects.tsx        # Background gradient glow layers
       BloodStainOverlay.tsx  # Blood-stain texture overlay
    screens/
       HeroScreen.tsx         # Screen 1: Hero/Landing
       BoxesScreen.tsx        # Screens 2-5: Box opening + tasks flow
       VIPScreen.tsx          # Screen 6: VIP card + share + claim
       LeaderboardScreen.tsx  # Screen 7: Live leaderboard
       AdminScreen.tsx        # Admin dashboard (hidden route: /#admin)
    hooks/
        useCountUp.ts          # Animated number count-up hook
        useOAuthPopup.ts       # OAuth popup + postMessage handler
 server/
    index.js                   # Express: OAuth, DB, Redis, admin APIs
    package.json
 public/
    conor-hero.png             # Hero image
    realbet-logo.png           # Logo
    blood-stain.png            # Blood-stain texture
    texture-bg.jpg             # Background texture
    oauth-callback.html        # OAuth popup fallback callback page
 vite.config.ts                 # Vite config (proxy /auth  localhost:3001 in dev)
 tailwind.config.js             # Tailwind custom colors/fonts
 vercel.json                    # Vercel SPA rewrite rules
 tsconfig.json
 package.json
 .env                           # Environment variables
```

---

##  Design System

### Colors
```js
{
  'rb-bg':      '#050508',   // Main background
  'rb-card':    '#0A0B0F',   // Card backgrounds
  'rb-border':  '#333840',   // Borders
  'brand-red':  '#BF1220',   // Primary CTA red
  'brand-gold': '#F6C34A',   // Gold accents
}
```

### Fonts
- **Bebas Neue**  Display headings (`font-display`, all-caps)
- **Space Mono**  Body + label text (default + `font-label`)

### Glass Panel
```css
.glass-panel {
  background: rgba(10, 11, 15, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(51, 56, 64, 0.5);
}
```

---

##  Setup

### Prerequisites
- Node.js 18+
- PostgreSQL (Railway recommended)
- Redis (Railway recommended)
- Twitter Developer App (OAuth 2.0 + PKCE)
- Discord Developer App (OAuth 2.0 + bot with guild members intent)

### Environment Variables

Create `.env` in project root:
```env
# Twitter OAuth 2.0
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret
TWITTER_CALLBACK_URL=https://your-backend.railway.app/auth/twitter/callback

# Discord OAuth 2.0
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_CALLBACK_URL=https://your-backend.railway.app/auth/discord/callback
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_discord_server_id

# Database
DATABASE_URL=postgresql://user:password@host:port/database
REDIS_URL=redis://default:password@host:port

# Server
PORT=3001
CLIENT_URL=https://your-frontend.vercel.app
ADMIN_KEY=your_secret_admin_key
```

### Installation & Running Locally

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server && npm install && cd ..

# Terminal 1  backend (http://localhost:3001)
cd server && node index.js

# Terminal 2  frontend (http://localhost:5173)
npm run dev
```

### Build for Production
```bash
npm run build   # outputs to dist/
```

---

##  Database Schema

### `scores` table
```sql
CREATE TABLE scores (
  id                SERIAL PRIMARY KEY,
  twitter_id        VARCHAR(100) NOT NULL UNIQUE,
  username          VARCHAR(100),
  pfp               TEXT,
  followers_count   INTEGER DEFAULT 0,
  bronze_points     INTEGER DEFAULT 0,
  bronze_tier       VARCHAR(100),
  silver_points     INTEGER DEFAULT 0,
  silver_tier       VARCHAR(100),
  gold_points       INTEGER DEFAULT 0,
  gold_tier         VARCHAR(100),
  total_points      INTEGER DEFAULT 0,
  all_done          BOOLEAN DEFAULT FALSE,
  discord_id        VARCHAR(100),
  discord_username  VARCHAR(100),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS scores_discord_id_idx
  ON scores(discord_id) WHERE discord_id IS NOT NULL;
```

### Redis Keys
| Key | Purpose | TTL |
|-----|---------|-----|
| `oauth:state:<state>` | PKCE code verifier | 10 min |
| `user:<twitterId>` | Cached Twitter user data | 24 hr |
| `leaderboard:top100` | Cached leaderboard JSON | 60 sec |

---

##  API Endpoints

### Twitter OAuth
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/twitter` | Initiate OAuth flow |
| `GET` | `/auth/twitter/callback` | Callback  serves inline HTML with postMessage |

### Discord OAuth
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/auth/discord` | Initiate OAuth flow |
| `GET` | `/auth/discord/callback` | Callback  serves inline HTML with postMessage |
| `POST` | `/auth/discord/link` | Link Discord ID to existing Twitter score row |
| `GET` | `/auth/discord/check-member/:userId` | Check if user is in the Discord server |

### Scores
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/scores` | Save/update user scores |
| `GET` | `/auth/scores/:twitterId` | Retrieve saved scores + Discord linkage |

### Leaderboard
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/leaderboard` | Top 100 by points (Redis-cached 60s) |

### Admin (requires `x-admin-key` header)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/stats` | Overview stats + full user list |
| `POST` | `/admin/reset-db` | Wipe all scores + Redis cache |
| `GET` | `/admin/export` | Download all scores as JSON |

---

##  User Journey

### Screen 1  Hero (`HeroScreen`)
- Full-screen hero with Conor McGregor image, "THE HOUSE IS OPEN" title
- "Enter the Arena " CTA advances to boxes flow

### Screens 25  Boxes Flow (`BoxesScreen`)

**Screen 2  Box Opening**
- Bronze Box: open immediately, random points in follower-tier range
- Silver Box: unlocks after Bronze; same mechanic
- Tap  shake animation  reveals points
- After Silver revealed  auto-advances to Tasks

**Screen 3  Tasks (Unlock Gold)**
- **Follow @RealBet on X:**
  1. Twitter OAuth popup  authenticates + saves DB row
  2. Opens `twitter.com/intent/follow?screen_name=Realbet` in new tab
  3. 10-second countdown  marks as done
- **Join Discord:**
  1. Discord OAuth popup  links Discord to Twitter row
  2. Calls `/auth/discord/check-member/:userId`
  3. Member  done ; not member  shows join link + VERIFY button
- Both done  auto-advances to Gold Pre screen

**Screen 4  Gold Pre-Reveal**
- Large gold box with sheen sweep animation
- Tap to open

**Screen 5  Gold Reveal**
- Gold points number (scaled by follower tier)
- Total allocation glass panel
- "CONTINUE TO VIP CARD" button

### Screen 6  VIP Card (`VIPScreen`)
- **VIP Card** (tilt-on-hover, holographic sheen):
  - Twitter avatar, @handle, tier name, total bonus points
- **Right panel:**
  - Power Score + Allocation summary
  - Pre-share: reward breakdown bullets (30% Wager / 30% Deposit / 40% REAL Points)
  - Share on X  tweet intent  unlocks Claim after 2s delay
  - Claim Rewards  links to `realbet.io`
  - Post-share: animated reward breakdown with dollar amounts

### Screen 7  Leaderboard (`LeaderboardScreen`)
- Top 100 users ranked by total points
- Search by username
- Auto-refreshes every 60 seconds

### Admin Panel (`AdminScreen`)
- Access via `/#admin` in URL
- Stats overview, full user table, CSV export, DB reset

---

##  Point Allocation (`tierConfig.ts`)

Points scale by Twitter follower count:

| Followers     | Tier           |
|--------------|----------------|
| < 500         | Micro          |
| 500  4,999   | Rising         |
| 5,000  24,999 | Influencer    |
| 25,000  99,999 | Major        |
| 100,000+      | Elite          |

Dollar allocation: `calculateAllocationDollars(totalPoints)`  
Reward split: **30% Wager Bonus / 30% Deposit Match / 40% REAL Points** (with tier caps)

---

##  Data Persistence

| Storage | What's stored |
|---------|--------------|
| `localStorage` | Box results (prevents re-randomization on refresh), Twitter profile |
| PostgreSQL | All scores, box results, Discord linkage, follower counts |
| Redis | OAuth PKCE state, user cache, leaderboard cache |

State restores from DB on new devices  after Twitter OAuth the app fetches the existing row and resumes from the correct sub-screen.

---

##  Technical Notes

### OAuth Popup
- Backend serves **inline HTML** at callback (not a redirect) so `window.opener` is available
- `useOAuthPopup.ts` has a 30-second grace period before checking `popup.closed` to handle cross-origin false-positives
- `postMessage` is the primary result channel and overrides any earlier failure

### Helmet COOP
`crossOriginOpenerPolicy: false` + `crossOriginEmbedderPolicy: false`  required so the popup can reach `window.opener` after OAuth redirects through external domains.

### Vercel Rewrite
`vercel.json` has an explicit rule for `/oauth-callback.html` before the SPA catch-all.

---

##  Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for full instructions.

1. Deploy backend to Railway  set all env vars
2. Deploy frontend to Vercel  set `VITE_API_URL` to Railway backend URL
3. Update Twitter + Discord OAuth callback URLs to production domains
4. Smoke-test full OAuth  box  VIP flow

---

##  License

Proprietary  RealBet Season 1 Campaign
