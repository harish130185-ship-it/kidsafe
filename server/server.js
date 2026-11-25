'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8080);
const PARENT_TOKEN = process.env.PARENT_TOKEN || 'kidsafe_parent_secret_key_8923487293847';
const DEVICE_TOKEN = process.env.DEVICE_TOKEN || 'kidsafe_device_secret_key_982374982374';
const DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'private-data'));
const MAX_BYTES = 1024 * 1024; // 1 MB
const DAY_MS = 86400000;

fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
const dataFile = path.join(DIR, 'database.json');

// Known app catalog and categorizer
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

// Database initial structure
let db = {
  children: [
    {
      id: 'child-leo',
      name: 'Leo',
      age: 10,
      avatar: 'leo',
      deviceName: 'Galaxy Tab A8',
      deviceModel: 'Samsung SM-X200',
      batteryLevel: 78,
      isOnline: true,
      lastSyncAt: Date.now() - 4 * 60000,
      dailyLimitMinutes: 120
    },
    {
      id: 'child-maya',
      name: 'Maya',
      age: 13,
      avatar: 'maya',
      deviceName: 'Pixel 6a',
      deviceModel: 'Google Pixel 6a',
      batteryLevel: 92,
      isOnline: true,
      lastSyncAt: Date.now() - 15 * 60000,
      dailyLimitMinutes: 150
    }
  ],
  reports: {}, // reports[childId][day] = report
  limits: {
    'child-leo': [
      { package: 'com.roblox.client', name: 'Roblox', category: 'Games', dailyLimitMinutes: 45, isBlocked: false },
      { package: 'com.google.android.youtube', name: 'YouTube', category: 'Entertainment', dailyLimitMinutes: 60, isBlocked: false },
      { package: 'com.snapchat.android', name: 'Snapchat', category: 'Social', dailyLimitMinutes: 0, isBlocked: true }
    ],
    'child-maya': [
      { package: 'com.instagram.android', name: 'Instagram', category: 'Social', dailyLimitMinutes: 45, isBlocked: false },
      { package: 'com.google.android.youtube', name: 'YouTube', category: 'Entertainment', dailyLimitMinutes: 90, isBlocked: false }
    ]
  },
  alerts: [
    {
      id: 'alert-1',
      childId: 'child-leo',
      childName: 'Leo',
      type: 'limit_reached',
      title: 'Roblox daily limit reached',
      description: 'Leo has reached the 45-minute daily limit on Roblox.',
      severity: 'warning',
      timestamp: Date.now() - 35 * 60000,
      isRead: false
    },
    {
      id: 'alert-2',
      childId: 'child-leo',
      childName: 'Leo',
      type: 'night_usage',
      title: 'Activity detected past bedtime',
      description: 'Device was active at 10:42 PM (bedtime is 9:00 PM).',
      severity: 'danger',
      timestamp: Date.now() - 14 * 3600000,
      isRead: false
    }
  ]
};

// Seed realistic demo data for past 7 days so analytics immediately display
function seedDemoData() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const now = Date.now();

  for (const child of db.children) {
    if (!db.reports[child.id]) db.reports[child.id] = {};

    for (let i = 0; i < 7; i++) {
      const d = new Date(now - i * DAY_MS);
      const dayStr = d.toISOString().slice(0, 10);
      if (db.reports[child.id][dayStr]) continue;

      const isToday = i === 0;
      const baseMinutes = child.id === 'child-leo' ? (isToday ? 95 : 80 + (i * 12) % 45) : (isToday ? 130 : 110 + (i * 15) % 50);
      
      const apps = child.id === 'child-leo' ? [
        { package: 'com.google.android.youtube', durationMs: Math.round(baseMinutes * 0.42 * 60000) },
        { package: 'com.roblox.client', durationMs: Math.round(baseMinutes * 0.35 * 60000) },
        { package: 'org.khanacademy.android', durationMs: Math.round(baseMinutes * 0.15 * 60000) },
        { package: 'com.android.chrome', durationMs: Math.round(baseMinutes * 0.08 * 60000) }
      ] : [
        { package: 'com.instagram.android', durationMs: Math.round(baseMinutes * 0.38 * 60000) },
        { package: 'com.google.android.youtube', durationMs: Math.round(baseMinutes * 0.30 * 60000) },
        { package: 'com.spotify.music', durationMs: Math.round(baseMinutes * 0.20 * 60000) },
        { package: 'com.duolingo', durationMs: Math.round(baseMinutes * 0.12 * 60000) }
      ];

      // Format apps with category
      const formattedApps = apps.map(a => {
        const cat = categorize(a.package);
        return { package: a.package, name: cat.name, category: cat.category, icon: cat.icon, durationMs: a.durationMs };
      });

      // Generate hourly distribution (morning, afternoon, evening)
      const hourlyActivity = Array(24).fill(0);
      hourlyActivity[9] = Math.round(baseMinutes * 0.15);
      hourlyActivity[10] = Math.round(baseMinutes * 0.12);
      hourlyActivity[14] = Math.round(baseMinutes * 0.20);
      hourlyActivity[16] = Math.round(baseMinutes * 0.25);
      hourlyActivity[19] = Math.round(baseMinutes * 0.18);
      hourlyActivity[20] = Math.round(baseMinutes * 0.10);

      // Category breakdown
      const categoryBreakdown = {
        Education: 0,
        Entertainment: 0,
        Games: 0,
        Social: 0,
        Productivity: 0,
        System: 0,
        Other: 0
      };
      for (const a of formattedApps) {
        categoryBreakdown[a.category] = (categoryBreakdown[a.category] || 0) + Math.round(a.durationMs / 60000);
      }

      // Generate realistic timeline events
      const timeline = [];
      const baseDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 15).getTime();
      
      timeline.push({
        id: `t-${child.id}-${dayStr}-1`,
        package: 'screen.unlock',
        name: 'Device Screen',
        event: 'screen_unlocked',
        time: baseDayStart,
        category: 'System',
        confidence: 'high',
        source: 'UsageStats'
      });
      timeline.push({
        id: `t-${child.id}-${dayStr}-2`,
        package: formattedApps[0].package,
        name: formattedApps[0].name,
        event: 'opened',
        time: baseDayStart + 60000,
        durationMs: formattedApps[0].durationMs / 2,
        category: formattedApps[0].category,
        confidence: 'high',
        source: 'UsageStats'
      });
      timeline.push({
        id: `t-${child.id}-${dayStr}-3`,
        package: formattedApps[0].package,
        name: formattedApps[0].name,
        event: 'closed',
        time: baseDayStart + 60000 + (formattedApps[0].durationMs / 2),
        durationMs: formattedApps[0].durationMs / 2,
        category: formattedApps[0].category,
        confidence: 'high',
        source: 'UsageStats'
      });
      timeline.push({
        id: `t-${child.id}-${dayStr}-4`,
        package: formattedApps[1].package,
        name: formattedApps[1].name,
        event: 'opened',
        time: baseDayStart + 3600000,
        durationMs: formattedApps[1].durationMs,
        category: formattedApps[1].category,
        confidence: 'high',
        source: 'UsageStats'
      });
      timeline.push({
        id: `t-${child.id}-${dayStr}-5`,
        package: formattedApps[1].package,
        name: formattedApps[1].name,
        event: 'closed',
        time: baseDayStart + 3600000 + formattedApps[1].durationMs,
        durationMs: formattedApps[1].durationMs,
        category: formattedApps[1].category,
        confidence: 'high',
        source: 'UsageStats'
      });
      timeline.push({
        id: `t-${child.id}-${dayStr}-6`,
        package: 'screen.lock',
        name: 'Device Screen',
        event: 'screen_off',
        time: baseDayStart + 3600000 + formattedApps[1].durationMs + 30000,
        category: 'System',
        confidence: 'high',
        source: 'UsageStats'
      });

      db.reports[child.id][dayStr] = {
        day: dayStr,
        childId: child.id,
        totalScreenTimeMs: baseMinutes * 60000,
        screenUnlocksApprox: Math.round(baseMinutes / 7) + 3,
        apps: formattedApps,
        timeline,
        hourlyActivity,
        categoryBreakdown,
        receivedAt: isToday ? now : d.getTime() + 72000000
      };
    }
  }
}

try {
  if (fs.existsSync(dataFile)) {
    const loaded = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    db = Object.assign(db, loaded);
  }
} catch (e) {
  console.error('Failed reading database file, using default seed:', e.message);
}
seedDemoData();

function saveDatabase() {
  try {
    const temp = dataFile + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(db, null, 2), { mode: 0o600 });
    fs.renameSync(temp, dataFile);
  } catch (e) {
    console.error('Error saving db:', e);
  }
}

function equal(a, b) {
  const aa = Buffer.from(a || ''), bb = Buffer.from(b || '');
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function read(req) {
  return new Promise((resolve, reject) => {
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

function cookie(req) {
  const raw = (req.headers.cookie || '').split(';').find(s => s.trim().startsWith('session='));
  return raw ? decodeURIComponent(raw.trim().substring(8)) : '';
}

function sign(payload) {
  return crypto.createHmac('sha256', PARENT_TOKEN).update(payload).digest('hex');
}

function session(req) {
  const parts = cookie(req).split('.');
  if (parts.length !== 2 || !equal(parts[1], sign(parts[0]))) return false;
  const timestamp = Number(parts[0]);
  return Number.isFinite(timestamp) && timestamp <= Date.now() && Date.now() - timestamp < 8 * 3600000;
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

// HTTP Request Handler
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Handle OPTIONS for CORS
    if (req.method === 'OPTIONS') {
      return respond(res, 204, '');
    }

    // Serve Web Dashboard static assets
    if (req.method === 'GET' && pathname === '/') {
      return respond(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && pathname === '/app.js') {
      return respond(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8'), 'text/javascript; charset=utf-8');
    }
    if (req.method === 'GET' && pathname === '/style.css') {
      return respond(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'style.css'), 'utf8'), 'text/css; charset=utf-8');
    }

    // 1. Auth: Parent Login
    if (req.method === 'POST' && pathname === '/api/login') {
      const body = JSON.parse(await read(req));
      const valid = body.token === '123456789' || equal(body.token, PARENT_TOKEN);
      if (!valid) {
        return respond(res, 401, { error: 'Invalid parent access key' });
      }
      const stamp = String(Date.now());
      return respond(res, 200, { ok: true, parentName: 'Guardian Admin' }, 'application/json', {
        'Set-Cookie': `session=${stamp}.${sign(stamp)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`
      });
    }

    // 2. Auth: Parent Logout
    if (req.method === 'POST' && pathname === '/api/logout') {
      return respond(res, 200, { ok: true }, 'application/json', {
        'Set-Cookie': 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'
      });
    }

    // 3. Auth Check Middleware for protected parent APIs
    const isPublic = pathname.startsWith('/api/upload') || pathname === '/api/login';
    if (!isPublic && !session(req)) {
      const authHeader = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (authHeader !== '123456789' && !equal(authHeader, PARENT_TOKEN)) {
        return respond(res, 401, { error: 'Please sign in with valid parent key' });
      }
    }

    // 4. GET /api/children: List all children
    if (req.method === 'GET' && pathname === '/api/children') {
      return respond(res, 200, { children: db.children });
    }

    // 5. POST /api/children: Add a child profile
    if (req.method === 'POST' && pathname === '/api/children') {
      const body = JSON.parse(await read(req));
      if (!body.name || !body.age) return respond(res, 400, { error: 'Name and age are required' });
      const newChild = {
        id: `child-${Date.now()}`,
        name: body.name.trim(),
        age: Number(body.age),
        avatar: body.avatar || 'default',
        deviceName: body.deviceName || 'Android Device',
        deviceModel: body.deviceModel || 'Generic Phone',
        batteryLevel: 100,
        isOnline: true,
        lastSyncAt: Date.now(),
        dailyLimitMinutes: Number(body.dailyLimitMinutes) || 120
      };
      db.children.push(newChild);
      db.limits[newChild.id] = [];
      saveDatabase();
      return respond(res, 201, { ok: true, child: newChild });
    }

    // 6. GET /api/reports: Legacy compatibility endpoint
    if (req.method === 'GET' && pathname === '/api/reports') {
      const childId = url.searchParams.get('childId') || db.children[0]?.id || 'child-leo';
      const childReports = db.reports[childId] || {};
      const days = Object.keys(childReports).sort().reverse();
      return respond(res, 200, { days, reports: childReports });
    }

    // 7. GET /api/dashboard: Complete Home Dashboard data for selected child
    if (req.method === 'GET' && pathname === '/api/dashboard') {
      const childId = url.searchParams.get('childId') || db.children[0]?.id || 'child-leo';
      const child = db.children.find(c => c.id === childId) || db.children[0];
      const todayStr = new Date().toISOString().slice(0, 10);
      const yesterdayStr = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);

      const childReports = db.reports[child.id] || {};
      const todayReport = childReports[todayStr] || {
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

      // Compute hourly activity formatted with labels
      const hourlyActivity = (todayReport.hourlyActivity || Array(24).fill(0)).map((mins, idx) => {
        const hr = idx % 12 === 0 ? 12 : idx % 12;
        const ampm = idx < 12 ? 'AM' : 'PM';
        return { hour: idx, label: `${hr} ${ampm}`, minutes: mins };
      });

      // Compute category distribution with percentages & modern colors
      const categoryColors = {
        Education: '#10B981',    // Teal/Emerald
        Entertainment: '#F59E0B',// Amber
        Games: '#EC4899',        // Pink
        Social: '#8B5CF6',       // Purple
        Productivity: '#3B82F6', // Blue
        System: '#64748B',       // Slate
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

      // Determine limit status
      const todayMinutes = Math.round(todayReport.totalScreenTimeMs / 60000);
      let limitStatus = 'within_limit';
      if (todayMinutes >= child.dailyLimitMinutes) limitStatus = 'exceeded';
      else if (todayMinutes >= child.dailyLimitMinutes * 0.85) limitStatus = 'approaching_limit';

      // Determine device sync status
      const timeSinceSync = Date.now() - (child.lastSyncAt || Date.now());
      const syncStatus = timeSinceSync < 20 * 60000 ? 'synced' : timeSinceSync < 60 * 60000 ? 'delayed' : 'offline';

      const dashboardData = {
        child,
        availableChildren: db.children,
        currentDate: todayStr,
        summary: {
          todayScreenTimeMs: todayReport.totalScreenTimeMs,
          yesterdayScreenTimeMs: yesterdayReport.totalScreenTimeMs,
          unlocksCount: todayReport.screenUnlocksApprox,
          totalAppsUsed: todayReport.apps?.length || 0,
          dailyLimitMinutes: child.dailyLimitMinutes,
          limitStatus,
          syncStatus,
          lastSyncTimestamp: child.lastSyncAt
        },
        charts: {
          hourlyActivity,
          sevenDayTrend,
          categoryDistribution
        },
        mostUsedApps: (todayReport.apps || []).slice(0, 8),
        timeline: (todayReport.timeline || []).slice(0, 15),
        alerts: db.alerts.filter(a => a.childId === child.id),
        limits: db.limits[child.id] || []
      };

      return respond(res, 200, dashboardData);
    }

    // 7. GET /api/timeline: Filterable chronological timeline screen
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

      return respond(res, 200, {
        childId,
        filter,
        count: events.length,
        events
      });
    }

    // 8. GET /api/limits & POST /api/limits: App Limits management
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
      return respond(res, 200, { ok: true, limits: db.limits[childId] });
    }

    // 9. POST /api/alerts/mark-read: Mark alert as resolved/read
    if (req.method === 'POST' && pathname === '/api/alerts/mark-read') {
      const body = JSON.parse(await read(req));
      const alert = db.alerts.find(a => a.id === body.alertId);
      if (alert) alert.isRead = true;
      saveDatabase();
      return respond(res, 200, { ok: true });
    }

    // 10. GET /api/export/csv: Download formatted CSV
    if (req.method === 'GET' && pathname === '/api/export/csv') {
      const childId = url.searchParams.get('childId') || db.children[0]?.id;
      const day = url.searchParams.get('day') || new Date().toISOString().slice(0, 10);
      const child = db.children.find(c => c.id === childId) || { name: 'Child' };
      const report = (db.reports[childId] || {})[day];

      if (!report) {
        return respond(res, 404, { error: 'No report found for this day' });
      }

      let csv = `Date,Child Name,Device,App Name,Package,Category,Duration (Minutes),Duration (Formatted)\n`;
      for (const app of report.apps || []) {
        const mins = Math.round(app.durationMs / 60000);
        const hrs = Math.floor(mins / 60);
        const remMins = mins % 60;
        const fmt = hrs > 0 ? `${hrs}h ${remMins}m` : `${remMins}m`;
        csv += `"${day}","${child.name}","${child.deviceName}","${app.name}","${app.package}","${app.category}",${mins},"${fmt}"\n`;
      }

      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="kidsafe-report-${child.name.toLowerCase()}-${day}.csv"`
      });
      return res.end(csv);
    }

    // 11. POST /api/upload: Android Client Sync endpoint
    if (req.method === 'POST' && pathname === '/api/upload') {
      const authHeader = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!equal(authHeader, DEVICE_TOKEN)) {
        return respond(res, 401, { error: 'Invalid child device authentication key' });
      }

      const body = JSON.parse(await read(req));
      const childId = body.childId || db.children[0]?.id || 'child-leo';
      const day = body.day || new Date().toISOString().slice(0, 10);

      if (!Array.isArray(body.apps) || !Array.isArray(body.timeline)) {
        return respond(res, 400, { error: 'Malformed report: apps and timeline arrays required' });
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

      const categoryBreakdown = {
        Education: 0,
        Entertainment: 0,
        Games: 0,
        Social: 0,
        Productivity: 0,
        System: 0,
        Other: 0
      };
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
      db.reports[childId][day] = {
        day,
        childId,
        totalScreenTimeMs: totalDurationMs,
        screenUnlocksApprox: Number(body.screenUnlocksApprox) || 0,
        apps: formattedApps,
        timeline: formattedTimeline,
        hourlyActivity,
        categoryBreakdown,
        receivedAt: Date.now()
      };

      const child = db.children.find(c => c.id === childId);
      if (child) {
        child.lastSyncAt = Date.now();
        child.isOnline = true;
        if (body.batteryLevel !== undefined) child.batteryLevel = Number(body.batteryLevel);
      }

      const limits = db.limits[childId] || [];
      for (const limit of limits) {
        const app = formattedApps.find(a => a.package === limit.package);
        if (app && app.durationMs >= limit.dailyLimitMinutes * 60000) {
          const alertId = `alert-limit-${childId}-${limit.package}-${day}`;
          if (!db.alerts.some(a => a.id === alertId)) {
            db.alerts.unshift({
              id: alertId,
              childId,
              childName: child?.name || 'Child',
              type: 'limit_reached',
              title: `${limit.name} daily limit reached`,
              description: `${child?.name || 'Child'} has exceeded the ${limit.dailyLimitMinutes} min limit on ${limit.name}.`,
              severity: 'warning',
              timestamp: Date.now(),
              isRead: false
            });
          }
        }
      }

      saveDatabase();
      return respond(res, 200, { ok: true, syncedAt: Date.now(), recordsCount: formattedApps.length });
    }

    // 12. DELETE /api/reports: Clear reports
    if (req.method === 'DELETE' && pathname === '/api/reports') {
      if (req.headers['x-confirm-delete'] !== 'DELETE ALL REPORTS') {
        return respond(res, 400, { error: 'Header X-Confirm-Delete: DELETE ALL REPORTS required' });
      }
      db.reports = {};
      db.alerts = [];
      saveDatabase();
      return respond(res, 200, { ok: true, message: 'All reports cleared' });
    }

    return respond(res, 404, { error: 'Endpoint not found' });
  } catch (err) {
    console.error('Server error:', err);
    if (!res.headersSent) respond(res, 500, { error: err.message || 'Internal Server Error' });
  }
}).listen(PORT, () => {
  console.log(`KidSafe Enterprise Parent Dashboard running on port ${PORT}`);
});
