'use strict';

const $ = id => document.getElementById(id);

let state = {
  currentChildId: 'child-leo',
  children: [],
  dashboardData: null,
  timelineFilter: 'today',
  theme: localStorage.getItem('kidsafe_theme') || 'light'
};

// Apply saved theme
document.documentElement.setAttribute('data-theme', state.theme);

// Format milliseconds to 'Xh Ym' or 'Ym'
function fmtDuration(ms) {
  if (!ms || ms <= 0) return '0m';
  const totalMins = Math.round(ms / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

// Format timestamp to localized time
function fmtTime(ts) {
  if (!ts) return '--:--';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Fetch helper with error handling
async function api(endpoint, options = {}) {
  const res = await fetch(endpoint, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Network request failed');
  }
  return data;
}

// 1. Initial Authentication & Load
async function initDashboard() {
  try {
    const data = await api(`/api/dashboard?childId=${state.currentChildId}`);
    renderDashboard(data);
    $('loginSection').style.display = 'none';
    $('dashboardSection').style.display = 'block';
  } catch (err) {
    // If not authenticated, keep login section visible
    $('loginSection').style.display = 'flex';
    $('dashboardSection').style.display = 'none';
  }
}

// Login form submission
$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const token = $('parentKeyInput').value.trim();
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
    await initDashboard();
  } catch (err) {
    alert(err.message || 'Login failed');
  }
};

// Logout
$('logoutBtn').onclick = async () => {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  location.reload();
};

// Theme toggle
$('themeToggle').onclick = () => {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('kidsafe_theme', state.theme);
};

// 2. Main Dashboard Renderer
function renderDashboard(data) {
  state.dashboardData = data;
  state.children = data.availableChildren || [];
  const { child, summary, charts, mostUsedApps, timeline, alerts, limits } = data;

  // Header and Device status
  renderChildSwitcher(state.children, child.id);
  $('childAvatarLarge').textContent = child.name.charAt(0);
  $('childNameHeader').textContent = child.name;
  $('deviceModelText').textContent = child.deviceModel || child.deviceName;
  $('deviceBatteryText').textContent = `🔋 ${child.batteryLevel}%`;
  
  const syncMinsAgo = Math.max(1, Math.round((Date.now() - (child.lastSyncAt || Date.now())) / 60000));
  $('deviceLastSyncText').textContent = `Synced ${syncMinsAgo}m ago`;

  const onlinePill = $('deviceOnlinePill');
  if (summary.syncStatus === 'synced') {
    onlinePill.className = 'status-pill online';
    onlinePill.textContent = '● Synced';
  } else {
    onlinePill.className = 'status-pill delayed';
    onlinePill.textContent = '● Sync Delayed';
  }

  // Alerts badge
  const unreadAlerts = (alerts || []).filter(a => !a.isRead);
  $('alertBadge').style.display = unreadAlerts.length > 0 ? 'block' : 'none';

  // 6 Summary Cards
  $('metricScreenTime').textContent = fmtDuration(summary.todayScreenTimeMs);
  $('metricScreenTimeSub').textContent = `Target: ${Math.floor(summary.dailyLimitMinutes / 60)}h daily`;

  $('metricUnlocks').textContent = summary.unlocksCount;
  $('metricUnlocksSub').textContent = `Approx ~1 unlock / ${Math.max(10, Math.round(95 / Math.max(1, summary.unlocksCount)))} min`;

  $('metricAppsCount').textContent = summary.totalAppsUsed;
  $('metricAppsCountSub').textContent = `${mostUsedApps.length} active applications today`;

  // Vs yesterday calculation
  const diffMs = summary.todayScreenTimeMs - summary.yesterdayScreenTimeMs;
  const pct = summary.yesterdayScreenTimeMs > 0 ? Math.round((diffMs / summary.yesterdayScreenTimeMs) * 100) : 0;
  const sign = pct >= 0 ? `+${pct}%` : `${pct}%`;
  const elDiff = $('metricVsYesterday');
  elDiff.textContent = sign;
  elDiff.className = pct > 0 ? 'card-value' : 'card-value';
  $('metricVsYesterdaySub').textContent = `Yesterday: ${fmtDuration(summary.yesterdayScreenTimeMs)}`;

  // Daily limit status
  const elLimit = $('metricLimitStatus');
  const remMinutes = Math.max(0, summary.dailyLimitMinutes - Math.round(summary.todayScreenTimeMs / 60000));
  if (summary.limitStatus === 'exceeded') {
    elLimit.textContent = 'Exceeded';
    elLimit.style.color = 'var(--danger)';
    $('metricLimitSub').textContent = 'Limit reached for today';
  } else if (summary.limitStatus === 'approaching_limit') {
    elLimit.textContent = 'Near Limit';
    elLimit.style.color = 'var(--warning)';
    $('metricLimitSub').textContent = `${remMinutes}m remaining`;
  } else {
    elLimit.textContent = 'Within Limit';
    elLimit.style.color = 'var(--success)';
    $('metricLimitSub').textContent = `${remMinutes}m remaining`;
  }

  // Sync status metric
  $('metricSyncStatus').textContent = summary.syncStatus === 'synced' ? 'Active' : 'Delayed';
  $('metricSyncSub').textContent = `${child.deviceName} connected`;

  // Render 7-day trend chart
  renderSevenDayChart(charts.sevenDayTrend, child.dailyLimitMinutes);

  // Render category breakdown
  renderCategoryBreakdown(charts.categoryDistribution);

  // Render hourly breakdown
  renderHourlyChart(charts.hourlyActivity);

  // Render Most-Used Apps table
  renderAppsTable(mostUsedApps, limits);

  // Render timeline feed
  renderTimelineFeed(timeline);
}

// Child Switcher Tabs
function renderChildSwitcher(children, activeChildId) {
  const container = $('childSelector');
  container.innerHTML = '';
  for (const c of children) {
    const btn = document.createElement('button');
    btn.className = `child-tab ${c.id === activeChildId ? 'active' : ''}`;
    btn.innerHTML = `<span class="child-avatar-mini">${c.name.charAt(0)}</span> ${c.name}`;
    btn.onclick = () => {
      state.currentChildId = c.id;
      initDashboard();
    };
    container.appendChild(btn);
  }
}

// 7-Day Chart with Benchmark Limit Line
function renderSevenDayChart(trend, dailyLimitMins) {
  const container = $('sevenDayChart');
  container.innerHTML = '';

  const maxMins = Math.max(...trend.map(t => t.minutes), dailyLimitMins * 1.25, 60);

  // Limit line
  const limitLine = document.createElement('div');
  limitLine.className = 'limit-line';
  const bottomPct = Math.min(95, Math.max(10, (dailyLimitMins / maxMins) * 100));
  limitLine.style.bottom = `${bottomPct}%`;
  limitLine.innerHTML = `<span class="limit-line-label">Limit: ${Math.floor(dailyLimitMins / 60)}h</span>`;
  container.appendChild(limitLine);

  for (let i = 0; i < trend.length; i++) {
    const item = trend[i];
    const isToday = i === trend.length - 1;
    const heightPct = Math.min(100, Math.max(6, (item.minutes / maxMins) * 100));

    const group = document.createElement('div');
    group.className = 'bar-group';
    group.innerHTML = `
      <div class="bar-column ${isToday ? 'today' : ''}" style="height: ${heightPct}%;">
        <div class="bar-tooltip">${item.minutes}m (${fmtDuration(item.minutes * 60000)})</div>
      </div>
      <span class="bar-label">${item.label}</span>
    `;
    container.appendChild(group);
  }
}

// Category Breakdown Progress Bars
function renderCategoryBreakdown(categories) {
  const container = $('categoryContainer');
  container.innerHTML = '';

  for (const cat of categories) {
    const item = document.createElement('div');
    item.className = 'category-item';
    item.innerHTML = `
      <div class="category-head">
        <span>${cat.category}</span>
        <span style="color: var(--text-muted);">${cat.minutes}m (${cat.percentage}%)</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${cat.percentage}%; background-color: ${cat.color};"></div>
      </div>
    `;
    container.appendChild(item);
  }
}

// Hourly Activity Chart
function renderHourlyChart(hourlyData) {
  const container = $('hourlyChart');
  container.innerHTML = '';

  const maxMins = Math.max(...hourlyData.map(h => h.minutes), 20);

  for (const h of hourlyData) {
    const heightPct = Math.min(100, Math.max(3, (h.minutes / maxMins) * 100));
    const group = document.createElement('div');
    group.className = 'bar-group';
    group.style.flex = '1';
    
    // Highlight daytime hours
    const isDay = h.hour >= 8 && h.hour <= 20;
    const color = h.minutes > 0 ? (isDay ? 'var(--primary)' : 'var(--danger)') : 'var(--card-border)';

    group.innerHTML = `
      <div class="bar-column" style="height: ${heightPct}%; background: ${color}; border-radius: 4px;">
        <div class="bar-tooltip">${h.label}: ${h.minutes}m</div>
      </div>
      ${h.hour % 4 === 0 ? `<span class="bar-label" style="font-size: 10px;">${h.label}</span>` : ''}
    `;
    container.appendChild(group);
  }
}

// Most-Used Apps Table
function renderAppsTable(apps, limits) {
  const tbody = $('appTableBody');
  tbody.innerHTML = '';

  if (!apps || apps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No app usage logged yet today.</td></tr>`;
    return;
  }

  for (const app of apps) {
    const limitRule = limits.find(l => l.package === app.package);
    const isBlocked = limitRule?.isBlocked || false;
    const limitMins = limitRule?.dailyLimitMinutes;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="app-cell">
          <div class="app-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
              <line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
          </div>
          <div class="app-title-group">
            <strong>${app.name}</strong>
            <span>${app.package}</span>
          </div>
        </div>
      </td>
      <td>
        <span class="category-chip" style="background: var(--primary-light); color: var(--primary);">${app.category}</span>
      </td>
      <td>
        <strong>${fmtDuration(app.durationMs)}</strong>
      </td>
      <td>
        ${isBlocked ? `<span class="category-chip" style="background: var(--danger-light); color: var(--danger);">Blocked</span>` : 
          limitMins ? `<span>${limitMins}m / day</span>` : `<span style="color: var(--text-muted);">No Limit</span>`}
      </td>
      <td>
        <button class="btn btn-secondary" style="padding: 5px 10px; font-size: 12px;" onclick="openAppLimitModal('${app.package}', '${app.name}', '${app.category}', ${limitMins || 45})">
          Configure
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

// Activity Timeline Feed
function renderTimelineFeed(events) {
  const container = $('timelineFeed');
  container.innerHTML = '';

  if (!events || events.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); padding: 16px;">No recorded events for this time filter.</p>`;
    return;
  }

  for (const e of events) {
    const isScreen = e.event.includes('screen');
    const isClose = e.event === 'closed';
    const durationLabel = e.durationMs ? `Duration: ${fmtDuration(e.durationMs)}` : '';

    const div = document.createElement('div');
    div.className = 'timeline-item';
    div.innerHTML = `
      <div class="timeline-dot ${isScreen ? 'screen' : isClose ? 'close' : ''}"></div>
      <div class="timeline-left">
        <span class="timeline-time">${fmtTime(e.time)}</span>
        <div>
          <div class="timeline-event-title">
            ${e.name} ${e.event === 'opened' ? 'moved to foreground' : e.event === 'closed' ? 'moved to background' : e.event.replace('_', ' ')}
          </div>
          <div class="timeline-event-sub">
            <span>${e.category}</span>
            ${durationLabel ? `<span>• ${durationLabel}</span>` : ''}
          </div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="confidence-badge">${e.source || 'UsageStats'} · ${e.confidence || 'high'}</span>
      </div>
    `;
    container.appendChild(div);
  }
}

// Timeline filter pills
document.querySelectorAll('.filter-chip').forEach(btn => {
  btn.onclick = async () => {
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const filter = btn.getAttribute('data-filter');
    state.timelineFilter = filter;
    try {
      const data = await api(`/api/timeline?childId=${state.currentChildId}&filter=${filter}`);
      renderTimelineFeed(data.events);
    } catch (err) {
      console.error('Failed to filter timeline:', err);
    }
  };
});

// Quick Actions
$('quickRefreshBtn').onclick = () => initDashboard();

$('quickCsvBtn').onclick = () => {
  window.location.href = `/api/export/csv?childId=${state.currentChildId}&day=${new Date().toISOString().slice(0, 10)}`;
};

// Modal helpers
function closeModal(id) {
  $(id).style.display = 'none';
}

// Alerts modal
$('alertBtn').onclick = () => {
  const modal = $('alertsModal');
  const list = $('alertsList');
  const alerts = state.dashboardData?.alerts || [];

  list.innerHTML = '';
  if (alerts.length === 0) {
    list.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">No active safety alerts. Everything looks peaceful!</p>`;
  } else {
    for (const a of alerts) {
      const card = document.createElement('div');
      card.style.cssText = `background: var(--bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 14px;`;
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <strong style="color: ${a.severity === 'danger' ? 'var(--danger)' : 'var(--warning)'}; font-size: 14px;">${a.title}</strong>
          <span style="font-size: 11px; color: var(--text-muted);">${fmtTime(a.timestamp)}</span>
        </div>
        <p style="font-size: 13px; color: var(--text-main); margin-bottom: 10px;">${a.description}</p>
        <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 11px;" onclick="markAlertRead('${a.id}')">Dismiss Alert</button>
      `;
      list.appendChild(card);
    }
  }
  modal.style.display = 'flex';
};

window.markAlertRead = async (alertId) => {
  await api('/api/alerts/mark-read', { method: 'POST', body: JSON.stringify({ alertId }) });
  initDashboard();
  closeModal('alertsModal');
};

// App Limits modal
$('quickLimitsBtn').onclick = () => openAppLimitModal();
$('viewAppLimitsBtn').onclick = () => openAppLimitModal();

window.openAppLimitModal = (pkg, name, cat, defaultMins) => {
  const modal = $('limitsModal');
  const list = $('limitsList');
  const limits = state.dashboardData?.limits || [];
  const mostUsed = state.dashboardData?.mostUsedApps || [];

  list.innerHTML = '';

  // Merge limits with most-used apps
  const appKeys = new Set([...limits.map(l => l.package), ...mostUsed.map(a => a.package)]);
  for (const p of appKeys) {
    const existing = limits.find(l => l.package === p) || mostUsed.find(a => a.package === p) || { name: p, category: 'Other', dailyLimitMinutes: 45, isBlocked: false };
    const row = document.createElement('div');
    row.style.cssText = `display: flex; justify-content: space-between; align-items: center; background: var(--bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 12px;`;
    row.innerHTML = `
      <div>
        <strong style="font-size: 14px; display: block;">${existing.name || p}</strong>
        <span style="font-size: 11px; color: var(--text-muted);">${p}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <input id="limit-mins-${p}" type="number" min="0" max="360" value="${existing.dailyLimitMinutes || 45}" style="width: 65px; padding: 6px; border-radius: 8px; border: 1px solid var(--card-border);" />
        <span style="font-size: 12px;">min</span>
        <button class="btn ${existing.isBlocked ? 'btn-danger' : 'btn-secondary'}" style="padding: 6px 12px; font-size: 12px;" onclick="saveAppLimit('${p}', '${existing.name}', '${existing.category}', document.getElementById('limit-mins-${p}').value, ${!existing.isBlocked})">
          ${existing.isBlocked ? 'Blocked' : 'Block App'}
        </button>
        <button class="btn btn-primary" style="padding: 6px 12px; font-size: 12px;" onclick="saveAppLimit('${p}', '${existing.name}', '${existing.category}', document.getElementById('limit-mins-${p}').value, false)">
          Save
        </button>
      </div>
    `;
    list.appendChild(row);
  }
  modal.style.display = 'flex';
};

window.saveAppLimit = async (pkg, name, category, dailyLimitMinutes, isBlocked) => {
  await api('/api/limits', {
    method: 'POST',
    body: JSON.stringify({
      childId: state.currentChildId,
      package: pkg,
      name,
      category,
      dailyLimitMinutes: Number(dailyLimitMinutes),
      isBlocked: Boolean(isBlocked)
    })
  });
  await initDashboard();
  closeModal('limitsModal');
};

// Initial trigger
initDashboard();
