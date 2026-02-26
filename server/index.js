import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import pg from 'pg';
import { createClient } from 'redis';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const app = express();
app.set('trust proxy', 1); // Trust first proxy hop (Railway's load balancer)
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

// Allow Vercel preview deployments and production
const allowedOrigins = [
  CLIENT_URL,
  'http://localhost:5173',
  /^https:\/\/lovable-[a-z0-9-]+\.vercel\.app$/
];

// Disable COOP/COEP so postMessage + window.opener works cross-origin in popup flow
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'", CLIENT_URL, "https://api.twitter.com", "https://discord.com"],
      frameSrc: ["'self'", CLIENT_URL],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ 
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.some(allowed => 
      typeof allowed === 'string' ? allowed === origin : allowed.test(origin)
    );
    callback(null, isAllowed ? origin : false);
  },
  credentials: true 
}));
app.use(express.json({ limit: '16kb' }));

// Rate limiting
const generalLimiter = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });
const adminLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
// Separate instances per OAuth route — shared instances cause all routes to share one bucket
const twitterAuthLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
const discordAuthLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
const rollLimiter = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/auth/leaderboard', generalLimiter);
app.use('/auth/scores/roll', rollLimiter);
app.use('/auth/scores', generalLimiter);
app.use('/auth/twitter', twitterAuthLimiter);
app.use('/auth/discord', discordAuthLimiter);
app.use('/admin', adminLimiter);

// ─────────────────────────────────────────────
//  DATABASE SETUP
// ─────────────────────────────────────────────

// PostgreSQL
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(20) NOT NULL,
        provider_id VARCHAR(100) NOT NULL,
        username VARCHAR(100),
        display_name VARCHAR(200),
        avatar_url TEXT,
        followers_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(provider, provider_id)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id SERIAL PRIMARY KEY,
        address VARCHAR(100) NOT NULL UNIQUE,
        chain VARCHAR(50),
        balance NUMERIC,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS scores (
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
    `);
    // Add followers_count to existing tables if missing
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS followers_count INTEGER DEFAULT 0`);
    // Link Discord to the unified score row
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS discord_id VARCHAR(100)`);
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100)`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS scores_discord_id_idx ON scores (discord_id) WHERE discord_id IS NOT NULL`);

    // ── Referral system tables ──
    await client.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        referrer_twitter_id VARCHAR(100) NOT NULL,
        referred_twitter_id VARCHAR(100) NOT NULL UNIQUE,
        referral_code VARCHAR(20) NOT NULL,
        referrer_bonus INTEGER DEFAULT 0,
        referred_bonus INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        converted_at TIMESTAMPTZ
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_twitter_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals (referral_code)`);

    // Add referral columns to scores table
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20)`);
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS referred_by VARCHAR(100)`);
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS referral_bonus_points INTEGER DEFAULT 0`);
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS scores_referral_code_idx ON scores (referral_code) WHERE referral_code IS NOT NULL`);

    // Track login count to identify new vs returning users
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 1`);
    // Track share post URL for VIP screen share confirmation
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS share_post_url TEXT`);
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS shared_at TIMESTAMPTZ`);

    console.log('✓ PostgreSQL connected & tables ready');
  } finally {
    client.release();
  }
}

async function upsertUser(provider, providerData) {
  const { id: providerId, username, name, globalName, avatar, followersCount } = providerData;
  const displayName = name || globalName || username;
  const result = await pool.query(
    `INSERT INTO users (provider, provider_id, username, display_name, avatar_url, followers_count, login_count)
     VALUES ($1, $2, $3, $4, $5, $6, 1)
     ON CONFLICT (provider, provider_id) DO UPDATE
       SET username = $3, display_name = $4, avatar_url = $5, followers_count = $6,
           login_count = users.login_count + 1
     RETURNING id, login_count`,
    [provider, providerId, username, displayName, avatar, followersCount || 0]
  );
  return { id: result.rows[0].id, loginCount: result.rows[0].login_count };
}

// Redis
const redis = createClient({
  url: process.env.REDIS_URL,
  socket: { reconnectStrategy: (retries) => Math.min(retries * 500, 5000) },
});
redis.on('error', (err) => console.error('Redis error:', err.message));

async function initRedis() {
  await redis.connect();
  console.log('✓ Redis connected');
}

// ── In-memory store for OAuth state / PKCE verifiers ──
const oauthStore = new Map();

// ─────────────────────────────────────────────
//  TWITTER / X  — OAuth 2.0 with PKCE
// ─────────────────────────────────────────────

function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

// Step 1: Redirect user to Twitter authorization
app.get('/auth/twitter', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const { verifier, challenge } = generatePKCE();

  const isMobileRedirect = req.query.return_mobile === '1';
  oauthStore.set(state, { verifier, provider: 'twitter', created: Date.now(), isMobileRedirect });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.TWITTER_CLIENT_ID || '',
    redirect_uri: `${SERVER_URL}/auth/twitter/callback`,
    scope: 'tweet.read users.read follows.read offline.access',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  res.redirect(`https://twitter.com/i/oauth2/authorize?${params}`);
});

// Step 2: Handle Twitter callback
app.get('/auth/twitter/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return sendResultPage(res, false, 'twitter', 'Missing code or state');
  }

  const stored = oauthStore.get(state);
  if (!stored) {
    return sendResultPage(res, false, 'twitter', 'Invalid or expired state');
  }
  oauthStore.delete(state);

  try {
    // Exchange code for access token
    const basicAuth = Buffer.from(
      `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
    ).toString('base64');

    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        code: String(code),
        grant_type: 'authorization_code',
        redirect_uri: `${SERVER_URL}/auth/twitter/callback`,
        code_verifier: stored.verifier,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Twitter token error:', err);
      return sendResult(res, false, 'twitter', 'Token exchange failed', null, stored.isMobileRedirect);
    }

    const tokenData = await tokenRes.json();

    // Fetch user profile
    const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,username,public_metrics', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const userData = await userRes.json();
    const user = userData.data;
    const followersCount = user.public_metrics?.followers_count || 0;

    // Store in database
    const { id: dbId, loginCount } = await upsertUser('twitter', {
      id: user.id,
      username: user.username,
      name: user.name,
      avatar: user.profile_image_url,
      followersCount,
    });
    // Cache in Redis (expire in 24h)
    await redis.setEx(`user:twitter:${user.id}`, 86400, JSON.stringify({ dbId, username: user.username, followersCount }));
    console.log(`Twitter user @${user.username} (${followersCount} followers) saved (db id: ${dbId}, login #${loginCount})`);

    sendResult(res, true, 'twitter', null, {
      id: user.id,
      username: user.username,
      name: user.name,
      avatar: user.profile_image_url,
      followersCount,
      isNewUser: loginCount === 1,
    }, stored.isMobileRedirect);
  } catch (err) {
    console.error('Twitter OAuth error:', err);
    sendResult(res, false, 'twitter', 'OAuth flow failed', null, stored.isMobileRedirect);
  }
});

// ─────────────────────────────────────────────
//  DISCORD — OAuth 2.0
// ─────────────────────────────────────────────

// Step 1: Redirect user to Discord authorization
app.get('/auth/discord', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const isMobileRedirect = req.query.return_mobile === '1';
  oauthStore.set(state, { provider: 'discord', created: Date.now(), isMobileRedirect });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.DISCORD_CLIENT_ID || '',
    redirect_uri: `${SERVER_URL}/auth/discord/callback`,
    scope: 'identify',
    state,
    prompt: 'consent',
  });

  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// Step 2: Handle Discord callback
app.get('/auth/discord/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) {
    return sendResultPage(res, false, 'discord', 'Missing code or state');
  }

  const stored = oauthStore.get(state);
  if (!stored) {
    return sendResultPage(res, false, 'discord', 'Invalid or expired state');
  }
  oauthStore.delete(state);

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID || '',
        client_secret: process.env.DISCORD_CLIENT_SECRET || '',
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: `${SERVER_URL}/auth/discord/callback`,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error('Discord token error:', err);
      return sendResult(res, false, 'discord', 'Token exchange failed', null, stored.isMobileRedirect);
    }

    const tokenData = await tokenRes.json();

    // Fetch user profile
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const userData = await userRes.json();

    const avatarUrl = userData.avatar
      ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(userData.discriminator || '0') % 5}.png`;

    // Store in database
    const { id: dbId } = await upsertUser('discord', {
      id: userData.id,
      username: userData.username,
      globalName: userData.global_name,
      avatar: avatarUrl,
    });
    // Cache in Redis (expire in 24h)
    await redis.setEx(`user:discord:${userData.id}`, 86400, JSON.stringify({ dbId, username: userData.username }));
    console.log(`Discord user ${userData.username} saved (db id: ${dbId})`);

    sendResult(res, true, 'discord', null, {
      id: userData.id,
      username: userData.username,
      globalName: userData.global_name,
      avatar: avatarUrl,
    }, stored.isMobileRedirect);
  } catch (err) {
    console.error('Discord OAuth error:', err);
    sendResult(res, false, 'discord', 'OAuth flow failed', null, stored.isMobileRedirect);
  }
});

// Step 3: Check if user is in the Discord guild
app.get('/auth/discord/check-member/:userId', async (req, res) => {
  const { userId } = req.params;
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!guildId || !botToken) {
    return res.json({ member: false, error: 'Guild or bot not configured' });
  }

  try {
    const memberRes = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
      headers: { Authorization: `Bot ${botToken}` },
    });

    if (memberRes.ok) {
      const data = await memberRes.json();
      console.log(`✓ Discord user ${data.user?.username} verified in guild`);
      return res.json({ member: true });
    }

    // Log the actual error for debugging
    const errBody = await memberRes.text();
    console.log(`Discord membership check: ${memberRes.status} for user ${userId} — ${errBody}`);

    // 404 = not in guild, anything else = error
    return res.json({ member: false });
  } catch (err) {
    console.error('Membership check error:', err.message);
    return res.json({ member: false, error: err.message });
  }
});

// ─────────────────────────────────────────────
//  DISCORD LINK — Attach a Discord account to an existing Twitter/score row
// ─────────────────────────────────────────────

app.post('/auth/discord/link', async (req, res) => {
  const { twitterId, discordId, discordUsername } = req.body;
  if (!twitterId || !discordId) return res.status(400).json({ error: 'twitterId and discordId required' });

  try {
    await pool.query(
      `UPDATE scores SET discord_id = $2, discord_username = $3 WHERE twitter_id = $1`,
      [twitterId, discordId, discordUsername || null]
    );

    // Invalidate the user's Redis score cache so next read includes discord info
    await redis.del(`scores:${twitterId}`);

    console.log(`Discord ${discordUsername || discordId} linked to Twitter ${twitterId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Discord link error:', err.message);
    res.status(500).json({ error: 'Failed to link Discord account' });
  }
});

// ─────────────────────────────────────────────
//  SCORES — Save & load box results
// ─────────────────────────────────────────────

// ── Score signing (HMAC) ──
const SCORE_SECRET = process.env.SCORE_SECRET || (process.env.ADMIN_KEY + '-score-hmac');
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Gold point ranges per follower tier (mirrors tierConfig.ts)
const GOLD_TIERS_SERVER = [
  { min: 0,      max: 1000,    ptMin: 0,     ptMax: 1000  },
  { min: 1000,   max: 2000,    ptMin: 1001,  ptMax: 1800  },
  { min: 2000,   max: 3000,    ptMin: 1801,  ptMax: 2400  },
  { min: 3000,   max: 5000,    ptMin: 2401,  ptMax: 3000  },
  { min: 5000,   max: 7500,    ptMin: 3001,  ptMax: 4500  },
  { min: 7500,   max: 10000,   ptMin: 4501,  ptMax: 6000  },
  { min: 10000,  max: 15000,   ptMin: 6001,  ptMax: 8500  },
  { min: 15000,  max: 20000,   ptMin: 8501,  ptMax: 11000 },
  { min: 20000,  max: 25000,   ptMin: 11001, ptMax: 13000 },
  { min: 25000,  max: 30000,   ptMin: 13001, ptMax: 14500 },
  { min: 30000,  max: 35000,   ptMin: 14501, ptMax: 16000 },
  { min: 35000,  max: 40000,   ptMin: 16001, ptMax: 18000 },
  { min: 40000,  max: 45000,   ptMin: 18001, ptMax: 20000 },
  { min: 45000,  max: 50000,   ptMin: 20001, ptMax: 22000 },
  { min: 50000,  max: 60000,   ptMin: 22001, ptMax: 25000 },
  { min: 60000,  max: 70000,   ptMin: 25001, ptMax: 28000 },
  { min: 70000,  max: 80000,   ptMin: 28001, ptMax: 31000 },
  { min: 80000,  max: 90000,   ptMin: 31001, ptMax: 34000 },
  { min: 90000,  max: 100000,  ptMin: 34001, ptMax: 37000 },
  { min: 100000, max: 125000,  ptMin: 37001, ptMax: 42000 },
  { min: 125000, max: 150000,  ptMin: 42001, ptMax: 47000 },
  { min: 150000, max: 200000,  ptMin: 47001, ptMax: 53000 },
  { min: 200000, max: 250000,  ptMin: 53001, ptMax: 60000 },
  { min: 250000, max: Infinity, ptMin: 60001, ptMax: 70000 },
];

const TIER_NAMES_SERVER = {
  bronze: ['Pit Boss Prospect', 'Table Rookie', 'Chip Stacker', 'House Hopeful'],
  silver: ['High Roller', 'VIP Candidate', 'Felt Walker', 'Card Counter'],
  gold:   ['House Legend', 'Whale Status', 'Inner Circle', 'The Chosen'],
};

function srvRandInRange(min, max) {
  return crypto.randomInt(min, max + 1);
}

function getGoldRange(followersCount) {
  const tier = GOLD_TIERS_SERVER.find(t => followersCount >= t.min && followersCount < t.max) || GOLD_TIERS_SERVER[0];
  return [tier.ptMin, tier.ptMax];
}

function rollBoxPoints(type, followersCount) {
  const fc = parseInt(followersCount, 10) || 0;
  let points, tierName;
  if (type === 'gold') {
    const [min, max] = getGoldRange(fc);
    points = srvRandInRange(min, max);
  } else if (type === 'bronze') {
    points = srvRandInRange(100, 500);
  } else if (type === 'silver') {
    points = srvRandInRange(500, 1100);
  } else {
    return null;
  }
  tierName = TIER_NAMES_SERVER[type][crypto.randomInt(TIER_NAMES_SERVER[type].length)];
  return { points, tierName };
}

function generateScoreToken(twitterId, type, points, tierName, issuedAt) {
  const payload = `${twitterId}:${type}:${points}:${tierName}:${issuedAt}`;
  return crypto.createHmac('sha256', SCORE_SECRET).update(payload).digest('hex');
}

function verifyScoreToken(twitterId, type, points, tierName, issuedAt, token) {
  if (!token || !issuedAt) return false;
  if (Date.now() - Number(issuedAt) > TOKEN_TTL_MS) return false;
  const expected = generateScoreToken(twitterId, type, points, tierName, issuedAt);
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(token.slice(0, expected.length), 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

// Valid point ranges for server-side validation
const VALID_RANGES = { bronze: [100, 500], silver: [500, 1100], gold: [0, 70000] };
const MAX_TOTAL_POINTS = 71600; // 500 + 1100 + 70000

function validatePoints(type, pts) {
  const range = VALID_RANGES[type];
  if (!range) return false;
  return Number.isInteger(pts) && pts >= range[0] && pts <= range[1];
}

// Roll server-side points for a box and return a signed token
app.get('/auth/scores/roll', async (req, res) => {
  const { type, twitterId, followersCount } = req.query;
  if (!type || !twitterId) return res.status(400).json({ error: 'type and twitterId required' });
  if (!['bronze', 'silver', 'gold'].includes(type)) return res.status(400).json({ error: 'Invalid box type' });

  const rolled = rollBoxPoints(type, followersCount);
  if (!rolled) return res.status(500).json({ error: 'Roll failed' });

  const issuedAt = Date.now();
  const token = generateScoreToken(twitterId, type, rolled.points, rolled.tierName, issuedAt);

  res.json({ points: rolled.points, tierName: rolled.tierName, token, issuedAt });
});

app.post('/auth/scores', async (req, res) => {
  const { twitterId, username, followersCount, boxes, walletMultiplier, totalPoints } = req.body;
  if (!twitterId) return res.status(400).json({ error: 'twitterId required' });

  // Server-side score validation
  if (totalPoints && (typeof totalPoints !== 'number' || totalPoints > MAX_TOTAL_POINTS || totalPoints < 0)) {
    return res.status(400).json({ error: 'Invalid total points' });
  }
  if (boxes && Array.isArray(boxes)) {
    for (const box of boxes) {
      if (box.points > 0 && !validatePoints(box.type, box.points)) {
        return res.status(400).json({ error: `Invalid ${box.type} points: ${box.points}` });
      }
    }
    // Verify total matches sum
    const computedTotal = boxes.reduce((s, b) => s + (b.points || 0), 0);
    if (totalPoints && Math.abs(computedTotal - totalPoints) > 1) {
      return res.status(400).json({ error: 'Total doesn\'t match box sum' });
    }

    // HMAC token verification
    const boxesWithTokens = boxes.filter(b => b.token && b.issuedAt && b.points > 0);
    const revealedBoxes = boxes.filter(b => b.points > 0);
    if (boxesWithTokens.length > 0) {
      // At least some tokens present — verify every one that has a token
      for (const box of boxesWithTokens) {
        const valid = verifyScoreToken(twitterId, box.type, box.points, box.tierName, box.issuedAt, box.token);
        if (!valid) {
          console.warn(`⚠️  Score forgery attempt: @${username || twitterId} ${box.type}=${box.points} token invalid`);
          return res.status(400).json({ error: 'Score verification failed' });
        }
      }
      if (boxesWithTokens.length < revealedBoxes.length) {
        // Some boxes revealed but missing tokens (mixed session) — log and continue
        console.warn(`Score partial tokens from @${username || twitterId}: ${boxesWithTokens.length}/${revealedBoxes.length} signed`);
      }
    } else if (revealedBoxes.length > 0) {
      // No tokens at all — legacy session (pre-HMAC deploy), accept but log
      console.warn(`Score without tokens (legacy) from @${username || twitterId}`);
    }
  }

  try {
    const bronze = boxes?.find(b => b.type === 'bronze') || {};
    const silver = boxes?.find(b => b.type === 'silver') || {};
    const gold = boxes?.find(b => b.type === 'gold') || {};

    await pool.query(
      `INSERT INTO scores (twitter_id, username, followers_count, bronze_points, bronze_tier, silver_points, silver_tier, gold_points, gold_tier, wallet_multiplier, total_points, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT (twitter_id) DO UPDATE SET
         username = $2, followers_count = $3,
         bronze_points = $4, bronze_tier = $5,
         silver_points = $6, silver_tier = $7,
         gold_points = $8, gold_tier = $9,
         wallet_multiplier = $10, total_points = $11,
         updated_at = NOW()`,
      [
        twitterId, username || null, followersCount || 0,
        bronze.points || 0, bronze.tierName || null,
        silver.points || 0, silver.tierName || null,
        gold.points || 0, gold.tierName || null,
        walletMultiplier || 1, totalPoints || 0
      ]
    );

    await redis.setEx(`scores:${twitterId}`, 86400, JSON.stringify(req.body));
    console.log(`Scores saved for @${username || twitterId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Score save error:', err.message);
    res.status(500).json({ error: 'Failed to save scores' });
  }
});

app.get('/auth/scores/:twitterId', async (req, res) => {
  const { twitterId } = req.params;

  try {
    // Try Redis cache first
    const cached = await redis.get(`scores:${twitterId}`);
    if (cached) return res.json(JSON.parse(cached));

    // Fallback to DB
    const result = await pool.query(
      'SELECT * FROM scores WHERE twitter_id = $1',
      [twitterId]
    );

    if (result.rows.length === 0) return res.json(null);

    const row = result.rows[0];
    const data = {
      twitterId: row.twitter_id,
      username: row.username,
      followersCount: row.followers_count || 0,
      discordId: row.discord_id || null,
      discordUsername: row.discord_username || null,
      hasShared: !!row.shared_at,
      sharePostUrl: row.share_post_url || null,
      boxes: [
        { type: 'bronze', state: 'revealed', points: row.bronze_points, tierName: row.bronze_tier },
        { type: 'silver', state: 'revealed', points: row.silver_points, tierName: row.silver_tier },
        { type: 'gold', state: row.gold_points > 0 ? 'revealed' : 'locked', points: row.gold_points, tierName: row.gold_tier },
      ],
      walletMultiplier: parseFloat(row.wallet_multiplier),
      totalPoints: row.total_points,
    };

    await redis.setEx(`scores:${twitterId}`, 86400, JSON.stringify(data));
    res.json(data);
  } catch (err) {
    console.error('Score load error:', err.message);
    res.status(500).json({ error: 'Failed to load scores' });
  }
});

// ─────────────────────────────────────────────
//  SHARE — Record that a user shared on X
// ─────────────────────────────────────────────

app.post('/auth/share', async (req, res) => {
  const { twitterId, postUrl } = req.body;
  if (!twitterId) return res.status(400).json({ error: 'twitterId required' });

  // Validate: must be a full tweet URL with /username/status/tweetId
  const url = postUrl && typeof postUrl === 'string' ? postUrl.trim().slice(0, 500) : null;
  const tweetUrlRegex = /^https?:\/\/(twitter|x)\.com\/[A-Za-z0-9_]{1,50}\/status\/[0-9]{5,25}(\?.*)?$/;
  if (url && !tweetUrlRegex.test(url)) {
    return res.status(400).json({ error: 'Invalid post URL — must be a full x.com/username/status/id link' });
  }

  try {
    await pool.query(
      `INSERT INTO scores (twitter_id, share_post_url, shared_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (twitter_id) DO UPDATE SET
         share_post_url = COALESCE($2, scores.share_post_url),
         shared_at = COALESCE(scores.shared_at, NOW())`,
      [twitterId, url]
    );
    await redis.del(`scores:${twitterId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Share save error:', err.message);
    res.status(500).json({ error: 'Failed to save share' });
  }
});

// ─────────────────────────────────────────────
//  WALLET — Store connected wallet
// ─────────────────────────────────────────────

app.post('/auth/wallet', async (req, res) => {
  const { address, chain, balance } = req.body;
  if (!address) return res.status(400).json({ error: 'Address required' });

  try {
    await pool.query(
      `INSERT INTO wallets (address, chain, balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (address) DO UPDATE SET chain = $2, balance = $3`,
      [address.toLowerCase(), chain || 'unknown', balance || 0]
    );
    await redis.setEx(`wallet:${address.toLowerCase()}`, 86400, JSON.stringify({ chain, balance }));
    console.log(`Wallet ${address.slice(0, 10)}... saved (${chain})`);
    res.json({ success: true });
  } catch (err) {
    console.error('Wallet save error:', err.message);
    res.status(500).json({ error: 'Failed to save wallet' });
  }
});

// ─────────────────────────────────────────────
//  LEADERBOARD — Public ranked REAL Points
// ─────────────────────────────────────────────

app.get('/auth/leaderboard', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const offset = parseInt(req.query.offset) || 0;

  try {
    // Try cache for page 1
    if (offset === 0 && limit <= 100) {
      const cached = await redis.get('leaderboard:top100');
      if (cached) return res.json(JSON.parse(cached));
    }

    const result = await pool.query(
      `SELECT username, followers_count, total_points,
              bronze_points, silver_points, gold_points,
              FLOOR(total_points * 0.4) AS real_points,
              RANK() OVER (ORDER BY total_points DESC) AS rank
       FROM scores
       WHERE total_points > 0
       ORDER BY total_points DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await pool.query('SELECT COUNT(*) FROM scores WHERE total_points > 0');
    const totalUsers = parseInt(countResult.rows[0].count);

    const data = {
      users: result.rows.map(r => ({
        rank: parseInt(r.rank),
        username: r.username,
        followersCount: r.followers_count || 0,
        totalPoints: r.total_points,
        realPoints: parseInt(r.real_points),
        bronzePoints: r.bronze_points,
        silverPoints: r.silver_points,
        goldPoints: r.gold_points,
      })),
      totalUsers,
      limit,
      offset,
    };

    // Cache first page for 2 minutes
    if (offset === 0 && limit <= 100) {
      await redis.setEx('leaderboard:top100', 120, JSON.stringify(data));
    }

    res.json(data);
  } catch (err) {
    console.error('Leaderboard error:', err.message);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// ─────────────────────────────────────────────
//  REFERRAL SYSTEM — Generate codes, track referrals, award bonuses
// ─────────────────────────────────────────────

const REFERRAL_BONUS_REFERRER = 250;  // Points awarded to referrer per successful referral
const REFERRAL_BONUS_REFERRED = 150;  // Points awarded to the referred user
const MAX_REFERRAL_BONUS = 25000;     // Cap total referral bonus per user

// Generate a unique referral code from twitter_id
function generateReferralCode(twitterId) {
  const hash = crypto.createHash('sha256').update(twitterId + 'realbet-ref-salt').digest('hex');
  return 'RB' + hash.substring(0, 6).toUpperCase();
}

// Get or create referral code for a user + stats
app.get('/auth/referral/:twitterId', async (req, res) => {
  const { twitterId } = req.params;
  if (!twitterId) return res.status(400).json({ error: 'twitterId required' });

  try {
    // Try cache first
    const cached = await redis.get(`referral:${twitterId}`);
    if (cached) return res.json(JSON.parse(cached));

    // Check if user already has a referral code
    let result = await pool.query(
      'SELECT referral_code, referral_bonus_points, referral_count, referred_by FROM scores WHERE twitter_id = $1',
      [twitterId]
    );

    let referralCode;
    let referralBonusPoints = 0;
    let referralCount = 0;
    let referredBy = null;

    if (result.rows.length > 0 && result.rows[0].referral_code) {
      referralCode = result.rows[0].referral_code;
      referralBonusPoints = result.rows[0].referral_bonus_points || 0;
      referralCount = result.rows[0].referral_count || 0;
      referredBy = result.rows[0].referred_by || null;
    } else if (result.rows.length > 0) {
      // Row exists but no referral code — generate and store
      referralCode = generateReferralCode(twitterId);
      await pool.query(
        `UPDATE scores SET referral_code = $2 WHERE twitter_id = $1`,
        [twitterId, referralCode]
      );
    } else {
      // No scores row at all — create one with just the referral code
      referralCode = generateReferralCode(twitterId);
      await pool.query(
        `INSERT INTO scores (twitter_id, referral_code) VALUES ($1, $2) ON CONFLICT (twitter_id) DO UPDATE SET referral_code = $2`,
        [twitterId, referralCode]
      );
    }

    // Get list of referred users
    const referrals = await pool.query(
      `SELECT r.referred_twitter_id, r.referrer_bonus, r.status, r.created_at, r.converted_at,
              s.username, s.total_points
       FROM referrals r
       LEFT JOIN scores s ON s.twitter_id = r.referred_twitter_id
       WHERE r.referrer_twitter_id = $1
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [twitterId]
    );

    const data = {
      referralCode,
      referralBonusPoints,
      referralCount,
      referredBy,
      maxBonus: MAX_REFERRAL_BONUS,
      bonusPerReferral: REFERRAL_BONUS_REFERRER,
      referredBonus: REFERRAL_BONUS_REFERRED,
      referrals: referrals.rows.map(r => ({
        username: r.username || 'anonymous',
        bonus: r.referrer_bonus,
        status: r.status,
        totalPoints: r.total_points || 0,
        createdAt: r.created_at,
        convertedAt: r.converted_at,
      })),
    };

    // Cache for 5 minutes
    await redis.setEx(`referral:${twitterId}`, 300, JSON.stringify(data));
    res.json(data);
  } catch (err) {
    console.error('Referral fetch error:', err.message);
    res.status(500).json({ error: 'Failed to load referral data' });
  }
});

// Apply a referral code — new users only (first sign-up)
app.post('/auth/referral/apply', async (req, res) => {
  const { twitterId, referralCode, username } = req.body;
  if (!twitterId || !referralCode) return res.status(400).json({ error: 'twitterId and referralCode required' });

  try {
    // Block existing users — only allow referral on very first sign-up
    const userRecord = await pool.query(
      'SELECT login_count FROM users WHERE provider = $1 AND provider_id = $2',
      ['twitter', twitterId]
    );
    if (userRecord.rows.length > 0 && userRecord.rows[0].login_count > 1) {
      return res.status(400).json({ error: 'Referral codes can only be used on your first sign-up' });
    }

    // Check if user already used a referral code
    const existing = await pool.query(
      'SELECT referred_by FROM scores WHERE twitter_id = $1',
      [twitterId]
    );
    if (existing.rows.length > 0 && existing.rows[0].referred_by) {
      return res.status(400).json({ error: 'Already used a referral code' });
    }

    // Look up the referrer by their code
    const referrer = await pool.query(
      'SELECT twitter_id, username, referral_bonus_points, referral_count FROM scores WHERE referral_code = $1',
      [referralCode.toUpperCase()]
    );
    if (referrer.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }

    const referrerRow = referrer.rows[0];

    // Can't refer yourself
    if (referrerRow.twitter_id === twitterId) {
      return res.status(400).json({ error: 'Cannot use your own referral code' });
    }

    // Check referrer hasn't hit the bonus cap
    const currentBonus = referrerRow.referral_bonus_points || 0;
    const referrerBonus = Math.min(REFERRAL_BONUS_REFERRER, MAX_REFERRAL_BONUS - currentBonus);

    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert referral record
      await client.query(
        `INSERT INTO referrals (referrer_twitter_id, referred_twitter_id, referral_code, referrer_bonus, referred_bonus, status, converted_at)
         VALUES ($1, $2, $3, $4, $5, 'converted', NOW())
         ON CONFLICT (referred_twitter_id) DO NOTHING`,
        [referrerRow.twitter_id, twitterId, referralCode.toUpperCase(), referrerBonus, REFERRAL_BONUS_REFERRED]
      );

      // Update referrer: add bonus points and increment count
      if (referrerBonus > 0) {
        await client.query(
          `UPDATE scores SET
            referral_bonus_points = COALESCE(referral_bonus_points, 0) + $2,
            referral_count = COALESCE(referral_count, 0) + 1,
            total_points = total_points + $2,
            updated_at = NOW()
           WHERE twitter_id = $1`,
          [referrerRow.twitter_id, referrerBonus]
        );
      } else {
        await client.query(
          `UPDATE scores SET
            referral_count = COALESCE(referral_count, 0) + 1,
            updated_at = NOW()
           WHERE twitter_id = $1`,
          [referrerRow.twitter_id]
        );
      }

      // Update referred user: mark who referred them + add their bonus
      await client.query(
        `INSERT INTO scores (twitter_id, username, referred_by, referral_bonus_points, total_points, referral_code)
         VALUES ($1, $4, $2, $3, $3, $5)
         ON CONFLICT (twitter_id) DO UPDATE SET
           referred_by = $2,
           referral_bonus_points = COALESCE(scores.referral_bonus_points, 0) + $3,
           total_points = scores.total_points + $3,
           updated_at = NOW()`,
        [twitterId, referrerRow.twitter_id, REFERRAL_BONUS_REFERRED, username || null, generateReferralCode(twitterId)]
      );

      await client.query('COMMIT');

      // Invalidate caches
      await redis.del(`referral:${referrerRow.twitter_id}`);
      await redis.del(`referral:${twitterId}`);
      await redis.del(`scores:${referrerRow.twitter_id}`);
      await redis.del(`scores:${twitterId}`);
      await redis.del('leaderboard:top100');

      console.log(`Referral: @${username || twitterId} used code ${referralCode} from @${referrerRow.username}. Referrer bonus: ${referrerBonus}, Referred bonus: ${REFERRAL_BONUS_REFERRED}`);

      res.json({
        success: true,
        referrerBonus,
        referredBonus: REFERRAL_BONUS_REFERRED,
        referrerUsername: referrerRow.username,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Referral apply error:', err.message);
    // Avoid double-sending — check if response was already sent
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to apply referral code' });
    }
  }
});

// Validate a referral code (lightweight check)
app.get('/auth/referral/validate/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const result = await pool.query(
      'SELECT username FROM scores WHERE referral_code = $1',
      [code.toUpperCase()]
    );
    if (result.rows.length === 0) {
      return res.json({ valid: false });
    }
    res.json({ valid: true, referrerUsername: result.rows[0].username });
  } catch (err) {
    console.error('Referral validate error:', err.message);
    res.json({ valid: false });
  }
});

// ─────────────────────────────────────────────
//  ADMIN — Protected dashboard endpoints
// ─────────────────────────────────────────────

const ADMIN_KEY = process.env.ADMIN_KEY || 'realbet-admin-2026';

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Admin: Overview stats
app.get('/admin/stats', requireAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(*) AS total_users,
        SUM(total_points) AS total_points_issued,
        FLOOR(SUM(total_points) * 0.03) AS total_dollar_headline,
        FLOOR(SUM(total_points * 0.30 / 20)) AS total_freeplay_exposure,
        FLOOR(SUM(total_points * 0.30 / 20)) AS total_deposit_match_exposure,
        FLOOR(SUM(total_points * 0.40)) AS total_real_points,
        AVG(total_points)::INTEGER AS avg_points,
        MAX(total_points) AS max_points,
        AVG(followers_count)::INTEGER AS avg_followers,
        COUNT(CASE WHEN gold_points > 0 THEN 1 END) AS completed_gold,
        COUNT(CASE WHEN total_points > 0 THEN 1 END) AS active_users,
        COUNT(CASE WHEN shared_at IS NOT NULL THEN 1 END) AS shared_count
      FROM scores
    `);

    const tierDist = await pool.query(`
      SELECT
        CASE
          WHEN followers_count < 1000 THEN '<1K'
          WHEN followers_count < 5000 THEN '1K-5K'
          WHEN followers_count < 10000 THEN '5K-10K'
          WHEN followers_count < 25000 THEN '10K-25K'
          WHEN followers_count < 50000 THEN '25K-50K'
          WHEN followers_count < 100000 THEN '50K-100K'
          WHEN followers_count < 250000 THEN '100K-250K'
          ELSE '250K+'
        END AS tier,
        COUNT(*) AS count,
        SUM(total_points) AS total_pts,
        FLOOR(SUM(total_points * 0.30 / 20)) AS cash_exposure
      FROM scores
      WHERE total_points > 0
      GROUP BY tier
      ORDER BY MIN(followers_count)
    `);

    res.json({
      overview: stats.rows[0],
      tierDistribution: tierDist.rows,
    });
  } catch (err) {
    console.error('Admin stats error:', err.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// Admin: All users (paginated, sortable)
app.get('/admin/users', requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const sort = req.query.sort || 'total_points';
  const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
  const search = req.query.search || '';

  const allowedSorts = ['total_points', 'followers_count', 'username', 'created_at', 'gold_points'];
  const sortCol = allowedSorts.includes(sort) ? sort : 'total_points';

  try {
    let query, countQuery, params, countParams;

    if (search) {
      query = `SELECT * FROM scores WHERE username ILIKE $3 ORDER BY ${sortCol} ${order} LIMIT $1 OFFSET $2`;
      countQuery = `SELECT COUNT(*) FROM scores WHERE username ILIKE $1`;
      params = [limit, offset, `%${search}%`];
      countParams = [`%${search}%`];
    } else {
      query = `SELECT * FROM scores ORDER BY ${sortCol} ${order} LIMIT $1 OFFSET $2`;
      countQuery = `SELECT COUNT(*) FROM scores`;
      params = [limit, offset];
      countParams = [];
    }

    const [result, countResult] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams),
    ]);

    res.json({
      users: result.rows.map(r => ({
        twitterId: r.twitter_id,
        username: r.username,
        followersCount: r.followers_count || 0,
        bronzePoints: r.bronze_points,
        silverPoints: r.silver_points,
        goldPoints: r.gold_points,
        totalPoints: r.total_points,
        realPoints: Math.floor(r.total_points * 0.4),
        cashExposure: Math.round((r.total_points * 0.6 / 20) * 100) / 100,
        hasShared: !!r.shared_at,
        sharePostUrl: r.share_post_url || null,
        sharedAt: r.shared_at || null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total: parseInt(countResult.rows[0].count),
      limit,
      offset,
    });
  } catch (err) {
    console.error('Admin users error:', err.message);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// Sanitize CSV cell to prevent formula injection
function csvSafe(val) {
  if (val == null) return '';
  const str = String(val);
  // Prefix formula-triggering characters with a single quote
  if (/^[=+\-@\t\r]/.test(str)) return `'${str}`;
  // Wrap in quotes if contains comma, quote, or newline
  if (/[,"\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

// Admin: Reset database (truncate all tables)
app.post('/admin/reset-db', requireAdmin, async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE referrals, scores, wallets, users RESTART IDENTITY CASCADE');
    // Clear Redis caches
    if (redis) {
      try {
        await redis.del('leaderboard:top100');
        // Also clear any lingering score/user/referral keys
        const scoreKeys = await redis.keys('scores:*');
        const userKeys = await redis.keys('user:*');
        const refKeys = await redis.keys('referral:*');
        const allKeys = [...scoreKeys, ...userKeys, ...refKeys];
        if (allKeys.length > 0) await redis.del(allKeys);
      } catch {}
    }
    console.log('[ADMIN] Database reset performed');
    res.json({ success: true, message: 'All tables truncated' });
  } catch (err) {
    console.error('Reset DB error:', err.message);
    res.status(500).json({ error: 'Failed to reset database' });
  }
});

// Admin: Export all data as CSV (uses header auth, not query param)
app.get('/admin/export', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT twitter_id, username, followers_count, bronze_points, silver_points, gold_points,
              total_points, FLOOR(total_points * 0.4) AS real_points,
              ROUND(total_points * 0.30 / 20, 2) AS freeplay_dollars,
              ROUND(total_points * 0.30 / 20, 2) AS deposit_match_dollars,
              share_post_url, shared_at,
              created_at, updated_at
       FROM scores ORDER BY total_points DESC`
    );

    const header = 'twitter_id,username,followers,bronze_pts,silver_pts,gold_pts,total_pts,real_pts,freeplay_$,deposit_match_$,shared,share_post_url,created,updated\n';
    const rows = result.rows.map(r =>
      [r.twitter_id, csvSafe(r.username), r.followers_count, r.bronze_points, r.silver_points, r.gold_points, r.total_points, r.real_points, r.freeplay_dollars, r.deposit_match_dollars, r.shared_at ? 'yes' : 'no', csvSafe(r.share_post_url), r.created_at, r.updated_at].join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=realbet-season1-export.csv');
    res.send(header + rows);
  } catch (err) {
    console.error('Export error:', err.message);
    res.status(500).json({ error: 'Failed to export' });
  }
});

// Admin: Referral stats & data
app.get('/admin/referrals', requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const search = req.query.search || '';

  try {
    // Overview stats
    const overviewQuery = await pool.query(`
      SELECT
        COUNT(*) AS total_referrals,
        COUNT(CASE WHEN status = 'converted' THEN 1 END) AS converted_referrals,
        COALESCE(SUM(referrer_bonus), 0) AS total_referrer_bonus_issued,
        COALESCE(SUM(referred_bonus), 0) AS total_referred_bonus_issued,
        COUNT(DISTINCT referrer_twitter_id) AS unique_referrers
      FROM referrals
    `);

    // Top referrers
    const topReferrers = await pool.query(`
      SELECT s.username, s.twitter_id, s.referral_code, s.referral_count, s.referral_bonus_points,
             s.total_points, s.followers_count
      FROM scores s
      WHERE s.referral_count > 0
      ORDER BY s.referral_count DESC
      LIMIT 20
    `);

    // All referrals (paginated)
    let refQuery, countQuery, params, countParams;
    if (search) {
      refQuery = `
        SELECT r.*, rs.username AS referrer_username, ds.username AS referred_username
        FROM referrals r
        LEFT JOIN scores rs ON rs.twitter_id = r.referrer_twitter_id
        LEFT JOIN scores ds ON ds.twitter_id = r.referred_twitter_id
        WHERE rs.username ILIKE $3 OR ds.username ILIKE $3 OR r.referral_code ILIKE $3
        ORDER BY r.created_at DESC
        LIMIT $1 OFFSET $2
      `;
      countQuery = `
        SELECT COUNT(*) FROM referrals r
        LEFT JOIN scores rs ON rs.twitter_id = r.referrer_twitter_id
        LEFT JOIN scores ds ON ds.twitter_id = r.referred_twitter_id
        WHERE rs.username ILIKE $1 OR ds.username ILIKE $1 OR r.referral_code ILIKE $1
      `;
      params = [limit, offset, `%${search}%`];
      countParams = [`%${search}%`];
    } else {
      refQuery = `
        SELECT r.*, rs.username AS referrer_username, ds.username AS referred_username
        FROM referrals r
        LEFT JOIN scores rs ON rs.twitter_id = r.referrer_twitter_id
        LEFT JOIN scores ds ON ds.twitter_id = r.referred_twitter_id
        ORDER BY r.created_at DESC
        LIMIT $1 OFFSET $2
      `;
      countQuery = `SELECT COUNT(*) FROM referrals`;
      params = [limit, offset];
      countParams = [];
    }

    const [refResult, refCountResult] = await Promise.all([
      pool.query(refQuery, params),
      pool.query(countQuery, countParams),
    ]);

    res.json({
      overview: overviewQuery.rows[0],
      topReferrers: topReferrers.rows.map(r => ({
        username: r.username,
        twitterId: r.twitter_id,
        referralCode: r.referral_code,
        referralCount: r.referral_count,
        referralBonusPoints: r.referral_bonus_points,
        totalPoints: r.total_points,
        followersCount: r.followers_count,
      })),
      referrals: refResult.rows.map(r => ({
        referrerUsername: r.referrer_username || r.referrer_twitter_id,
        referredUsername: r.referred_username || r.referred_twitter_id,
        referralCode: r.referral_code,
        referrerBonus: r.referrer_bonus,
        referredBonus: r.referred_bonus,
        status: r.status,
        createdAt: r.created_at,
        convertedAt: r.converted_at,
      })),
      total: parseInt(refCountResult.rows[0].count),
      limit,
      offset,
    });
  } catch (err) {
    console.error('Admin referrals error:', err.message);
    res.status(500).json({ error: 'Failed to load referral data' });
  }
});

// ─────────────────────────────────────────────
//  Result page — sends postMessage to opener & closes popup
// ─────────────────────────────────────────────

// Unified result dispatcher: popup (desktop) vs full-page redirect (mobile)
function sendResult(res, success, provider, error, user, isMobileRedirect) {
  if (isMobileRedirect) {
    const payload = { success, provider, error: error || null, user: user || null };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return res.redirect(`${CLIENT_URL}?ob=${encoded}`);
  }
  sendResultPage(res, success, provider, error, user);
}

function sendResultPage(res, success, provider, error = null, user = null) {
  const payload = { success, provider, error, user };
  // Escape </script> and <!-- sequences to prevent XSS in inline script blocks
  const json = JSON.stringify(payload).replace(/<\//g, '<\/').replace(/<!--/g, '<\!--');
  console.log(`[OAuth Result] ${provider} success=${success} user=${user?.username || 'n/a'} error=${error || 'none'}`);

  // Serve inline HTML that sends postMessage to opener (cross-origin safe)
  // Falls back to redirect to CLIENT_URL callback page if opener is missing
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head><title>Authenticating...</title></head>
<body style="background:#0D0D0D;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center">
    <p id="msg">${success ? 'Connected!' : 'Connection failed'}</p>
    <p style="opacity:0.5;font-size:14px">This window will close automatically...</p>
  </div>
  <script>
    var data = ${json};
    console.log('[OAuthCallback] Inline page loaded, data:', data);

    var sent = false;

    // Channel 1: postMessage to opener (works cross-origin)
    if (window.opener) {
      try {
        window.opener.postMessage(data, '${CLIENT_URL}');
        sent = true;
        console.log('[OAuthCallback] postMessage sent to opener');
      } catch(e) {
        console.error('[OAuthCallback] postMessage failed:', e);
      }
    } else {
      console.warn('[OAuthCallback] No window.opener');
    }

    // Channel 2: Also try localStorage on CLIENT origin via hidden iframe
    // (fallback if postMessage is blocked)
    try {
      var iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = '${CLIENT_URL}/oauth-callback.html?data=' + encodeURIComponent(JSON.stringify(data));
      document.body.appendChild(iframe);
      console.log('[OAuthCallback] Fallback iframe created');
    } catch(e) {
      console.log('[OAuthCallback] Iframe fallback failed:', e);
    }

    setTimeout(function() { window.close(); }, 2500);
  </script>
</body>
</html>`);
}

// ── Cleanup expired states every 5 minutes ──
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, val] of oauthStore) {
    if (val.created < cutoff) oauthStore.delete(key);
  }
}, 5 * 60 * 1000);

app.listen(PORT, async () => {
  await initDB();
  await initRedis();
  console.log(`OAuth server running on http://localhost:${PORT}`);
});
