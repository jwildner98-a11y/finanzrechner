'use strict';
/* Finanzrechner – alle Daten bleiben lokal im Browser (localStorage). Keine externen Requests. */

const KEY = 'finanzrechner.v1';
const TYPES = { income: 'Einnahme', fix: 'Fixkosten', abo: 'Abo', rate: 'Rate / Kredit', sparen: 'Sparen', variabel: 'Variabel' };
const FIXED_TYPES = ['fix', 'abo', 'rate'];
const CATS = ['Wohnen', 'Energie & Medien', 'Mobilität', 'Versicherung', 'Lebensmittel', 'Abos', 'Kredite & Raten', 'Sparen', 'Freizeit', 'Sonstiges'];
const COLORS = ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#16a34a', '#db2777', '#dc2626', '#0891b2', '#ca8a04', '#64748b'];
const INTERVALS = { monthly: ['Monatlich', 1], quarterly: ['Vierteljährlich', 3], yearly: ['Jährlich', 12] };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/* ---------- Hilfsfunktionen ---------- */
const $ = (s, r = document) => r.querySelector(s);
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmt = n => eur.format(Math.abs(n) < 0.005 ? 0 : n);
const pctf = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 0 });
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const round2 = n => Math.round(n * 100) / 100;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const nowMonth = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const shiftMonth = (m, delta) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + delta, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const monthName = m => { const [y, mo] = m.split('-').map(Number); return new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(new Date(y, mo - 1, 1)); };
const monthShort = (y, i) => new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(new Date(y, i, 1));
const parseAmount = s => { const str = String(s).trim().replace(/\s/g, ''); const n = Number(str.includes(',') ? str.replace(/\./g, '').replace(',', '.') : str); return str !== '' && isFinite(n) ? n : NaN; };
const signCls = n => (n > 0.004 ? 'pos' : n < -0.004 ? 'neg' : '');
const numStr = n => String(n).replace('.', ',');

/* ---------- Daten ---------- */
function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const amount = Number(e.amount);
  if (!isFinite(amount) || amount < 0 || amount > 1e9) return null;
  return {
    id: String(e.id || uid()).slice(0, 40),
    person: ['p1', 'p2', 'joint'].includes(e.person) ? e.person : 'joint',
    name: String(e.name || '').slice(0, 80),
    amount: round2(amount),
    type: has(TYPES, e.type) ? e.type : 'fix',
    category: CATS.includes(e.category) ? e.category : 'Sonstiges',
    interval: has(INTERVALS, e.interval) ? e.interval : 'monthly',
    from: MONTH_RE.test(e.from) ? e.from : '',
    to: MONTH_RE.test(e.to) ? e.to : '',
    note: String(e.note || '').slice(0, 200)
  };
}
function cleanGoal(g) {
  if (!g || typeof g !== 'object') return null;
  const target = Number(g.target), saved = Number(g.saved);
  if (!isFinite(target) || target < 0 || !isFinite(saved)) return null;
  return { id: String(g.id || uid()).slice(0, 40), name: String(g.name || '').slice(0, 80), target: round2(target), saved: round2(saved) };
}
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function cleanTx(t) {
  if (!t || typeof t !== 'object') return null;
  const a = Number(t.amount), d = String(t.date || '');
  if (!isFinite(a) || a <= 0 || a > 1e9 || !DATE_RE.test(d) || isNaN(Date.parse(d))) return null;
  return {
    id: String(t.id || uid()).slice(0, 40), date: d, amount: round2(a),
    kind: t.kind === 'income' ? 'income' : 'expense',
    person: ['p1', 'p2', 'joint'].includes(t.person) ? t.person : 'joint',
    shop: String(t.shop || '').slice(0, 80),
    category: CATS.includes(t.category) ? t.category : 'Sonstiges',
    budgetId: String(t.budgetId || '').slice(0, 40), note: String(t.note || '').slice(0, 200)
  };
}
const todayStr = () => { const d = new Date(); return nowMonth() + '-' + String(d.getDate()).padStart(2, '0'); };
function cleanState(d) {
  const s = d && typeof d === 'object' ? d : {};
  const st = s.settings && typeof s.settings === 'object' ? s.settings : {};
  const nm = Array.isArray(st.names) ? st.names : [];
  const pct = Number(st.p1pct);
  return {
    app: 'finanzrechner', version: 2,
    settings: {
      names: [String(nm[0] || 'Person 1').slice(0, 20), String(nm[1] || 'Person 2').slice(0, 20)],
      mode: ['half', 'income', 'custom'].includes(st.mode) ? st.mode : 'half',
      p1pct: isFinite(pct) ? Math.min(100, Math.max(0, Math.round(pct))) : 50
    },
    entries: (Array.isArray(s.entries) ? s.entries : []).map(cleanEntry).filter(Boolean),
    goals: (Array.isArray(s.goals) ? s.goals : []).map(cleanGoal).filter(Boolean),
    txs: (Array.isArray(s.txs) ? s.txs : []).map(cleanTx).filter(Boolean),
    lastBackup: typeof s.lastBackup === 'string' && !isNaN(Date.parse(s.lastBackup)) ? s.lastBackup : ''
  };
}
let storageOk = true;
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return cleanState(JSON.parse(raw)); } catch (e) { storageOk = false; }
  return cleanState({});
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; window.Cloud && Cloud.queuePush(); } catch (e) { storageOk = false; toast('Speichern nicht möglich – bitte Backup exportieren!'); }
}
let state = load();
const ui = { tab: 'overview', month: nowMonth(), filter: 'all', search: '' };

/* ---------- Berechnung ---------- */
const active = (e, m) => (!e.from || e.from <= m) && (!e.to || e.to >= m);
const monthly = e => e.amount / INTERVALS[e.interval][1];
function calcMonth(m) {
  const z = () => ({ inc: 0, exp: 0, sav: 0, fix: 0, xinc: 0, xexp: 0 });
  const own = { p1: z(), p2: z(), joint: z() };
  const cats = {}, budgets = [];
  for (const e of state.entries) {
    if (!active(e, m)) continue;
    const v = monthly(e), b = own[e.person];
    if (e.type === 'income') b.inc += v;
    else {
      b.exp += v; if (e.type === 'sparen') b.sav += v; if (FIXED_TYPES.includes(e.type)) b.fix += v;
      cats[e.category] = (cats[e.category] || 0) + v;
      if (e.type === 'variabel') budgets.push({ e, budget: v, spent: 0 });
    }
  }
  /* Echte Buchungen: auf Budget gebucht = verbraucht das Budget (Mehrbetrag zählt extra), ohne Budget = Extra */
  const bmap = {}; budgets.forEach(b => { bmap[b.e.id] = b; });
  let hasTx = false;
  for (const t of state.txs) {
    if (t.date.slice(0, 7) !== m) continue;
    hasTx = true;
    if (t.kind === 'income') own[t.person].xinc += t.amount;
    else if (bmap[t.budgetId]) bmap[t.budgetId].spent += t.amount;
    else { own[t.person].xexp += t.amount; cats[t.category] = (cats[t.category] || 0) + t.amount; }
  }
  for (const b of budgets) {
    const over = Math.max(0, b.spent - b.budget);
    if (over > 0) { own[b.e.person].xexp += over; cats[b.e.category] = (cats[b.e.category] || 0) + over; }
  }
  let f1 = 0.5;
  if (state.settings.mode === 'income') { const t = own.p1.inc + own.p2.inc; f1 = t > 0 ? own.p1.inc / t : 0.5; }
  else if (state.settings.mode === 'custom') f1 = state.settings.p1pct / 100;
  const mk = (p, f) => {
    const o = own[p], j = own.joint;
    const pInc = o.inc + j.inc * f, pExp = o.exp + j.exp * f, xInc = o.xinc + j.xinc * f, xExp = o.xexp + j.xexp * f;
    return { share: f, jInc: (j.inc + j.xinc) * f, jExp: (j.exp + j.xexp) * f, inc: pInc + xInc, exp: pExp + xExp,
      planRest: pInc - pExp, sav: o.sav + j.sav * f, fix: o.fix + j.fix * f, rest: pInc + xInc - pExp - xExp };
  };
  const p1 = mk('p1', f1), p2 = mk('p2', 1 - f1);
  const jt = own.joint;
  return { p1, p2, joint: { inc: jt.inc + jt.xinc, exp: jt.exp + jt.xexp }, cats, budgets, hasTx,
    inc: p1.inc + p2.inc, exp: p1.exp + p2.exp, sav: p1.sav + p2.sav, fix: p1.fix + p2.fix,
    rest: p1.rest + p2.rest, planRest: p1.planRest + p2.planRest, f1 };
}

/* ---------- UI-Helfer ---------- */
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
const names = () => state.settings.names;
const personLabel = p => p === 'joint' ? 'Gemeinsam' : names()[p === 'p1' ? 0 : 1];
const signed = e => (e.type === 'income' ? 1 : -1) * monthly(e);

function donut(cats) {
  const arr = CATS.map((c, i) => [c, cats[c] || 0, COLORS[i]]).filter(x => x[1] > 0.004).sort((a, b) => b[1] - a[1]);
  const tot = arr.reduce((s, x) => s + x[1], 0);
  if (!tot) return '<p class="mute">Keine Ausgaben in diesem Monat.</p>';
  let off = 0;
  const seg = arr.map(([c, v, col]) => { const len = v / tot * 100; const s = `<circle r="15.9155" cx="21" cy="21" fill="none" stroke="${col}" stroke-width="6" stroke-dasharray="${len} ${100 - len}" stroke-dashoffset="${25 - off}"><title>${esc(c)}</title></circle>`; off += len; return s; }).join('');
  const legend = arr.map(([c, v, col]) => `<li><i style="background:${col}"></i>${esc(c)}<b>${fmt(v)} · ${pctf.format(v / tot)}</b></li>`).join('');
  return `<svg class="donut" viewBox="0 0 42 42" role="img" aria-label="Ausgaben nach Kategorie">${seg}<text x="21" y="20.5" text-anchor="middle" font-size="3.4" fill="currentColor">Ausgaben</text><text x="21" y="25" text-anchor="middle" font-size="3.4" font-weight="700" fill="currentColor">${fmt(tot)}</text></svg><ul class="legend">${legend}</ul>`;
}

/* ---------- Ansichten ---------- */
function viewOverview() {
  if (!state.entries.length) return emptyState();
  const m = ui.month, c = calcMonth(m);
  const [n1, n2] = names().map(esc);
  const days = state.lastBackup ? (Date.now() - Date.parse(state.lastBackup)) / 864e5 : Infinity;
  let h = '';
  if (!storageOk) h += `<div class="banner"><span>Speicher im Browser nicht verfügbar – Änderungen gehen verloren. Bitte Backup exportieren.</span></div>`;
  if (days > 30) h += `<div class="banner"><span>${state.lastBackup ? 'Letztes Backup vor ' + Math.floor(days) + ' Tagen.' : 'Noch kein Backup erstellt.'}</span><button class="btn" data-act="export">Jetzt sichern</button></div>`;
  const person = (p, n) => `<div class="card"><h2>${n}</h2><div class="big ${signCls(p.rest)}">${fmt(p.rest)}</div><div class="small mute">verbleibt im Monat</div>
    <div class="row"><span>Einnahmen</span><span>${fmt(p.inc)}</span></div>
    <div class="row"><span>Ausgaben</span><span>${fmt(-p.exp)}</span></div>
    <div class="row"><span class="small">davon Anteil Gemeinsam (${pctf.format(p.share)})</span><span class="small">${fmt(p.jInc - p.jExp)}</span></div>
    <div class="row"><span class="small">davon Sparen</span><span class="small">${fmt(p.sav)}</span></div></div>`;
  h += '<div class="actions" style="margin:0 0 12px"><button class="btn primary" data-act="newtx">+ Ausgabe buchen</button><button class="btn" data-act="receipt">Beleg einlesen</button></div>';
  h += `<div class="card"><h2>Haushalt gesamt · ${esc(monthName(m))}</h2><div class="big ${signCls(c.rest)}">${fmt(c.rest)}</div><div class="small mute">${c.hasTx ? 'Prognose inkl. Buchungen · Plan-Rest ' + fmt(c.planRest) : 'Saldo (Einnahmen − Ausgaben)'}</div>
    <div class="row"><span>Einnahmen</span><span>${fmt(c.inc)}</span></div><div class="row"><span>Ausgaben</span><span>${fmt(-c.exp)}</span></div>
    <div class="row"><span>Sparquote</span><span>${c.inc > 0 ? pctf.format(c.sav / c.inc) : '–'}</span></div>
    <div class="row"><span>Fixkostenquote</span><span>${c.inc > 0 ? pctf.format(c.fix / c.inc) : '–'}</span></div></div>`;
  h += budgetsCard(c, false);
  h += `<div class="grid2 stack">${person(c.p1, n1)}${person(c.p2, n2)}</div>`;
  h += `<div class="card"><h2>Gemeinsamer Topf</h2><div class="row"><span>Einnahmen</span><span>${fmt(c.joint.inc)}</span></div><div class="row"><span>Ausgaben</span><span>${fmt(-c.joint.exp)}</span></div>
    <div class="small mute">Aufteilung: ${esc(splitText())}</div></div>`;
  h += `<div class="card"><h2>Ausgaben nach Kategorie</h2>${donut(c.cats)}</div>`;
  return h;
}
function splitText() {
  const s = state.settings, [a, b] = names();
  if (s.mode === 'half') return `${a} 50 % / ${b} 50 %`;
  if (s.mode === 'custom') return `${a} ${s.p1pct} % / ${b} ${100 - s.p1pct} %`;
  return 'nach Einkommen (im jeweiligen Monat)';
}
function emptyState() {
  return `<div class="card empty"><h2>Willkommen</h2><p>Noch keine Einträge. Lege Einnahmen und Ausgaben an – alle Daten bleiben nur auf diesem Gerät.</p>
  <div class="actions" style="justify-content:center"><button class="btn primary" data-act="new">Ersten Eintrag anlegen</button><button class="btn" data-act="demo">Demodaten laden</button><button class="btn" data-act="import">Backup importieren</button></div></div>`;
}
const fab = () => '<button class="fab" data-act="new" aria-label="Neuer Eintrag">+</button>';

function viewEntries() {
  const chips = [['all', 'Alle'], ['p1', names()[0]], ['p2', names()[1]], ['joint', 'Gemeinsam']]
    .map(([k, l]) => `<button class="chip" data-act="filter" data-v="${k}" aria-pressed="${ui.filter === k}">${esc(l)}</button>`).join('');
  const q = ui.search.trim().toLowerCase();
  const list = state.entries.filter(e => (ui.filter === 'all' || e.person === ui.filter) && (!q || (e.name + ' ' + e.note + ' ' + e.category).toLowerCase().includes(q)));
  let h = `<input type="search" id="search" placeholder="Suchen …" value="${esc(ui.search)}" aria-label="Suchen"><div class="chips" style="margin-top:8px">${chips}</div>`;
  if (!state.entries.length) return h + emptyState() + fab();
  const groups = ['p1', 'p2', 'joint'].map(p => [p, list.filter(e => e.person === p)]).filter(g => g[1].length);
  for (const [p, items] of groups) {
    items.sort((a, b) => (a.type === 'income' ? 0 : 1) - (b.type === 'income' ? 0 : 1) || a.name.localeCompare(b.name, 'de'));
    h += `<div class="card"><h2>${esc(personLabel(p))}</h2>` + items.map(e => {
      const on = active(e, ui.month), v = signed(e);
      const meta = [TYPES[e.type], e.type === 'income' ? '' : e.category, e.interval !== 'monthly' ? INTERVALS[e.interval][0] + ' ' + fmt(e.amount) : '', e.from || e.to ? (e.from || '…') + ' bis ' + (e.to || 'offen') : '', e.note].filter(Boolean).join(' · ');
      return `<button class="item ${on ? '' : 'off'}" data-act="edit" data-id="${esc(e.id)}"><span class="t"><b>${esc(e.name || '(ohne Namen)')}</b><span class="tag">${esc(meta)}</span></span><span class="amt ${signCls(v)}">${fmt(v)}</span></button>`;
    }).join('') + '</div>';
  }
  if (!groups.length) h += '<p class="mute">Keine Treffer.</p>';
  return h + `<p class="small mute">Beträge pro Monat umgerechnet. Ausgegraut = in ${esc(monthName(ui.month))} nicht gültig.</p>` + fab();
}

function budgetsFor(m) { return state.entries.filter(e => e.type === 'variabel' && active(e, m)); }
function pickBudget(cat, person, m) { const bs = budgetsFor(m).filter(e => e.category === cat); return (bs.find(e => e.person === person) || bs[0] || {}).id || ''; }
function budgetOptions(m, sel) {
  return '<option value="">Kein Budget (Extra-Ausgabe)</option>' + budgetsFor(m).map(e => `<option value="${esc(e.id)}" ${e.id === sel ? 'selected' : ''}>${esc(e.name)} (${esc(personLabel(e.person))}, ${fmt(monthly(e))})</option>`).join('');
}
function budgetsCard(c, withHint) {
  if (!c.budgets.length) return withHint ? '<div class="card"><h2>Budgets</h2><p class="mute small">Noch keine variablen Budgets. Lege im Tab „Plan“ Posten vom Typ „Variabel“ an (z. B. Lebensmittel), dann kannst du Ausgaben dagegen buchen.</p></div>' : '';
  return '<div class="card"><h2>Budgets · ' + esc(monthName(ui.month)) + '</h2>' + c.budgets.map(b => {
    const p = b.budget > 0 ? Math.min(1, b.spent / b.budget) : (b.spent > 0 ? 1 : 0), over = b.spent > b.budget + 0.004, left = b.budget - b.spent;
    return `<div style="padding:6px 0"><div class="row"><span style="color:inherit"><b>${esc(b.e.name)}</b> <span class="tag">${esc(personLabel(b.e.person))}</span></span><span class="${over ? 'neg' : ''}">${fmt(b.spent)} / ${fmt(b.budget)}</span></div>
    <svg viewBox="0 0 100 3" width="100%" height="8" preserveAspectRatio="none" role="img" aria-label="${pctf.format(p)} verbraucht"><rect width="100" height="3" rx="1.5" fill="currentColor" opacity=".15"/><rect width="${p * 100}" height="3" rx="1.5" fill="${over ? '#dc2626' : '#0f766e'}"/></svg>
    <div class="small ${over ? 'neg' : 'mute'}">${over ? 'überzogen um ' + fmt(-left) : 'noch ' + fmt(left) + ' frei'}</div></div>`;
  }).join('') + '</div>';
}
function viewTx() {
  const m = ui.month, c = calcMonth(m);
  let h = '<div class="actions" style="margin:0 0 12px"><button class="btn primary" data-act="newtx">+ Ausgabe buchen</button><button class="btn" data-act="receipt">Beleg einlesen (PDF/Foto)</button></div>';
  h += budgetsCard(c, true);
  const list = state.txs.filter(t => t.date.slice(0, 7) === m).sort((a, b) => b.date.localeCompare(a.date));
  h += '<div class="card"><h2>Buchungen · ' + esc(monthName(m)) + '</h2>';
  if (!list.length) h += '<p class="mute">Noch keine Buchungen in diesem Monat. Trage Ausgaben aus dem Laden ein oder lies einen Beleg ein – der Rest wird sofort neu berechnet.</p>';
  let last = '';
  for (const t of list) {
    if (t.date !== last) { last = t.date; h += `<div class="small mute" style="padding-top:8px">${esc(new Date(t.date + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' }))}</div>`; }
    const b = state.entries.find(e => e.id === t.budgetId);
    const meta = [personLabel(t.person), t.kind === 'income' ? 'Einnahme' : t.category, b ? 'Budget ' + b.name : '', t.note].filter(Boolean).join(' · ');
    h += `<button class="item" data-act="edittx" data-id="${esc(t.id)}"><span class="t"><b>${esc(t.shop || '(ohne Name)')}</b><span class="tag">${esc(meta)}</span></span><span class="amt ${t.kind === 'income' ? 'pos' : 'neg'}">${fmt(t.kind === 'income' ? t.amount : -t.amount)}</span></button>`;
  }
  h += '</div>';
  return h + '<button class="fab" data-act="newtx" aria-label="Ausgabe buchen">+</button>';
}

function viewYear() {
  const y = Number(ui.month.slice(0, 4));
  const rows = [];
  const tot = { inc: 0, exp: 0, sav: 0, r1: 0, r2: 0 };
  for (let i = 0; i < 12; i++) {
    const m = y + '-' + String(i + 1).padStart(2, '0'), c = calcMonth(m);
    rows.push({ m, i, c });
    tot.inc += c.inc; tot.exp += c.exp; tot.sav += c.sav; tot.r1 += c.p1.rest; tot.r2 += c.p2.rest;
  }
  const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.c.rest)));
  const bars = rows.map(r => {
    const hgt = Math.abs(r.c.rest) / maxAbs * 40, x = r.i * 20 + 3, pos = r.c.rest >= 0;
    return `<rect x="${x}" y="${pos ? 44 - hgt : 44}" width="14" height="${Math.max(hgt, 0.5)}" rx="2" fill="${pos ? '#16a34a' : '#dc2626'}"><title>${esc(monthShort(y, r.i))}: ${fmt(r.c.rest)}</title></rect><text x="${x + 7}" y="94" text-anchor="middle" font-size="7" fill="currentColor">${esc(monthShort(y, r.i).replace('.', '').slice(0, 3))}</text>`;
  }).join('');
  const body = rows.map(r => `<tr class="${r.m === nowMonth() ? 'now' : ''}"><td>${esc(monthShort(y, r.i))}</td><td>${fmt(r.c.inc)}</td><td>${fmt(r.c.exp)}</td><td>${fmt(r.c.sav)}</td><td class="${signCls(r.c.p1.rest)}">${fmt(r.c.p1.rest)}</td><td class="${signCls(r.c.p2.rest)}">${fmt(r.c.p2.rest)}</td><td class="${signCls(r.c.rest)}">${fmt(r.c.rest)}</td></tr>`).join('');
  return `<div class="card"><h2>Jahresübersicht ${y}</h2><div class="big ${signCls(tot.inc - tot.exp)}">${fmt(tot.inc - tot.exp)}</div><div class="small mute">Jahressaldo · Ø ${fmt((tot.inc - tot.exp) / 12)} pro Monat</div>
  <svg viewBox="0 0 246 98" width="100%" role="img" aria-label="Monatlicher Saldo" style="margin-top:10px"><line x1="0" y1="44" x2="246" y2="44" stroke="currentColor" opacity=".25"/>${bars}</svg></div>
  <div class="card"><div class="table"><table><thead><tr><th>Monat</th><th>Einnahmen</th><th>Ausgaben</th><th>Sparen</th><th>${esc(names()[0])}</th><th>${esc(names()[1])}</th><th>Saldo</th></tr></thead><tbody>${body}</tbody>
  <tfoot><tr><td>Summe</td><td>${fmt(tot.inc)}</td><td>${fmt(tot.exp)}</td><td>${fmt(tot.sav)}</td><td>${fmt(tot.r1)}</td><td>${fmt(tot.r2)}</td><td>${fmt(tot.inc - tot.exp)}</td></tr></tfoot></table></div>
  <p class="small mute">Berechnet aus den Einträgen und ihren Gültigkeitszeiträumen. Vierteljährliche/jährliche Posten sind auf Monate verteilt. „Sparen“ ist in den Ausgaben enthalten.</p></div>`;
}

function viewGoals() {
  const m = ui.month;
  const abos = state.entries.filter(e => e.type === 'abo' && active(e, m)).sort((a, b) => monthly(b) - monthly(a));
  const sumM = abos.reduce((s, e) => s + monthly(e), 0);
  let h = `<div class="card"><h2>Abos · ${esc(monthName(m))}</h2>`;
  if (!abos.length) h += '<p class="mute">Keine Abos erfasst. Lege Einträge vom Typ „Abo“ an.</p>';
  else {
    h += abos.map(e => `<button class="item" data-act="edit" data-id="${esc(e.id)}"><span class="t"><b>${esc(e.name)}</b><span class="tag">${esc(personLabel(e.person))} · ${fmt(monthly(e))}/Monat</span></span><span class="amt">${fmt(monthly(e) * 12)}<span class="tag">/Jahr</span></span></button>`).join('');
    h += `<div class="row"><span><b>Summe</b></span><span><b>${fmt(sumM)}/Monat · ${fmt(sumM * 12)}/Jahr</b></span></div>`;
  }
  h += '</div><div class="card"><h2>Sparziele</h2>';
  if (!state.goals.length) h += '<p class="mute">Noch keine Sparziele.</p>';
  h += state.goals.map(g => {
    const p = g.target > 0 ? Math.min(1, Math.max(0, g.saved / g.target)) : 0;
    return `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="row"><span style="color:inherit"><b>${esc(g.name || '(ohne Namen)')}</b></span><span>${fmt(g.saved)} / ${fmt(g.target)}</span></div>
    <svg viewBox="0 0 100 3" width="100%" height="10" preserveAspectRatio="none" role="img" aria-label="${pctf.format(p)} erreicht"><rect width="100" height="3" rx="1.5" fill="currentColor" opacity=".15"/><rect width="${p * 100}" height="3" rx="1.5" fill="#0f766e"/></svg>
    <div class="actions"><span class="small mute" style="align-self:center">${pctf.format(p)} erreicht</span><button class="btn" data-act="deposit" data-id="${esc(g.id)}">+ Einzahlen</button><button class="btn" data-act="goal" data-id="${esc(g.id)}">Bearbeiten</button></div></div>`;
  }).join('');
  return h + '<button class="btn primary block" data-act="goal">Sparziel hinzufügen</button></div>';
}

function viewSettings() {
  const s = state.settings;
  const last = state.lastBackup ? new Date(state.lastBackup).toLocaleDateString('de-DE') : 'noch nie';
  return `<div class="card"><h2>Personen</h2><div class="two"><div><label for="n1">Name 1</label><input id="n1" maxlength="20" value="${esc(s.names[0])}"></div><div><label for="n2">Name 2</label><input id="n2" maxlength="20" value="${esc(s.names[1])}"></div></div></div>
  <div class="card"><h2>Aufteilung gemeinsamer Posten</h2><div class="radio">
  <label><input type="radio" name="mode" value="half" ${s.mode === 'half' ? 'checked' : ''}>50 / 50</label>
  <label><input type="radio" name="mode" value="income" ${s.mode === 'income' ? 'checked' : ''}>Nach Einkommen</label>
  <label><input type="radio" name="mode" value="custom" ${s.mode === 'custom' ? 'checked' : ''}>Individuell</label></div>
  <label for="pct">Anteil ${esc(s.names[0])} in % (nur „Individuell“)</label><input id="pct" inputmode="numeric" value="${s.p1pct}"></div>
  <div class="card"><h2>Konto</h2><p class="small mute">Angemeldet als ${esc(window.Cloud ? Cloud.user() : '')}. Die Daten werden automatisch zwischen euren Geräten abgeglichen.</p><div class="actions"><button class="btn" data-act="logout">Abmelden</button></div></div>
  <div class="card"><h2>Backup</h2><p class="small mute">Daten liegen in eurer privaten Cloud und in diesem Browser. Letztes Backup: ${esc(last)}. Sichere regelmäßig – z. B. in iCloud Drive oder per AirDrop an die Partnerin.</p>
  <div class="actions"><button class="btn primary" data-act="export">Backup exportieren</button><button class="btn" data-act="import">Backup importieren</button></div></div>
  <div class="card"><h2>Hinweise</h2><p class="small mute">iPhone: In Safari „Teilen“ → „Zum Home-Bildschirm“. Die installierte App hat einen eigenen Speicher – Daten dort per Backup-Import übernehmen. Safari kann Daten nach längerer Nichtnutzung löschen; Backups schützen davor.</p></div>
  <div class="card"><h2>Daten</h2><div class="actions"><button class="btn" data-act="demo">Demodaten laden</button><button class="btn danger" data-act="wipe">Alle Daten löschen</button></div></div>
  <p class="small mute" style="text-align:center">Finanzrechner v1 · private Cloud, kein Tracking</p>`;
}

/* ---------- Rendern ---------- */
const TITLES = { overview: 'Übersicht', tx: 'Buchungen', entries: 'Plan', year: 'Jahr', goals: 'Abos & Ziele', settings: 'Mehr' };
function render() {
  $('#view').innerHTML = { overview: viewOverview, tx: viewTx, entries: viewEntries, year: viewYear, goals: viewGoals, settings: viewSettings }[ui.tab]();
  $('#title').textContent = TITLES[ui.tab];
  $('#monthlabel').textContent = ui.tab === 'year' ? ui.month.slice(0, 4) : monthName(ui.month);
  $('#monthnav').classList.toggle('hidden', ui.tab === 'settings');
  document.querySelectorAll('#tabs button').forEach(b => { if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
}
const dlg = $('#dlg');
function openDialog(html) { dlg.innerHTML = '<div class="dlg">' + html + '</div>'; if (!dlg.open) dlg.showModal(); }
function closeDialog() { if (dlg.open) dlg.close(); }

/* ---------- Dialoge ---------- */
function entryForm(id) {
  const e = id ? state.entries.find(x => x.id === id) : null;
  const d = e || { person: ui.filter === 'p1' || ui.filter === 'p2' ? ui.filter : 'joint', name: '', amount: '', type: 'fix', category: 'Sonstiges', interval: 'monthly', from: '', to: '', note: '' };
  const opt = (o, sel) => Object.entries(o).map(([k, v]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(Array.isArray(v) ? v[0] : v)}</option>`).join('');
  openDialog(`<h2>${e ? 'Eintrag bearbeiten' : 'Neuer Eintrag'}</h2><form id="ef" autocomplete="off">
  <label for="f-person">Wer</label><select id="f-person"><option value="p1" ${d.person === 'p1' ? 'selected' : ''}>${esc(names()[0])}</option><option value="p2" ${d.person === 'p2' ? 'selected' : ''}>${esc(names()[1])}</option><option value="joint" ${d.person === 'joint' ? 'selected' : ''}>Gemeinsam</option></select>
  <label for="f-name">Beschreibung</label><input id="f-name" maxlength="80" required value="${esc(d.name)}">
  <div class="two"><div><label for="f-amount">Betrag (€)</label><input id="f-amount" inputmode="decimal" required value="${d.amount === '' ? '' : esc(numStr(d.amount))}"></div>
  <div><label for="f-interval">Intervall</label><select id="f-interval">${opt(INTERVALS, d.interval)}</select></div></div>
  <div class="two"><div><label for="f-type">Typ</label><select id="f-type">${opt(TYPES, d.type)}</select></div>
  <div><label for="f-cat">Kategorie</label><select id="f-cat">${CATS.map(c => `<option ${c === d.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div>
  <div class="two"><div><label for="f-from">Gültig ab (optional)</label><input id="f-from" type="month" value="${esc(d.from)}"></div><div><label for="f-to">Gültig bis (optional)</label><input id="f-to" type="month" value="${esc(d.to)}"></div></div>
  <label for="f-note">Notiz</label><input id="f-note" maxlength="200" value="${esc(d.note)}">
  <p class="small mute">Betrag immer positiv eingeben – ob Einnahme oder Ausgabe bestimmt der Typ.</p>
  <div class="actions"><button class="btn primary" type="submit">Speichern</button><button class="btn" type="button" data-act="close">Abbrechen</button>
  ${e ? `<button class="btn" type="button" data-act="dup" data-id="${esc(e.id)}">Duplizieren</button><button class="btn danger" type="button" data-act="del" data-id="${esc(e.id)}">Löschen</button>` : ''}</div>
  <input type="hidden" id="f-id" value="${e ? esc(e.id) : ''}"></form>`);
}
function goalForm(id) {
  const g = id ? state.goals.find(x => x.id === id) : { name: '', target: '', saved: 0 };
  if (!g) return;
  openDialog(`<h2>${id ? 'Sparziel bearbeiten' : 'Neues Sparziel'}</h2><form id="gf" autocomplete="off">
  <label for="g-name">Name</label><input id="g-name" maxlength="80" required value="${esc(g.name)}">
  <div class="two"><div><label for="g-target">Ziel (€)</label><input id="g-target" inputmode="decimal" required value="${esc(numStr(g.target))}"></div><div><label for="g-saved">Bisher gespart (€)</label><input id="g-saved" inputmode="decimal" required value="${esc(numStr(g.saved))}"></div></div>
  <div class="actions"><button class="btn primary" type="submit">Speichern</button><button class="btn" type="button" data-act="close">Abbrechen</button>${id ? `<button class="btn danger" type="button" data-act="goaldel" data-id="${esc(id)}">Löschen</button>` : ''}</div>
  <input type="hidden" id="g-id" value="${id ? esc(id) : ''}"></form>`);
}
function txForm(id) {
  const t = id ? state.txs.find(x => x.id === id) : null;
  const dd = ui.month === nowMonth() ? todayStr() : ui.month + '-01';
  const d = t || { kind: 'expense', date: dd, amount: '', shop: '', person: 'joint', category: 'Lebensmittel', budgetId: '', note: '' };
  if (!t) d.budgetId = pickBudget(d.category, d.person, d.date.slice(0, 7));
  openDialog(`<h2>${t ? 'Buchung bearbeiten' : 'Neue Buchung'}</h2><form id="tf" autocomplete="off">
  <div class="two"><div><label for="t-kind">Art</label><select id="t-kind"><option value="expense" ${d.kind === 'expense' ? 'selected' : ''}>Ausgabe</option><option value="income" ${d.kind === 'income' ? 'selected' : ''}>Einnahme</option></select></div>
  <div><label for="t-date">Datum</label><input id="t-date" type="date" required value="${esc(d.date)}"></div></div>
  <div class="two"><div><label for="t-amount">Betrag (€)</label><input id="t-amount" inputmode="decimal" required value="${d.amount === '' ? '' : esc(numStr(d.amount))}"></div>
  <div><label for="t-person">Wer</label><select id="t-person"><option value="p1" ${d.person === 'p1' ? 'selected' : ''}>${esc(names()[0])}</option><option value="p2" ${d.person === 'p2' ? 'selected' : ''}>${esc(names()[1])}</option><option value="joint" ${d.person === 'joint' ? 'selected' : ''}>Gemeinsam</option></select></div></div>
  <label for="t-shop">Geschäft / Beschreibung</label><input id="t-shop" maxlength="80" value="${esc(d.shop)}">
  <label for="t-cat">Kategorie</label><select id="t-cat">${CATS.map(c => `<option ${c === d.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
  <label for="t-budget">Auf Budget buchen</label><select id="t-budget">${budgetOptions(d.date.slice(0, 7), d.budgetId)}</select>
  <label for="t-note">Notiz</label><input id="t-note" maxlength="200" value="${esc(d.note)}">
  <div class="actions"><button class="btn primary" type="submit">Speichern</button><button class="btn" type="button" data-act="close">Abbrechen</button>${t ? `<button class="btn danger" type="button" data-act="deltx" data-id="${esc(t.id)}">Löschen</button>` : ''}</div>
  <input type="hidden" id="t-id" value="${t ? esc(t.id) : ''}"></form>`);
}
function refreshBudgetSelect(prefix) {
  const date = $('#' + prefix + '-date').value || todayStr(), sel = $('#' + prefix + '-budget');
  sel.innerHTML = budgetOptions(date.slice(0, 7), pickBudget($('#' + prefix + '-cat').value, $('#' + prefix + '-person').value, date.slice(0, 7)));
}
function submitTx() {
  const amount = parseAmount($('#t-amount').value);
  if (isNaN(amount) || amount <= 0) return toast('Bitte einen gültigen Betrag über 0 eingeben.');
  const date = $('#t-date').value;
  if (!DATE_RE.test(date)) return toast('Bitte ein Datum wählen.');
  const id = $('#t-id').value, kind = $('#t-kind').value;
  const t = cleanTx({ id: id || uid(), date, amount, kind, person: $('#t-person').value, shop: $('#t-shop').value.trim(), category: $('#t-cat').value, budgetId: kind === 'expense' ? $('#t-budget').value : '', note: $('#t-note').value.trim() });
  const i = state.txs.findIndex(x => x.id === id);
  if (i >= 0) state.txs[i] = t; else state.txs.push(t);
  ui.month = date.slice(0, 7); save(); closeDialog(); render(); toast('Gebucht – neu berechnet');
}
function confirmDialog(text, okLabel, onOk) {
  openDialog(`<h2>Bist du sicher?</h2><p>${esc(text)}</p><div class="actions"><button class="btn danger" id="c-ok">${esc(okLabel)}</button><button class="btn" data-act="close">Abbrechen</button></div>`);
  $('#c-ok').onclick = () => { closeDialog(); onOk(); };
}
function depositDialog(id) {
  const g = state.goals.find(x => x.id === id); if (!g) return;
  openDialog(`<h2>Einzahlen: ${esc(g.name)}</h2><form id="df"><label for="d-amt">Betrag (€, negativ = entnehmen)</label><input id="d-amt" inputmode="decimal" required><input type="hidden" id="d-id" value="${esc(g.id)}">
  <div class="actions"><button class="btn primary" type="submit">Buchen</button><button class="btn" type="button" data-act="close">Abbrechen</button></div></form>`);
}

/* ---------- Aktionen ---------- */
function submitEntry() {
  const amount = parseAmount($('#f-amount').value);
  if (isNaN(amount) || amount < 0) return toast('Bitte einen gültigen, nicht negativen Betrag eingeben.');
  const from = $('#f-from').value, to = $('#f-to').value;
  if (from && to && from > to) return toast('„Gültig bis“ liegt vor „Gültig ab“.');
  const type = $('#f-type').value;
  let cat = $('#f-cat').value;
  if (type === 'sparen') cat = 'Sparen'; else if (type === 'abo' && cat === 'Sonstiges') cat = 'Abos'; else if (type === 'rate' && cat === 'Sonstiges') cat = 'Kredite & Raten';
  const id = $('#f-id').value;
  const e = cleanEntry({ id: id || uid(), person: $('#f-person').value, name: $('#f-name').value.trim(), amount, type, category: cat, interval: $('#f-interval').value, from, to, note: $('#f-note').value.trim() });
  const i = state.entries.findIndex(x => x.id === id);
  if (i >= 0) state.entries[i] = e; else state.entries.push(e);
  save(); closeDialog(); render(); toast('Gespeichert');
}
function submitGoal() {
  const target = parseAmount($('#g-target').value), saved = parseAmount($('#g-saved').value);
  if (isNaN(target) || target < 0 || isNaN(saved)) return toast('Bitte gültige Beträge eingeben.');
  const id = $('#g-id').value;
  const g = cleanGoal({ id: id || uid(), name: $('#g-name').value.trim(), target, saved });
  const i = state.goals.findIndex(x => x.id === id);
  if (i >= 0) state.goals[i] = g; else state.goals.push(g);
  save(); closeDialog(); render();
}
function submitDeposit() {
  const g = state.goals.find(x => x.id === $('#d-id').value); if (!g) return;
  const v = parseAmount($('#d-amt').value);
  if (isNaN(v)) return toast('Ungültiger Betrag');
  g.saved = round2(g.saved + v); save(); closeDialog(); render();
}
function demoData() {
  const y = nowMonth().slice(0, 4);
  const E = (person, name, amount, type, category, interval = 'monthly', from = '', to = '', note = '') => ({ id: uid(), person, name, amount, type, category, interval, from, to, note });
  const demo = cleanState({ settings: { names: ['Alex', 'Sam'], mode: 'income', p1pct: 50 }, entries: [
    E('p1', 'Gehalt (Demo)', 2400, 'income', 'Sonstiges'), E('p2', 'Gehalt (Demo)', 1900, 'income', 'Sonstiges'), E('joint', 'Kindergeld (Demo)', 250, 'income', 'Sonstiges'),
    E('joint', 'Miete (Demo)', 1000, 'fix', 'Wohnen'), E('joint', 'Strom (Demo)', 80, 'fix', 'Energie & Medien'), E('joint', 'Lebensmittel (Demo)', 450, 'variabel', 'Lebensmittel'),
    E('joint', 'Hausrat-Versicherung (Demo)', 120, 'fix', 'Versicherung', 'yearly'), E('p1', 'Auto-Steuer (Demo)', 90, 'fix', 'Mobilität', 'quarterly'),
    E('p1', 'Streaming (Demo)', 12.99, 'abo', 'Abos'), E('p2', 'Musik (Demo)', 10.99, 'abo', 'Abos'), E('p2', 'Handyvertrag (Demo)', 19.99, 'abo', 'Abos'),
    E('p2', 'Ratenzahlung Laptop (Demo)', 60, 'rate', 'Kredite & Raten', 'monthly', y + '-01', y + '-12', 'befristet'),
    E('joint', 'Sparen Urlaub (Demo)', 100, 'sparen', 'Sparen'), E('p1', 'Sparen Notgroschen (Demo)', 150, 'sparen', 'Sparen'), E('p2', 'Freizeit (Demo)', 80, 'variabel', 'Freizeit')
  ], txs: [], goals: [{ id: uid(), name: 'Urlaub (Demo)', target: 2000, saved: 600 }, { id: uid(), name: 'Notgroschen (Demo)', target: 5000, saved: 1250 }] });
  const food = demo.entries.find(e => e.name.startsWith('Lebensmittel'));
  demo.txs = ['Supermarkt (Demo)', 'Bäckerei (Demo)'].map((shop, i) => cleanTx({ date: nowMonth() + '-0' + (i + 1), amount: i ? 8.4 : 62.4, person: 'joint', shop, category: 'Lebensmittel', budgetId: food.id }));
  return demo;
}
async function exportData() {
  const stamp = new Date().toISOString().slice(0, 10);
  state.lastBackup = new Date().toISOString(); save();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const file = new File([blob], `finanzrechner-backup-${stamp}.json`, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Finanzrechner Backup' }); render(); return; }
  } catch (e) { if (e && e.name === 'AbortError') { render(); return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Backup exportiert'); render();
}
function importData() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      if (f.size > 5e6) throw new Error('Datei zu groß');
      const d = JSON.parse(await f.text());
      if (!d || d.app !== 'finanzrechner' || !Array.isArray(d.entries)) throw new Error('kein Finanzrechner-Backup');
      const n = cleanState(d);
      confirmDialog(`Backup enthält ${n.entries.length} Einträge, ${n.txs.length} Buchungen und ${n.goals.length} Sparziele. Aktuelle Daten werden ersetzt.`, 'Importieren', () => { state = n; save(); render(); toast('Backup importiert'); });
    } catch (e) { toast('Import fehlgeschlagen: ' + e.message); }
  };
  inp.click();
}
function loadDemo() {
  const go = () => { state = demoData(); save(); ui.tab = 'overview'; render(); toast('Demodaten geladen (erfunden)'); };
  if (state.entries.length || state.goals.length || state.txs.length) confirmDialog('Die aktuellen Daten werden durch erfundene Demodaten ersetzt. Exportiere vorher ein Backup, falls nötig.', 'Ersetzen', go); else go();
}

/* ---------- Events ---------- */
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act],[data-tab]'); if (!t) return;
  if (t.dataset.tab) { ui.tab = t.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const id = t.dataset.id;
  switch (t.dataset.act) {
    case 'prev': ui.month = shiftMonth(ui.month, ui.tab === 'year' ? -12 : -1); render(); break;
    case 'next': ui.month = shiftMonth(ui.month, ui.tab === 'year' ? 12 : 1); render(); break;
    case 'today': ui.month = nowMonth(); render(); break;
    case 'filter': ui.filter = t.dataset.v; render(); break;
    case 'new': entryForm(null); break;
    case 'edit': entryForm(id); break;
    case 'close': closeDialog(); break;
    case 'dup': { const e = state.entries.find(x => x.id === id); if (e) { state.entries.push({ ...e, id: uid(), name: (e.name + ' (Kopie)').slice(0, 80) }); save(); closeDialog(); render(); toast('Dupliziert'); } break; }
    case 'del': confirmDialog('Eintrag wirklich löschen?', 'Löschen', () => { state.entries = state.entries.filter(x => x.id !== id); save(); render(); }); break;
    case 'goal': goalForm(id || null); break;
    case 'goaldel': confirmDialog('Sparziel wirklich löschen?', 'Löschen', () => { state.goals = state.goals.filter(x => x.id !== id); save(); render(); }); break;
    case 'deposit': depositDialog(id); break;
    case 'newtx': txForm(null); break;
    case 'edittx': txForm(id); break;
    case 'deltx': confirmDialog('Buchung wirklich löschen?', 'Löschen', () => { state.txs = state.txs.filter(x => x.id !== id); save(); render(); }); break;
    case 'receipt': pickReceipt(); break;
    case 'logout': confirmDialog('Abmelden?', 'Abmelden', () => Cloud.logout()); break;
    case 'export': exportData(); break;
    case 'import': importData(); break;
    case 'demo': loadDemo(); break;
    case 'wipe': confirmDialog('ALLE Einträge, Buchungen und Sparziele auf diesem Gerät löschen? Das kann nicht rückgängig gemacht werden.', 'Alles löschen', () => { state = cleanState({ settings: state.settings }); save(); render(); toast('Alle Daten gelöscht'); }); break;
  }
});
document.addEventListener('submit', ev => {
  ev.preventDefault();
  if (ev.target.id === 'ef') submitEntry(); else if (ev.target.id === 'gf') submitGoal(); else if (ev.target.id === 'df') submitDeposit(); else if (ev.target.id === 'tf') submitTx();
});
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.id === 'search') { ui.search = t.value; const pos = t.selectionStart; render(); const s = $('#search'); s.focus(); s.setSelectionRange(pos, pos); }
});
document.addEventListener('change', ev => {
  const t = ev.target;
  const m = /^([tr])-(cat|person|date)$/.exec(t.id || '');
  if (m && dlg.open) { refreshBudgetSelect(m[1]); return; }
  if (ui.tab !== 'settings' || dlg.open) return;
  if (t.id === 'n1' || t.id === 'n2') { state.settings.names[t.id === 'n1' ? 0 : 1] = t.value.trim().slice(0, 20) || (t.id === 'n1' ? 'Person 1' : 'Person 2'); save(); render(); }
  else if (t.name === 'mode') { state.settings.mode = t.value; save(); toast('Aufteilung gespeichert'); }
  else if (t.id === 'pct') { const v = Number(String(t.value).replace(',', '.')); state.settings.p1pct = isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 50; save(); render(); }
});
dlg.addEventListener('click', ev => { if (ev.target === dlg) closeDialog(); });

/* ---------- Start ---------- */
render();
/* Optional: lokale Startdaten. Nur wenn seed.json neben der App liegt (nicht im Repo/Hosting!), der Speicher leer ist und noch nie befüllt wurde. */
(async () => {
  try {
    if (state.entries.length || state.goals.length || state.txs.length || localStorage.getItem(KEY + '.seeded')) return;
    const r = await fetch('seed.json', { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    if (!d || d.app !== 'finanzrechner' || !Array.isArray(d.entries)) return;
    state = cleanState(d); save();
    try { localStorage.setItem(KEY + '.seeded', '1'); } catch (e) { /* egal */ }
    render(); toast('Startdaten geladen');
  } catch (e) { /* kein seed.json vorhanden – normal */ }
})();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
