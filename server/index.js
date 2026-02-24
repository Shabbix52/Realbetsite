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
    return res.redirect(resultRedirectUrl(false, 'twitter', 'Missing code or state'));
  }

  const stored = oauthStore.get(state);
  if (!stored) {
    return res.redirect(resultRedirectUrl(false, 'twitter', 'Invalid or expired state'));
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
      return res.redirect(resultRedirectUrl(false, 'twitter', 'Token exchange failed'));
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

    res.redirect(
      resultRedirectUrl(true, 'twitter', null, {
        id: user.id,
        username: user.username,
        name: user.name,
        avatar: user.profile_image_url,
        followersCount,
      })
    );
  } catch (err) {
    console.error('Twitter OAuth error:', err);
    res.redirect(resultRedirectUrl(false, 'twitter', 'OAuth flow failed'));
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
    return res.redirect(resultRedirectUrl(false, 'discord', 'Missing code or state'));
  }

  const stored = oauthStore.get(state);
  if (!stored) {
    return res.redirect(resultRedirectUrl(false, 'discord', 'Invalid or expired state'));
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
      return res.redirect(resultRedirectUrl(false, 'discord', 'Token exchange failed'));
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

    res.redirect(
      resultRedirectUrl(true, 'discord', null, {
        id: userData.id,
        username: userData.username,
        globalName: userData.global_name,
        avatar: avatarUrl,
      })
    );
  } catch (err) {
    console.error('Discord OAuth error:', err);
    res.redirect(resultRedirectUrl(false, 'discord', 'OAuth flow failed'));
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
//  ADMIN — Protected dashboard endpoints
// ─────────────────────────────────────────────

const ADMIN_KEY = process.env.ADMIN_KEY || 'realbet-admin-2026';

function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
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
        COUNT(CASE WHEN total_points > 0 THEN 1 END) AS active_users
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

// Admin: Export all data as CSV
app.get('/admin/export', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT twitter_id, username, followers_count, bronze_points, silver_points, gold_points,
              total_points, FLOOR(total_points * 0.4) AS real_points,
              ROUND(total_points * 0.30 / 20, 2) AS freeplay_dollars,
              ROUND(total_points * 0.30 / 20, 2) AS deposit_match_dollars,
              created_at, updated_at
       FROM scores ORDER BY total_points DESC`
    );

    const header = 'twitter_id,username,followers,bronze_pts,silver_pts,gold_pts,total_pts,real_pts,freeplay_$,deposit_match_$,created,updated\n';
    const rows = result.rows.map(r =>
      `${r.twitter_id},${r.username || ''},${r.followers_count},${r.bronze_points},${r.silver_points},${r.gold_points},${r.total_points},${r.real_points},${r.freeplay_dollars},${r.deposit_match_dollars},${r.created_at},${r.updated_at}`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=realbet-season1-export.csv');
    res.send(header + rows);
  } catch (err) {
    console.error('Export error:', err.message);
    res.status(500).json({ error: 'Failed to export' });
  }
});

// ─────────────────────────────────────────────
//  Result page — sends postMessage to opener & closes popup
// ─────────────────────────────────────────────

function resultRedirectUrl(success, provider, error = null, user = null) {
  const payload = { success, provider, error, user };
  const encoded = encodeURIComponent(JSON.stringify(payload));
  return `${CLIENT_URL}/oauth-callback.html?data=${encoded}`;
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
