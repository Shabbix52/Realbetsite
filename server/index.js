import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import pg from 'pg';
import { createClient } from 'redis';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

// Allow Vercel preview deployments and production
const allowedOrigins = [
  CLIENT_URL,
  'http://localhost:5173',
  /https:\/\/lovable-.*\.vercel\.app$/
];

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
app.use(express.json());

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
    console.log('✓ PostgreSQL connected & tables ready');
  } finally {
    client.release();
  }
}

async function upsertUser(provider, providerData) {
  const { id: providerId, username, name, globalName, avatar, followersCount } = providerData;
  const displayName = name || globalName || username;
  const result = await pool.query(
    `INSERT INTO users (provider, provider_id, username, display_name, avatar_url, followers_count)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (provider, provider_id) DO UPDATE
       SET username = $3, display_name = $4, avatar_url = $5, followers_count = $6
     RETURNING id`,
    [provider, providerId, username, displayName, avatar, followersCount || 0]
  );
  return result.rows[0].id;
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

  oauthStore.set(state, { verifier, provider: 'twitter', created: Date.now() });

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
    return res.status(400).send(resultPage(false, 'twitter', 'Missing code or state'));
  }

  const stored = oauthStore.get(state);
  if (!stored) {
    return res.status(400).send(resultPage(false, 'twitter', 'Invalid or expired state'));
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
      return res.send(resultPage(false, 'twitter', 'Token exchange failed'));
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
    const dbId = await upsertUser('twitter', {
      id: user.id,
      username: user.username,
      name: user.name,
      avatar: user.profile_image_url,
      followersCount,
    });
    // Cache in Redis (expire in 24h)
    await redis.setEx(`user:twitter:${user.id}`, 86400, JSON.stringify({ dbId, username: user.username, followersCount }));
    console.log(`Twitter user @${user.username} (${followersCount} followers) saved (db id: ${dbId})`);

    res.send(
      resultPage(true, 'twitter', null, {
        id: user.id,
        username: user.username,
        name: user.name,
        avatar: user.profile_image_url,
        followersCount,
      })
    );
  } catch (err) {
    console.error('Twitter OAuth error:', err);
    res.send(resultPage(false, 'twitter', 'OAuth flow failed'));
  }
});

// ─────────────────────────────────────────────
//  DISCORD — OAuth 2.0
// ─────────────────────────────────────────────

// Step 1: Redirect user to Discord authorization
app.get('/auth/discord', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  oauthStore.set(state, { provider: 'discord', created: Date.now() });

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
    return res.status(400).send(resultPage(false, 'discord', 'Missing code or state'));
  }

  const stored = oauthStore.get(state);
  if (!stored) {
    return res.status(400).send(resultPage(false, 'discord', 'Invalid or expired state'));
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
      return res.send(resultPage(false, 'discord', 'Token exchange failed'));
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
    const dbId = await upsertUser('discord', {
      id: userData.id,
      username: userData.username,
      globalName: userData.global_name,
      avatar: avatarUrl,
    });
    // Cache in Redis (expire in 24h)
    await redis.setEx(`user:discord:${userData.id}`, 86400, JSON.stringify({ dbId, username: userData.username }));
    console.log(`Discord user ${userData.username} saved (db id: ${dbId})`);

    res.send(
      resultPage(true, 'discord', null, {
        id: userData.id,
        username: userData.username,
        globalName: userData.global_name,
        avatar: avatarUrl,
      })
    );
  } catch (err) {
    console.error('Discord OAuth error:', err);
    res.send(resultPage(false, 'discord', 'OAuth flow failed'));
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
//  SCORES — Save & load box results
// ─────────────────────────────────────────────

app.post('/auth/scores', async (req, res) => {
  const { twitterId, username, followersCount, boxes, walletMultiplier, totalPoints } = req.body;
  if (!twitterId) return res.status(400).json({ error: 'twitterId required' });

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
//  Result page — sends postMessage to opener & closes popup
// ─────────────────────────────────────────────

function resultPage(success, provider, error = null, user = null) {
  const payload = JSON.stringify({ success, provider, error, user });
  return `<!DOCTYPE html>
<html>
<head><title>Authenticating...</title></head>
<body style="background:#0D0D0D;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center">
    <p>${success ? '✅ Connected!' : '❌ Connection failed'}</p>
    <p style="opacity:0.5;font-size:14px">This window will close automatically...</p>
  </div>
  <script>
    window.opener && window.opener.postMessage(${payload}, '${CLIENT_URL}');
    setTimeout(() => window.close(), 1500);
  </script>
</body>
</html>`;
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
