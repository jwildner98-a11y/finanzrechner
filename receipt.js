'use strict';
/* Beleg einlesen: PDF (Text) oder Foto (OCR) – alles lokal auf dem Gerät, ohne Netzwerk.
   Bibliotheken liegen in vendor/ und werden erst bei Bedarf geladen. */

const SHOPS = ['REWE', 'EDEKA', 'ALDI', 'LIDL', 'Penny', 'Netto', 'Kaufland', 'dm', 'Rossmann', 'Müller', 'ARAL', 'Shell', 'Esso', 'JET', 'Amazon', 'IKEA', 'Telekom', 'Vodafone', 'Netflix', 'Spotify', 'Apotheke', 'Action', 'Tedi', 'Decathlon', 'Hornbach', 'OBI', 'Bauhaus', 'McDonald', 'Burger King', 'Subway', 'Starbucks'];
const CAT_RULES = [
  [/rewe|edeka|aldi|lidl|penny|netto|kaufland|bäckerei|baeckerei|metzger|supermarkt|lebensmittel|getränke|markt\b/i, 'Lebensmittel'],
  [/aral|shell|esso|jet\b|tankstelle|tanken|diesel|super e10|parkhaus|parken|bahn|tickets?\b|werkstatt|tüv|adac/i, 'Mobilität'],
  [/strom|gas\b|stadtwerke|telekom|vodafone|o2\b|freenet|internet|mobilfunk|handy|gez|rundfunk/i, 'Energie & Medien'],
  [/versicherung|police|haftpflicht|rechtsschutz|krankenkasse/i, 'Versicherung'],
  [/miete|nebenkosten|hausverwaltung|vermieter|hornbach|obi\b|bauhaus|ikea/i, 'Wohnen'],
  [/netflix|spotify|disney|paramount|audible|prime|abo\b|abonnement|youtube/i, 'Abos'],
  [/darlehen|kredit|rate\b|ratenzahlung|paypal/i, 'Kredite & Raten'],
  [/restaurant|café|cafe|kino|mcdonald|burger|subway|starbucks|bar\b|pizza|döner|eintritt|freizeit|spiel/i, 'Freizeit']
];

/* ---------- Bibliotheken laden ---------- */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-lib="' + src + '"]')) return resolve();
    const s = document.createElement('script');
    s.src = src; s.dataset.lib = src; s.onload = resolve;
    s.onerror = () => reject(new Error('Bibliothek konnte nicht geladen werden'));
    document.head.appendChild(s);
  });
}
const absUrl = p => new URL(p, location.href).href;

/* ---------- Text aus PDF / Bild ---------- */
async function pdfToText(file) {
  await loadScript('vendor/pdfjs/pdf.min.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc = absUrl('vendor/pdfjs/pdf.worker.min.js');
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  let text = '';
  const pages = Math.min(pdf.numPages, 5);
  for (let n = 1; n <= pages; n++) {
    const page = await pdf.getPage(n);
    const items = (await page.getTextContent()).items.filter(i => i.str && i.str.trim());
    const rows = new Map();
    for (const i of items) { const y = Math.round(i.transform[5] / 3); if (!rows.has(y)) rows.set(y, []); rows.get(y).push(i); }
    text += [...rows.keys()].sort((a, b) => b - a).map(y => rows.get(y).sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ')).join('\n') + '\n';
  }
  if (text.replace(/\s/g, '').length < 25) { /* gescanntes PDF ohne Text → Seite 1 per OCR */
    setProgress('PDF enthält nur ein Bild – Texterkennung …');
    const page = await pdf.getPage(1), vp = page.getViewport({ scale: 2 });
    const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    return ocr(await new Promise(r => cv.toBlob(r, 'image/png')));
  }
  return text;
}
async function shrinkImage(file, max = 2200) {
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
    return await new Promise(r => cv.toBlob(r, 'image/png'));
  } catch (e) { return file; }
}
async function ocr(blob) {
  await loadScript('vendor/tesseract/tesseract.min.js');
  const worker = await Tesseract.createWorker('deu', 1, {
    workerPath: absUrl('vendor/tesseract/worker.min.js'), corePath: absUrl('vendor/tesseract'), langPath: absUrl('vendor/tesseract/lang'),
    workerBlobURL: false, gzip: true,
    logger: m => { if (m.status === 'recognizing text') setProgress('Texterkennung … ' + Math.round(m.progress * 100) + ' %'); }
  });
  try { return (await worker.recognize(await shrinkImage(blob))).data.text; } finally { await worker.terminate(); }
}
function setProgress(t) { const el = $('#rprog'); if (el) el.textContent = t; }

/* ---------- Auswertung ---------- */
function parseReceipt(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const amounts = new Map();
  lines.forEach((line, idx) => {
    const re = /(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})(?!\d)/g; let m;
    while ((m = re.exec(line))) {
      const before = line[m.index - 1];
      if (before && /[\d,.]/.test(before)) continue;
      const v = Number(m[1].replace(/\./g, '') + '.' + m[2]);
      if (!(v > 0) || v > 1e6) continue;
      let sc = idx / lines.length;
      if (/gesamt|summe|zu zahlen|zahlbetrag|rechnungsbetrag|endbetrag|total|brutto|gesamtbetrag|betrag\b/i.test(line)) sc += 3;
      if (/karte|visa|master|girocard|ec\b|bar\b|€|eur/i.test(line)) sc += 0.6;
      if (/gegeben|rückgeld|rueckgeld|wechselgeld|zurück/i.test(line)) sc -= 3;
      if (/mwst|ust\b|netto|steuer|%/i.test(line) && !/brutto|gesamt/i.test(line)) sc -= 2;
      const old = amounts.get(v);
      if (!old || sc > old.score) amounts.set(v, { v, score: sc });
    }
  });
  const list = [...amounts.values()].sort((a, b) => b.score - a.score || b.v - a.v);
  let date = '';
  for (const m of text.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?!\d)/g)) {
    const d = +m[1], mo = +m[2]; let y = +m[3]; if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100) { date = y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0'); break; }
  }
  if (!date) { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(text); if (m) date = m[0]; }
  let shop = (SHOPS.find(s => new RegExp('\\b' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text)) || '');
  if (!shop) {
    const cand = lines.slice(0, 8).find(l => (l.match(/[A-Za-zÄÖÜäöüß]/g) || []).length >= 3 && !/rechnung|beleg|kassenbon|datum|tel\b|telefon|www\.|http|@|straße|str\.|\d{5}|^\W*\d/i.test(l));
    shop = cand ? cand.slice(0, 40) : '';
  }
  const low = text + ' ' + shop;
  const category = (CAT_RULES.find(([re]) => re.test(low)) || [0, 'Sonstiges'])[1];
  return { amounts: list.slice(0, 6), amount: list[0] ? list[0].v : '', date: date || todayStr(), dateFound: !!date, shop, category };
}

/* ---------- Ablauf ---------- */
function pickReceipt() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf,image/*';
  inp.onchange = () => { if (inp.files[0]) startReceipt(inp.files[0]); };
  inp.click();
}
async function startReceipt(file) {
  if (file.size > 25e6) return toast('Datei zu groß (max. 25 MB).');
  openDialog('<h2>Beleg wird gelesen …</h2><p class="mute" id="rprog">Bitte warten – das passiert nur auf diesem Gerät.</p>');
  try {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const text = isPdf ? await pdfToText(file) : await ocr(file);
    if (!text || text.replace(/\s/g, '').length < 5) throw new Error('Kein Text erkannt');
    receiptDialog(parseReceipt(text), text, file.name);
  } catch (e) {
    openDialog(`<h2>Beleg nicht lesbar</h2><p>${esc(e.message || 'Unbekannter Fehler')}. Du kannst die Buchung auch von Hand anlegen.</p><div class="actions"><button class="btn primary" data-act="newtx">Von Hand buchen</button><button class="btn" data-act="close">Schließen</button></div>`);
  }
}
function receiptDialog(r, text, fname) {
  const m = r.date.slice(0, 7);
  openDialog(`<h2>Beleg prüfen</h2><p class="small mute">Aus „${esc(fname)}“ erkannt – bitte kontrollieren${r.dateFound ? '' : ' (Datum nicht erkannt, heutiges eingesetzt)'}.</p>
  <form id="rf" autocomplete="off">
  ${r.amounts.length > 1 ? `<div class="small mute">Weitere Beträge im Beleg – antippen zum Übernehmen:</div><div class="chips">${r.amounts.map(a => `<button type="button" class="chip" data-act="pickamt" data-v="${a.v}">${fmt(a.v)}</button>`).join('')}</div>` : ''}
  <div class="two"><div><label for="r-amount">Betrag (€)</label><input id="r-amount" inputmode="decimal" required value="${r.amount === '' ? '' : esc(numStr(r.amount))}"></div>
  <div><label for="r-date">Datum</label><input id="r-date" type="date" required value="${esc(r.date)}"></div></div>
  <label for="r-shop">Geschäft / Beschreibung</label><input id="r-shop" maxlength="80" value="${esc(r.shop)}">
  <div class="two"><div><label for="r-person">Wer hat bezahlt?</label><select id="r-person"><option value="p1">${esc(names()[0])}</option><option value="p2">${esc(names()[1])}</option><option value="joint" selected>Gemeinsam</option></select></div>
  <div><label for="r-cat">Kategorie</label><select id="r-cat">${CATS.map(c => `<option ${c === r.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div></div>
  <label>Was ist das?</label><div class="radio"><label><input type="radio" name="rkind" value="once" checked>Einmalige Ausgabe</label><label><input type="radio" name="rkind" value="recurring">Wiederkehrend (in den Plan)</label></div>
  <div id="r-once"><label for="r-budget">Auf Budget buchen</label><select id="r-budget">${budgetOptions(m, pickBudget(r.category, 'joint', m))}</select></div>
  <div id="r-rec" hidden><label for="r-interval">Wie oft?</label><select id="r-interval"><option value="monthly">Monatlich</option><option value="quarterly">Vierteljährlich</option><option value="yearly">Jährlich</option></select>
  <p class="small mute">Wird als Plan-Eintrag ab dem Beleg-Monat angelegt (Typ „Abo“ bei Kategorie Abos, sonst „Fixkosten“).</p></div>
  <details style="margin-top:10px"><summary class="small mute">Erkannter Text</summary><pre class="small" style="white-space:pre-wrap;max-height:160px;overflow:auto">${esc(text.slice(0, 3000))}</pre></details>
  <div class="actions"><button class="btn primary" type="submit">Übernehmen</button><button class="btn" type="button" data-act="close">Verwerfen</button></div></form>`);
}
document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act="pickamt"]');
  if (t) $('#r-amount').value = numStr(t.dataset.v);
});
document.addEventListener('change', ev => {
  if (ev.target.name === 'rkind') { const rec = ev.target.value === 'recurring'; $('#r-once').hidden = rec; $('#r-rec').hidden = !rec; }
});
document.addEventListener('submit', ev => {
  if (ev.target.id !== 'rf') return;
  const amount = parseAmount($('#r-amount').value), date = $('#r-date').value;
  if (isNaN(amount) || amount <= 0) return toast('Bitte einen gültigen Betrag eingeben.');
  if (!DATE_RE.test(date)) return toast('Bitte ein Datum wählen.');
  const shop = $('#r-shop').value.trim(), person = $('#r-person').value, category = $('#r-cat').value;
  if (document.querySelector('input[name=rkind]:checked').value === 'recurring') {
    const e = cleanEntry({ id: uid(), person, name: shop || 'Wiederkehrende Ausgabe', amount, type: category === 'Abos' ? 'abo' : 'fix', category, interval: $('#r-interval').value, from: date.slice(0, 7), to: '', note: 'aus Beleg' });
    state.entries.push(e); ui.tab = 'entries'; toast('Im Plan angelegt – neu berechnet');
  } else {
    state.txs.push(cleanTx({ id: uid(), date, amount, kind: 'expense', person, shop, category, budgetId: $('#r-budget').value, note: 'aus Beleg' }));
    ui.tab = 'tx'; toast('Gebucht – neu berechnet');
  }
  ui.month = date.slice(0, 7); save(); closeDialog(); render();
});
