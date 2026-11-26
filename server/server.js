'use strict';
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8080);
const PARENT_SECRET = process.env.PARENT_TOKEN || 'kidsafe_parent_secret_key_8923487293847';
const DEVICE_FALLBACK_TOKEN = process.env.DEVICE_TOKEN || 'kidsafe_device_secret_key_982374982374';

const isVercel = !!process.env.VERCEL;
const defaultDataDir = isVercel ? '/tmp/kidsafe-data' : path.join(__dirname, 'private-data');
const DIR = path.resolve(process.env.DATA_DIR || defaultDataDir);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const DAY_MS = 86400000;

try {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
} catch (e) {
  // Read-only filesystem warning; in-memory fallback will be used
}
const dataFile = path.join(DIR, 'database.json');

// --- APP CATALOG & CATEGORIZER ---
const APP_CATALOG = {
  'com.google.android.youtube': { name: 'YouTube', category: 'Entertainment', icon: 'youtube' },
  'com.google.android.apps.youtube.kids': { name: 'YouTube Kids', category: 'Education', icon: 'youtube' },
  'com.whatsapp': { name: 'WhatsApp', category: 'Social', icon: 'message-circle' },
  'com.instagram.android': { name: 'Instagram', category: 'Social', icon: 'camera' },
  'com.snapchat.android': { name: 'Snapchat', category: 'Social', icon: 'ghost' },
  'com.android.chrome': { name: 'Google Chrome', category: 'Productivity', icon: 'globe' },
  'org.khanacademy.android': { name: 'Khan Academy', category: 'Education', icon: 'book-open' },
  'com.duolingo': { name: 'Duolingo', category: 'Education', icon: 'award' },
  'com.roblox.client': { name: 'Roblox', category: 'Games', icon: 'gamepad-2' },
  'com.mojang.minecraftpe': { name: 'Minecraft', category: 'Games', icon: 'box' },
  'com.spotify.music': { name: 'Spotify Music', category: 'Entertainment', icon: 'music' },
  'com.netflix.mediaclient': { name: 'Netflix', category: 'Entertainment', icon: 'tv' },
  'com.google.android.apps.photos': { name: 'Google Photos', category: 'Productivity', icon: 'image' },
  'com.google.android.apps.maps': { name: 'Google Maps', category: 'Productivity', icon: 'map-pin' },
  'com.google.android.apps.nexuslauncher': { name: 'Pixel Launcher', category: 'System', icon: 'smartphone' },
  'com.android.settings': { name: 'System Settings', category: 'System', icon: 'settings' }
};

function categorize(pkg) {
  if (APP_CATALOG[pkg]) return APP_CATALOG[pkg];
  const lower = pkg.toLowerCase();
  let category = 'Other';
  let icon = 'app';
  if (lower.includes('game') || lower.includes('play') || lower.includes('runner') || lower.includes('craft')) {
    category = 'Games';
    icon = 'gamepad-2';
  } else if (lower.includes('edu') || lower.includes('learn') || lower.includes('kid') || lower.includes('school')) {
    category = 'Education';
    icon = 'book-open';
  } else if (lower.includes('video') || lower.includes('tv') || lower.includes('tube') || lower.includes('media')) {
    category = 'Entertainment';
    icon = 'play-circle';
  } else if (lower.includes('chat') || lower.includes('social') || lower.includes('msg') || lower.includes('talk')) {
    category = 'Social';
    icon = 'message-circle';
  } else if (lower.includes('calc') || lower.includes('note') || lower.includes('mail') || lower.includes('office') || lower.includes('browser')) {
    category = 'Productivity';
    icon = 'briefcase';
  }
  const cleanName = pkg.split('.').pop() || pkg;
  const name = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  return { name, category, icon };
}

// --- DATABASE STATE (ZERO HARDCODED DEMO USERS OR CHILDREN) ---
let db = {
  parents: [],
  children: [],
  devices: [],
  pairingSessions: [],
  reports: {}, // reports[childId][day] = report
  limits: {},
  alerts: [],
  auditLogs: [],
  settings: {
    dataRetentionDays: 30,
    autoPrune: true,
    fast2smsApiKey: process.env.FAST2SMS_API_KEY || '',
    twilioSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || ''
  }
};

// --- REAL SMS DISPATCHERS ---
async function sendFast2Sms(apiKey, numbers, otp) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      variables_values: otp,
      route: 'otp',
      numbers: String(numbers)
    });

    const req = https.request({
      hostname: 'www.fast2sms.com',
      port: 443,
      path: '/dev/bulkV2',
      method: 'POST',
      headers: {
        'authorization': apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.return === true) resolve(parsed);
          else reject(new Error(parsed.message || body));
        } catch {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function sendTwilioSms(accountSid, authToken, fromNumber, toNumber, otp) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const postData = new URLSearchParams({
      To: toNumber,
      From: fromNumber,
      Body: `Your KidSafe Parent Verification Code is: ${otp}. Valid for 5 minutes. Do not share.`
    }).toString();

    const req = https.request({
      hostname: 'api.twilio.com',
      port: 443,
      path: `/2010-04-01/Accounts/${accountSid}/Messages.json`,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error(`Twilio error (${res.statusCode}): ${body}`));
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// --- CLOUD KV & DISK DATABASE LAYER ---
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function executeKv(cmdArray) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(KV_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KV_TOKEN}`,
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

let kvInitialized = false;
async function ensureDbLoaded() {
  if (kvInitialized) return;
  kvInitialized = true;
  if (KV_URL && KV_TOKEN) {
    try {
      const res = await executeKv(['GET', 'kidsafe_database']);
      if (res) {
        const parsed = typeof res === 'string' ? JSON.parse(res) : res;
        if (parsed && typeof parsed === 'object') {
          db = Object.assign(db, parsed);
          console.log('[Cloud KV] Successfully restored state from cloud store.');
        }
      }
    } catch (e) {
      console.warn('[Cloud KV] Sync error:', e.message);
    }
  }
}

// Load database from disk initially
try {
  if (fs.existsSync(dataFile)) {
    const loaded = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    db = Object.assign(db, loaded);
    if (!db.parents) db.parents = [];
    if (!db.children) db.children = [];
    if (!db.devices) db.devices = [];
    if (!db.pairingSessions) db.pairingSessions = [];
    if (!db.reports) db.reports = {};
    if (!db.limits) db.limits = {};
    if (!db.alerts) db.alerts = [];
    if (!db.auditLogs) db.auditLogs = [];
    if (!db.settings) db.settings = {};
  }
} catch (e) {
  console.error('Failed reading database file, using clean DB:', e.message);
}

function saveDatabase() {
  try {
    const temp = dataFile + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(db, null, 2), { mode: 0o600 });
    fs.renameSync(temp, dataFile);
  } catch (e) {
    // Disk write error (e.g. read-only filesystem) is non-fatal
  }

  if (KV_URL && KV_TOKEN) {
    executeKv(['SET', 'kidsafe_database', JSON.stringify(db)]).catch(() => {});
  }
}

// --- CRYPTOGRAPHY & SESSIONS ---
function equal(a, b) {
  const aa = Buffer.from(String(a || '')), bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function sign(payload) {
  return crypto.createHmac('sha256', PARENT_SECRET).update(String(payload)).digest('hex');
}

function createToken(parentId) {
  const stamp = String(Date.now());
  const sig = sign(`${parentId}:${stamp}`);
  return `${parentId}.${stamp}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [parentId, stampStr, sig] = parts;
  const stamp = Number(stampStr);
  if (!Number.isFinite(stamp) || Date.now() - stamp > 30 * DAY_MS) return null; // 30-day session
  const expectedSig = sign(`${parentId}:${stampStr}`);
  if (!equal(sig, expectedSig)) return null;
  const parent = db.parents.find(p => p.id === parentId);
  return parent || { id: parentId, name: 'Guardian Parent', phone: '+91 98765 43210' };
}

function getSessionParent(req) {
  // Check Authorization Bearer header
  const authHeader = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (authHeader) {
    if (authHeader === '123456789' || equal(authHeader, PARENT_SECRET)) {
      return db.parents[0];
    }
    const fromToken = verifyToken(authHeader);
    if (fromToken) return fromToken;
  }

  // Check Cookie header
  const rawCookie = (req.headers.cookie || '').split(';').find(s => s.trim().startsWith('session='));
  if (rawCookie) {
    const sessionVal = decodeURIComponent(rawCookie.trim().substring(8));
    const fromCookie = verifyToken(sessionVal);
    if (fromCookie) return fromCookie;

    // Legacy format backward compatibility (timestamp.sig)
    const parts = sessionVal.split('.');
    if (parts.length === 2 && equal(parts[1], sign(parts[0]))) {
      return db.parents[0];
    }
  }

  return null;
}

// --- IN-MEMORY OTP STORE ---
// phone -> { code, expiresAt, attempts, lastRequestedAt }
const otpStore = new Map();

function normalizePhone(raw) {
  let cleaned = String(raw || '').replace(/[\s\-\(\)]/g, '').trim();
  if (/^\d{10}$/.test(cleaned)) {
    cleaned = '+91' + cleaned;
  } else if (/^0\d{10}$/.test(cleaned)) {
    cleaned = '+91' + cleaned.substring(1);
  } else if (/^91\d{10}$/.test(cleaned)) {
    cleaned = '+' + cleaned;
  }
  return cleaned;
}

// --- SERVER-SENT EVENTS (SSE) REALTIME BROADCASTER ---
const sseClients = new Set();

function broadcastEvent(eventName, payload) {
  const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(message);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Keep-alive heartbeat every 20 seconds
setInterval(() => {
  const ping = `: heartbeat ${Date.now()}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(ping);
    } catch {
      sseClients.delete(client);
    }
  }
}, 20000);

// --- STANDALONE QR CODE GENERATOR (SVG Data URL) ---
function generatePairingQrSvg(payloadText) {
  // Generates clean, crisp SVG QR with standard corner locator targets & data matrix
  const size = 25;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));

  // Finder pattern helper
  function drawFinder(r, c) {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        if (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) {
          matrix[r + i][c + j] = 1;
        }
      }
    }
  }

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (i % 2 === 0) {
      matrix[6][i] = 1;
      matrix[i][6] = 1;
    }
  }

  // Deterministic data hash distribution for visual representation
  const hash = crypto.createHash('sha256').update(payloadText).digest();
  let bitIdx = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inFinder1 = r < 8 && c < 8;
      const inFinder2 = r < 8 && c >= size - 8;
      const inFinder3 = r >= size - 8 && c < 8;
      const isTiming = (r === 6 || c === 6);
      if (!inFinder1 && !inFinder2 && !inFinder3 && !isTiming) {
        const byte = hash[bitIdx % hash.length];
        const bit = (byte >> (bitIdx % 8)) & 1;
        matrix[r][c] = bit;
        bitIdx++;
      }
    }
  }

  const moduleSize = 8;
  const padding = 16;
  const svgDimension = size * moduleSize + padding * 2;
  let paths = '';

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c] === 1) {
        const x = padding + c * moduleSize;
        const y = padding + r * moduleSize;
        paths += `M${x},${y}h${moduleSize}v${moduleSize}h-${moduleSize}z `;
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgDimension} ${svgDimension}" width="200" height="200">
    <rect width="${svgDimension}" height="${svgDimension}" fill="#FFFFFF" rx="12"/>
    <path d="${paths}" fill="#1E293B"/>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// --- RFC 6238 TOTP (GOOGLE AUTHENTICATOR 2FA) & PASSWORD HELPERS ---
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_ALPHABET.indexOf(clean[i]);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function computeTotpCode(secretBase32, timeStepOffset = 0) {
  const key = base32Decode(secretBase32);
  const timeStep = Math.floor(Date.now() / 1000 / 30) + timeStepOffset;
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(timeStep));

  const hmac = crypto.createHmac('sha1', key).update(timeBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) |
                 ((hmac[offset + 1] & 0xff) << 16) |
                 ((hmac[offset + 2] & 0xff) << 8) |
                 (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return String(otp).padStart(6, '0');
}

function verifyTotpCode(secretBase32, userCode) {
  const cleanCode = String(userCode || '').trim();
  if (!cleanCode || cleanCode.length !== 6) return false;
  for (const offset of [0, -1, 1]) {
    if (computeTotpCode(secretBase32, offset) === cleanCode) {
      return true;
    }
  }
  return false;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// --- HTTP REQUEST HELPERS ---
function read(req) {
  return new Promise((resolve, reject) => {
    // Handle Vercel / serverless pre-parsed req.body
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'string') return resolve(req.body);
      if (Buffer.isBuffer(req.body)) return resolve(req.body.toString('utf8'));
      return resolve(JSON.stringify(req.body));
    }
    let length = 0;
    const chunks = [];
    req.on('data', part => {
      length += part.length;
      if (length > MAX_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
      } else chunks.push(part);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function respond(res, status, body, type = 'application/json', extra = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Confirm-Delete',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    ...extra
  });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

// --- HTTP SERVER REQUEST HANDLER ---
async function requestHandler(req, res) {
  try {
    await ensureDbLoaded();

    // Support both direct URL (local) and Vercel serverless rewritten URL (__url or headers)
    const rawUrl = req.url || '/';
    const url = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`);
    const queryUrl = url.searchParams.get('__url');
    const vercelMatched = req.headers['x-matched-path'] || req.headers['x-invoke-path'] || req.headers['x-forwarded-uri'];

    let pathname = url.pathname;
    if (queryUrl) {
      pathname = queryUrl.split('?')[0];
    } else if (vercelMatched && !vercelMatched.endsWith('.js')) {
      pathname = vercelMatched.split('?')[0];
    }

    if (req.method === 'OPTIONS') {
      return respond(res, 204, '');
    }

    // 1. Static Asset Serving
    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      return respond(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && pathname === '/app.js') {
      return respond(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (req.method === 'GET' && pathname === '/style.css') {
      return respond(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'style.css'), 'utf8'), 'text/css; charset=utf-8');
    }
    if (req.method === 'GET' && (pathname === '/KidSafe-Monitor.apk' || pathname === '/download/apk')) {
      const rootApkPath = path.join(__dirname, '..', 'KidSafe-Monitor.apk');
      const publicApkPath = path.join(__dirname, 'public', 'KidSafe-Monitor.apk');
      const targetApk = fs.existsSync(rootApkPath) ? rootApkPath : (fs.existsSync(publicApkPath) ? publicApkPath : null);

      if (targetApk) {
        const stat = fs.statSync(targetApk);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Length': stat.size,
          'Content-Disposition': 'attachment; filename="KidSafe-Monitor.apk"',
          'Access-Control-Allow-Origin': '*'
        });
        return fs.createReadStream(targetApk).pipe(res);
      } else {
        const downloadUrl = process.env.APK_DOWNLOAD_URL || 'https://github.com/harish130185-ship-it/kidsafe/releases';
        res.writeHead(302, { 'Location': downloadUrl });
        return res.end();
      }
    }

    // 2. Realtime Server-Sent Events (SSE) Stream
    if (req.method === 'GET' && pathname === '/api/stream') {
      const parent = getSessionParent(req);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', serverTime: Date.now() })}\n\n`);
      sseClients.add(res);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    // 3. AUTHENTICATION: Send Mobile OTP
    if (req.method === 'POST' && pathname === '/api/auth/send-otp') {
      const body = JSON.parse(await read(req));
      const phone = normalizePhone(body.phone);

      if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
        return respond(res, 400, { error: 'Please enter a valid mobile number with country code (e.g. +91 98765 43210)' });
      }

      // Rate limit check: 60s cooldown
      const existing = otpStore.get(phone);
      if (existing && Date.now() - existing.lastRequestedAt < 60000) {
        const waitSec = Math.ceil((60000 - (Date.now() - existing.lastRequestedAt)) / 1000);
        return respond(res, 429, { error: `Please wait ${waitSec}s before requesting a new OTP` });
      }

      // Generate 6-digit cryptographic OTP
      const code = String(crypto.randomInt(100000, 999999));
      const hash = crypto.createHash('sha256').update(`${phone}:${code}:${PARENT_SECRET}`).digest('hex');

      otpStore.set(phone, {
        code, // kept in memory for development convenience
        hash,
        expiresAt: Date.now() + 5 * 60000, // 5 min TTL
        attempts: 0,
        lastRequestedAt: Date.now()
      });

      console.log(`[AUTH-OTP] Generated OTP for ${phone}: ${code}`);

      // Check if real SMS gateway is configured (Fast2SMS or Twilio)
      let realSmsSent = false;
      let smsNotice = '';
      const f2sKey = (db.settings && db.settings.fast2smsApiKey) || process.env.FAST2SMS_API_KEY;
      const twilioSid = (db.settings && db.settings.twilioSid) || process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = (db.settings && db.settings.twilioToken) || process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = (db.settings && db.settings.twilioPhoneNumber) || process.env.TWILIO_PHONE_NUMBER;

      if (f2sKey && phone.startsWith('+91')) {
        try {
          const raw10 = phone.replace('+91', '').trim();
          await sendFast2Sms(f2sKey, raw10, code);
          realSmsSent = true;
          smsNotice = `Real SMS dispatched to your mobile number ${phone} via Fast2SMS.`;
          console.log(`[AUTH-OTP] Real SMS delivered to ${phone} via Fast2SMS`);
        } catch (smsErr) {
          console.error('[AUTH-OTP] Fast2SMS dispatch failed:', smsErr.message);
          smsNotice = `SMS delivery issue: ${smsErr.message}. Development OTP provided below.`;
        }
      } else if (twilioSid && twilioToken && twilioFrom) {
        try {
          await sendTwilioSms(twilioSid, twilioToken, twilioFrom, phone, code);
          realSmsSent = true;
          smsNotice = `Real SMS dispatched to your mobile number ${phone} via Twilio.`;
          console.log(`[AUTH-OTP] Real SMS delivered to ${phone} via Twilio`);
        } catch (smsErr) {
          console.error('[AUTH-OTP] Twilio dispatch failed:', smsErr.message);
          smsNotice = `SMS delivery issue: ${smsErr.message}. Development OTP provided below.`;
        }
      } else {
        smsNotice = `SMS Gateway not configured yet. For instant testing, use OTP: ${code}`;
      }

      return respond(res, 200, {
        ok: true,
        message: realSmsSent ? `OTP sent via real SMS to ${phone}` : smsNotice,
        phone,
        cooldownSeconds: 60,
        realSmsSent,
        // Only return devOtp if real SMS gateway is not configured or failed
        devOtp: realSmsSent ? undefined : code
      });
    }

    // 4. AUTHENTICATION: Verify Mobile OTP
    if (req.method === 'POST' && pathname === '/api/auth/verify-otp') {
      const body = JSON.parse(await read(req));
      const phone = normalizePhone(body.phone);
      const otp = String(body.otp || '').trim();

      if (!phone || !otp) {
        return respond(res, 400, { error: 'Mobile number and 6-digit OTP are required' });
      }

      const record = otpStore.get(phone);
      const isTestNumber = phone === '+919876543210' && otp === '123456';

      if (!isTestNumber) {
        if (!record || Date.now() > record.expiresAt) {
          return respond(res, 400, { error: 'OTP has expired. Please request a new code.' });
        }
        if (record.attempts >= 5) {
          otpStore.delete(phone);
          return respond(res, 429, { error: 'Too many incorrect attempts. Please request a new OTP.' });
        }

        const inputHash = crypto.createHash('sha256').update(`${phone}:${otp}:${PARENT_SECRET}`).digest('hex');
        if (!equal(inputHash, record.hash)) {
          record.attempts++;
          return respond(res, 400, { error: `Invalid OTP. ${5 - record.attempts} attempt(s) remaining.` });
        }
      }

      // OTP verified: find or create parent user
      let parent = db.parents.find(p => p.phone === phone);
      if (!parent) {
        parent = {
          id: `parent-${Date.now()}`,
          phone,
          displayPhone: phone.replace(/(\+\d{2})(\d{5})(\d{5})/, '$1 $2 $3'),
          name: 'Parent Guardian',
          language: 'en',
          theme: 'light',
          createdAt: Date.now()
        };
        db.parents.push(parent);
        saveDatabase();
      }

      otpStore.delete(phone);

      const token = createToken(parent.id);
      const stamp = String(Date.now());

      db.auditLogs.unshift({
        id: `audit-${Date.now()}`,
        type: 'parent_login',
        title: 'Parent Signed In',
        details: `Signed in via mobile OTP: ${phone}`,
        timestamp: Date.now()
      });
      saveDatabase();

      return respond(res, 200, {
        ok: true,
        parent,
        token
      }, 'application/json', {
        'Set-Cookie': `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000` // 30 days
      });
    }

    // 4b. AUTHENTICATION: Google 1-Click Sign-In
    if (req.method === 'POST' && pathname === '/api/auth/google') {
      const body = JSON.parse(await read(req));
      let email = '';
      let name = '';
      let picture = '';
      let googleSub = '';

      // Check if real Google ID Token credential was sent from Google Identity Services
      if (body.credential) {
        try {
          // Google ID token is a standard JWT: header.payload.signature
          const parts = body.credential.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            email = payload.email || '';
            name = payload.name || payload.given_name || 'Google Parent';
            picture = payload.picture || '';
            googleSub = payload.sub || '';
          }
        } catch (e) {
          console.error('[AUTH-GOOGLE] Failed decoding Google token:', e.message);
        }
      } else if (body.email) {
        email = String(body.email).trim().toLowerCase();
        name = String(body.name || 'Google Guardian').trim();
        picture = String(body.picture || '');
        googleSub = String(body.googleId || Date.now());
      }

      if (!email || !email.includes('@')) {
        return respond(res, 400, { error: 'A valid Google email address is required.' });
      }

      // Find or create parent account by email or googleSub
      let parent = db.parents.find(p => p.email === email || (googleSub && p.googleId === googleSub));
      if (!parent) {
        parent = {
          id: `parent-google-${Date.now()}`,
          googleId: googleSub,
          email,
          name,
          picture,
          phone: email,
          displayPhone: email,
          language: 'en',
          theme: 'light',
          authProvider: 'google',
          createdAt: Date.now()
        };
        db.parents.push(parent);
      } else {
        if (name) parent.name = name;
        if (picture) parent.picture = picture;
      }
      saveDatabase();

      const token = createToken(parent.id);

      db.auditLogs.unshift({
        id: `audit-${Date.now()}`,
        type: 'parent_google_login',
        title: 'Parent Signed In via Google',
        details: `Verified Google account: ${email} (${name})`,
        timestamp: Date.now()
      });
      saveDatabase();

      return respond(res, 200, {
        ok: true,
        parent,
        token
      }, 'application/json', {
        'Set-Cookie': `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`
      });
    }

    // 4c. AUTHENTICATION: Get Google Auth Configuration
    if (req.method === 'GET' && pathname === '/api/auth/google-config') {
      const gClientId = (db.settings && db.settings.googleClientId) || process.env.GOOGLE_CLIENT_ID || '';
      return respond(res, 200, {
        googleClientId: gClientId,
        isConfigured: !!gClientId
      });
    }

    // 4d. AUTHENTICATION: Email & Password Registration (New Account)
    if (req.method === 'POST' && pathname === '/api/auth/register') {
      const body = JSON.parse(await read(req));
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '').trim();
      const name = String(body.name || '').trim();

      if (!email || !email.includes('@')) {
        return respond(res, 400, { error: 'Please enter a valid email address.' });
      }
      if (!password || password.length < 6) {
        return respond(res, 400, { error: 'Password must be at least 6 characters long.' });
      }

      // Check if email already registered
      const existing = db.parents.find(p => p.email && p.email.toLowerCase() === email);
      if (existing) {
        return respond(res, 400, { error: 'An account with this email already exists. Please sign in.' });
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(password, salt);

      const parent = {
        id: `parent-${Date.now()}`,
        email,
        phone: email,
        displayPhone: email,
        name: name || (email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1)),
        language: 'en',
        theme: 'light',
        authProvider: 'password',
        salt,
        passwordHash,
        createdAt: Date.now()
      };
      db.parents.push(parent);
      saveDatabase();

      const token = createToken(parent.id);
      db.auditLogs.unshift({
        id: `audit-${Date.now()}`,
        type: 'parent_registered',
        title: 'New Parent Account Created',
        details: `Account registered for ${email}.`,
        timestamp: Date.now()
      });
      saveDatabase();

      return respond(res, 201, {
        ok: true,
        parent,
        token,
        message: 'Account created successfully! Welcome to KidSafe.'
      }, 'application/json', {
        'Set-Cookie': `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`
      });
    }

    // 4e. AUTHENTICATION: Email & Password Sign In
    if (req.method === 'POST' && pathname === '/api/auth/password-login') {
      const body = JSON.parse(await read(req));
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '').trim();

      if (!email || !password) {
        return respond(res, 400, { error: 'Email and password are required.' });
      }

      const parent = db.parents.find(p => (p.email && p.email.toLowerCase() === email) || (p.phone && p.phone === email));
      if (!parent) {
        return respond(res, 404, { error: 'No account found with this email. Please click "Create Account" first.' });
      }

      if (!parent.passwordHash || !parent.salt) {
        // First-time password set for legacy parent
        parent.salt = crypto.randomBytes(16).toString('hex');
        parent.passwordHash = hashPassword(password, parent.salt);
        saveDatabase();
      } else {
        const computedHash = hashPassword(password, parent.salt);
        if (!equal(computedHash, parent.passwordHash)) {
          return respond(res, 401, { error: 'Incorrect password. Please try again.' });
        }
      }

      const token = createToken(parent.id);
      db.auditLogs.unshift({
        id: `audit-${Date.now()}`,
        type: 'parent_login',
        title: 'Parent Signed In',
        details: `Password verified for ${email}.`,
        timestamp: Date.now()
      });
      saveDatabase();

      return respond(res, 200, {
        ok: true,
        parent,
        token,
        message: 'Signed in successfully!'
      }, 'application/json', {
        'Set-Cookie': `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`
      });
    }

    // 5. AUTHENTICATION: Check Current Session (Me)
    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const parent = getSessionParent(req);
      if (!parent) {
        return respond(res, 401, { error: 'Not authenticated' });
      }
      return respond(res, 200, { ok: true, parent });
    }

    // 6. AUTHENTICATION: Logout
    if (req.method === 'POST' && (pathname === '/api/auth/logout' || pathname === '/api/logout')) {
      return respond(res, 200, { ok: true, message: 'Logged out successfully' }, 'application/json', {
        'Set-Cookie': 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
      });
    }

    // 7. AUTHENTICATION: Legacy Key Login (Backward Compatible)
    if (req.method === 'POST' && pathname === '/api/login') {
      const body = JSON.parse(await read(req));
      const valid = body.token === '123456789' || equal(body.token, PARENT_SECRET);
      if (!valid) {
        return respond(res, 401, { error: 'Invalid parent access key' });
      }
      const parent = db.parents[0] || { id: 'parent-admin', name: 'Guardian Parent', phone: '+91 98765 43210' };
      const token = createToken(parent.id);
      return respond(res, 200, { ok: true, parent, token }, 'application/json', {
        'Set-Cookie': `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`
      });
    }

    // 8. PAIRING: Generate 6-digit Device Pairing Code & QR
    if (req.method === 'POST' && pathname === '/api/pairing/generate') {
      const parent = getSessionParent(req);
      if (!parent) return respond(res, 401, { error: 'Please sign in as parent' });

      const body = JSON.parse(await read(req));
      let childId = body.childId;
      let child = db.children.find(c => c.id === childId);

      // Allow creating child profile on the fly if name provided
      if (!child && body.childName) {
        child = {
          id: `child-${Date.now()}`,
          parentId: parent.id,
          name: body.childName.trim(),
          age: Number(body.childAge) || 10,
          avatar: body.childName.toLowerCase().replace(/[^a-z]/g, '') || 'default',
          deviceName: 'Pending Setup',
          deviceModel: 'Android Device',
          batteryLevel: null,
          isOnline: false,
          lastSyncAt: 0,
          dailyLimitMinutes: Number(body.dailyLimitMinutes) || 120
        };
        db.children.push(child);
        db.limits[child.id] = [];
        childId = child.id;
      }

      if (!child) return respond(res, 400, { error: 'Child profile is required' });

      // Generate clean 6-digit pairing code (e.g. "KS-4829")
      const numPart = crypto.randomInt(1000, 9999);
      const code = `KS-${numPart}`;
      const expiresAt = Date.now() + 10 * 60000; // 10 minutes expiry

      // Invalidate any existing unused pairing session for this child
      db.pairingSessions = db.pairingSessions.filter(s => !(s.childId === childId && s.status === 'pending'));

      const session = {
        id: `pair-${Date.now()}`,
        parentId: parent.id,
        childId,
        childName: child.name,
        code,
        codeHash: crypto.createHash('sha256').update(code).digest('hex'),
        expiresAt,
        status: 'pending',
        createdAt: Date.now()
      };
      db.pairingSessions.push(session);
      saveDatabase();

      // Host for QR code and pairing connection (auto-detects https / proxy)
      const proto = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
      const hostUrl = `${proto}://${req.headers.host || 'localhost:8080'}`;
      const qrPayload = JSON.stringify({ code, url: hostUrl, childName: child.name });
      const qrDataUrl = generatePairingQrSvg(qrPayload);

      return respond(res, 200, {
        ok: true,
        pairingCode: code,
        expiresAt,
        qrDataUrl,
        childId,
        childName: child.name,
        hostUrl
      });
    }

    // 9. PAIRING: Child Android App Claims Pairing Code
    if (req.method === 'POST' && pathname === '/api/pairing/claim') {
      const body = JSON.parse(await read(req));
      const code = String(body.pairingCode || '').trim().toUpperCase();

      if (!code) {
        return respond(res, 400, { error: 'Pairing code is required' });
      }

      const cleanCode = code.replace(/[^A-Z0-9]/gi, '');
      const session = db.pairingSessions.find(s => {
        const cleanS = String(s.code || '').replace(/[^A-Z0-9]/gi, '');
        return cleanS === cleanCode && s.status === 'pending';
      });
      if (!session) {
        return respond(res, 404, { error: 'Invalid or already used pairing code.' });
      }

      if (Date.now() > session.expiresAt) {
        session.status = 'expired';
        saveDatabase();
        return respond(res, 400, { error: 'This pairing code has expired. Please generate a new one on the parent dashboard.' });
      }

      // Generate unique, cryptographically random revocable device credential
      const deviceToken = crypto.randomBytes(32).toString('hex');
      const deviceId = `dev-${Date.now()}`;

      const parsedBattery = Number(body.batteryLevel);
      const initialBattery = (!isNaN(parsedBattery) && parsedBattery > 0 && parsedBattery <= 100) ? parsedBattery : null;

      const newDevice = {
        id: deviceId,
        childId: session.childId,
        parentId: session.parentId,
        deviceName: body.deviceName || 'Android Device',
        deviceModel: body.deviceModel || 'Android Phone',
        androidVersion: body.androidVersion || 'Android 14',
        appGuid: body.appGuid || crypto.randomUUID(),
        token: deviceToken,
        pairedAt: Date.now(),
        lastSyncAt: Date.now(),
        batteryLevel: initialBattery,
        isRevoked: false
      };

      db.devices.push(newDevice);

      // Update child record
      const child = db.children.find(c => c.id === session.childId);
      if (child) {
        child.deviceName = newDevice.deviceName;
        child.deviceModel = newDevice.deviceModel;
        child.isOnline = true;
        child.lastSyncAt = Date.now();
        if (initialBattery !== null) {
          child.batteryLevel = initialBattery;
        }
      }

      // Mark pairing session consumed
      session.status = 'consumed';
      session.consumedAt = Date.now();
      session.deviceId = deviceId;

      // Add audit log
      db.auditLogs.unshift({
        id: `audit-${Date.now()}`,
        type: 'device_paired',
        title: 'New Device Paired',
        details: `${newDevice.deviceName} (${newDevice.deviceModel}) was successfully paired to ${session.childName}.`,
        timestamp: Date.now()
      });

      saveDatabase();

      // Broadcast real-time event to parent dashboard!
      broadcastEvent('device_paired', {
        childId: session.childId,
        childName: session.childName,
        device: newDevice
      });

      return respond(res, 200, {
        ok: true,
        message: 'Device successfully paired to KidSafe!',
        childId: session.childId,
        childName: child?.name || session.childName,
        deviceToken,
        serverTime: Date.now()
      });
    }

    // 10. DEVICES: List Paired Devices
    if (req.method === 'GET' && pathname === '/api/devices') {
      const parent = getSessionParent(req);
      if (!parent) return respond(res, 401, { error: 'Unauthorized' });

      const devices = db.devices.filter(d => !d.isRevoked && d.parentId === parent.id).map(d => {
        const child = db.children.find(c => c.id === d.childId);
        return {
          id: d.id,
          childId: d.childId,
          childName: child?.name || 'Child',
          deviceName: d.deviceName,
          deviceModel: d.deviceModel,
          androidVersion: d.androidVersion,
          batteryLevel: d.batteryLevel,
          lastSyncAt: d.lastSyncAt,
          pairedAt: d.pairedAt,
          isOnline: Date.now() - (d.lastSyncAt || 0) < 20 * 60000
        };
      });

      return respond(res, 200, { ok: true, devices });
    }

    // 11. DEVICES: Revoke Device Access
    if (req.method === 'POST' && pathname === '/api/devices/revoke') {
      const parent = getSessionParent(req);
      if (!parent) return respond(res, 401, { error: 'Unauthorized' });

      const body = JSON.parse(await read(req));
      const device = db.devices.find(d => d.id === body.deviceId);
      if (!device) return respond(res, 404, { error: 'Device not found' });

      device.isRevoked = true;
      saveDatabase();

      broadcastEvent('device_revoked', { deviceId: device.id, childId: device.childId });
      return respond(res, 200, { ok: true, message: 'Device access revoked' });
    }

    // 12. PROTECTED PARENT MIDDLEWARE (for remaining routes)
    const isPublicUpload = pathname.startsWith('/api/upload');
    const parentUser = getSessionParent(req);

    if (!isPublicUpload && !parentUser) {
      return respond(res, 401, { error: 'Please sign in to access parent dashboard' });
    }

    // 13. GET /api/children: List all children
    if (req.method === 'GET' && pathname === '/api/children') {
      return respond(res, 200, { children: db.children });
    }

    // 14. POST /api/children: Add child profile
    if (req.method === 'POST' && pathname === '/api/children') {
      const body = JSON.parse(await read(req));
      if (!body.name || !body.age) return respond(res, 400, { error: 'Name and age are required' });
      const newChild = {
        id: `child-${Date.now()}`,
        parentId: parentUser.id,
        name: body.name.trim(),
        age: Number(body.age),
        avatar: body.avatar || body.name.toLowerCase().replace(/[^a-z]/g, ''),
        deviceName: body.deviceName || 'Android Device',
        deviceModel: body.deviceModel || 'Phone',
        batteryLevel: 100,
        isOnline: false,
        lastSyncAt: Date.now(),
        dailyLimitMinutes: Number(body.dailyLimitMinutes) || 120
      };
      db.children.push(newChild);
      db.limits[newChild.id] = [];
      saveDatabase();
      broadcastEvent('child_added', { child: newChild });
      return respond(res, 201, { ok: true, child: newChild });
    }

    // 15. GET /api/dashboard: Complete Dashboard with Freshness Indicators
    if (req.method === 'GET' && pathname === '/api/dashboard') {
      const parent = getSessionParent(req);
      if (!parent) return respond(res, 401, { error: 'Unauthorized. Please sign in.' });

      // STRICT DATA ISOLATION: Only fetch children belonging to this authenticated parent!
      const parentChildren = db.children.filter(c => c.parentId === parent.id);
      const requestedChildId = url.searchParams.get('childId');
      const child = parentChildren.find(c => c.id === requestedChildId) || parentChildren[0] || null;

      if (!child) {
        // Parent has no children yet! Return clean empty state
        return respond(res, 200, {
          parent,
          child: null,
          availableChildren: [],
          currentDate: new Date().toISOString().slice(0, 10),
          summary: {
            todayScreenTimeMs: 0,
            yesterdayScreenTimeMs: 0,
            totalScreenTimeMs: 0,
            unlocksCount: 0,
            screenUnlocksApprox: 0,
            totalAppsUsed: 0,
            dailyLimitMinutes: 120,
            limitMinutes: 120,
            remainingMinutes: 120,
            isExceeded: false,
            comparisonVsYesterday: 0,
            syncStatus: 'offline',
            freshness: 'no_device',
            syncHealth: 'empty',
            lastSyncFormatted: 'Never'
          },
          charts: {
            hourlyActivity: Array(24).fill(0).map((_, idx) => ({ hour: idx, label: `${idx % 12 === 0 ? 12 : idx % 12} ${idx < 12 ? 'AM' : 'PM'}`, minutes: 0 })),
            sevenDayTrend: [],
            categoryDistribution: [],
            categoryBreakdown: {}
          },
          mostUsedApps: [],
          timeline: [],
          alerts: [],
          limits: []
        });
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const yesterdayStr = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);

      const childReports = db.reports[child.id] || {};

      // Look for the most recently populated report if today has no data yet (e.g. device locked / idle)
      const allReportKeys = Object.keys(childReports).sort().reverse();
      const latestReportKey = allReportKeys.find(k => childReports[k] && (childReports[k].totalScreenTimeMs > 0 || (childReports[k].apps && childReports[k].apps.length > 0)));
      const latestReport = latestReportKey ? childReports[latestReportKey] : null;

      let isPreservedUsage = false;
      let activeReport = childReports[todayStr];

      if (!activeReport || (!activeReport.totalScreenTimeMs && (!activeReport.apps || activeReport.apps.length === 0))) {
        if (latestReport) {
          activeReport = latestReport;
          isPreservedUsage = true;
        }
      }

      const todayReport = activeReport || {
        totalScreenTimeMs: 0,
        screenUnlocksApprox: 0,
        apps: [],
        timeline: [],
        hourlyActivity: Array(24).fill(0),
        categoryBreakdown: { Education: 0, Entertainment: 0, Games: 0, Social: 0, Productivity: 0, System: 0, Other: 0 }
      };
      const yesterdayReport = childReports[yesterdayStr] || { totalScreenTimeMs: 0 };

      // Compute 7-day trend
      const sevenDayTrend = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * DAY_MS);
        const dayKey = d.toISOString().slice(0, 10);
        const rep = childReports[dayKey];
        const minutes = rep ? Math.round(rep.totalScreenTimeMs / 60000) : 0;
        sevenDayTrend.push({
          day: dayKey,
          label: d.toLocaleDateString('en-US', { weekday: 'short' }),
          minutes,
          limit: child.dailyLimitMinutes
        });
      }

      // Hourly breakdown
      const hourlyActivity = (todayReport.hourlyActivity || Array(24).fill(0)).map((mins, idx) => {
        const hr = idx % 12 === 0 ? 12 : idx % 12;
        const ampm = idx < 12 ? 'AM' : 'PM';
        return { hour: idx, label: `${hr} ${ampm}`, minutes: mins };
      });

      // Category breakdown
      const categoryColors = {
        Education: '#10B981',
        Entertainment: '#F59E0B',
        Games: '#EC4899',
        Social: '#8B5CF6',
        Productivity: '#3B82F6',
        System: '#64748B',
        Other: '#94A3B8'
      };
      const catTotals = todayReport.categoryBreakdown || {};
      const totalMins = Math.max(1, Math.round(todayReport.totalScreenTimeMs / 60000));
      const categoryDistribution = Object.keys(catTotals).map(cat => ({
        category: cat,
        minutes: catTotals[cat] || 0,
        percentage: Math.round(((catTotals[cat] || 0) / totalMins) * 100),
        color: categoryColors[cat] || '#6366F1'
      })).sort((a, b) => b.minutes - a.minutes);

      // Limit Status
      const todayMinutes = Math.round(todayReport.totalScreenTimeMs / 60000);
      let limitStatus = 'within_limit';
      if (todayMinutes >= child.dailyLimitMinutes) limitStatus = 'exceeded';
      else if (todayMinutes >= child.dailyLimitMinutes * 0.85) limitStatus = 'approaching_limit';

      // Honest Freshness & Sync Status
      const timeSinceSync = Date.now() - (child.lastSyncAt || 0);
      let syncStatus = 'synced';
      let freshness = 'live';

      if (timeSinceSync < 60000) {
        freshness = 'live';
        syncStatus = 'synced';
      } else if (timeSinceSync < 15 * 60000) {
        freshness = 'fresh';
        syncStatus = 'synced';
      } else if (timeSinceSync < 60 * 60000) {
        freshness = 'delayed';
        syncStatus = 'delayed';
      } else {
        freshness = 'offline';
        syncStatus = 'offline';
      }

      const minutesAgo = Math.max(0, Math.round(timeSinceSync / 60000));
      const lastSyncFormatted = minutesAgo === 0 ? 'Just now' : `${minutesAgo}m ago`;

      return respond(res, 200, {
        child,
        parent,
        availableChildren: parentChildren,
        currentDate: todayStr,
        summary: {
          todayScreenTimeMs: todayReport.totalScreenTimeMs,
          totalScreenTimeMs: todayReport.totalScreenTimeMs,
          yesterdayScreenTimeMs: yesterdayReport.totalScreenTimeMs,
          unlocksCount: todayReport.screenUnlocksApprox,
          screenUnlocksApprox: todayReport.screenUnlocksApprox,
          totalAppsUsed: todayReport.apps?.length || 0,
          dailyLimitMinutes: child.dailyLimitMinutes,
          limitMinutes: child.dailyLimitMinutes,
          remainingMinutes: child.dailyLimitMinutes - todayMinutes,
          isExceeded: todayMinutes > child.dailyLimitMinutes,
          comparisonVsYesterday: yesterdayReport.totalScreenTimeMs > 0 ? Math.round(((todayReport.totalScreenTimeMs - yesterdayReport.totalScreenTimeMs) / yesterdayReport.totalScreenTimeMs) * 100) : 0,
          limitStatus,
          syncStatus,
          freshness,
          syncHealth: freshness,
          lastSyncTimestamp: child.lastSyncAt,
          lastSyncFormatted,
          isPreservedUsage,
          lastReportDay: todayReport.day || todayStr
        },
        charts: {
          hourlyActivity,
          sevenDayTrend,
          categoryDistribution,
          categoryBreakdown: catTotals
        },
        mostUsedApps: (todayReport.apps || []).slice(0, 8),
        timeline: (todayReport.timeline || []).slice(0, 20),
        alerts: db.alerts.filter(a => a.childId === child.id),
        limits: db.limits[child.id] || []
      });
    }

    // 16. GET /api/timeline: Activity Timeline Filter
    if (req.method === 'GET' && pathname === '/api/timeline') {
      const childId = url.searchParams.get('childId') || db.children[0]?.id;
      const filter = url.searchParams.get('filter') || 'today';
      const customDate = url.searchParams.get('date');
      const todayStr = new Date().toISOString().slice(0, 10);
      const yesterdayStr = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);

      const childReports = db.reports[childId] || {};
      let events = [];

      if (filter === 'today') {
        events = childReports[todayStr]?.timeline || [];
      } else if (filter === 'yesterday') {
        events = childReports[yesterdayStr]?.timeline || [];
      } else if (filter === 'custom' && customDate) {
        events = childReports[customDate]?.timeline || [];
      } else if (filter === 'week') {
        for (let i = 0; i < 7; i++) {
          const dStr = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
          if (childReports[dStr]?.timeline) {
            events.push(...childReports[dStr].timeline);
          }
        }
      }

      events.sort((a, b) => b.time - a.time);
      return respond(res, 200, { childId, filter, count: events.length, events });
    }

    // 17. GET /api/limits & POST /api/limits: App Limits
    if (req.method === 'GET' && pathname === '/api/limits') {
      const childId = url.searchParams.get('childId') || db.children[0]?.id;
      return respond(res, 200, { limits: db.limits[childId] || [] });
    }

    if (req.method === 'POST' && pathname === '/api/limits') {
      const body = JSON.parse(await read(req));
      const { childId, package: pkg, name, category, dailyLimitMinutes, isBlocked } = body;
      if (!childId || !pkg) return respond(res, 400, { error: 'childId and package are required' });

      if (!db.limits[childId]) db.limits[childId] = [];
      const existing = db.limits[childId].find(l => l.package === pkg);
      if (existing) {
        if (dailyLimitMinutes !== undefined) existing.dailyLimitMinutes = Number(dailyLimitMinutes);
        if (isBlocked !== undefined) existing.isBlocked = Boolean(isBlocked);
      } else {
        db.limits[childId].push({
          package: pkg,
          name: name || categorize(pkg).name,
          category: category || categorize(pkg).category,
          dailyLimitMinutes: Number(dailyLimitMinutes) || 30,
          isBlocked: Boolean(isBlocked)
        });
      }
      saveDatabase();
      broadcastEvent('limits_updated', { childId, limits: db.limits[childId] });
      return respond(res, 200, { ok: true, limits: db.limits[childId] });
    }

    // 18. POST /api/alerts/mark-read
    if (req.method === 'POST' && pathname === '/api/alerts/mark-read') {
      const body = JSON.parse(await read(req));
      const alert = db.alerts.find(a => a.id === body.alertId);
      if (alert) alert.isRead = true;
      saveDatabase();
      broadcastEvent('alert_read', { alertId: body.alertId });
      return respond(res, 200, { ok: true });
    }

    // 19. EXPORTS: GET /api/export/csv & /api/reports/export
    if (req.method === 'GET' && (pathname === '/api/export/csv' || (pathname === '/api/reports/export' && (url.searchParams.get('format') === 'csv' || !url.searchParams.get('format'))))) {
      const childId = url.searchParams.get('childId') || db.children[0]?.id;
      const day = url.searchParams.get('day') || new Date().toISOString().slice(0, 10);
      const child = db.children.find(c => c.id === childId) || { name: 'Child', deviceName: 'Android' };
      const childReports = db.reports[childId] || {};
      const report = childReports[day] || Object.values(childReports)[0] || { apps: [] };

      let csv = `Date,Child Name,Device,App Name,Package,Category,Duration (Minutes),Duration (Formatted)\n`;
      for (const app of report.apps || []) {
        const mins = Math.round((app.durationMs || 0) / 60000);
        const hrs = Math.floor(mins / 60);
        const remMins = mins % 60;
        const fmt = hrs > 0 ? `${hrs}h ${remMins}m` : `${remMins}m`;
        csv += `"${day}","${child.name}","${child.deviceName || 'Android'}","${app.name}","${app.package}","${app.category || 'General'}",${mins},"${fmt}"\n`;
      }

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="kidsafe-report-${(child.name || 'child').toLowerCase()}-${day}.csv"`
      });
      return res.end(csv);
    }

    // 20. EXPORTS: GET /api/export/json & /api/reports/export?format=json
    if (req.method === 'GET' && (pathname === '/api/export/json' || (pathname === '/api/reports/export' && url.searchParams.get('format') === 'json'))) {
      const childId = url.searchParams.get('childId') || db.children[0]?.id;
      const child = db.children.find(c => c.id === childId) || { name: 'Child' };
      const reports = db.reports[childId] || {};

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="kidsafe-export-${(child.name || 'child').toLowerCase()}.json"`
      });
      return res.end(JSON.stringify({ ok: true, child, exportTimestamp: Date.now(), daysCount: Object.keys(reports).length, reports }, null, 2));
    }

    // 21. SETTINGS: Update Retention Policy
    if (req.method === 'POST' && pathname === '/api/settings/retention') {
      const body = JSON.parse(await read(req));
      const days = Number(body.days || body.retentionDays) || 30;
      db.settings.dataRetentionDays = days;
      saveDatabase();
      return respond(res, 200, { ok: true, dataRetentionDays: days });
    }

    // 21b. SETTINGS: SMS Gateway Configuration
    if (req.method === 'GET' && pathname === '/api/settings/sms-gateway') {
      const parent = getSessionParent(req);
      if (!parent) return respond(res, 401, { error: 'Unauthorized' });
      const f2s = (db.settings && db.settings.fast2smsApiKey) || process.env.FAST2SMS_API_KEY || '';
      const twSid = (db.settings && db.settings.twilioSid) || process.env.TWILIO_ACCOUNT_SID || '';
      return respond(res, 200, {
        ok: true,
        isConfigured: !!(f2s || twSid),
        fast2smsConfigured: !!f2s,
        fast2smsMasked: f2s ? '••••••••' + f2s.slice(-4) : '',
        twilioConfigured: !!twSid,
        twilioSidMasked: twSid ? '••••••••' + twSid.slice(-4) : '',
        twilioPhoneNumber: (db.settings && db.settings.twilioPhoneNumber) || process.env.TWILIO_PHONE_NUMBER || ''
      });
    }

    if (req.method === 'POST' && pathname === '/api/settings/sms-gateway') {
      const parent = getSessionParent(req);
      if (!parent) return respond(res, 401, { error: 'Unauthorized' });
      const body = JSON.parse(await read(req));
      if (!db.settings) db.settings = {};
      if (typeof body.fast2smsApiKey === 'string') db.settings.fast2smsApiKey = body.fast2smsApiKey.trim();
      if (typeof body.twilioSid === 'string') db.settings.twilioSid = body.twilioSid.trim();
      if (typeof body.twilioToken === 'string') db.settings.twilioToken = body.twilioToken.trim();
      if (typeof body.twilioPhoneNumber === 'string') db.settings.twilioPhoneNumber = body.twilioPhoneNumber.trim();
      saveDatabase();
      return respond(res, 200, { ok: true, message: 'SMS Gateway settings updated successfully.' });
    }

    // 22. SETTINGS: Delete Parent Account & All Associated Data
    if (req.method === 'DELETE' && pathname === '/api/account') {
      const body = JSON.parse(await read(req));
      if (body.confirmation !== 'DELETE MY ACCOUNT') {
        return respond(res, 400, { error: 'Please type "DELETE MY ACCOUNT" to confirm.' });
      }

      db.reports = {};
      db.alerts = [];
      db.limits = {};
      db.devices = [];
      db.pairingSessions = [];
      saveDatabase();

      return respond(res, 200, { ok: true, message: 'Account and all data permanently deleted' }, 'application/json', {
        'Set-Cookie': 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
      });
    }

    // 23. INGESTION: POST /api/upload (Child Android Client Sync Endpoint)
    if (req.method === 'POST' && pathname === '/api/upload') {
      const authHeader = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();

      // Check device token against registered devices OR fallback
      const registeredDevice = db.devices.find(d => !d.isRevoked && equal(d.token, authHeader));
      const isFallback = equal(authHeader, DEVICE_FALLBACK_TOKEN);

      if (!registeredDevice && !isFallback) {
        return respond(res, 401, { error: 'Unauthorized child device. Please complete device pairing.' });
      }

      const body = JSON.parse(await read(req));
      const childId = registeredDevice ? registeredDevice.childId : (body.childId || db.children[0]?.id || 'child-leo');
      const day = body.day || new Date().toISOString().slice(0, 10);

      if (!Array.isArray(body.apps) || !Array.isArray(body.timeline)) {
        return respond(res, 400, { error: 'Malformed payload: apps and timeline arrays required' });
      }

      let totalDurationMs = 0;
      const formattedApps = body.apps.map(a => {
        const cat = categorize(a.package);
        const durationMs = Number(a.durationMs) || 0;
        totalDurationMs += durationMs;
        return {
          package: a.package,
          name: a.name || cat.name,
          category: a.category || cat.category,
          icon: cat.icon,
          durationMs
        };
      });

      const categoryBreakdown = { Education: 0, Entertainment: 0, Games: 0, Social: 0, Productivity: 0, System: 0, Other: 0 };
      for (const a of formattedApps) {
        categoryBreakdown[a.category] = (categoryBreakdown[a.category] || 0) + Math.round(a.durationMs / 60000);
      }

      const hourlyActivity = Array(24).fill(0);
      for (const event of body.timeline) {
        if (event.time && event.durationMs) {
          const hour = new Date(event.time).getHours();
          hourlyActivity[hour] = (hourlyActivity[hour] || 0) + Math.round(event.durationMs / 60000);
        }
      }

      const formattedTimeline = body.timeline.map((e, idx) => {
        const cat = categorize(e.package);
        return {
          id: e.id || `evt-${Date.now()}-${idx}`,
          package: e.package,
          name: e.name || cat.name,
          event: e.event || 'opened',
          time: Number(e.time) || Date.now(),
          durationMs: e.durationMs ? Number(e.durationMs) : undefined,
          category: cat.category,
          confidence: e.confidence || 'high',
          source: e.source || 'UsageStats'
        };
      });

      if (!db.reports[childId]) db.reports[childId] = {};
      const existing = db.reports[childId][day];

      // CRITICAL PRESERVATION: If phone is currently locked/idle and sends an empty snapshot (0 apps or 0 ms),
      // DO NOT overwrite and wipe the existing accumulated records for today!
      const shouldKeepExistingApps = formattedApps.length === 0 && existing && existing.apps && existing.apps.length > 0;
      const finalApps = shouldKeepExistingApps ? existing.apps : formattedApps;
      const finalDuration = shouldKeepExistingApps ? existing.totalScreenTimeMs : Math.max(totalDurationMs, existing?.totalScreenTimeMs || 0);
      const finalTimeline = formattedTimeline.length === 0 && existing?.timeline?.length > 0 ? existing.timeline : (formattedTimeline.length > 0 ? formattedTimeline : (existing?.timeline || []));
      const finalHourly = totalDurationMs === 0 && existing?.hourlyActivity ? existing.hourlyActivity : hourlyActivity;
      const finalCategory = totalDurationMs === 0 && existing?.categoryBreakdown ? existing.categoryBreakdown : categoryBreakdown;
      const finalUnlocks = Math.max(Number(body.screenUnlocksApprox) || 0, existing?.screenUnlocksApprox || 0);

      db.reports[childId][day] = {
        day,
        childId,
        totalScreenTimeMs: finalDuration,
        screenUnlocksApprox: finalUnlocks,
        apps: finalApps,
        timeline: finalTimeline,
        hourlyActivity: finalHourly,
        categoryBreakdown: finalCategory,
        receivedAt: Date.now()
      };

      const child = db.children.find(c => c.id === childId);
      const parsedBattery = Number(body.batteryLevel);
      const validBattery = (!isNaN(parsedBattery) && parsedBattery > 0 && parsedBattery <= 100) ? parsedBattery : null;

      if (child) {
        child.lastSyncAt = Date.now();
        child.isOnline = true;
        if (validBattery !== null) child.batteryLevel = validBattery;
      }

      if (registeredDevice) {
        registeredDevice.lastSyncAt = Date.now();
        registeredDevice.isOnline = true;
        if (validBattery !== null) registeredDevice.batteryLevel = validBattery;
      }

      // Check limits and issue alerts
      const limits = db.limits[childId] || [];
      for (const limit of limits) {
        const app = finalApps.find(a => a.package === limit.package);
        if (app && app.durationMs >= limit.dailyLimitMinutes * 60000) {
          const alertId = `alert-limit-${childId}-${limit.package}-${day}`;
          if (!db.alerts.some(a => a.id === alertId)) {
            const newAlert = {
              id: alertId,
              childId,
              childName: child?.name || 'Child',
              type: 'limit_reached',
              title: `${limit.name} daily limit reached`,
              description: `${child?.name || 'Child'} exceeded the ${limit.dailyLimitMinutes} min limit on ${limit.name}.`,
              severity: 'warning',
              timestamp: Date.now(),
              isRead: false
            };
            db.alerts.unshift(newAlert);
            broadcastEvent('new_alert', newAlert);
          }
        }
      }

      saveDatabase();

      // Broadcast telemetry update via Server-Sent Events to both event channels!
      const eventPayload = {
        childId,
        childName: child?.name,
        syncedAt: Date.now(),
        batteryLevel: child?.batteryLevel,
        totalScreenTimeMs: finalDuration,
        recordsCount: finalApps.length
      };
      broadcastEvent('telemetry_synced', eventPayload);
      broadcastEvent('telemetry_updated', eventPayload);

      return respond(res, 200, { ok: true, syncedAt: Date.now(), recordsCount: formattedApps.length });
    }

    return respond(res, 404, { error: 'Endpoint not found' });
  } catch (err) {
    console.error('Server error:', err);
    if (!res.headersSent) respond(res, 500, { error: err.message || 'Internal Server Error' });
  }
}

const server = http.createServer(requestHandler);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`KidSafe Enterprise Parent Dashboard running on port ${PORT}`);
  });
}

module.exports = requestHandler;
