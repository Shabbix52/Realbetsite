# RealBet Season 1 Landing Page

A multi-screen interactive landing page for RealBet's Season 1 allocation campaign with Twitter OAuth, box-opening mechanics, VIP card generation, and follower-based point allocation.

---

## 🏗️ Architecture

**Frontend:** React + TypeScript + Vite + Tailwind CSS + Framer Motion  
**Backend:** Express.js + PostgreSQL + Redis  
**Auth:** Twitter OAuth 2.0 (PKCE), Discord OAuth  
**Deployment:** Railway (PostgreSQL + Redis)

---

## 📁 Project Structure

```
lovable/
├── src/
│   ├── App.tsx                    # Main app, screen routing, user state
│   ├── main.tsx                   # React entry point
│   ├── index.css                  # Global CSS, glass-panel, keyframes
│   ├── components/
│   │   ├── ParticleBackground.tsx # Animated particles
│   │   ├── GlowEffects.tsx        # Gradient glow effects
│   │   ├── HeroTitle.tsx          # Animated hero title
│   │   ├── Subtitle.tsx           # Hero subtitle
│   │   ├── CTAButton.tsx          # 3D CTA button
│   │   ├── Logo.tsx               # RealBet logo
│   │   ├── Stats.tsx              # Stats display
│   │   ├── Steps.tsx              # Step indicators
│   │   └── ConfettiBurst.tsx      # Confetti animation
│   ├── screens/
│   │   ├── HeroScreen.tsx         # Screen 1: Hero/Landing
│   │   ├── BoxesScreen.tsx        # Screens 2-5: Box opening flow
│   │   └── VIPScreen.tsx          # Screen 6: VIP card + share
│   └── hooks/
│       ├── useCountUp.ts          # Number animation hook
│       └── useOAuthPopup.ts       # OAuth popup handler
├── server/
│   ├── index.js                   # Express server, OAuth, DB
│   └── package.json
├── vite.config.ts                 # Vite config (proxy /auth)
├── tailwind.config.js             # Tailwind custom colors/fonts
├── tsconfig.json
├── package.json
└── .env                           # Environment variables

```

---

## 🎨 Design System

### Colors
```js
{
  bg: '#07070B',           // Main background
  surface: '#12131A',      // Surface/panel bg
  card: '#1A1B24',         // Card backgrounds
  brand-red: '#FF3B30',    // Primary CTA red
  brand-gold: '#F6C34A',   // Gold accents
  rb-muted: '#9AA0B2',     // Muted text
  border: '#2A2C3A',       // Borders
  accent: '#1DA1F2'        // Twitter blue
}
```

### Fonts
- **Inter** — Body text (Google Fonts)
- **Oswald** — Display/headings (`font-display`)
- **JetBrains Mono** — Labels/numbers (`font-label`)

### Glass Panel CSS
```css
.glass-panel {
  background: rgba(18, 19, 26, 0.6);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(42, 44, 58, 0.5);
}
```

---

## 🚀 Setup Instructions

### Prerequisites
- Node.js 18+
- PostgreSQL database (Railway recommended)
- Redis instance (Railway recommended)
- Twitter Developer App (OAuth 2.0 with PKCE)
- Discord Developer App (OAuth 2.0)

### Environment Variables

Create `.env` in project root:

```env
# Twitter OAuth 2.0
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret
TWITTER_CALLBACK_URL=http://localhost:3001/auth/twitter/callback

# Discord OAuth 2.0
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_CALLBACK_URL=http://localhost:3001/auth/discord/callback
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=your_discord_server_id

# Database
DATABASE_URL=postgresql://user:password@host:port/database
REDIS_URL=redis://default:password@host:port

# Server
PORT=3001
CLIENT_URL=http://localhost:5173
```

### Installation

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server
npm install
cd ..
```

### Running Locally

```bash
# Terminal 1: Start backend
cd server
node index.js
# Server runs on http://localhost:3001

# Terminal 2: Start frontend
npm run dev
# Frontend runs on http://localhost:5173
```

### Build for Production

```bash
npm run build
# Outputs to dist/
```

---

## 📊 Database Schema

### `users` table
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(20) NOT NULL,           -- 'twitter' or 'discord'
  provider_id VARCHAR(100) NOT NULL,       -- OAuth provider user ID
  username VARCHAR(100),
  display_name VARCHAR(200),
  avatar_url TEXT,
  followers_count INTEGER DEFAULT 0,       -- Twitter follower count
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, provider_id)
);
```

### `wallets` table
```sql
CREATE TABLE wallets (
  id SERIAL PRIMARY KEY,
  address VARCHAR(100) NOT NULL UNIQUE,
  chain VARCHAR(50),
  balance NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `scores` table
```sql
CREATE TABLE scores (
  id SERIAL PRIMARY KEY,
  twitter_id VARCHAR(100) NOT NULL UNIQUE,
  username VARCHAR(100),
  followers_count INTEGER DEFAULT 0,
  bronze_points INTEGER DEFAULT 0,
  bronze_tier VARCHAR(100),
  silver_points INTEGER DEFAULT 0,
  silver_tier VARCHAR(100),
  gold_points INTEGER DEFAULT 0,
  gold_tier VARCHAR(100),
  wallet_multiplier NUMERIC DEFAULT 1,
  total_points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔐 API Endpoints

### Twitter OAuth
- `GET /auth/twitter` — Initiates OAuth flow
- `GET /auth/twitter/callback` — OAuth callback handler
- Returns: `{ success, provider: 'twitter', user: { id, username, avatar, followersCount } }`

### Discord OAuth
- `GET /auth/discord` — Initiates OAuth flow
- `GET /auth/discord/callback` — OAuth callback handler
- `GET /auth/discord/check-member/:userId` — Check if user is in Discord server
- Returns: `{ success, provider: 'discord', user: { id, username, globalName, avatar } }`

### Wallet
- `POST /auth/wallet` — Save wallet address
  ```json
  { "address": "0x...", "chain": "Mainnet", "balance": "1.234" }
  ```

### Scores
- `POST /auth/scores` — Save/update user scores
  ```json
  {
    "twitterId": "123456",
    "username": "degen_whale",
    "followersCount": 5000,
    "boxes": [
      { "type": "bronze", "points": 1200, "tierName": "Chip Stacker" },
      { "type": "silver", "points": 3500, "tierName": "High Roller" },
      { "type": "gold", "points": 18000, "tierName": "House Legend" }
    ],
    "walletMultiplier": 1.5,
    "totalPoints": 33750
  }
  ```

- `GET /auth/scores/:twitterId` — Retrieve saved scores
  ```json
  {
    "twitterId": "123456",
    "username": "degen_whale",
    "followersCount": 5000,
    "boxes": [...],
    "walletMultiplier": 1.5,
    "totalPoints": 33750
  }
  ```

---

## 🎮 User Journey

### Screen 1: Hero
- Animated title, subtitle, particles
- "ENTER THE HOUSE" CTA button
- No vertical scroll (h-screen, overflow-hidden)
- Click → Advances to Screen 2

### Screens 2-5: Boxes Flow

#### Screen 2: Box Opening (Bronze & Silver)
- **Bronze Box** — Ready to open
  - Points: 500–1,500 (scaled by follower count)
  - Tiers: Pit Boss Prospect, Table Rookie, Chip Stacker, House Hopeful
- **Silver Box** — Unlocks after bronze opened
  - Points: 2,000–5,000 (scaled by follower count)
  - Tiers: High Roller, VIP Candidate, Felt Walker, Card Counter
- **Gold Box** — Locked until tasks complete
- Shake animation → reveals points + tier
- After silver revealed → Auto-advance to Screen 3

#### Screen 3: Tasks
- **Follow @Realbet on X** — Twitter OAuth popup → opens @Realbet profile → 15s auto-verify
- **Join Discord** — Discord OAuth popup → opens Discord invite → polls membership check every 2s (max 15 attempts)
- **Connect Wallet (Optional)** — MetaMask connect → calculates multiplier:
  - `< 0.01 ETH` → 1x
  - `0.01–0.1 ETH` → 1.2x
  - `0.1–1 ETH` → 1.5x
  - `> 1 ETH` → 2x
- After Follow + Discord → "Unlocking next phase..." → Auto-advance to Screen 4

#### Screen 4: Gold Pre-Reveal
- Fixed-size gold box (w-56 h-56 md:w-72 md:h-72)
- Sheen sweep animation
- "The Gold Box" heading
- Click → Opens gold box → Advanced to Screen 5

#### Screen 5: Gold Reveal
- Sparkle icon
- Large gold points (10,000–25,000, scaled by followers)
- Tiers: House Legend, Whale Status, Inner Circle, The Chosen
- Tier badge pill
- "Your status is locked for Season 1." text
- Glass-panel total allocation (with wallet multiplier if connected)
- "CONTINUE TO VIP CARD" button → Advances to Screen 6

### Screen 6: VIP Card & Share
- VIP card with:
  - Twitter avatar & handle
  - Tier name badge
  - Total points (animated count-up)
  - Diamond pattern background
  - Holographic sheen
  - "CASINO" branding
- Right panel:
  - Season 1 badge
  - Locked status text
  - Share button (blue Twitter) → Opens tweet intent → After 2s marks as shared
  - Claim button (locked until shared) → After share, unlocks with red gradient → Links to https://realbet.io
  - Payment logos
  - Terms: "Credit unlocks after first $20 deposit. 1× wagering requirement."

---

## 🔢 Follower-Based Point Allocation

Points are scaled based on Twitter follower count:

| Followers       | Multiplier |
|-----------------|------------|
| < 100           | 1x         |
| 100–999         | 1.5x       |
| 1,000–9,999     | 2x         |
| 10,000–49,999   | 3x         |
| 50,000+         | 4x         |

**Example:**
- User with 5,000 followers → 2x multiplier
- Bronze base range: 500–1,500 → Scaled: 1,000–3,000
- Silver base range: 2,000–5,000 → Scaled: 4,000–10,000
- Gold base range: 10,000–25,000 → Scaled: 20,000–50,000

Combined with wallet multiplier:
- 8,000 (bronze) + 7,000 (silver) + 35,000 (gold) = 50,000 pts
- Wallet multiplier 1.5× → **75,000 total points**

---

## 💾 Data Persistence

### localStorage
- **Box results** — Saved after each box reveal, prevents randomization on refresh
- **User profile** — Twitter ID, username, avatar saved on OAuth, restored on refresh

### PostgreSQL
- **Users** — Twitter/Discord profiles, follower counts
- **Scores** — All box results, wallet multiplier, total points (keyed by Twitter ID)
- **Wallets** — Connected wallet addresses, balances, chains

### Redis
- **OAuth state** — PKCE code verifiers, state tokens (10-minute TTL)
- **User cache** — Twitter/Discord user data (24-hour TTL)

---

## 🎭 Animations

### Framer Motion Variants
```js
const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1, delayChildren: 0.15 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } 
  }
};
```

### Custom Keyframes
- `animate-sheen` — Holographic sweep effect (10s linear infinite)
- Box shake — On box open (transform: rotate + scale)
- Count-up — Number animation via `useCountUp` hook

---

## 🔧 Configuration

### Vite Proxy
```js
// vite.config.ts
proxy: {
  '/auth': {
    target: 'http://localhost:3001',
    changeOrigin: true
  }
}
```

### Tailwind Extend
```js
// tailwind.config.js
theme: {
  extend: {
    colors: { /* custom palette */ },
    fontFamily: {
      sans: ['Inter', 'sans-serif'],
      display: ['Oswald', 'sans-serif'],
      label: ['JetBrains Mono', 'monospace']
    }
  }
}
```

---

## 🐛 Known Issues & Solutions

### Issue: "ECONNRESET" on backend start
**Solution:** Add SSL config to PostgreSQL pool:
```js
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
```

### Issue: Stuck on Screen 2 after refresh
**Solution:** Implemented `deriveSubScreen()` to calculate correct initial sub-screen from saved box state.

### Issue: VIP card shows default avatar after refresh
**Solution:** Added localStorage persistence for user profile (Twitter ID, username, avatar) in `App.tsx`.

---

## 🚢 Deployment

This project uses a **hybrid deployment strategy**:
- **Frontend:** Vercel (static Vite build)
- **Backend:** Railway (Express.js server)
- **Database:** Railway (PostgreSQL + Redis)

### Quick Deploy Guide

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for full step-by-step instructions.

**Summary:**
1. Deploy backend to Railway (15 min)
2. Deploy frontend to Vercel (5 min)
3. Update OAuth callback URLs
4. Test full flow

**Estimated cost:** ~$15/month (Railway free tier credits may cover initial usage)

---

## 📝 Development Notes

### Adding a New Screen
1. Create component in `src/screens/`
2. Add screen type to `Screen` union in `App.tsx`
3. Add screen to `AnimatePresence` in `App.tsx`
4. Add transition logic (callback props)

### Modifying Point Ranges
Edit `BOX_POINTS` in [BoxesScreen.tsx](src/screens/BoxesScreen.tsx#L35):
```ts
const BOX_POINTS: Record<BoxType, [number, number]> = {
  bronze: [500, 1500],
  silver: [2000, 5000],
  gold: [10000, 25000],
};
```

### Modifying Follower Multiplier
Edit `followerMultiplier()` in [BoxesScreen.tsx](src/screens/BoxesScreen.tsx#L60):
```ts
function followerMultiplier(followers: number): number {
  if (followers >= 50000) return 4;
  if (followers >= 10000) return 3;
  if (followers >= 1000)  return 2;
  if (followers >= 100)   return 1.5;
  return 1;
}
```

---

## 🎯 Future Enhancements

- [ ] Referral system with unique codes
- [ ] Leaderboard (top scores by tier)
- [ ] Email capture before box opening
- [ ] Tweet verification (actually check if user tweeted)
- [ ] Multi-language support
- [ ] Mobile-optimized VIP card (smaller font sizes)
- [ ] Season 2 migration plan (new columns/tables)
- [ ] Analytics tracking (PostHog/Mixpanel)

---

## 📦 Key Dependencies

```json
{
  "react": "^18.2.0",
  "framer-motion": "^10.16.4",
  "ethers": "^6.9.0",
  "tailwindcss": "^3.3.5",
  "express": "^4.18.2",
  "pg": "^8.11.3",
  "redis": "^4.6.11",
  "dotenv": "^16.3.1"
}
```

---

## 📄 License

Proprietary — RealBet Season 1 Campaign

---

## 🤝 Support

For questions or issues, contact the development team or open an issue in the repository.

**Built with ❤️ for RealBet Season 1**
