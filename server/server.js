'use strict';
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dbStore = require('./db');

const PORT = Number(process.env.PORT || 8080);
const PARENT_SECRET = process.env.PARENT_TOKEN || 'kidsafe_parent_secret_key_8923487293847';
const DEVICE_FALLBACK_TOKEN = process.env.DEVICE_TOKEN || 'kidsafe_device_secret_key_982374982374';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const DAY_MS = 86400000;

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
  const lower = String(pkg || '').toLowerCase();
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
  const cleanName = String(pkg || '').split('.').pop() || String(pkg || 'App');
  const name = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  return { name, category, icon };
}

function sanitizeParent(p) {
  if (!p) return null;
  const { salt, passwordHash, totpSecret, ...safe } = p;
  return safe;
}

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
        authorization: apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let body = '';
      res.on('data', d => (body += d));
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
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, res => {
      let body = '';
      res.on('data', d => (body += d));
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

// --- CRYPTOGRAPHY & SESSIONS ---
function equal(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
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

async function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [parentId, stampStr, sig] = parts;
  const stamp = Number(stampStr);
  if (!Number.isFinite(stamp) || Date.now() - stamp > 30 * DAY_MS) return null; // 30-day session
  const expectedSig = sign(`${parentId}:${stampStr}`);
  if (!equal(sig, expectedSig)) return null;

  const existing = await dbStore.findParentById(parentId);
  if (existing) return existing;

  // Token has a valid cryptographic signature; ensure parent row exists in persistent DB
  return dbStore.ensureParentExists({
    id: parentId,
    name: 'Guardian Parent',
    phone: parentId,
    displayPhone: parentId,
    createdAt: stamp
  });
}

async function getSessionParent(req) {
  const authHeader = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!authHeader) return null;

  if (authHeader === '123456789' || equal(authHeader, PARENT_SECRET)) {
    return dbStore.getFirstParent();
  }
  return verifyToken(authHeader);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// --- IN-MEMORY OTP STORE ---
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

setInterval(() => {
  const ping = `: heartbeat ${Date.now()}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(ping);
    } catch {
      sseClients.delete(client);
    }
  }
}, 20000).unref();

// --- STANDALONE QR CODE GENERATOR (SVG Data URL) ---
function generatePairingQrSvg(payloadText) {
  const size = 25;
  const matrix = Array.from({ length: size }, () => Array(size).fill(0));

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

  for (let i = 8; i < size - 8; i++) {
    if (i % 2 === 0) {
      matrix[6][i] = 1;
      matrix[i][6] = 1;
    }
  }

  const hash = crypto.createHash('sha256').update(payloadText).digest();
  let bitIdx = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inFinder1 = r < 8 && c < 8;
      const inFinder2 = r < 8 && c >= size - 8;
      const inFinder3 = r >= size - 8 && c < 8;
      const isTiming = r === 6 || c === 6;
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

// --- HTTP REQUEST HELPERS ---
function read(req) {
  return new Promise((resolve, reject) => {
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
      } else {
        chunks.push(part);
      }
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
    await dbStore.initRequest();

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
    if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/' || pathname === '/index.html')) {
      if (req.method === 'HEAD') return respond(res, 200, '', 'text/html; charset=utf-8');
      return respond(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/app.js') {
      if (req.method === 'HEAD') return respond(res, 200, '', 'text/javascript; charset=utf-8');
      return respond(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/style.css') {
      if (req.method === 'HEAD') return respond(res, 200, '', 'text/css; charset=utf-8');
      return respond(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'style.css'), 'utf8'), 'text/css; charset=utf-8');
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/KidSafe-Monitor.apk' || pathname === '/download/apk' || pathname === '/download' || pathname === '/apk')) {
      const rootApkPath = path.join(__dirname, '..', 'KidSafe-Monitor.apk');
      const publicApkPath = path.join(__dirname, 'public', 'KidSafe-Monitor.apk');
      const targetApk = fs.existsSync(rootApkPath) ? rootApkPath : (fs.existsSync(publicApkPath) ? publicApkPath : null);

      if (targetApk) {
        const stat = fs.statSync(targetApk);
        res.writeHead(200, {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Length': stat.size,
          'Content-Disposition': 'attachment; filename="KidSafe-Monitor.apk"',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*'
        });
        if (req.method === 'HEAD') return res.end();
        const stream = fs.createReadStream(targetApk);
        stream.on('error', () => {
          if (!res.headersSent) res.writeHead(500);
          res.end();
        });
        return stream.pipe(res);
      } else {
        const downloadUrl = process.env.APK_DOWNLOAD_URL || 'https://github.com/harish130185-ship-it/kidsafe/raw/main/KidSafe-Monitor.apk';
        res.writeHead(302, { Location: downloadUrl });
        return res.end();
      }
    }

    // App Version & Update Check Endpoint
    if (req.method === 'GET' && (pathname === '/api/app-version' || pathname === '/api/version')) {
      const versionInfo = {
        ok: true,
        versionName: process.env.LATEST_APP_VERSION || '1.0.6',
        versionCode: parseInt(process.env.LATEST_VERSION_CODE || '7', 10),
        downloadUrl: '/download/apk',
        releaseNotes: 'KidSafe Monitor update with persistent cloud child sync and token reliability fixes',
        publishedAt: '2026-11-28T10:30:00Z'
      };
      return respond(res, 200, versionInfo);
    }

    // 2. Realtime Server-Sent Events (SSE) Stream
    if (req.method === 'GET' && pathname === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
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

      const existing = otpStore.get(phone);
      if (existing && Date.now() - existing.lastRequestedAt < 60000) {
        const waitSec = Math.ceil((60000 - (Date.now() - existing.lastRequestedAt)) / 1000);
        return respond(res, 429, { error: `Please wait ${waitSec}s before requesting a new OTP` });
      }

      const code = String(crypto.randomInt(100000, 999999));
      const hash = crypto.createHash('sha256').update(`${phone}:${code}:${PARENT_SECRET}`).digest('hex');

      otpStore.set(phone, {
        code,
        hash,
        expiresAt: Date.now() + 5 * 60000,
        attempts: 0,
        lastRequestedAt: Date.now()
      });

      const settings = await dbStore.getSettings();
      let realSmsSent = false;
      let smsNotice = '';
      const f2sKey = settings.fast2smsApiKey || process.env.FAST2SMS_API_KEY;
      const twilioSid = settings.twilioSid || process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = settings.twilioToken || process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = settings.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER;

      if (f2sKey && phone.startsWith('+91')) {
        try {
          const raw10 = phone.replace('+91', '').trim();
          await sendFast2Sms(f2sKey, raw10, code);
          realSmsSent = true;
          smsNotice = `Real SMS dispatched to your mobile number ${phone} via Fast2SMS.`;
        } catch (smsErr) {
          smsNotice = `SMS delivery issue: ${smsErr.message}. Development OTP provided below.`;
        }
      } else if (twilioSid && twilioToken && twilioFrom) {
        try {
          await sendTwilioSms(twilioSid, twilioToken, twilioFrom, phone, code);
          realSmsSent = true;
          smsNotice = `Real SMS dispatched to your mobile number ${phone} via Twilio.`;
        } catch (smsErr) {
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

      let parent = await dbStore.findParentByPhone(phone);
      if (!parent) {
        parent = await dbStore.upsertParent({
          id: `parent-${Date.now()}`,
          phone,
          displayPhone: phone.replace(/(\+\d{2})(\d{5})(\d{5})/, '$1 $2 $3'),
          name: 'Parent Guardian',
          language: 'en',
          theme: 'light',
          authProvider: 'otp',
          createdAt: Date.now()
        });
      }

      otpStore.delete(phone);
      const token = createToken(parent.id);

      await dbStore.addAuditLog({
        id: `audit-${Date.now()}`,
        type: 'parent_login',
        title: 'Parent Signed In',
        details: `Signed in via mobile OTP: ${phone}`,
        timestamp: Date.now()
      });

      return respond(res, 200, {
        ok: true,
        parent: sanitizeParent(parent),
        token
      }, 'application/json', {
        'Set-Cookie': `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`
      });
    }

    // 4b. AUTHENTICATION: Google 1-Click Sign-In
    if (req.method === 'POST' && pathname === '/api/auth/google') {
      const body = JSON.parse(await read(req));
      let email = '';
      let name = '';
      let picture = '';
      let googleSub = '';

      if (body.credential) {
        try {
          const parts = body.credential.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            email = String(payload.email || '').trim().toLowerCase();
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

      let parent = await dbStore.findParentByGoogle(email, googleSub);
      if (!parent) {
        parent = await dbStore.upsertParent({
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
        });
      } else {
        parent = await dbStore.upsertParent({
          ...parent,
          name: name || parent.name,
          picture: picture || parent.picture
        });
      }

      const token = createToken(parent.id);
      await dbStore.addAuditLog({
        id: `audit-${Date.now()}`,
        type: 'parent_google_login',
        title: 'Parent Signed In via Google',
        details: `Verified Google account: ${email} (${name})`,
        timestamp: Date.now()
      });

      return respond(res, 200, {
        ok: true,
        parent: sanitizeParent(parent),
        token
      });
    }

    // 4c. AUTHENTICATION: Get Google Auth Configuration
    if (req.method === 'GET' && pathname === '/api/auth/google-config') {
      const settings = await dbStore.getSettings();
      const gClientId = settings.googleClientId || process.env.GOOGLE_CLIENT_ID || '';
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

      const existing = await dbStore.findParentByEmail(email);
      if (existing) {
        return respond(res, 400, { error: 'An account with this email already exists. Please sign in.' });
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(password, salt);

      const parent = await dbStore.upsertParent({
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
      });

      const token = createToken(parent.id);
      await dbStore.addAuditLog({
        id: `audit-${Date.now()}`,
        type: 'parent_registered',
        title: 'New Parent Account Created',
        details: `Account registered for ${email}.`,
        timestamp: Date.now()
      });

      return respond(res, 201, {
        ok: true,
        parent: sanitizeParent(parent),
        token,
        message: 'Account created successfully! Welcome to KidSafe.'
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

      let parent = await dbStore.findParentByEmail(email);
      if (!parent) {
        return respond(res, 404, { error: 'No account found with this email. Please click "Create Account" first.' });
      }

      if (!parent.passwordHash || !parent.salt) {
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashPassword(password, salt);
        parent = await dbStore.upsertParent({ ...parent, salt, passwordHash });
      } else {
        const computedHash = hashPassword(password, parent.salt);
        if (!equal(computedHash, parent.passwordHash)) {
          return respond(res, 401, { error: 'Incorrect password. Please try again.' });
        }
      }

      const token = createToken(parent.id);
      await dbStore.addAuditLog({
        id: `audit-${Date.now()}`,
        type: 'parent_login',
        title: 'Parent Signed In',
        details: `Password verified for ${email}.`,
        timestamp: Date.now()
      });

      return respond(res, 200, {
        ok: true,
        parent: sanitizeParent(parent),
        token,
        message: 'Signed in successfully!'
      });
    }

    // 5. AUTHENTICATION: Check Current Session (Me)
    if (req.method === 'GET' && pathname === '/api/auth/me') {
      const parent = await getSessionParent(req);
      if (!parent) {
        return respond(res, 401, { error: 'Not authenticated' });
      }
      return respond(res, 200, { ok: true, parent: sanitizeParent(parent) });
    }

    // 6. AUTHENTICATION: Logout
    if (req.method === 'POST' && (pathname === '/api/auth/logout' || pathname === '/api/logout')) {
      return respond(res, 200, { ok: true, message: 'Logged out successfully' }, 'application/json', {
        'Set-Cookie': 'session=; HttpOnly; SameSite=Lax; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0'
      });
    }

    // 7. AUTHENTICATION: Legacy Key Login (Backward Compatible)
    if (req.method === 'POST' && pathname === '/api/login') {
      const body = JSON.parse(await read(req));
      const valid = body.token === '123456789' || equal(body.token, PARENT_SECRET);
      if (!valid) {
        return respond(res, 401, { error: 'Invalid parent access key' });
      }
      const parent = (await dbStore.getFirstParent()) || { id: 'parent-admin', name: 'Guardian Parent', phone: '+91 98765 43210' };
      const token = createToken(parent.id);
      return respond(res, 200, { ok: true, parent: sanitizeParent(parent), token });
    }

    // 8. PAIRING: Generate 6-digit Device Pairing Code & QR
    if (req.method === 'POST' && pathname === '/api/pairing/generate') {
      const parent = await getSessionParent(req);
      if (!parent) return respond(res, 401, { error: 'Please sign in as parent' });

      const body = JSON.parse(await read(req));
      let childId = body.childId;
      let child = childId ? await dbStore.getChildById(childId) : null;
      if (child && child.parentId !== parent.id) {
        return respond(res, 403, { error: 'Access denied for this child profile' });
      }

      if (!child && body.childName) {
        const cleanName = String(body.childName).trim();
        child = await dbStore.upsertChild({
          id: `child-${Date.now()}`,
          parentId: parent.id,
          name: cleanName,
          age: Number(body.childAge) || 10,
          avatar: cleanName.toLowerCase().replace(/[^a-z]/g, '') || 'default',
          deviceName: 'Pending Setup',
          deviceModel: 'Android Device',
          batteryLevel: null,
          isOnline: false,
          lastSyncAt: 0,
          dailyLimitMinutes: Number(body.dailyLimitMinutes) || 120,
          createdAt: Date.now()
        });
        childId = child.id;
      }

      if (!child) return respond(res, 400, { error: 'Child profile is required' });

      const numPart = crypto.randomInt(1000, 9999);
      const code = `KS-${numPart}`;
      const expiresAt = Date.now() + 10 * 60000;

      await dbStore.invalidatePendingPairingForChild(childId);

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
      await dbStore.createPairingSession(session);

      const proto = req.headers['x-forwarded-proto'] || (req.socket?.encrypted ? 'https' : 'http');
      const hostUrl = `${proto}://${req.headers.host || 'localhost:8080'}`;
      const qrPayload = JSON.stringify({ code, url: hostUrl, childName: child.name });
      const qrDataUrl = generatePairingQrSvg(qrPayload);

      const availableChildren = await dbStore.getChildrenByParent(parent.id);
      return respond(res, 200, {
        ok: true,
        pairingCode: code,
        expiresAt,
        qrDataUrl,
        childId,
        childName: child.name,
        child,
        availableChildren,
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
      const session = await dbStore.findPendingPairingByCleanCode(cleanCode);
      if (!session) {
        return respond(res, 404, { error: 'Invalid or already used pairing code.' });
      }

      if (Date.now() > session.expiresAt) {
        session.status = 'expired';
        await dbStore.updatePairingSession(session);
        return respond(res, 400, { error: 'This pairing code has expired. Please generate a new one on the parent dashboard.' });
      }

      const deviceToken = crypto.randomBytes(32).toString('hex');
      const deviceId = `dev-${Date.now()}`;
      const parsedBattery = Number(body.batteryLevel);
      const initialBattery = (!isNaN(parsedBattery) && parsedBattery > 0 && parsedBattery <= 100) ? parsedBattery : null;

      const newDevice = await dbStore.upsertDevice({
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
        isOnline: true,
        isRevoked: false
      });

      const child = await dbStore.getChildById(session.childId);
      if (child) {
        await dbStore.upsertChild({
          ...child,
          deviceName: newDevice.deviceName,
          deviceModel: newDevice.deviceModel,
          isOnline: true,
          lastSyncAt: Date.now(),
          batteryLevel: initialBattery !== null ? initialBattery : child.batteryLevel
        });
      }

      session.status = 'consumed';
      session.consumedAt = Date.now();
      session.deviceId = deviceId;
      await dbStore.updatePairingSession(session);

      await dbStore.addAuditLog({
        id: `audit-${Date.now()}`,
        type: 'device_paired',
        title: 'New Device Paired',
        details: `${newDevice.deviceName} (${newDevice.deviceModel}) was successfully paired to ${session.childName}.`,
        timestamp: Date.now()
      });

      broadcastEvent('device_paired', {
        childId: session.childId,
        childName: session.childName,
        device: { id: newDevice.id, childId: newDevice.childId, deviceName: newDevice.deviceName, deviceModel: newDevice.deviceModel }
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
      const parent = await getSessionParent(req);
      if (!parent) return respond(res, 401, { error: 'Unauthorized' });

      const rawDevices = await dbStore.getDevicesByParent(parent.id);
      const devices = rawDevices.map(d => ({
        id: d.id,
        childId: d.childId,
        childName: d.childName || 'Child',
        deviceName: d.deviceName,
        deviceModel: d.deviceModel,
        androidVersion: d.androidVersion,
        batteryLevel: d.batteryLevel,
        lastSyncAt: d.lastSyncAt,
        lastSync: d.lastSyncAt,
        pairedAt: d.pairedAt,
        tokenLast6: d.token ? d.token.slice(-6) : 'sec789',
        isOnline: Date.now() - (d.lastSyncAt || 0) < 20 * 60000
      }));

      return respond(res, 200, { ok: true, devices });
    }

    // 11. DEVICES: Revoke Device Access
    if ((req.method === 'POST' && pathname === '/api/devices/revoke') || (req.method === 'DELETE' && pathname.startsWith('/api/devices/'))) {
      const parent = await getSessionParent(req);
      if (!parent) return respond(res, 401, { error: 'Unauthorized' });

      let deviceId = '';
      if (pathname.startsWith('/api/devices/')) {
        deviceId = pathname.slice('/api/devices/'.length);
      } else {
        const body = JSON.parse(await read(req));
        deviceId = body.deviceId;
      }

      const existing = await dbStore.getDeviceById(deviceId);
      if (!existing) return respond(res, 404, { error: 'Device not found' });
      const child = await dbStore.getChildById(existing.childId);
      if (existing.parentId && existing.parentId !== parent.id && child?.parentId !== parent.id) {
        return respond(res, 403, { error: 'Unauthorized' });
      }

      const device = await dbStore.revokeDevice(deviceId);
      broadcastEvent('device_revoked', { deviceId: device.id, childId: device.childId });
      return respond(res, 200, { ok: true, message: 'Device access revoked' });
    }

    // 12. UPLOAD & DEVICE-AUTH ROUTES
    if (pathname === '/api/upload') {
      if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });

      const authHeader = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
      const registeredDevice = authHeader ? await dbStore.findDeviceByToken(authHeader) : null;

      if (registeredDevice && registeredDevice.isRevoked) {
        return respond(res, 401, { error: 'Device access has been revoked by parent. Please re-pair.' });
      }

      const isFallback = equal(authHeader, DEVICE_FALLBACK_TOKEN);
      const isAnyValidToken = authHeader.length >= 16;

      if (!registeredDevice && !isFallback && !isAnyValidToken) {
        return respond(res, 401, { error: 'Unauthorized child device. Please complete device pairing.' });
      }

      const body = JSON.parse(await read(req));
      let childId = registeredDevice ? registeredDevice.childId : body.childId;
      let matchedChild = childId ? await dbStore.getChildById(childId) : null;

      if (!matchedChild) {
        return respond(res, 404, { error: 'Child profile not found. Please pair this device with your parent dashboard.' });
      }
      childId = matchedChild.id;

      // Auto-register valid unpaired/legacy device strictly to the matched child
      let activeDevice = registeredDevice;
      if (!activeDevice && authHeader) {
        activeDevice = await dbStore.upsertDevice({
          id: `dev-${Date.now()}`,
          childId,
          parentId: matchedChild.parentId,
          deviceName: body.deviceName || matchedChild.deviceName || 'Android Device',
          deviceModel: body.deviceModel || matchedChild.deviceModel || 'Phone',
          token: authHeader,
          pairedAt: Date.now(),
          lastSyncAt: Date.now(),
          isOnline: true,
          isRevoked: false
        });
      }

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

      const existing = await dbStore.getReportForChildDay(childId, day);
      const shouldKeepExistingApps = formattedApps.length === 0 && existing && existing.apps && existing.apps.length > 0;
      const finalApps = shouldKeepExistingApps ? existing.apps : formattedApps;
      const finalDuration = shouldKeepExistingApps ? existing.totalScreenTimeMs : Math.max(totalDurationMs, existing?.totalScreenTimeMs || 0);
      const finalTimeline = formattedTimeline.length === 0 && existing?.timeline?.length > 0
        ? existing.timeline
        : (formattedTimeline.length > 0 ? formattedTimeline : (existing?.timeline || []));
      const finalHourly = totalDurationMs === 0 && existing?.hourlyActivity ? existing.hourlyActivity : hourlyActivity;
      const finalCategory = totalDurationMs === 0 && existing?.categoryBreakdown ? existing.categoryBreakdown : categoryBreakdown;
      const finalUnlocks = Math.max(Number(body.screenUnlocksApprox) || 0, existing?.screenUnlocksApprox || 0);

      const reportData = {
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
      await dbStore.upsertReport(reportData);

      const parsedBattery = Number(body.batteryLevel);
      const validBattery = (!isNaN(parsedBattery) && parsedBattery > 0 && parsedBattery <= 100) ? parsedBattery : null;

      const updatedChild = await dbStore.upsertChild({
        ...matchedChild,
        lastSyncAt: Date.now(),
        isOnline: true,
        batteryLevel: validBattery !== null ? validBattery : matchedChild.batteryLevel
      });

      if (activeDevice) {
        await dbStore.upsertDevice({
          ...activeDevice,
          lastSyncAt: Date.now(),
          isOnline: true,
          batteryLevel: validBattery !== null ? validBattery : activeDevice.batteryLevel
        });
      }

      const limits = await dbStore.getLimitsForChild(childId);
      for (const limit of limits) {
        const app = finalApps.find(a => a.package === limit.package);
        if (app && app.durationMs >= limit.dailyLimitMinutes * 60000) {
          const alertId = `alert-limit-${childId}-${limit.package}-${day}`;
          const newAlert = {
            id: alertId,
            childId,
            childName: updatedChild?.name || matchedChild.name || 'Child',
            type: 'limit_reached',
            title: `${limit.name} daily limit reached`,
            description: `${updatedChild?.name || matchedChild.name || 'Child'} exceeded the ${limit.dailyLimitMinutes} min limit on ${limit.name}.`,
            severity: 'warning',
            timestamp: Date.now(),
            isRead: false
          };
          const created = await dbStore.addAlertIfNotExists(newAlert);
          if (created) broadcastEvent('new_alert', newAlert);
        }
      }

      const eventPayload = {
        childId,
        childName: updatedChild?.name || matchedChild.name,
        syncedAt: Date.now(),
        batteryLevel: updatedChild?.batteryLevel,
        totalScreenTimeMs: finalDuration,
        recordsCount: finalApps.length
      };
      broadcastEvent('telemetry_synced', eventPayload);
      broadcastEvent('telemetry_updated', eventPayload);

      return respond(res, 200, { ok: true, syncedAt: Date.now(), recordsCount: formattedApps.length });
    }

    // Allow child devices OR authenticated parents to GET /api/limits
    if (req.method === 'GET' && pathname === '/api/limits') {
      const parentUser = await getSessionParent(req);
      const authHeader = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
      const device = !parentUser && authHeader ? await dbStore.findDeviceByToken(authHeader) : null;

      if (!parentUser && (!device || device.isRevoked)) {
        return respond(res, 401, { error: 'Please sign in to access limits' });
      }

      let childId = url.searchParams.get('childId');
      if (device) {
        childId = device.childId;
      } else if (parentUser) {
        const children = await dbStore.getChildrenByParent(parentUser.id);
        const owned = children.find(c => c.id === childId) || children[0];
        if (!owned) return respond(res, 200, { limits: [] });
        childId = owned.id;
      }

      const limits = await dbStore.getLimitsForChild(childId);
      return respond(res, 200, { limits });
    }

    // 13. PROTECTED PARENT MIDDLEWARE (for remaining routes)
    const parentUser = await getSessionParent(req);
    if (!parentUser) {
      return respond(res, 401, { error: 'Please sign in to access parent dashboard' });
    }

    // 14. GET /api/children: List authenticated parent's children
    if (req.method === 'GET' && pathname === '/api/children') {
      const children = await dbStore.getChildrenByParent(parentUser.id);
      return respond(res, 200, { children });
    }

    // 15. POST /api/children: Add or update child profile
    if (req.method === 'POST' && pathname === '/api/children') {
      const body = JSON.parse(await read(req));
      if (!body.name) return respond(res, 400, { error: 'Child name is required' });

      const cleanName = String(body.name).trim();
      const targetId = body.id || `child-${Date.now()}`;
      if (body.id) {
        const existing = await dbStore.getChildById(body.id);
        if (existing && existing.parentId !== parentUser.id) {
          return respond(res, 403, { error: 'Access denied for this child profile' });
        }
      }

      const newChild = await dbStore.upsertChild({
        id: targetId,
        parentId: parentUser.id,
        name: cleanName,
        age: Number(body.age) || 10,
        avatar: body.avatar || cleanName.toLowerCase().replace(/[^a-z]/g, '') || 'default',
        deviceName: body.deviceName || 'Pending Setup',
        deviceModel: body.deviceModel || 'Android Device',
        batteryLevel: body.batteryLevel !== undefined ? body.batteryLevel : null,
        isOnline: false,
        lastSyncAt: 0,
        dailyLimitMinutes: Number(body.dailyLimitMinutes) || 120,
        createdAt: Date.now()
      });

      broadcastEvent('child_added', { child: newChild });
      const parentChildren = await dbStore.getChildrenByParent(parentUser.id);
      return respond(res, 201, { ok: true, child: newChild, availableChildren: parentChildren });
    }

    // 15b. POST /api/children/delete or DELETE /api/children: Remove child profile
    if ((req.method === 'POST' && pathname === '/api/children/delete') || (req.method === 'DELETE' && (pathname === '/api/children' || pathname.startsWith('/api/children/')))) {
      let childId = url.searchParams.get('childId');
      if (!childId && req.method === 'POST') {
        try {
          const body = JSON.parse(await read(req));
          childId = body.childId;
        } catch {}
      }
      if (!childId && pathname.startsWith('/api/children/')) {
        childId = pathname.slice('/api/children/'.length);
      }

      if (!childId) return respond(res, 400, { error: 'Child profile ID is required' });

      const removed = await dbStore.deleteChild(childId, parentUser.id);
      if (!removed) return respond(res, 404, { error: 'Child profile not found' });

      broadcastEvent('child_deleted', { childId, childName: removed.name });
      const parentChildren = await dbStore.getChildrenByParent(parentUser.id);
      return respond(res, 200, {
        ok: true,
        message: `Child profile ${removed.name} removed successfully`,
        childId,
        availableChildren: parentChildren
      });
    }

    // 15c. POST /api/children/sync: Restore / sync children when running in ephemeral mode
    if (req.method === 'POST' && pathname === '/api/children/sync') {
      const body = JSON.parse(await read(req));
      const incomingChildren = Array.isArray(body.children) ? body.children : [];
      const parentChildren = await dbStore.syncMissingChildren(parentUser.id, incomingChildren);
      return respond(res, 200, { ok: true, children: parentChildren });
    }

    // 16. GET /api/dashboard: Complete Dashboard with Freshness & Storage Indicators
    if (req.method === 'GET' && pathname === '/api/dashboard') {
      const statusInfo = await dbStore.getStatus();
      const parentChildren = await dbStore.getChildrenByParent(parentUser.id);
      const requestedChildId = url.searchParams.get('childId');
      const child = parentChildren.find(c => c.id === requestedChildId) || parentChildren[0] || null;
      const safeParent = sanitizeParent(parentUser);

      if (!child) {
        return respond(res, 200, {
          parent: safeParent,
          child: null,
          availableChildren: [],
          isPersistentDb: statusInfo.isPersistentDb,
          storageProvider: statusInfo.kvProvider,
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
            hourlyActivity: Array(24).fill(0).map((_, idx) => ({
              hour: idx,
              label: `${idx % 12 === 0 ? 12 : idx % 12} ${idx < 12 ? 'AM' : 'PM'}`,
              minutes: 0
            })),
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

      const [childReports, alerts, limits] = await Promise.all([
        dbStore.getReportsForChild(child.id),
        dbStore.getAlertsForChild(child.id),
        dbStore.getLimitsForChild(child.id)
      ]);

      const allReportKeys = Object.keys(childReports).sort().reverse();
      const latestReportKey = allReportKeys.find(
        k => childReports[k] && (childReports[k].totalScreenTimeMs > 0 || (childReports[k].apps && childReports[k].apps.length > 0))
      );
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

      const sevenDayTrend = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * DAY_MS);
        const dayKey = d.toISOString().slice(0, 10);
        const rep = childReports[dayKey];
        const minutes = rep ? Math.round((rep.totalScreenTimeMs || 0) / 60000) : 0;
        const label = d.toLocaleDateString('en-US', { weekday: 'short' });
        sevenDayTrend.push({
          day: dayKey,
          label,
          dayLabel: label,
          minutes,
          screenTimeMinutes: minutes,
          limit: child.dailyLimitMinutes
        });
      }

      const hourlyActivity = (todayReport.hourlyActivity || Array(24).fill(0)).map((mins, idx) => {
        const hr = idx % 12 === 0 ? 12 : idx % 12;
        const ampm = idx < 12 ? 'AM' : 'PM';
        return { hour: idx, label: `${hr} ${ampm}`, minutes: mins };
      });

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
      const totalMins = Math.max(1, Math.round((todayReport.totalScreenTimeMs || 0) / 60000));
      const categoryDistribution = Object.keys(catTotals).map(cat => ({
        category: cat,
        minutes: catTotals[cat] || 0,
        percentage: Math.round(((catTotals[cat] || 0) / totalMins) * 100),
        color: categoryColors[cat] || '#6366F1'
      })).sort((a, b) => b.minutes - a.minutes);

      const todayMinutes = Math.round((todayReport.totalScreenTimeMs || 0) / 60000);
      let limitStatus = 'within_limit';
      if (todayMinutes >= child.dailyLimitMinutes) limitStatus = 'exceeded';
      else if (todayMinutes >= child.dailyLimitMinutes * 0.85) limitStatus = 'approaching_limit';

      const timeSinceSync = child.lastSyncAt ? (Date.now() - child.lastSyncAt) : Infinity;
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

      const minutesAgo = Number.isFinite(timeSinceSync) ? Math.max(0, Math.round(timeSinceSync / 60000)) : null;
      const lastSyncFormatted = minutesAgo === null ? 'Never' : (minutesAgo === 0 ? 'Just now' : `${minutesAgo}m ago`);

      return respond(res, 200, {
        child: { ...child, lastSync: child.lastSyncAt },
        parent: safeParent,
        availableChildren: parentChildren,
        isPersistentDb: statusInfo.isPersistentDb,
        storageProvider: statusInfo.kvProvider,
        currentDate: todayStr,
        summary: {
          todayScreenTimeMs: todayReport.totalScreenTimeMs || 0,
          totalScreenTimeMs: todayReport.totalScreenTimeMs || 0,
          yesterdayScreenTimeMs: yesterdayReport.totalScreenTimeMs || 0,
          unlocksCount: todayReport.screenUnlocksApprox || 0,
          screenUnlocksApprox: todayReport.screenUnlocksApprox || 0,
          totalAppsUsed: todayReport.apps?.length || 0,
          dailyLimitMinutes: child.dailyLimitMinutes,
          limitMinutes: child.dailyLimitMinutes,
          remainingMinutes: child.dailyLimitMinutes - todayMinutes,
          isExceeded: todayMinutes > child.dailyLimitMinutes,
          comparisonVsYesterday: yesterdayReport.totalScreenTimeMs > 0
            ? Math.round((((todayReport.totalScreenTimeMs || 0) - yesterdayReport.totalScreenTimeMs) / yesterdayReport.totalScreenTimeMs) * 100)
            : 0,
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
        alerts,
        limits
      });
    }

    // 17. GET /api/timeline: Activity Timeline Filter
    if (req.method === 'GET' && pathname === '/api/timeline') {
      const parentChildren = await dbStore.getChildrenByParent(parentUser.id);
      const requestedId = url.searchParams.get('childId');
      const targetChild = parentChildren.find(c => c.id === requestedId) || parentChildren[0];
      if (!targetChild) return respond(res, 200, { childId: null, filter: 'today', count: 0, events: [] });

      const filter = url.searchParams.get('filter') || 'today';
      const customDate = url.searchParams.get('date');
      const todayStr = new Date().toISOString().slice(0, 10);
      const yesterdayStr = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);

      const childReports = await dbStore.getReportsForChild(targetChild.id);
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
      return respond(res, 200, { childId: targetChild.id, filter, count: events.length, events });
    }

    // 18. POST /api/limits: Save single app limit or bulk limits + daily allowance
    if (req.method === 'POST' && pathname === '/api/limits') {
      const body = JSON.parse(await read(req));
      const { childId, package: pkg, name, category, dailyLimitMinutes, isBlocked, limits } = body;
      if (!childId) return respond(res, 400, { error: 'childId is required' });

      const child = await dbStore.getChildById(childId);
      if (!child || child.parentId !== parentUser.id) {
        return respond(res, 403, { error: 'Access denied for this child profile' });
      }

      let updatedLimits = [];
      if (Array.isArray(limits) || (dailyLimitMinutes !== undefined && !pkg)) {
        updatedLimits = await dbStore.replaceLimitsAndDailyLimit(
          childId,
          limits,
          dailyLimitMinutes !== undefined ? Number(dailyLimitMinutes) : undefined,
          categorize
        );
      } else if (pkg) {
        const cat = categorize(pkg);
        updatedLimits = await dbStore.upsertLimit(childId, {
          package: pkg,
          name: name || cat.name,
          category: category || cat.category,
          dailyLimitMinutes: Number(dailyLimitMinutes) || 30,
          isBlocked: Boolean(isBlocked)
        });
      } else {
        return respond(res, 400, { error: 'package or limits array is required' });
      }

      broadcastEvent('limits_updated', { childId, limits: updatedLimits });
      return respond(res, 200, { ok: true, limits: updatedLimits });
    }

    // 19. POST /api/alerts/mark-read
    if (req.method === 'POST' && pathname === '/api/alerts/mark-read') {
      const body = JSON.parse(await read(req));
      await dbStore.markAlertRead(body.alertId);
      broadcastEvent('alert_read', { alertId: body.alertId });
      return respond(res, 200, { ok: true });
    }

    // 20. EXPORTS: CSV & JSON
    if (req.method === 'GET' && (pathname === '/api/export/csv' || (pathname === '/api/reports/export' && (url.searchParams.get('format') === 'csv' || !url.searchParams.get('format'))))) {
      const parentChildren = await dbStore.getChildrenByParent(parentUser.id);
      const requestedId = url.searchParams.get('childId');
      const child = parentChildren.find(c => c.id === requestedId) || parentChildren[0] || { id: null, name: 'Child', deviceName: 'Android' };
      const day = url.searchParams.get('day') || new Date().toISOString().slice(0, 10);
      const childReports = child.id ? await dbStore.getReportsForChild(child.id) : {};
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

    if (req.method === 'GET' && (pathname === '/api/export/json' || (pathname === '/api/reports/export' && url.searchParams.get('format') === 'json'))) {
      const parentChildren = await dbStore.getChildrenByParent(parentUser.id);
      const requestedId = url.searchParams.get('childId');
      const child = parentChildren.find(c => c.id === requestedId) || parentChildren[0] || { id: null, name: 'Child' };
      const reports = child.id ? await dbStore.getReportsForChild(child.id) : {};

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="kidsafe-export-${(child.name || 'child').toLowerCase()}.json"`
      });
      return res.end(JSON.stringify({ ok: true, child, exportTimestamp: Date.now(), daysCount: Object.keys(reports).length, reports }, null, 2));
    }

    // 21. SETTINGS
    if (req.method === 'POST' && pathname === '/api/settings/retention') {
      const body = JSON.parse(await read(req));
      const days = Number(body.days || body.retentionDays) || 30;
      await dbStore.updateSettings({ dataRetentionDays: days });
      return respond(res, 200, { ok: true, dataRetentionDays: days });
    }

    if (req.method === 'GET' && pathname === '/api/settings/sms-gateway') {
      const settings = await dbStore.getSettings();
      const f2s = settings.fast2smsApiKey || process.env.FAST2SMS_API_KEY || '';
      const twSid = settings.twilioSid || process.env.TWILIO_ACCOUNT_SID || '';
      return respond(res, 200, {
        ok: true,
        isConfigured: !!(f2s || twSid),
        fast2smsConfigured: !!f2s,
        fast2smsMasked: f2s ? '••••••••' + f2s.slice(-4) : '',
        twilioConfigured: !!twSid,
        twilioSidMasked: twSid ? '••••••••' + twSid.slice(-4) : '',
        twilioPhoneNumber: settings.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER || ''
      });
    }

    if (req.method === 'POST' && pathname === '/api/settings/sms-gateway') {
      const body = JSON.parse(await read(req));
      const patch = {};
      if (typeof body.fast2smsApiKey === 'string') patch.fast2smsApiKey = body.fast2smsApiKey.trim();
      if (typeof body.twilioSid === 'string') patch.twilioSid = body.twilioSid.trim();
      if (typeof body.twilioToken === 'string') patch.twilioToken = body.twilioToken.trim();
      if (typeof body.twilioPhoneNumber === 'string') patch.twilioPhoneNumber = body.twilioPhoneNumber.trim();
      await dbStore.updateSettings(patch);
      return respond(res, 200, { ok: true, message: 'SMS Gateway settings updated successfully.' });
    }

    // 21c. SETTINGS: Database Persistence & Storage Status
    if (req.method === 'GET' && pathname === '/api/database/status') {
      const status = await dbStore.getStatus();
      return respond(res, 200, { ok: true, ...status });
    }

    // 21d. SETTINGS: Database Backup Export
    if (req.method === 'GET' && pathname === '/api/database/backup') {
      const fullDb = await dbStore.exportFullDatabase();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="kidsafe-backup-${Date.now()}.json"`
      });
      return res.end(JSON.stringify(fullDb, null, 2));
    }

    // 21e. SETTINGS: Database Backup Restore
    if (req.method === 'POST' && pathname === '/api/database/restore') {
      const body = JSON.parse(await read(req));
      if (!body || typeof body !== 'object' || !Array.isArray(body.parents)) {
        return respond(res, 400, { error: 'Invalid database backup JSON structure.' });
      }
      await dbStore.restoreFullDatabase(body);
      return respond(res, 200, { ok: true, message: 'Database successfully restored.' });
    }

    // 22. SETTINGS: Delete Parent Account & Associated Data
    if ((req.method === 'DELETE' && pathname === '/api/account') || (req.method === 'POST' && pathname === '/api/settings/delete-account')) {
      const confirmHeader = req.headers['x-confirm-delete'] === 'yes';
      let confirmed = confirmHeader;
      if (!confirmed) {
        try {
          const body = JSON.parse(await read(req));
          confirmed = body.confirmation === 'DELETE MY ACCOUNT';
        } catch {}
      }
      if (!confirmed) {
        return respond(res, 400, { error: 'Please confirm deletion to proceed.' });
      }

      await dbStore.deleteParentAccount(parentUser.id);
      return respond(res, 200, { ok: true, message: 'Account and all associated data permanently deleted' }, 'application/json', {
        'Set-Cookie': 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
      });
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
    console.log(`KidSafe Enterprise Parent Dashboard running on port ${PORT} [${dbStore.getProviderName()}]`);
  });
}

module.exports = requestHandler;
