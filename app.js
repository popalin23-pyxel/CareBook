/* Medicinali Pazienti PWA */
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
  dbSearch: ''
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
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
  if (params) Object.assign(S, params);
  S.page = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  renderPage(page);
  window.scrollTo(0, 0);
}

function back() {
  const map = {
    'patient-detail': 'patients',
    'add-patient': S.patientId ? 'patient-detail' : 'patients',
    'add-med': 'patient-detail',
    'add-visit': 'patient-detail',
    'calendar': 'patients',
    'db': 'patients',
    'add-db-med': 'db',
    'settings': 'patients'
  };
  navigate(map[S.page] || 'patients');
}

function renderPage(page) {
  const renders = {
    'patients': renderPatients,
    'patient-detail': renderPatientDetail,
    'add-patient': renderAddPatient,
    'add-med': renderAddMed,
    'add-visit': renderAddVisit,
    'calendar': renderCalendar,
    'db': renderDb,
    'add-db-med': renderAddDbMed,
    'settings': renderSettings
  };
  if (renders[page]) renders[page]();
}

// ── Helpers ─────────────────────────────────────────────────
function getPatient(id) { return D.patients.find(p => p.id === (id || S.patientId)); }
function getFmtIcon(fmtId) { return (FORMATS.find(f => f.id === fmtId) || FORMATS[0]).icon; }
function getFmtLabel(fmtId) { return (FORMATS.find(f => f.id === fmtId) || FORMATS[0]).label; }
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
  if (dosage.sera)    r.push({time:'18:00', qty: dosage.sera});
  if (dosage.notte)   r.push({time:'22:00', qty: dosage.notte});
  return r;
}

function computeEndDate(startIso, totalQty, dpd, weekDays) {
  // weekDays: array of 0-6 (0=Mon) or null = every day
  if (!dpd || dpd <= 0 || !totalQty) return null;
  const d = new Date(startIso + 'T00:00:00');
  let rem = totalQty;
  let safety = 0;
  while (rem > 0 && safety < 3650) {
    const dow = (d.getDay() + 6) % 7; // convert Sun=0 to Mon=0
    if (!weekDays || weekDays.length === 0 || weekDays.includes(dow)) {
      rem -= dpd;
    }
    if (rem > 0) d.setDate(d.getDate() + 1);
    safety++;
  }
  return d.toISOString().slice(0, 10);
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
    return st.cls === 'low' || st.cls === 'expired';
  });
}

function nextEndDate(pt) {
  const ends = (pt.medicines || [])
    .filter(m => m.endDate)
    .map(m => m.endDate)
    .sort();
  return ends[0] || null;
}

// ── PAGE: Patients ──────────────────────────────────────────
function renderPatients() {
  const op = activeOp();

  // Top bar
  document.getElementById('bar-patients').innerHTML = `
    <div style="flex:1">
      <div style="font-size:22px;font-weight:800">${T('Pazienti','Patients')}</div>
      <div style="font-size:13px;color:var(--t2)">${T('Gestisci pazienti e medicinali','Manage patients and medicines')}</div>
    </div>
    <div class="bar-icons">
      <button class="ib" onclick="navigate('calendar')" title="Calendario">${svgIcon('ic-cal')}</button>
      <button class="ib" onclick="navigate('db')" title="Database">${svgIcon('ic-db')}</button>
      <button class="ib" onclick="navigate('settings')" title="Impostazioni">${svgIcon('ic-cog')}</button>
    </div>`;

  // Content
  const low = getLowMeds();
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
      <input class="search-inp" placeholder="${T('Cerca per nome, stanza o medico...','Search by name, room or doctor...')}"
        value="${escHtml(S.search)}"
        oninput="S.search=this.value;renderPatients()">
    </div>

    <div class="pills">
      <span class="pill-label">${T('Ordina:','Sort:')}</span>
      <button class="pill ${S.sort==='nome'?'active':''}" onclick="S.sort='nome';renderPatients()">${T('Nome','Name')}</button>
      <button class="pill ${S.sort==='stanza'?'active':''}" onclick="S.sort='stanza'">${T('Stanza','Room')}</button>
      <button class="pill ${S.sort==='avvisi'?'active':''}" onclick="S.sort='avvisi'">${T('Avvisi','Alerts')}</button>
      <button class="pill ${S.filterAlerts?'active':''}" onclick="S.filterAlerts=!S.filterAlerts;renderPatients()" style="margin-left:auto">${T('Solo avvisi','Only alerts')}</button>
    </div>`;

  // Low meds banner
  if (low.length > 0) {
    html += `<div class="alert-banner" onclick="S.sort='avvisi';S.filterAlerts=true;renderPatients()">
      <div class="alert-banner-hd">${svgIcon('ic-clock',15)} ${T(`Da ricaricare (${low.length})`, `To restock (${low.length})`)}
        <span style="font-size:12px;font-weight:400;margin-left:4px">${T('Tocca per visualizzarli','Tap to view')}</span>
      </div>`;
    low.forEach(({patient: pt, med, status}) => {
      html += `<div class="alert-item">
        <div class="alert-item-dot"></div>
        <div class="alert-item-info">
          <div class="alert-item-name">${escHtml(med.name)}</div>
          <div class="alert-item-sub">${escHtml(pt.name)} • ${T('Stanza','Room')} ${escHtml(pt.room||'?')}</div>
        </div>
        <div class="alert-item-days">${status.label}</div>
      </div>`;
    });
    html += `</div>`;
  }

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

  document.getElementById('content-patients').innerHTML = html;
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
      <button class="ib" onclick="printPatient('${pt.id}')" title="Stampa">${svgIcon('ic-print')}</button>
      <button class="ib" onclick="navigate('add-patient',{editMode:true})" title="Modifica">${svgIcon('ic-edit')}</button>
      <button class="ib" style="color:var(--r)" onclick="confirmDeletePatient('${pt.id}')" title="Elimina">${svgIcon('ic-trash')}</button>
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

  html += `<button class="add-med-btn" onclick="navigate('add-visit')">+ ${T('Aggiungi visita','Add visit')}</button>
  </div>`;

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
        <div class="med-sub">${getFmtLabel(med.format)||''}${med.days&&med.days.length>0&&med.days.length<7?' · '+formatDays(med.days):''}${formatSchedule(med)?' · '+formatSchedule(med):dpd?' · '+dpd+'/'+T('giorno','day'):''}</div>
      </div>
      <span class="med-status ${st.cls}">${st.label}</span>
      ${svgIcon('ic-chevron', 16)}
    </div>`;
  });

  if (meds.length === 0) html += `<div class="empty" style="padding:16px 0">${T('Nessun medicinale','No medicines')}</div>`;
  html += `<button class="add-med-btn" onclick="navigate('add-med',{medId:null})">+ ${T('Aggiungi medicinale','Add medicine')}</button>
  </div>`;

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
    <button class="ib" onclick="event.stopPropagation();confirmDeleteVisit('${v.id}')">${svgIcon('ic-trash',16)}</button>
  </div>`;
}

function showMedDetail(medId) {
  const pt = getPatient();
  const med = (pt?.medicines||[]).find(m => m.id === medId);
  if (!med) return;
  const st = getMedStatus(med);
  const dpd = dosePerDay(med);
  const schedStr = formatSchedule(med);

  const html = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:50;display:flex;align-items:flex-end" onclick="closeModal()">
    <div style="background:var(--sur);width:100%;border-radius:20px 20px 0 0;padding:20px;max-height:80vh;overflow-y:auto" onclick="event.stopPropagation()">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <div class="med-icon" style="width:44px;height:44px;font-size:18px">${getFmtIcon(med.format)}</div>
        <div>
          <div style="font-size:18px;font-weight:700">${escHtml(med.name)}</div>
          <div style="font-size:13px;color:var(--t2)">${getFmtLabel(med.format)}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:6px">
          <button class="ib" onclick="closeModal();navigate('add-med',{medId:'${med.id}'})">${svgIcon('ic-edit')}</button>
          <button class="ib" style="color:var(--r)" onclick="closeModal();confirmDeleteMed('${med.id}')">${svgIcon('ic-trash')}</button>
        </div>
      </div>
      ${schedStr ? `<div style="font-size:14px;margin-bottom:8px"><strong>${T('Orari:','Schedule:')}</strong> ${schedStr}</div>` : ''}
      ${dpd ? `<div style="font-size:14px;margin-bottom:8px"><strong>${T('Totale/giorno:','Per day:')}</strong> ${dpd}</div>` : ''}
      ${med.days&&med.days.length>0&&med.days.length<7 ? `<div style="font-size:14px;margin-bottom:8px"><strong>${T('Giorni:','Days:')}</strong> ${formatDays(med.days)}</div>` : ''}
      ${med.startDate ? `<div style="font-size:14px;margin-bottom:8px"><strong>${T('Inizio:','Start:')}</strong> ${fmtDate(med.startDate)}</div>` : ''}
      ${med.endDate ? `<div style="font-size:14px;margin-bottom:8px"><strong>${T('Fine prevista:','Expected end:')}</strong> ${fmtDate(med.endDate)}</div>` : ''}
      ${med.totalQty!=null ? `<div style="font-size:14px;margin-bottom:8px"><strong>${T('Quantità totale:','Total qty:')}</strong> ${med.totalQty}</div>` : ''}
      <div style="margin-top:12px;padding:10px;border-radius:10px;background:${st.cls==='expired'?'#fff5f5':st.cls==='low'?'var(--wl)':'var(--pl)'}">
        <span style="font-size:14px;font-weight:600;color:${st.cls==='expired'?'var(--r)':st.cls==='low'?'var(--w)':'var(--p)'}">${st.label||T('In corso','Ongoing')}</span>
      </div>
    </div>
  </div>`;
  showModal(html);
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
  navigate('patients');
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
  days: [0,1,2,3,4,5,6],
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
      days: existing.days != null ? [...existing.days] : [0,1,2,3,4,5,6],
      endDate: existing.endDate || '',
      schedule: existing.schedule ? [...existing.schedule] : convertDosageToSchedule(existing.dosage)
    };
  } else {
    _medFormState = { format: '', days: [0,1,2,3,4,5,6], endDate: '', schedule: [] };
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
      <div style="margin-bottom:8px">
        <button class="pill ${_medFormState.days.length===7?'active':''}" onclick="setAllDays()">${T('Ogni giorno','Every day')}</button>
      </div>
      <div class="days-grid" id="days-grid">${buildDaysGrid()}</div>
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

    <div class="form-group">
      <label class="form-label">${T('Giorni di avviso scorte','Stock alert days')}</label>
      <input class="form-input" id="f-alert" type="number" min="0" placeholder="${alertDefault}" value="${v.alertDays!=null?v.alertDays:alertDefault}">
    </div>

    <button class="btn-primary" onclick="saveMed(${existing?`'${existing.id}'`:null})">${T('Salva medicinale','Save medicine')}</button>
  `;
}

function buildFmtGrid() {
  return FORMATS.map(f =>
    `<button class="fmt-btn ${_medFormState.format===f.id?'active':''}" onclick="selectFmt('${f.id}')">${f.icon} ${f.label}</button>`
  ).join('');
}

function buildDaysGrid() {
  return DAYS_IT.map((day, i) =>
    `<button class="day-btn ${_medFormState.days.includes(i)?'active':''}" onclick="toggleDay(${i})">${day}</button>`
  ).join('');
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
  document.getElementById('days-grid').innerHTML = buildDaysGrid();
  recalcEnd();
}

function setAllDays() {
  _medFormState.days = [0,1,2,3,4,5,6];
  renderAddMed();
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
  const end = computeEndDate(start, qty, dpd, days);
  if (end) {
    g('f-end').value = end;
    _medFormState.endDate = end;
  }
}

function showMedAutocomplete(val) {
  const list = document.getElementById('med-autocomplete');
  if (!val || val.length < 1) { list.style.display='none'; return; }
  const matches = D.medicineDb.filter(m => m.name.toLowerCase().includes(val.toLowerCase()));
  if (matches.length === 0) { list.style.display='none'; return; }
  list.innerHTML = matches.slice(0,6).map(m =>
    `<div class="autocomplete-item" onclick="selectDbMed('${m.id}')">${escHtml(m.name)} <span style="color:var(--t3);font-size:12px">${getFmtLabel(m.format)}</span></div>`
  ).join('');
  list.style.display = 'block';
}

function selectDbMed(id) {
  const m = D.medicineDb.find(x => x.id === id);
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
    schedule: [..._medFormState.schedule],
    days: _medFormState.days.length < 7 ? [..._medFormState.days] : [],
    startDate: start,
    endDate: g('f-end').value || _medFormState.endDate || null,
    totalQty: qty,
    alertDays: parseInt(g('f-alert').value) || D.settings.alertDays,
    createdAt: existingId ? undefined : new Date().toISOString()
  };

  const pt = getPatient();
  if (!pt) return;
  if (existingId) {
    const idx = pt.medicines.findIndex(m => m.id === existingId);
    if (idx >= 0) { med.createdAt = pt.medicines[idx].createdAt; pt.medicines[idx] = med; }
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
    <button class="bar-back" onclick="navigate('patients')">${svgIcon('ic-arrow-left',22)}</button>
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
    <button class="bar-back" onclick="navigate('patients')">${svgIcon('ic-arrow-left',22)}</button>
    <span class="bar-title">${T('Database medicinali','Medicine database')}</span>`;

  const q = S.dbSearch.toLowerCase();
  const items = D.medicineDb.filter(m => !q || m.name.toLowerCase().includes(q))
    .sort((a,b) => a.name.localeCompare(b.name));

  let html = `<div class="search-wrap">
    ${svgIcon('ic-search',16)}
    <input class="search-inp" placeholder="${T('Cerca nel database...','Search database...')}"
      value="${escHtml(S.dbSearch)}"
      oninput="S.dbSearch=this.value;renderDb()">
  </div>`;

  if (items.length === 0) {
    html += `<div class="empty">${T('Nessun medicinale nel database','No medicines in database')}</div>`;
  } else {
    items.forEach(m => {
      html += `<div class="db-item">
        <div class="db-item-icon">${getFmtIcon(m.format)}</div>
        <div class="db-item-info">
          <div class="db-item-name">${escHtml(m.name)}</div>
          <div class="db-item-sub">${getFmtLabel(m.format)}</div>
        </div>
        <button class="edit-btn" onclick="navigate('add-db-med',{editDbMedId:'${m.id}'})">${svgIcon('ic-edit',18)}</button>
        <button class="edit-btn" style="color:var(--r)" onclick="confirmDeleteDbMed('${m.id}')">${svgIcon('ic-trash',18)}</button>
      </div>`;
    });
  }

  document.getElementById('content-db').innerHTML = html;
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

function renderAddDbMed() {
  const existing = S.editDbMedId ? D.medicineDb.find(m => m.id === S.editDbMedId) : null;
  const title = existing ? T('Modifica voce','Edit entry') : T('Nuova voce','New entry');

  document.getElementById('bar-add-db-med').innerHTML = `
    <button class="bar-back" onclick="navigate('db')">${svgIcon('ic-arrow-left',22)}</button>
    <span class="bar-title">${title}</span>`;

  _dbFmt = existing?.format || '';

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
    <button class="btn-primary" onclick="saveDbMed(${existing?`'${existing.id}'`:null})">${T('Salva nel database','Save to database')}</button>
    ${existing ? `<button class="btn-danger" onclick="confirmDeleteDbMed('${existing.id}')">${T('Elimina','Delete')}</button>` : ''}
  `;
}

function buildDbFmtGrid() {
  return FORMATS.map(f =>
    `<button class="fmt-btn ${_dbFmt===f.id?'active':''}" onclick="selectDbFmt('${f.id}')">${f.icon} ${f.label}</button>`
  ).join('');
}

function selectDbFmt(id) {
  _dbFmt = id;
  document.getElementById('db-fmt-grid').innerHTML = buildDbFmtGrid();
}

function saveDbMed(existingId) {
  const name = g('f-dbname').value.trim();
  if (!name) { alert(T('Inserisci il nome','Enter name')); return; }

  if (existingId) {
    const m = D.medicineDb.find(x => x.id === existingId);
    if (m) { m.name = name; m.format = _dbFmt; }
  } else {
    D.medicineDb.push({ id: uid(), name, format: _dbFmt });
  }
  save();
  navigate('db');
}

// ── PAGE: Settings ──────────────────────────────────────────
function renderSettings() {
  document.getElementById('bar-settings').innerHTML = `
    <button class="bar-back" onclick="navigate('patients')">${svgIcon('ic-arrow-left',22)}</button>
    <span class="bar-title">${T('Impostazioni','Settings')}</span>`;

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
      <div class="settings-sec-title">${T('LINGUA','LANGUAGE')}</div>
      <div class="settings-sec-desc">${T('Scegli la lingua dell\'app.','Choose the app language.')}</div>
      <div class="lang-toggle">
        <button class="lang-btn ${lang==='it'?'active':''}" onclick="setLang('it')">Italiano</button>
        <button class="lang-btn ${lang==='en'?'active':''}" onclick="setLang('en')">English</button>
      </div>
      <div style="height:10px"></div>
    </div>

    <div class="settings-sec">
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
    </div>

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
      <div style="padding:12px 16px;font-size:12px;color:var(--t3)">${T('I dati sono salvati solo su questo dispositivo. Disinstallando l\'app li perderai.','Data is saved only on this device. Uninstalling the app will delete it.')}</div>
      <div style="padding:0 16px 14px">
        <button class="btn-danger" onclick="confirmClearData()">${T('Cancella tutti i dati','Clear all data')}</button>
      </div>
    </div>
  `;

  // Check notification permission
  if ('Notification' in window && Notification.permission === 'granted') {
    const el = document.getElementById('notif-status');
    if (el) { el.textContent = T('Attive','Active'); el.style.color = 'var(--p)'; }
  }
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
      <td><strong>${escHtml(med.name)}</strong><br><small>${getFmtLabel(med.format)}${med.days&&med.days.length>0&&med.days.length<7?' · '+formatDays(med.days):''}</small></td>
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
  <div class="footer">Medicinali Pazienti • ${fmtDatetime(now.toISOString())}</div>
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

// ── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  renderPatients();
});
