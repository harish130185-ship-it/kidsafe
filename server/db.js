'use strict';
const fs = require('node:fs');
const path = require('node:path');

let Pool = null;
let pgTypes = null;
try {
  const pg = require('pg');
  Pool = pg.Pool;
  pgTypes = pg.types;
  // Parse PostgreSQL BIGINT (OID 20) as JavaScript Number so timestamps and durations work cleanly
  pgTypes.setTypeParser(20, val => (val === null ? null : Number(val)));
} catch {
  // pg not installed; fallback store will be used
}

const isVercel = !!process.env.VERCEL;
const defaultDataDir = isVercel ? '/tmp/kidsafe-data' : path.join(__dirname, 'private-data');
const DIR = path.resolve(process.env.DATA_DIR || defaultDataDir);
const dataFile = path.join(DIR, 'database.json');
const seedFile = path.join(__dirname, 'initial-data.json');

const PG_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  '';

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

const DEFAULT_SETTINGS = {
  dataRetentionDays: 30,
  autoPrune: true,
  fast2smsApiKey: process.env.FAST2SMS_API_KEY || '',
  twilioSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || ''
};

function createEmptyDb() {
  return {
    parents: [],
    children: [],
    devices: [],
    pairingSessions: [],
    reports: {},
    limits: {},
    alerts: [],
    auditLogs: [],
    settings: { ...DEFAULT_SETTINGS }
  };
}

// =========================================================================
// 1. POSTGRESQL (NEON / VERCEL / SUPABASE / RENDER) PERSISTENT STORE
// =========================================================================
let pgPool = null;
let pgInitPromise = null;

function isLocalPgUrl(urlStr) {
  return /localhost|127\.0\.0\.1|::1/i.test(urlStr) && !/sslmode=require/i.test(urlStr);
}

function getPgPool() {
  if (!Pool || !PG_URL) return null;
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: PG_URL,
      ssl: isLocalPgUrl(PG_URL) ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000
    });
    pgPool.on('error', err => {
      console.error('[PostgreSQL Pool Error]', err.message);
    });
  }
  return pgPool;
}

function mapParentRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    email: r.email || undefined,
    phone: r.phone || '',
    displayPhone: r.display_phone || r.phone || r.email || '',
    name: r.name || 'Parent Guardian',
    picture: r.picture || '',
    language: r.language || 'en',
    theme: r.theme || 'light',
    authProvider: r.auth_provider || 'password',
    googleId: r.google_id || undefined,
    is2FaActive: !!r.is_2fa_active,
    salt: r.salt || undefined,
    passwordHash: r.password_hash || undefined,
    totpSecret: r.totp_secret || undefined,
    createdAt: Number(r.created_at) || 0
  };
}

function mapChildRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    parentId: r.parent_id,
    name: r.name,
    age: Number(r.age) || 10,
    avatar: r.avatar || 'default',
    deviceName: r.device_name || 'Pending Setup',
    deviceModel: r.device_model || 'Android Device',
    batteryLevel: r.battery_level !== null && r.battery_level !== undefined ? Number(r.battery_level) : null,
    isOnline: !!r.is_online,
    lastSyncAt: Number(r.last_sync_at) || 0,
    dailyLimitMinutes: Number(r.daily_limit_minutes) || 120,
    createdAt: Number(r.created_at) || 0
  };
}

function mapDeviceRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    childId: r.child_id,
    parentId: r.parent_id || '',
    deviceName: r.device_name || 'Android Device',
    deviceModel: r.device_model || 'Android Phone',
    androidVersion: r.android_version || 'Android 14',
    appGuid: r.app_guid || '',
    token: r.token,
    pairedAt: Number(r.paired_at) || 0,
    lastSyncAt: Number(r.last_sync_at) || 0,
    batteryLevel: r.battery_level !== null && r.battery_level !== undefined ? Number(r.battery_level) : null,
    isOnline: !!r.is_online,
    isRevoked: !!r.is_revoked
  };
}

function mapPairingRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    parentId: r.parent_id,
    childId: r.child_id,
    childName: r.child_name,
    code: r.code,
    codeHash: r.code_hash || '',
    expiresAt: Number(r.expires_at) || 0,
    status: r.status || 'pending',
    createdAt: Number(r.created_at) || 0,
    consumedAt: r.consumed_at ? Number(r.consumed_at) : undefined,
    deviceId: r.device_id || undefined
  };
}

function mapReportRow(r) {
  if (!r) return null;
  return {
    day: r.day,
    childId: r.child_id,
    totalScreenTimeMs: Number(r.total_screen_time_ms) || 0,
    screenUnlocksApprox: Number(r.screen_unlocks_approx) || 0,
    apps: Array.isArray(r.apps_json) ? r.apps_json : [],
    timeline: Array.isArray(r.timeline_json) ? r.timeline_json : [],
    hourlyActivity: Array.isArray(r.hourly_activity_json) ? r.hourly_activity_json : Array(24).fill(0),
    categoryBreakdown: r.category_breakdown_json && typeof r.category_breakdown_json === 'object'
      ? r.category_breakdown_json
      : { Education: 0, Entertainment: 0, Games: 0, Social: 0, Productivity: 0, System: 0, Other: 0 },
    receivedAt: Number(r.received_at) || 0
  };
}

function mapLimitRow(r) {
  if (!r) return null;
  return {
    package: r.package,
    name: r.name,
    category: r.category || 'Other',
    dailyLimitMinutes: Number(r.daily_limit_minutes) || 30,
    isBlocked: !!r.is_blocked
  };
}

function mapAlertRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    childId: r.child_id,
    childName: r.child_name || 'Child',
    type: r.type,
    title: r.title,
    description: r.description || '',
    severity: r.severity || 'info',
    timestamp: Number(r.timestamp) || 0,
    isRead: !!r.is_read
  };
}

async function seedPgFromInitialData(client) {
  const seedFlag = await client.query("SELECT value_json FROM app_settings WHERE key = 'initial_seed_applied'");
  if (seedFlag.rows.length > 0) return;

  const existingParents = await client.query('SELECT COUNT(*)::int AS cnt FROM parents');
  const hasExistingData = (existingParents.rows[0]?.cnt || 0) > 0;

  if (!hasExistingData && fs.existsSync(seedFile)) {
    try {
      const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
      for (const p of seed.parents || []) {
        await client.query(
          `INSERT INTO parents (id, email, phone, display_phone, name, picture, language, theme, auth_provider, google_id, is_2fa_active, salt, password_hash, totp_secret, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (id) DO NOTHING`,
          [
            p.id, p.email || null, p.phone || null, p.displayPhone || p.phone || '', p.name || 'Parent Guardian',
            p.picture || '', p.language || 'en', p.theme || 'light', p.authProvider || 'password',
            p.googleId || '', !!p.is2FaActive, p.salt || '', p.passwordHash || '', p.totpSecret || '',
            Number(p.createdAt) || Date.now()
          ]
        );
      }

      for (const c of seed.children || []) {
        await client.query(
          `INSERT INTO children (id, parent_id, name, age, avatar, device_name, device_model, battery_level, is_online, last_sync_at, daily_limit_minutes, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (id) DO NOTHING`,
          [
            c.id, c.parentId, c.name, Number(c.age) || 10, c.avatar || 'default',
            c.deviceName || 'Pending Setup', c.deviceModel || 'Android Device',
            c.batteryLevel !== null && c.batteryLevel !== undefined ? Number(c.batteryLevel) : null,
            !!c.isOnline, Number(c.lastSyncAt) || 0, Number(c.dailyLimitMinutes) || 120, Number(c.createdAt) || Date.now()
          ]
        );
      }

      for (const d of seed.devices || []) {
        await client.query(
          `INSERT INTO devices (id, child_id, parent_id, device_name, device_model, android_version, app_guid, token, paired_at, last_sync_at, battery_level, is_online, is_revoked)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (id) DO NOTHING`,
          [
            d.id, d.childId, d.parentId || '', d.deviceName || 'Android Device', d.deviceModel || 'Android Phone',
            d.androidVersion || 'Android 14', d.appGuid || '', d.token, Number(d.pairedAt) || Date.now(),
            Number(d.lastSyncAt) || 0, d.batteryLevel !== null && d.batteryLevel !== undefined ? Number(d.batteryLevel) : null,
            !!d.isOnline, !!d.isRevoked
          ]
        );
      }

      for (const s of seed.pairingSessions || []) {
        await client.query(
          `INSERT INTO pairing_sessions (id, parent_id, child_id, child_name, code, code_hash, expires_at, status, created_at, consumed_at, device_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (id) DO NOTHING`,
          [
            s.id, s.parentId, s.childId, s.childName || 'Child', s.code, s.codeHash || '',
            Number(s.expiresAt) || 0, s.status || 'pending', Number(s.createdAt) || Date.now(),
            s.consumedAt ? Number(s.consumedAt) : null, s.deviceId || null
          ]
        );
      }

      if (seed.settings && typeof seed.settings === 'object') {
        await client.query(
          `INSERT INTO app_settings (key, value_json) VALUES ('general', $1::jsonb) ON CONFLICT (key) DO NOTHING`,
          [JSON.stringify({ ...DEFAULT_SETTINGS, ...seed.settings })]
        );
      }

      console.log('[PostgreSQL] Seeded initial baseline records once.');
    } catch (e) {
      console.warn('[PostgreSQL Seed Warning]', e.message);
    }
  }

  await client.query(
    `INSERT INTO app_settings (key, value_json) VALUES ('initial_seed_applied', $1::jsonb) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify({ applied: true, appliedAt: Date.now() })]
  );
}

async function ensurePgReady() {
  const pool = getPgPool();
  if (!pool) return false;
  if (pgInitPromise) return pgInitPromise;

  pgInitPromise = (async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE TABLE IF NOT EXISTS parents (
          id TEXT PRIMARY KEY,
          email TEXT,
          phone TEXT,
          display_phone TEXT,
          name TEXT NOT NULL DEFAULT 'Parent Guardian',
          picture TEXT DEFAULT '',
          language TEXT DEFAULT 'en',
          theme TEXT DEFAULT 'light',
          auth_provider TEXT DEFAULT 'password',
          google_id TEXT DEFAULT '',
          is_2fa_active BOOLEAN DEFAULT FALSE,
          salt TEXT DEFAULT '',
          password_hash TEXT DEFAULT '',
          totp_secret TEXT DEFAULT '',
          created_at BIGINT NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_parents_email ON parents (LOWER(email));
        CREATE INDEX IF NOT EXISTS idx_parents_phone ON parents (phone);

        CREATE TABLE IF NOT EXISTS children (
          id TEXT PRIMARY KEY,
          parent_id TEXT NOT NULL,
          name TEXT NOT NULL,
          age INTEGER DEFAULT 10,
          avatar TEXT DEFAULT 'default',
          device_name TEXT DEFAULT 'Pending Setup',
          device_model TEXT DEFAULT 'Android Device',
          battery_level INTEGER,
          is_online BOOLEAN DEFAULT FALSE,
          last_sync_at BIGINT DEFAULT 0,
          daily_limit_minutes INTEGER DEFAULT 120,
          created_at BIGINT DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_children_parent ON children (parent_id);

        CREATE TABLE IF NOT EXISTS devices (
          id TEXT PRIMARY KEY,
          child_id TEXT NOT NULL,
          parent_id TEXT,
          device_name TEXT DEFAULT 'Android Device',
          device_model TEXT DEFAULT 'Android Phone',
          android_version TEXT DEFAULT 'Android 14',
          app_guid TEXT DEFAULT '',
          token TEXT NOT NULL,
          paired_at BIGINT DEFAULT 0,
          last_sync_at BIGINT DEFAULT 0,
          battery_level INTEGER,
          is_online BOOLEAN DEFAULT FALSE,
          is_revoked BOOLEAN DEFAULT FALSE
        );
        CREATE INDEX IF NOT EXISTS idx_devices_token ON devices (token);
        CREATE INDEX IF NOT EXISTS idx_devices_child ON devices (child_id);
        CREATE INDEX IF NOT EXISTS idx_devices_parent ON devices (parent_id);

        CREATE TABLE IF NOT EXISTS pairing_sessions (
          id TEXT PRIMARY KEY,
          parent_id TEXT NOT NULL,
          child_id TEXT NOT NULL,
          child_name TEXT NOT NULL,
          code TEXT NOT NULL,
          code_hash TEXT DEFAULT '',
          expires_at BIGINT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at BIGINT NOT NULL,
          consumed_at BIGINT,
          device_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_pairing_code ON pairing_sessions (code);
        CREATE INDEX IF NOT EXISTS idx_pairing_child ON pairing_sessions (child_id);

        CREATE TABLE IF NOT EXISTS daily_reports (
          child_id TEXT NOT NULL,
          day TEXT NOT NULL,
          total_screen_time_ms BIGINT NOT NULL DEFAULT 0,
          screen_unlocks_approx INTEGER NOT NULL DEFAULT 0,
          apps_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          timeline_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          hourly_activity_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          category_breakdown_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          received_at BIGINT NOT NULL DEFAULT 0,
          PRIMARY KEY (child_id, day)
        );

        CREATE TABLE IF NOT EXISTS app_limits (
          child_id TEXT NOT NULL,
          package TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT 'Other',
          daily_limit_minutes INTEGER NOT NULL DEFAULT 30,
          is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
          PRIMARY KEY (child_id, package)
        );

        CREATE TABLE IF NOT EXISTS alerts (
          id TEXT PRIMARY KEY,
          child_id TEXT NOT NULL,
          child_name TEXT DEFAULT 'Child',
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          severity TEXT DEFAULT 'info',
          timestamp BIGINT NOT NULL,
          is_read BOOLEAN DEFAULT FALSE
        );
        CREATE INDEX IF NOT EXISTS idx_alerts_child ON alerts (child_id, timestamp DESC);

        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          details TEXT DEFAULT '',
          timestamp BIGINT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value_json JSONB NOT NULL DEFAULT '{}'::jsonb
        );
      `);
      await seedPgFromInitialData(client);
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      pgInitPromise = null;
      throw err;
    } finally {
      client.release();
    }
  })();

  return pgInitPromise;
}

// =========================================================================
// 2. FALLBACK STORE (UPSTASH KV OR LOCAL JSON FILE WHEN NO POSTGRES)
// =========================================================================
let memDb = createEmptyDb();
let localLoaded = false;

try {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
} catch {}

function loadLocalJsonOnce() {
  if (localLoaded) return;
  localLoaded = true;
  try {
    if (fs.existsSync(dataFile)) {
      const loaded = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      memDb = Object.assign(createEmptyDb(), loaded);
    } else if (fs.existsSync(seedFile)) {
      const seedData = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
      memDb = Object.assign(createEmptyDb(), seedData);
    }
  } catch (e) {
    console.error('Failed reading local database file:', e.message);
  }
  ensureMemDbShape();
}

function ensureMemDbShape() {
  if (!Array.isArray(memDb.parents)) memDb.parents = [];
  if (!Array.isArray(memDb.children)) memDb.children = [];
  if (!Array.isArray(memDb.devices)) memDb.devices = [];
  if (!Array.isArray(memDb.pairingSessions)) memDb.pairingSessions = [];
  if (!memDb.reports || typeof memDb.reports !== 'object') memDb.reports = {};
  if (!memDb.limits || typeof memDb.limits !== 'object') memDb.limits = {};
  if (!Array.isArray(memDb.alerts)) memDb.alerts = [];
  if (!Array.isArray(memDb.auditLogs)) memDb.auditLogs = [];
  if (!memDb.settings || typeof memDb.settings !== 'object') memDb.settings = { ...DEFAULT_SETTINGS };
}

async function executeKv(cmdArray) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(KV_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cmdArray)
    });
    if (res.ok) {
      const data = await res.json();
      return data.result;
    }
  } catch (e) {
    console.warn('[Cloud KV]', e.message);
  }
  return null;
}

async function reloadFallbackDb() {
  loadLocalJsonOnce();
  if (KV_URL && KV_TOKEN) {
    try {
      const res = await executeKv(['GET', 'kidsafe_database']);
      if (res) {
        const parsed = typeof res === 'string' ? JSON.parse(res) : res;
        if (parsed && typeof parsed === 'object') {
          memDb = Object.assign(createEmptyDb(), parsed);
          ensureMemDbShape();
          return;
        }
      }
    } catch (e) {
      console.warn('[Cloud KV] Sync error:', e.message);
    }
  }
}

async function saveFallbackDb() {
  try {
    const temp = dataFile + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(memDb, null, 2), { mode: 0o600 });
    fs.renameSync(temp, dataFile);
  } catch {}
  if (KV_URL && KV_TOKEN) {
    try {
      await executeKv(['SET', 'kidsafe_database', JSON.stringify(memDb)]);
    } catch (e) {
      console.warn('[Cloud KV Save Error]', e.message);
    }
  }
}

// =========================================================================
// 3. UNIFIED DATA ACCESS API
// =========================================================================
function isPgActive() {
  return Boolean(Pool && PG_URL);
}

function isKvActive() {
  return Boolean(KV_URL && KV_TOKEN);
}

function isPersistent() {
  return isPgActive() || isKvActive();
}

function getProviderName() {
  if (isPgActive()) {
    const lower = PG_URL.toLowerCase();
    if (lower.includes('neon')) return 'Neon PostgreSQL';
    if (lower.includes('supabase')) return 'Supabase PostgreSQL';
    if (lower.includes('prisma')) return 'Prisma PostgreSQL';
    return 'PostgreSQL Cloud DB';
  }
  if (isKvActive()) {
    return KV_URL.includes('upstash') ? 'Upstash Redis' : 'Cloud KV';
  }
  return 'Baseline Seed & Ephemeral Container';
}

async function initRequest() {
  if (isPgActive()) {
    await ensurePgReady();
  } else {
    await reloadFallbackDb();
  }
}

async function getStatus() {
  if (isPgActive()) {
    const pool = getPgPool();
    const [p, c, d] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS cnt FROM parents'),
      pool.query('SELECT COUNT(*)::int AS cnt FROM children'),
      pool.query('SELECT COUNT(*)::int AS cnt FROM devices WHERE is_revoked = FALSE')
    ]);
    return {
      isPersistentDb: true,
      isPgActive: true,
      isKvActive: isKvActive(),
      kvProvider: getProviderName(),
      isVercel,
      parentCount: p.rows[0]?.cnt || 0,
      childCount: c.rows[0]?.cnt || 0,
      deviceCount: d.rows[0]?.cnt || 0
    };
  }

  return {
    isPersistentDb: isKvActive(),
    isPgActive: false,
    isKvActive: isKvActive(),
    kvProvider: getProviderName(),
    isVercel,
    parentCount: memDb.parents.length,
    childCount: memDb.children.length,
    deviceCount: memDb.devices.filter(d => !d.isRevoked).length
  };
}

// --- PARENTS ---
async function findParentById(id) {
  if (!id) return null;
  if (isPgActive()) {
    const res = await getPgPool().query('SELECT * FROM parents WHERE id = $1 LIMIT 1', [id]);
    return mapParentRow(res.rows[0]);
  }
  return memDb.parents.find(p => p.id === id) || null;
}

async function findParentByPhone(phone) {
  if (!phone) return null;
  if (isPgActive()) {
    const res = await getPgPool().query('SELECT * FROM parents WHERE phone = $1 LIMIT 1', [phone]);
    return mapParentRow(res.rows[0]);
  }
  return memDb.parents.find(p => p.phone === phone) || null;
}

async function findParentByEmail(email) {
  if (!email) return null;
  const clean = String(email).trim().toLowerCase();
  if (isPgActive()) {
    const res = await getPgPool().query(
      'SELECT * FROM parents WHERE LOWER(email) = $1 OR LOWER(phone) = $1 LIMIT 1',
      [clean]
    );
    return mapParentRow(res.rows[0]);
  }
  return memDb.parents.find(
    p => (p.email && p.email.toLowerCase() === clean) || (p.phone && p.phone.toLowerCase() === clean)
  ) || null;
}

async function findParentByGoogle(email, googleSub) {
  const clean = String(email || '').trim().toLowerCase();
  if (isPgActive()) {
    const res = await getPgPool().query(
      'SELECT * FROM parents WHERE LOWER(email) = $1 OR ($2 <> \'\' AND google_id = $2) LIMIT 1',
      [clean, googleSub || '']
    );
    return mapParentRow(res.rows[0]);
  }
  return memDb.parents.find(
    p => (p.email && p.email.toLowerCase() === clean) || (googleSub && p.googleId === googleSub)
  ) || null;
}

async function getFirstParent() {
  if (isPgActive()) {
    const res = await getPgPool().query('SELECT * FROM parents ORDER BY created_at ASC LIMIT 1');
    return mapParentRow(res.rows[0]);
  }
  return memDb.parents[0] || null;
}

async function ensureParentExists(parent) {
  if (!parent || !parent.id) return null;
  if (isPgActive()) {
    await getPgPool().query(
      `INSERT INTO parents (id, email, phone, display_phone, name, picture, language, theme, auth_provider, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO NOTHING`,
      [
        parent.id,
        parent.email || null,
        parent.phone || null,
        parent.displayPhone || parent.phone || '',
        parent.name || 'Guardian Parent',
        parent.picture || '',
        parent.language || 'en',
        parent.theme || 'light',
        parent.authProvider || 'session',
        Number(parent.createdAt) || Date.now()
      ]
    );
    return findParentById(parent.id);
  }
  const existing = memDb.parents.find(p => p.id === parent.id);
  if (existing) return existing;
  memDb.parents.push(parent);
  await saveFallbackDb();
  return parent;
}

async function upsertParent(parent) {
  if (isPgActive()) {
    await getPgPool().query(
      `INSERT INTO parents (id, email, phone, display_phone, name, picture, language, theme, auth_provider, google_id, is_2fa_active, salt, password_hash, totp_secret, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET
         email = COALESCE(EXCLUDED.email, parents.email),
         phone = COALESCE(EXCLUDED.phone, parents.phone),
         display_phone = EXCLUDED.display_phone,
         name = EXCLUDED.name,
         picture = EXCLUDED.picture,
         language = EXCLUDED.language,
         theme = EXCLUDED.theme,
         auth_provider = EXCLUDED.auth_provider,
         google_id = EXCLUDED.google_id,
         is_2fa_active = EXCLUDED.is_2fa_active,
         salt = EXCLUDED.salt,
         password_hash = EXCLUDED.password_hash,
         totp_secret = EXCLUDED.totp_secret`,
      [
        parent.id,
        parent.email || null,
        parent.phone || null,
        parent.displayPhone || parent.phone || '',
        parent.name || 'Parent Guardian',
        parent.picture || '',
        parent.language || 'en',
        parent.theme || 'light',
        parent.authProvider || 'password',
        parent.googleId || '',
        !!parent.is2FaActive,
        parent.salt || '',
        parent.passwordHash || '',
        parent.totpSecret || '',
        Number(parent.createdAt) || Date.now()
      ]
    );
    return findParentById(parent.id);
  }

  const idx = memDb.parents.findIndex(p => p.id === parent.id);
  if (idx !== -1) memDb.parents[idx] = Object.assign(memDb.parents[idx], parent);
  else memDb.parents.push(parent);
  await saveFallbackDb();
  return parent;
}

// --- CHILDREN ---
async function getChildrenByParent(parentId) {
  if (!parentId) return [];
  if (isPgActive()) {
    const res = await getPgPool().query(
      'SELECT * FROM children WHERE parent_id = $1 ORDER BY created_at ASC, id ASC',
      [parentId]
    );
    return res.rows.map(mapChildRow);
  }
  return memDb.children.filter(c => c.parentId === parentId);
}

async function getChildById(childId) {
  if (!childId) return null;
  if (isPgActive()) {
    const res = await getPgPool().query('SELECT * FROM children WHERE id = $1 LIMIT 1', [childId]);
    return mapChildRow(res.rows[0]);
  }
  return memDb.children.find(c => c.id === childId) || null;
}

async function upsertChild(child) {
  if (isPgActive()) {
    await getPgPool().query(
      `INSERT INTO children (id, parent_id, name, age, avatar, device_name, device_model, battery_level, is_online, last_sync_at, daily_limit_minutes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         age = EXCLUDED.age,
         avatar = EXCLUDED.avatar,
         device_name = EXCLUDED.device_name,
         device_model = EXCLUDED.device_model,
         battery_level = COALESCE(EXCLUDED.battery_level, children.battery_level),
         is_online = EXCLUDED.is_online,
         last_sync_at = GREATEST(children.last_sync_at, EXCLUDED.last_sync_at),
         daily_limit_minutes = EXCLUDED.daily_limit_minutes`,
      [
        child.id,
        child.parentId,
        child.name,
        Number(child.age) || 10,
        child.avatar || 'default',
        child.deviceName || 'Pending Setup',
        child.deviceModel || 'Android Device',
        child.batteryLevel !== null && child.batteryLevel !== undefined ? Number(child.batteryLevel) : null,
        !!child.isOnline,
        Number(child.lastSyncAt) || 0,
        Number(child.dailyLimitMinutes) || 120,
        Number(child.createdAt) || Date.now()
      ]
    );
    return getChildById(child.id);
  }

  const idx = memDb.children.findIndex(c => c.id === child.id);
  if (idx !== -1) memDb.children[idx] = Object.assign(memDb.children[idx], child);
  else memDb.children.push(child);
  if (!memDb.limits[child.id]) memDb.limits[child.id] = [];
  await saveFallbackDb();
  return child;
}

async function deleteChild(childId, parentId) {
  if (isPgActive()) {
    const client = await getPgPool().connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT * FROM children WHERE id = $1 AND parent_id = $2 LIMIT 1',
        [childId, parentId]
      );
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      const removed = mapChildRow(existing.rows[0]);
      await client.query('DELETE FROM daily_reports WHERE child_id = $1', [childId]);
      await client.query('DELETE FROM app_limits WHERE child_id = $1', [childId]);
      await client.query('DELETE FROM alerts WHERE child_id = $1', [childId]);
      await client.query('DELETE FROM pairing_sessions WHERE child_id = $1', [childId]);
      await client.query('DELETE FROM devices WHERE child_id = $1', [childId]);
      await client.query('DELETE FROM children WHERE id = $1 AND parent_id = $2', [childId, parentId]);
      await client.query('COMMIT');
      return removed;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  const idx = memDb.children.findIndex(c => c.id === childId && c.parentId === parentId);
  if (idx === -1) return null;
  const removed = memDb.children.splice(idx, 1)[0];
  delete memDb.reports[childId];
  delete memDb.limits[childId];
  memDb.alerts = memDb.alerts.filter(a => a.childId !== childId);
  memDb.pairingSessions = memDb.pairingSessions.filter(s => s.childId !== childId);
  memDb.devices = memDb.devices.filter(d => d.childId !== childId);
  await saveFallbackDb();
  return removed;
}

async function syncMissingChildren(parentId, incomingChildren) {
  if (!Array.isArray(incomingChildren) || incomingChildren.length === 0) {
    return getChildrenByParent(parentId);
  }
  for (const inc of incomingChildren) {
    if (!inc || !inc.name) continue;
    const incId = inc.id || `child-${Date.now()}`;
    const existing = await getChildById(incId);
    if (!existing) {
      await upsertChild({
        id: incId,
        parentId,
        name: String(inc.name).trim(),
        age: Number(inc.age) || 10,
        avatar: inc.avatar || String(inc.name).toLowerCase().replace(/[^a-z]/g, '') || 'default',
        deviceName: inc.deviceName || 'Pending Setup',
        deviceModel: inc.deviceModel || 'Android Device',
        batteryLevel: inc.batteryLevel !== undefined ? inc.batteryLevel : null,
        isOnline: !!inc.isOnline,
        lastSyncAt: Number(inc.lastSyncAt) || 0,
        dailyLimitMinutes: Number(inc.dailyLimitMinutes) || 120,
        createdAt: Number(inc.createdAt) || Date.now()
      });
    }
  }
  return getChildrenByParent(parentId);
}

// --- DEVICES ---
async function getDevicesByParent(parentId) {
  if (isPgActive()) {
    const res = await getPgPool().query(
      `SELECT d.*, c.name AS child_name
       FROM devices d
       LEFT JOIN children c ON c.id = d.child_id
       WHERE d.is_revoked = FALSE AND (d.parent_id = $1 OR c.parent_id = $1)
       ORDER BY d.paired_at DESC`,
      [parentId]
    );
    return res.rows.map(r => ({
      ...mapDeviceRow(r),
      childName: r.child_name || 'Child'
    }));
  }

  return memDb.devices
    .filter(d => {
      if (d.isRevoked) return false;
      const child = memDb.children.find(c => c.id === d.childId);
      return d.parentId === parentId || (child && child.parentId === parentId);
    })
    .map(d => {
      const child = memDb.children.find(c => c.id === d.childId);
      return { ...d, childName: child?.name || 'Child' };
    });
}

async function getDeviceById(deviceId) {
  if (!deviceId) return null;
  if (isPgActive()) {
    const res = await getPgPool().query('SELECT * FROM devices WHERE id = $1 LIMIT 1', [deviceId]);
    return mapDeviceRow(res.rows[0]);
  }
  return memDb.devices.find(d => d.id === deviceId) || null;
}

async function findDeviceByToken(token) {
  if (!token) return null;
  if (isPgActive()) {
    const res = await getPgPool().query('SELECT * FROM devices WHERE token = $1 LIMIT 1', [token]);
    return mapDeviceRow(res.rows[0]);
  }
  return memDb.devices.find(d => d.token === token) || null;
}

async function upsertDevice(device) {
  if (isPgActive()) {
    await getPgPool().query(
      `INSERT INTO devices (id, child_id, parent_id, device_name, device_model, android_version, app_guid, token, paired_at, last_sync_at, battery_level, is_online, is_revoked)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         child_id = EXCLUDED.child_id,
         parent_id = COALESCE(NULLIF(EXCLUDED.parent_id, ''), devices.parent_id),
         device_name = EXCLUDED.device_name,
         device_model = EXCLUDED.device_model,
         android_version = EXCLUDED.android_version,
         last_sync_at = GREATEST(devices.last_sync_at, EXCLUDED.last_sync_at),
         battery_level = COALESCE(EXCLUDED.battery_level, devices.battery_level),
         is_online = EXCLUDED.is_online,
         is_revoked = EXCLUDED.is_revoked`,
      [
        device.id,
        device.childId,
        device.parentId || '',
        device.deviceName || 'Android Device',
        device.deviceModel || 'Android Phone',
        device.androidVersion || 'Android 14',
        device.appGuid || '',
        device.token,
        Number(device.pairedAt) || Date.now(),
        Number(device.lastSyncAt) || Date.now(),
        device.batteryLevel !== null && device.batteryLevel !== undefined ? Number(device.batteryLevel) : null,
        !!device.isOnline,
        !!device.isRevoked
      ]
    );
    return getDeviceById(device.id);
  }

  const idx = memDb.devices.findIndex(d => d.id === device.id);
  if (idx !== -1) memDb.devices[idx] = Object.assign(memDb.devices[idx], device);
  else memDb.devices.push(device);
  await saveFallbackDb();
  return device;
}

async function revokeDevice(deviceId) {
  if (isPgActive()) {
    const res = await getPgPool().query(
      'UPDATE devices SET is_revoked = TRUE, is_online = FALSE WHERE id = $1 RETURNING *',
      [deviceId]
    );
    return mapDeviceRow(res.rows[0]);
  }
  const device = memDb.devices.find(d => d.id === deviceId);
  if (!device) return null;
  device.isRevoked = true;
  device.isOnline = false;
  await saveFallbackDb();
  return device;
}

// --- PAIRING SESSIONS ---
async function invalidatePendingPairingForChild(childId) {
  if (isPgActive()) {
    await getPgPool().query(
      "UPDATE pairing_sessions SET status = 'superseded' WHERE child_id = $1 AND status = 'pending'",
      [childId]
    );
    return;
  }
  memDb.pairingSessions = memDb.pairingSessions.filter(
    s => !(s.childId === childId && s.status === 'pending')
  );
  await saveFallbackDb();
}

async function createPairingSession(session) {
  if (isPgActive()) {
    await getPgPool().query(
      `INSERT INTO pairing_sessions (id, parent_id, child_id, child_name, code, code_hash, expires_at, status, created_at, consumed_at, device_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        session.id,
        session.parentId,
        session.childId,
        session.childName,
        session.code,
        session.codeHash || '',
        Number(session.expiresAt),
        session.status || 'pending',
        Number(session.createdAt) || Date.now(),
        session.consumedAt ? Number(session.consumedAt) : null,
        session.deviceId || null
      ]
    );
    return session;
  }
  memDb.pairingSessions.push(session);
  await saveFallbackDb();
  return session;
}

async function findPendingPairingByCleanCode(cleanCode) {
  if (!cleanCode) return null;
  if (isPgActive()) {
    const res = await getPgPool().query(
      `SELECT * FROM pairing_sessions
       WHERE status = 'pending'
         AND REGEXP_REPLACE(UPPER(code), '[^A-Z0-9]', '', 'g') = $1
       ORDER BY created_at DESC LIMIT 1`,
      [cleanCode.toUpperCase()]
    );
    return mapPairingRow(res.rows[0]);
  }
  return (
    memDb.pairingSessions.find(s => {
      const cleanS = String(s.code || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      return cleanS === cleanCode.toUpperCase() && s.status === 'pending';
    }) || null
  );
}

async function updatePairingSession(session) {
  if (isPgActive()) {
    await getPgPool().query(
      `UPDATE pairing_sessions
       SET status = $2, consumed_at = $3, device_id = $4
       WHERE id = $1`,
      [session.id, session.status, session.consumedAt ? Number(session.consumedAt) : null, session.deviceId || null]
    );
    return session;
  }
  const idx = memDb.pairingSessions.findIndex(s => s.id === session.id);
  if (idx !== -1) memDb.pairingSessions[idx] = Object.assign(memDb.pairingSessions[idx], session);
  await saveFallbackDb();
  return session;
}

// --- REPORTS ---
async function getReportsForChild(childId) {
  if (!childId) return {};
  if (isPgActive()) {
    const res = await getPgPool().query(
      'SELECT * FROM daily_reports WHERE child_id = $1 ORDER BY day DESC LIMIT 90',
      [childId]
    );
    const map = {};
    for (const row of res.rows) {
      const mapped = mapReportRow(row);
      map[mapped.day] = mapped;
    }
    return map;
  }
  return memDb.reports[childId] || {};
}

async function getReportForChildDay(childId, day) {
  if (!childId || !day) return null;
  if (isPgActive()) {
    const res = await getPgPool().query(
      'SELECT * FROM daily_reports WHERE child_id = $1 AND day = $2 LIMIT 1',
      [childId, day]
    );
    return mapReportRow(res.rows[0]);
  }
  return (memDb.reports[childId] && memDb.reports[childId][day]) || null;
}

async function upsertReport(report) {
  if (isPgActive()) {
    await getPgPool().query(
      `INSERT INTO daily_reports (child_id, day, total_screen_time_ms, screen_unlocks_approx, apps_json, timeline_json, hourly_activity_json, category_breakdown_json, received_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9)
       ON CONFLICT (child_id, day) DO UPDATE SET
         total_screen_time_ms = EXCLUDED.total_screen_time_ms,
         screen_unlocks_approx = EXCLUDED.screen_unlocks_approx,
         apps_json = EXCLUDED.apps_json,
         timeline_json = EXCLUDED.timeline_json,
         hourly_activity_json = EXCLUDED.hourly_activity_json,
         category_breakdown_json = EXCLUDED.category_breakdown_json,
         received_at = EXCLUDED.received_at`,
      [
        report.childId,
        report.day,
        Number(report.totalScreenTimeMs) || 0,
        Number(report.screenUnlocksApprox) || 0,
        JSON.stringify(report.apps || []),
        JSON.stringify(report.timeline || []),
        JSON.stringify(report.hourlyActivity || Array(24).fill(0)),
        JSON.stringify(report.categoryBreakdown || {}),
        Number(report.receivedAt) || Date.now()
      ]
    );
    return report;
  }
  if (!memDb.reports[report.childId]) memDb.reports[report.childId] = {};
  memDb.reports[report.childId][report.day] = report;
  await saveFallbackDb();
  return report;
}

// --- LIMITS ---
async function getLimitsForChild(childId) {
  if (!childId) return [];
  if (isPgActive()) {
    const res = await getPgPool().query(
      'SELECT * FROM app_limits WHERE child_id = $1 ORDER BY name ASC',
      [childId]
    );
    return res.rows.map(mapLimitRow);
  }
  return memDb.limits[childId] || [];
}

async function upsertLimit(childId, limit) {
  if (isPgActive()) {
    await getPgPool().query(
      `INSERT INTO app_limits (child_id, package, name, category, daily_limit_minutes, is_blocked)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (child_id, package) DO UPDATE SET
         name = COALESCE(NULLIF(EXCLUDED.name, ''), app_limits.name),
         category = COALESCE(NULLIF(EXCLUDED.category, ''), app_limits.category),
         daily_limit_minutes = EXCLUDED.daily_limit_minutes,
         is_blocked = EXCLUDED.is_blocked`,
      [
        childId,
        limit.package,
        limit.name || limit.package,
        limit.category || 'Other',
        Number(limit.dailyLimitMinutes) || 30,
        Boolean(limit.isBlocked)
      ]
    );
    return getLimitsForChild(childId);
  }

  if (!memDb.limits[childId]) memDb.limits[childId] = [];
  const existing = memDb.limits[childId].find(l => l.package === limit.package);
  if (existing) {
    if (limit.dailyLimitMinutes !== undefined) existing.dailyLimitMinutes = Number(limit.dailyLimitMinutes);
    if (limit.isBlocked !== undefined) existing.isBlocked = Boolean(limit.isBlocked);
  } else {
    memDb.limits[childId].push(limit);
  }
  await saveFallbackDb();
  return memDb.limits[childId];
}

async function replaceLimitsAndDailyLimit(childId, limitsArray, dailyLimitMinutes, categorizeFn) {
  if (isPgActive()) {
    const client = await getPgPool().connect();
    try {
      await client.query('BEGIN');
      if (Number.isFinite(dailyLimitMinutes) && dailyLimitMinutes > 0) {
        await client.query('UPDATE children SET daily_limit_minutes = $2 WHERE id = $1', [childId, dailyLimitMinutes]);
      }
      if (Array.isArray(limitsArray)) {
        for (const item of limitsArray) {
          if (!item || !item.package) continue;
          const cat = categorizeFn(item.package);
          await client.query(
            `INSERT INTO app_limits (child_id, package, name, category, daily_limit_minutes, is_blocked)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (child_id, package) DO UPDATE SET
               daily_limit_minutes = EXCLUDED.daily_limit_minutes,
               is_blocked = EXCLUDED.is_blocked`,
            [
              childId,
              item.package,
              item.name || cat.name,
              item.category || cat.category,
              Number(item.dailyLimitMinutes) || 30,
              Boolean(item.isBlocked)
            ]
          );
        }
      }
      await client.query('COMMIT');
      return getLimitsForChild(childId);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  if (Number.isFinite(dailyLimitMinutes) && dailyLimitMinutes > 0) {
    const child = memDb.children.find(c => c.id === childId);
    if (child) child.dailyLimitMinutes = dailyLimitMinutes;
  }
  if (Array.isArray(limitsArray)) {
    if (!memDb.limits[childId]) memDb.limits[childId] = [];
    for (const item of limitsArray) {
      if (!item || !item.package) continue;
      const existing = memDb.limits[childId].find(l => l.package === item.package);
      if (existing) {
        if (item.dailyLimitMinutes !== undefined) existing.dailyLimitMinutes = Number(item.dailyLimitMinutes);
        if (item.isBlocked !== undefined) existing.isBlocked = Boolean(item.isBlocked);
      } else {
        const cat = categorizeFn(item.package);
        memDb.limits[childId].push({
          package: item.package,
          name: item.name || cat.name,
          category: item.category || cat.category,
          dailyLimitMinutes: Number(item.dailyLimitMinutes) || 30,
          isBlocked: Boolean(item.isBlocked)
        });
      }
    }
  }
  await saveFallbackDb();
  return memDb.limits[childId] || [];
}

// --- ALERTS ---
async function getAlertsForChild(childId) {
  if (!childId) return [];
  if (isPgActive()) {
    const res = await getPgPool().query(
      'SELECT * FROM alerts WHERE child_id = $1 ORDER BY timestamp DESC LIMIT 100',
      [childId]
    );
    return res.rows.map(mapAlertRow);
  }
  return memDb.alerts.filter(a => a.childId === childId);
}

async function addAlertIfNotExists(alert) {
  if (isPgActive()) {
    const res = await getPgPool().query(
      `INSERT INTO alerts (id, child_id, child_name, type, title, description, severity, timestamp, is_read)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [
        alert.id,
        alert.childId,
        alert.childName || 'Child',
        alert.type,
        alert.title,
        alert.description || '',
        alert.severity || 'info',
        Number(alert.timestamp) || Date.now(),
        !!alert.isRead
      ]
    );
    return res.rows.length > 0;
  }

  if (memDb.alerts.some(a => a.id === alert.id)) return false;
  memDb.alerts.unshift(alert);
  await saveFallbackDb();
  return true;
}

async function markAlertRead(alertId) {
  if (!alertId) return;
  if (isPgActive()) {
    await getPgPool().query('UPDATE alerts SET is_read = TRUE WHERE id = $1', [alertId]);
    return;
  }
  const alert = memDb.alerts.find(a => a.id === alertId);
  if (alert) {
    alert.isRead = true;
    await saveFallbackDb();
  }
}

// --- AUDIT LOGS ---
async function addAuditLog(entry) {
  if (isPgActive()) {
    await getPgPool().query(
      `INSERT INTO audit_logs (id, type, title, details, timestamp)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      [entry.id, entry.type, entry.title, entry.details || '', Number(entry.timestamp) || Date.now()]
    );
    return;
  }
  memDb.auditLogs.unshift(entry);
  if (memDb.auditLogs.length > 500) memDb.auditLogs.length = 500;
  await saveFallbackDb();
}

// --- SETTINGS ---
async function getSettings() {
  if (isPgActive()) {
    const res = await getPgPool().query("SELECT value_json FROM app_settings WHERE key = 'general' LIMIT 1");
    const saved = res.rows[0]?.value_json || {};
    return { ...DEFAULT_SETTINGS, ...saved };
  }
  return { ...DEFAULT_SETTINGS, ...(memDb.settings || {}) };
}

async function updateSettings(partial) {
  const current = await getSettings();
  const merged = { ...current, ...partial };
  if (isPgActive()) {
    await getPgPool().query(
      `INSERT INTO app_settings (key, value_json) VALUES ('general', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json`,
      [JSON.stringify(merged)]
    );
    return merged;
  }
  memDb.settings = merged;
  await saveFallbackDb();
  return merged;
}

// --- BACKUP / RESTORE / ACCOUNT DELETE ---
async function exportFullDatabase() {
  if (isPgActive()) {
    const pool = getPgPool();
    const [parentsR, childrenR, devicesR, pairingR, reportsR, limitsR, alertsR, auditsR, settings] = await Promise.all([
      pool.query('SELECT * FROM parents ORDER BY created_at ASC'),
      pool.query('SELECT * FROM children ORDER BY created_at ASC'),
      pool.query('SELECT * FROM devices ORDER BY paired_at DESC'),
      pool.query('SELECT * FROM pairing_sessions ORDER BY created_at DESC'),
      pool.query('SELECT * FROM daily_reports ORDER BY day DESC'),
      pool.query('SELECT * FROM app_limits'),
      pool.query('SELECT * FROM alerts ORDER BY timestamp DESC'),
      pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500'),
      getSettings()
    ]);

    const reports = {};
    for (const row of reportsR.rows) {
      const m = mapReportRow(row);
      if (!reports[m.childId]) reports[m.childId] = {};
      reports[m.childId][m.day] = m;
    }

    const limits = {};
    for (const row of limitsR.rows) {
      if (!limits[row.child_id]) limits[row.child_id] = [];
      limits[row.child_id].push(mapLimitRow(row));
    }

    return {
      parents: parentsR.rows.map(mapParentRow),
      children: childrenR.rows.map(mapChildRow),
      devices: devicesR.rows.map(mapDeviceRow),
      pairingSessions: pairingR.rows.map(mapPairingRow),
      reports,
      limits,
      alerts: alertsR.rows.map(mapAlertRow),
      auditLogs: auditsR.rows.map(r => ({
        id: r.id,
        type: r.type,
        title: r.title,
        details: r.details,
        timestamp: Number(r.timestamp) || 0
      })),
      settings
    };
  }
  return memDb;
}

async function restoreFullDatabase(body) {
  if (isPgActive()) {
    const client = await getPgPool().connect();
    try {
      await client.query('BEGIN');
      for (const p of body.parents || []) {
        await client.query(
          `INSERT INTO parents (id, email, phone, display_phone, name, picture, language, theme, auth_provider, google_id, is_2fa_active, salt, password_hash, totp_secret, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (id) DO UPDATE SET
             email = COALESCE(EXCLUDED.email, parents.email),
             phone = COALESCE(EXCLUDED.phone, parents.phone),
             display_phone = EXCLUDED.display_phone,
             name = EXCLUDED.name,
             salt = EXCLUDED.salt,
             password_hash = EXCLUDED.password_hash`,
          [
            p.id, p.email || null, p.phone || null, p.displayPhone || p.phone || '', p.name || 'Parent Guardian',
            p.picture || '', p.language || 'en', p.theme || 'light', p.authProvider || 'password',
            p.googleId || '', !!p.is2FaActive, p.salt || '', p.passwordHash || '', p.totpSecret || '',
            Number(p.createdAt) || Date.now()
          ]
        );
      }

      for (const c of body.children || []) {
        await client.query(
          `INSERT INTO children (id, parent_id, name, age, avatar, device_name, device_model, battery_level, is_online, last_sync_at, daily_limit_minutes, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             age = EXCLUDED.age,
             device_name = EXCLUDED.device_name,
             device_model = EXCLUDED.device_model,
             daily_limit_minutes = EXCLUDED.daily_limit_minutes`,
          [
            c.id, c.parentId, c.name, Number(c.age) || 10, c.avatar || 'default',
            c.deviceName || 'Pending Setup', c.deviceModel || 'Android Device',
            c.batteryLevel !== null && c.batteryLevel !== undefined ? Number(c.batteryLevel) : null,
            !!c.isOnline, Number(c.lastSyncAt) || 0, Number(c.dailyLimitMinutes) || 120, Number(c.createdAt) || Date.now()
          ]
        );
      }

      for (const d of body.devices || []) {
        await client.query(
          `INSERT INTO devices (id, child_id, parent_id, device_name, device_model, android_version, app_guid, token, paired_at, last_sync_at, battery_level, is_online, is_revoked)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (id) DO NOTHING`,
          [
            d.id, d.childId, d.parentId || '', d.deviceName || 'Android Device', d.deviceModel || 'Android Phone',
            d.androidVersion || 'Android 14', d.appGuid || '', d.token, Number(d.pairedAt) || Date.now(),
            Number(d.lastSyncAt) || 0, d.batteryLevel !== null && d.batteryLevel !== undefined ? Number(d.batteryLevel) : null,
            !!d.isOnline, !!d.isRevoked
          ]
        );
      }

      if (body.reports && typeof body.reports === 'object') {
        for (const [childId, daysMap] of Object.entries(body.reports)) {
          if (!daysMap || typeof daysMap !== 'object') continue;
          for (const [day, rep] of Object.entries(daysMap)) {
            if (!rep) continue;
            await client.query(
              `INSERT INTO daily_reports (child_id, day, total_screen_time_ms, screen_unlocks_approx, apps_json, timeline_json, hourly_activity_json, category_breakdown_json, received_at)
               VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9)
               ON CONFLICT (child_id, day) DO UPDATE SET
                 total_screen_time_ms = GREATEST(daily_reports.total_screen_time_ms, EXCLUDED.total_screen_time_ms)`,
              [
                childId, day, Number(rep.totalScreenTimeMs) || 0, Number(rep.screenUnlocksApprox) || 0,
                JSON.stringify(rep.apps || []), JSON.stringify(rep.timeline || []),
                JSON.stringify(rep.hourlyActivity || Array(24).fill(0)),
                JSON.stringify(rep.categoryBreakdown || {}), Number(rep.receivedAt) || Date.now()
              ]
            );
          }
        }
      }

      if (body.limits && typeof body.limits === 'object') {
        for (const [childId, limList] of Object.entries(body.limits)) {
          if (!Array.isArray(limList)) continue;
          for (const lim of limList) {
            if (!lim || !lim.package) continue;
            await client.query(
              `INSERT INTO app_limits (child_id, package, name, category, daily_limit_minutes, is_blocked)
               VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (child_id, package) DO NOTHING`,
              [childId, lim.package, lim.name || lim.package, lim.category || 'Other', Number(lim.dailyLimitMinutes) || 30, !!lim.isBlocked]
            );
          }
        }
      }

      if (Array.isArray(body.pairingSessions)) {
        for (const s of body.pairingSessions) {
          if (!s || !s.id) continue;
          await client.query(
            `INSERT INTO pairing_sessions (id, parent_id, child_id, child_name, code, code_hash, expires_at, status, created_at, consumed_at, device_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
            [
              s.id, s.parentId, s.childId, s.childName || 'Child', s.code, s.codeHash || '',
              Number(s.expiresAt) || 0, s.status || 'pending', Number(s.createdAt) || Date.now(),
              s.consumedAt ? Number(s.consumedAt) : null, s.deviceId || null
            ]
          );
        }
      }

      if (body.settings && typeof body.settings === 'object') {
        await client.query(
          `INSERT INTO app_settings (key, value_json) VALUES ('general', $1::jsonb)
           ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json`,
          [JSON.stringify({ ...DEFAULT_SETTINGS, ...body.settings })]
        );
      }

      await client.query(
        `INSERT INTO app_settings (key, value_json) VALUES ('initial_seed_applied', $1::jsonb) ON CONFLICT (key) DO NOTHING`,
        [JSON.stringify({ applied: true, appliedAt: Date.now() })]
      );
      await client.query('COMMIT');
      return;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  memDb = Object.assign(createEmptyDb(), body);
  ensureMemDbShape();
  await saveFallbackDb();
}

async function deleteParentAccount(parentId) {
  if (!parentId) return;
  if (isPgActive()) {
    const client = await getPgPool().connect();
    try {
      await client.query('BEGIN');
      const childrenRes = await client.query('SELECT id FROM children WHERE parent_id = $1', [parentId]);
      const childIds = childrenRes.rows.map(r => r.id);
      if (childIds.length > 0) {
        await client.query('DELETE FROM daily_reports WHERE child_id = ANY($1::text[])', [childIds]);
        await client.query('DELETE FROM app_limits WHERE child_id = ANY($1::text[])', [childIds]);
        await client.query('DELETE FROM alerts WHERE child_id = ANY($1::text[])', [childIds]);
      }
      await client.query('DELETE FROM pairing_sessions WHERE parent_id = $1', [parentId]);
      await client.query('DELETE FROM devices WHERE parent_id = $1', [parentId]);
      await client.query('DELETE FROM children WHERE parent_id = $1', [parentId]);
      await client.query('DELETE FROM parents WHERE id = $1', [parentId]);
      await client.query('COMMIT');
      return;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  const childIds = new Set(memDb.children.filter(c => c.parentId === parentId).map(c => c.id));
  for (const cid of childIds) {
    delete memDb.reports[cid];
    delete memDb.limits[cid];
  }
  memDb.alerts = memDb.alerts.filter(a => !childIds.has(a.childId));
  memDb.pairingSessions = memDb.pairingSessions.filter(s => s.parentId !== parentId);
  memDb.devices = memDb.devices.filter(d => d.parentId !== parentId && !childIds.has(d.childId));
  memDb.children = memDb.children.filter(c => c.parentId !== parentId);
  memDb.parents = memDb.parents.filter(p => p.id !== parentId);
  await saveFallbackDb();
}

module.exports = {
  initRequest,
  isPgActive,
  isKvActive,
  isPersistent,
  getProviderName,
  getStatus,
  findParentById,
  findParentByPhone,
  findParentByEmail,
  findParentByGoogle,
  getFirstParent,
  ensureParentExists,
  upsertParent,
  getChildrenByParent,
  getChildById,
  upsertChild,
  deleteChild,
  syncMissingChildren,
  getDevicesByParent,
  getDeviceById,
  findDeviceByToken,
  upsertDevice,
  revokeDevice,
  invalidatePendingPairingForChild,
  createPairingSession,
  findPendingPairingByCleanCode,
  updatePairingSession,
  getReportsForChild,
  getReportForChildDay,
  upsertReport,
  getLimitsForChild,
  upsertLimit,
  replaceLimitsAndDailyLimit,
  getAlertsForChild,
  addAlertIfNotExists,
  markAlertRead,
  addAuditLog,
  getSettings,
  updateSettings,
  exportFullDatabase,
  restoreFullDatabase,
  deleteParentAccount
};
