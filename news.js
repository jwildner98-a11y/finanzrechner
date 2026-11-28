/* Neuigkeiten-Fenster nach einem Update. Bei jeder spürbaren Änderung NEWS_ID und NEWS ersetzen. */
(() => {
  'use strict';
  const NEWS_ID = '2026-11-28-push-neustart';
  const TITLE = 'Neu im Finanzrechner';
  const NEWS = [
    ['Erinnerungen aufs Handy:', 'Unten links kannst du Push-Benachrichtigungen aktivieren. Die Anmeldung wird beim Server gespeichert und beim Öffnen geprüft.'],
    ['Support oben rechts:', 'Für Wünsche, Fehler und Fragen bitte den Support-Knopf nutzen. Das ist der direkte Weg zu Julius.'],
    ['Anmeldung neu:', 'Alle Geräte melden sich einmal neu an, damit der Schlüssel überall stimmt.'],
  ];
  const KEY = 'finanzrechner.news';   // je App eigen: alle Apps teilen sich dieselbe Adresse
  try { if (localStorage.getItem(KEY) === NEWS_ID) return; } catch (e) { return; }

  const el = (tag, style, text) => {
    const n = document.createElement(tag);
    if (style) n.style.cssText = style;
    if (text) n.textContent = text;
    return n;
  };
  const back = el('div', 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center');
  const card = el('div', 'box-sizing:border-box;width:100%;max-width:560px;max-height:85vh;overflow:auto;padding:22px 20px calc(20px + env(safe-area-inset-bottom));border-radius:24px 24px 0 0;background:var(--card,#fff);color:var(--ink,#14201e);font:16px/1.45 -apple-system,system-ui,sans-serif;text-align:left');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', TITLE);
  const list = el('ul', 'margin:0 0 18px;padding-left:22px');
  NEWS.forEach(([head, text]) => {
    const li = el('li', 'margin-bottom:12px');
    li.append(el('b', '', head), ' ' + text);
    list.append(li);
  });
  const ok = el('button', 'display:block;width:100%;padding:15px;border:0;border-radius:12px;font:600 17px -apple-system,system-ui,sans-serif;cursor:pointer;background:var(--accent,#0f766e);color:var(--accent-ink,#fff)', 'Verstanden');
  ok.type = 'button';
  ok.addEventListener('click', () => { localStorage.setItem(KEY, NEWS_ID); back.remove(); });
  card.append(el('h2', 'margin:0 0 14px;font-size:19px;text-align:center', '✨ ' + TITLE), list, ok);
  back.append(card);
  back.addEventListener('click', (e) => e.stopPropagation());
  document.body.append(back);
})();
