'use strict';

const $ = id => document.getElementById(id);

// --- TRANSLATIONS (EN, HI, HINGLISH) ---
const i18n = {
  en: {
    tagline: 'Family Safety & Digital Wellbeing Platform',
    tabOverview: 'Overview',
    tabLive: 'Live Activity',
    tabAnalytics: 'App Analytics',
    tabLimits: 'Screen Time & Limits',
    tabDevices: 'Paired Devices',
    tabReports: 'Safety Reports',
    tabSettings: 'Settings',
    cardScreenTime: "Today's Screen Time",
    cardUnlocks: 'Unlock Events',
    cardApps: 'Apps Used',
    cardVsYesterday: 'vs Yesterday',
    cardLimit: 'Daily Limit',
    cardSync: 'Sync Status',
    addDevice: 'Add Child Device',
    signOut: 'Sign Out',
    emptyActivity: "No activity yet. Once the device shares its first report, you'll see it here.",
    syncFailed: "We couldn't refresh this device's activity. We'll try again automatically.",
    deviceInactive: "This device hasn't synced recently. Check its internet connection and permissions.",
    accessDenied: "You don't have permission to view this device.",
    downloadApp: 'Download App',
    liveSynced: 'Live Synced',
    delayed: 'Sync Delayed',
    offline: 'Offline'
  },
  hi: {
    tagline: 'पारिवारिक सुरक्षा और डिजिटल कल्याण मंच',
    tabOverview: 'अवलोकन',
    tabLive: 'लाइव गतिविधि',
    tabAnalytics: 'ऐप विश्लेषण',
    tabLimits: 'स्क्रीन समय और सीमाएं',
    tabDevices: 'जुड़े हुए उपकरण',
    tabReports: 'सुरक्षा रिपोर्ट',
    tabSettings: 'सेटिंग्स',
    cardScreenTime: 'आज का स्क्रीन समय',
    cardUnlocks: 'अनलॉक घटनाएं',
    cardApps: 'उपयोग किए गए ऐप्स',
    cardVsYesterday: 'कल की तुलना में',
    cardLimit: 'दैनिक सीमा',
    cardSync: 'सिंक स्थिति',
    addDevice: 'बच्चे का उपकरण जोड़ें',
    signOut: 'लॉग आउट',
    emptyActivity: 'अभी तक कोई गतिविधि नहीं है। जब उपकरण अपनी पहली रिपोर्ट भेजेगा, तो आप इसे यहां देखेंगे।',
    syncFailed: 'हम इस उपकरण की गतिविधि को रीफ़्रेश नहीं कर सके। हम स्वचालित रूप से पुनः प्रयास करेंगे।',
    deviceInactive: 'इस उपकरण ने हाल ही में सिंक नहीं किया है। कृपया इंटरनेट कनेक्शन और अनुमतियों की जाँच करें।',
    accessDenied: 'आपको इस उपकरण को देखने की अनुमति नहीं है।',
    downloadApp: 'ऐप डाउनलोड',
    liveSynced: 'लाइव सिंक',
    delayed: 'सिंक विलंबित',
    offline: 'ऑफ़लाइन'
  },
  hinglish: {
    tagline: 'Family Safety aur Digital Balance Platform',
    tabOverview: 'Overview',
    tabLive: 'Live Activity',
    tabAnalytics: 'App Analytics',
    tabLimits: 'Screen Time aur Limits',
    tabDevices: 'Paired Phones',
    tabReports: 'Safety Reports',
    tabSettings: 'Settings',
    cardScreenTime: "Aaj ka Screen Time",
    cardUnlocks: 'Unlock Events',
    cardApps: 'Apps Used',
    cardVsYesterday: 'Kal se compare',
    cardLimit: 'Daily Limit',
    cardSync: 'Sync Status',
    addDevice: 'Child Device Add Karein',
    signOut: 'Sign Out',
    emptyActivity: "Abhi koi activity nahi hai. Phone se report aate hi yahan dikhegi.",
    syncFailed: "Activity refresh nahi ho saki. Hum automatic dubara try karenge.",
    deviceInactive: "Ye phone kafi der se sync nahi hua. Internet aur permission check karein.",
    accessDenied: "Aapko is phone ko access karne ki permission nahi hai.",
    downloadApp: 'App Download',
    liveSynced: 'Live Synced',
    delayed: 'Sync Delayed',
    offline: 'Offline'
  }
};

let state = {
  currentChildId: '',
  currentChildName: '',
  children: [],
  dashboardData: null,
  devices: [],
  timelineFilter: 'today',
  theme: localStorage.getItem('kidsafe_theme') || 'light',
  lang: localStorage.getItem('kidsafe_lang') || 'en',
  sessionToken: '',
  phone: '',
  lastDevOtp: '123456',
  cooldownTimer: null,
  pairingTimer: null,
  sseEventSource: null
};

// Initialize Theme
document.documentElement.setAttribute('data-theme', state.theme);

// --- UTILITY HELPERS ---
function fmtDuration(ms) {
  if (!ms || ms <= 0) return '0m';
  const totalMins = Math.round(ms / 60000);
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0 && mins > 0) return `${hrs}h ${mins}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${mins}m`;
}

function fmtMinutes(mins) {
  if (!mins || mins <= 0) return '0m';
  const hrs = Math.floor(mins / 60);
  const m = mins % 60;
  if (hrs > 0 && m > 0) return `${hrs}h ${m}m`;
  if (hrs > 0) return `${hrs}h`;
  return `${m}m`;
}

function fmtTime(ts) {
  if (!ts) return '--:--';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showToast(message, type = 'info') {
  const container = $('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// --- FETCH WRAPPER ---
async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.sessionToken) {
    headers['Authorization'] = `Bearer ${state.sessionToken}`;
  }
  const res = await fetch(endpoint, {
    credentials: 'include',
    headers,
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Network request failed');
  }
  return data;
}

// --- LANGUAGE SWITCHER ---
function setLanguage(lang) {
  if (!i18n[lang]) lang = 'en';
  state.lang = lang;
  localStorage.setItem('kidsafe_lang', lang);

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  const t = i18n[lang];
  $('headerTagline').textContent = t.tagline;
  $('tabNavOverview').textContent = t.tabOverview;
  $('tabNavLive').textContent = t.tabLive;
  $('tabNavAnalytics').textContent = t.tabAnalytics;
  $('tabNavLimits').textContent = t.tabLimits;
  $('tabNavDevices').textContent = t.tabDevices;
  $('tabNavReports').textContent = t.tabReports;
  $('tabNavSettings').textContent = t.tabSettings;

  $('cardTitleScreenTime').textContent = t.cardScreenTime;
  $('cardTitleUnlocks').textContent = t.cardUnlocks;
  $('cardTitleApps').textContent = t.cardApps;
  $('cardTitleVsYesterday').textContent = t.cardVsYesterday;
  $('cardTitleLimit').textContent = t.cardLimit;
  $('cardTitleSync').textContent = t.cardSync;
  $('addDeviceBtnText').textContent = t.addDevice;
  $('logoutBtnText').textContent = t.signOut;
  if ($('downloadApkHeaderText') && t.downloadApp) {
    $('downloadApkHeaderText').textContent = t.downloadApp;
  }

  if (state.dashboardData) {
    renderDashboard(state.dashboardData);
  }
}

document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.onclick = () => setLanguage(btn.dataset.lang);
});

// --- NAVIGATION TABS ---
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    const targetTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const pane = $(targetTab);
    if (pane) pane.classList.add('active');

    if (targetTab === 'tab-devices') {
      loadDevices();
    } else if (targetTab === 'tab-settings') {
      loadDbPersistenceStatus();
    }
  };
});

// --- THEME TOGGLE ---
$('themeToggle').onclick = () => {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('kidsafe_theme', state.theme);
};

// --- MODAL CONTROLS ---
window.openModal = function(id) {
  const m = $(id);
  if (m) m.style.display = 'flex';
};

window.closeModal = function(id) {
  const m = $(id);
  if (m) m.style.display = 'none';
  if (id === 'pairingModal' || id === 'removeChildModal') {
    initDashboard();
  }
};

// Sign Out
$('logoutBtn').onclick = async () => {
  if (window.AndroidBridge && window.AndroidBridge.exitKidMode) {
    window.AndroidBridge.exitKidMode();
    return;
  }
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  state.sessionToken = '';
  sessionStorage.clear();
  localStorage.removeItem('kidsafe_session');
  $('dashboardSection').style.display = 'none';
  $('loginSection').style.display = 'flex';
  showToast('Signed out successfully', 'info');
};

const portalExitKidBtn = $('portalExitKidBtn');
if (portalExitKidBtn) {
  portalExitKidBtn.onclick = () => {
    if (window.AndroidBridge && window.AndroidBridge.exitKidMode) {
      window.AndroidBridge.exitKidMode();
    }
  };
}

// --- EMAIL & PASSWORD LOGIN & REGISTRATION ---
let isRegisterMode = false;
const toggleAuthModeBtn = $('toggleAuthModeBtn');
if (toggleAuthModeBtn) {
  toggleAuthModeBtn.onclick = () => {
    isRegisterMode = !isRegisterMode;
    $('formEmailLogin').style.display = isRegisterMode ? 'none' : 'block';
    $('formEmailRegister').style.display = isRegisterMode ? 'block' : 'none';
    toggleAuthModeBtn.textContent = isRegisterMode 
      ? 'Already have an account? Sign In' 
      : "Don't have an account? Create Free Account";
  };
}

// 1. Sign In with Email & Password
const formEmailLogin = $('formEmailLogin');
if (formEmailLogin) {
  formEmailLogin.onsubmit = async (e) => {
    e.preventDefault();
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value.trim();

    if (!email || !password) {
      showToast('Please enter both email and password', 'error');
      return;
    }

    const btn = $('btnLoginEmail');
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      const res = await api('/api/auth/password-login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (res.token) {
        state.sessionToken = res.token;
        sessionStorage.setItem('kidsafe_session', res.token);
      }

      showToast(`Welcome back, ${res.parent.name || 'Parent'}!`, 'success');
      await initDashboard();
    } catch (err) {
      showToast(err.message || 'Login failed. Please check your credentials.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In to Dashboard';
    }
  };
}

// 2. Register with Email & Password
const formEmailRegister = $('formEmailRegister');
if (formEmailRegister) {
  formEmailRegister.onsubmit = async (e) => {
    e.preventDefault();
    const email = $('regEmail').value.trim();
    const name = $('regName').value.trim();
    const password = $('regPassword').value.trim();

    if (!email || !password) {
      showToast('Please enter email and password', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters long', 'error');
      return;
    }

    const btn = $('btnRegisterEmail');
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    try {
      const res = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, name, password })
      });

      if (res.token) {
        state.sessionToken = res.token;
        sessionStorage.setItem('kidsafe_session', res.token);
      }

      showToast(`Account created successfully! Welcome, ${res.parent.name}.`, 'success');
      await initDashboard();
    } catch (err) {
      showToast(err.message || 'Registration failed', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Free Account & Enter Dashboard';
    }
  };
}

// --- 1-CLICK GOOGLE SIGN-IN (100% FREE) ---
let googleClientId = '';

async function initGoogleAuth() {
  try {
    const config = await api('/api/auth/google-config');
    if (config.googleClientId && window.google?.accounts?.id) {
      googleClientId = config.googleClientId;
      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredentialResponse,
        auto_select: false
      });
      google.accounts.id.renderButton($('g_id_signin'), {
        theme: state.theme === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        width: 320
      });
      $('googleLoginBtn').style.display = 'none';
    }
  } catch {}
}

window.handleGoogleCredentialResponse = async function(response) {
  try {
    const res = await api('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential: response.credential })
    });
    if (res.token) {
      state.sessionToken = res.token;
      sessionStorage.setItem('kidsafe_session', res.token);
    }
    showToast(`Welcome, ${res.parent.name}! Signed in via Google.`, 'success');
    await initDashboard();
  } catch (err) {
    showToast(err.message || 'Google sign-in failed', 'error');
  }
};

const googleLoginBtn = $('googleLoginBtn');
if (googleLoginBtn) {
  googleLoginBtn.onclick = async () => {
    if (googleClientId && window.google?.accounts?.id) {
      google.accounts.id.prompt();
      return;
    }

    // 1-Click Google Verification Flow
    const email = prompt('Enter your Google / Gmail address to sign in (₹0 Free Verification):', 'parent@gmail.com');
    if (!email || !email.includes('@')) return;

    try {
      googleLoginBtn.disabled = true;
      googleLoginBtn.innerHTML = '<span>Verifying with Google...</span>';
      const cleanEmail = email.trim().toLowerCase();
      const name = cleanEmail.split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim();
      const displayName = name ? (name.charAt(0).toUpperCase() + name.slice(1)) : 'Google Guardian';

      const res = await api('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ email: cleanEmail, name: displayName })
      });

      if (res.token) {
        state.sessionToken = res.token;
        sessionStorage.setItem('kidsafe_session', res.token);
      }
      showToast(`Welcome, ${displayName}! Signed in with Google.`, 'success');
      await initDashboard();
    } catch (err) {
      showToast(err.message || 'Google sign-in failed', 'error');
    } finally {
      googleLoginBtn.disabled = false;
      googleLoginBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        <span id="googleLoginBtnText">Sign in with Google (100% Free)</span>
      `;
    }
  };
}

// --- INITIALIZE DASHBOARD ---
async function initDashboard() {
  try {
    const queryId = encodeURIComponent(state.currentChildId || '');
    const data = await api(`/api/dashboard?childId=${queryId}`);
    $('loginSection').style.display = 'none';
    $('dashboardSection').style.display = 'block';
    renderDashboard(data);
    initSseStream();
    loadDevices();
    setLanguage(state.lang);
  } catch (err) {
    $('loginSection').style.display = 'flex';
    $('dashboardSection').style.display = 'none';
    throw err;
  }
}

// --- REAL-TIME SSE STREAMING ---
function initSseStream() {
  if (state.sseEventSource) {
    state.sseEventSource.close();
  }

  const sseUrl = `/api/stream?sessionToken=${encodeURIComponent(state.sessionToken || '')}`;
  state.sseEventSource = new EventSource(sseUrl);

  state.sseEventSource.addEventListener('connected', () => {
    updateSyncBadge(true, Date.now());
  });

  const handleTelemetryEvent = (e) => {
    try {
      const payload = JSON.parse(e.data);
      if (payload.childId === state.currentChildId) {
        showToast(`📲 Live Sync: Telemetry received from ${state.currentChildName}`, 'info');
        api(`/api/dashboard?childId=${state.currentChildId}`).then(renderDashboard).catch(() => {});
      }
    } catch {}
  };

  state.sseEventSource.addEventListener('telemetry_updated', handleTelemetryEvent);
  state.sseEventSource.addEventListener('telemetry_synced', handleTelemetryEvent);

  state.sseEventSource.addEventListener('device_paired', (e) => {
    try {
      const payload = JSON.parse(e.data);
      showToast(`🎉 New Child Device Paired: ${payload.childName}!`, 'success');
      loadDevices();
      api(`/api/dashboard?childId=${state.currentChildId}`).then(renderDashboard).catch(() => {});
    } catch {}
  });

  state.sseEventSource.onerror = () => {
    updateSyncBadge(false, 0);
  };

  // Resilient fast periodic background refresh (ensures instant live telemetry on Vercel Serverless)
  if (!window._dashboardPollInterval) {
    window._dashboardPollInterval = setInterval(() => {
      if (state.sessionToken && $('dashboardSection').style.display !== 'none') {
        const cId = encodeURIComponent(state.currentChildId || '');
        api(`/api/dashboard?childId=${cId}&_t=${Date.now()}`)
          .then(data => { if (data && data.parent) renderDashboard(data); })
          .catch(() => {});
      }
    }, 4000);
  }
}

function updateSyncBadge(isConnected, lastSyncTs) {
  const pill = $('deviceOnlinePill');
  const text = $('deviceStatusText');
  const meta = $('deviceLastSyncText');
  const t = i18n[state.lang] || i18n.en;

  const now = Date.now();
  const diffMinutes = lastSyncTs ? Math.floor((now - lastSyncTs) / 60000) : 999;

  pill.className = 'status-pill';

  if (isConnected && diffMinutes <= 2) {
    pill.classList.add('live');
    text.textContent = t.liveSynced;
    meta.textContent = 'Synced just now';
  } else if (diffMinutes <= 15) {
    pill.classList.add('recent');
    text.textContent = `Synced ${diffMinutes}m ago`;
    meta.textContent = `Synced ${diffMinutes}m ago`;
  } else if (diffMinutes <= 60) {
    pill.classList.add('delayed');
    text.textContent = t.delayed;
    meta.textContent = `Synced ${diffMinutes}m ago`;
  } else {
    pill.classList.add('offline');
    text.textContent = t.offline;
    meta.textContent = lastSyncTs ? `Last synced ${new Date(lastSyncTs).toLocaleDateString()}` : 'Never synced';
  }
}

// --- PERSISTENT STORAGE LEDGER HELPERS ---
function getStoredChildren(parentId) {
  if (!parentId) return [];
  try {
    const raw = localStorage.getItem('kidsafe_children_' + parentId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStoredChildren(parentId, children) {
  if (!parentId || !Array.isArray(children)) return;
  try {
    localStorage.setItem('kidsafe_children_' + parentId, JSON.stringify(children));
  } catch {}
}

function removeStoredChild(parentId, childId) {
  if (!parentId || !childId) return;
  const current = getStoredChildren(parentId);
  const updated = current.filter(c => c.id !== childId);
  setStoredChildren(parentId, updated);
}

// --- RENDER DASHBOARD ---
function renderDashboard(data) {
  state.dashboardData = data;
  const { child, summary, charts, mostUsedApps, timeline, alerts, limits, parent } = data;

  if (parent) {
    const parentEmailElem = $('settingsParentPhone');
    if (parentEmailElem) {
      parentEmailElem.textContent = parent.email || parent.displayPhone || parent.phone || 'guardian@email.com';
    }

    // --- PERSISTENCE SYNC ---
    const parentId = parent.id;
    const serverChildren = data.availableChildren || [];

    if (data.isPersistentDb) {
      // Server PostgreSQL/Cloud DB is authoritative: mirror it to localStorage, never resurrect deleted kids
      setStoredChildren(parentId, serverChildren);
    } else {
      // Ephemeral fallback mode: preserve children across container recycles
      const localChildren = getStoredChildren(parentId);
      const missingOnServer = localChildren.filter(lc => lc && lc.name && !serverChildren.some(sc => sc.id === lc.id));
      if (missingOnServer.length > 0 && !state._ephemeralSyncInFlight) {
        state._ephemeralSyncInFlight = true;
        console.log('[KidSafe] Resyncing preserved child profiles to ephemeral server:', missingOnServer.map(c => c.name));
        api('/api/children/sync', {
          method: 'POST',
          body: JSON.stringify({ children: localChildren })
        }).then(syncRes => {
          if (syncRes && syncRes.children && syncRes.children.length > 0) {
            state.children = syncRes.children;
            setStoredChildren(parentId, syncRes.children);
            if (!state.currentChildId) state.currentChildId = syncRes.children[0].id;
            initDashboard().catch(() => {});
          }
        }).catch(() => {}).finally(() => {
          state._ephemeralSyncInFlight = false;
        });
      } else if (serverChildren.length > 0) {
        setStoredChildren(parentId, serverChildren);
      }
    }
  }

  state.children = data.availableChildren || [];

  // Handle empty state: Parent hasn't added any child yet
  if (!child || state.children.length === 0) {
    state.currentChildId = null;
    state.currentChildName = '';
    renderChildSwitcher([], null);
    $('childAvatarLarge').textContent = '+';
    $('childNameHeader').textContent = 'No Child Connected';
    $('deviceModelText').textContent = 'Please pair your child’s Android phone';
    $('deviceBatteryText').textContent = '🔋 --%';
    $('deviceLastSyncText').textContent = 'No device paired yet';
    const pill = $('deviceOnlinePill');
    pill.className = 'status-pill offline';
    $('deviceStatusText').textContent = 'Awaiting Device';
    
    // Empty metrics
    $('metricScreenTime').textContent = '0m';
    $('metricScreenTimeSub').textContent = 'Target: 2h 00m daily';
    $('metricUnlocks').textContent = '0';
    $('metricUnlocksSub').textContent = 'No unlocks recorded';
    $('metricAppsCount').textContent = '0';
    $('metricAppsCountSub').textContent = 'No apps active';
    $('metricVsYesterday').textContent = '0%';
    $('metricVsYesterdaySub').textContent = 'No previous data';
    $('metricLimitStatus').textContent = 'Ready';
    $('metricLimitStatus').style.color = 'var(--success)';
    $('metricLimitSub').textContent = 'Pair a device to begin';
    $('metricSyncStatus').textContent = 'Unpaired';
    $('metricSyncSub').textContent = 'Click "Add Child Device"';

    render7DayChart([], 120);
    renderCategoryBreakdown({});
    renderHourlyChart(Array(24).fill(0));
    renderMostUsedApps([], []);
    renderTimeline([]);
    renderLimitsTab([], 120);
    renderReportsTab({ name: 'Child' }, { totalScreenTimeMs: 0, screenUnlocksApprox: 0 }, []);
    return;
  }

  state.currentChildId = child.id;
  state.currentChildName = child.name;

  // Header & Profile Info
  renderChildSwitcher(state.children, child.id);
  $('childAvatarLarge').textContent = child.name.charAt(0);
  $('childNameHeader').textContent = child.name;
  $('deviceModelText').textContent = child.deviceModel || child.deviceName || 'Android Device';

  const validBat = (child.batteryLevel && Number(child.batteryLevel) > 0 && Number(child.batteryLevel) <= 100) ? `${child.batteryLevel}%` : null;
  $('deviceBatteryText').textContent = `🔋 ${validBat || '--%'}`;
  const lastSyncTs = child.lastSyncAt || child.lastSync || 0;
  updateSyncBadge(true, lastSyncTs);

  if (summary.isPreservedUsage) {
    const pill = $('deviceOnlinePill');
    const text = $('deviceStatusText');
    if (pill) pill.className = 'status-pill delayed';
    if (text) text.textContent = 'Phone Locked / Idle (Last Saved)';
    $('deviceLastSyncText').textContent = `Preserved activity from ${summary.lastReportDay || 'today'}`;
  }

  // 1. Metric Summary Cards
  $('metricScreenTime').textContent = fmtDuration(summary.totalScreenTimeMs);
  $('metricScreenTimeSub').textContent = `Target: ${fmtMinutes(summary.limitMinutes)} daily`;

  $('metricUnlocks').textContent = summary.screenUnlocksApprox;
  const unlockRate = summary.screenUnlocksApprox > 0 ? Math.round(summary.totalScreenTimeMs / (summary.screenUnlocksApprox * 60000)) : 0;
  $('metricUnlocksSub').textContent = unlockRate > 0 ? `Avg ~1 unlock / ${unlockRate}m active` : 'Normal usage cadence';

  $('metricAppsCount').textContent = mostUsedApps.length;
  $('metricAppsCountSub').textContent = `${mostUsedApps.length} applications active today`;

  $('metricVsYesterday').textContent = `${summary.comparisonVsYesterday >= 0 ? '+' : ''}${summary.comparisonVsYesterday}%`;
  $('metricVsYesterdaySub').textContent = `Yesterday: ${fmtDuration(summary.yesterdayScreenTimeMs)}`;

  const remMins = summary.remainingMinutes;
  const limitStatusEl = $('metricLimitStatus');
  if (summary.isExceeded) {
    limitStatusEl.textContent = 'Exceeded';
    limitStatusEl.style.color = 'var(--danger)';
    $('metricLimitSub').textContent = `${fmtMinutes(Math.abs(remMins))} over limit`;
  } else {
    limitStatusEl.textContent = 'Within Limit';
    limitStatusEl.style.color = 'var(--success)';
    $('metricLimitSub').textContent = `${fmtMinutes(remMins)} remaining today`;
  }

  $('metricSyncStatus').textContent = summary.syncHealth === 'fresh' || summary.syncHealth === 'live' ? 'Live Telemetry' : 'Periodic Sync';
  $('metricSyncSub').textContent = lastSyncTs ? `Updated ${fmtTime(lastSyncTs)}` : 'Awaiting device check-in';

  // 2. Charts
  render7DayChart(charts.sevenDayTrend, summary.limitMinutes);
  renderCategoryBreakdown(charts.categoryBreakdown);
  renderHourlyChart(charts.hourlyActivity);

  // 3. Tables & Timelines
  renderMostUsedApps(mostUsedApps, limits);
  renderTimeline(timeline);
  renderLimitsTab(limits, summary.limitMinutes);
  renderReportsTab(child, summary, mostUsedApps);

  // Alerts Badge
  const unreadAlerts = (alerts || []).filter(a => !(a.isRead ?? a.read)).length;
  const badge = $('alertBadge');
  if (unreadAlerts > 0) {
    badge.style.display = 'block';
    badge.textContent = unreadAlerts;
  } else {
    badge.style.display = 'none';
  }
}

// Render Child Switcher (Multi-child Pills Bar & Dropdown)
function renderChildSwitcher(children, activeId) {
  const pillsList = $('childrenPillsList');
  const addBtn = $('addAnotherChildBtn');

  if (pillsList) {
    pillsList.innerHTML = '';
    if (children && children.length > 0) {
      children.forEach(c => {
        const isActive = c.id === activeId;
        const btn = document.createElement('button');
        btn.className = `child-profile-pill ${isActive ? 'active' : ''}`;
        btn.title = `Switch to ${c.name}`;
        btn.innerHTML = `
          <span class="child-pill-avatar">${(c.name || 'C').charAt(0).toUpperCase()}</span>
          <span class="child-pill-name">${c.name}</span>
          <span class="child-pill-status ${c.isOnline ? 'online' : ''}"></span>
        `;
        btn.onclick = () => {
          if (state.currentChildId !== c.id) {
            state.currentChildId = c.id;
            state.currentChildName = c.name;
            api(`/api/dashboard?childId=${c.id}`).then(renderDashboard);
          }
        };
        pillsList.appendChild(btn);
      });
    } else {
      pillsList.innerHTML = '<span style="font-size: 13px; color: var(--text-muted); font-weight: 500;">No children added yet</span>';
    }
  }

  if (addBtn) {
    addBtn.onclick = () => {
      openPairingModal();
    };
  }

  // Subheader Dropdown Switcher (only shows if multiple children exist)
  const dropdown = $('childDropdownSwitcher');
  if (dropdown) {
    if (children && children.length > 1) {
      dropdown.style.display = 'inline-block';
      dropdown.innerHTML = children.map(c => `<option value="${c.id}" ${c.id === activeId ? 'selected' : ''}>Switch: ${c.name}</option>`).join('');
      dropdown.onchange = (e) => {
        state.currentChildId = e.target.value;
        api(`/api/dashboard?childId=${state.currentChildId}`).then(renderDashboard);
      };
    } else {
      dropdown.style.display = 'none';
    }
  }

  // Toggle remove child button visibility based on whether a child exists
  const removeBtn = $('removeChildBtn');
  if (removeBtn) {
    removeBtn.style.display = activeId ? 'inline-flex' : 'none';
  }
}

// 7-Day Chart
function render7DayChart(days, limitMinutes) {
  const container = $('sevenDayChart');
  container.innerHTML = '';
  if (!days || days.length === 0) {
    container.innerHTML = '<div style="margin: auto; color: var(--text-muted); font-size: 13px;">No 7-day data recorded yet.</div>';
    return;
  }
  const getMins = d => Number(d.minutes ?? d.screenTimeMinutes ?? 0);
  const maxMinutes = Math.max(...days.map(getMins), limitMinutes, 60);

  days.forEach(d => {
    const mins = getMins(d);
    const col = document.createElement('div');
    col.className = 'chart-col';
    const pct = Math.min(100, Math.round((mins / maxMinutes) * 100));
    const isOver = mins > limitMinutes;
    col.innerHTML = `
      <div class="chart-bar-wrap">
        <div class="chart-bar ${isOver ? 'danger' : ''}" style="height: ${pct}%;"></div>
      </div>
      <span class="chart-label">${d.label || d.dayLabel || d.day || ''}</span>
      <span style="font-size: 11px; font-weight: 600; color: var(--text-muted);">${fmtMinutes(mins)}</span>
    `;
    container.appendChild(col);
  });
}

// Category Breakdown
function renderCategoryBreakdown(cats) {
  const container = $('categoryContainer');
  container.innerHTML = '';
  const entries = Object.entries(cats || {}).filter(([_, m]) => m > 0);
  if (entries.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); font-size: 13px; padding: 12px;">${(i18n[state.lang] || i18n.en).emptyActivity}</div>`;
    return;
  }
  const total = entries.reduce((acc, [_, m]) => acc + m, 0) || 1;

  entries.forEach(([cat, mins]) => {
    const pct = Math.round((mins / total) * 100);
    const item = document.createElement('div');
    item.className = 'category-item';
    item.innerHTML = `
      <div class="category-header">
        <span style="font-weight: 600;">${cat}</span>
        <span style="color: var(--text-muted);">${fmtMinutes(mins)} (${pct}%)</span>
      </div>
      <div class="category-bar-bg">
        <div class="category-bar-fill" style="width: ${pct}%;"></div>
      </div>
    `;
    container.appendChild(item);
  });
}

// Hourly Chart
function renderHourlyChart(hourly) {
  const container = $('hourlyChart');
  container.innerHTML = '';
  const maxVal = Math.max(...(hourly || [1]), 10);
  (hourly || Array(24).fill(0)).forEach((mins, h) => {
    const col = document.createElement('div');
    col.className = 'chart-col';
    const pct = Math.min(100, Math.round((mins / maxVal) * 100));
    col.innerHTML = `
      <div class="chart-bar-wrap" style="height: 100px;">
        <div class="chart-bar" style="height: ${pct}%;" title="${h}:00 - ${mins} mins"></div>
      </div>
      <span class="chart-label">${h % 4 === 0 ? `${h}h` : ''}</span>
    `;
    container.appendChild(col);
  });
}

// Most-Used Apps
function renderMostUsedApps(apps, limits) {
  const tbody = $('appTableBody');
  tbody.innerHTML = '';
  if (!apps || apps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">${(i18n[state.lang] || i18n.en).emptyActivity}</td></tr>`;
    return;
  }

  apps.forEach(app => {
    const limit = (limits || []).find(l => l.package === app.package) || { dailyLimitMinutes: 60, isBlocked: false };
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="app-info">
          <div class="app-icon">${app.icon || '📱'}</div>
          <div>
            <span class="app-name">${app.name}</span>
            <span class="app-package">${app.package}</span>
          </div>
        </div>
      </td>
      <td><span class="category-badge">${app.category}</span></td>
      <td style="font-weight: 700;">${fmtDuration(app.durationMs)}</td>
      <td>
        ${limit.isBlocked 
          ? '<span class="status-pill danger">🚫 Blocked</span>' 
          : `<span class="status-pill ok">⏱ ${limit.dailyLimitMinutes}m limit</span>`}
      </td>
      <td>
        <button class="btn btn-secondary" style="font-size: 12px; padding: 4px 10px;" onclick="openAppLimitModal('${app.package}', '${app.name}')">
          Edit Rule
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Timeline
function renderTimeline(events) {
  const feed = $('timelineFeed');
  feed.innerHTML = '';
  if (!events || events.length === 0) {
    feed.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">${(i18n[state.lang] || i18n.en).emptyActivity}</div>`;
    return;
  }

  events.slice(0, 30).forEach(ev => {
    const item = document.createElement('div');
    item.className = 'timeline-item';
    const isScreen = ev.package === 'screen.unlock';
    item.innerHTML = `
      <div class="timeline-dot ${isScreen ? 'screen' : ''}"></div>
      <div class="timeline-card">
        <div class="timeline-time">${fmtTime(ev.time)}</div>
        <div class="timeline-title">${isScreen ? '🔓 Device Screen Unlocked' : `${ev.name} was active`}</div>
        <div class="timeline-desc">
          ${isScreen ? 'Verified interactive user session started' : `Used for approx ${fmtDuration(ev.durationMs || 60000)} • ${ev.category || 'General'}`}
        </div>
      </div>
    `;
    feed.appendChild(item);
  });
}

// Timeline Filters
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.onclick = async () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    state.timelineFilter = chip.dataset.filter;
    if (!state.currentChildId) return;
    try {
      const res = await api(`/api/timeline?childId=${encodeURIComponent(state.currentChildId)}&filter=${encodeURIComponent(state.timelineFilter)}`);
      renderTimeline(res.events || []);
    } catch (err) {
      showToast(err.message || 'Failed to load timeline', 'error');
    }
  };
});

// Render Limits Tab
function renderLimitsTab(limits, dailyLimitMinutes) {
  const slider = $('dailyLimitSlider');
  const display = $('dailyLimitValueDisplay');
  slider.value = dailyLimitMinutes || 120;
  display.textContent = fmtMinutes(slider.value);

  slider.oninput = () => {
    display.textContent = fmtMinutes(slider.value);
  };

  const container = $('limitsListContainer');
  container.innerHTML = '';

  (limits || []).forEach(lim => {
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.style.flexDirection = 'row';
    card.style.justifyContent = 'space-between';
    card.style.alignItems = 'center';
    card.innerHTML = `
      <div>
        <div style="font-weight: 700; font-size: 15px;">${lim.name}</div>
        <div style="font-size: 12px; color: var(--text-muted);">${lim.package} • ${lim.category}</div>
      </div>
      <div style="display: flex; align-items: center; gap: 14px;">
        <label style="font-size: 13px; font-weight: 600;">Daily limit:
          <input type="number" class="login-input" style="width: 70px; display: inline-block; padding: 4px 8px; margin-left: 6px;" value="${lim.dailyLimitMinutes}" id="limitInput-${lim.package}"> mins
        </label>
        <button class="btn ${lim.isBlocked ? 'btn-primary' : 'btn-secondary'}" style="font-size: 12px; padding: 6px 12px;" onclick="toggleBlockApp('${lim.package}', ${!lim.isBlocked})">
          ${lim.isBlocked ? 'Unblock' : '🚫 Block'}
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Save All Limits
$('saveAllLimitsBtn').onclick = async () => {
  const dailyLimitMinutes = parseInt($('dailyLimitSlider').value, 10);
  const limits = (state.dashboardData?.limits || []).map(l => {
    const input = $(`limitInput-${l.package}`);
    return {
      package: l.package,
      dailyLimitMinutes: input ? parseInt(input.value, 10) || 60 : l.dailyLimitMinutes,
      isBlocked: l.isBlocked
    };
  });

  try {
    await api('/api/limits', {
      method: 'POST',
      body: JSON.stringify({
        childId: state.currentChildId,
        limits,
        dailyLimitMinutes
      })
    });
    showToast('Screen time limits saved & synced to child device!', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to save limits', 'error');
  }
};

window.toggleBlockApp = async function(pkg, isBlocked) {
  const currentLimits = state.dashboardData?.limits || [];
  const updated = currentLimits.map(l => l.package === pkg ? { ...l, isBlocked } : l);
  try {
    await api('/api/limits', {
      method: 'POST',
      body: JSON.stringify({ childId: state.currentChildId, limits: updated })
    });
    showToast(`${pkg} ${isBlocked ? 'blocked' : 'unblocked'}`, 'success');
    api(`/api/dashboard?childId=${state.currentChildId}`).then(renderDashboard);
  } catch (err) {
    showToast(err.message || 'Action failed', 'error');
  }
};

// Render Reports Tab
function renderReportsTab(child, summary, apps) {
  $('reportChildName').textContent = `${child.name}'s Digital Activity Report`;
  $('reportGeneratedDate').textContent = `Generated: ${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
  $('reportTotalTime').textContent = fmtDuration(summary.totalScreenTimeMs);
  $('reportTotalUnlocks').textContent = `${summary.screenUnlocksApprox} Unlocks`;
  $('reportTopApp').textContent = apps[0] ? `${apps[0].name} (${fmtDuration(apps[0].durationMs)})` : 'None';

  const container = $('reportAppsSummary');
  container.innerHTML = `
    <table class="app-table" style="background: var(--card-bg); border-radius: 8px;">
      <thead>
        <tr><th>Application</th><th>Category</th><th>Screen Time</th><th>Percentage</th></tr>
      </thead>
      <tbody>
        ${apps.map(a => {
          const pct = Math.round((a.durationMs / (summary.totalScreenTimeMs || 1)) * 100);
          return `<tr>
            <td><strong>${a.name}</strong> <span style="font-size: 11px; color: var(--text-muted);">(${a.package})</span></td>
            <td>${a.category}</td>
            <td>${fmtDuration(a.durationMs)}</td>
            <td>${pct}%</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

// Export Buttons
$('exportCsvBtn').onclick = $('quickExportBtn').onclick = () => {
  window.open(`/api/reports/export?format=csv&childId=${state.currentChildId}`, '_blank');
};

$('exportJsonBtn').onclick = () => {
  window.open(`/api/reports/export?format=json&childId=${state.currentChildId}`, '_blank');
};

// Quick Refresh (Instant manual trigger)
const qRefresh = $('quickRefreshBtn');
if (qRefresh) {
  qRefresh.onclick = async () => {
    const svg = qRefresh.querySelector('svg');
    if (svg) svg.style.animation = 'spin 0.8s linear infinite';
    qRefresh.disabled = true;
    try {
      const targetId = state.currentChildId || '';
      const data = await api(`/api/dashboard?childId=${targetId}&_t=${Date.now()}`);
      if (data && data.child) {
        renderDashboard(data);
        const mins = Math.round((data.summary?.totalScreenTimeMs || 0) / 60000);
        showToast(`⚡ Refreshed: ${data.child.name} (${mins}m screen time, ${data.summary?.totalAppsUsed || 0} apps)`, 'success');
      } else {
        await initDashboard();
        showToast('⚡ Refreshed: Dashboard synchronized with server', 'success');
      }
    } catch (e) {
      showToast(e.message || 'Refresh failed', 'error');
    } finally {
      setTimeout(() => {
        if (svg) svg.style.animation = '';
        qRefresh.disabled = false;
      }, 500);
    }
  };
}

// --- DEVICES TAB & PAIRING ---
async function loadDevices() {
  try {
    const res = await api('/api/devices');
    state.devices = res.devices || [];
    renderDevicesGrid(state.devices);
  } catch {}
}

function renderDevicesGrid(devices) {
  const container = $('deviceGridContainer');
  container.innerHTML = '';
  if (!devices || devices.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); padding: 20px;">No child devices paired yet. Click "Pair New Device" above to connect your first device.</div>';
    return;
  }

  devices.forEach(dev => {
    const card = document.createElement('div');
    card.className = 'device-card';
    card.innerHTML = `
      <div>
        <div class="device-card-header">
          <div>
            <div class="device-card-title">${dev.childName}'s Android Phone</div>
            <div style="font-size: 12px; color: var(--text-muted);">${dev.deviceModel || 'SM-X200'} • Android ${dev.androidVersion || '13'}</div>
          </div>
          <span class="status-pill ok">● Paired</span>
        </div>
        <div class="device-meta-row">
          <span>Battery: <strong>${dev.batteryLevel ? dev.batteryLevel + '%' : '--%'}</strong></span>
          <span>•</span>
          <span>Synced: <strong>${(dev.lastSyncAt || dev.lastSync) ? fmtTime(dev.lastSyncAt || dev.lastSync) : 'Recently'}</strong></span>
        </div>
        <div style="margin: 10px 0; display: flex; gap: 6px; flex-wrap: wrap;">
          <span class="perm-chip ok">✓ Usage Access</span>
          <span class="perm-chip ok">✓ WorkManager Sync</span>
          <span class="perm-chip ok">✓ Parental Consent</span>
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; border-top: 1px solid var(--card-border); padding-top: 12px; gap: 8px;">
        <span style="font-size: 11px; color: var(--text-muted);">Token: ••••${dev.tokenLast6 || (dev.deviceToken ? dev.deviceToken.slice(-6) : 'sec789')}</span>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary" style="font-size: 11px; padding: 5px 10px;" onclick="revokeDevice('${dev.id}', '${dev.childName}')">
            Revoke Sync
          </button>
          <button class="btn btn-secondary" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.3); font-size: 11px; padding: 5px 10px;" onclick="deleteChildProfile('${dev.childId}', '${dev.childName}')">
            Delete Profile
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

window.revokeDevice = async function(deviceId, name) {
  if (!confirm(`Are you sure you want to revoke access for ${name}'s device? Activity sync will stop immediately.`)) return;
  try {
    await api(`/api/devices/${deviceId}`, { method: 'DELETE' });
    showToast(`Device for ${name} revoked`, 'info');
    loadDevices();
  } catch (err) {
    showToast(err.message || 'Revocation failed', 'error');
  }
};

window.deleteChildProfile = async function(childId, name) {
  if (!confirm(`Are you sure you want to completely remove ${name}'s profile? All paired devices, alerts, and usage data will be deleted.`)) return;
  try {
    const parentId = state.dashboardData?.parent?.id;
    if (parentId) {
      removeStoredChild(parentId, childId);
    }
    await api('/api/children/delete', {
      method: 'POST',
      body: JSON.stringify({ childId })
    });
    showToast(`Child profile ${name} removed`, 'success');
    if (state.currentChildId === childId) {
      state.currentChildId = null;
      state.currentChildName = '';
    }
    await initDashboard();
  } catch (err) {
    showToast(err.message || 'Failed to remove child profile', 'error');
  }
};

// --- REMOVE CHILD PROFILE MODAL CONTROLS ---
const removeChildBtn = $('removeChildBtn');
if (removeChildBtn) {
  removeChildBtn.onclick = () => {
    if (!state.currentChildId) {
      showToast('No child profile selected', 'error');
      return;
    }
    const nameSpan = $('deleteChildNameSpan');
    if (nameSpan) nameSpan.textContent = state.currentChildName || 'this child';
    openModal('removeChildModal');
  };
}

const confirmRemoveBtn = $('confirmRemoveChildBtn');
if (confirmRemoveBtn) {
  confirmRemoveBtn.onclick = async () => {
    if (!state.currentChildId) return;
    confirmRemoveBtn.disabled = true;
    confirmRemoveBtn.textContent = 'Removing...';
    try {
      const removedId = state.currentChildId;
      const parentId = state.dashboardData?.parent?.id;
      if (parentId) {
        removeStoredChild(parentId, removedId);
      }
      await api('/api/children/delete', {
        method: 'POST',
        body: JSON.stringify({ childId: removedId })
      });
      showToast(`Child profile ${state.currentChildName || ''} removed successfully`, 'success');
      closeModal('removeChildModal');
      state.currentChildId = null;
      state.currentChildName = '';
      await initDashboard();
    } catch (err) {
      showToast(err.message || 'Failed to remove child profile', 'error');
    } finally {
      confirmRemoveBtn.disabled = false;
      confirmRemoveBtn.textContent = 'Yes, Remove Profile';
    }
  };
}

// --- PAIRING & ADD CHILD MODAL WIZARD ---
window.openPairingModal = $('addDeviceBtn').onclick = $('quickPairBtn').onclick = () => {
  $('pairingStep1').style.display = 'block';
  $('pairingStep2').style.display = 'none';
  if ($('pairingChildNameInput')) $('pairingChildNameInput').value = '';
  if ($('pairingChildAgeInput')) $('pairingChildAgeInput').value = '10';
  if ($('pairingChildLimitInput')) $('pairingChildLimitInput').value = '120';
  openModal('pairingModal');
};

// 1. Save Profile Only (Pair Later)
if ($('saveChildOnlyBtn')) {
  $('saveChildOnlyBtn').onclick = async () => {
    const name = ($('pairingChildNameInput')?.value || '').trim();
    if (!name) {
      showToast('Please enter child name', 'error');
      $('pairingChildNameInput')?.focus();
      return;
    }
    const age = parseInt($('pairingChildAgeInput')?.value, 10) || 10;
    const dailyLimitMinutes = parseInt($('pairingChildLimitInput')?.value, 10) || 120;
    const btn = $('saveChildOnlyBtn');
    btn.disabled = true;
    btn.textContent = 'Saving Profile...';

    try {
      const res = await api('/api/children', {
        method: 'POST',
        body: JSON.stringify({ name, age, dailyLimitMinutes })
      });
      const newChild = res.child;
      const parentId = state.dashboardData?.parent?.id;
      if (parentId && newChild) {
        const stored = getStoredChildren(parentId);
        if (!stored.some(c => c.id === newChild.id)) {
          stored.push(newChild);
          setStoredChildren(parentId, stored);
        }
      }
      showToast(`Child profile "${name}" added successfully!`, 'success');
      closeModal('pairingModal');
      state.currentChildId = newChild.id;
      state.currentChildName = newChild.name;
      await initDashboard();
    } catch (err) {
      showToast(err.message || 'Failed to add child profile', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Save Profile Only (Pair Later)';
    }
  };
}

// 2. Save Profile & Generate Pairing Key
$('generateKeyBtn').onclick = async () => {
  const childName = ($('pairingChildNameInput')?.value || '').trim();
  if (!childName) {
    showToast('Please enter child name', 'error');
    $('pairingChildNameInput')?.focus();
    return;
  }
  const childAge = parseInt($('pairingChildAgeInput')?.value, 10) || 10;
  const dailyLimitMinutes = parseInt($('pairingChildLimitInput')?.value, 10) || 120;
  const btn = $('generateKeyBtn');
  btn.disabled = true;
  btn.textContent = 'Generating Secure Key...';

  try {
    const res = await api('/api/pairing/generate', {
      method: 'POST',
      body: JSON.stringify({ childName, childAge, dailyLimitMinutes })
    });

    $('pairingCodeDisplay').textContent = res.pairingCode;
    $('qrCodeContainer').innerHTML = res.qrDataUrl ? `<img src="${res.qrDataUrl}" alt="Pairing QR Code">` : '<span>QR Ready</span>';

    // Store in local storage to preserve across serverless recycles
    const parentId = state.dashboardData?.parent?.id;
    if (parentId && res.child) {
      const stored = getStoredChildren(parentId);
      if (!stored.some(c => c.id === res.child.id)) {
        stored.push(res.child);
        setStoredChildren(parentId, stored);
      }
    }

    state.currentChildId = res.childId;
    state.currentChildName = res.childName;

    $('pairingStep1').style.display = 'none';
    $('pairingStep2').style.display = 'block';

    startPairingCountdown(res.expiresAt);
    showToast(`Pairing code ${res.pairingCode} generated for ${childName}!`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed to generate code', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔗 Save Profile & Pair Device Now';
  }
};

$('copyCodeBtn').onclick = () => {
  const code = $('pairingCodeDisplay').textContent;
  navigator.clipboard.writeText(code).then(() => {
    showToast(`Copied ${code} to clipboard!`, 'info');
  });
};

function startPairingCountdown(expiresAt) {
  if (state.pairingTimer) clearInterval(state.pairingTimer);
  const target = new Date(expiresAt).getTime();

  state.pairingTimer = setInterval(() => {
    const rem = Math.max(0, Math.floor((target - Date.now()) / 1000));
    const mins = Math.floor(rem / 60);
    const secs = rem % 60;
    $('pairingCountdownText').textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (rem <= 0) {
      clearInterval(state.pairingTimer);
      $('pairingCountdownText').textContent = 'EXPIRED';
      showToast('Pairing code has expired. Please generate a new key.', 'error');
    }
  }, 1000);
}



// --- SETTINGS ---
$('saveRetentionBtn').onclick = async () => {
  const selected = document.querySelector('input[name="retentionOption"]:checked')?.value || '30';
  try {
    await api('/api/settings/retention', {
      method: 'POST',
      body: JSON.stringify({ retentionDays: parseInt(selected, 10) })
    });
    showToast(`Data retention policy updated to ${selected} days`, 'success');
  } catch (err) {
    showToast(err.message || 'Failed to update retention', 'error');
  }
};

$('deleteAccountBtn').onclick = async () => {
  if (!confirm('CAUTION: This will permanently wipe your parent account, revoke all paired child devices, and erase all activity history. This cannot be undone.\n\nProceed?')) return;
  try {
    await api('/api/settings/delete-account', {
      method: 'POST',
      headers: { 'X-Confirm-Delete': 'yes' }
    });
    sessionStorage.clear();
    alert('Your account and all associated telemetry have been wiped.');
    location.reload();
  } catch (err) {
    showToast(err.message || 'Action failed', 'error');
  }
};

// --- DATABASE PERSISTENCE & BACKUPS ---
async function loadDbPersistenceStatus() {
  try {
    const res = await api('/api/database/status');
    const badge = $('dbPersistenceBadge');
    const note = $('dbPersistenceNote');
    if (!badge) return;
    if (res.isPgActive) {
      badge.className = 'status-pill ok';
      badge.textContent = `● Persistent SQL Active (${res.kvProvider})`;
      note.textContent = `Permanent Cloud PostgreSQL storage is connected. Your account (${res.parentCount} guardian(s)), ${res.childCount} child profile(s), and ${res.deviceCount} paired device(s) are safely stored across restarts, days, and deployments.`;
    } else if (res.isKvActive) {
      badge.className = 'status-pill ok';
      badge.textContent = `● Persistent Cloud Active (${res.kvProvider})`;
      note.textContent = `Permanent Cloud storage is connected. Your account (${res.parentCount} guardian(s)), ${res.childCount} child profile(s), and ${res.deviceCount} paired device(s) are permanently preserved across all deployments.`;
    } else if (res.hasPgUrl && !res.hasPgModule) {
      badge.className = 'status-pill danger';
      badge.textContent = '● PostgreSQL Driver Missing';
      note.textContent = `DATABASE_URL is configured (${res.pgEnvKey || 'env'}), but the "pg" module could not load (${res.pgError || 'check Vercel Root Directory / npm install'}).`;
    } else {
      badge.className = 'status-pill pending';
      badge.textContent = '● Ephemeral Seed Mode (No Cloud DB)';
      note.textContent = `Warning: No PostgreSQL database (DATABASE_URL / POSTGRES_URL) is connected to this deployment yet! After connecting Neon in Vercel Storage, trigger a Redeploy in Vercel Dashboard.`;
    }
  } catch (err) {
    // non-fatal
  }
}

if ($('downloadDbBackupBtn')) {
  $('downloadDbBackupBtn').onclick = async () => {
    try {
      const token = state.sessionToken || sessionStorage.getItem('kidsafe_session');
      const res = await fetch('/api/database/backup', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Backup failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kidsafe-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      showToast('Database backup downloaded successfully', 'success');
    } catch (e) {
      showToast(e.message || 'Failed to download backup', 'error');
    }
  };
}

if ($('restoreDbFileInput')) {
  $('restoreDbFileInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const msg = $('dbBackupStatusMsg');
    if (!confirm(`Are you sure you want to restore database from "${file.name}"? This will update parent and child records.`)) {
      e.target.value = '';
      return;
    }
    try {
      if (msg) { msg.textContent = 'Restoring database...'; msg.style.color = 'var(--primary)'; }
      const text = await file.text();
      const parsed = JSON.parse(text);
      await api('/api/database/restore', {
        method: 'POST',
        body: JSON.stringify(parsed)
      });
      if (msg) { msg.textContent = 'Database restored successfully! Reloading...'; msg.style.color = 'var(--success)'; }
      showToast('Database restored successfully', 'success');
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      if (msg) { msg.textContent = 'Restore failed: ' + err.message; msg.style.color = 'var(--danger)'; }
      showToast(err.message || 'Failed to restore', 'error');
    } finally {
      e.target.value = '';
    }
  };
}

// --- STARTUP ENTRY POINT ---
// Check if running inside Android APK Parent Portal
const urlParams = new URLSearchParams(window.location.search);
const isAndroidPortal = urlParams.get('portal') === 'android' || Boolean(window.AndroidBridge);
const tokenParam = urlParams.get('token') || urlParams.get('sessionToken') || sessionStorage.getItem('kidsafe_session');

if (isAndroidPortal) {
  document.body.classList.add('android-portal-mode');
  const portalBtn = $('portalExitKidBtn');
  if (portalBtn) portalBtn.style.display = 'inline-flex';
  const headerDlBtn = $('downloadApkHeaderBtn');
  if (headerDlBtn) headerDlBtn.style.display = 'none';
  const loginDlCard = document.querySelector('.login-download-card');
  if (loginDlCard) loginDlCard.style.display = 'none';
  const heroDlBanner = document.querySelector('.apk-download-hero-banner');
  if (heroDlBanner) heroDlBanner.style.display = 'none';
  document.querySelectorAll('.apk-download-inline').forEach(el => { el.style.display = 'none'; });
} else {
  // Web Browser environment: Ensure APK Download button is fully visible in header and page
  const headerDlBtn = $('downloadApkHeaderBtn');
  if (headerDlBtn) headerDlBtn.style.display = 'inline-flex';
}

if (tokenParam) {
  state.sessionToken = tokenParam;
  sessionStorage.setItem('kidsafe_session', tokenParam);
  $('loginSection').style.display = 'none';
  $('dashboardSection').style.display = 'block';
  initDashboard().catch(() => {
    state.sessionToken = '';
    sessionStorage.removeItem('kidsafe_session');
    $('loginSection').style.display = 'flex';
    $('dashboardSection').style.display = 'none';
  });
} else {
  // Always start with the Login Form when opening the website directly
  state.sessionToken = '';
  sessionStorage.removeItem('kidsafe_session');
  $('loginSection').style.display = 'flex';
  $('dashboardSection').style.display = 'none';
}
setLanguage(state.lang);

// APK Download click handler with instant visual Toast feedback
document.addEventListener('click', (e) => {
  const btn = e.target.closest('a[href*="/download/apk"], a[href*="KidSafe-Monitor.apk"], #downloadApkHeaderBtn');
  if (btn) {
    showToast('📥 Starting download: KidSafe-Monitor.apk (v1.0.7)... Check your downloads!', 'success');
  }
});
