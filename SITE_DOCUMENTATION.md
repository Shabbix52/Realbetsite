# RealBet Season 1 - Complete Site Documentation

## Overview

**RealBet Season 1** is an interactive gamification landing page designed to allocate free play bonuses and rewards to users based on their engagement activities. The site serves as an exclusive campaign to:

- Authenticate users via Twitter/X and Discord OAuth
- Generate "Power Scores" through mystery box gamification (Bronze, Silver, Gold boxes)
- Calculate personalized season 1 allocations based on follower count tiers
- Enable users to link casino accounts and claim dual rewards (game credits + "REAL" points)
- Track performance on a live leaderboard
- Implement a referral system for multiplied rewards

The site follows a **Season 1 theme** with strong visual branding around a "casino house" aesthetic using blood-red accents, glowing effects, and dramatic animations.

---

## Screens & User Flow

### Screen 1: Hero Screen (Landing Page)

**Purpose:** Campaign introduction and entry point

**Features:**
- Animated "THE HOUSE IS OPEN" headline with letter-by-letter stagger animations
- Animated embers floating upward (fire aesthetic)
- Scan lines and red spotlight sweeps for visual impact
- Large hero image of a character (Conor-themed) positioned right
- Tagline: *"Three boxes. One Power Score. The higher you score, the bigger your Season 1 allocation"*
- Call-to-action button **"GENERATE MY ALLOCATION"** triggering transition to BoxesScreen
- Badge showing "RealBet · Season 1"

---

### Screens 2-5: Boxes Screen (Gamification Core)

**Purpose:** Core engagement mechanic with three mystery boxes

#### Box Opening Flow:
1. **Bronze Box** (Unlocked by default)
   - Points: 100-500
   - Shake animation → Server request → Reveal points
   
2. **Silver Box** (Unlocked after Bronze)
   - Points: 500-1,000
   - Same animation sequence
   
3. **Gold Box** (Unlocked after Silver)
   - Points: Tier-dependent based on follower count
   - Range varies from 1-1,000 (0-1K followers) to 60,001-70,000 (250K+ followers)

#### Task Phase (After All Boxes):
| Task | Bonus Points | Verification |
|------|--------------|--------------|
| Follow @Realbet on Twitter | 500 | Follow API check |
| Join Discord Server | 500 | Guild membership check via bot |

**Technical Details:**
- Server-side cryptographically signed point generation with HMAC token verification
- Persistent state saved to localStorage and synced to backend database
- Anti-cheat: Gold box points validated against tier's `goldPointsMin` and `goldPointsMax`

---

### Screen 6: VIP Card Screen (Reward Showcase)

**Purpose:** Display personalized allocation rewards

#### VIP Card Features:
- **Interactive 3D-tilting card** with mouse tracking
- User avatar in circle
- Username display
- **$REAL Freeplay amount**: 60% of Power Score ÷ 20, capped by tier
- **Real Points**: 40% of Power Score for leaderboard airdrop
- Template image with dynamic text overlay

#### Share Functionality:
- Capture VIP card as PNG screenshot
- Generate shareable OpenGraph-compatible URL
- Automatic Twitter unfurl with card preview
- Referral code embedded in share URL (`?ref=RBXXXXXX`)

#### Hub Connect Flow:
1. User clicks "Connect Account"
2. Redirects to `https://hub.realbet.io/connect` with state tracking
3. User links casino account
4. HMAC-verified callback to site
5. **Two-step claim process:**
   - Hub API grants $REAL freeplay (60% allocation)
   - Hub API grants leaderboard points (40% allocation)

---

### Screen 7: Leaderboard Screen

**Purpose:** Display live player rankings and competition

**Display Features:**
| Column | Description |
|--------|-------------|
| Rank | Position (🥇🥈🥉 for top 3) |
| Username | With "YOU" badge for current player |
| Followers | Twitter follower count |
| Power Score | Total points (Bronze + Silver + Gold + Tasks + Referrals) |
| Real Points | 40% of Power Score |

**Technical Details:**
- Top 100 players sorted by Power Score (descending)
- Redis-cached for 120 seconds
- Real-time refresh on button click
- Number counter animations (count-up effect)
- Mobile-responsive layout

---

### Admin Screen (Hidden Route: `/#admin`)

**Purpose:** Operator oversight and campaign analytics

**Access:** Password-protected with `ADMIN_KEY` from environment

#### Overview Tab:
- Total users, total points issued, dollar exposure
- Cash exposure, real points allocated
- Average/max points, follower counts
- Completion rates, share counts

#### Users Tab:
- Paginated list (50 per page)
- Search by username or twitterId
- Sort by: total_points, followers, bronze/silver/gold points
- View: share status, claim status, timestamps

#### Referrals Tab:
- Top referrers leaderboard
- Conversion statistics (pending vs converted)
- Total bonus distribution

#### Admin Actions:
- **Database Reset**: Clears all scores/users/referrals (with confirmation)
- **CSV Export**: Downloads all player data

---

## Authentication System

### Twitter/X OAuth 2.0 (Primary Auth)

```
User clicks "Start"
    ↓
GET /auth/twitter
    ↓
Generate PKCE challenge + state token
    ↓
Redirect to Twitter OAuth
    ↓
User authorizes (scopes: tweet.read, users.read, follows.read, offline.access)
    ↓
Twitter redirects to /auth/twitter/callback
    ↓
Exchange code for access token
    ↓
Fetch user profile (id, username, name, avatar, followers_count)
    ↓
Save to PostgreSQL + Redis cache
    ↓
Return via postMessage (desktop) or redirect (mobile)
```

### Discord OAuth 2.0 (Secondary Auth)

```
User clicks "Join Discord" task
    ↓
GET /auth/discord
    ↓
Similar OAuth flow to Twitter
    ↓
GET /auth/discord/check-member/:userId
    ↓
Bot checks guild membership
    ↓
POST /auth/discord/link
    ↓
Associate Discord ID with existing Twitter score row
    ↓
Grant 500 bonus points
```

---

## VIP Tier System

### 24 Follower-Based Tiers

| Tier | Follower Range | Gold Points | Max Freeplay |
|------|----------------|-------------|--------------|
| 1 | 0 - 1K | 1 - 1,000 | $63 |
| 2 | 1K - 2K | 1,001 - 1,800 | $87 |
| 3 | 2K - 3K | 1,801 - 2,400 | $105 |
| 4 | 3K - 5K | 2,401 - 3,000 | $123 |
| 5 | 5K - 7.5K | 3,001 - 4,500 | $168 |
| 6 | 7.5K - 10K | 4,501 - 6,000 | $213 |
| 7 | 10K - 15K | 6,001 - 8,500 | $288 |
| 8 | 15K - 20K | 8,501 - 11,000 | $363 |
| 9 | 20K - 25K | 11,001 - 13,000 | $423 |
| 10 | 25K - 30K | 13,001 - 14,500 | $468 |
| 11 | 30K - 35K | 14,501 - 16,000 | $513 |
| 12 | 35K - 40K | 16,001 - 18,000 | $573 |
| 13 | 40K - 45K | 18,001 - 20,000 | $633 |
| 14 | 45K - 50K | 20,001 - 22,000 | $693 |
| 15 | 50K - 60K | 22,001 - 25,000 | $783 |
| 16 | 60K - 70K | 25,001 - 28,000 | $873 |
| 17 | 70K - 80K | 28,001 - 31,000 | $963 |
| 18 | 80K - 90K | 31,001 - 34,000 | $1,053 |
| 19 | 90K - 100K | 34,001 - 37,000 | $1,143 |
| 20 | 100K - 125K | 37,001 - 42,000 | $1,293 |
| 21 | 125K - 150K | 42,001 - 47,000 | $1,443 |
| 22 | 150K - 200K | 47,001 - 53,000 | $1,623 |
| 23 | 200K - 250K | 53,001 - 60,000 | $1,833 |
| 24 | 250K+ | 60,001 - 70,000 | $2,133 |

### Power Score Calculation

```
Power Score = Bronze Points + Silver Points + Gold Points + Task Bonus + Referral Bonus
```

### Reward Allocation (60/40 Split)

| Allocation | Formula | Example (3,550 Power Score) |
|------------|---------|------------------------------|
| **60% Free Play** | `(Score × 0.60) ÷ 20` | 2,130 ÷ 20 = **$106.50** |
| **40% Real Points** | `Score × 0.40` | **1,420 Real Points** |

- Free Play has **15x wagering requirement**
- Free Play is **capped per tier** to prevent exploitation
- Real Points used for **airdrop qualification**

---

## Referral System

### How It Works:

1. **Code Generation**: `RB` + SHA256 hash of twitterId (e.g., `RBAB1234C5`)
2. **Share URL**: `https://claim.realbet.io/?ref=RBAB1234C5`

### Rewards:

| Party | Bonus | Cap |
|-------|-------|-----|
| Referrer | 50 points per successful referral | 25,000 total |
| Referred | 0 points (counts toward power score) | N/A |

### Conversion Flow:
1. New user arrives via referral link
2. Referral tracked as "pending"
3. Referred user completes boxes and earns points
4. Referral marked as "converted"
5. Referrer receives 50 bonus points

---

## Database Schema

### users Table
```sql
id (PK), provider (twitter/discord), provider_id (unique)
username, display_name, avatar_url, followers_count
login_count, created_at
```

### scores Table
```sql
id (PK), twitter_id (UNIQUE), username, followers_count
bronze_points, bronze_tier, silver_points, silver_tier, gold_points, gold_tier
wallet_multiplier, total_points, updated_at
discord_id (UNIQUE), discord_username
referral_code (UNIQUE), referral_bonus_points, referral_count, referred_by
share_image (base64 PNG), share_post_url, shared_at
account_linked, claimed_at, hub_bonus_id, claim_amount
hub_real_bonus_id, claim_real_amount
created_at, updated_at
```

### referrals Table
```sql
id (PK), referrer_twitter_id, referred_twitter_id (UNIQUE)
referral_code, referrer_bonus, referred_bonus
status (pending/converted), created_at, converted_at
```

### wallets Table
```sql
id (PK), address (UNIQUE), chain, balance, created_at
```

---

## API Endpoints

### Authentication

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/auth/twitter` | Initiate Twitter OAuth |
| GET | `/auth/twitter/callback` | Twitter callback |
| GET | `/auth/discord` | Initiate Discord OAuth |
| GET | `/auth/discord/callback` | Discord callback |
| POST | `/auth/discord/link` | Link Discord to Twitter account |
| GET | `/auth/discord/check-member/:userId` | Verify guild membership |

### Scores

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/auth/scores/roll` | Generate box points with HMAC token |
| POST | `/auth/scores` | Save/update user scores |
| GET | `/auth/scores/:twitterId` | Fetch user scores |

### Claim/Connect

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/auth/hub-connect` | Initiate casino account link |
| GET | `/auth/connect/callback/:state` | Hub callback (new pattern) |
| GET | `/auth/connect/callback` | Hub callback (legacy) |
| POST | `/auth/claim` | Claim bonuses |
| GET | `/auth/claim-status/:twitterId` | Check claim status |

### Share/Image

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/auth/share-image` | Upload VIP card screenshot |
| GET | `/share-image/:twitterId.png` | Serve VIP card image |
| POST | `/auth/share` | Record share post URL |
| GET | `/share/:twitterId` | OpenGraph share page |

### Leaderboard

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/auth/leaderboard` | Fetch ranked players |

### Referrals

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/auth/referral/:twitterId` | Get referral code + stats |
| POST | `/auth/referral/apply` | Apply referral code |
| GET | `/auth/referral/validate` | Validate referral code |
| POST | `/auth/referral/convert` | Mark referral converted |

### Admin (requires `x-admin-key` header)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/admin/stats` | Campaign metrics |
| GET | `/admin/users` | Paginated user list |
| POST | `/admin/reset-db` | Reset database |
| GET | `/admin/export` | CSV export |
| GET | `/admin/referrals` | Referral analytics |

---

## Caching Strategy (Redis)

| Key Pattern | TTL | Purpose |
|-------------|-----|---------|
| `user:twitter:{id}` | 24 hours | Twitter user data |
| `user:discord:{id}` | 24 hours | Discord user data |
| `scores:{twitterId}` | 24 hours | User scores |
| `referral:{twitterId}` | 5 minutes | Referral data |
| `leaderboard:top100` | 2 minutes | Top 100 rankings |

---

## Security Measures

### Authentication Security
- **PKCE** (Proof Key for Code Exchange) for OAuth
- **State tokens** for CSRF protection (10-min TTL)
- **HMAC-256** signing for score tokens

### Database Security
- **SSL connections** in production
- **Advisory locks** (`pg_advisory_xact_lock`) for claim operations
- **ON CONFLICT** + `GREATEST()` to prevent score downgrades

### API Security
- **Helmet.js** for CSP headers
- **Rate limiting** (30-120 req/min per endpoint)
- **Input validation** for points, followers, URLs
- **Admin key** protection for sensitive endpoints

---

## Technology Stack

### Frontend
- **Framework**: React + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS + PostCSS
- **State**: localStorage + React hooks
- **Animations**: CSS animations + custom hooks

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL (Railway)
- **Cache**: Redis (Railway)
- **Auth**: OAuth 2.0 (Twitter, Discord)

### Deployment
- **Frontend**: Vercel (auto-deploy from GitHub)
- **Backend**: Railway (Node.js)
- **Database**: Railway PostgreSQL
- **Cache**: Railway Redis

---

## Environment Variables

### Frontend (Vite)
```
VITE_API_URL=https://realbetsite-production.up.railway.app
```

### Backend
```
# OAuth
TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET
DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID

# Database
DATABASE_URL, REDIS_URL

# Server
PORT, CLIENT_URL, SERVER_URL, ADMIN_KEY, SCORE_SECRET

# Hub API
BONUS_API_SECRET, HUB_API_BASE
```

---

## User Journey Summary

```
1. Land on Hero Screen
   ↓
2. Click "GENERATE MY ALLOCATION"
   ↓
3. Authenticate with Twitter
   ↓
4. Open Bronze Box → Get 100-500 points
   ↓
5. Open Silver Box → Get 500-1,000 points
   ↓
6. Open Gold Box → Get tier-based points
   ↓
7. Complete Tasks (Follow Twitter + Join Discord) → +1,000 bonus
   ↓
8. View VIP Card with allocation
   ↓
9. Share card on Twitter (with referral link)
   ↓
10. Connect casino account via Hub
    ↓
11. Claim rewards (60% freeplay + 40% real points)
    ↓
12. Track position on Leaderboard
    ↓
13. Earn referral bonuses when friends join
```

---

## File Structure

```
├── public/
│   ├── oauth-callback.html    # OAuth popup callback
│   └── fonts/                 # Custom fonts
├── server/
│   ├── index.js               # Express server (all routes)
│   ├── package.json           # Server dependencies
│   └── tierData.json          # Tier configuration
├── shared/
│   └── tierData.json          # Shared tier data
├── src/
│   ├── App.tsx                # Main React app
│   ├── main.tsx               # Entry point
│   ├── config.ts              # Frontend config
│   ├── tierConfig.ts          # Tier utilities
│   ├── index.css              # Global styles
│   ├── components/
│   │   ├── BloodStainOverlay.tsx
│   │   └── GlowEffects.tsx
│   ├── hooks/
│   │   ├── useCountUp.ts      # Number animation
│   │   └── useOAuthPopup.ts   # OAuth popup handler
│   └── screens/
│       ├── AdminScreen.tsx    # Admin dashboard
│       ├── BoxesScreen.tsx    # Mystery boxes
│       ├── HeroScreen.tsx     # Landing page
│       ├── LeaderboardScreen.tsx
│       └── VIPScreen.tsx      # VIP card display
├── DEPLOYMENT.md              # Deployment guide
├── package.json               # Frontend dependencies
├── tailwind.config.js         # Tailwind configuration
├── vite.config.ts             # Vite configuration
└── vercel.json                # Vercel deployment config
```
