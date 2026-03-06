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
import { existsSync, readFileSync } from 'fs';

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
  'https://claim.realbet.io',
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
// Use a larger limit for share-image uploads (base64 PNG from 2400×1256 canvas can reach 4-5MB)
app.use('/auth/share-image', express.json({ limit: '6mb' }));
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
app.post('/auth/scores', generalLimiter);
app.use('/auth/twitter', twitterAuthLimiter);
app.use('/auth/discord', discordAuthLimiter);
app.use('/admin', adminLimiter);
const referralValidateLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use('/auth/referral/validate', referralValidateLimiter);

// ─────────────────────────────────────────────
//  DATABASE SETUP
// ─────────────────────────────────────────────

// Fail fast if critical secrets are missing — never run with defaults
const REQUIRED_ENV = ['DATABASE_URL', 'REDIS_URL', 'ADMIN_KEY', 'BONUS_API_SECRET',
  'TWITTER_CLIENT_ID', 'TWITTER_CLIENT_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required env var ${key}. Set it before starting.`);
    process.exit(1);
  }
}

// PostgreSQL
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
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
    // Claim flow columns (hub connect + $REAL grant)
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS share_image TEXT`);
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS account_linked BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ`);
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS hub_bonus_id VARCHAR(100)`);
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS claim_amount NUMERIC`);
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS hub_real_bonus_id VARCHAR(100)`);
    await client.query(`ALTER TABLE scores ADD COLUMN IF NOT EXISTS claim_real_amount NUMERIC`);

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
// ── In-memory store for Hub connect state (bind callback to initiating user) ──
const hubConnectStateStore = new Map();

// ─────────────────────────────────────────────
//  HUB API — Connect + Bonus helpers
// ─────────────────────────────────────────────

const BONUS_API_SECRET = process.env.BONUS_API_SECRET || '';
const HUB_API_BASE = process.env.HUB_API_BASE || 'https://hub.realbet.io';

/** Generate HMAC headers for Hub API requests */
function signHubRequest(body = '') {
  const ts = Math.floor(Date.now() / 1000).toString();
  const message = `${ts}.${body}`;
  const sig = crypto.createHmac('sha256', BONUS_API_SECRET).update(message).digest('hex');
  return { ts, sig };
}

/** Verify HMAC signature from hub connect callback */
function verifyHubCallback(twitterHandle, pfpUrl, ts, sig) {
  const message = `${ts}.pfp_url=${pfpUrl}&twitter_handle=${twitterHandle}`;
  const expected = crypto.createHmac('sha256', BONUS_API_SECRET).update(message).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(ts, 10)) > 300) return false;
  return true;
}

/** Grant bonus via Hub API (type: 'points' or 'real') */
async function grantHubBonus(twitterHandle, amount, type = 'points', metadata = {}) {
  const intAmount = Math.round(amount);
  if (intAmount <= 0) {
    return { ok: false, status: 400, data: { error: 'Amount must be greater than 0' } };
  }
  const payload = {
    twitter_handle: twitterHandle,
    type,
    amount: intAmount,
    metadata,
  };
  const body = JSON.stringify(payload);
  const { ts, sig } = signHubRequest(body);
  console.log(`Hub grant request: POST ${HUB_API_BASE}/api/bonuses`, payload);
  const res = await fetch(`${HUB_API_BASE}/api/bonuses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Timestamp': ts, 'X-Signature': sig },
    body,
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

/** Grant hub points (backward-compatible wrapper) */
async function grantHubPoints(twitterHandle, points) {
  return grantHubBonus(twitterHandle, points, 'points');
}

/** Grant $REAL bonus via Hub API (requires linked casino account) */
async function grantHubReal(twitterHandle, realDollars, metadata = {}) {
  return grantHubBonus(twitterHandle, realDollars, 'real', metadata);
}

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

    // Fetch user profile (with retry for transient Twitter API errors)
    let userRes, userData;
    for (let attempt = 0; attempt < 3; attempt++) {
      userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,username,public_metrics', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      userData = await userRes.json();
      if (userRes.ok && userData.data) break;
      if (userRes.status >= 500 && attempt < 2) {
        console.warn(`Twitter API ${userRes.status} — retrying in ${(attempt + 1)}s (attempt ${attempt + 1}/3)`);
        await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
      }
    }
    if (!userRes.ok || !userData.data) {
      console.error('Twitter user fetch failed:', userRes.status, JSON.stringify(userData));
      return sendResult(res, false, 'twitter', `User fetch failed (${userRes.status}): ${userData?.detail || userData?.title || 'Unknown error'}`, null, stored.isMobileRedirect);
    }
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

// Step 3: Check if user is in the Discord guild (requires valid twitterId to prevent bulk enumeration)
app.get('/auth/discord/check-member/:userId', async (req, res) => {
  const { twitterId } = req.query;
  if (!twitterId) return res.status(400).json({ member: false, error: 'twitterId required' });
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
const SCORE_SECRET = process.env.SCORE_SECRET || process.env.ADMIN_KEY;
const TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Gold point ranges per follower tier.
// Prefer server-local tierData.json (works when Railway root is /server),
// then fall back to monorepo shared/tierData.json for local dev.
const TIER_DATA_PATHS = [
  join(__dirname, 'tierData.json'),
  join(__dirname, '..', 'shared', 'tierData.json'),
];

const tierDataPath = TIER_DATA_PATHS.find(p => existsSync(p));
if (!tierDataPath) {
  throw new Error(`Missing tier data file. Tried: ${TIER_DATA_PATHS.join(', ')}`);
}

const _rawTiers = JSON.parse(readFileSync(tierDataPath, 'utf8'));
const GOLD_TIERS_SERVER = _rawTiers.map(t => ({
  min: t.minFollowers,
  max: t.maxFollowers === 999999999 ? Infinity : t.maxFollowers,
  ptMin: t.goldPointsMin,
  ptMax: t.goldPointsMax,
  maxFreePlay: t.maxFreePlay,
}));

/** Calculate the $REAL freeplay amount for a user (60% of power score / 20, capped per tier) */
function calculateFreePlayDollars(totalPoints, followersCount) {
  const tier = GOLD_TIERS_SERVER.find(t => followersCount >= t.min && followersCount < t.max) || GOLD_TIERS_SERVER[0];
  const freePlayPts = Math.floor(totalPoints * 0.60);
  const uncapped = Math.round((freePlayPts / 20) * 100) / 100;
  return Math.min(uncapped, tier.maxFreePlay);
}

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

function getGoldTier(followersCount) {
  return GOLD_TIERS_SERVER.find(t => followersCount >= t.min && followersCount < t.max) || GOLD_TIERS_SERVER[0];
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
const VALID_RANGES = { bronze: [100, 500], silver: [500, 1100], gold: [1, 70000] };
const MAX_TASK_BONUS = 1000; // 500 per task × 2 tasks
const MAX_TOTAL_POINTS = 71600 + MAX_TASK_BONUS; // 500 + 1100 + 70000 + task bonuses

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

  // Cap gold points by remaining tier allowance so 60/40 split stays accountable.
  if (type === 'gold') {
    try {
      const rawTaskBonus = parseInt(req.query.taskBonus, 10) || 0;
      const taskBonus = Math.max(0, Math.min(MAX_TASK_BONUS, rawTaskBonus));
      // #1: Always use DB followers_count — never trust the client-supplied value.
      // Check scores table first, then fall back to users table (followers_count
      // may not be in scores yet if the first saveScoresToDB hasn't run).
      const result = await pool.query(
        'SELECT bronze_points, silver_points, followers_count FROM scores WHERE twitter_id = $1',
        [twitterId]
      );
      let fc = result.rows[0]?.followers_count || 0;
      if (fc === 0) {
        const userRow = await pool.query(
          'SELECT followers_count FROM users WHERE provider_id = $1 AND provider = $2',
          [twitterId, 'twitter']
        );
        fc = userRow.rows[0]?.followers_count || 0;
      }
      const tier = getGoldTier(fc);
      const bronzePoints = result.rows[0]?.bronze_points || 0;
      const silverPoints = result.rows[0]?.silver_points || 0;
      const basePoints = bronzePoints + silverPoints;

      // Keep power score under the tier's effective cap (derived from maxFreePlay).
      const tierMaxPowerScore = Math.floor((tier.maxFreePlay * 20) / 0.6);
      const remainingGoldCap = Math.max(1, tierMaxPowerScore - basePoints - taskBonus);
      const cappedMax = Math.max(1, Math.min(70_000, remainingGoldCap));
      // Enforce tier's goldPointsMin as floor; if remaining cap is below it, clamp to cappedMax.
      const cappedMin = Math.min(tier.ptMin, cappedMax);
      const points = srvRandInRange(cappedMin, cappedMax);
      const tierName = TIER_NAMES_SERVER.gold[crypto.randomInt(TIER_NAMES_SERVER.gold.length)];

      const issuedAt = Date.now();
      const token = generateScoreToken(twitterId, type, points, tierName, issuedAt);
      return res.json({ points, tierName, token, issuedAt });
    } catch (err) {
      console.error('Gold roll cap error:', err.message);
      return res.status(500).json({ error: 'Gold roll failed' });
    }
  }

  const rolled = rollBoxPoints(type, followersCount);
  if (!rolled) return res.status(500).json({ error: 'Roll failed' });

  const issuedAt = Date.now();
  const token = generateScoreToken(twitterId, type, rolled.points, rolled.tierName, issuedAt);

  res.json({ points: rolled.points, tierName: rolled.tierName, token, issuedAt });
});

app.post('/auth/scores', async (req, res) => {
  const { twitterId, username, boxes, walletMultiplier, totalPoints } = req.body;
  const followersCount = Math.max(0, Math.min(10_000_000, Math.floor(Number(req.body.followersCount) || 0)));
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
    // Verify total matches sum (including task bonuses)
    const computedTotal = boxes.reduce((s, b) => s + (b.points || 0), 0);
    const taskBonus = Number(req.body.taskBonus) || 0;
    if (taskBonus < 0 || taskBonus > MAX_TASK_BONUS || taskBonus % 500 !== 0) {
      return res.status(400).json({ error: 'Invalid task bonus' });
    }
    if (totalPoints && Math.abs((computedTotal + taskBonus) - totalPoints) > 1) {
      return res.status(400).json({ error: 'Total doesn\'t match box sum + task bonus' });
    }

    // #2: HMAC token verification.
    // If a token IS present it must be valid (blocks forgery).
    // If a token is absent the score is still accepted provided it passes
    // range validation above — this covers pre-token legacy sessions.
    const revealedBoxes = boxes.filter(b => b.points > 0);
    for (const box of revealedBoxes) {
      if (box.token && box.issuedAt) {
        const valid = verifyScoreToken(twitterId, box.type, box.points, box.tierName, box.issuedAt, box.token);
        if (!valid) {
          console.warn(`⚠️  Score forgery attempt: @${username || twitterId} ${box.type}=${box.points} token invalid`);
          return res.status(400).json({ error: 'Score verification failed' });
        }
      } else {
        // No token — log for monitoring but allow if range check passed above.
        console.info(`ℹ️  Score accepted without token (legacy): @${username || twitterId} ${box.type}=${box.points}`);
      }
    }
    // #5: Validate gold against its tier floor using DB followers_count.
    const goldBox = boxes.find(b => b.type === 'gold');
    if (goldBox && goldBox.points > 0) {
      try {
        const fcRow = await pool.query('SELECT followers_count FROM scores WHERE twitter_id = $1', [twitterId]);
        let fc = fcRow.rows[0]?.followers_count || 0;
        if (fc === 0) {
          const userRow = await pool.query(
            'SELECT followers_count FROM users WHERE provider_id = $1 AND provider = $2',
            [twitterId, 'twitter']
          );
          fc = userRow.rows[0]?.followers_count || 0;
        }
        const tier = getGoldTier(fc);
        if (goldBox.points < tier.ptMin || goldBox.points > tier.ptMax) {
          console.warn(`⚠️  Gold out of tier range: @${username || twitterId} gold=${goldBox.points} tier ${tier.ptMin}-${tier.ptMax} (${fc} followers)`);
          return res.status(400).json({ error: 'Gold points out of tier range' });
        }
      } catch (e) {
        console.error('Gold tier validation error:', e.message);
      }
    }
  }

  try {
    const bronze = boxes?.find(b => b.type === 'bronze') || {};
    const silver = boxes?.find(b => b.type === 'silver') || {};
    const gold = boxes?.find(b => b.type === 'gold') || {};

    // #4: Never downgrade existing points — only update a box if the new value is higher.
    await pool.query(
      `INSERT INTO scores (twitter_id, username, followers_count, bronze_points, bronze_tier, silver_points, silver_tier, gold_points, gold_tier, wallet_multiplier, total_points, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT (twitter_id) DO UPDATE SET
         username = $2, followers_count = $3,
         bronze_points = GREATEST(scores.bronze_points, $4), bronze_tier = CASE WHEN $4 > scores.bronze_points THEN $5 ELSE scores.bronze_tier END,
         silver_points = GREATEST(scores.silver_points, $6), silver_tier = CASE WHEN $6 > scores.silver_points THEN $7 ELSE scores.silver_tier END,
         gold_points   = GREATEST(scores.gold_points,   $8), gold_tier   = CASE WHEN $8 > scores.gold_points   THEN $9 ELSE scores.gold_tier   END,
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

    const cacheData = {
      twitterId,
      username: username || null,
      followersCount: followersCount || 0,
      discordId: null,
      discordUsername: null,
      hasShared: false,
      sharePostUrl: null,
      accountLinked: false,
      claimedAt: null,
      claimAmount: null,
      referralBonusPoints: 0,
      boxes: [
        { type: 'bronze', state: 'revealed', points: bronze.points || 0, tierName: bronze.tierName || null },
        { type: 'silver', state: 'revealed', points: silver.points || 0, tierName: silver.tierName || null },
        { type: 'gold', state: (gold.points || 0) > 0 ? 'revealed' : 'locked', points: gold.points || 0, tierName: gold.tierName || null },
      ],
      walletMultiplier: walletMultiplier || 1,
      taskBonus: Number(req.body.taskBonus) || 0,
      totalPoints: totalPoints || 0,
    };
    await redis.setEx(`scores:${twitterId}`, 86400, JSON.stringify(cacheData));
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
      accountLinked: !!row.account_linked,
      claimedAt: row.claimed_at || null,
      claimAmount: row.claim_amount ? parseFloat(row.claim_amount) : null,
      boxes: [
        { type: 'bronze', state: 'revealed', points: row.bronze_points, tierName: row.bronze_tier },
        { type: 'silver', state: 'revealed', points: row.silver_points, tierName: row.silver_tier },
        { type: 'gold', state: row.gold_points > 0 ? 'revealed' : 'locked', points: row.gold_points, tierName: row.gold_tier },
      ],
      walletMultiplier: parseFloat(row.wallet_multiplier),
      referralBonusPoints: parseInt(row.referral_bonus_points, 10) || 0,
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
//  CLAIM — Hub Connect callback + $REAL grant
// ─────────────────────────────────────────────

const claimLimiter = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });
app.use('/auth/connect', claimLimiter);
app.use('/auth/claim', claimLimiter);

/**
 * GET /auth/hub-connect
 * Client redirects here → server builds return_url → redirects to hub.realbet.io/connect
 * Hub requires both return_url AND twitter_handle params.
 */
app.get('/auth/hub-connect', (req, res) => {
  const { uid, twitter_handle } = req.query;
  if (!uid || !twitter_handle) {
    return res.status(400).send('uid and twitter_handle are required');
  }

  const state = crypto.randomBytes(24).toString('hex');
  hubConnectStateStore.set(state, {
    uid: String(uid),
    twitterHandle: String(twitter_handle).toLowerCase(),
    created: Date.now(),
  });

  // Build our callback URL — hub will redirect back here with signed params.
  // IMPORTANT: return_url must NOT contain query params — the hub appends
  // ?twitter_handle=...&pfp_url=...&ts=...&sig=...  which would collide.
  // We embed our state token as a path segment instead.
  const returnUrl = `${SERVER_URL}/auth/connect/callback/${state}`;

  const params = new URLSearchParams({
    return_url: returnUrl,
    twitter_handle: String(twitter_handle),
  });

  console.log(`Hub connect redirect for @${twitter_handle} (${uid}) → ${HUB_API_BASE}/connect?${params}`);
  res.redirect(`${HUB_API_BASE}/connect?${params}`);
});

/**
 * GET /auth/connect/callback/:state  (new — state in path)
 * GET /auth/connect/callback          (legacy — state/uid in query)
 *
 * Hub redirects here after the user links their casino account.
 * Verifies HMAC sig → resolves user → marks linked → grants $REAL → redirects to client.
 */
async function handleConnectCallback(req, res) {
  // State may arrive as path param (new) or query param (legacy)
  const state = req.params.state || req.query.state || req.query.connect_state;
  const legacyUid = req.query.uid;
  const twitterHandleParam = req.query.twitter_handle || req.query.twitterHandle || req.query.username;
  const pfpUrl = req.query.pfp_url || req.query.pfpUrl || '';
  const ts = req.query.ts || req.query.timestamp;
  const sig = req.query.sig || req.query.signature;

  const storedState = state ? hubConnectStateStore.get(String(state)) : null;
  const effectiveTwitterHandle = String(twitterHandleParam || storedState?.twitterHandle || '').trim();

  console.log('Connect callback received:', {
    url: req.originalUrl,
    state: state ? `${String(state).slice(0, 8)}…` : null,
    hasStoredState: !!storedState,
    twitter_handle: effectiveTwitterHandle || '(empty)',
    hasTs: !!ts,
    hasSig: !!sig,
  });

  if (!effectiveTwitterHandle || !ts || !sig) {
    if (state) hubConnectStateStore.delete(String(state));
    return res.redirect(`${CLIENT_URL}?claim_result=error&claim_msg=missing_params`);
  }

  // Verify HMAC signature from hub
  try {
    if (!verifyHubCallback(effectiveTwitterHandle, String(pfpUrl), String(ts), String(sig))) {
      console.warn(`⚠️  Connect callback: invalid signature for @${effectiveTwitterHandle}`);
      if (state) hubConnectStateStore.delete(String(state));
      return res.redirect(`${CLIENT_URL}?claim_result=error&claim_msg=invalid_signature`);
    }
  } catch (err) {
    console.error('Signature verification error:', err.message);
    if (state) hubConnectStateStore.delete(String(state));
    return res.redirect(`${CLIENT_URL}?claim_result=error&claim_msg=sig_error`);
  }

  // ── Resolve target user ──
  // Priority: stored state → legacy uid query param → DB lookup by verified twitter_handle
  let targetUid = null;
  if (state && storedState) {
    hubConnectStateStore.delete(String(state));
    if (storedState.twitterHandle !== effectiveTwitterHandle.toLowerCase()) {
      return res.redirect(`${CLIENT_URL}?claim_result=error&claim_msg=state_mismatch`);
    }
    targetUid = storedState.uid;
  } else if (legacyUid) {
    targetUid = String(legacyUid);
  } else {
    // Fallback: HMAC already proved twitter_handle is authentic — look up by username
    try {
      const lookup = await pool.query(
        'SELECT twitter_id FROM scores WHERE LOWER(username) = LOWER($1) LIMIT 1',
        [effectiveTwitterHandle]
      );
      if (lookup.rows.length > 0) {
        targetUid = lookup.rows[0].twitter_id;
        console.log(`Resolved @${effectiveTwitterHandle} → uid ${targetUid} via DB lookup`);
      }
    } catch (e) {
      console.error('DB lookup by username failed:', e.message);
    }
  }

  if (!targetUid) {
    if (state) hubConnectStateStore.delete(String(state));
    return res.redirect(`${CLIENT_URL}?claim_result=error&claim_msg=user_not_found`);
  }

  try {
    // Mark user as linked
    await pool.query('UPDATE scores SET account_linked = true WHERE twitter_id = $1', [targetUid]);

    // Get user's scores to calculate allocation
    const scoreResult = await pool.query('SELECT * FROM scores WHERE twitter_id = $1', [targetUid]);
    if (scoreResult.rows.length === 0) {
      return res.redirect(`${CLIENT_URL}?claim_result=error&claim_msg=user_not_found`);
    }

    const row = scoreResult.rows[0];
    if (row.username && row.username.toLowerCase() !== effectiveTwitterHandle.toLowerCase()) {
      return res.redirect(`${CLIENT_URL}?claim_result=error&claim_msg=user_mismatch`);
    }
    if (row.claimed_at) {
      return res.redirect(`${CLIENT_URL}?claim_result=already_claimed`);
    }

    const totalPoints = row.total_points;
    const followersCount = parseInt(row.followers_count, 10) || 0;
    const realPoints = Math.floor(totalPoints * 0.4);
    const freePlayDollars = calculateFreePlayDollars(totalPoints, followersCount);

    if (!BONUS_API_SECRET) {
      console.error('BONUS_API_SECRET not configured');
      return res.redirect(`${CLIENT_URL}?claim_result=error&claim_msg=config_error`);
    }

    // Grant hub points (40% of power score — referral bonus is sent separately at conversion time)
    let hubResult = { ok: true, data: {} };
    if (realPoints > 0) {
      hubResult = await grantHubPoints(effectiveTwitterHandle, realPoints);
      console.log(`Hub grant result for @${effectiveTwitterHandle}: ${hubResult.status} (${realPoints} pts, ${totalPoints} total)`, hubResult.data);

      if (!hubResult.ok) {
        console.error('Hub API error:', hubResult.data);
        return res.redirect(`${CLIENT_URL}?claim_result=error&claim_msg=hub_error`);
      }
    }

    // Grant $REAL freeplay (60% of power score, capped per tier)
    let realBonusId = null;
    if (freePlayDollars > 0) {
      const realResult = await grantHubReal(effectiveTwitterHandle, freePlayDollars, { source: 'season1_freeplay' });
      console.log(`Hub $REAL grant for @${effectiveTwitterHandle}: ${realResult.status} ($${freePlayDollars})`, realResult.data);
      if (!realResult.ok) {
        console.error('Hub $REAL API error:', realResult.data);
        return res.redirect(`${CLIENT_URL}?claim_result=error&claim_msg=real_grant_failed`);
      }
      realBonusId = realResult.data.bonus_id || null;
    }

    // Mark as claimed — only reached if ALL grants succeeded
    await pool.query(
      'UPDATE scores SET claimed_at = NOW(), hub_bonus_id = $1, claim_amount = $2, hub_real_bonus_id = $3, claim_real_amount = $4 WHERE twitter_id = $5',
      [hubResult.data.bonus_id || null, realPoints, realBonusId, freePlayDollars, targetUid]
    );

    // Bust cache
    await redis.del(`scores:${targetUid}`);

    console.log(`✓ Claimed ${realPoints} pts + $${freePlayDollars} REAL for @${effectiveTwitterHandle} (${targetUid})`);
    return res.redirect(`${CLIENT_URL}?claim_result=success`);
  } catch (err) {
    console.error('Connect callback error:', err.message);
    return res.redirect(`${CLIENT_URL}?claim_result=error&claim_msg=server_error`);
  }
}

// Route 1: NEW — state as path segment (hub appends ?twitter_handle&ts&sig cleanly)
app.get('/auth/connect/callback/:state', handleConnectCallback);
// Route 2: LEGACY — state (or uid) as query param
app.get('/auth/connect/callback', handleConnectCallback);

/**
 * POST /auth/claim
 * For users who already linked their casino (account_linked = true) but haven't claimed yet.
 */
app.post('/auth/claim', async (req, res) => {
  const { twitterId } = req.body;
  if (!twitterId) return res.status(400).json({ error: 'twitterId required' });

  try {
    const result = await pool.query('SELECT * FROM scores WHERE twitter_id = $1', [twitterId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const row = result.rows[0];
    if (row.claimed_at) return res.json({ success: true, alreadyClaimed: true, claimedAt: row.claimed_at, amount: parseFloat(row.claim_amount), realAmount: row.claim_real_amount ? parseFloat(row.claim_real_amount) : null });
    if (!row.account_linked) return res.status(400).json({ error: 'Casino account not linked. Complete the connect flow first.' });

    if (!BONUS_API_SECRET) return res.status(500).json({ error: 'Server not configured for claims' });

    const totalPoints = row.total_points;
    const followersCount = parseInt(row.followers_count, 10) || 0;
    const realPoints = Math.floor(totalPoints * 0.4);
    const freePlayDollars = calculateFreePlayDollars(totalPoints, followersCount);

    // Grant hub points (40% of power score — referral bonus is sent separately at conversion time)
    let hubResult = { ok: true, data: {} };
    if (realPoints > 0) {
      hubResult = await grantHubPoints(row.username, realPoints);
      console.log(`Hub claim result for @${row.username}: ${hubResult.status} (${realPoints} pts, ${totalPoints} total)`, hubResult.data);

      if (!hubResult.ok) {
        console.error('Hub API error on direct claim:', hubResult.data);
        return res.status(502).json({ error: 'Failed to grant bonus', details: hubResult.data.error || hubResult.data });
      }
    }

    // Grant $REAL freeplay (60%, capped per tier)
    let realBonusId = null;
    if (freePlayDollars > 0) {
      const realResult = await grantHubReal(row.username, freePlayDollars, { source: 'season1_freeplay' });
      console.log(`Hub $REAL claim for @${row.username}: ${realResult.status} ($${freePlayDollars})`, realResult.data);
      if (!realResult.ok) {
        console.error('Hub $REAL API error on direct claim:', realResult.data);
        return res.status(502).json({ error: 'Failed to grant $REAL bonus', details: realResult.data.error || realResult.data });
      }
      realBonusId = realResult.data.bonus_id || null;
    }

    // Mark as claimed — only reached if ALL grants succeeded
    await pool.query(
      'UPDATE scores SET claimed_at = NOW(), hub_bonus_id = $1, claim_amount = $2, hub_real_bonus_id = $3, claim_real_amount = $4 WHERE twitter_id = $5',
      [hubResult.data.bonus_id || null, realPoints, realBonusId, freePlayDollars, twitterId]
    );
    await redis.del(`scores:${twitterId}`);

    console.log(`✓ Direct claim ${realPoints} pts + $${freePlayDollars} REAL for @${row.username} (${twitterId})`);
    res.json({ success: true, bonusId: hubResult.data.bonus_id, realBonusId, amount: realPoints, realAmount: freePlayDollars });
  } catch (err) {
    console.error('Claim error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /auth/claim-status/:twitterId
 * Quick check: is the user linked / has claimed?
 */
app.get('/auth/claim-status/:twitterId', async (req, res) => {
  const { twitterId } = req.params;
  try {
    const result = await pool.query(
      'SELECT account_linked, claimed_at, claim_amount, claim_real_amount FROM scores WHERE twitter_id = $1',
      [twitterId]
    );
    if (result.rows.length === 0) return res.json({ linked: false, claimed: false });
    const row = result.rows[0];
    res.json({
      linked: !!row.account_linked,
      claimed: !!row.claimed_at,
      claimedAt: row.claimed_at || null,
      amount: row.claim_amount ? parseFloat(row.claim_amount) : null,
      realAmount: row.claim_real_amount ? parseFloat(row.claim_real_amount) : null,
    });
  } catch (err) {
    console.error('Claim status error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
//  SHARE — Record that a user shared on X
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
//  SHARE IMAGE — Capture & serve VIP card screenshots
// ─────────────────────────────────────────────

// Upload VIP card screenshot (needs larger body limit)
app.post('/auth/share-image', express.json({ limit: '6mb' }), async (req, res) => {
  const { twitterId, imageBase64 } = req.body;
  if (!twitterId || !imageBase64) return res.status(400).json({ error: 'twitterId and imageBase64 required' });
  // Validate: must be a data URI or raw base64 (PNG)
  const base64Data = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
  // Limit to ~5MB of base64
  if (base64Data.length > 6_000_000) return res.status(400).json({ error: 'Image too large' });
  try {
    await pool.query(
      `INSERT INTO scores (twitter_id, share_image)
       VALUES ($1, $2)
       ON CONFLICT (twitter_id) DO UPDATE SET share_image = $2`,
      [twitterId, base64Data]
    );
    await redis.del(`scores:${twitterId}`);
    const shareUrl = `${CLIENT_URL}/share/${twitterId}?v=${Date.now()}`;
    res.json({ success: true, shareUrl });
  } catch (err) {
    console.error('Share image save error:', err.message);
    res.status(500).json({ error: 'Failed to save share image' });
  }
});

// Serve the VIP card image as PNG
app.get('/share-image/:twitterId.png', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT share_image FROM scores WHERE twitter_id = $1', [req.params.twitterId]);
    if (!rows[0]?.share_image) return res.status(404).send('Not found');
    const dataUri = rows[0].share_image;
    const matches = dataUri.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!matches) return res.status(404).send('Not found');
    const imgBuffer = Buffer.from(matches[2], 'base64');
    res.set('Content-Type', `image/${matches[1]}`);
    // Always serve the latest generated VIP image (prevents stale cards after reset/regeneration)
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.send(imgBuffer);
  } catch (err) {
    console.error('Share image serve error:', err.message);
    res.status(500).send('Error');
  }
});

// OG share page — serves HTML with meta tags so Twitter unfurls the VIP card image
app.get('/share/:twitterId', async (req, res) => {
  const { twitterId } = req.params;
  const version = req.query.v ? String(req.query.v) : '';
  const ref = req.query.ref ? String(req.query.ref) : '';
  try {
    const { rows } = await pool.query('SELECT username, total_points, share_image FROM scores WHERE twitter_id = $1', [twitterId]);
    const user = rows[0];
    const username = user?.username || 'Player';
    const points = user?.total_points || 0;
    const imageUrlBase = user?.share_image ? `${CLIENT_URL}/share-image/${twitterId}.png` : `${CLIENT_URL}/VIPcard.png`;
    const imageUrl = version ? `${imageUrlBase}?v=${encodeURIComponent(version)}` : imageUrlBase;
    const title = `@${username} — ${points.toLocaleString()} Power Points`;
    const description = `SEASON 1 ALLOCATION | The House is open. #RealBetSeason1`;
    const siteUrl = ref
      ? `${CLIENT_URL}${CLIENT_URL.includes('?') ? '&' : '?'}ref=${encodeURIComponent(ref)}`
      : CLIENT_URL;
    const sharePageUrl = ref
      ? `${CLIENT_URL}/share/${twitterId}?ref=${encodeURIComponent(ref)}`
      : `${CLIENT_URL}/share/${twitterId}`;

    res.set('Content-Type', 'text/html');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="628" />
  <meta property="og:url" content="${sharePageUrl}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${imageUrl}" />
  <meta http-equiv="refresh" content="0;url=${siteUrl}" />
</head>
<body style="background:#0a0b0f;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
  <p>Redirecting to RealBet…</p>
</body>
</html>`);
  } catch (err) {
    console.error('Share page error:', err.message);
    res.redirect(CLIENT_URL);
  }
});

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
      `WITH scored AS (
         SELECT username,
                followers_count,
                bronze_points,
                silver_points,
                gold_points,
                (COALESCE(bronze_points, 0) + COALESCE(silver_points, 0) + COALESCE(gold_points, 0)) AS box_points,
                COALESCE(total_points, 0) AS stored_total,
                COALESCE(referral_bonus_points, 0) AS ref_bonus,
                CASE
                  WHEN COALESCE(total_points, 0) - (COALESCE(bronze_points, 0) + COALESCE(silver_points, 0) + COALESCE(gold_points, 0)) >= 1000 THEN 1000
                  WHEN COALESCE(total_points, 0) - (COALESCE(bronze_points, 0) + COALESCE(silver_points, 0) + COALESCE(gold_points, 0)) >= 500 THEN 500
                  ELSE 0
                END AS inferred_task_bonus
         FROM scores
         WHERE username IS NOT NULL
       )
       SELECT username,
              followers_count,
              bronze_points,
              silver_points,
              gold_points,
              ref_bonus AS referral_bonus_points,
              (box_points + inferred_task_bonus + ref_bonus) AS total_points,
              FLOOR((box_points + inferred_task_bonus + ref_bonus) * 0.4) AS real_points,
              RANK() OVER (ORDER BY (box_points + inferred_task_bonus + ref_bonus) DESC) AS rank
       FROM scored
       WHERE box_points > 0
         AND (box_points + inferred_task_bonus) > 0
       ORDER BY (box_points + inferred_task_bonus + ref_bonus) DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await pool.query(
      `WITH scored AS (
         SELECT (COALESCE(bronze_points, 0) + COALESCE(silver_points, 0) + COALESCE(gold_points, 0)) AS box_points,
                COALESCE(referral_bonus_points, 0) AS ref_bonus,
                CASE
                  WHEN COALESCE(total_points, 0) - (COALESCE(bronze_points, 0) + COALESCE(silver_points, 0) + COALESCE(gold_points, 0)) >= 1000 THEN 1000
                  WHEN COALESCE(total_points, 0) - (COALESCE(bronze_points, 0) + COALESCE(silver_points, 0) + COALESCE(gold_points, 0)) >= 500 THEN 500
                  ELSE 0
                END AS inferred_task_bonus,
                username
         FROM scores
         WHERE username IS NOT NULL
       )
       SELECT COUNT(*)
       FROM scored
       WHERE box_points > 0
         AND (box_points + inferred_task_bonus) > 0`
    );
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

const REFERRAL_BONUS_REFERRER = 50; // Points awarded to referrer per successful referral
const REFERRAL_BONUS_REFERRED = 0;  // Points awarded to the referred user
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

      // #3: Atomic cap — use LEAST() in the UPDATE so a race condition cannot exceed MAX_REFERRAL_BONUS.
      if (referrerBonus > 0) {
        await client.query(
          `UPDATE scores SET
            referral_bonus_points = LEAST(COALESCE(referral_bonus_points, 0) + $2, $3),
            referral_count = COALESCE(referral_count, 0) + 1,
            updated_at = NOW()
           WHERE twitter_id = $1`,
          [referrerRow.twitter_id, referrerBonus, MAX_REFERRAL_BONUS]
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

      // Update referred user: mark who referred them + add their bonus (referral pts stay separate from total_points)
      await client.query(
        `INSERT INTO scores (twitter_id, username, referred_by, referral_bonus_points, total_points, referral_code)
         VALUES ($1, $4, $2, $3, 0, $5)
         ON CONFLICT (twitter_id) DO UPDATE SET
           referred_by = $2,
           referral_bonus_points = COALESCE(scores.referral_bonus_points, 0) + $3,
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

      // Grant referral bonus to hub immediately (non-blocking)
      let hubGranted = false;
      if (referrerBonus > 0 && BONUS_API_SECRET && referrerRow.username) {
        try {
          const hubResult = await grantHubPoints(referrerRow.username, referrerBonus);
          console.log(`Hub referral grant for @${referrerRow.username}: ${hubResult.status} (+${referrerBonus} pts)`, hubResult.data);
          hubGranted = hubResult.ok;
          if (!hubResult.ok) {
            console.error('Hub referral grant failed (non-blocking):', hubResult.data);
          }
        } catch (hubErr) {
          console.error('Hub referral grant error (non-blocking):', hubErr.message);
        }
      }
      if (REFERRAL_BONUS_REFERRED > 0 && BONUS_API_SECRET && username) {
        try {
          const hubResult = await grantHubPoints(username, REFERRAL_BONUS_REFERRED);
          console.log(`Hub referred grant for @${username}: ${hubResult.status} (+${REFERRAL_BONUS_REFERRED} pts)`, hubResult.data);
          if (!hubResult.ok) {
            console.error('Hub referred grant failed (non-blocking):', hubResult.data);
          }
        } catch (hubErr) {
          console.error('Hub referred grant error (non-blocking):', hubErr.message);
        }
      }

      res.json({
        success: true,
        referrerBonus,
        referredBonus: REFERRAL_BONUS_REFERRED,
        referrerUsername: referrerRow.username,
        hubGranted,
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

const ADMIN_KEY = process.env.ADMIN_KEY; // guaranteed set by startup guard above

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
        FLOOR(SUM(total_points) / 20) AS total_dollar_headline,
        FLOOR(SUM(total_points * 0.60 / 20)) AS total_freeplay_exposure,
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
        FLOOR(SUM(total_points * 0.60 / 20)) AS cash_exposure
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
        bonusPoints: (() => {
          const boxSum = (r.bronze_points || 0) + (r.silver_points || 0) + (r.gold_points || 0);
          const delta = (r.total_points || 0) - boxSum;
          if (delta >= 1000) return 1000;
          if (delta >= 500) return 500;
          return 0;
        })(),
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
  // Prefix ALL formula-triggering characters (including pipe and semicolon used in some locales)
  if (/^[=+\-@\t\r|;]/.test(str)) return `'${str}`;
  // Wrap in quotes if contains comma, quote, newline, or tab
  if (/[,"\n\r\t]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
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
              ROUND(total_points * 0.60 / 20, 2) AS freeplay_dollars,
              share_post_url, shared_at,
              created_at, updated_at
       FROM scores ORDER BY total_points DESC`
    );

    const header = 'twitter_id,username,followers,bronze_pts,silver_pts,gold_pts,total_pts,real_pts,freeplay_$,shared,share_post_url,created,updated\n';
    const rows = result.rows.map(r =>
      [r.twitter_id, csvSafe(r.username), r.followers_count, r.bronze_points, r.silver_points, r.gold_points, r.total_points, r.real_points, r.freeplay_dollars, r.shared_at ? 'yes' : 'no', csvSafe(r.share_post_url), r.created_at, r.updated_at].join(',')
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
  // Safely embed JSON via base64 in a data attribute — never injected into script text
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  console.log(`[OAuth Result] ${provider} success=${success} user=${user?.username || 'n/a'} error=${error || 'none'}`);

  // Serve inline HTML that sends postMessage to opener (cross-origin safe)
  // Falls back to redirect to CLIENT_URL callback page if opener is missing
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head><title>Authenticating...</title></head>
<body style="background:#0D0D0D;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div id="payload" data-b64="${b64}" style="text-align:center">
    <p id="msg">${success ? 'Connected!' : 'Connection failed'}</p>
    <p style="opacity:0.5;font-size:14px">This window will close automatically...</p>
  </div>
  <script>
    var data = JSON.parse(atob(document.getElementById('payload').dataset.b64));
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

// ── Cleanup expired states every 2 minutes (OAuth state TTL is 5 min) ──
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000; // 5-minute TTL for OAuth states
  for (const [key, val] of oauthStore) {
    if (val.created < cutoff) oauthStore.delete(key);
  }
  // Hub connect states expire after 10 minutes (longer flow)
  const hubCutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, val] of hubConnectStateStore) {
    if (val.created < hubCutoff) hubConnectStateStore.delete(key);
  }
}, 2 * 60 * 1000);

app.listen(PORT, async () => {
  await initDB();
  await initRedis();
  console.log(`OAuth server running on http://localhost:${PORT}`);
});
