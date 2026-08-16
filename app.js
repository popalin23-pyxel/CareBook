/* CareStock PWA */
const APP_VERSION = '10';
'use strict';

// ── Constants ──────────────────────────────────────────────
const LS = 'medicinali_pwa_v1';
const DAYS_IT = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
const DAYS_EN = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MONTHS_SHORT_IT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const FORMATS = [
  {id:'', label:'Nessuno', icon:'·'},
  {id:'compressa', label:'Compressa', icon:'○'},
  {id:'gocce', label:'Gocce', icon:'◉'},
  {id:'fiala', label:'Fiala', icon:'|'},
  {id:'siringa', label:'Siringa', icon:'⚕'},
  {id:'bustina', label:'Bustina', icon:'▱'},
  {id:'sciroppo', label:'Sciroppo', icon:'⌗'},
  {id:'spray', label:'Spray', icon:'≋'},
  {id:'altro', label:'Altro', icon:'···'}
];
const OP_COLORS = ['#3d9e8c','#e09038','#5b7be0','#d84e6b','#7b5be0','#4a9e4a','#c97b30'];

// ── Firebase ────────────────────────────────────────────────
const FB_CONFIG = {
  apiKey: 'AIzaSyBhePhXYLtm2RAyQMpRMb3RsxZD4rc6tz8',
  authDomain: 'database-ppm.firebaseapp.com',
  projectId: 'database-ppm',
  storageBucket: 'database-ppm.firebasestorage.app',
  messagingSenderId: '232196854704',
  appId: '1:232196854704:web:a13cc27814a5fe8a477c75'
};
firebase.initializeApp(FB_CONFIG);
const db = firebase.firestore();
const auth = firebase.auth();
let _fbUser = null;
let _fbRole = 'viewer';
let _fbUnsubData = null;
let _fbFacilityId = null;
let _fbFacilityName = '';
let _saUnsubs = [];
const SUPER_ADMIN_EMAIL = 'popalin23@gmail.com';
const ROLE_LABELS = {
  'superadmin': '⚡ Super Admin',
  'admin': '👑 Amministratore',
  'nurse-write': '✍️ Infermiere (lettura+scrittura)',
  'nurse-read': '👁 Infermiere (sola lettura)'
};
function isSuperAdmin() { return _fbUser?.email === SUPER_ADMIN_EMAIL; }
function canEdit() { return _fbRole === 'admin' || _fbRole === 'nurse-write'; }
function sanitizeForFirestore(obj) { return JSON.parse(JSON.stringify(obj)); }

// ── State ───────────────────────────────────────────────────
const S = {
  page: 'patients',
  patientId: null,
  medId: null,
  visitId: null,
  editDbMedId: null,
  sort: 'nome',
  filterAlerts: false,
  search: '',
  calMode: 'visite',
  calDate: new Date(),
  calSelected: new Date(),
  dbSearch: '',
  dbPage: 0,
  searchGlobal: '',
  locationId: null
};

// ── Data ────────────────────────────────────────────────────
let D = loadData();

function loadData() {
  try {
    const raw = localStorage.getItem(LS);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  const opId = uid();
  return {
    patients: [],
    medicineDb: [],
    operators: [{id: opId, name: 'Operatore', color: OP_COLORS[0]}],
    settings: {language: 'it', alertDays: 7, activeOperatorId: opId}
  };
}

function save() {
  try { localStorage.setItem(LS, JSON.stringify(D)); } catch(e) {}
  if (_fbUser && canEdit() && _fbFacilityId) {
    db.collection('appData').doc(_fbFacilityId).set(sanitizeForFirestore(D))
      .catch(err => console.warn('Firestore save failed:', err.code));
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Storico movimenti ───────────────────────────────────────
function logMove(action, name, qty, where) {
  if (!D.movements) D.movements = [];
  D.movements.push({ id: uid(), date: new Date().toISOString(), op: activeOp().name, action, name, qty, where });
  if (D.movements.length > 600) D.movements = D.movements.slice(-500);
}

function fmtDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
}

function fmtDatetime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

function todayISO() {
  return new Date().toISOString().slice(0,10);
}

function T(it, en) {
  return D.settings.language === 'en' ? en : it;
}

// ── Navigation ──────────────────────────────────────────────
function navigate(page, params) {
  if (S.page === 'super-admin' && page !== 'super-admin' && _saUnsubs.length) {
    _saUnsubs.forEach(u => u());
    _saUnsubs = [];
  }
  if (S.page === 'scan' && page !== 'scan') stopScanner();
  if (params) Object.assign(S, params);
  S.page = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  renderPage(page);
  updateBottomNav(page);
  window.scrollTo(0, 0);
}

function updateBottomNav(page) {
  const nav = g('bottom-nav');
  if (!nav) return;
  const hidden = ['login', 'register', 'waiting', 'super-admin'].includes(page);
  nav.classList.toggle('visible', !hidden);
  if (hidden) return;
  const groups = {
    home: ['home', 'alerts', 'calendar', 'db', 'add-db-med', 'search'],
    patients: ['patients', 'patient-detail', 'add-patient', 'add-med', 'add-visit'],
    locations: ['locations', 'location-detail'],
    settings: ['settings', 'history', 'stats']
  };
  nav.querySelectorAll('.bnav-btn').forEach(b => {
    b.classList.toggle('active', (groups[b.dataset.page] || []).includes(page));
  });
  const badge = g('bnav-badge');
  if (badge) {
    const n = getLowMeds().length + getExpiringItems().length;
    badge.textContent = n > 99 ? '99+' : n;
    badge.style.display = n ? 'flex' : 'none';
  }
}

function back() {
  const map = {
    'patient-detail': 'patients',
    'add-patient': S.patientId ? 'patient-detail' : 'patients',
    'add-med': 'patient-detail',
    'add-visit': 'patient-detail',
    'patients': 'home',
    'calendar': 'home',
    'scan': 'home',
    'alerts': 'home',
    'locations': 'home',
    'location-detail': 'locations',
    'history': 'settings',
    'stats': 'settings',
    'db': 'home',
    'add-db-med': 'db',
    'settings': 'home',
    'search': 'home',
    'register': 'login',
    'waiting': 'login',
    'super-admin': _fbFacilityId ? 'home' : 'login'
  };
  navigate(map[S.page] || 'home');
}

function renderPage(page) {
  const renders = {
    'home': renderHome,
    'alerts': renderAlerts,
    'locations': renderLocationsPage,
    'patients': renderPatients,
    'patient-detail': renderPatientDetail,
    'add-patient': renderAddPatient,
    'add-med': renderAddMed,
    'add-visit': renderAddVisit,
    'calendar': renderCalendar,
    'db': renderDb,
    'add-db-med': renderAddDbMed,
    'scan': renderScan,
    'location-detail': renderLocationDetail,
    'history': renderHistory,
    'stats': renderStats,
    'settings': renderSettings,
    'search': renderSearch,
    'waiting': renderWaiting,
    'super-admin': renderSuperAdmin,
    'login': renderLogin,
    'register': renderRegister
  };
  if (renders[page]) renders[page]();
}

// ── Helpers ─────────────────────────────────────────────────
function getPatient(id) { return D.patients.find(p => p.id === (id || S.patientId)); }
function getFmtIcon(fmtId) { return (FORMATS.find(f => f.id === fmtId) || FORMATS[0]).icon; }
function getFmtLabel(fmtId) { return (FORMATS.find(f => f.id === fmtId) || FORMATS[0]).label; }
function medFmtLabel(med) {
  if (med && med.format === 'altro' && med.customFormat) return med.customFormat;
  return getFmtLabel(med?.format);
}
function activeOp() { return D.operators.find(o => o.id === D.settings.activeOperatorId) || D.operators[0]; }

function dosePerDay(med) {
  if (med.schedule && med.schedule.length > 0) {
    return med.schedule.reduce((s, t) => s + (t.qty || 0), 0);
  }
  const d = med.dosage || {};
  return (d.mattina||0) + (d.pranzo||0) + (d.sera||0) + (d.notte||0);
}

function formatSchedule(med) {
  if (med.schedule && med.schedule.length > 0) {
    return med.schedule.map(t => `${t.time} ×${t.qty}`).join(' · ');
  }
  const d = med.dosage || {};
  const parts = [];
  if (d.mattina) parts.push(`${T('Mattina','Morning')} ${d.mattina}`);
  if (d.pranzo) parts.push(`${T('Pranzo','Lunch')} ${d.pranzo}`);
  if (d.sera) parts.push(`${T('Sera','Evening')} ${d.sera}`);
  if (d.notte) parts.push(`${T('Notte','Night')} ${d.notte}`);
  return parts.join(' · ');
}

function convertDosageToSchedule(dosage) {
  if (!dosage) return [];
  const r = [];
  if (dosage.mattina) r.push({time:'08:00', qty: dosage.mattina});
  if (dosage.pranzo)  r.push({time:'12:00', qty: dosage.pranzo});
  if (dosage.sera) {
    const half = Math.round((dosage.sera / 2) * 2) / 2;
    r.push({time:'18:00', qty: half});
    r.push({time:'20:00', qty: dosage.sera - half});
  }
  if (dosage.notte)   r.push({time:'22:00', qty: dosage.notte});
  return r;
}

function computeEndDate(startIso, totalQty, dpd, weekDays, monthDays) {
  if (!dpd || dpd <= 0 || !totalQty) return null;
  const d = new Date(startIso + 'T00:00:00');
  let rem = totalQty;
  let safety = 0;
  while (rem > 0 && safety < 3650) {
    const dow = (d.getDay() + 6) % 7;
    const dom = d.getDate();
    let takes = false;
    if (monthDays && monthDays.length > 0) {
      takes = monthDays.includes(dom);
    } else {
      takes = !weekDays || weekDays.length === 0 || weekDays.includes(dow);
    }
    if (takes) rem -= dpd;
    if (rem > 0) d.setDate(d.getDate() + 1);
    safety++;
  }
  return d.toISOString().slice(0, 10);
}

function recalcMedEnd(med) {
  const dpd = dosePerDay(med);
  if (med.startDate && dpd && med.totalQty > 0) {
    const weekDays = med.days && med.days.length > 0 && med.days.length < 7 ? med.days : null;
    const mDays = med.monthDays && med.monthDays.length > 0 ? med.monthDays : null;
    med.endDate = computeEndDate(med.startDate, med.totalQty, dpd, mDays ? null : weekDays, mDays);
  }
}

function getMedStatus(med) {
  if (!med.endDate) return {cls:'ok', label: ''};
  const today = new Date(); today.setHours(0,0,0,0);
  const end = new Date(med.endDate + 'T00:00:00');
  const diff = Math.round((end - today) / 86400000);
  const alertDays = med.alertDays != null ? med.alertDays : D.settings.alertDays;
  if (diff < 0) return {cls:'expired', label: T('Terminato','Expired'), days: diff};
  if (diff === 0) return {cls:'low', label: T('Ultimo giorno','Last day'), days: 0};
  if (diff <= alertDays) return {cls:'low', label: T(`${diff} giorni rimasti`, `${diff} days left`), days: diff};
  return {cls:'ok', label: T(`${diff} giorni rimasti`, `${diff} days left`), days: diff};
}

// ── Scadenze prodotti ───────────────────────────────────────
function expiryStatus(expiry) {
  if (!expiry) return null;
  let end;
  if (/^\d{4}-\d{2}$/.test(expiry)) {
    const p = expiry.split('-');
    end = new Date(parseInt(p[0], 10), parseInt(p[1], 10), 0); // ultimo giorno del mese
  } else {
    end = new Date(expiry + 'T00:00:00');
  }
  if (isNaN(end)) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((end - today) / 86400000);
  if (diff < 0) return {cls: 'expired', days: diff, label: T('SCADUTO', 'EXPIRED')};
  if (diff <= 30) return {cls: 'low', days: diff, label: T(`scade tra ${diff} gg`, `expires in ${diff}d`)};
  return {cls: 'ok', days: diff, label: ''};
}

function fmtExpiry(expiry) {
  if (!expiry) return '';
  const p = expiry.split('-');
  return p[1] + '/' + p[0];
}

function getExpiringItems() {
  const out = [];
  D.patients.forEach(pt => (pt.medicines || []).forEach(m => {
    const st = expiryStatus(m.expiry);
    if (st && st.cls !== 'ok') out.push({icon: '👤', where: pt.name, name: m.name, expiry: m.expiry, st, ptId: pt.id});
  }));
  (D.locations || []).forEach(l => (l.items || []).forEach(it => {
    const st = expiryStatus(it.expiry);
    if (st && st.cls !== 'ok') out.push({icon: '📦', where: l.name, name: it.name, expiry: it.expiry, st, locId: l.id});
  }));
  return out.sort((a, b) => a.st.days - b.st.days);
}

function getLowMeds() {
  const result = [];
  D.patients.forEach(pt => {
    (pt.medicines || []).forEach(med => {
      const st = getMedStatus(med);
      if (st.cls === 'low' || st.cls === 'expired') {
        result.push({patient: pt, med, status: st});
      }
    });
  });
  return result;
}

function hasAlert(pt) {
  return (pt.medicines || []).some(m => {
    const st = getMedStatus(m);
    if (st.cls === 'low' || st.cls === 'expired') return true;
    const ex = expiryStatus(m.expiry);
    return !!ex && ex.cls !== 'ok';
  });
}

function nextEndDate(pt) {
  const ends = (pt.medicines || [])
    .filter(m => m.endDate)
    .map(m => m.endDate)
    .sort();
  return ends[0] || null;
}

// ── PAGE: Ricerca globale ────────────────────────────────────
function renderSearch() {
  const el = g('page-search');
  if (!el) return;
  const q = S.searchGlobal || '';
  el.innerHTML = `
    <div class="bar">
      <button class="bar-back" onclick="back()">${svgIcon('ic-arrow-left',22)}</button>
      <span class="bar-title">${T('Ricerca','Search')}</span>
    </div>
    <div class="scroll">
      <div class="search-wrap" style="margin-bottom:4px">
        ${svgIcon('ic-search',16)}
        <input class="search-inp" id="f-global-search"
          placeholder="${T('Paziente, medicinale, visita...','Patient, medicine, visit...')}"
          value="${escHtml(q)}"
          oninput="S.searchGlobal=this.value;renderSearchResults()"
          autocomplete="off">
      </div>
      <div style="font-size:12px;color:var(--t3);margin-bottom:14px;padding-left:2px">${T('Cerca su tutti i pazienti, medicinali e visite','Search across all patients, medicines and visits')}</div>
      <div id="search-results">${q ? '' : buildSearchEmpty()}</div>
    </div>`;
  setTimeout(() => g('f-global-search')?.focus(), 80);
  if (q) renderSearchResults();
}

function buildSearchEmpty() {
  return `<div class="empty" style="padding:60px 20px">
    ${svgIcon('ic-search',40)}
    <div style="margin-top:12px">${T('Scrivi per cercare...','Start typing to search...')}</div>
  </div>`;
}

function renderSearchResults() {
  const el = g('search-results');
  if (!el) return;
  const q = (S.searchGlobal || '').toLowerCase().trim();
  if (!q) { el.innerHTML = buildSearchEmpty(); return; }

  // ── Pazienti per nome / stanza ──
  const patMatches = D.patients.filter(p =>
    p.name.toLowerCase().includes(q) || (p.room||'').toLowerCase().includes(q)
  );

  // ── Medicinali: raccogli {med, patient} e raggruppa per nome ──
  const medGroups = {};
  D.patients.forEach(pt => {
    (pt.medicines||[]).forEach(med => {
      if (!med.name.toLowerCase().includes(q)) return;
      const key = med.name.toLowerCase().trim();
      if (!medGroups[key]) medGroups[key] = { name: med.name, entries: [] };
      medGroups[key].entries.push({ med, pt });
    });
  });
  const medGroupKeys = Object.keys(medGroups).sort();

  // ── Visite per titolo / luogo ──
  const visitMatches = [];
  D.patients.forEach(pt => {
    (pt.visits||[]).forEach(v => {
      if (v.title.toLowerCase().includes(q) || (v.location||'').toLowerCase().includes(q))
        visitMatches.push({ v, pt });
    });
  });
  visitMatches.sort((a,b) => b.v.date.localeCompare(a.v.date));

  if (!patMatches.length && !medGroupKeys.length && !visitMatches.length) {
    el.innerHTML = `<div class="empty">${T('Nessun risultato per','No results for')} "<strong>${escHtml(S.searchGlobal)}</strong>"</div>`;
    return;
  }

  let html = '';

  // Pazienti
  if (patMatches.length) {
    html += `<div class="sec-hd">${T('Pazienti','Patients')} (${patMatches.length})</div>`;
    patMatches.forEach(pt => {
      const nMeds = (pt.medicines||[]).length;
      html += `<div class="patient-card ${hasAlert(pt)?'has-alert':''}" onclick="navigate('patient-detail',{patientId:'${pt.id}'})">
        <div class="avatar">${escHtml(pt.name[0].toUpperCase())}</div>
        <div class="patient-info">
          <div class="patient-name-row">
            <span class="patient-name">${escHtml(pt.name)}</span>
            ${pt.room ? `<span class="badge">${escHtml(pt.room)}</span>` : ''}
          </div>
          <div class="patient-sub">${nMeds} ${T(nMeds===1?'medicinale':'medicinali',nMeds===1?'medicine':'medicines')}</div>
        </div>
        ${svgIcon('ic-chevron',18)}
      </div>`;
    });
  }

  // Medicinali raggruppati
  medGroupKeys.forEach(key => {
    const grp = medGroups[key];
    const n = grp.entries.length;
    html += `<div class="sec-hd">💊 ${escHtml(grp.name)} — ${n} ${T(n===1?'paziente':'pazienti',n===1?'patient':'patients')}</div>
    <div class="section-box" style="padding:0;overflow:hidden">`;
    grp.entries.forEach(({ med, pt }, idx) => {
      const st = getMedStatus(med);
      const dpd = dosePerDay(med);
      const fmtLbl = medFmtLabel(med);
      const pills = med.totalQty != null ? `${med.totalQty} ${fmtLbl||T('rimaste','left')}` : '';
      const stColor = st.cls==='expired'?'var(--r)':st.cls==='low'?'var(--w)':'var(--p)';
      html += `<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;${idx>0?'border-top:1px solid var(--br)':''};cursor:pointer" onclick="navigate('patient-detail',{patientId:'${pt.id}'})">
        <div class="avatar" style="width:38px;height:38px;font-size:15px;flex-shrink:0">${escHtml(pt.name[0].toUpperCase())}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:600">${escHtml(pt.name)}</div>
          <div style="font-size:12px;color:var(--t2);margin-top:3px;display:flex;flex-wrap:wrap;gap:6px">
            ${pt.room ? `<span>${svgIcon('ic-home',11)} ${escHtml(pt.room)}</span>` : ''}
            ${dpd ? `<span>⚖️ ${dpd} ${fmtLbl||T('al giorno','per day')}</span>` : ''}
            ${pills ? `<span>💊 ${pills}</span>` : ''}
            ${st.label ? `<span style="color:${stColor};font-weight:600">${st.label}</span>` : ''}
          </div>
        </div>
        ${svgIcon('ic-chevron',16)}
      </div>`;
    });
    html += `</div>`;
  });

  // Visite
  if (visitMatches.length) {
    html += `<div class="sec-hd">${T('Visite','Visits')} (${visitMatches.length})</div>`;
    visitMatches.forEach(({ v, pt }) => {
      html += `<div class="section-box" style="cursor:pointer;margin-bottom:8px" onclick="navigate('patient-detail',{patientId:'${pt.id}'})">
        <div style="font-size:12px;color:var(--t2);margin-bottom:4px">${escHtml(pt.name)}${pt.room ? ` · Stanza ${escHtml(pt.room)}` : ''}</div>
        <div style="font-size:15px;font-weight:600">${escHtml(v.title)}</div>
        <div style="font-size:12px;color:var(--t2);margin-top:3px">${fmtDatetime(v.date)}${v.location ? ' · ' + escHtml(v.location) : ''}</div>
      </div>`;
    });
  }

  el.innerHTML = html;
}

// ── Firebase Auth ────────────────────────────────────────────
async function handleAuthChange(user) {
  _fbUser = user;
  if (!user) {
    if (_fbUnsubData) { _fbUnsubData(); _fbUnsubData = null; }
    navigate('login');
    return;
  }
  // Super admin bypassa tutto
  if (user.email === SUPER_ADMIN_EMAIL) {
    _fbRole = 'superadmin';
    _fbFacilityId = null;
    _fbFacilityName = '';
    navigate('super-admin');
    return;
  }
  try {
    const userRef = db.collection('users').doc(user.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      // Scrive solo i campi che l'utente può impostare (no role/facilityId — li assegna il super admin)
      await userRef.set({ email: user.email, createdAt: new Date().toISOString() });
      _fbRole = 'nurse-read';
      _fbFacilityId = null;
    } else {
      const data = userSnap.data();
      _fbRole = data.role || 'nurse-read';
      _fbFacilityId = data.facilityId || null;
    }
  } catch(err) {
    console.warn('User profile error:', err);
    _fbRole = 'nurse-read';
    _fbFacilityId = null;
  }
  if (!_fbFacilityId) { navigate('waiting'); return; }
  try {
    const facSnap = await db.collection('facilities').doc(_fbFacilityId).get();
    _fbFacilityName = facSnap.exists ? facSnap.data().name : '';
  } catch(e) { _fbFacilityName = ''; }
  setupFbListeners();
}

function setupFbListeners() {
  if (_fbUnsubData) _fbUnsubData();
  if (!_fbFacilityId) return;
  const LIVE_PAGES = ['home', 'alerts', 'locations', 'location-detail', 'patients', 'patient-detail', 'calendar', 'db', 'settings', 'search'];
  _fbUnsubData = db.collection('appData').doc(_fbFacilityId).onSnapshot(snap => {
    if (snap.exists) {
      const data = snap.data();
      if (data) {
        D = data;
        try { localStorage.setItem(LS, JSON.stringify(D)); } catch(e) {}
      }
    } else if (_fbRole === 'admin' || isSuperAdmin()) {
      const opId = uid();
      const init = { patients: [], medicineDb: [], operators: [{id:opId, name:'Operatore', color:OP_COLORS[0]}], settings: {language:'it', alertDays:7, activeOperatorId:opId} };
      db.collection('appData').doc(_fbFacilityId).set(sanitizeForFirestore(init)).catch(console.error);
      D = init;
    }
    if (['login', 'register', 'waiting', 'super-admin'].includes(S.page)) {
      navigate('home');
      checkPinOnStart();
    } else if (LIVE_PAGES.includes(S.page)) {
      renderPage(S.page);
      updateBottomNav(S.page);
    }
  }, err => {
    console.error('Firestore error:', err);
    if (['login', 'register', 'waiting', 'super-admin'].includes(S.page)) navigate('home');
  });
}

// ── Pages: Login / Register ──────────────────────────────────
function renderLogin() {
  const el = g('page-login');
  if (!el) return;
  el.innerHTML = `
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 24px">
      <div style="width:68px;height:68px;background:var(--pl);border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:20px;font-size:30px">💊</div>
      <div style="font-size:24px;font-weight:800;margin-bottom:6px;text-align:center">CareStock</div>
      <div style="font-size:14px;color:var(--t2);margin-bottom:32px;text-align:center">Accedi per continuare</div>
      <div style="width:100%;max-width:360px">
        <div class="form-group">
          <label class="form-label">Email</label>
          <input class="form-input" id="f-login-email" type="email" placeholder="nome@email.it" autocomplete="email">
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input class="form-input" id="f-login-pw" type="password" placeholder="Password" autocomplete="current-password">
        </div>
        <div id="login-err" style="color:var(--r);font-size:13px;margin-bottom:10px;min-height:18px"></div>
        <button class="btn-primary" onclick="doLogin()">Accedi</button>
        <div style="text-align:center;margin-top:14px">
          <button onclick="forgotPassword()" style="background:none;border:none;color:var(--t2);font-size:13px;cursor:pointer;text-decoration:underline">Password dimenticata?</button>
        </div>
        <div style="text-align:center;margin-top:10px;font-size:14px;color:var(--t2)">Non hai un account? <button onclick="navigate('register')" style="background:none;border:none;color:var(--p);font-size:14px;font-weight:600;cursor:pointer">Registrati</button></div>
      </div>
    </div>`;
  setTimeout(() => { g('f-login-pw')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); }); }, 100);
}

function renderRegister() {
  const el = g('page-register');
  if (!el) return;
  el.innerHTML = `
    <div class="bar">
      <button class="bar-back" onclick="navigate('login')">${svgIcon('ic-arrow-left',22)}</button>
      <span class="bar-title">Crea account</span>
    </div>
    <div class="scroll">
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="f-reg-email" type="email" placeholder="nome@email.it" autocomplete="email">
      </div>
      <div class="form-group">
        <label class="form-label">Password (min 6 caratteri)</label>
        <input class="form-input" id="f-reg-pw" type="password" placeholder="Password" autocomplete="new-password">
      </div>
      <div id="reg-err" style="color:var(--r);font-size:13px;margin-bottom:10px;min-height:18px"></div>
      <button class="btn-primary" onclick="doRegister()">Crea account</button>
      <div style="margin-top:14px;font-size:12px;color:var(--t3)">Il primo account creato diventa automaticamente amministratore. I successivi saranno in sola lettura finché un amministratore li promuove.</div>
    </div>`;
}

async function doLogin() {
  const email = g('f-login-email')?.value.trim();
  const pw = g('f-login-pw')?.value;
  const errEl = g('login-err');
  if (!email || !pw) { if (errEl) errEl.textContent = 'Inserisci email e password.'; return; }
  if (errEl) errEl.textContent = 'Accesso in corso...';
  try {
    await auth.signInWithEmailAndPassword(email, pw);
  } catch(err) {
    const msgs = { 'auth/user-not-found':'Utente non trovato.', 'auth/wrong-password':'Password errata.', 'auth/invalid-email':'Email non valida.', 'auth/too-many-requests':'Troppi tentativi. Riprova tra poco.', 'auth/invalid-credential':'Email o password non corretti.' };
    if (errEl) errEl.textContent = msgs[err.code] || 'Errore di accesso. Riprova.';
  }
}

async function doRegister() {
  const email = g('f-reg-email')?.value.trim();
  const pw = g('f-reg-pw')?.value;
  const errEl = g('reg-err');
  if (!email || !pw) { if (errEl) errEl.textContent = 'Inserisci email e password.'; return; }
  if (errEl) errEl.textContent = 'Creazione account...';
  try {
    await auth.createUserWithEmailAndPassword(email, pw);
  } catch(err) {
    const msgs = { 'auth/email-already-in-use':'Email già in uso.', 'auth/invalid-email':'Email non valida.', 'auth/weak-password':'Password troppo debole (min 6 caratteri).', 'auth/operation-not-allowed':'Registrazione non abilitata nel progetto Firebase.' };
    if (errEl) errEl.textContent = msgs[err.code] || 'Errore di registrazione. Riprova.';
  }
}

async function forgotPassword() {
  const email = g('f-login-email')?.value.trim();
  const errEl = g('login-err');
  if (!email) {
    if (errEl) { errEl.style.color = 'var(--w)'; errEl.textContent = 'Inserisci prima la tua email.'; }
    return;
  }
  try {
    await auth.sendPasswordResetEmail(email);
    if (errEl) { errEl.style.color = 'var(--p)'; errEl.textContent = 'Email di reset inviata! Controlla la posta.'; }
  } catch(err) {
    const msgs = { 'auth/user-not-found':'Nessun account con questa email.', 'auth/invalid-email':'Email non valida.' };
    if (errEl) { errEl.style.color = 'var(--r)'; errEl.textContent = msgs[err.code] || 'Errore. Riprova.'; }
  }
}

async function doLogout() {
  if (_fbUnsubData) { _fbUnsubData(); _fbUnsubData = null; }
  _fbUser = null;
  _fbRole = 'viewer';
  await auth.signOut();
}

// ── Pagina: In attesa di accesso ────────────────────────────
function renderWaiting() {
  const el = g('page-waiting');
  if (!el) return;
  el.innerHTML = `
    <div class="bar">
      <span class="bar-title" style="flex:1">CareStock</span>
      <div class="bar-icons">
        <button class="ib" style="color:var(--r);font-size:12px;font-weight:700" onclick="doLogout()">Esci</button>
      </div>
    </div>
    <div class="scroll" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:70vh;text-align:center">
      <div style="font-size:52px;margin-bottom:16px">🏥</div>
      <div style="font-size:20px;font-weight:800;margin-bottom:10px">Account in attesa</div>
      <div style="font-size:14px;color:var(--t2);max-width:300px;line-height:1.6;margin-bottom:8px">
        Sei loggato come<br><strong>${escHtml(_fbUser?.email||'')}</strong>
      </div>
      <div style="font-size:14px;color:var(--t2);max-width:300px;line-height:1.6;margin-bottom:28px">
        Il tuo account non è ancora stato assegnato a nessuna struttura.<br>Contatta l'amministratore.
      </div>
      <button class="btn-danger" style="width:auto;padding:12px 28px" onclick="doLogout()">Esci</button>
    </div>`;
}

// ── Pagina: Super Admin ──────────────────────────────────────
function renderSuperAdmin() {
  const el = g('page-super-admin');
  if (!el) return;
  el.innerHTML = `
    <div class="bar">
      ${_fbFacilityId ? `<button class="bar-back" onclick="navigate('home')">${svgIcon('ic-arrow-left',22)}</button>` : ''}
      <span class="bar-title" style="flex:1">⚡ Super Admin</span>
      <div class="bar-icons">
        <button class="ib" style="color:var(--r);font-size:12px;font-weight:700" onclick="doLogout()">Esci</button>
      </div>
    </div>
    <div class="scroll">
      <div class="sec-hd">STRUTTURE DI LAVORO</div>
      <div id="sa-facilities"><div class="empty">Caricamento...</div></div>

      <div class="section-box" style="margin-top:8px">
        <div style="font-size:15px;font-weight:700;margin-bottom:12px">+ Nuova struttura</div>
        <input class="form-input" id="f-new-facility" placeholder="es. Casa Famiglia Rossi, RSA Villa Verde...">
        <button class="btn-primary" style="margin-top:10px" onclick="createFacility()">Crea struttura</button>
      </div>

      <div class="sec-hd" style="margin-top:20px">GESTIONE UTENTI</div>
      <div id="sa-users"><div class="empty">Caricamento...</div></div>
    </div>`;
  loadSuperAdminData();
}

function superAdminEnterFacility(facilityId, facilityName) {
  _fbFacilityId = facilityId;
  _fbFacilityName = facilityName;
  _fbRole = 'admin';
  setupFbListeners();
}

function loadSuperAdminData() {
  // Clean up any previous listeners
  _saUnsubs.forEach(u => u());
  _saUnsubs = [];

  let _facilities = [];
  let _users = [];

  function renderSaContent() {
    // Strutture
    const facEl = g('sa-facilities');
    if (facEl) {
      if (!_facilities.length) {
        facEl.innerHTML = '<div class="empty">Nessuna struttura. Creane una qui sotto.</div>';
      } else {
        facEl.innerHTML = _facilities.map(f => {
          const n = _users.filter(u => u.facilityId === f.id).length;
          return `<div class="section-box" style="margin-bottom:8px;display:flex;align-items:center;gap:12px">
            <div style="flex:1">
              <div style="font-size:15px;font-weight:700">🏥 ${escHtml(f.name)}</div>
              <div style="font-size:12px;color:var(--t2);margin-top:2px">${n} utent${n===1?'e':'i'} assegnat${n===1?'o':'i'}</div>
            </div>
            <button class="pill active" onclick="superAdminEnterFacility('${f.id}','${escHtml(f.name)}')" style="white-space:nowrap">Accedi</button>
            <button class="ib" style="color:var(--r)" onclick="confirmDeleteFacility('${f.id}','${escHtml(f.name)}')">${svgIcon('ic-trash',18)}</button>
          </div>`;
        }).join('');
      }
    }

    // Utenti
    const usersEl = g('sa-users');
    if (usersEl) {
      const facOpts = _facilities.map(f => `<option value="${f.id}">${escHtml(f.name)}</option>`).join('');
      if (!_users.length) {
        usersEl.innerHTML = '<div class="empty">Nessun utente registrato.</div>';
      } else {
        // Pending users (no facilityId) go first
        const sorted = [..._users].sort((a, b) => {
          const aP = !a.facilityId ? 0 : 1;
          const bP = !b.facilityId ? 0 : 1;
          return aP - bP;
        });
        usersEl.innerHTML = sorted.map(u => {
          const isPending = !u.facilityId;
          return `<div class="section-box" style="margin-bottom:8px${isPending ? ';border-left:3px solid var(--p)' : ''}" id="user-card-${u.id}">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <div style="font-size:13px;font-weight:600;flex:1">${escHtml(u.email)}</div>
              ${isPending ? '<span style="font-size:11px;background:var(--p);color:#fff;padding:2px 7px;border-radius:20px;white-space:nowrap">In attesa</span>' : ''}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <select id="fac-${u.id}" class="form-input" style="flex:1;min-width:140px;padding:8px 10px;font-size:13px">
                <option value="">— Nessuna struttura —</option>
                ${facOpts}
              </select>
              <select id="role-${u.id}" class="form-input" style="flex:1;min-width:140px;padding:8px 10px;font-size:13px">
                <option value="admin">👑 Amministratore</option>
                <option value="nurse-write">✍️ Infermiere (R+W)</option>
                <option value="nurse-read">👁 Infermiere (sola lettura)</option>
              </select>
              <button class="pill active" onclick="saveUserAssignment('${u.id}')" style="white-space:nowrap;align-self:center" id="btn-${u.id}">Salva</button>
            </div>
          </div>`;
        }).join('');
        setTimeout(() => sorted.forEach(u => {
          const fs = g(`fac-${u.id}`); const rs = g(`role-${u.id}`);
          if (fs && u.facilityId) fs.value = u.facilityId;
          if (rs && u.role) rs.value = u.role;
        }), 80);
      }
    }
  }

  const unsubFac = db.collection('facilities').onSnapshot(snap => {
    _facilities = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSaContent();
  }, e => {
    console.error('sa-facilities snapshot:', e);
    const el = g('sa-facilities');
    if (el) el.innerHTML = `<div class="section-box" style="color:var(--r)">⚠️ Errore permessi Firestore: aggiorna le regole di sicurezza nel Firebase Console.</div>`;
  });

  const unsubUsers = db.collection('users').onSnapshot(snap => {
    _users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderSaContent();
  }, e => {
    console.error('sa-users snapshot:', e);
    const el = g('sa-users');
    if (el) el.innerHTML = `<div class="section-box" style="color:var(--r)">⚠️ Errore permessi: il Super Admin non può leggere la lista utenti. Aggiorna le regole Firestore (vedi istruzioni).</div>`;
  });

  _saUnsubs = [unsubFac, unsubUsers];
}

async function createFacility() {
  const name = g('f-new-facility')?.value.trim();
  if (!name) { alert('Inserisci il nome della struttura.'); return; }
  try {
    const id = uid();
    await db.collection('facilities').doc(id).set({ id, name, createdAt: new Date().toISOString(), createdBy: _fbUser.uid });
    g('f-new-facility').value = '';
    renderSuperAdmin();
  } catch(e) { alert('Errore: ' + e.message); }
}

function confirmDeleteFacility(facilityId, name) {
  if (!confirm(`Eliminare la struttura "${name}"?\n\nI dati dei pazienti e medicinali verranno persi definitivamente!`)) return;
  Promise.all([
    db.collection('facilities').doc(facilityId).delete(),
    db.collection('appData').doc(facilityId).delete().catch(() => {})
  ]).then(() => renderSuperAdmin()).catch(e => alert('Errore: ' + e.message));
}

async function saveUserAssignment(userId) {
  const facilityId = g(`fac-${userId}`)?.value || null;
  const role = g(`role-${userId}`)?.value || 'nurse-read';
  const btn = g(`btn-${userId}`);
  try {
    await db.collection('users').doc(userId).update({ facilityId: facilityId || null, role });
    if (btn) { btn.textContent = '✓ Salvato'; setTimeout(() => { btn.textContent = 'Salva'; }, 1500); }
  } catch(e) { alert('Errore: ' + e.message); }
}

// ── Gestione utenti per admin struttura ──────────────────────
async function changeUserRole(userId, newRole) {
  try {
    await db.collection('users').doc(userId).update({ role: newRole });
  } catch(e) { alert('Errore: ' + e.message); }
}

async function renderUsersSection() {
  const placeholder = g('users-sec-placeholder');
  if (!placeholder) return;
  try {
    const snap = await db.collection('users').where('facilityId', '==', _fbFacilityId).get();
    let html = `<div class="settings-sec">
      <div class="settings-sec-title">UTENTI STRUTTURA</div>
      <div class="settings-sec-desc">Cambia il ruolo degli utenti assegnati a questa struttura. Per aggiungere/rimuovere utenti contatta il Super Admin.</div>`;
    if (snap.empty) {
      html += '<div class="settings-row" style="color:var(--t3);font-size:13px">Nessun utente trovato.</div>';
    }
    snap.docs.forEach(doc => {
      const u = doc.data();
      const isMe = doc.id === _fbUser?.uid;
      html += `<div class="settings-row">
        <div style="flex:1">
          <div style="font-size:14px;font-weight:500">${escHtml(u.email)}${isMe ? ' <span style="font-size:11px;color:var(--t3)">(tu)</span>' : ''}</div>
          <div style="font-size:12px;color:var(--t2);margin-top:2px">${ROLE_LABELS[u.role]||u.role}</div>
        </div>
        ${!isMe ? `<select onchange="changeUserRole('${doc.id}',this.value)" class="form-input" style="width:auto;padding:6px 8px;font-size:12px;flex-shrink:0">
          <option value="admin" ${u.role==='admin'?'selected':''}>👑 Admin</option>
          <option value="nurse-write" ${u.role==='nurse-write'?'selected':''}>✍️ Inf. (R+W)</option>
          <option value="nurse-read" ${u.role==='nurse-read'?'selected':''}>👁 Inf. (solo lettura)</option>
        </select>` : ''}
      </div>`;
    });
    html += '</div>';
    placeholder.innerHTML = html;
  } catch(e) {
    const ph = g('users-sec-placeholder');
    if (ph) ph.innerHTML = '';
  }
}

// ── PAGE: Patients ──────────────────────────────────────────
function renderPatients() {
  const op = activeOp();

  // Top bar
  document.getElementById('bar-patients').innerHTML = `
    <div style="flex:1">
      <div style="font-size:22px;font-weight:800">${T('Pazienti','Patients')}</div>
      <div style="font-size:13px;color:var(--t2)">${_fbFacilityName ? `🏥 ${escHtml(_fbFacilityName)}` : T('Gestisci pazienti e medicinali','Manage patients and medicines')}</div>
    </div>
    <div class="bar-icons">
      <button class="ib" onclick="navigate('search')" title="Ricerca">${svgIcon('ic-search')}</button>
      <button class="ib" onclick="navigate('calendar')" title="Calendario">${svgIcon('ic-cal')}</button>
    </div>`;

  // Content
  let patients = [...D.patients];

  // Search filter
  const q = S.search.toLowerCase();
  if (q) {
    patients = patients.filter(p => {
      return p.name.toLowerCase().includes(q) ||
        (p.room||'').toLowerCase().includes(q) ||
        (p.doctor?.name||'').toLowerCase().includes(q);
    });
  }

  // Alert filter
  if (S.filterAlerts) patients = patients.filter(p => hasAlert(p));

  // Sort
  if (S.sort === 'nome') patients.sort((a,b) => a.name.localeCompare(b.name));
  else if (S.sort === 'stanza') patients.sort((a,b) => (a.room||'').localeCompare(b.room||''));
  else if (S.sort === 'avvisi') patients.sort((a,b) => (hasAlert(b)?1:0)-(hasAlert(a)?1:0));

  let html = `
    <button class="op-selector" onclick="showOpDropdown()">
      <span class="op-dot" style="background:${op.color}"></span>
      <span>${T('Operatore attivo','Active operator')}: <strong>${escHtml(op.name)}</strong></span>
      <span class="op-arrow">▾</span>
    </button>

    <div class="search-wrap">
      ${svgIcon('ic-search', 16)}
      <input class="search-inp" id="patients-search-inp" placeholder="${T('Cerca per nome, stanza o medico...','Search by name, room or doctor...')}"
        value="${escHtml(S.search)}"
        oninput="S.search=this.value;renderPatientsList()">
    </div>

    <div class="pills">
      <span class="pill-label">${T('Ordina:','Sort:')}</span>
      <button class="pill ${S.sort==='nome'?'active':''}" onclick="S.sort='nome';renderPatientsList()">${T('Nome','Name')}</button>
      <button class="pill ${S.sort==='stanza'?'active':''}" onclick="S.sort='stanza';renderPatientsList()">${T('Stanza','Room')}</button>
      <button class="pill ${S.sort==='avvisi'?'active':''}" onclick="S.sort='avvisi';renderPatientsList()">${T('Avvisi','Alerts')}</button>
      <button class="pill ${S.filterAlerts?'active':''}" onclick="S.filterAlerts=!S.filterAlerts;renderPatientsList()" style="margin-left:auto">${T('Solo avvisi','Only alerts')}</button>
    </div>

    <div id="patients-list"></div>`;

  document.getElementById('content-patients').innerHTML = html;
  const patFab = document.querySelector('#page-patients .fab');
  if (patFab) patFab.style.display = canEdit() ? '' : 'none';
  renderPatientsList();
}

function renderPatientsList() {
  const el = document.getElementById('patients-list');
  if (!el) return;
  let patients = [...D.patients];
  const q = S.search.toLowerCase();
  if (q) {
    patients = patients.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.room||'').toLowerCase().includes(q) ||
      (p.doctor?.name||'').toLowerCase().includes(q)
    );
  }
  if (S.filterAlerts) patients = patients.filter(p => hasAlert(p));
  if (S.sort === 'nome') patients.sort((a,b) => a.name.localeCompare(b.name));
  else if (S.sort === 'stanza') patients.sort((a,b) => (a.room||'').localeCompare(b.room||''));
  else if (S.sort === 'avvisi') patients.sort((a,b) => (hasAlert(b)?1:0)-(hasAlert(a)?1:0));

  let html = '';

  // Patients list
  if (patients.length === 0) {
    html += `<div class="empty">${T('Nessun paziente trovato','No patients found')}</div>`;
  } else {
    patients.forEach(pt => {
      const alert = hasAlert(pt);
      const nMeds = (pt.medicines||[]).length;
      const nextEnd = nextEndDate(pt);
      html += `<div class="patient-card ${alert?'has-alert':''}" onclick="navigate('patient-detail',{patientId:'${pt.id}'})">
        <div class="avatar">${escHtml(pt.name[0].toUpperCase())}</div>
        <div class="patient-info">
          <div class="patient-name-row">
            <span class="patient-name">${escHtml(pt.name)}</span>
            ${pt.room ? `<span class="badge">${escHtml(pt.room)}</span>` : ''}
            ${alert ? `<span class="warn-icon">${svgIcon('ic-clock',14)}</span>` : ''}
          </div>
          <div class="patient-sub">
            ${nMeds === 0 ? T('Nessun medicinale','No medicines') :
              `${nMeds} ${T(nMeds===1?'medicinale':'medicinali',nMeds===1?'medicine':'medicines')}${nextEnd ? ' • ' + T('prossima fine','next end') + ' ' + fmtDate(nextEnd) : ''}`}
          </div>
        </div>
        ${svgIcon('ic-chevron', 18)}
      </div>`;
    });
  }

  el.innerHTML = html;
}

function showOpDropdown() {
  const ops = D.operators;
  let html = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:50;display:flex;align-items:flex-end" onclick="closeModal()">
    <div style="background:var(--sur);width:100%;border-radius:20px 20px 0 0;padding:16px;max-height:60vh;overflow-y:auto" onclick="event.stopPropagation()">
      <div style="font-size:16px;font-weight:700;margin-bottom:14px">${T('Seleziona operatore','Select operator')}</div>`;
  ops.forEach(op => {
    const active = op.id === D.settings.activeOperatorId;
    html += `<div onclick="setActiveOp('${op.id}')" style="display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid var(--br);cursor:pointer">
      <span style="width:14px;height:14px;border-radius:50%;background:${op.color};display:inline-block"></span>
      <span style="flex:1;font-size:15px;font-weight:${active?'700':'400'}">${escHtml(op.name)}</span>
      ${active ? `<span style="color:var(--p);font-size:13px;font-weight:600">✓ ${T('Attivo','Active')}</span>` : ''}
    </div>`;
  });
  html += `</div></div>`;
  showModal(html);
}

function setActiveOp(id) {
  D.settings.activeOperatorId = id;
  save();
  closeModal();
  renderPatients();
}

// ── PAGE: Patient Detail ────────────────────────────────────
function renderPatientDetail() {
  const pt = getPatient();
  if (!pt) { navigate('patients'); return; }

  document.getElementById('bar-patient-detail').innerHTML = `
    <button class="bar-back" onclick="navigate('patients')">${svgIcon('ic-arrow-left', 22)}</button>
    <span class="bar-title">${escHtml(pt.name)}</span>
    <div class="bar-icons">
      <button class="ib" onclick="sharePatient('${pt.id}')" title="Condividi">${svgIcon('ic-share')}</button>
      <button class="ib" onclick="printPatient('${pt.id}')" title="Stampa">${svgIcon('ic-print')}</button>
      ${canEdit() ? `<button class="ib" onclick="navigate('add-patient',{editMode:true})" title="Modifica">${svgIcon('ic-edit')}</button>` : ''}
      ${canEdit() ? `<button class="ib" style="color:var(--r)" onclick="confirmDeletePatient('${pt.id}')" title="Elimina">${svgIcon('ic-trash')}</button>` : ''}
    </div>`;

  const meds = pt.medicines || [];
  const visits = pt.visits || [];
  const pastVisits = visits.filter(v => new Date(v.date) < new Date()).sort((a,b) => b.date.localeCompare(a.date));
  const futureVisits = visits.filter(v => new Date(v.date) >= new Date()).sort((a,b) => a.date.localeCompare(b.date));

  let html = `
    <div class="det-header">
      <div class="det-avatar">${escHtml(pt.name[0].toUpperCase())}</div>
      <div>
        <div class="det-name">${escHtml(pt.name)}</div>
        <div class="det-room">${svgIcon('ic-home',13)} ${T('Stanza','Room')} ${escHtml(pt.room||'—')}</div>
      </div>
    </div>`;

  html += `<button class="btn-primary" style="margin:0 0 12px" onclick="showNotifyModal('${pt.id}')">📣 ${T('Avvisa familiare / medico','Notify family / doctor')}</button>`;

  if (pt.allergies) {
    html += `<div class="allergy-box">${svgIcon('ic-clock',14)} <strong>${T('Note / allergie:','Notes / allergies:')}</strong> ${escHtml(pt.allergies)}</div>`;
  }

  // Doctor
  if (pt.doctor?.name) {
    html += `<div class="contact-card">
      <span class="contact-role">${T('MEDICO','DOCTOR')}</span>
      <div class="contact-name">${svgIcon('ic-user',15)} ${escHtml(pt.doctor.name)}</div>
      ${pt.doctor.phone ? `<div class="contact-row">${svgIcon('ic-phone',14)} <a href="tel:${escHtml(pt.doctor.phone)}">${escHtml(pt.doctor.phone)}</a></div>` : ''}
      ${pt.doctor.email ? `<div class="contact-row">${svgIcon('ic-mail',14)} <a href="mailto:${escHtml(pt.doctor.email)}">${escHtml(pt.doctor.email)}</a></div>` : ''}
    </div>`;
  }

  // Family
  if (pt.family?.name) {
    html += `<div class="contact-card">
      <span class="contact-role">${T('FAMILIARE','FAMILY')}</span>
      <div class="contact-name">${svgIcon('ic-users',15)} ${escHtml(pt.family.name)}</div>
      ${pt.family.phone ? `<div class="contact-row">${svgIcon('ic-phone',14)} <a href="tel:${escHtml(pt.family.phone)}">${escHtml(pt.family.phone)}</a></div>` : ''}
      ${pt.family.email ? `<div class="contact-row">${svgIcon('ic-mail',14)} <a href="mailto:${escHtml(pt.family.email)}">${escHtml(pt.family.email)}</a></div>` : ''}
    </div>`;
  }

  // Visits
  html += `<div class="section-box">
    <div class="section-box-hd">
      <span class="section-box-title">${T('Visite e appuntamenti','Visits & appointments')} ${visits.length}</span>
    </div>`;

  if (futureVisits.length > 0) {
    html += `<div class="sub-label">${T('PROSSIME','UPCOMING')}</div>`;
    futureVisits.forEach(v => { html += visitItem(v); });
  }
  if (pastVisits.length > 0) {
    html += `<div class="sub-label">${T('PASSATE','PAST')}</div>`;
    pastVisits.forEach(v => { html += visitItem(v); });
  }
  if (visits.length === 0) html += `<div class="empty" style="padding:16px 0">${T('Nessuna visita','No visits')}</div>`;
  if (canEdit()) html += `<button class="add-med-btn" onclick="navigate('add-visit')">+ ${T('Aggiungi visita','Add visit')}</button>`;
  html += `</div>`;

  // Medicines
  html += `<div class="section-box">
    <div class="section-box-hd">
      <span class="section-box-title">${T('Medicinali','Medicines')} ${meds.length}</span>
    </div>`;

  meds.forEach(med => {
    const st = getMedStatus(med);
    const dpd = dosePerDay(med);
    html += `<div class="med-item" onclick="showMedDetail('${med.id}')">
      <div class="med-icon ${st.cls==='low'||st.cls==='expired'?'low':''}">${getFmtIcon(med.format)}</div>
      <div class="med-info">
        <div class="med-name">${escHtml(med.name)}</div>
        <div class="med-sub">${medFmtLabel(med)||''}${med.monthDays&&med.monthDays.length>0?' · '+formatMonthDays(med.monthDays):med.days&&med.days.length>0&&med.days.length<7?' · '+formatDays(med.days):''}${formatSchedule(med)?' · '+formatSchedule(med):dpd?' · '+dpd+'/'+T('giorno','day'):''}</div>
      </div>
      <span class="med-status ${st.cls}">${st.label}</span>
      ${svgIcon('ic-chevron', 16)}
    </div>`;
  });

  if (meds.length === 0) html += `<div class="empty" style="padding:16px 0">${T('Nessun medicinale','No medicines')}</div>`;
  if (canEdit()) html += `<button class="add-med-btn" onclick="navigate('add-med',{medId:null})">+ ${T('Aggiungi medicinale','Add medicine')}</button>`;
  html += `</div>`;

  document.getElementById('content-patient-detail').innerHTML = html;
}

function visitItem(v) {
  const d = new Date(v.date);
  const day = d.getDate();
  const mon = MONTHS_SHORT_IT[d.getMonth()];
  return `<div class="visit-item">
    <div class="visit-date-box">
      <div class="visit-day">${day}</div>
      <div class="visit-month">${mon}</div>
    </div>
    <div class="visit-info">
      <div class="visit-title">${escHtml(v.title)}</div>
      <div class="visit-sub">${fmtDatetime(v.date)}${v.location?' • '+escHtml(v.location):''}</div>
      ${v.notes ? `<div class="visit-notes">${escHtml(v.notes)}</div>` : ''}
    </div>
    ${canEdit() ? `<button class="ib" onclick="event.stopPropagation();confirmDeleteVisit('${v.id}')">${svgIcon('ic-trash',16)}</button>` : ''}
  </div>`;
}

function showMedDetail(medId) {
  const pt = getPatient();
  const med = (pt?.medicines||[]).find(m => m.id === medId);
  if (!med) return;
  const st = getMedStatus(med);
  const dpd = dosePerDay(med);
  const schedStr = formatSchedule(med);
  const restocks = med.restocks || [];

  let restockLog = '';
  if (restocks.length > 0) {
    restockLog = `<div style="margin-top:6px;border-top:1px solid var(--br);padding-top:8px">`;
    restocks.forEach(r => {
      restockLog += `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px">
        <span style="color:${r.qty < 0 ? 'var(--r)' : 'var(--p)'};font-weight:700">${r.qty > 0 ? '+' : ''}${r.qty}</span>
        <span style="color:var(--t2)">${fmtDate(r.date)}${r.note ? ' · ' + escHtml(r.note) : ''}</span>
        ${canEdit() ? `<button onclick="deleteRestock('${medId}','${r.id}')" style="margin-left:auto;background:none;border:none;color:var(--t3);font-size:16px;cursor:pointer">×</button>` : ''}
      </div>`;
    });
    restockLog += `</div>`;
  }

  const html = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:50;display:flex;align-items:flex-end" onclick="closeModal()">
    <div style="background:var(--sur);width:100%;border-radius:20px 20px 0 0;padding:20px;max-height:85vh;overflow-y:auto" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <div class="med-icon" style="width:44px;height:44px;font-size:18px">${getFmtIcon(med.format)}</div>
        <div>
          <div style="font-size:18px;font-weight:700">${escHtml(med.name)}</div>
          <div style="font-size:13px;color:var(--t2)">${medFmtLabel(med)}</div>
        </div>
        ${canEdit() ? `<div style="margin-left:auto;display:flex;gap:6px">
          <button class="ib" onclick="closeModal();navigate('add-med',{medId:'${med.id}'})">${svgIcon('ic-edit')}</button>
          <button class="ib" style="color:var(--r)" onclick="closeModal();confirmDeleteMed('${med.id}')">${svgIcon('ic-trash')}</button>
        </div>` : ''}
      </div>

      ${schedStr ? `<div style="font-size:14px;margin-bottom:8px"><strong>${T('Orari:','Schedule:')}</strong> ${schedStr}</div>` : ''}
      ${dpd ? `<div style="font-size:14px;margin-bottom:8px"><strong>${T('Totale/giorno:','Per day:')}</strong> ${dpd}</div>` : ''}
      ${med.monthDays&&med.monthDays.length>0 ? `<div style="font-size:14px;margin-bottom:8px"><strong>${T('Giorni:','Days:')}</strong> ${formatMonthDays(med.monthDays)}</div>` : med.days&&med.days.length>0&&med.days.length<7 ? `<div style="font-size:14px;margin-bottom:8px"><strong>${T('Giorni:','Days:')}</strong> ${formatDays(med.days)}</div>` : ''}
      ${med.startDate ? `<div style="font-size:14px;margin-bottom:8px"><strong>${T('Inizio:','Start:')}</strong> ${fmtDate(med.startDate)}</div>` : ''}
      ${med.endDate ? `<div style="font-size:14px;margin-bottom:8px"><strong>${T('Fine prevista:','Expected end:')}</strong> ${fmtDate(med.endDate)}</div>` : ''}
      ${med.expiry ? (() => { const ex = expiryStatus(med.expiry); return `<div style="font-size:14px;margin-bottom:8px"><strong>${T('Scadenza confezione:','Box expiry:')}</strong> <span style="${ex && ex.cls !== 'ok' ? 'color:var(--r);font-weight:700' : ''}">${fmtExpiry(med.expiry)}${ex && ex.cls !== 'ok' ? ' ⏰ ' + ex.label : ''}</span></div>`; })() : ''}

      ${med.totalQty != null ? `
      <div style="background:var(--bg);border-radius:10px;padding:10px 12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
          <strong style="font-size:14px">${T('Pastiglie totali:','Total pills:')}</strong>
          <span style="font-size:18px;font-weight:800;color:var(--p)">${med.totalQty}</span>
        </div>
        ${restockLog}
        ${canEdit() ? `<button onclick="showRestockForm('${med.id}')" style="width:100%;margin-top:10px;padding:9px;border:1.5px dashed var(--p);border-radius:10px;background:none;color:var(--p);font-size:14px;font-weight:600;cursor:pointer">+ ${T('Aggiungi pastiglie','Add pills')}</button>` : ''}
      </div>` : canEdit() ? `
      <button onclick="showRestockForm('${med.id}')" style="width:100%;margin-bottom:10px;padding:9px;border:1.5px dashed var(--p);border-radius:10px;background:none;color:var(--p);font-size:14px;font-weight:600;cursor:pointer">
        + ${T('Aggiungi pastiglie','Add pills')}
      </button>` : ''}

      <div style="padding:10px;border-radius:10px;background:${st.cls==='expired'?'#fff5f5':st.cls==='low'?'var(--wl)':'var(--pl)'}">
        <span style="font-size:14px;font-weight:600;color:${st.cls==='expired'?'var(--r)':st.cls==='low'?'var(--w)':'var(--p)'}">${st.label||T('In corso','Ongoing')}</span>
      </div>
    </div>
  </div>`;
  showModal(html);
}

function showRestockForm(medId) {
  const pt = getPatient();
  const med = (pt?.medicines||[]).find(m => m.id === medId);
  if (!med) return;

  const overlay = document.createElement('div');
  overlay.id = 'restock-overlay';
  overlay.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;display:flex;align-items:flex-end" onclick="closeRestockForm()">
      <div style="background:var(--sur);width:100%;border-radius:20px 20px 0 0;padding:20px;max-width:600px;margin:0 auto" onclick="event.stopPropagation()">
        <div style="font-size:17px;font-weight:700;margin-bottom:16px">
          + ${T('Aggiungi pastiglie','Add pills')} — ${escHtml(med.name)}
        </div>
        <div class="form-group">
          <label class="form-label">${T('Quante pastiglie aggiungi?','How many pills to add?')}</label>
          <input class="form-input" id="f-restock-qty" type="number" min="1" step="1"
            placeholder="${T('es. 28','e.g. 28')}" style="font-size:22px;font-weight:700;text-align:center">
        </div>
        <div class="form-group">
          <label class="form-label">${T('Scadenza della confezione (opzionale)','Box expiry (optional)')}</label>
          <input class="form-input" id="f-restock-expiry" type="month">
        </div>
        <div class="form-group">
          <label class="form-label">${T('Note (opzionale)','Notes (optional)')}</label>
          <input class="form-input" id="f-restock-note"
            placeholder="${T('es. portate da Mario, acquistato in farmacia...','e.g. brought by Mario, bought at pharmacy...')}">
        </div>
        <button class="btn-primary" onclick="saveRestock('${medId}')">${T('Aggiungi','Add')}</button>
        <button class="btn-secondary" onclick="closeRestockForm()">${T('Annulla','Cancel')}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => document.getElementById('f-restock-qty')?.focus(), 100);
}

function closeRestockForm() {
  document.getElementById('restock-overlay')?.remove();
}

function saveRestock(medId) {
  const qty = parseFloat(document.getElementById('f-restock-qty')?.value);
  if (!qty || qty <= 0) { alert(T('Inserisci una quantità valida','Enter a valid quantity')); return; }
  const note = document.getElementById('f-restock-note')?.value.trim() || '';

  const pt = getPatient();
  const med = (pt?.medicines||[]).find(m => m.id === medId);
  if (!med) return;

  if (!med.restocks) med.restocks = [];
  med.restocks.push({ id: uid(), qty, note, date: new Date().toISOString() });
  med.totalQty = (med.totalQty || 0) + qty;
  const rexp = document.getElementById('f-restock-expiry')?.value;
  if (rexp && (!med.expiry || rexp < med.expiry)) med.expiry = rexp;
  recalcMedEnd(med);
  logMove(T('Carico','Load'), med.name, qty, '👤 ' + pt.name);

  save();
  closeRestockForm();
  closeModal();
  showMedDetail(medId);
}

function deleteRestock(medId, restockId) {
  const pt = getPatient();
  const med = (pt?.medicines||[]).find(m => m.id === medId);
  if (!med || !med.restocks) return;
  const r = med.restocks.find(x => x.id === restockId);
  if (!r) return;
  med.totalQty = Math.max(0, (med.totalQty || 0) - r.qty);
  med.restocks = med.restocks.filter(x => x.id !== restockId);
  recalcMedEnd(med);
  save();
  closeModal();
  showMedDetail(medId);
}

function formatMonthDays(monthDays) {
  if (!monthDays || monthDays.length === 0) return '';
  const sorted = [...monthDays].sort((a,b)=>a-b);
  return T(`Ogni mese: ${sorted.join(', ')}`, `Monthly: ${sorted.join(', ')}`);
}

function formatDays(days) {
  if (!days || days.length === 0) return T('Ogni giorno','Every day');
  if (days.length === 7) return T('Ogni giorno','Every day');
  return days.map(i => DAYS_IT[i]).join(', ');
}

function confirmDeletePatient(id) {
  closeModal();
  const html = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px" onclick="closeModal()">
    <div style="background:var(--sur);border-radius:16px;padding:24px;width:100%;max-width:340px" onclick="event.stopPropagation()">
      <div style="font-size:17px;font-weight:700;margin-bottom:8px">${T('Elimina paziente','Delete patient')}</div>
      <div style="font-size:14px;color:var(--t2);margin-bottom:20px">${T('Tutti i dati del paziente verranno eliminati. Questa azione non è reversibile.','All patient data will be deleted. This action cannot be undone.')}</div>
      <button class="btn-danger" onclick="deletePatient('${id}')">${T('Elimina','Delete')}</button>
      <button class="btn-secondary" onclick="closeModal()">${T('Annulla','Cancel')}</button>
    </div>
  </div>`;
  showModal(html);
}

function deletePatient(id) {
  D.patients = D.patients.filter(p => p.id !== id);
  save();
  closeModal();
  navigate('home');
}

function confirmDeleteVisit(visitId) {
  const pt = getPatient();
  if (!pt) return;
  closeModal();
  const html = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px" onclick="closeModal()">
    <div style="background:var(--sur);border-radius:16px;padding:24px;width:100%;max-width:340px" onclick="event.stopPropagation()">
      <div style="font-size:17px;font-weight:700;margin-bottom:8px">${T('Elimina visita','Delete visit')}</div>
      <button class="btn-danger" onclick="deleteVisit('${visitId}')">${T('Elimina','Delete')}</button>
      <button class="btn-secondary" onclick="closeModal()">${T('Annulla','Cancel')}</button>
    </div>
  </div>`;
  showModal(html);
}

function deleteVisit(visitId) {
  const pt = getPatient();
  if (pt) pt.visits = (pt.visits||[]).filter(v => v.id !== visitId);
  save();
  closeModal();
  renderPatientDetail();
}

function confirmDeleteMed(medId) {
  const html = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px" onclick="closeModal()">
    <div style="background:var(--sur);border-radius:16px;padding:24px;width:100%;max-width:340px" onclick="event.stopPropagation()">
      <div style="font-size:17px;font-weight:700;margin-bottom:8px">${T('Elimina medicinale','Delete medicine')}</div>
      <button class="btn-danger" onclick="deleteMed('${medId}')">${T('Elimina','Delete')}</button>
      <button class="btn-secondary" onclick="closeModal()">${T('Annulla','Cancel')}</button>
    </div>
  </div>`;
  showModal(html);
}

function deleteMed(medId) {
  const pt = getPatient();
  if (pt) pt.medicines = (pt.medicines||[]).filter(m => m.id !== medId);
  save();
  closeModal();
  renderPatientDetail();
}

// ── PAGE: Add/Edit Patient ──────────────────────────────────
function renderAddPatient() {
  const pt = S.editMode ? getPatient() : null;
  const title = pt ? T('Modifica paziente','Edit patient') : T('Nuovo paziente','New patient');

  document.getElementById('bar-add-patient').innerHTML = `
    <button class="bar-back" onclick="back()">${svgIcon('ic-arrow-left', 22)}</button>
    <span class="bar-title">${title}</span>`;

  const v = pt || {};
  const doc = v.doctor || {};
  const fam = v.family || {};

  document.getElementById('content-add-patient').innerHTML = `
    <div class="form-group">
      <label class="form-label">${T('Nome paziente *','Patient name *')}</label>
      <input class="form-input" id="f-name" placeholder="${T('es. Mario Rossi','e.g. Mario Rossi')}" value="${escHtml(v.name||'')}">
    </div>
    <div class="form-group">
      <label class="form-label">${T('Stanza','Room')}</label>
      <input class="form-input" id="f-room" placeholder="${T('es. 103 A','e.g. 103 A')}" value="${escHtml(v.room||'')}">
    </div>
    <div class="form-group">
      <label class="form-label">${T('Allergie / Note','Allergies / Notes')}</label>
      <textarea class="form-input" id="f-allergies" placeholder="${T('es. Penicilina, lattosio...','e.g. Penicillin, lactose...')}">${escHtml(v.allergies||'')}</textarea>
    </div>

    <div class="form-section">${T('MEDICO CURANTE','ATTENDING PHYSICIAN')}</div>
    <div class="form-group">
      <label class="form-label">${T('Nome','Name')}</label>
      <input class="form-input" id="f-doc-name" value="${escHtml(doc.name||'')}" placeholder="${T('Dott. Rossi','Dr. Rossi')}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">${T('Telefono','Phone')}</label>
        <input class="form-input" id="f-doc-phone" type="tel" value="${escHtml(doc.phone||'')}">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="f-doc-email" type="email" value="${escHtml(doc.email||'')}">
      </div>
    </div>

    <div class="form-section">${T('FAMILIARE DI RIFERIMENTO','FAMILY CONTACT')}</div>
    <div class="form-group">
      <label class="form-label">${T('Nome','Name')}</label>
      <input class="form-input" id="f-fam-name" value="${escHtml(fam.name||'')}" placeholder="${T('es. Figlio Luigi','e.g. Son Luigi')}">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">${T('Telefono','Phone')}</label>
        <input class="form-input" id="f-fam-phone" type="tel" value="${escHtml(fam.phone||'')}">
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" id="f-fam-email" type="email" value="${escHtml(fam.email||'')}">
      </div>
    </div>

    <button class="btn-primary" onclick="savePatient(${pt?`'${pt.id}'`:null})">${T('Salva paziente','Save patient')}</button>
    ${pt ? `<button class="btn-danger" onclick="confirmDeletePatient('${pt.id}')">${T('Elimina paziente','Delete patient')}</button>` : ''}
  `;
}

function savePatient(existingId) {
  const name = g('f-name').value.trim();
  if (!name) { alert(T('Inserisci il nome del paziente','Enter patient name')); return; }
  const op = activeOp();
  const now = new Date().toISOString();

  if (existingId) {
    const pt = getPatient(existingId);
    Object.assign(pt, {
      name,
      room: g('f-room').value.trim(),
      allergies: g('f-allergies').value.trim(),
      doctor: { name: g('f-doc-name').value.trim(), phone: g('f-doc-phone').value.trim(), email: g('f-doc-email').value.trim() },
      family: { name: g('f-fam-name').value.trim(), phone: g('f-fam-phone').value.trim(), email: g('f-fam-email').value.trim() },
      updatedAt: now,
      updatedBy: op.name
    });
  } else {
    D.patients.push({
      id: uid(), name,
      room: g('f-room').value.trim(),
      allergies: g('f-allergies').value.trim(),
      doctor: { name: g('f-doc-name').value.trim(), phone: g('f-doc-phone').value.trim(), email: g('f-doc-email').value.trim() },
      family: { name: g('f-fam-name').value.trim(), phone: g('f-fam-phone').value.trim(), email: g('f-fam-email').value.trim() },
      medicines: [], visits: [],
      createdAt: now, updatedAt: now, updatedBy: op.name
    });
    S.patientId = D.patients[D.patients.length - 1].id;
  }
  save();
  S.editMode = false;
  navigate('patient-detail');
}

// ── PAGE: Add/Edit Medicine ─────────────────────────────────
const PRESET_TIMES = ['06:00','08:00','10:00','12:00','14:00','16:00','18:00','20:00','22:00','00:00'];

let _medFormState = {
  format: '',
  customFormat: '',
  days: [0,1,2,3,4,5,6],
  monthDays: [],
  dayMode: 'week',
  endDate: '',
  schedule: []
};

function renderAddMed() {
  const pt = getPatient();
  const existing = S.medId ? (pt?.medicines||[]).find(m => m.id === S.medId) : null;
  const title = existing ? T('Modifica medicinale','Edit medicine') : T('Nuovo medicinale','New medicine');

  document.getElementById('bar-add-med').innerHTML = `
    <button class="bar-back" onclick="back()">${svgIcon('ic-arrow-left',22)}</button>
    <span class="bar-title">${title}</span>`;

  if (existing) {
    _medFormState = {
      format: existing.format || '',
      customFormat: existing.customFormat || '',
      days: existing.days != null ? [...existing.days] : [0,1,2,3,4,5,6],
      monthDays: existing.monthDays ? [...existing.monthDays] : [],
      dayMode: existing.monthDays && existing.monthDays.length > 0 ? 'month' : 'week',
      endDate: existing.endDate || '',
      schedule: existing.schedule ? [...existing.schedule] : convertDosageToSchedule(existing.dosage)
    };
  } else {
    _medFormState = { format: '', customFormat: '', days: [0,1,2,3,4,5,6], monthDays: [], dayMode: 'week', endDate: '', schedule: [] };
  }

  const v = existing || {};
  const alertDefault = D.settings.alertDays;

  document.getElementById('content-add-med').innerHTML = `
    <div class="form-group autocomplete">
      <label class="form-label">${T('Nome medicinale *','Medicine name *')}</label>
      <input class="form-input" id="f-med-name" placeholder="${T('es. Tachipirina 1000','e.g. Tachipirina 1000')}"
        value="${escHtml(v.name||'')}"
        oninput="showMedAutocomplete(this.value)"
        onblur="setTimeout(()=>closeMedAutocomplete(),200)">
      <div id="med-autocomplete" class="autocomplete-list" style="display:none"></div>
    </div>

    <div class="form-group">
      <label class="form-label">${T('Formato (opzionale)','Format (optional)')}</label>
      <div class="fmt-grid" id="fmt-grid">${buildFmtGrid()}</div>
    </div>

    <div class="form-group">
      <label class="form-label">${T('Orari e dosi','Schedule & doses')}</label>
      <div id="time-selector">${buildTimeSelector()}</div>
    </div>

    <div class="form-group">
      <label class="form-label">${T('Giorni di assunzione','Days of intake')}</label>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <button class="pill ${_medFormState.dayMode==='week'?'active':''}" onclick="setDayMode('week')">${T('Giorni settimana','Weekdays')}</button>
        <button class="pill ${_medFormState.dayMode==='month'?'active':''}" onclick="setDayMode('month')">${T('Giorni del mese','Month days')}</button>
      </div>
      <div id="days-selector">${buildDaysSelector()}</div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">${T('Data inizio *','Start date *')}</label>
        <input class="form-input" id="f-start" type="date" value="${v.startDate||todayISO()}" oninput="recalcEnd()">
      </div>
      <div class="form-group">
        <label class="form-label">${T('Quantità totale *','Total quantity *')}</label>
        <input class="form-input" id="f-qty" type="number" min="1" placeholder="es. 30" value="${v.totalQty||''}" oninput="recalcEnd()">
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">${T('Fine prevista (calcolata automaticamente)','Expected end (auto-calculated)')}</label>
      <input class="form-input" id="f-end" type="date" value="${_medFormState.endDate||v.endDate||''}" oninput="_medFormState.endDate=this.value">
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label">${T('Giorni di avviso scorte','Stock alert days')}</label>
        <input class="form-input" id="f-alert" type="number" min="0" placeholder="${alertDefault}" value="${v.alertDays!=null?v.alertDays:alertDefault}">
      </div>
      <div class="form-group">
        <label class="form-label">${T('Scadenza confezione','Box expiry')}</label>
        <input class="form-input" id="f-expiry" type="month" value="${v.expiry||''}">
      </div>
    </div>

    <button class="btn-primary" onclick="saveMed(${existing?`'${existing.id}'`:null})">${T('Salva medicinale','Save medicine')}</button>
  `;
}

function buildFmtGrid() {
  let html = FORMATS.map(f =>
    `<button class="fmt-btn ${_medFormState.format===f.id?'active':''}" onclick="selectFmt('${f.id}')">${f.icon} ${f.label}</button>`
  ).join('');
  if (_medFormState.format === 'altro') {
    html += `<div style="width:100%;margin-top:8px">
      <input class="form-input" id="f-custom-format"
        placeholder="${T('es. puff, ml, cerotto, inalazione...','e.g. puff, ml, patch, inhalation...')}"
        value="${escHtml(_medFormState.customFormat||'')}"
        oninput="_medFormState.customFormat=this.value">
    </div>`;
  }
  return html;
}

function buildDaysSelector() {
  if (_medFormState.dayMode === 'month') {
    const days31 = Array.from({length:31},(_,i)=>i+1);
    return `<div style="margin-bottom:6px">
      <button class="pill" onclick="selectMonthDays('bisettimanale')" style="font-size:11px;margin-right:4px;margin-bottom:4px">15+30</button>
      <button class="pill" onclick="selectMonthDays('quindicinale')" style="font-size:11px;margin-right:4px;margin-bottom:4px">1+15</button>
      <button class="pill" onclick="clearMonthDays()" style="font-size:11px;color:var(--r);border-color:var(--r);margin-bottom:4px">${T('Cancella','Clear')}</button>
    </div>
    <div class="days-grid" style="grid-template-columns:repeat(7,1fr)" id="days-grid">
      ${days31.map(d=>`<button class="day-btn ${_medFormState.monthDays.includes(d)?'active':''}" onclick="toggleMonthDay(${d})" style="font-size:12px">${d}</button>`).join('')}
    </div>
    <div style="font-size:12px;color:var(--t2);margin-top:6px">${_medFormState.monthDays.length>0?T(`Ogni mese: giorno ${[..._medFormState.monthDays].sort((a,b)=>a-b).join(', ')}`,`Monthly: day ${[..._medFormState.monthDays].sort((a,b)=>a-b).join(', ')}`):T('Seleziona i giorni del mese','Select days of the month')}</div>`;
  }
  return `<div style="margin-bottom:6px">
    <button class="pill ${_medFormState.days.length===7?'active':''}" onclick="setAllDays()">${T('Ogni giorno','Every day')}</button>
  </div>
  <div class="days-grid" id="days-grid">${DAYS_IT.map((day,i)=>`<button class="day-btn ${_medFormState.days.includes(i)?'active':''}" onclick="toggleDay(${i})">${day}</button>`).join('')}</div>`;
}

function setDayMode(mode) {
  _medFormState.dayMode = mode;
  document.getElementById('days-selector').innerHTML = buildDaysSelector();
  document.querySelectorAll('#content-add-med .pill').forEach(b => {
    if (b.textContent.includes(T('Giorni settimana','Weekdays'))) b.classList.toggle('active', mode==='week');
    if (b.textContent.includes(T('Giorni del mese','Month days'))) b.classList.toggle('active', mode==='month');
  });
  recalcEnd();
}

function toggleMonthDay(d) {
  const idx = _medFormState.monthDays.indexOf(d);
  if (idx >= 0) _medFormState.monthDays.splice(idx, 1);
  else _medFormState.monthDays.push(d);
  document.getElementById('days-selector').innerHTML = buildDaysSelector();
  recalcEnd();
}

function clearMonthDays() {
  _medFormState.monthDays = [];
  document.getElementById('days-selector').innerHTML = buildDaysSelector();
  recalcEnd();
}

function selectMonthDays(preset) {
  if (preset === 'bisettimanale') _medFormState.monthDays = [15, 30];
  else if (preset === 'quindicinale') _medFormState.monthDays = [1, 15];
  document.getElementById('days-selector').innerHTML = buildDaysSelector();
  recalcEnd();
}

function selectFmt(id) {
  _medFormState.format = id;
  document.getElementById('fmt-grid').innerHTML = buildFmtGrid();
}

function toggleDay(i) {
  const idx = _medFormState.days.indexOf(i);
  if (idx >= 0) _medFormState.days.splice(idx, 1);
  else _medFormState.days.push(i);
  _medFormState.days.sort();
  document.getElementById('days-selector').innerHTML = buildDaysSelector();
  recalcEnd();
}

function setAllDays() {
  _medFormState.days = [0,1,2,3,4,5,6];
  document.getElementById('days-selector').innerHTML = buildDaysSelector();
  recalcEnd();
}

// ── Time selector ───────────────────────────────────────────
function buildTimeSelector() {
  const sel = _medFormState.schedule.map(t => t.time);
  let html = '<div class="time-chip-grid">';
  PRESET_TIMES.forEach(t => {
    html += `<button class="time-chip ${sel.includes(t)?'active':''}" onclick="toggleTime('${t}')">${t}</button>`;
  });
  html += '</div>';

  if (_medFormState.schedule.length > 0) {
    const sorted = [..._medFormState.schedule].sort((a,b) => a.time.localeCompare(b.time));
    const total = sorted.reduce((s,t) => s + (t.qty||0), 0);
    html += '<div class="schedule-list">';
    sorted.forEach(entry => {
      html += `<div class="schedule-row">
        <span class="schedule-time">${entry.time}</span>
        <div class="qty-ctrl">
          <button onclick="changeScheduleQty('${entry.time}',-0.5)">−</button>
          <span>${entry.qty}</span>
          <button onclick="changeScheduleQty('${entry.time}',0.5)">+</button>
        </div>
        <span class="schedule-unit">${T('unità','units')}</span>
        <button class="schedule-del" onclick="removeScheduleTime('${entry.time}')">×</button>
      </div>`;
    });
    html += `<div style="text-align:right;font-size:13px;color:var(--t2);padding:8px 0">
      ${T('Totale:','Total:')} <strong>${total}</strong> ${T('al giorno','per day')}
    </div></div>`;
  }

  html += `<div style="display:flex;gap:8px;margin-top:8px">
    <input type="time" id="custom-time-input" class="form-input" style="flex:1">
    <button class="pill active" style="white-space:nowrap" onclick="addCustomTime()">+ ${T('Altro orario','Other time')}</button>
  </div>`;
  return html;
}

function toggleTime(time) {
  const idx = _medFormState.schedule.findIndex(t => t.time === time);
  if (idx >= 0) _medFormState.schedule.splice(idx, 1);
  else _medFormState.schedule.push({time, qty: 1});
  _medFormState.schedule.sort((a,b) => a.time.localeCompare(b.time));
  document.getElementById('time-selector').innerHTML = buildTimeSelector();
  recalcEnd();
}

function changeScheduleQty(time, delta) {
  const entry = _medFormState.schedule.find(t => t.time === time);
  if (entry) {
    entry.qty = Math.round(Math.max(0.5, entry.qty + delta) * 2) / 2;
    document.getElementById('time-selector').innerHTML = buildTimeSelector();
    recalcEnd();
  }
}

function removeScheduleTime(time) {
  _medFormState.schedule = _medFormState.schedule.filter(t => t.time !== time);
  document.getElementById('time-selector').innerHTML = buildTimeSelector();
  recalcEnd();
}

function addCustomTime() {
  const input = document.getElementById('custom-time-input');
  if (!input || !input.value) return;
  const time = input.value;
  if (!_medFormState.schedule.find(t => t.time === time)) {
    _medFormState.schedule.push({time, qty: 1});
    _medFormState.schedule.sort((a,b) => a.time.localeCompare(b.time));
  }
  input.value = '';
  document.getElementById('time-selector').innerHTML = buildTimeSelector();
  recalcEnd();
}

function recalcEnd() {
  const start = g('f-start')?.value;
  const qty = parseFloat(g('f-qty')?.value);
  const dpd = _medFormState.schedule.reduce((s, t) => s + (t.qty || 0), 0);
  if (!start || !qty || !dpd) return;
  const days = _medFormState.days.length === 7 ? null : _medFormState.days;
  const monthDays = _medFormState.dayMode === 'month' && _medFormState.monthDays.length > 0 ? _medFormState.monthDays : null;
  const end = computeEndDate(start, qty, dpd, monthDays ? null : days, monthDays);
  if (end) {
    g('f-end').value = end;
    _medFormState.endDate = end;
  }
}

function builtinMatch(b, q) {
  return b[0].toLowerCase().includes(q) || (b[3] && b[3].toLowerCase().includes(q));
}

function showMedAutocomplete(val) {
  const list = document.getElementById('med-autocomplete');
  if (!val || val.length < 1) { list.style.display='none'; return; }
  const q = val.toLowerCase();
  const custom = D.medicineDb.filter(m => m.name.toLowerCase().includes(q) || (m.fascia||'').includes(q));
  const builtinRaw = (typeof BUILTIN_MEDS !== 'undefined')
    ? BUILTIN_MEDS.filter(b => builtinMatch(b, q)).slice(0, 8 - Math.min(custom.length, 4))
    : [];
  if (custom.length === 0 && builtinRaw.length === 0) { list.style.display='none'; return; }
  const customHtml = custom.slice(0, 4).map(m =>
    `<div class="autocomplete-item" onclick="selectDbMed('${m.id}')">${escHtml(m.name)}${m.fascia ? ` <span style="font-size:11px;font-weight:700;color:var(--p)">${m.fascia}</span>` : ''} <span style="color:var(--t3);font-size:12px">${medFmtLabel(m)}</span></div>`
  ).join('');
  const builtinHtml = builtinRaw.map(b => {
    const idx = BUILTIN_MEDS.indexOf(b);
    const pa = b[3] ? ` <span style="color:var(--t3);font-size:11px">${escHtml(b[3])}</span>` : '';
    return `<div class="autocomplete-item" onclick="selectDbMed('b:${idx}')">${escHtml(b[0])}${pa} <span style="font-size:11px;font-weight:700;color:var(--p)">${b[2]}</span> <span style="color:var(--t3);font-size:12px">${b[1]||''}</span></div>`;
  }).join('');
  list.innerHTML = customHtml + builtinHtml;
  list.style.display = 'block';
}

function selectDbMed(id) {
  let m;
  if (typeof id === 'string' && id.startsWith('b:')) {
    const b = BUILTIN_MEDS[parseInt(id.slice(2))];
    if (!b) return;
    m = { name: b[0], format: b[1], customFormat: '', fascia: b[2] };
  } else {
    m = D.medicineDb.find(x => x.id === id);
  }
  if (!m) return;
  g('f-med-name').value = m.name;
  _medFormState.format = m.format || '';
  document.getElementById('fmt-grid').innerHTML = buildFmtGrid();
  closeMedAutocomplete();
}

function closeMedAutocomplete() {
  const el = document.getElementById('med-autocomplete');
  if (el) el.style.display = 'none';
}

function saveMed(existingId) {
  const name = g('f-med-name').value.trim();
  if (!name) { alert(T('Inserisci il nome del medicinale','Enter medicine name')); return; }
  const start = g('f-start').value;
  const qty = parseFloat(g('f-qty').value) || null;
  if (!start) { alert(T('Inserisci la data di inizio','Enter start date')); return; }

  const med = {
    id: existingId || uid(),
    name,
    format: _medFormState.format,
    customFormat: _medFormState.format === 'altro' ? _medFormState.customFormat.trim() : '',
    schedule: [..._medFormState.schedule],
    days: _medFormState.dayMode === 'week' && _medFormState.days.length < 7 ? [..._medFormState.days] : [],
    monthDays: _medFormState.dayMode === 'month' ? [..._medFormState.monthDays] : [],
    startDate: start,
    endDate: g('f-end').value || _medFormState.endDate || null,
    totalQty: qty,
    alertDays: parseInt(g('f-alert').value) || D.settings.alertDays,
    expiry: g('f-expiry')?.value || null,
    createdAt: existingId ? undefined : new Date().toISOString()
  };

  const pt = getPatient();
  if (!pt) return;
  if (existingId) {
    const idx = pt.medicines.findIndex(m => m.id === existingId);
    if (idx >= 0) {
      med.createdAt = pt.medicines[idx].createdAt;
      med.restocks = pt.medicines[idx].restocks || [];
      pt.medicines[idx] = med;
    }
  } else {
    pt.medicines.push(med);
  }
  save();
  navigate('patient-detail');
}

// ── PAGE: Add Visit ─────────────────────────────────────────
function renderAddVisit() {
  const pt = getPatient();
  const existing = S.visitId ? (pt?.visits||[]).find(v => v.id === S.visitId) : null;
  const title = existing ? T('Modifica visita','Edit visit') : T('Nuova visita','New visit');

  document.getElementById('bar-add-visit').innerHTML = `
    <button class="bar-back" onclick="back()">${svgIcon('ic-arrow-left',22)}</button>
    <span class="bar-title">${title}</span>`;

  const v = existing || {};
  const dtLocal = v.date ? new Date(v.date).toISOString().slice(0,16) : '';

  document.getElementById('content-add-visit').innerHTML = `
    <div class="form-group">
      <label class="form-label">${T('Titolo *','Title *')}</label>
      <input class="form-input" id="f-vtitle" placeholder="${T('es. Visita cardiologica','e.g. Cardiology visit')}" value="${escHtml(v.title||'')}">
    </div>
    <div class="form-group">
      <label class="form-label">${T('Data e ora *','Date & time *')}</label>
      <input class="form-input" id="f-vdate" type="datetime-local" value="${dtLocal}">
    </div>
    <div class="form-group">
      <label class="form-label">${T('Luogo','Location')}</label>
      <input class="form-input" id="f-vloc" placeholder="${T('es. Ospedale San Marco','e.g. San Marco Hospital')}" value="${escHtml(v.location||'')}">
    </div>
    <div class="form-group">
      <label class="form-label">${T('Note','Notes')}</label>
      <textarea class="form-input" id="f-vnotes" placeholder="${T('es. Portare esami del sangue','e.g. Bring blood tests')}">${escHtml(v.notes||'')}</textarea>
    </div>
    <button class="btn-primary" onclick="saveVisit(${existing?`'${existing.id}'`:null})">${T('Salva visita','Save visit')}</button>
    ${existing ? `<button class="btn-danger" onclick="confirmDeleteVisit('${existing.id}')">${T('Elimina visita','Delete visit')}</button>` : ''}
  `;
}

function saveVisit(existingId) {
  const title = g('f-vtitle').value.trim();
  const date = g('f-vdate').value;
  if (!title || !date) { alert(T('Inserisci titolo e data','Enter title and date')); return; }

  const visit = {
    id: existingId || uid(),
    title,
    date: new Date(date).toISOString(),
    location: g('f-vloc').value.trim(),
    notes: g('f-vnotes').value.trim(),
    createdAt: existingId ? undefined : new Date().toISOString()
  };

  const pt = getPatient();
  if (!pt) return;
  if (existingId) {
    const idx = (pt.visits||[]).findIndex(v => v.id === existingId);
    if (idx >= 0) { visit.createdAt = pt.visits[idx].createdAt; pt.visits[idx] = visit; }
  } else {
    if (!pt.visits) pt.visits = [];
    pt.visits.push(visit);
  }
  save();
  navigate('patient-detail');
}

// ── PAGE: Calendar ──────────────────────────────────────────
function renderCalendar() {
  document.getElementById('bar-calendar').innerHTML = `
    <button class="bar-back" onclick="back()">${svgIcon('ic-arrow-left',22)}</button>
    <span class="bar-title">${T('Calendario','Calendar')}</span>`;

  const d = S.calDate;
  const year = d.getFullYear();
  const month = d.getMonth();
  const today = new Date(); today.setHours(0,0,0,0);
  const sel = S.calSelected;

  // Build event map
  const eventMap = buildCalEventMap(year, month);

  // Calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  let startDow = (firstDay.getDay() + 6) % 7; // Mon=0
  let html = `
    <div style="display:flex;justify-content:center;margin-bottom:12px">
      <div class="cal-toggle">
        <button class="cal-tab ${S.calMode==='visite'?'active':''}" onclick="S.calMode='visite';renderCalendar()">${T('Visite','Visits')}</button>
        <button class="cal-tab ${S.calMode==='medicinali'?'active':''}" onclick="S.calMode='medicinali';renderCalendar()">${T('Medicinali','Medicines')}</button>
      </div>
    </div>
    <div class="cal-box">
      <div class="cal-nav">
        <button class="cal-nav-btn" onclick="calPrev()">&#8249;</button>
        <div class="cal-month">${MONTHS_IT[month]} ${year}</div>
        <button class="cal-nav-btn" onclick="calNext()">&#8250;</button>
      </div>
      <div class="cal-grid">`;

  DAYS_IT.forEach(d => { html += `<div class="cal-dow">${d}</div>`; });

  // Empty cells before first day
  for (let i = 0; i < startDow; i++) html += `<div class="cal-day other-month"></div>`;

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const thisDate = new Date(year, month, day);
    const isToday = thisDate.getTime() === today.getTime();
    const isSel = sel && thisDate.toDateString() === sel.toDateString();
    const dow = (thisDate.getDay() + 6) % 7;
    const isSat = dow === 5, isSun = dow === 6;
    const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const events = eventMap[dateKey] || [];

    html += `<div class="cal-day ${isToday?'today':''} ${isSel?'selected':''} ${isSat?'sat':''} ${isSun?'sun':''}" onclick="selectCalDay(${year},${month},${day})">
      <div class="cal-day-num">${day}</div>
      <div class="cal-dots">`;
    events.forEach(ev => { html += `<span class="cal-dot" style="background:${ev.color}"></span>`; });
    html += `</div></div>`;
  }

  html += `</div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div class="cal-legend">`;

  if (S.calMode === 'medicinali') {
    html += `<span class="cal-dot" style="background:var(--p)"></span>${T('Assunzione','Intake')}
             <span class="cal-dot" style="background:var(--r)"></span>${T('Ultimo giorno','Last day')}`;
  } else {
    html += `<span class="cal-dot" style="background:var(--p)"></span>${T('Visita','Visit')}`;
  }
  html += `</div><button class="cal-today-btn" onclick="goToday()">${T('Oggi','Today')}</button></div>
    </div>`;

  // Events for selected day
  if (sel) {
    const selKey = `${sel.getFullYear()}-${String(sel.getMonth()+1).padStart(2,'0')}-${String(sel.getDate()).padStart(2,'0')}`;
    const evs = eventMap[selKey] || [];
    const selLabel = `${DAYS_IT[(sel.getDay()+6)%7]} ${sel.getDate()} ${MONTHS_IT[sel.getMonth()]} ${sel.getFullYear()}`;
    html += `<div style="font-size:15px;font-weight:700;margin:14px 0 10px">${selLabel}</div>`;
    if (evs.length === 0) {
      html += `<div class="empty">${T('Nessun evento','No events')}</div>`;
    } else {
      evs.forEach(ev => {
        html += `<div class="cal-event" onclick="navigate('patient-detail',{patientId:'${ev.patientId}'})">
          <div class="cal-event-icon" style="border-color:${ev.color};color:${ev.color}">${ev.icon}</div>
          <div class="cal-event-info">
            <div class="cal-event-name">${escHtml(ev.name)}</div>
            <div class="cal-event-sub">${escHtml(ev.patientName)}${ev.room?' • '+T('Stanza','Room')+' '+escHtml(ev.room):''}${ev.sub?' • '+ev.sub:''}</div>
          </div>
        </div>`;
      });
    }
  }

  document.getElementById('content-calendar').innerHTML = html;
}

function buildCalEventMap(year, month) {
  const map = {};
  const addEv = (dateKey, ev) => {
    if (!map[dateKey]) map[dateKey] = [];
    map[dateKey].push(ev);
  };

  D.patients.forEach(pt => {
    if (S.calMode === 'visite') {
      (pt.visits||[]).forEach(v => {
        const d = new Date(v.date);
        if (d.getFullYear() === year && d.getMonth() === month) {
          const key = `${year}-${String(month+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          addEv(key, { color: 'var(--p)', icon: '📅', name: v.title, patientName: pt.name, room: pt.room, patientId: pt.id, sub: v.location });
        }
      });
    } else {
      (pt.medicines||[]).forEach(med => {
        if (!med.startDate) return;
        const start = new Date(med.startDate + 'T00:00:00');
        const end = med.endDate ? new Date(med.endDate + 'T00:00:00') : null;

        // Mark intake days in this month
        const firstOfMonth = new Date(year, month, 1);
        const lastOfMonth = new Date(year, month + 1, 0);
        const cur = new Date(Math.max(start, firstOfMonth));
        const weekDays = (med.days && med.days.length > 0 && med.days.length < 7) ? med.days : null;

        while (cur <= lastOfMonth && (!end || cur <= end)) {
          const dow = (cur.getDay() + 6) % 7;
          if (!weekDays || weekDays.includes(dow)) {
            const key = cur.toISOString().slice(0,10);
            const isLast = end && cur.toDateString() === end.toDateString();
            addEv(key, { color: isLast ? 'var(--r)' : 'var(--p)', icon: '💊', name: med.name, patientName: pt.name, room: pt.room, patientId: pt.id });
          }
          cur.setDate(cur.getDate() + 1);
        }
      });
    }
  });
  return map;
}

function selectCalDay(y, m, d) {
  S.calSelected = new Date(y, m, d);
  renderCalendar();
}

function calPrev() {
  S.calDate = new Date(S.calDate.getFullYear(), S.calDate.getMonth() - 1, 1);
  renderCalendar();
}

function calNext() {
  S.calDate = new Date(S.calDate.getFullYear(), S.calDate.getMonth() + 1, 1);
  renderCalendar();
}

function goToday() {
  S.calDate = new Date();
  S.calSelected = new Date();
  renderCalendar();
}

// ── PAGE: Medicine Database ─────────────────────────────────
function renderDb() {
  document.getElementById('bar-db').innerHTML = `
    <button class="bar-back" onclick="back()">${svgIcon('ic-arrow-left',22)}</button>
    <span class="bar-title">${T('Database medicinali','Medicine database')}</span>`;

  document.getElementById('content-db').innerHTML = `
    <div class="search-wrap">
      ${svgIcon('ic-search',16)}
      <input class="search-inp" id="db-search-inp" placeholder="${T('Cerca nel database...','Search database...')}"
        value="${escHtml(S.dbSearch)}"
        oninput="S.dbSearch=this.value;S.dbPage=0;renderDbList()">
    </div>
    <div id="db-list"></div>`;

  const dbFab = document.querySelector('#page-db .fab');
  if (dbFab) dbFab.style.display = canEdit() ? '' : 'none';
  renderDbList();
}

function fasciaBadge(f) {
  return f ? ` <span style="font-size:11px;font-weight:700;padding:1px 6px;border-radius:8px;background:var(--pl);color:var(--p);margin-left:4px">${f}</span>` : '';
}

function renderDbList() {
  const el = document.getElementById('db-list');
  if (!el) return;
  const q = S.dbSearch.toLowerCase().trim();

  // Custom medicines (user-added)
  const custom = D.medicineDb.filter(m => !q || m.name.toLowerCase().includes(q))
    .sort((a,b) => a.name.localeCompare(b.name));

  // Built-in medicines (SSN)
  const allBuiltin = (typeof BUILTIN_MEDS !== 'undefined')
    ? (q ? BUILTIN_MEDS.filter(b => builtinMatch(b, q)) : BUILTIN_MEDS)
    : [];
  const page = S.dbPage || 0;
  const PAGE_SIZE = 100;
  const builtin = allBuiltin.slice(0, (page + 1) * PAGE_SIZE);
  const hasMore = allBuiltin.length > builtin.length;

  if (custom.length === 0 && allBuiltin.length === 0) {
    el.innerHTML = `<div class="empty">${T('Nessun risultato','No results')}</div>`;
    return;
  }

  const customHtml = custom.length ? `
    <div style="font-size:11px;color:var(--t3);padding:8px 4px 4px;text-transform:uppercase;letter-spacing:.5px">${T('Aggiunti da te','Added by you')}</div>
    ${custom.map(m => `<div class="db-item">
      <div class="db-item-icon">${getFmtIcon(m.format)}</div>
      <div class="db-item-info">
        <div class="db-item-name">${escHtml(m.name)}${fasciaBadge(m.fascia)}</div>
        <div class="db-item-sub">${medFmtLabel(m)}</div>
      </div>
      ${canEdit() ? `<button class="edit-btn" onclick="navigate('add-db-med',{editDbMedId:'${m.id}'})">${svgIcon('ic-edit',18)}</button>` : ''}
      ${canEdit() ? `<button class="edit-btn" style="color:var(--r)" onclick="confirmDeleteDbMed('${m.id}')">${svgIcon('ic-trash',18)}</button>` : ''}
    </div>`).join('')}` : '';

  const builtinHtml = builtin.length ? `
    <div style="font-size:11px;color:var(--t3);padding:8px 4px 4px;text-transform:uppercase;letter-spacing:.5px">Database SSN (${allBuiltin.length.toLocaleString()} farmaci)</div>
    ${builtin.map(b => `<div class="db-item">
      <div class="db-item-icon">${getFmtIcon(b[1])}</div>
      <div class="db-item-info">
        <div class="db-item-name">${escHtml(b[0])}${fasciaBadge(b[2])}</div>
        <div class="db-item-sub">${b[1]||''}${b[3] ? ` · ${escHtml(b[3])}` : ''}</div>
      </div>
    </div>`).join('')}
    ${hasMore ? `<button class="btn-secondary" style="margin:12px 0" onclick="S.dbPage=(S.dbPage||0)+1;renderDbList()">Mostra altri ${Math.min(PAGE_SIZE, allBuiltin.length - builtin.length)} farmaci...</button>` : ''}
    ` : '';

  el.innerHTML = customHtml + builtinHtml;
}

function confirmDeleteDbMed(id) {
  const html = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px" onclick="closeModal()">
    <div style="background:var(--sur);border-radius:16px;padding:24px;width:100%;max-width:340px" onclick="event.stopPropagation()">
      <div style="font-size:17px;font-weight:700;margin-bottom:8px">${T('Elimina dal database','Delete from database')}</div>
      <div style="font-size:14px;color:var(--t2);margin-bottom:20px">${T('Vuoi rimuovere questo medicinale dal database?','Remove this medicine from the database?')}</div>
      <button class="btn-danger" onclick="deleteDbMed('${id}')">${T('Elimina','Delete')}</button>
      <button class="btn-secondary" onclick="closeModal()">${T('Annulla','Cancel')}</button>
    </div>
  </div>`;
  showModal(html);
}

function deleteDbMed(id) {
  D.medicineDb = D.medicineDb.filter(m => m.id !== id);
  save();
  closeModal();
  renderDb();
}

// ── PAGE: Add/Edit DB Medicine ──────────────────────────────
let _dbFmt = '';
let _dbCustomFmt = '';
let _dbFascia = '';

function renderAddDbMed() {
  const existing = S.editDbMedId ? D.medicineDb.find(m => m.id === S.editDbMedId) : null;
  const title = existing ? T('Modifica voce','Edit entry') : T('Nuova voce','New entry');

  document.getElementById('bar-add-db-med').innerHTML = `
    <button class="bar-back" onclick="navigate('db')">${svgIcon('ic-arrow-left',22)}</button>
    <span class="bar-title">${title}</span>`;

  _dbFmt = existing?.format || '';
  _dbCustomFmt = existing?.customFormat || '';

  document.getElementById('content-add-db-med').innerHTML = `
    <div class="form-group">
      <label class="form-label">${T('Nome medicinale','Medicine name')}</label>
      <input class="form-input" id="f-dbname" placeholder="${T('es. Tachipirina 1000','e.g. Tachipirina 1000')}" value="${escHtml(existing?.name||'')}">
      <div style="font-size:12px;color:var(--t2);margin-top:4px">${T('Verrà suggerito quando aggiungi un medicinale a un paziente','Will be suggested when adding a medicine to a patient')}</div>
    </div>
    <div class="form-group">
      <label class="form-label">${T('Formato (opzionale)','Format (optional)')}</label>
      <div class="fmt-grid" id="db-fmt-grid">${buildDbFmtGrid()}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Fascia SSN</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${['','A','C','H','SOP','OTC'].map(f => `<button class="pill ${(existing?.fascia||'')=== f?'active':''}" id="fascia-btn-${f||'none'}" onclick="selectDbFascia('${f}')">${f||'—'}</button>`).join('')}
      </div>
      <div style="font-size:12px;color:var(--t2);margin-top:4px">A = rimborsato SSN · C = a carico paziente · H = solo ospedale</div>
    </div>
    <button class="btn-primary" onclick="saveDbMed(${existing?`'${existing.id}'`:null})">${T('Salva nel database','Save to database')}</button>
    ${existing ? `<button class="btn-danger" onclick="confirmDeleteDbMed('${existing.id}')">${T('Elimina','Delete')}</button>` : ''}
  `;
  _dbFascia = existing?.fascia || '';
}

function buildDbFmtGrid() {
  let html = FORMATS.map(f =>
    `<button class="fmt-btn ${_dbFmt===f.id?'active':''}" onclick="selectDbFmt('${f.id}')">${f.icon} ${f.label}</button>`
  ).join('');
  if (_dbFmt === 'altro') {
    html += `<div style="width:100%;margin-top:8px">
      <input class="form-input" id="f-db-custom-format"
        placeholder="${T('es. puff, ml, cerotto...','e.g. puff, ml, patch...')}"
        value="${escHtml(_dbCustomFmt||'')}"
        oninput="_dbCustomFmt=this.value">
    </div>`;
  }
  return html;
}

function selectDbFmt(id) {
  _dbFmt = id;
  document.getElementById('db-fmt-grid').innerHTML = buildDbFmtGrid();
}

function selectDbFascia(f) {
  _dbFascia = f;
  ['','A','C','H','SOP','OTC'].forEach(x => {
    const btn = document.getElementById('fascia-btn-' + (x||'none'));
    if (btn) btn.classList.toggle('active', x === f);
  });
}

function saveDbMed(existingId) {
  const name = g('f-dbname').value.trim();
  if (!name) { alert(T('Inserisci il nome','Enter name')); return; }

  const customFmt = _dbFmt === 'altro' ? _dbCustomFmt.trim() : '';
  if (existingId) {
    const m = D.medicineDb.find(x => x.id === existingId);
    if (m) { m.name = name; m.format = _dbFmt; m.customFormat = customFmt; m.fascia = _dbFascia; }
  } else {
    D.medicineDb.push({ id: uid(), name, format: _dbFmt, customFormat: customFmt, fascia: _dbFascia });
  }
  save();
  navigate('db');
}

// ── PAGE: Settings ──────────────────────────────────────────
function renderSettings() {
  document.getElementById('bar-settings').innerHTML = `
    <button class="bar-back" onclick="back()">${svgIcon('ic-arrow-left',22)}</button>
    <span class="bar-title">${T('Impostazioni','Settings')}</span>
    <div class="bar-icons">
      <button class="ib" style="color:var(--r);font-size:12px;font-weight:700;padding:4px 8px" onclick="doLogout()">${T('Esci','Logout')}</button>
    </div>`;

  const lang = D.settings.language;
  const alertDays = D.settings.alertDays;
  const totalMeds = D.patients.reduce((s, p) => s + (p.medicines||[]).length, 0);
  const totalVisits = D.patients.reduce((s, p) => s + (p.visits||[]).length, 0);

  let opsHtml = '';
  D.operators.forEach(op => {
    const active = op.id === D.settings.activeOperatorId;
    opsHtml += `<div class="op-item">
      <span class="op-item-dot" style="background:${op.color}"></span>
      <span class="op-item-name">${escHtml(op.name)}</span>
      ${active ? `<span class="op-active-badge">✓ ${T('Attivo','Active')}</span>` :
        `<button class="op-set-btn" onclick="setActiveOp('${op.id}')">${T('Imposta attivo','Set active')}</button>`}
      ${!active ? `<button class="ib" style="color:var(--r)" onclick="deleteOp('${op.id}')">${svgIcon('ic-trash',16)}</button>` : ''}
    </div>`;
  });

  const colorSwatches = OP_COLORS.map((c, i) =>
    `<span class="color-swatch ${i===0?'active':''}" style="background:${c}" data-color="${c}" onclick="selectOpColor(this,'${c}')"></span>`
  ).join('');

  document.getElementById('content-settings').innerHTML = `
    <div class="settings-sec">
      <div class="settings-sec-title">${T('STRUMENTI','TOOLS')}</div>
      <div class="settings-row" onclick="showOrderModal()" style="cursor:pointer">
        <span class="settings-row-label">🛒 ${T('Ordine farmacia','Pharmacy order')}</span><span class="chevron">›</span>
      </div>
      <div class="settings-row" onclick="navigate('history')" style="cursor:pointer">
        <span class="settings-row-label">🕐 ${T('Storico movimenti','Movement history')}</span><span class="chevron">›</span>
      </div>
      <div class="settings-row" onclick="navigate('stats')" style="cursor:pointer">
        <span class="settings-row-label">📊 ${T('Statistiche consumi','Consumption stats')}</span><span class="chevron">›</span>
      </div>
      <div class="settings-row" onclick="printMonthlyReport()" style="cursor:pointer">
        <span class="settings-row-label">📄 ${T('Report mensile (PDF/stampa)','Monthly report')}</span><span class="chevron">›</span>
      </div>
    </div>

    <div class="settings-sec">
      <div class="settings-sec-title">${T('CONTATTI FARMACIA','PHARMACY CONTACTS')}</div>
      <div class="settings-sec-desc">${T('Usati per inviare gli ordini con un tocco','Used to send orders in one tap')}</div>
      <div class="settings-row">
        <span class="settings-row-label">✉️</span>
        <input class="form-input" style="flex:1;padding:8px 12px" type="email" placeholder="${T('email farmacia','pharmacy email')}"
          value="${escHtml(D.settings.pharmacyEmail || '')}" onchange="D.settings.pharmacyEmail=this.value.trim();save()">
      </div>
      <div class="settings-row">
        <span class="settings-row-label">💬</span>
        <input class="form-input" style="flex:1;padding:8px 12px" type="tel" placeholder="${T('WhatsApp farmacia (es. +39333...)','pharmacy WhatsApp')}"
          value="${escHtml(D.settings.pharmacyPhone || '')}" onchange="D.settings.pharmacyPhone=this.value.trim();save()">
      </div>
    </div>

    <div class="settings-sec">
      <div class="settings-sec-title">ACCOUNT</div>
      <div class="settings-row">
        <div style="flex:1">
          <div style="font-size:14px;font-weight:600">${escHtml(_fbUser?.email||'')}</div>
          <div style="font-size:12px;color:var(--t2);margin-top:2px">${ROLE_LABELS[_fbRole] || _fbRole}</div>
          ${_fbFacilityName ? `<div style="font-size:12px;color:var(--p);margin-top:1px">🏥 ${escHtml(_fbFacilityName)}</div>` : ''}
        </div>
        <button class="pill" style="color:var(--r);border-color:var(--r)" onclick="doLogout()">${T('Esci','Logout')}</button>
      </div>
    </div>

    <div class="settings-sec">
      <div class="settings-sec-title">${T('LINGUA','LANGUAGE')}</div>
      <div class="settings-sec-desc">${T('Scegli la lingua dell\'app.','Choose the app language.')}</div>
      <div class="lang-toggle">
        <button class="lang-btn ${lang==='it'?'active':''}" onclick="setLang('it')">Italiano</button>
        <button class="lang-btn ${lang==='en'?'active':''}" onclick="setLang('en')">English</button>
      </div>
      <div style="height:10px"></div>
    </div>

    ${canEdit() ? `<div class="settings-sec">
      <div class="settings-sec-title">${T('OPERATORI','OPERATORS')}</div>
      <div class="settings-sec-desc">${T('Ogni modifica viene contrassegnata con il nome dell\'operatore attivo.','Each change is marked with the active operator\'s name.')}</div>
      ${opsHtml}
      <div class="add-op-form">
        <div class="add-op-title">${T('Aggiungi operatore','Add operator')}</div>
        <input class="form-input" id="f-op-name" placeholder="${T('Nome operatore','Operator name')}" style="margin-bottom:8px">
        <label class="form-label">${T('Colore','Color')}</label>
        <div class="color-row" id="color-row">${colorSwatches}</div>
        <button class="btn-primary" onclick="addOperator()">${T('Aggiungi','Add')}</button>
      </div>
    </div>` : ''}

    <div class="settings-sec">
      <div class="settings-sec-title">${T('AVVISO SCORTE','STOCK ALERT')}</div>
      <div class="settings-sec-desc">${T('Numero di giorni prima della fine in cui ti avviseremo.','Number of days before end when we will alert you.')}</div>
      <div class="settings-row">
        <span class="settings-row-label">${svgIcon('ic-clock',16)} ${T('Giorni di anticipo','Days in advance')}</span>
        <input type="number" min="1" id="f-alertdays" value="${alertDays}" style="width:60px;text-align:center;border:1.5px solid var(--br);border-radius:8px;padding:6px;font-size:15px">
      </div>
      <div style="padding:12px 16px">
        <button class="btn-primary" onclick="saveAlertDays()">${T('Salva soglia','Save threshold')}</button>
      </div>
    </div>

    <div class="settings-sec">
      <div class="settings-sec-title">${T('NOTIFICHE','NOTIFICATIONS')}</div>
      <div class="settings-sec-desc">${T('Riceverai una notifica quando un medicinale sta per finire.','You will receive a notification when a medicine is about to run out.')}</div>
      <div class="settings-row">
        <span class="settings-row-label">${svgIcon('ic-bell',16)} ${T('Stato','Status')}</span>
        <span id="notif-status" class="settings-row-val" style="color:var(--w)">${T('Non disponibili sul web','Not available on web')}</span>
      </div>
    </div>

    <div class="settings-sec">
      <div class="settings-sec-title">${T('I TUOI DATI','YOUR DATA')}</div>
      <div class="stats-grid">
        <div class="stat-cell"><div class="stat-num">${D.patients.length}</div><div class="stat-label">${T('Pazienti','Patients')}</div></div>
        <div class="stat-cell"><div class="stat-num">${totalMeds}</div><div class="stat-label">${T('Medicinali','Medicines')}</div></div>
        <div class="stat-cell"><div class="stat-num">${totalVisits}</div><div class="stat-label">${T('Visite','Visits')}</div></div>
        <div class="stat-cell"><div class="stat-num">${D.medicineDb.length}</div><div class="stat-label">Database</div></div>
      </div>
      <div style="padding:12px 16px;font-size:12px;color:var(--t3)">${T('I dati sono sincronizzati su Firebase in tempo reale tra tutti gli utenti.','Data is synced on Firebase in real time across all users.')}
        <span style="display:block;margin-top:6px">CareStock ${T('versione','version')} ${APP_VERSION} · <a onclick="forceUpdate()" style="color:var(--p);font-weight:600;cursor:pointer">${T('Cerca aggiornamenti','Check for updates')}</a></span>
      </div>
      <div style="padding:0 16px 8px;display:flex;flex-direction:column;gap:8px">
        <button class="btn-primary" style="display:flex;align-items:center;justify-content:center;gap:8px" onclick="exportData()">${svgIcon('ic-download',18)} ${T('Esporta backup (.json)','Export backup (.json)')}</button>
        ${canEdit() ? `<button class="btn-secondary" style="display:flex;align-items:center;justify-content:center;gap:8px" onclick="importData()">${svgIcon('ic-upload',18)} ${T('Importa da backup','Import from backup')}</button>
        <button class="btn-danger" onclick="confirmClearData()">${T('Cancella tutti i dati','Clear all data')}</button>` : ''}
      </div>
    </div>

    <div class="settings-sec">
      <div class="settings-sec-title">${svgIcon('ic-lock',14)} ${T('PROTEZIONE PIN','PIN PROTECTION')}</div>
      <div class="settings-sec-desc">${T('Proteggi l\'accesso con un PIN a 4 cifre. Utile se il telefono lo usano più persone.','Protect access with a 4-digit PIN. Useful if multiple people use the phone.')}</div>
      ${getPin() ? `
        <div class="settings-row">
          <span class="settings-row-label">${T('PIN attivo','PIN active')}</span>
          <span style="color:var(--p);font-weight:700;letter-spacing:4px">●●●●</span>
        </div>
        <div style="padding:10px 16px;display:flex;gap:8px">
          <button class="pill active" onclick="showSetPinModal()">${T('Cambia PIN','Change PIN')}</button>
          <button class="pill" style="color:var(--r);border-color:var(--r)" onclick="confirmRemovePin()">${T('Rimuovi','Remove')}</button>
        </div>` : `
        <div style="padding:12px 16px">
          <button class="btn-primary" style="display:flex;align-items:center;justify-content:center;gap:8px" onclick="showSetPinModal()">${svgIcon('ic-lock',18)} ${T('Imposta PIN','Set PIN')}</button>
        </div>`}
    </div>

    ${canEdit() ? '<div id="users-sec-placeholder"><div class="settings-sec"><div class="settings-sec-title">GESTIONE UTENTI</div><div class="settings-sec-desc" style="padding:10px 16px 12px">Caricamento...</div></div></div>' : ''}
  `;

  // Check notification permission
  if ('Notification' in window && Notification.permission === 'granted') {
    const el = document.getElementById('notif-status');
    if (el) { el.textContent = T('Attive','Active'); el.style.color = 'var(--p)'; }
  }
  if (canEdit()) renderUsersSection();
}

let _selectedOpColor = OP_COLORS[0];

function selectOpColor(el, color) {
  _selectedOpColor = color;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
}

function addOperator() {
  const name = g('f-op-name').value.trim();
  if (!name) return;
  const op = { id: uid(), name, color: _selectedOpColor };
  D.operators.push(op);
  save();
  renderSettings();
}

function deleteOp(id) {
  if (D.operators.length <= 1) { alert(T('Deve esserci almeno un operatore','At least one operator is required')); return; }
  D.operators = D.operators.filter(o => o.id !== id);
  save();
  renderSettings();
}

function setLang(lang) {
  D.settings.language = lang;
  save();
  renderSettings();
}

function saveAlertDays() {
  const v = parseInt(g('f-alertdays').value);
  if (!v || v < 1) return;
  D.settings.alertDays = v;
  save();
  renderSettings();
}

function confirmClearData() {
  const html = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px" onclick="closeModal()">
    <div style="background:var(--sur);border-radius:16px;padding:24px;width:100%;max-width:340px" onclick="event.stopPropagation()">
      <div style="font-size:17px;font-weight:700;margin-bottom:8px">${T('Cancella tutti i dati','Clear all data')}</div>
      <div style="font-size:14px;color:var(--t2);margin-bottom:20px">${T('Questa azione è irreversibile. Tutti i pazienti, medicinali e visite verranno eliminati.','This action is irreversible. All patients, medicines and visits will be deleted.')}</div>
      <button class="btn-danger" onclick="clearAllData()">${T('Cancella tutto','Clear everything')}</button>
      <button class="btn-secondary" onclick="closeModal()">${T('Annulla','Cancel')}</button>
    </div>
  </div>`;
  showModal(html);
}

function clearAllData() {
  localStorage.removeItem(LS);
  D = loadData();
  save();
  closeModal();
  navigate('patients');
}

// ── Print ───────────────────────────────────────────────────
function printPatient(id) {
  const pt = getPatient(id);
  if (!pt) return;
  const now = new Date();
  const meds = pt.medicines || [];
  const visits = pt.visits || [];
  const doc = pt.doctor || {};
  const fam = pt.family || {};

  let medsRows = meds.map(med => {
    const st = getMedStatus(med);
    const sched = formatSchedule(med);
    return `<tr>
      <td><strong>${escHtml(med.name)}</strong><br><small>${medFmtLabel(med)}${med.monthDays&&med.monthDays.length>0?' · '+formatMonthDays(med.monthDays):med.days&&med.days.length>0&&med.days.length<7?' · '+formatDays(med.days):''}</small></td>
      <td>${med.totalQty||'—'}</td>
      <td>${sched||'—'}<br><small>${dosePerDay(med)||0}/giorno</small></td>
      <td>${fmtDate(med.startDate)}</td>
      <td>${fmtDate(med.endDate)}</td>
      <td><strong>${st.label||'—'}</strong></td>
    </tr>`;
  }).join('');

  const pastV = visits.filter(v => new Date(v.date) < now).sort((a,b) => b.date.localeCompare(a.date));
  const futureV = visits.filter(v => new Date(v.date) >= now).sort((a,b) => a.date.localeCompare(b.date));

  const visitRows = (label, list) => {
    if (!list.length) return '';
    return `<h4 style="margin:12px 0 6px;color:#666;font-size:12px;text-transform:uppercase">${label}</h4>` +
      list.map(v => `<div style="display:flex;gap:20px;padding:6px 0;border-top:1px solid #eee;font-size:13px">
        <div style="width:140px;flex-shrink:0;color:#666">${fmtDatetime(v.date)}</div>
        <div><strong>${escHtml(v.title)}</strong>${v.location?`<br>${escHtml(v.location)}`:''}${v.notes?`<br><em>${escHtml(v.notes)}</em>`:''}</div>
      </div>`).join('');
  };

  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Scheda ${escHtml(pt.name)}</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:20px;color:#1a1a1a;max-width:900px}
    h1{font-size:24px;margin:0}h2{font-size:16px;margin:0 0 12px}
    .badge{background:#e8f5f2;color:#3d9e8c;border-radius:6px;padding:2px 10px;font-size:13px;font-weight:600;display:inline-block;margin-left:8px}
    .allergy{background:#fff8ee;border:1.5px solid #f0c07a;border-radius:8px;padding:10px 14px;margin:12px 0;font-size:14px}
    .contacts{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:14px 0}
    .contact-box{border:1.5px solid #e5e7eb;border-radius:8px;padding:12px}
    .contact-box h3{font-size:11px;color:#3d9e8c;text-transform:uppercase;letter-spacing:.5px;margin:0 0 6px}
    table{width:100%;border-collapse:collapse;margin:8px 0;font-size:13px}
    th{text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;padding:6px 8px;border-bottom:2px solid #e5e7eb}
    td{padding:8px;border-bottom:1px solid #f0f0f0;vertical-align:top}
    .footer{margin-top:30px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #e5e7eb;padding-top:12px}
    @media print{body{margin:10px}}
  </style></head><body>
  <h1>${escHtml(pt.name)} <span class="badge">Stanza ${escHtml(pt.room||'—')}</span></h1>
  <div style="font-size:13px;color:#6b7280;margin-top:4px">Scheda paziente • generata il ${fmtDatetime(now.toISOString())}</div>
  ${pt.allergies ? `<div class="allergy"><strong style="color:#e09038">Note / allergie:</strong> ${escHtml(pt.allergies)}</div>` : ''}
  <div class="contacts">
    ${doc.name ? `<div class="contact-box"><h3>Medico curante</h3>${escHtml(doc.name)}${doc.phone?`<br>Tel: ${escHtml(doc.phone)}`:''}${doc.email?`<br>Email: ${escHtml(doc.email)}`:''}</div>` : '<div></div>'}
    ${fam.name ? `<div class="contact-box"><h3>Familiare di riferimento</h3>${escHtml(fam.name)}${fam.phone?`<br>Tel: ${escHtml(fam.phone)}`:''}${fam.email?`<br>Email: ${escHtml(fam.email)}`:''}</div>` : '<div></div>'}
  </div>
  ${meds.length > 0 ? `<h2>Medicinali (${meds.length})</h2>
  <table><thead><tr><th>Medicinale</th><th>Totale</th><th>Posologia</th><th>Inizio</th><th>Fine prevista</th><th>Stato</th></tr></thead>
  <tbody>${medsRows}</tbody></table>` : ''}
  ${visits.length > 0 ? `<h2 style="margin-top:20px">Visite e appuntamenti</h2>
  ${visitRows('Prossime', futureV)}${visitRows('Passati', pastV)}` : ''}
  <div class="footer">CareStock • ${fmtDatetime(now.toISOString())}</div>
  <script>window.print();<\/script>
  </body></html>`;

  const win = window.open('about:blank', '_blank');
  win.document.write(html);
  win.document.close();
}

// ── Modal ───────────────────────────────────────────────────
let _modalEl = null;

function showModal(html) {
  closeModal();
  _modalEl = document.createElement('div');
  _modalEl.innerHTML = html;
  document.body.appendChild(_modalEl);
}

function closeModal() {
  if (_modalEl) { _modalEl.remove(); _modalEl = null; }
}

// ── Scanner codici a barre ──────────────────────────────────
let _scanStream = null;
let _scanTimer = null;
let _scanDetector = null;
let _scanLastCode = '';
let _scanLastTime = 0;
let _scanPaused = false;
let _scanCurrentCode = '';
let _scanMode = 'add';
let _scanMatches = [];
let _scanLabelFlow = false;

function renderScan() {
  const camSupported = 'BarcodeDetector' in window;
  g('bar-scan').innerHTML = `
    <button class="bar-back" onclick="back()">←</button>
    <span class="bar-title">${T('Scansiona codice','Scan barcode')}</span>`;
  g('content-scan').innerHTML = `
    ${camSupported ? `
    <div style="background:#000;border-radius:var(--rad);overflow:hidden;position:relative;aspect-ratio:4/3;margin-bottom:12px">
      <video id="scan-video" playsinline muted style="width:100%;height:100%;object-fit:cover"></video>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">
        <div style="width:70%;height:38%;border:3px solid rgba(255,255,255,.85);border-radius:12px"></div>
      </div>
      <div id="scan-cam-msg" style="position:absolute;bottom:8px;left:0;right:0;text-align:center;color:#fff;font-size:13px;text-shadow:0 1px 3px #000">${T('Inquadra il codice a barre della scatola','Point at the box barcode')}</div>
    </div>` : `
    <div class="allergy-box" style="margin-bottom:12px">${T('Questo browser non supporta la scansione con fotocamera. Puoi comunque usare uno scanner esterno o digitare il codice qui sotto.','This browser does not support camera scanning. You can still use an external scanner or type the code below.')}</div>`}
    <div class="form-group">
      <label class="form-label">${T('Scanner esterno o codice manuale','External scanner or manual code')}</label>
      <input class="form-input" id="scan-input" inputmode="numeric" autocomplete="off"
        placeholder="${T('Spara con lo scanner o digita il codice...','Scan with the gun or type the code...')}"
        onkeydown="if(event.key==='Enter'){handleScannedCode(this.value);this.value='';}">
      <div style="font-size:12px;color:var(--t3);margin-top:4px">${T('Gli scanner USB/Bluetooth scrivono qui da soli e premono Invio.','USB/Bluetooth scanners type here and press Enter automatically.')}</div>
    </div>
    <div id="scan-result"></div>
    <div class="section-box" style="margin-top:14px">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">📦 ${T('Scatole senza codice a barre?','Boxes without a barcode?')}</div>
      <div style="font-size:13px;color:var(--t2);margin-bottom:10px">${T('Fai una foto al fronte della scatola e l\'app riconosce il nome, oppure crea un\'etichetta interna da stampare e attaccare sul cassetto.','Take a photo of the box front and the app recognizes the name, or create an internal label to print and stick on the drawer.')}</div>
      <button class="btn-primary" style="margin-top:0" onclick="ocrPickPhoto()">📷 ${T('Riconosci dalla foto','Recognize from photo')}</button>
      <button class="btn-secondary" onclick="showLabelsModal()">${T('Gestisci / stampa etichette','Manage / print labels')}</button>
    </div>`;
  if (camSupported) startScanner();
  setTimeout(() => g('scan-input')?.focus(), 200);
}

async function startScanner() {
  const video = g('scan-video');
  if (!video) return;
  try {
    _scanDetector = new BarcodeDetector({formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','data_matrix','qr_code']});
  } catch(e) { _scanDetector = null; }
  if (!_scanDetector) {
    const m = g('scan-cam-msg');
    if (m) m.textContent = T('Lettore non disponibile su questo dispositivo','Reader unavailable on this device');
    return;
  }
  try {
    _scanStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}, audio: false});
    video.srcObject = _scanStream;
    await video.play();
  } catch(e) {
    const m = g('scan-cam-msg');
    if (m) m.textContent = T('Permesso fotocamera negato: consenti la fotocamera nelle impostazioni del sito','Camera permission denied: allow camera in site settings');
    return;
  }
  _scanTimer = setInterval(async () => {
    if (_scanPaused || !video.videoWidth) return;
    try {
      const codes = await _scanDetector.detect(video);
      if (codes.length > 0 && codes[0].rawValue) {
        const code = codes[0].rawValue.trim();
        const now = Date.now();
        if (code === _scanLastCode && now - _scanLastTime < 4000) return;
        _scanLastCode = code;
        _scanLastTime = now;
        if (navigator.vibrate) navigator.vibrate(80);
        handleScannedCode(code);
      }
    } catch(e) {}
  }, 350);
}

function stopScanner() {
  if (_scanTimer) { clearInterval(_scanTimer); _scanTimer = null; }
  if (_scanStream) { _scanStream.getTracks().forEach(t => t.stop()); _scanStream = null; }
  _scanPaused = false;
}

function handleScannedCode(rawCode) {
  const code = (rawCode || '').trim();
  if (!code) return;
  if (!D.barcodes) D.barcodes = {};
  _scanCurrentCode = code;
  _scanPaused = true;
  if (D.barcodes[code]) showScanActionModal();
  else showScanAssociateModal();
}

function showScanAssociateModal(isEdit) {
  const existing = (D.barcodes || {})[_scanCurrentCode] || {};
  showModal(`<div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;display:flex;align-items:flex-end" onclick="closeScanModal()">
    <div style="background:var(--sur);width:100%;max-width:600px;margin:0 auto;border-radius:20px 20px 0 0;padding:20px;max-height:85vh;overflow-y:auto" onclick="event.stopPropagation()">
      <div style="font-size:17px;font-weight:700;margin-bottom:4px">${isEdit ? T('Modifica prodotto','Edit product') : T('Nuovo prodotto scansionato','New scanned product')}</div>
      <div style="font-size:13px;color:var(--t2);margin-bottom:14px">${T('Codice','Code')}: <strong style="font-variant-numeric:tabular-nums">${escHtml(_scanCurrentCode)}</strong></div>
      <div class="form-group autocomplete">
        <label class="form-label">${T('Che prodotto è?','Which product is it?')}</label>
        <input class="form-input" id="scan-assoc-name" value="${escHtml(existing.name || '')}"
          placeholder="${T('es. Tachipirina 500 mg','e.g. Tachipirina 500 mg')}"
          oninput="showScanAutocomplete(this.value)" autocomplete="off">
        <div class="autocomplete-list" id="scan-autocomplete" style="display:none"></div>
      </div>
      <div class="form-group">
        <label class="form-label">${T('Quante unità contiene una scatola intera? (pastiglie, fiale, pezzi...)','How many units in a full box? (pills, vials, pieces...)')}</label>
        <input class="form-input" id="scan-assoc-qty" type="number" min="1" step="1" value="${existing.boxQty || ''}"
          placeholder="${T('es. 28','e.g. 28')}" style="font-size:20px;font-weight:700;text-align:center">
      </div>
      <button class="btn-primary" onclick="saveScanAssociation()">${T('Salva','Save')}</button>
      <button class="btn-secondary" onclick="closeScanModal()">${T('Annulla','Cancel')}</button>
    </div>
  </div>`);
  setTimeout(() => g('scan-assoc-name')?.focus(), 100);
}

function showScanAutocomplete(val) {
  const list = g('scan-autocomplete');
  if (!list) return;
  if (!val || val.length < 2) { list.style.display = 'none'; return; }
  const q = val.toLowerCase();
  const custom = D.medicineDb.filter(m => m.name.toLowerCase().includes(q)).slice(0, 3);
  const builtin = (typeof BUILTIN_MEDS !== 'undefined') ? BUILTIN_MEDS.filter(b => builtinMatch(b, q)).slice(0, 6) : [];
  if (!custom.length && !builtin.length) { list.style.display = 'none'; return; }
  list.innerHTML =
    custom.map(m => `<div class="autocomplete-item" data-n="${escHtml(m.name)}" onclick="pickScanName(this.dataset.n)">${escHtml(m.name)}</div>`).join('') +
    builtin.map(b => `<div class="autocomplete-item" data-n="${escHtml(b[0])}" onclick="pickScanName(this.dataset.n)">${escHtml(b[0])}${b[3] ? ` <span style="color:var(--t3);font-size:11px">${escHtml(b[3])}</span>` : ''}</div>`).join('');
  list.style.display = 'block';
}

function pickScanName(name) {
  const i = g('scan-assoc-name');
  if (i) i.value = name;
  const l = g('scan-autocomplete');
  if (l) l.style.display = 'none';
}

function saveScanAssociation() {
  const name = g('scan-assoc-name')?.value.trim();
  const boxQty = parseInt(g('scan-assoc-qty')?.value, 10);
  if (!name) { alert(T('Inserisci il nome del prodotto','Enter the product name')); return; }
  if (!boxQty || boxQty <= 0) { alert(T('Inserisci quante unità contiene la scatola','Enter how many units the box contains')); return; }
  if (!D.barcodes) D.barcodes = {};
  D.barcodes[_scanCurrentCode] = { name, boxQty };
  save();
  if (_scanLabelFlow) {
    _scanLabelFlow = false;
    showLabelsModal();
  } else {
    showScanActionModal();
  }
}

function setScanMode(mode) {
  _scanMode = mode;
  g('scan-tab-add')?.classList.toggle('active', mode === 'add');
  g('scan-tab-sub')?.classList.toggle('active', mode === 'sub');
  const btn = g('scan-ok-btn');
  if (btn) btn.textContent = mode === 'add' ? T('Carica','Load') : T('Scarica','Unload');
  const exG = g('scan-expiry-group');
  if (exG) exG.style.display = mode === 'add' ? '' : 'none';
}

function showScanActionModal() {
  const info = D.barcodes[_scanCurrentCode];
  if (!info) return;
  _scanMode = 'add';
  _scanMatches = [];
  D.patients.forEach(pt => (pt.medicines || []).forEach(m => {
    if (m.name.toLowerCase() === info.name.toLowerCase()) _scanMatches.push({type: 'pt', pt, m});
  }));
  (D.locations || []).forEach(loc => {
    const item = (loc.items || []).find(it => it.name.toLowerCase() === info.name.toLowerCase());
    _scanMatches.push({type: 'loc', loc, item: item || null});
  });
  const options = _scanMatches.map((x, i) => {
    if (x.type === 'pt') return `<option value="${i}">👤 ${escHtml(x.pt.name)} — ${x.m.totalQty != null ? x.m.totalQty + ' ' + T('rimaste','left') : T('scorta non indicata','no stock set')}</option>`;
    return `<option value="${i}">📦 ${escHtml(x.loc.name)} — ${x.item ? (x.item.qty || 0) + ' ' + T('presenti','in stock') : T('nuovo prodotto qui','new product here')}</option>`;
  }).join('');
  showModal(`<div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;display:flex;align-items:flex-end" onclick="closeScanModal()">
    <div style="background:var(--sur);width:100%;max-width:600px;margin:0 auto;border-radius:20px 20px 0 0;padding:20px;max-height:85vh;overflow-y:auto" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:14px">
        <div style="flex:1">
          <div style="font-size:17px;font-weight:700">${escHtml(info.name)}</div>
          <div style="font-size:13px;color:var(--t2)">${T('Scatola intera','Full box')}: ${info.boxQty} ${T('unità','units')}</div>
        </div>
        <button class="add-link" onclick="closeModal();showScanAssociateModal(true)" style="font-size:13px">${T('Modifica','Edit')}</button>
      </div>
      <div class="cal-toggle" style="margin:0 auto 14px">
        <button class="cal-tab active" id="scan-tab-add" onclick="setScanMode('add')">＋ ${T('Carica','Load')}</button>
        <button class="cal-tab" id="scan-tab-sub" onclick="setScanMode('sub')">− ${T('Scarica','Unload')}</button>
      </div>
      ${_scanMatches.length ? `
      <div class="form-group">
        <label class="form-label">${T('Dove? (paziente o deposito)','Where? (patient or storage)')}</label>
        <select class="form-input" id="scan-target">${options}</select>
      </div>
      <div class="form-group">
        <label class="form-label">${T('Quantità','Quantity')}</label>
        <input class="form-input" id="scan-qty" type="number" min="0.5" step="0.5" value="${info.boxQty}"
          style="font-size:24px;font-weight:800;text-align:center">
        <div style="font-size:12px;color:var(--t3);margin-top:4px">${T('OK = scatola intera. Cambia il numero se la scatola è aperta (es. 16).','OK = full box. Change the number if the box is open (e.g. 16).')}</div>
      </div>
      <div class="form-group" id="scan-expiry-group">
        <label class="form-label">${T('Scadenza sulla scatola (opzionale)','Expiry on the box (optional)')}</label>
        <input class="form-input" id="scan-expiry" type="month">
      </div>
      <button class="btn-primary" id="scan-ok-btn" onclick="applyScanAction()">${T('Carica','Load')}</button>` : `
      <div class="allergy-box" style="margin-bottom:10px">${T('Nessun paziente ha questo prodotto in terapia e non ci sono depositi. Aggiungi il farmaco al paziente o crea un deposito dalla pagina principale, poi riscansiona.','No patient has this product and there are no storages. Add the medicine to a patient or create a storage from the main page, then rescan.')}</div>`}
      <button class="btn-secondary" onclick="closeScanModal()">${T('Annulla','Cancel')}</button>
    </div>
  </div>`);
}

function applyScanAction() {
  const idx = parseInt(g('scan-target')?.value, 10);
  const target = _scanMatches[idx];
  if (!target) return;
  const qty = parseFloat(g('scan-qty')?.value);
  if (!qty || qty <= 0) { alert(T('Inserisci una quantità valida','Enter a valid quantity')); return; }
  const signed = _scanMode === 'add' ? qty : -qty;
  const info = D.barcodes[_scanCurrentCode];
  const scanExp = _scanMode === 'add' ? (g('scan-expiry')?.value || null) : null;
  let destName = '';
  let newQty = 0;
  let warnHtml = '';

  if (target.type === 'loc') {
    const loc = target.loc;
    if (!loc.items) loc.items = [];
    let item = target.item;
    if (!item) {
      item = { id: uid(), name: info.name, qty: 0 };
      loc.items.push(item);
      target.item = item;
    }
    item.qty = Math.max(0, (item.qty || 0) + signed);
    if (scanExp && (!item.expiry || scanExp < item.expiry)) item.expiry = scanExp;
    destName = '📦 ' + loc.name;
    newQty = item.qty;
  } else {
    const med = target.m;
    if (!med.restocks) med.restocks = [];
    med.restocks.push({ id: uid(), qty: signed, note: T('Scansione codice','Barcode scan'), date: new Date().toISOString() });
    med.totalQty = Math.max(0, (med.totalQty || 0) + signed);
    if (scanExp && (!med.expiry || scanExp < med.expiry)) med.expiry = scanExp;
    recalcMedEnd(med);
    destName = '👤 ' + target.pt.name;
    newQty = med.totalQty;
    if (!dosePerDay(med)) warnHtml = `<div style="font-size:13px;color:var(--w);margin-top:6px">⚠ ${T('Questo farmaco non ha orari impostati: i giorni rimasti non possono essere calcolati. Aprilo dalla scheda paziente e imposta gli orari.','This medicine has no schedule set: days left cannot be calculated. Open it from the patient page and set the schedule.')}</div>`;
  }

  logMove(_scanMode === 'add' ? T('Carico','Load') : T('Scarico','Unload'), info.name, Math.abs(signed), destName);
  save();
  closeScanModal();
  const res = g('scan-result');
  if (res) {
    res.innerHTML = `<div class="section-box" style="border:1.5px solid ${_scanMode === 'add' ? 'var(--p)' : 'var(--w)'}">
      <div style="font-weight:700;color:${_scanMode === 'add' ? 'var(--p)' : 'var(--w)'}">${_scanMode === 'add' ? '+' : '−'}${qty} ${escHtml(info.name)}</div>
      <div style="font-size:13px;color:var(--t2)">${escHtml(destName)} — ${T('ora','now')} ${newQty} ${T('rimaste','left')}</div>
      ${warnHtml}
    </div>`;
  }
}

function closeScanModal() {
  closeModal();
  _scanPaused = false;
  _scanLabelFlow = false;
  setTimeout(() => g('scan-input')?.focus(), 100);
}

// ── PAGE: Home dashboard ────────────────────────────────────
function renderHome() {
  const op = activeOp();
  const low = getLowMeds();
  const expiring = getExpiringItems();
  const nAlerts = low.length + expiring.length;

  // Barra nascosta: la Home usa il saluto grande al posto della barra
  const bar = g('bar-home');
  bar.innerHTML = '';
  bar.style.display = 'none';

  const now = new Date();
  const WDAYS = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  const WDAYS_EN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const h = now.getHours();
  const saluto = T(h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera',
                   h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');
  const dateStr = `${T(WDAYS[now.getDay()], WDAYS_EN[now.getDay()])} ${now.getDate()} ${MONTHS_IT[now.getMonth()].toLowerCase()}`;

  // Visite di oggi
  const today = todayISO();
  const todayVisits = [];
  D.patients.forEach(pt => (pt.visits || []).forEach(v => {
    if ((v.date || '').slice(0, 10) === today) todayVisits.push({pt, v});
  }));
  todayVisits.sort((a, b) => a.v.date.localeCompare(b.v.date));

  const nMeds = (typeof BUILTIN_MEDS !== 'undefined' ? BUILTIN_MEDS.length : 0) + D.medicineDb.length;
  const locs = D.locations || [];
  const nExpLoc = expiring.filter(e => e.locId).length;

  g('content-home').innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px;padding-top:10px">
      <div style="flex:1">
        <div class="h-hello">${saluto}, <span class="h-grad" onclick="showOpDropdown()" style="cursor:pointer">${escHtml(op.name)}</span> 👋</div>
        <div class="h-date">${dateStr}${_fbFacilityName ? ' · 🏥 ' + escHtml(_fbFacilityName) : ''}</div>
      </div>
      ${isSuperAdmin() ? `<button class="mini-ib" onclick="navigate('super-admin')" title="Pannello Admin" style="font-size:17px">⚡</button>` : ''}
      <button class="mini-ib" onclick="navigate('search')" title="Ricerca">${svgIcon('ic-search', 19)}</button>
    </div>

    <button class="h-hero" onclick="navigate('alerts')">
      <div class="n">${nAlerts ? nAlerts : '✓'}</div>
      <div>
        <div class="big">${nAlerts ? T('Cose da controllare','Things to check') : T('Tutto in ordine','All good')}</div>
        <div class="sub">${nAlerts
          ? [low.length ? low.length + ' ' + T(low.length === 1 ? 'scorta in esaurimento' : 'scorte in esaurimento', 'running low') : '',
             expiring.length ? expiring.length + ' ' + T('in scadenza','expiring') : ''].filter(Boolean).join(' · ')
          : T('Nessun avviso attivo','No active alerts')}</div>
      </div>
      <div class="go">›</div>
    </button>

    <div class="h-grid">
      <button class="h-tile" onclick="navigate('patients')">
        <div class="ico hc-teal">👤</div>
        <div class="name">${T('Pazienti','Patients')}</div>
        <div class="sub">${D.patients.length} ${T('in struttura','in facility')}</div>
      </button>
      <button class="h-tile" onclick="navigate('locations')">
        <div class="ico hc-vio">📦</div>
        <div class="name">${T('Depositi','Storage')}</div>
        <div class="sub">${locs.length} ${T(locs.length === 1 ? 'magazzino' : 'magazzini','storage')}</div>
        ${nExpLoc ? `<span class="bdg">⏰${nExpLoc}</span>` : ''}
      </button>
      <button class="h-tile" onclick="navigate('calendar')">
        <div class="ico hc-blu">📅</div>
        <div class="name">${T('Calendario','Calendar')}</div>
        <div class="sub">${todayVisits.length ? todayVisits.length + ' ' + T(todayVisits.length === 1 ? 'visita oggi' : 'visite oggi','today') : T('Nessuna visita oggi','No visits today')}</div>
      </button>
      <button class="h-tile" onclick="navigate('db')">
        <div class="ico hc-pnk">💊</div>
        <div class="name">${T('Prontuario','Database')}</div>
        <div class="sub">${nMeds.toLocaleString('it-IT')} ${T('farmaci','medicines')}</div>
      </button>
    </div>

    ${todayVisits.slice(0, 2).map(({pt, v}) => `
      <div class="h-today" onclick="navigate('patient-detail',{patientId:'${pt.id}'})">
        <div class="time">${new Date(v.date).toTimeString().slice(0,5)}</div>
        <div style="min-width:0">
          <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(v.title)}</div>
          <div style="font-size:12px;color:var(--t2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">👤 ${escHtml(pt.name)}${v.location ? ' · ' + escHtml(v.location) : ''}</div>
        </div>
        <span class="chevron" style="margin-left:auto">›</span>
      </div>`).join('')}
    ${canEdit() && backupDue() ? `
      <div class="h-today" onclick="exportData()" style="border:1.5px dashed var(--p)">
        <div class="time">💾</div>
        <div style="min-width:0;flex:1">
          <div style="font-size:14px;font-weight:600">${T('Backup settimanale consigliato','Weekly backup recommended')}</div>
          <div style="font-size:12px;color:var(--t2)">${T('Tocca per scaricare una copia di sicurezza dei dati','Tap to download a safety copy')}</div>
        </div>
        <span class="chevron" style="margin-left:auto">›</span>
      </div>` : ''}`;
}

// ── PAGE: Notifiche ─────────────────────────────────────────
function renderAlerts() {
  const low = getLowMeds();
  const expiring = getExpiringItems();

  g('bar-alerts').innerHTML = `
    <button class="bar-back" onclick="back()">${svgIcon('ic-arrow-left',22)}</button>
    <span class="bar-title">🔔 ${T('Notifiche','Alerts')}</span>`;

  let html = '';

  if (low.length && canEdit()) {
    html += `<button class="btn-primary" style="margin-bottom:6px" onclick="showOrderModal()">🛒 ${T('Genera ordine farmacia','Generate pharmacy order')} (${low.length})</button>`;
  }

  html += `<div class="sec-hd">⚠ ${T('Da ricaricare','To restock')} (${low.length})</div>`;
  if (low.length) {
    html += low.map(({patient: pt, med, status}) => `
      <div class="patient-card" onclick="navigate('patient-detail',{patientId:'${pt.id}'})" style="cursor:pointer;${status.cls === 'expired' ? 'border-color:var(--r)' : 'border-color:var(--w)'}">
        <div class="avatar" style="background:${status.cls === 'expired' ? '#fff5f5' : 'var(--wl)'};font-size:18px">💊</div>
        <div class="patient-info">
          <div class="patient-name">${escHtml(med.name)}</div>
          <div class="patient-sub">👤 ${escHtml(pt.name)} • ${T('Stanza','Room')} ${escHtml(pt.room || '?')}${med.totalQty != null ? ' • ' + med.totalQty + ' ' + T('rimaste','left') : ''}</div>
        </div>
        <span style="font-size:13px;font-weight:700;color:${status.cls === 'expired' ? 'var(--r)' : 'var(--w)'};white-space:nowrap">${status.label}</span>
        <button class="ib" style="font-size:17px;padding:6px" title="${T('Avvisa','Notify')}" onclick="event.stopPropagation();showNotifyModal('${pt.id}')">📣</button>
      </div>`).join('');
  } else {
    html += `<div class="home-empty" style="padding:14px 0">${T('Nessuna scorta in esaurimento 👍','No stock running low 👍')}</div>`;
  }

  html += `<div class="sec-hd" style="margin-top:22px">⏰ ${T('In scadenza','Expiring')} (${expiring.length})</div>`;
  if (expiring.length) {
    html += expiring.map(e => `
      <div class="patient-card" onclick="${e.ptId ? `navigate('patient-detail',{patientId:'${e.ptId}'})` : `navigate('location-detail',{locationId:'${e.locId}'})`}" style="cursor:pointer;border-color:var(--r)">
        <div class="avatar" style="background:#fff5f5;font-size:18px">⏰</div>
        <div class="patient-info">
          <div class="patient-name">${escHtml(e.name)}</div>
          <div class="patient-sub">${e.icon} ${escHtml(e.where)} • ${T('scad.','exp.')} ${fmtExpiry(e.expiry)}</div>
        </div>
        <span style="font-size:13px;font-weight:700;color:var(--r);white-space:nowrap">${e.st.label}</span>
      </div>`).join('');
  } else {
    html += `<div class="home-empty" style="padding:14px 0">${T('Nessun prodotto in scadenza 👍','Nothing expiring 👍')}</div>`;
  }

  g('content-alerts').innerHTML = html;
}

// ── PAGE: Depositi (lista) ──────────────────────────────────
function renderLocationsPage() {
  const locs = D.locations || [];
  g('bar-locations').innerHTML = `
    <button class="bar-back" onclick="back()">${svgIcon('ic-arrow-left',22)}</button>
    <span class="bar-title">📦 ${T('Depositi & magazzino','Storage & warehouse')}</span>`;
  g('content-locations').innerHTML = `
    ${locs.length ? locs.map(l => {
      const nExp = (l.items || []).filter(it => { const ex = expiryStatus(it.expiry); return ex && ex.cls !== 'ok'; }).length;
      return `
      <div class="patient-card ${nExp ? 'has-alert' : ''}" onclick="navigate('location-detail',{locationId:'${l.id}'})" style="cursor:pointer">
        <div class="avatar" style="font-size:19px;background:var(--wl)">📦</div>
        <div class="patient-info">
          <div class="patient-name">${escHtml(l.name)}</div>
          <div class="patient-sub">${(l.items||[]).length} ${T('prodotti','products')}${nExp ? ` • <span style="color:var(--r);font-weight:600">⏰ ${nExp} ${T('in scadenza','expiring')}</span>` : ''}</div>
        </div>
        <span class="chevron">›</span>
      </div>`;
    }).join('') : `<div class="empty">${T('Nessun deposito ancora.','No storage yet.')}<br>${T('Es. "Deposito 1° piano", "Carrello emergenze", "Armadio 5"...','E.g. "1st floor storage", "Emergency cart"...')}</div>`}
    ${canEdit() ? `<button class="add-med-btn" onclick="addLocation()">+ ${T('Nuovo deposito','New storage')}</button>` : ''}`;
}

// ── Depositi / magazzino ────────────────────────────────────
function addLocation() {
  const name = (prompt(T('Nome del deposito (es. Deposito 1° piano, Carrello emergenze, Armadio 5):','Storage name (e.g. 1st floor storage, Emergency cart):')) || '').trim();
  if (!name) return;
  if (!D.locations) D.locations = [];
  const loc = { id: uid(), name, items: [] };
  D.locations.push(loc);
  save();
  navigate('location-detail', { locationId: loc.id });
}

function renameLocation(id) {
  const loc = (D.locations || []).find(l => l.id === id);
  if (!loc) return;
  const name = (prompt(T('Nuovo nome:','New name:'), loc.name) || '').trim();
  if (!name) return;
  loc.name = name;
  save();
  renderLocationDetail();
}

function confirmDeleteLocation(id) {
  const loc = (D.locations || []).find(l => l.id === id);
  if (!loc) return;
  if (!confirm(T(`Eliminare "${loc.name}" e tutti i suoi prodotti?`, `Delete "${loc.name}" and all its products?`))) return;
  D.locations = D.locations.filter(l => l.id !== id);
  save();
  navigate('locations');
}

function renderLocationDetail() {
  const loc = (D.locations || []).find(l => l.id === S.locationId);
  if (!loc) { navigate('locations'); return; }
  g('bar-location-detail').innerHTML = `
    <button class="bar-back" onclick="back()">←</button>
    <span class="bar-title">📦 ${escHtml(loc.name)}</span>
    ${canEdit() ? `<div class="bar-icons">
      <button class="ib" onclick="navigate('scan')" title="Scansiona">${svgIcon('ic-scan')}</button>
      <button class="ib" onclick="renameLocation('${loc.id}')">${svgIcon('ic-edit')}</button>
      <button class="ib" style="color:var(--r)" onclick="confirmDeleteLocation('${loc.id}')">${svgIcon('ic-trash')}</button>
    </div>` : ''}`;
  const items = [...(loc.items || [])].sort((a, b) => a.name.localeCompare(b.name));
  g('content-location-detail').innerHTML = `
    ${items.map(it => {
      const ex = expiryStatus(it.expiry);
      return `
      <div class="db-item">
        <div class="db-item-info" ${canEdit() ? `onclick="editLocItemExpiry('${loc.id}','${it.id}')" style="cursor:pointer"` : ''}>
          <div class="db-item-name">${escHtml(it.name)}</div>
          <div class="db-item-sub">${it.expiry ? `<span style="${ex && ex.cls !== 'ok' ? 'color:var(--r);font-weight:700' : ''}">${T('scad.','exp.')} ${fmtExpiry(it.expiry)}${ex && ex.cls !== 'ok' ? ' ⏰' : ''}</span>` : (canEdit() ? T('tocca per aggiungere scadenza','tap to add expiry') : '')}</div>
        </div>
        ${canEdit() ? `
        <div class="qty-ctrl">
          <button onclick="locItemAdj('${loc.id}','${it.id}',-1)">−</button>
          <span onclick="locItemSet('${loc.id}','${it.id}')" style="cursor:pointer">${it.qty || 0}</span>
          <button onclick="locItemAdj('${loc.id}','${it.id}',1)">+</button>
        </div>
        <button class="ib" title="${T('Sposta a paziente','Move to patient')}" style="color:#7c3aed;font-size:16px;padding:5px" onclick="showTransferModal('${loc.id}','${it.id}')">⇄</button>
        <button class="schedule-del" onclick="deleteLocItem('${loc.id}','${it.id}')">×</button>` : `<span style="font-weight:700;font-size:15px">${it.qty || 0}</span>`}
      </div>`;
    }).join('')}
    ${!items.length ? `<div class="empty">${T('Nessun prodotto ancora','No products yet')}</div>` : ''}
    ${canEdit() ? `<button class="add-med-btn" onclick="showAddLocItem('${loc.id}')">+ ${T('Aggiungi prodotto','Add product')}</button>` : ''}
    <div style="font-size:12px;color:var(--t3);margin-top:12px">💡 ${T('Puoi caricare e scaricare qui anche con lo scanner o la foto: questo deposito compare nella scelta della destinazione.','You can also load/unload here with the scanner or photo: this storage appears in the destination choice.')}</div>`;
}

function locItemAdj(locId, itemId, delta) {
  const loc = (D.locations || []).find(l => l.id === locId);
  const it = loc && (loc.items || []).find(x => x.id === itemId);
  if (!it) return;
  it.qty = Math.max(0, (it.qty || 0) + delta);
  logMove(T('Rettifica','Adjust'), it.name, delta, '📦 ' + loc.name);
  save();
  renderLocationDetail();
}

function locItemSet(locId, itemId) {
  const loc = (D.locations || []).find(l => l.id === locId);
  const it = loc && (loc.items || []).find(x => x.id === itemId);
  if (!it) return;
  const v = parseFloat(prompt(T('Quantità attuale:','Current quantity:'), it.qty || 0));
  if (isNaN(v) || v < 0) return;
  it.qty = v;
  logMove(T('Rettifica','Adjust'), it.name, v, '📦 ' + loc.name);
  save();
  renderLocationDetail();
}

function deleteLocItem(locId, itemId) {
  const loc = (D.locations || []).find(l => l.id === locId);
  const it = loc && (loc.items || []).find(x => x.id === itemId);
  if (!it) return;
  if (!confirm(T(`Rimuovere "${it.name}" dal deposito?`, `Remove "${it.name}" from storage?`))) return;
  loc.items = loc.items.filter(x => x.id !== itemId);
  save();
  renderLocationDetail();
}

function showAddLocItem(locId) {
  showModal(`<div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;display:flex;align-items:flex-end" onclick="closeModal()">
    <div style="background:var(--sur);width:100%;max-width:600px;margin:0 auto;border-radius:20px 20px 0 0;padding:20px;max-height:85vh;overflow-y:auto" onclick="event.stopPropagation()">
      <div style="font-size:17px;font-weight:700;margin-bottom:14px">+ ${T('Aggiungi prodotto al deposito','Add product to storage')}</div>
      <div class="form-group autocomplete">
        <label class="form-label">${T('Prodotto','Product')}</label>
        <input class="form-input" id="loc-item-name" placeholder="${T('es. Tachipirina 500 mg, guanti, garze...','e.g. Tachipirina 500 mg, gloves, gauze...')}"
          oninput="showLocAutocomplete(this.value)" autocomplete="off">
        <div class="autocomplete-list" id="loc-autocomplete" style="display:none"></div>
      </div>
      <div class="form-group">
        <label class="form-label">${T('Quantità iniziale','Initial quantity')}</label>
        <input class="form-input" id="loc-item-qty" type="number" min="0" step="1" placeholder="0" style="font-size:20px;font-weight:700;text-align:center">
      </div>
      <div class="form-group">
        <label class="form-label">${T('Scadenza (opzionale)','Expiry (optional)')}</label>
        <input class="form-input" id="loc-item-expiry" type="month">
      </div>
      <button class="btn-primary" onclick="saveLocItem('${locId}')">${T('Aggiungi','Add')}</button>
      <button class="btn-secondary" onclick="closeModal()">${T('Annulla','Cancel')}</button>
    </div>
  </div>`);
  setTimeout(() => g('loc-item-name')?.focus(), 100);
}

function showLocAutocomplete(val) {
  const list = g('loc-autocomplete');
  if (!list) return;
  if (!val || val.length < 2) { list.style.display = 'none'; return; }
  const q = val.toLowerCase();
  const names = [];
  Object.values(D.barcodes || {}).forEach(b => names.push(b.name));
  D.medicineDb.forEach(m => names.push(m.name));
  if (typeof BUILTIN_MEDS !== 'undefined') BUILTIN_MEDS.forEach(b => names.push(b[0]));
  const seen = new Set();
  const hits = names.filter(n => {
    const k = n.toLowerCase();
    if (seen.has(k) || !k.includes(q)) return false;
    seen.add(k);
    return true;
  }).slice(0, 8);
  if (!hits.length) { list.style.display = 'none'; return; }
  list.innerHTML = hits.map(n => `<div class="autocomplete-item" data-n="${escHtml(n)}" onclick="pickLocName(this.dataset.n)">${escHtml(n)}</div>`).join('');
  list.style.display = 'block';
}

function pickLocName(name) {
  const i = g('loc-item-name');
  if (i) i.value = name;
  const l = g('loc-autocomplete');
  if (l) l.style.display = 'none';
}

function saveLocItem(locId) {
  const loc = (D.locations || []).find(l => l.id === locId);
  if (!loc) return;
  const name = g('loc-item-name')?.value.trim();
  const qty = parseFloat(g('loc-item-qty')?.value) || 0;
  if (!name) { alert(T('Inserisci il nome del prodotto','Enter the product name')); return; }
  if (!loc.items) loc.items = [];
  const expiry = g('loc-item-expiry')?.value || null;
  const existing = loc.items.find(it => it.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.qty = (existing.qty || 0) + qty;
    if (expiry && (!existing.expiry || expiry < existing.expiry)) existing.expiry = expiry;
  } else {
    loc.items.push({ id: uid(), name, qty, expiry });
  }
  if (qty) logMove(T('Carico','Load'), name, qty, '📦 ' + loc.name);
  save();
  closeModal();
  renderLocationDetail();
}

function editLocItemExpiry(locId, itemId) {
  const loc = (D.locations || []).find(l => l.id === locId);
  const it = loc && (loc.items || []).find(x => x.id === itemId);
  if (!it) return;
  showModal(`<div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;display:flex;align-items:flex-end" onclick="closeModal()">
    <div style="background:var(--sur);width:100%;max-width:600px;margin:0 auto;border-radius:20px 20px 0 0;padding:20px" onclick="event.stopPropagation()">
      <div style="font-size:17px;font-weight:700;margin-bottom:14px">📅 ${T('Scadenza','Expiry')} — ${escHtml(it.name)}</div>
      <div class="form-group">
        <label class="form-label">${T('Mese di scadenza (come sulla scatola)','Expiry month (as on the box)')}</label>
        <input class="form-input" id="loc-exp-edit" type="month" value="${it.expiry || ''}">
      </div>
      <button class="btn-primary" onclick="saveLocItemExpiry('${locId}','${itemId}')">${T('Salva','Save')}</button>
      ${it.expiry ? `<button class="btn-danger" onclick="g('loc-exp-edit').value='';saveLocItemExpiry('${locId}','${itemId}')">${T('Rimuovi scadenza','Remove expiry')}</button>` : ''}
      <button class="btn-secondary" onclick="closeModal()">${T('Annulla','Cancel')}</button>
    </div>
  </div>`);
}

function saveLocItemExpiry(locId, itemId) {
  const loc = (D.locations || []).find(l => l.id === locId);
  const it = loc && (loc.items || []).find(x => x.id === itemId);
  if (!it) return;
  it.expiry = g('loc-exp-edit')?.value || null;
  save();
  closeModal();
  renderLocationDetail();
}

// ── Trasferimento deposito → paziente ───────────────────────
let _transferCtx = null;

function showTransferModal(locId, itemId) {
  const loc = (D.locations || []).find(l => l.id === locId);
  const it = loc && (loc.items || []).find(x => x.id === itemId);
  if (!it) return;
  const matches = [];
  D.patients.forEach(pt => (pt.medicines || []).forEach(m => {
    if (m.name.toLowerCase() === it.name.toLowerCase()) matches.push({pt, m});
  }));
  _transferCtx = { loc, it, matches };
  showModal(`<div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;display:flex;align-items:flex-end" onclick="closeModal()">
    <div style="background:var(--sur);width:100%;max-width:600px;margin:0 auto;border-radius:20px 20px 0 0;padding:20px" onclick="event.stopPropagation()">
      <div style="font-size:17px;font-weight:700;margin-bottom:4px">⇄ ${T('Sposta a paziente','Move to patient')}</div>
      <div style="font-size:13px;color:var(--t2);margin-bottom:14px">${escHtml(it.name)} — ${it.qty || 0} ${T('presenti in','in')} ${escHtml(loc.name)}</div>
      ${matches.length ? `
      <div class="form-group">
        <label class="form-label">${T('Paziente','Patient')}</label>
        <select class="form-input" id="transfer-target">${matches.map((x, i) => `<option value="${i}">👤 ${escHtml(x.pt.name)} — ${x.m.totalQty != null ? x.m.totalQty + ' ' + T('rimaste','left') : T('scorta non indicata','no stock')}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label class="form-label">${T('Quante unità sposti?','How many units?')}</label>
        <input class="form-input" id="transfer-qty" type="number" min="0.5" step="0.5" value="${Math.min(it.qty || 1, it.qty || 1)}" style="font-size:22px;font-weight:800;text-align:center">
      </div>
      <button class="btn-primary" onclick="applyTransfer()">${T('Sposta','Move')}</button>` : `
      <div class="allergy-box" style="margin-bottom:10px">${T('Nessun paziente ha questo prodotto in terapia. Aggiungilo prima dalla scheda del paziente.','No patient has this product. Add it from the patient page first.')}</div>`}
      <button class="btn-secondary" onclick="closeModal()">${T('Annulla','Cancel')}</button>
    </div>
  </div>`);
}

function applyTransfer() {
  const ctx = _transferCtx;
  if (!ctx) return;
  const idx = parseInt(g('transfer-target')?.value, 10);
  const target = ctx.matches[idx];
  const qty = parseFloat(g('transfer-qty')?.value);
  if (!target || !qty || qty <= 0) { alert(T('Inserisci una quantità valida','Enter a valid quantity')); return; }
  if (qty > (ctx.it.qty || 0)) { alert(T('Nel deposito ce ne sono solo ' + (ctx.it.qty || 0), 'Only ' + (ctx.it.qty || 0) + ' available')); return; }
  ctx.it.qty = Math.max(0, (ctx.it.qty || 0) - qty);
  const med = target.m;
  if (!med.restocks) med.restocks = [];
  med.restocks.push({ id: uid(), qty, note: T('da ', 'from ') + ctx.loc.name, date: new Date().toISOString() });
  med.totalQty = (med.totalQty || 0) + qty;
  if (ctx.it.expiry && (!med.expiry || ctx.it.expiry < med.expiry)) med.expiry = ctx.it.expiry;
  recalcMedEnd(med);
  logMove(T('Trasferimento','Transfer'), ctx.it.name, qty, '📦 ' + ctx.loc.name + ' → 👤 ' + target.pt.name);
  save();
  closeModal();
  renderLocationDetail();
}

// ── Ordine farmacia ─────────────────────────────────────────
let _orderDays = 30;
let _orderLines = [];

function buildPharmacyOrder(days) {
  const low = getLowMeds();
  return low.map(({patient, med, status}) => {
    const dpd = dosePerDay(med) || 0;
    const need = Math.max(0, Math.ceil(dpd * days - (med.totalQty || 0)));
    const bc = Object.values(D.barcodes || {}).find(b => b.name.toLowerCase() === med.name.toLowerCase());
    const boxQty = bc?.boxQty || null;
    const boxes = boxQty && need > 0 ? Math.max(1, Math.ceil(need / boxQty)) : 1;
    return { name: med.name, patient: patient.name, left: med.totalQty || 0, label: status.label, boxes, boxQty };
  });
}

function orderText() {
  const rows = _orderLines.filter(l => l.boxes > 0).map(l =>
    `• ${l.name} — ${l.boxes} ${T(l.boxes === 1 ? 'confezione' : 'confezioni', 'boxes')}${l.boxQty ? ' (da ' + l.boxQty + ')' : ''} (${T('per','for')} ${l.patient}, ${l.left} ${T('rimaste','left')})`
  ).join('\n');
  const cov = _orderDays === 'manual' ? T('quantità decise a mano','manual quantities') : T('copertura','coverage') + ' ' + _orderDays + ' ' + T('giorni','days');
  return T('ORDINE FARMACI', 'MEDICINE ORDER') + (_fbFacilityName ? ' — ' + _fbFacilityName : '') + '\n'
    + fmtDate(new Date().toISOString()) + ' · ' + cov + '\n\n' + rows;
}

function showOrderModal() {
  const low = getLowMeds();
  if (!low.length) { alert(T('Nessun farmaco da ordinare: le scorte sono a posto! 🎉','Nothing to order: stocks are fine! 🎉')); return; }
  _orderDays = 30;
  _orderLines = buildPharmacyOrder(_orderDays);
  renderOrderModal();
}

function orderSetDays(d) {
  _orderDays = d;
  if (d === 'manual') {
    _orderLines = buildPharmacyOrder(30).map(l => ({ ...l, boxes: 1 }));
  } else {
    _orderLines = buildPharmacyOrder(d);
  }
  renderOrderModal();
}

function orderSetBoxes(i, val) {
  const l = _orderLines[i];
  if (!l) return;
  l.boxes = Math.max(0, parseInt(val, 10) || 0);
}

function orderAdj(i, delta) {
  const l = _orderLines[i];
  if (!l) return;
  l.boxes = Math.max(0, (l.boxes || 0) + delta);
  const n = g('ord-n-' + i);
  if (n) n.value = l.boxes;
}

function renderOrderModal() {
  const phEmail = D.settings.pharmacyEmail || '';
  showModal(`<div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;display:flex;align-items:flex-end" onclick="closeModal()">
    <div style="background:var(--sur);width:100%;max-width:600px;margin:0 auto;border-radius:20px 20px 0 0;padding:20px;max-height:88vh;overflow-y:auto" onclick="event.stopPropagation()">
      <div style="font-size:17px;font-weight:700;margin-bottom:10px">🛒 ${T('Ordine farmacia','Pharmacy order')} (${_orderLines.length})</div>
      <div style="font-size:13px;color:var(--t2);margin-bottom:6px">${T('Confezioni: calcolate in automatico o scritte da te','Boxes: auto-calculated or set by you')}</div>
      <div class="pills" style="margin-bottom:12px">
        ${[30, 60, 90].map(d => `<button class="pill ${_orderDays === d ? 'active' : ''}" onclick="orderSetDays(${d})">${d} ${T('gg','d')}</button>`).join('')}
        <button class="pill ${_orderDays === 'manual' ? 'active' : ''}" onclick="orderSetDays('manual')">✎ ${T('A mano','Manual')}</button>
      </div>
      ${_orderLines.map((l, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--br)">
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(l.name)}</div>
            <div style="font-size:12px;color:var(--t2)">👤 ${escHtml(l.patient)} • ${l.left} ${T('rimaste','left')}${l.boxQty ? ' • ' + T('scatola da','box of') + ' ' + l.boxQty : ''}</div>
          </div>
          <div class="qty-ctrl">
            <button onclick="orderAdj(${i},-1)">−</button>
            <input id="ord-n-${i}" type="number" min="0" value="${l.boxes}" oninput="orderSetBoxes(${i},this.value)"
              style="width:44px;text-align:center;font-size:15px;font-weight:700;border:none;background:none;color:var(--t1)">
            <button onclick="orderAdj(${i},1)">+</button>
          </div>
          <span style="font-size:12px;color:var(--t2)">conf.</span>
        </div>`).join('')}
      <div style="font-size:12px;color:var(--t3);margin-top:6px">${T('Le confezioni sono calcolate in automatico: correggile con − e + se serve. Con 0 la riga non viene inviata.','Boxes are auto-calculated: adjust with − and +. Lines at 0 are not sent.')}</div>
      <div style="margin-top:12px">
        <button class="btn-primary" onclick="sendOrderPdf()">📄 ${T('Invia PDF (email, WhatsApp...)','Send PDF (email, WhatsApp...)')}</button>
        <button class="btn-secondary" onclick="shareOrderWhatsApp()">💬 ${T('Messaggio WhatsApp','WhatsApp message')}</button>
        <button class="btn-secondary" onclick="shareOrderEmail()">✉️ ${T('Email (testo semplice)','Email (plain text)')}${phEmail ? '' : ' *'}</button>
        <button class="btn-secondary" onclick="printOrder()">🖨 ${T('Stampa','Print')}</button>
        <button class="btn-secondary" onclick="copyOrder(this)">📋 ${T('Copia testo','Copy text')}</button>
        <button class="btn-secondary" onclick="closeModal()">${T('Chiudi','Close')}</button>
        ${!phEmail ? `<div style="font-size:12px;color:var(--t3);margin-top:8px">* ${T('Imposta email/telefono della farmacia in Impostazioni per averli già pronti','Set pharmacy email/phone in Settings')}</div>` : ''}
      </div>
    </div>
  </div>`);
}

function makeOrderPdfBlob() {
  const items = _orderLines.filter(l => l.boxes > 0);
  const lines = [];
  lines.push({ text: T('Ordine farmaci','Medicine order'), size: 19, bold: true, gap: 26 });
  if (_fbFacilityName) lines.push({ text: _fbFacilityName, size: 13, bold: true, gap: 18 });
  lines.push({ text: fmtDate(new Date().toISOString()) + (_orderDays === 'manual' ? '' : '  ·  ' + T('copertura','coverage') + ' ' + _orderDays + ' ' + T('giorni','days')), size: 11, gap: 20 });
  lines.push({ text: '', gap: 10 });
  _wrapText(T('Vi chiediamo cortesemente di fornire i seguenti farmaci:','Please kindly supply the following medicines:'), 88).forEach(t => lines.push({ text: t, gap: 16 }));
  lines.push({ text: '', gap: 8 });
  items.forEach(l => {
    const qty = l.boxes + ' ' + T(l.boxes === 1 ? 'confezione' : 'confezioni', l.boxes === 1 ? 'box' : 'boxes') + (l.boxQty ? ' (' + T('da','of') + ' ' + l.boxQty + ')' : '');
    _wrapText('• ' + l.name + ' — ' + qty, 78).forEach((t, i) => lines.push({ text: i ? '   ' + t : t, size: 12.5, bold: true, gap: 18 }));
    lines.push({ text: '   ' + T('per ','for ') + l.patient, size: 10.5, gap: 15 });
  });
  lines.push({ text: '', gap: 14 });
  _wrapText(T('Grazie per la cortese collaborazione.','Thank you for your kind cooperation.'), 88).forEach(t => lines.push({ text: t, gap: 16 }));
  if (_fbFacilityName) lines.push({ text: _fbFacilityName, bold: true, gap: 22 });
  return makePdfBlob(lines);
}

async function sendOrderPdf() {
  if (!_orderLines.filter(l => l.boxes > 0).length) { alert(T('Nessun farmaco da ordinare: metti almeno 1 confezione','Nothing to order: set at least 1 box')); return; }
  const accomp = T('Buongiorno, in allegato il nostro ordine farmaci (PDF). Grazie!','Hello, please find our medicine order attached (PDF). Thank you!') +
    (_fbFacilityName ? ' — ' + _fbFacilityName : '');
  await sharePdfBlob(makeOrderPdfBlob(),
    'ordine-farmaci-' + todayISO() + '.pdf',
    T('Ordine farmaci','Medicine order'), accomp);
}

function shareOrderWhatsApp() {
  const phPhone = (D.settings.pharmacyPhone || '').replace(/[^0-9+]/g, '').replace('+', '');
  window.open('https://wa.me/' + (phPhone ? phPhone : '') + '?text=' + encodeURIComponent(orderText()), '_blank');
}

function shareOrderEmail() {
  const to = D.settings.pharmacyEmail || '';
  location.href = 'mailto:' + to + '?subject=' + encodeURIComponent(T('Ordine farmaci','Medicine order') + (_fbFacilityName ? ' — ' + _fbFacilityName : '')) + '&body=' + encodeURIComponent(orderText());
}

function copyOrder(btn) {
  navigator.clipboard?.writeText(orderText()).then(() => { if (btn) btn.textContent = '✓ ' + T('Copiato!','Copied!'); });
}

function printOrder() {
  const lines = _orderLines.filter(l => l.boxes > 0);
  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>${T('Ordine farmacia','Pharmacy order')}</title>
  <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:24px;color:#1a1a1a;max-width:800px}
  h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:14px;font-size:14px}
  th{text-align:left;font-size:11px;color:#666;text-transform:uppercase;padding:6px 8px;border-bottom:2px solid #ddd}
  td{padding:8px;border-bottom:1px solid #eee}
  .foot{margin-top:26px;font-size:11px;color:#999;text-align:center}</style></head><body>
  <h1>🛒 ${T('Ordine farmaci','Medicine order')}${_fbFacilityName ? ' — ' + escHtml(_fbFacilityName) : ''}</h1>
  <div style="font-size:13px;color:#666">${fmtDate(new Date().toISOString())} · ${_orderDays === 'manual' ? T('quantità decise a mano','manual quantities') : T('copertura','coverage') + ' ' + _orderDays + ' ' + T('giorni','days')}</div>
  <table><thead><tr><th>${T('Farmaco','Medicine')}</th><th>${T('Confezioni','Boxes')}</th><th>${T('Paziente','Patient')}</th><th>${T('Rimaste','Left')}</th></tr></thead>
  <tbody>${lines.map(l => `<tr><td><strong>${escHtml(l.name)}</strong></td><td>${l.boxes}${l.boxQty ? ' (da ' + l.boxQty + ')' : ''}</td><td>${escHtml(l.patient)}</td><td>${l.left}</td></tr>`).join('')}</tbody></table>
  <div class="foot">CareStock • ${fmtDatetime(new Date().toISOString())}</div>
  <script>window.print();<\/script></body></html>`;
  const win = window.open('about:blank', '_blank');
  win.document.write(html);
  win.document.close();
}

// ── Avviso familiare / medico ───────────────────────────────
let _notifyPtId = null;
let _notifyTo = 'family';
let _notifySel = [];

function notifyMedStatus(m) {
  const st = getMedStatus(m);
  const ex = expiryStatus(m.expiry);
  if (st.cls === 'expired') return { alert: true, label: T('terminato', 'finished') };
  if (st.cls === 'low') return { alert: true, label: st.label };
  if (ex && ex.cls !== 'ok') return { alert: true, label: T('confezione in scadenza', 'box expiring') + ' (' + fmtExpiry(m.expiry) + ')' };
  return { alert: false, label: T('da procurare', 'needed') };
}

function showNotifyModal(ptId, keepSel) {
  const pt = D.patients.find(p => p.id === ptId);
  if (!pt) return;
  _notifyPtId = ptId;
  const meds = pt.medicines || [];
  if (!keepSel) {
    _notifySel = meds.filter(m => notifyMedStatus(m).alert).map(m => m.id);
    if (!_notifySel.length && meds.length) _notifySel = [];
  }
  const fam = pt.family || {};
  const doc = pt.doctor || {};
  if (_notifyTo === 'family' && !fam.name && doc.name) _notifyTo = 'doctor';
  if (_notifyTo === 'doctor' && !doc.name && fam.name) _notifyTo = 'family';
  const rec = _notifyTo === 'doctor' ? doc : fam;
  const hasContacts = !!(fam.name || doc.name);

  showModal(`<div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;display:flex;align-items:flex-end" onclick="closeModal()">
    <div style="background:var(--sur);width:100%;max-width:600px;margin:0 auto;border-radius:20px 20px 0 0;padding:20px;max-height:88vh;overflow-y:auto" onclick="event.stopPropagation()">
      <div style="font-size:17px;font-weight:700;margin-bottom:12px">📣 ${T('Avvisa per','Notify for')} ${escHtml(pt.name)}</div>
      ${!hasContacts ? `
        <div class="allergy-box" style="margin-bottom:10px">${T('Nessun contatto salvato per questo paziente. Aggiungi familiare o medico (con telefono/email) modificando la scheda paziente.','No contacts saved. Add family or doctor by editing the patient.')}</div>
        ${canEdit() ? `<button class="btn-primary" onclick="closeModal();S.patientId='${ptId}';navigate('add-patient',{editMode:true})">✎ ${T('Aggiungi contatti','Add contacts')}</button>` : ''}` : `
      <div style="font-size:13px;color:var(--t2);margin-bottom:6px">${T('A chi lo mandi?','Send to whom?')}</div>
      <div class="pills" style="margin-bottom:12px">
        ${fam.name ? `<button class="pill ${_notifyTo === 'family' ? 'active' : ''}" onclick="_notifyTo='family';showNotifyModal('${ptId}', true)">👪 ${escHtml(fam.name)}</button>` : ''}
        ${doc.name ? `<button class="pill ${_notifyTo === 'doctor' ? 'active' : ''}" onclick="_notifyTo='doctor';showNotifyModal('${ptId}', true)">🩺 ${escHtml(doc.name)}</button>` : ''}
      </div>
      <div style="font-size:13px;color:var(--t2);margin-bottom:6px">${T('Quali farmaci segnali? (spunta anche altri se servono)','Which medicines? (tick others too if needed)')}</div>
      <div style="border:1.5px solid var(--br);border-radius:14px;padding:4px 12px;margin-bottom:12px;max-height:230px;overflow-y:auto">
        ${meds.length ? meds.map(m => {
          const ns = notifyMedStatus(m);
          return `<label style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--br);cursor:pointer">
            <input type="checkbox" ${_notifySel.includes(m.id) ? 'checked' : ''} onchange="toggleNotifyMed('${m.id}')" style="width:20px;height:20px;accent-color:var(--p)">
            <span style="flex:1;font-size:14px;font-weight:600">${escHtml(m.name)}</span>
            <span style="font-size:12px;font-weight:600;color:${ns.alert ? 'var(--w)' : 'var(--t3)'}">${ns.alert ? '⚠ ' + ns.label : ''}</span>
          </label>`;
        }).join('') : `<div class="empty" style="padding:14px">${T('Nessun farmaco in scheda','No medicines')}</div>`}
      </div>
      <button class="btn-primary" onclick="sendNotifyPdf()">📄 ${T('Invia PDF (email, WhatsApp...)','Send PDF (email, WhatsApp...)')}</button>
      <button class="btn-secondary" ${rec.phone ? '' : 'disabled style="opacity:.5"'} onclick="sendNotifyWhatsApp()">💬 ${T('Messaggio WhatsApp','WhatsApp message')}${rec.phone ? '' : ' (' + T('nessun numero','no number') + ')'}</button>
      <button class="btn-secondary" ${rec.email ? '' : 'disabled style="opacity:.5"'} onclick="sendNotifyEmail()">✉️ ${T('Email (testo semplice)','Email (plain text)')}${rec.email ? '' : ' (' + T('nessuna email','no email') + ')'}</button>
      <button class="btn-secondary" onclick="copyNotify(this)">📋 ${T('Copia testo','Copy text')}</button>`}
      <button class="btn-secondary" onclick="closeModal()">${T('Chiudi','Close')}</button>
    </div>
  </div>`);
}

function toggleNotifyMed(medId) {
  const i = _notifySel.indexOf(medId);
  if (i >= 0) _notifySel.splice(i, 1);
  else _notifySel.push(medId);
}

function notifySelectedMeds(pt) {
  return (pt.medicines || []).filter(m => _notifySel.includes(m.id));
}

function buildNotifyText(pt) {
  const rec = _notifyTo === 'doctor' ? (pt.doctor || {}) : (pt.family || {});
  const meds = notifySelectedMeds(pt);
  let txt = (rec.name ? T('Gentile ', 'Dear ') + rec.name + ',\n' : '') +
    T(`per ${pt.name} ci occorrono questi farmaci:`, `for ${pt.name} we need these medicines:`) + '\n\n';
  meds.forEach(m => {
    txt += `• ${m.name}\n`;
  });
  txt += '\n' + T('Può gentilmente provvedere? Grazie!','Could you kindly take care of it? Thank you!') +
    (_fbFacilityName ? '\n' + _fbFacilityName : '');
  return txt;
}

// PDF minimale generato direttamente dall'app (nessuna libreria)
function _pdfEsc(s) {
  const MAP = { '—': '-', '–': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...', '•': '\\267', '€': '\\200' };
  let out = '';
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
    else if (c >= 32 && c <= 126) out += ch;
    else if (c >= 160 && c <= 255) out += '\\' + c.toString(8).padStart(3, '0');
    else if (MAP[ch]) out += MAP[ch];
    else out += ' ';
  }
  return out;
}

function makePdfBlob(lines) {
  // Impagina: nuova pagina quando lo spazio finisce
  const pages = [];
  let cur = [], y = 790;
  lines.forEach(l => {
    const size = l.size || 11.5;
    const gap = (l.gap != null ? l.gap : size + 7);
    if (y - gap < 56) { pages.push(cur); cur = []; y = 790; }
    y -= gap;
    if (l.text) cur.push(`/F${l.bold ? '2' : '1'} ${size} Tf 1 0 0 1 56 ${Math.round(y)} Tm (${_pdfEsc(l.text)}) Tj`);
  });
  pages.push(cur);

  const objs = {};
  const pageIds = [];
  let next = 5; // 1 catalogo, 2 pages, 3 font, 4 font grassetto
  pages.forEach(() => { pageIds.push(next); next += 2; });
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map(id => id + ' 0 R').join(' ')}] /Count ${pages.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((ops, i) => {
    const pid = pageIds[i], cid = pid + 1;
    objs[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cid} 0 R >>`;
    const content = 'BT\n' + ops.join('\n') + '\nET';
    objs[cid] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  const total = next - 1;
  let pdf = '%PDF-1.4\n';
  const offs = {};
  for (let i = 1; i <= total; i++) {
    offs[i] = pdf.length;
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  let xrefStr = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= total; i++) xrefStr += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += xrefStr + `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: 'application/pdf' });
}

async function sharePdfBlob(blob, fname, title, text) {
  const file = new File([blob], fname, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title, text });
      return;
    } catch(e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  alert(T('PDF scaricato: allegalo alla mail o al messaggio','PDF downloaded: attach it to your email or message'));
}

function _wrapText(s, max) {
  const words = String(s).split(' ');
  const out = [];
  let cur = '';
  words.forEach(w => {
    if ((cur + ' ' + w).trim().length > max) { if (cur) out.push(cur); cur = w; }
    else cur = (cur ? cur + ' ' : '') + w;
  });
  if (cur) out.push(cur);
  return out;
}

function makeNotifyPdfBlob(pt) {
  const rec = _notifyTo === 'doctor' ? (pt.doctor || {}) : (pt.family || {});
  const meds = notifySelectedMeds(pt);
  const lines = [];
  lines.push({ text: T('Farmaci da procurare','Medicines needed'), size: 19, bold: true, gap: 26 });
  lines.push({ text: T('Paziente: ','Patient: ') + pt.name, size: 13, bold: true, gap: 20 });
  if (pt.allergies) _wrapText(T('Note / allergie: ','Notes / allergies: ') + pt.allergies, 86).forEach(t => lines.push({ text: t, size: 11, gap: 16 }));
  lines.push({ text: fmtDate(new Date().toISOString()) + (_fbFacilityName ? '  ·  ' + _fbFacilityName : ''), size: 11, gap: 18 });
  lines.push({ text: '', gap: 12 });
  if (rec.name) lines.push({ text: T('Gentile ','Dear ') + rec.name + ',', gap: 18 });
  _wrapText(T('ci occorrono i seguenti farmaci:', 'we need the following medicines:'), 88).forEach(t => lines.push({ text: t, gap: 16 }));
  lines.push({ text: '', gap: 8 });
  meds.forEach(m => {
    _wrapText('• ' + m.name, 84).forEach((t, i) => lines.push({ text: i ? '   ' + t : t, size: 12.5, bold: true, gap: 19 }));
  });
  lines.push({ text: '', gap: 14 });
  _wrapText(T('La ringraziamo per la cortese collaborazione.','Thank you for your kind cooperation.'), 88).forEach(t => lines.push({ text: t, gap: 16 }));
  if (_fbFacilityName) lines.push({ text: _fbFacilityName, bold: true, gap: 22 });
  return makePdfBlob(lines);
}

async function sendNotifyPdf() {
  const pt = D.patients.find(p => p.id === _notifyPtId);
  if (!pt) return;
  if (!notifySelectedMeds(pt).length) { alert(T('Spunta almeno un farmaco','Tick at least one medicine')); return; }
  const recN = _notifyTo === 'doctor' ? (pt.doctor || {}) : (pt.family || {});
  const accompText = (recN.name ? T('Gentile ','Dear ') + recN.name + ', ' : '') +
    T('ci occorrono questi farmaci (vedi PDF allegato). Grazie!','we need these medicines (see attached PDF). Thank you!') +
    (_fbFacilityName ? ' — ' + _fbFacilityName : '');
  await sharePdfBlob(makeNotifyPdfBlob(pt),
    T('farmaci','medicines') + '-' + pt.name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() + '.pdf',
    T('Farmaci da procurare','Medicines needed'), accompText);
}

function sendNotifyWhatsApp() {
  const pt = D.patients.find(p => p.id === _notifyPtId);
  if (!pt) return;
  if (!notifySelectedMeds(pt).length) { alert(T('Spunta almeno un farmaco','Tick at least one medicine')); return; }
  const rec = _notifyTo === 'doctor' ? (pt.doctor || {}) : (pt.family || {});
  const phone = (rec.phone || '').replace(/[^0-9+]/g, '').replace('+', '');
  window.open('https://wa.me/' + phone + '?text=' + encodeURIComponent(buildNotifyText(pt)), '_blank');
}

function sendNotifyEmail() {
  const pt = D.patients.find(p => p.id === _notifyPtId);
  if (!pt) return;
  if (!notifySelectedMeds(pt).length) { alert(T('Spunta almeno un farmaco','Tick at least one medicine')); return; }
  const rec = _notifyTo === 'doctor' ? (pt.doctor || {}) : (pt.family || {});
  location.href = 'mailto:' + (rec.email || '') +
    '?subject=' + encodeURIComponent(T('Farmaci da procurare — ','Medicines needed — ') + pt.name) +
    '&body=' + encodeURIComponent(buildNotifyText(pt));
}

function copyNotify(btn) {
  const pt = D.patients.find(p => p.id === _notifyPtId);
  if (!pt) return;
  navigator.clipboard?.writeText(buildNotifyText(pt)).then(() => { if (btn) btn.textContent = '✓ ' + T('Copiato!','Copied!'); });
}

// ── PAGE: Storico movimenti ─────────────────────────────────
function renderHistory() {
  g('bar-history').innerHTML = `
    <button class="bar-back" onclick="back()">${svgIcon('ic-arrow-left',22)}</button>
    <span class="bar-title">🕐 ${T('Storico movimenti','Movement history')}</span>`;
  g('content-history').innerHTML = `<div class="search-wrap">${svgIcon('ic-search',16)}
    <input class="search-inp" placeholder="${T('Cerca prodotto, deposito, operatore...','Search...')}" value="${escHtml(S.histSearch || '')}"
      oninput="S.histSearch=this.value;renderHistoryList()"></div>
    <div id="hist-list"></div>`;
  renderHistoryList();
}

function renderHistoryList() {
  const el = g('hist-list');
  if (!el) return;
  const mov = [...(D.movements || [])].reverse();
  const q = (S.histSearch || '').toLowerCase();
  const filtered = q ? mov.filter(m => (m.name + ' ' + m.where + ' ' + m.op).toLowerCase().includes(q)) : mov;
  const ICONS = {};
  ICONS[T('Carico','Load')] = ['＋', 'var(--p)'];
  ICONS[T('Scarico','Unload')] = ['−', 'var(--w)'];
  ICONS[T('Trasferimento','Transfer')] = ['⇄', '#7c3aed'];
  ICONS[T('Rettifica','Adjust')] = ['✎', 'var(--t3)'];
  let lastDay = '';
  let html = '';
  if (!filtered.length) html = `<div class="empty">${T('Nessun movimento registrato ancora. I carichi e scarichi da scanner, ricariche e trasferimenti compariranno qui.','No movements yet.')}</div>`;
  filtered.slice(0, 200).forEach(m => {
    const day = fmtDate(m.date);
    if (day !== lastDay) { html += `<div class="sec-hd">${day}</div>`; lastDay = day; }
    const ic = ICONS[m.action] || ['•', 'var(--t2)'];
    const isAdj = m.action === T('Rettifica','Adjust');
    html += `<div class="db-item">
      <div class="db-item-icon" style="border-color:${ic[1]};color:${ic[1]};font-weight:800">${ic[0]}</div>
      <div class="db-item-info">
        <div class="db-item-name">${escHtml(m.name)} <span style="color:${ic[1]};font-weight:700">${isAdj ? '→ ' : ''}${m.qty}</span></div>
        <div class="db-item-sub">${escHtml(m.where)} • ${escHtml(m.op)} • ${new Date(m.date).toTimeString().slice(0,5)}</div>
      </div>
    </div>`;
  });
  el.innerHTML = html;
}

// ── PAGE: Statistiche consumi ───────────────────────────────
function renderStats() {
  g('bar-stats').innerHTML = `
    <button class="bar-back" onclick="back()">${svgIcon('ic-arrow-left',22)}</button>
    <span class="bar-title">📊 ${T('Statistiche consumi','Consumption stats')}</span>`;
  const off = S.statsMonth || 0;
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - off, 1);
  const mKey = target.toISOString().slice(0, 7);
  const mov = (D.movements || []).filter(m => (m.date || '').slice(0, 7) === mKey);
  const unloadLbl = T('Scarico','Unload');
  const loadLbl = T('Carico','Load');
  const transferLbl = T('Trasferimento','Transfer');
  const consumed = {};
  mov.forEach(m => {
    if (m.action === unloadLbl || m.action === transferLbl) consumed[m.name] = (consumed[m.name] || 0) + Math.abs(m.qty || 0);
  });
  const rows = Object.entries(consumed).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const maxV = rows.length ? rows[0][1] : 1;
  const nLoad = mov.filter(m => m.action === loadLbl).length;
  const nUnload = mov.filter(m => m.action === unloadLbl).length;
  const nTransfer = mov.filter(m => m.action === transferLbl).length;
  g('content-stats').innerHTML = `
    <div class="cal-toggle" style="margin:0 auto 16px">
      <button class="cal-tab" onclick="S.statsMonth=(S.statsMonth||0)+1;renderStats()">‹</button>
      <span style="padding:8px 16px;font-size:14px;font-weight:700">${MONTHS_IT[target.getMonth()]} ${target.getFullYear()}</span>
      <button class="cal-tab" ${off === 0 ? 'disabled style="opacity:.3"' : ''} onclick="S.statsMonth=Math.max(0,(S.statsMonth||0)-1);renderStats()">›</button>
    </div>
    <div class="stat-row">
      <div class="stat-tile"><div class="num">${nLoad}</div><div class="lbl">${T('Carichi','Loads')}</div></div>
      <div class="stat-tile"><div class="num" style="color:var(--w)">${nUnload}</div><div class="lbl">${T('Scarichi','Unloads')}</div></div>
      <div class="stat-tile"><div class="num" style="color:#7c3aed">${nTransfer}</div><div class="lbl">${T('Trasferimenti','Transfers')}</div></div>
    </div>
    <div class="home-card">
      <div class="home-card-hd">💊 ${T('Consumi del mese (scarichi + trasferimenti)','Monthly consumption')}</div>
      ${rows.length ? rows.map(([name, v]) => `
        <div style="padding:7px 0">
          <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:4px">
            <span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:8px">${escHtml(name)}</span>
            <strong style="color:var(--p)">${v}</strong>
          </div>
          <div style="background:var(--bg);border-radius:50px;height:8px;overflow:hidden">
            <div style="background:var(--grad);height:100%;border-radius:50px;width:${Math.max(4, Math.round(v / maxV * 100))}%"></div>
          </div>
        </div>`).join('') : `<div class="home-empty">${T('Nessun movimento in questo mese','No movements this month')}</div>`}
    </div>
    <div style="font-size:12px;color:var(--t3);text-align:center;margin-top:6px">${T('I dati vengono dai movimenti registrati (scanner, ricariche, trasferimenti, rettifiche)','Data comes from recorded movements')}</div>`;
}

// ── Report mensile stampabile ───────────────────────────────
function printMonthlyReport() {
  const now = new Date();
  const mKey = now.toISOString().slice(0, 7);
  const mov = (D.movements || []).filter(m => (m.date || '').slice(0, 7) === mKey);
  const expiring = getExpiringItems();
  const low = getLowMeds();
  const consumed = {};
  mov.forEach(m => {
    if (m.action === T('Scarico','Unload') || m.action === T('Trasferimento','Transfer')) consumed[m.name] = (consumed[m.name] || 0) + Math.abs(m.qty || 0);
  });
  const consRows = Object.entries(consumed).sort((a, b) => b[1] - a[1]);
  let stockRows = '';
  D.patients.forEach(pt => (pt.medicines || []).forEach(m => {
    const st = getMedStatus(m);
    stockRows += `<tr><td>${escHtml(pt.name)}</td><td><strong>${escHtml(m.name)}</strong></td><td>${m.totalQty ?? '—'}</td><td>${m.endDate ? fmtDate(m.endDate) : '—'}</td><td>${m.expiry ? fmtExpiry(m.expiry) : '—'}</td><td>${st.label || '—'}</td></tr>`;
  }));
  let locRows = '';
  (D.locations || []).forEach(l => (l.items || []).forEach(it => {
    locRows += `<tr><td>${escHtml(l.name)}</td><td><strong>${escHtml(it.name)}</strong></td><td>${it.qty || 0}</td><td>${it.expiry ? fmtExpiry(it.expiry) : '—'}</td></tr>`;
  }));
  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Report ${mKey}</title>
  <style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:24px;color:#1a1a1a;max-width:900px}
  h1{font-size:22px;margin-bottom:2px}h2{font-size:15px;margin:22px 0 8px;border-bottom:2px solid #0d9488;padding-bottom:4px;color:#0d9488}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{text-align:left;font-size:10.5px;color:#666;text-transform:uppercase;padding:5px 7px;border-bottom:2px solid #ddd}
  td{padding:6px 7px;border-bottom:1px solid #eee}
  .foot{margin-top:28px;font-size:11px;color:#999;text-align:center}
  @media print{body{margin:10px}}</style></head><body>
  <h1>📄 ${T('Report mensile','Monthly report')}${_fbFacilityName ? ' — ' + escHtml(_fbFacilityName) : ''}</h1>
  <div style="font-size:13px;color:#666">${MONTHS_IT[now.getMonth()]} ${now.getFullYear()} • ${T('generato il','generated on')} ${fmtDatetime(now.toISOString())}</div>
  <h2>${T('Riepilogo','Summary')}</h2>
  <table><tbody>
    <tr><td>${T('Pazienti in struttura','Patients')}</td><td><strong>${D.patients.length}</strong></td></tr>
    <tr><td>${T('Scorte in esaurimento','Low stock')}</td><td><strong>${low.length}</strong></td></tr>
    <tr><td>${T('Prodotti in scadenza (30 gg)','Expiring (30d)')}</td><td><strong>${expiring.length}</strong></td></tr>
    <tr><td>${T('Movimenti del mese','Movements this month')}</td><td><strong>${mov.length}</strong></td></tr>
  </tbody></table>
  <h2>${T('Scorte pazienti','Patient stocks')}</h2>
  <table><thead><tr><th>${T('Paziente','Patient')}</th><th>${T('Farmaco','Medicine')}</th><th>${T('Rimaste','Left')}</th><th>${T('Fine prevista','Expected end')}</th><th>${T('Scadenza','Expiry')}</th><th>${T('Stato','Status')}</th></tr></thead><tbody>${stockRows || '<tr><td colspan="6">—</td></tr>'}</tbody></table>
  ${locRows ? `<h2>${T('Depositi','Storage')}</h2>
  <table><thead><tr><th>${T('Deposito','Storage')}</th><th>${T('Prodotto','Product')}</th><th>${T('Quantità','Qty')}</th><th>${T('Scadenza','Expiry')}</th></tr></thead><tbody>${locRows}</tbody></table>` : ''}
  ${expiring.length ? `<h2>⏰ ${T('In scadenza','Expiring')}</h2>
  <table><thead><tr><th>${T('Prodotto','Product')}</th><th>${T('Dove','Where')}</th><th>${T('Scadenza','Expiry')}</th></tr></thead>
  <tbody>${expiring.map(e => `<tr><td><strong>${escHtml(e.name)}</strong></td><td>${e.icon} ${escHtml(e.where)}</td><td>${fmtExpiry(e.expiry)} (${e.st.label})</td></tr>`).join('')}</tbody></table>` : ''}
  ${consRows.length ? `<h2>💊 ${T('Consumi del mese','Monthly consumption')}</h2>
  <table><thead><tr><th>${T('Prodotto','Product')}</th><th>${T('Unità consumate','Units used')}</th></tr></thead>
  <tbody>${consRows.map(([n, v]) => `<tr><td>${escHtml(n)}</td><td><strong>${v}</strong></td></tr>`).join('')}</tbody></table>` : ''}
  <div class="foot">CareStock • ${fmtDatetime(now.toISOString())}</div>
  <script>window.print();<\/script></body></html>`;
  const win = window.open('about:blank', '_blank');
  win.document.write(html);
  win.document.close();
}

// ── Backup settimanale ──────────────────────────────────────
function backupDue() {
  try {
    const last = localStorage.getItem('cs_last_backup');
    return !last || (Date.now() - new Date(last).getTime()) > 7 * 86400000;
  } catch(e) { return false; }
}

// ── Riconoscimento da foto (OCR) ────────────────────────────
let _ocrWorker = null;
let _ocrBusy = false;
let _ocrCands = [];
let _ocrLastText = '';

function ocrPickPhoto() {
  if (_ocrBusy) return;
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.capture = 'environment';
  inp.onchange = () => { if (inp.files && inp.files[0]) runOcr(inp.files[0]); };
  inp.click();
}

function ocrStatus(msg) {
  const res = g('scan-result');
  if (res) res.innerHTML = `<div class="section-box" style="text-align:center;color:var(--t2);font-size:14px">${msg}</div>`;
}

async function ensureOcrWorker() {
  if (_ocrWorker) return _ocrWorker;
  if (typeof Tesseract === 'undefined') {
    ocrStatus('⏳ ' + T('Scarico il lettore di testo (solo la prima volta, poi resta nel telefono)...','Downloading text reader (first time only)...'));
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('download-failed'));
      document.head.appendChild(s);
    });
  }
  _ocrWorker = await Tesseract.createWorker('ita');
  return _ocrWorker;
}

function ocrLoadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1400;
      const sc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * sc);
      c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad-image')); };
    img.src = url;
  });
}

async function runOcr(file) {
  _ocrBusy = true;
  _scanPaused = true;
  try {
    const img = await ocrLoadImage(file);
    const worker = await ensureOcrWorker();
    ocrStatus('🔎 ' + T('Leggo il testo sulla scatola...','Reading text on the box...'));
    const { data } = await worker.recognize(img);
    _ocrLastText = (data && data.text) || '';
    showOcrResults(ocrMatchCandidates(_ocrLastText));
  } catch(e) {
    ocrStatus('⚠ ' + T('Riconoscimento non riuscito. Serve la connessione la prima volta; riprova con una foto nitida e dritta del fronte della scatola.','Recognition failed. Connection needed first time; retry with a sharp, straight photo of the box front.'));
    _scanPaused = false;
  }
  _ocrBusy = false;
}

function ocrMatchCandidates(text) {
  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9,.]/g, ' ').replace(/\s+/g, ' ').trim();
  const t = ' ' + norm(text) + ' ';
  if (t.trim().length < 3) return [];
  const seen = new Set();
  const cands = [];
  const addCand = (name) => {
    const key = norm(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const words = key.split(' ').filter(w => w.length >= 2);
    if (!words.length) return;
    let matched = 0, numTot = 0, numOk = 0;
    words.forEach(w => {
      const isNum = /\d/.test(w);
      if (isNum) numTot++;
      const hit = t.includes(' ' + w + ' ') || (w.length >= 5 && t.includes(w));
      if (hit) { matched++; if (isNum) numOk++; }
    });
    let score = matched / words.length;
    // Il nome commerciale (prima parola) deve comparire nella foto
    if (!(t.includes(' ' + words[0] + ' ') || (words[0].length >= 5 && t.includes(words[0])))) score *= 0.2;
    // Se il nome ha un dosaggio che nella foto non compare, penalizza (rischio dosaggio sbagliato)
    if (numTot > 0 && numOk === 0) score *= 0.4;
    if (score >= 0.45) cands.push({ name, score });
  };
  Object.values(D.barcodes || {}).forEach(b => addCand(b.name));
  D.patients.forEach(p => (p.medicines || []).forEach(m => addCand(m.name)));
  (D.locations || []).forEach(l => (l.items || []).forEach(it => addCand(it.name)));
  D.medicineDb.forEach(m => addCand(m.name));
  if (typeof BUILTIN_MEDS !== 'undefined') BUILTIN_MEDS.forEach(b => addCand(b[0]));
  cands.sort((a, b) => b.score - a.score);
  return cands.slice(0, 5);
}

function showOcrResults(cands) {
  const res = g('scan-result');
  if (res) res.innerHTML = '';
  _ocrCands = cands;
  const rows = cands.map((c, i) => `
    <div class="autocomplete-item" style="display:flex;align-items:center;gap:10px;border:1.5px solid var(--br);border-radius:10px;margin-bottom:8px" onclick="ocrPick(${i})">
      <div style="flex:1;font-size:15px;font-weight:600">${escHtml(c.name)}</div>
      <span style="font-size:12px;font-weight:700;color:${c.score >= 0.8 ? 'var(--p)' : 'var(--w)'}">${Math.round(c.score * 100)}%</span>
    </div>`).join('');
  showModal(`<div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;display:flex;align-items:flex-end" onclick="closeScanModal()">
    <div style="background:var(--sur);width:100%;max-width:600px;margin:0 auto;border-radius:20px 20px 0 0;padding:20px;max-height:85vh;overflow-y:auto" onclick="event.stopPropagation()">
      <div style="font-size:17px;font-weight:700;margin-bottom:4px">${cands.length ? T('È uno di questi?','Is it one of these?') : T('Non l\'ho trovato nel prontuario','Not found in the database')}</div>
      <div style="font-size:13px;color:var(--t2);margin-bottom:14px">${cands.length ? T('Tocca il prodotto giusto. Controlla bene il dosaggio!','Tap the right product. Double-check the dosage!') : T('Nessun problema: aggiungilo tu qui sotto. L\'app lo impara e alla prossima foto lo riconosce da sola.','No problem: add it below. The app learns it and will recognize it in the next photo.')}</div>
      ${rows}
      <button class="btn-primary" style="margin-top:0" onclick="ocrAddNew()">➕ ${T('Prodotto nuovo / non in lista','New product / not listed')}</button>
      <button class="btn-secondary" onclick="closeScanModal();ocrPickPhoto()">📷 ${T('Rifai la foto','Retake photo')}</button>
      <button class="btn-secondary" onclick="closeScanModal()">${T('Annulla','Cancel')}</button>
    </div>
  </div>`);
}

function ocrAddNew() {
  closeModal();
  createInternalLabel();
  _scanLabelFlow = false; // dopo il salvataggio: vai al carico/scarico
  // Precompila con la riga più "da nome prodotto" letta dalla foto
  const line = (_ocrLastText || '').split('\n')
    .map(s => s.replace(/[^\wÀ-ÿ0-9 ,./]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(s => s.length >= 4 && s.length <= 40 && /[a-zA-Z]{3}/.test(s))[0] || '';
  const inp = g('scan-assoc-name');
  if (inp && !inp.value) inp.value = line;
}

function ocrPick(i) {
  const c = _ocrCands[i];
  if (!c) return;
  const entry = Object.entries(D.barcodes || {}).find(([, b]) => b.name.toLowerCase() === c.name.toLowerCase());
  closeModal();
  if (entry) {
    _scanCurrentCode = entry[0];
    showScanActionModal();
  } else {
    // Prodotto nuovo: crea un codice interno con il nome già compilato
    createInternalLabel();
    _scanLabelFlow = false; // dopo il salvataggio: vai al carico/scarico, non alla lista etichette
    const inp = g('scan-assoc-name');
    if (inp) inp.value = c.name;
  }
}

// ── Etichette interne (per scatole senza codice a barre) ────
const C128 = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232'];

function code128Svg(text, height) {
  height = height || 60;
  let sum = 104;
  const vals = [];
  for (let i = 0; i < text.length; i++) {
    const v = text.charCodeAt(i) - 32;
    if (v < 0 || v > 94) return '';
    vals.push(v);
    sum += v * (i + 1);
  }
  const seq = [104].concat(vals, [sum % 103]);
  const pattern = seq.map(v => C128[v]).join('') + '2331112';
  const scale = 2;
  let x = 10 * scale; // zona bianca iniziale
  let rects = '';
  for (let i = 0; i < pattern.length; i++) {
    const w = parseInt(pattern[i]) * scale;
    if (i % 2 === 0) rects += `<rect x="${x}" y="0" width="${w}" height="${height}"/>`;
    x += w;
  }
  x += 10 * scale; // zona bianca finale
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="${height}" viewBox="0 0 ${x} ${height}" style="background:#fff"><rect x="0" y="0" width="${x}" height="${height}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}

function internalLabels() {
  return Object.entries(D.barcodes || {})
    .filter(([code]) => /^CS\d+$/.test(code))
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function createInternalLabel() {
  if (!D.barcodes) D.barcodes = {};
  let n = 1;
  Object.keys(D.barcodes).forEach(k => {
    const m = k.match(/^CS(\d+)$/);
    if (m) n = Math.max(n, parseInt(m[1], 10) + 1);
  });
  _scanCurrentCode = 'CS' + String(n).padStart(4, '0');
  _scanPaused = true;
  _scanLabelFlow = true;
  showScanAssociateModal();
}

function showLabelsModal() {
  const labels = internalLabels();
  const rows = labels.map(([code, info]) => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--br)">
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600">${escHtml(info.name)}</div>
        <div style="font-size:12px;color:var(--t2)">${code} · ${T('scatola da','box of')} ${info.boxQty}</div>
      </div>
      <button class="ib" style="color:var(--r)" onclick="deleteInternalLabel('${code}')">${svgIcon('ic-trash', 18)}</button>
    </div>`).join('');
  showModal(`<div style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:60;display:flex;align-items:flex-end" onclick="closeScanModal()">
    <div style="background:var(--sur);width:100%;max-width:600px;margin:0 auto;border-radius:20px 20px 0 0;padding:20px;max-height:85vh;overflow-y:auto" onclick="event.stopPropagation()">
      <div style="font-size:17px;font-weight:700;margin-bottom:4px">${T('Etichette interne','Internal labels')}</div>
      <div style="font-size:13px;color:var(--t2);margin-bottom:12px">${T('Per le scatole senza codice a barre: stampa le etichette e attaccale sul cassetto o su un foglio, poi scansionale come un codice normale.','For boxes without a barcode: print the labels and stick them on the drawer or a sheet, then scan them like a normal code.')}</div>
      ${labels.length ? rows : `<div class="empty" style="padding:20px">${T('Nessuna etichetta ancora creata','No labels created yet')}</div>`}
      <button class="btn-primary" onclick="closeModal();createInternalLabel()">+ ${T('Crea etichetta prodotto','Create product label')}</button>
      ${labels.length ? `<button class="btn-secondary" onclick="printLabels()">🖨 ${T('Stampa etichette','Print labels')} (${labels.length})</button>` : ''}
      <button class="btn-secondary" onclick="closeScanModal()">${T('Chiudi','Close')}</button>
    </div>
  </div>`);
}

function deleteInternalLabel(code) {
  const info = (D.barcodes || {})[code];
  if (!info) return;
  if (!confirm(T(`Eliminare l'etichetta ${code} (${info.name})?`, `Delete label ${code} (${info.name})?`))) return;
  delete D.barcodes[code];
  save();
  showLabelsModal();
}

function printLabels() {
  const labels = internalLabels();
  if (!labels.length) return;
  const cards = labels.map(([code, info]) => `
    <div class="label-card">
      <div class="label-name">${escHtml(info.name)}</div>
      <div class="label-sub">${T('Scatola da','Box of')} ${info.boxQty}</div>
      ${code128Svg(code, 70)}
      <div class="label-code">${code}</div>
    </div>`).join('');
  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>${T('Etichette CareStock','CareStock labels')}</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:16px;color:#1a1a1a}
    h1{font-size:18px}
    .grid{display:flex;flex-wrap:wrap;gap:0}
    .label-card{width:47%;box-sizing:border-box;border:1.5px dashed #999;padding:12px;text-align:center;margin:0 1% 10px;page-break-inside:avoid;background:#fff}
    .label-name{font-size:15px;font-weight:700;margin-bottom:2px}
    .label-sub{font-size:12px;color:#666;margin-bottom:8px}
    .label-code{font-size:13px;font-weight:600;letter-spacing:2px;margin-top:4px;font-family:monospace}
    svg{max-width:100%}
    @media print{h1,.hint{display:none}body{margin:6px}}
  </style></head><body>
  <h1>${T('Etichette interne CareStock','CareStock internal labels')}</h1>
  <div class="hint" style="font-size:13px;color:#666;margin-bottom:12px">${T('Ritaglia lungo le linee tratteggiate. Attacca le etichette sui cassetti/ripiani o su un foglio plastificato.','Cut along the dashed lines. Stick the labels on drawers/shelves or a laminated sheet.')}</div>
  <div class="grid">${cards}</div>
  <script>window.print();<\/script>
  </body></html>`;
  const win = window.open('about:blank', '_blank');
  win.document.write(html);
  win.document.close();
}

// ── Export / Import ─────────────────────────────────────────
function exportData() {
  const json = JSON.stringify(D, null, 2);
  const blob = new Blob([json], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const facSlug = _fbFacilityName ? `-${_fbFacilityName.replace(/[^a-zA-Z0-9]/g,'-')}` : '';
  a.download = `backup${facSlug}-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  try { localStorage.setItem('cs_last_backup', new Date().toISOString()); } catch(e) {}
  if (S.page === 'home') renderPage('home');
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (!Array.isArray(parsed.patients) || !Array.isArray(parsed.operators)) {
          alert(T('File non valido o corrotto.', 'Invalid or corrupted file.')); return;
        }
        const msg = T(
          `Importare ${parsed.patients.length} pazienti e ${parsed.medicineDb?.length||0} farmaci dal database?\n\nI dati attuali verranno sostituiti.`,
          `Import ${parsed.patients.length} patients and ${parsed.medicineDb?.length||0} database medicines?\n\nCurrent data will be replaced.`
        );
        if (!confirm(msg)) return;
        D = parsed;
        save();
        closeModal();
        navigate('home');
      } catch(err) {
        alert(T('Errore nella lettura del file.', 'Error reading file.'));
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ── PIN ──────────────────────────────────────────────────────
const PIN_KEY = 'medicinali_pin';
let _pinBuffer = '';
let _pinMode = 'unlock'; // 'unlock' | 'set-new' | 'set-confirm'
let _pinTemp = '';

function getPin() { return localStorage.getItem(PIN_KEY) || ''; }

function checkPinOnStart() {
  if (!getPin()) return;
  _pinBuffer = '';
  _pinMode = 'unlock';
  renderPinScreen();
}

function renderPinScreen() {
  const isUnlock = _pinMode === 'unlock';
  const isConfirm = _pinMode === 'set-confirm';
  const title = isUnlock
    ? T('Inserisci PIN', 'Enter PIN')
    : isConfirm
    ? T('Conferma nuovo PIN', 'Confirm new PIN')
    : T('Nuovo PIN (4 cifre)', 'New PIN (4 digits)');

  let el = g('pin-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pin-overlay';
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div class="pin-overlay">
      <div style="font-size:26px;font-weight:800;color:#fff">CareStock</div>
      ${isUnlock ? `<div style="font-size:14px;color:rgba(255,255,255,.7);margin-top:6px">${T('Inserisci il PIN per accedere','Enter PIN to access')}</div>` : ''}
      <div style="font-size:16px;font-weight:600;color:rgba(255,255,255,.9);margin-top:${isUnlock?'32px':'16px'}">${title}</div>
      <div class="pin-dots">
        ${[0,1,2,3].map(i => `<div class="pin-dot ${i < _pinBuffer.length ? 'filled' : ''}" id="pd-${i}"></div>`).join('')}
      </div>
      <div id="pin-err" style="color:#ffcccc;font-size:13px;min-height:18px;text-align:center"></div>
      <div class="pin-keypad">
        ${[1,2,3,4,5,6,7,8,9,'','0','⌫'].map(k =>
          k === '' ? '<div></div>' :
          `<button class="pin-key ${k==='⌫'?'del':''}" onclick="pinPress('${k}')">${k}</button>`
        ).join('')}
      </div>
      ${isUnlock ? `<button onclick="forgotPin()" style="margin-top:28px;background:none;border:none;color:rgba(255,255,255,.6);font-size:13px;cursor:pointer">${T('PIN dimenticato?','Forgot PIN?')}</button>` : `<button onclick="cancelPinSetup()" style="margin-top:28px;background:none;border:none;color:rgba(255,255,255,.6);font-size:13px;cursor:pointer">${T('Annulla','Cancel')}</button>`}
    </div>`;
}

function pinPress(key) {
  if (key === '⌫') {
    _pinBuffer = _pinBuffer.slice(0, -1);
  } else if (_pinBuffer.length < 4) {
    _pinBuffer += key;
  }
  // Update dots
  for (let i = 0; i < 4; i++) {
    const dot = g(`pd-${i}`);
    if (dot) dot.className = 'pin-dot' + (i < _pinBuffer.length ? ' filled' : '');
  }
  if (_pinBuffer.length === 4) {
    setTimeout(() => handlePinComplete(), 120);
  }
}

function handlePinComplete() {
  if (_pinMode === 'unlock') {
    if (_pinBuffer === getPin()) {
      g('pin-overlay')?.remove();
    } else {
      const err = g('pin-err');
      if (err) err.textContent = T('PIN errato. Riprova.', 'Wrong PIN. Try again.');
      _pinBuffer = '';
      for (let i = 0; i < 4; i++) {
        const dot = g(`pd-${i}`);
        if (dot) dot.classList.remove('filled');
      }
    }
  } else if (_pinMode === 'set-new') {
    _pinTemp = _pinBuffer;
    _pinBuffer = '';
    _pinMode = 'set-confirm';
    renderPinScreen();
  } else if (_pinMode === 'set-confirm') {
    if (_pinBuffer === _pinTemp) {
      localStorage.setItem(PIN_KEY, _pinBuffer);
      g('pin-overlay')?.remove();
      alert(T('PIN impostato con successo!', 'PIN set successfully!'));
      renderSettings();
    } else {
      const err = g('pin-err');
      if (err) err.textContent = T('I PIN non corrispondono. Riprova.', 'PINs don\'t match. Try again.');
      _pinBuffer = '';
      _pinTemp = '';
      _pinMode = 'set-new';
      setTimeout(() => renderPinScreen(), 800);
    }
  }
}

function showSetPinModal() {
  _pinBuffer = '';
  _pinTemp = '';
  _pinMode = 'set-new';
  renderPinScreen();
}

function confirmRemovePin() {
  if (confirm(T('Rimuovere il PIN? L\'app non sarà più protetta.', 'Remove PIN? The app will no longer be protected.'))) {
    localStorage.removeItem(PIN_KEY);
    renderSettings();
  }
}

function forgotPin() {
  if (confirm(T('Per resettare il PIN devi cancellare i dati del sito dal browser.\nVuoi aprire le istruzioni?', 'To reset the PIN you must clear site data from the browser.\nOpen instructions?'))) {
    alert(T('Sul telefono:\nImpostazioni browser → Privacy → Dati siti → cerca l\'URL dell\'app → Cancella.', 'On phone:\nBrowser settings → Privacy → Site data → find the app URL → Clear.'));
  }
}

function cancelPinSetup() {
  g('pin-overlay')?.remove();
  _pinBuffer = '';
}

// ── Condivisione rapida ──────────────────────────────────────
function sharePatient(id) {
  const pt = getPatient(id);
  if (!pt) return;

  const html = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:50;display:flex;align-items:flex-end" onclick="closeModal()">
    <div style="background:var(--sur);width:100%;border-radius:20px 20px 0 0;padding:20px" onclick="event.stopPropagation()">
      <div style="font-size:17px;font-weight:700;margin-bottom:6px">${T('Condividi scheda','Share card')}</div>
      <div style="font-size:13px;color:var(--t2);margin-bottom:18px">${escHtml(pt.name)} — ${T('Stanza','Room')} ${escHtml(pt.room||'—')}</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${navigator.share ? `<button onclick="nativeShare('${id}')" class="btn-primary" style="display:flex;align-items:center;justify-content:center;gap:8px">${svgIcon('ic-share',18)} ${T('Condividi con...','Share with...')}</button>` : ''}
        <button onclick="shareWhatsApp('${id}')" class="btn-secondary">💬 WhatsApp</button>
        <button onclick="shareEmail('${id}')" class="btn-secondary">📧 ${T('Email','Email')}</button>
        <button onclick="closeModal();printPatient('${id}')" class="btn-secondary">${svgIcon('ic-download',18)} ${T('Scarica / Stampa PDF','Download / Print PDF')}</button>
      </div>
    </div>
  </div>`;
  showModal(html);
}

function buildShareText(id) {
  const pt = getPatient(id);
  if (!pt) return '';
  const meds = (pt.medicines || []).map(m => {
    const sched = formatSchedule(m);
    const st = getMedStatus(m);
    return `  • ${m.name}${sched ? ' — ' + sched : ''}${st.label ? ' ('+st.label+')' : ''}`;
  }).join('\n');
  const visits = (pt.visits || [])
    .filter(v => new Date(v.date) >= new Date())
    .sort((a,b) => a.date.localeCompare(b.date))
    .slice(0, 3)
    .map(v => `  • ${fmtDatetime(v.date)} — ${v.title}`)
    .join('\n');

  return [
    `*SCHEDA PAZIENTE*`,
    `Nome: ${pt.name}`,
    `Stanza: ${pt.room || '—'}`,
    pt.allergies ? `⚠️ ${pt.allergies}` : '',
    '',
    `*MEDICINALI (${(pt.medicines||[]).length}):*`,
    meds || '  Nessuno',
    visits ? `\n*PROSSIME VISITE:*\n${visits}` : '',
    pt.doctor?.name ? `\n👨‍⚕️ Medico: ${pt.doctor.name}${pt.doctor.phone ? ' — ' + pt.doctor.phone : ''}` : '',
    pt.family?.name ? `👨‍👩‍👧 Familiare: ${pt.family.name}${pt.family.phone ? ' — ' + pt.family.phone : ''}` : '',
  ].filter(Boolean).join('\n');
}

async function nativeShare(id) {
  const pt = getPatient(id);
  try {
    await navigator.share({title: `Scheda ${pt.name}`, text: buildShareText(id)});
    closeModal();
  } catch(e) {}
}

function shareWhatsApp(id) {
  window.open('https://wa.me/?text=' + encodeURIComponent(buildShareText(id)), '_blank');
  closeModal();
}

function shareEmail(id) {
  const pt = getPatient(id);
  const subject = encodeURIComponent(`Scheda paziente — ${pt.name}`);
  const body = encodeURIComponent(buildShareText(id));
  window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  closeModal();
}

// ── Utils ───────────────────────────────────────────────────
function g(id) { return document.getElementById(id); }

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Aggiornamento forzato ───────────────────────────────────
async function forceUpdate() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch(e) {}
  location.replace(location.pathname + '?u=' + Date.now());
}

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.update().catch(() => {});
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }).catch(() => {});
  }
  auth.onAuthStateChanged(handleAuthChange);
});
