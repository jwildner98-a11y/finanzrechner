'use strict';
/* Cloud-Login und Sync (Supabase). Identische Datei in Haus-Cockpit und Finanzrechner.
   Die App-Skripte werden erst nach erfolgreichem Login geladen (data-then). Kein CDN, nur fetch.
   Der Anon-Key ist öffentlich vorgesehen; geschützt wird durch Login + Row Level Security. */
(function () {
  const SB = 'https://xgutbeabqmyvmvlgqlwu.supabase.co';
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhndXRiZWFicW15dm12bGdxbHd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NTU4NzQsImV4cCI6MjExMTAzMTg3NH0.7xUAuYSlz3t0sr4G76weo1ACmIJxr2Y1sZAoR5Ya9-E';
  const DOMAIN = '@haushalt.local';
  const USERS = [['tinkerbell', 'Tinkerbell'], ['pan', 'Pan']];
  const me = document.currentScript;
  const APP = me.dataset.app, KEY = me.dataset.key;
  const NEXT = (me.dataset.then || '').split(',').filter(Boolean);
  const SK = 'sb-session-' + APP, MK = KEY + '.sync', BK = KEY + '.vor-sync';

  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const lsDel = k => { try { localStorage.removeItem(k); } catch (e) { /* egal */ } };
  const getJSON = k => { try { return JSON.parse(lsGet(k)); } catch (e) { return null; } };
  const meta = () => getJSON(MK) || { at: null, dirty: false };
  const setMeta = m => lsSet(MK, JSON.stringify(m));
  const isEmpty = d => !d || typeof d !== 'object' || !Object.keys(d).length;

  /* ---------- Netzwerk ---------- */
  async function http(path, { method = 'GET', body, token, headers = {} } = {}) {
    const r = await fetch(SB + path, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { apikey: ANON, Authorization: 'Bearer ' + (token || ANON), 'Content-Type': 'application/json', ...headers }
    });
    let j = null; try { j = await r.json(); } catch (e) { /* leer */ }
    return { ok: r.ok, status: r.status, json: j };
  }
  function storeSession(j) {
    const s = { access: j.access_token, refresh: j.refresh_token, exp: Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: (j.user && j.user.email) || '' };
    lsSet(SK, JSON.stringify(s)); return s;
  }
  async function signIn(name, password) {
    const r = await http('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: name + DOMAIN, password } });
    if (!r.ok) throw new Error(r.status === 400 ? 'Name oder Passwort stimmt nicht.' : 'Anmeldung fehlgeschlagen (' + r.status + ').');
    return storeSession(r.json);
  }
  /* liefert Token, null (nicht angemeldet) oder wirft bei fehlendem Netz */
  async function token() {
    const s = getJSON(SK);
    if (!s || !s.access) return null;
    if (s.exp - 60 > Date.now() / 1000) return s.access;
    const r = await http('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh } });
    if (r.ok) return storeSession(r.json).access;
    if (r.status === 400 || r.status === 401) { lsDel(SK); return null; }
    throw new Error('offline');
  }
  async function pull(tk) {
    const r = await http('/rest/v1/app_state?app=eq.' + APP + '&select=data,updated_at', { token: tk });
    if (!r.ok) throw new Error('pull ' + r.status);
    return r.json[0] || null;
  }
  async function pushNow() {
    const raw = lsGet(KEY); if (!raw) return;
    let data; try { data = JSON.parse(raw); } catch (e) { return; }
    const tk = await token(); if (!tk) return;
    const s = getJSON(SK);
    const r = await http('/rest/v1/app_state?on_conflict=app', {
      method: 'POST', token: tk, headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: { app: APP, data, updated_at: new Date().toISOString(), updated_by: s && s.email }
    });
    if (!r.ok) throw new Error('push ' + r.status);
    /* Wurde zwischenzeitlich erneut lokal gespeichert, bleibt dirty bestehen. */
    if (lsGet(KEY) === raw) setMeta({ at: r.json[0].updated_at, dirty: false });
    else setMeta({ at: r.json[0].updated_at, dirty: true });
  }

  /* ---------- Sync-Steuerung (von der App über Cloud.queuePush() aufgerufen) ---------- */
  let timer = null, busy = false;
  function queuePush() {
    setMeta({ ...meta(), dirty: true });
    clearTimeout(timer); timer = setTimeout(flush, 800);
  }
  async function flush() {
    if (busy) { timer = setTimeout(flush, 800); return; }
    if (!meta().dirty) return;
    busy = true;
    try { await pushNow(); } catch (e) { /* offline: bleibt dirty, nächster Versuch bei online/sichtbar */ }
    busy = false;
    if (meta().dirty && navigator.onLine) { clearTimeout(timer); timer = setTimeout(flush, 5000); }
  }
  async function refreshFromCloud() {
    if (busy || meta().dirty) { flush(); return; }
    try {
      const tk = await token(); if (!tk) return;
      const row = await pull(tk);
      if (row && !isEmpty(row.data) && row.updated_at !== meta().at) {
        lsSet(MK, JSON.stringify({ at: row.updated_at, dirty: false }));
        lsSet(KEY, JSON.stringify(row.data));
        location.reload();
      }
    } catch (e) { /* offline */ }
  }
  function logout() { lsDel(SK); location.reload(); }

  /* ---------- Erstabgleich nach Login ---------- */
  async function initialSync(tk) {
    const row = await pull(tk);
    const local = lsGet(KEY), m = meta();
    const remoteHas = row && !isEmpty(row.data);
    if (!remoteHas) {
      if (local) { setMeta({ at: null, dirty: true }); await pushNow(); sessionStorage.setItem('cloud-msg', 'Lokale Daten in die Cloud übernommen'); }
      return;
    }
    const takeRemote = () => {
      if (local) lsSet(BK, local);               /* Sicherheitskopie des überschriebenen Stands */
      lsSet(KEY, JSON.stringify(row.data)); setMeta({ at: row.updated_at, dirty: false });
    };
    if (!local) { takeRemote(); return; }
    if (m.at === row.updated_at) { if (m.dirty) await pushNow(); return; }   /* Cloud unverändert */
    let same = false; try { same = JSON.stringify(JSON.parse(local)) === JSON.stringify(row.data); } catch (e) { /* ungleich */ }
    if (same) { setMeta({ at: row.updated_at, dirty: false }); return; }
    if (!m.at || m.dirty) {
      /* Gerät war noch nie synchron oder hat ungesicherte Änderungen, und die Cloud hat Neueres. */
      const useCloud = confirm('Auf diesem Gerät und in der Cloud gibt es unterschiedliche Daten.\n\nOK = Stand aus der Cloud übernehmen (der lokale Stand wird als Sicherheitskopie behalten)\nAbbrechen = Daten dieses Geräts in die Cloud hochladen');
      if (useCloud) takeRemote(); else { setMeta({ at: row.updated_at, dirty: true }); await pushNow(); }
    } else takeRemote();   /* Gerät war synchron, Cloud ist neuer */
  }

  /* ---------- Login-Oberfläche ---------- */
  function loginScreen(error) {
    return new Promise(resolve => {
      const css = document.createElement('style');
      css.textContent = '#cl{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:24px;background:#f4f6f8;color:#16202a;font:16px/1.4 -apple-system,BlinkMacSystemFont,system-ui,sans-serif}' +
        '@media(prefers-color-scheme:dark){#cl{background:#14181c;color:#eaeff3}#cl form{background:#1d2329!important}#cl select,#cl input{background:#14181c!important;color:#eaeff3!important;border-color:#2b333b!important}}' +
        '#cl form{width:100%;max-width:340px;background:#fff;border-radius:20px;padding:24px;box-shadow:0 4px 24px rgba(0,0,0,.12)}#cl h1{font-size:22px;margin:0 0 4px}#cl p{margin:0 0 16px;color:#6a7885;font-size:14px}' +
        '#cl label{display:block;font-size:13px;margin:12px 0 4px;color:#6a7885}#cl select,#cl input{width:100%;font:inherit;padding:12px;border:1px solid #d5dce2;border-radius:12px;background:#fff;color:inherit}' +
        '#cl button{width:100%;margin-top:18px;padding:13px;border:0;border-radius:12px;font:inherit;font-weight:600;background:#2563eb;color:#fff}#cl button:disabled{opacity:.6}#cl .err{color:#e5484d;font-size:14px;margin:12px 0 0;min-height:1em}';
      document.head.appendChild(css);
      const box = document.createElement('div'); box.id = 'cl';
      const opts = USERS.map(([v, l]) => '<option value="' + v + '">' + l + '</option>').join('');
      box.innerHTML = '<form autocomplete="on"><h1></h1><p>Bitte anmelden</p><label for="cln">Name</label><select id="cln" name="username" autocomplete="username">' + opts +
        '</select><label for="clp">Passwort</label><input id="clp" type="password" name="password" autocomplete="current-password" required><div class="err" role="alert"></div><button type="submit">Anmelden</button></form>';
      box.querySelector('h1').textContent = document.title || 'Anmeldung';
      document.body.appendChild(box);
      const sel = box.querySelector('select'), pw = box.querySelector('input'), err = box.querySelector('.err'), btn = box.querySelector('button');
      const last = lsGet('sb-last-user'); if (last) sel.value = last;
      err.textContent = error || '';
      box.querySelector('form').addEventListener('submit', async ev => {
        ev.preventDefault(); err.textContent = ''; btn.disabled = true;
        try { await signIn(sel.value, pw.value); lsSet('sb-last-user', sel.value); box.remove(); css.remove(); resolve(); }
        catch (e) { err.textContent = e.message === 'Failed to fetch' ? 'Keine Verbindung. Zum ersten Anmelden wird Internet gebraucht.' : e.message; btn.disabled = false; pw.select(); }
      });
      pw.focus();
    });
  }

  function loadScripts(list, done) {
    const next = () => {
      const src = list.shift(); if (!src) { done && done(); return; }
      const s = document.createElement('script'); s.src = src; s.onload = next; s.onerror = next; document.body.appendChild(s);
    };
    next();
  }

  /* ---------- Start ---------- */
  window.Cloud = { queuePush, logout, user: () => { const s = getJSON(SK); return s ? s.email : ''; } };
  (async function boot() {
    let tk = null, offline = false;
    try { tk = await token(); } catch (e) { offline = true; }
    if (offline && getJSON(SK)) { /* Netz fehlt, Sitzung vorhanden: lokal weiterarbeiten */ }
    else {
      if (!tk) { await loginScreen(); tk = await token(); }
      try { await initialSync(tk); } catch (e) { /* Cloud nicht erreichbar: lokal weiterarbeiten */ }
    }
    loadScripts(NEXT.slice(), () => {
      const msg = sessionStorage.getItem('cloud-msg');
      if (msg) { sessionStorage.removeItem('cloud-msg'); const t = document.getElementById('toast'); if (t) { t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); } }
    });
    addEventListener('online', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshFromCloud(); });
  })();
})();
