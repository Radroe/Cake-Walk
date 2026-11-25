// Cake Walk: startup, screens and navigation, Home, Settings, themes, Sprinkle.

import { CONFIG } from './config.js';
import { STORAGE, PROJECTS, WORKER } from './storage.js';
import { DEBUG } from './debug.js';
import { EDITOR } from './editor.js';
import { EXPORT } from './export.js';

DEBUG.init();

// ---------- Art ----------

// App icon: a glossy pink cake slice with chrome sprinkles and a play button on Bone.
// The Icon Generator draws exactly this SVG into icon.png, icon-192.png and icon-512.png.
// ICON_SVG_START
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>
<linearGradient id="cwF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF6BB5"/><stop offset="1" stop-color="#FF2D95"/></linearGradient>
<linearGradient id="cwE" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E0187A"/><stop offset="1" stop-color="#C70F66"/></linearGradient>
<linearGradient id="cwS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF8EE"/><stop offset="1" stop-color="#F3E2C9"/></linearGradient>
<linearGradient id="cwC" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#C9CCD1"/><stop offset="1" stop-color="#8E939B"/></linearGradient>
</defs>
<rect width="512" height="512" fill="#F4EFE8"/>
<ellipse cx="262" cy="416" rx="190" ry="22" fill="#DDD3C6"/>
<g transform="translate(-14 4) scale(1.04)">
<path d="M92 300 L428 246 L428 392 Q428 400 420 400 L100 404 Q92 404 92 396 Z" fill="url(#cwS)"/>
<path d="M92 340 L428 312 L428 330 L92 358 Z" fill="#FF8DC4"/>
<path d="M380 188 L428 246 L428 392 L380 330 Z" fill="url(#cwE)"/>
<path d="M92 300 L380 188 Q392 184 400 194 L428 246 Z" fill="url(#cwF)"/>
<path d="M92 300 L428 246 L428 270 Q418 284 408 270 Q398 262 388 276 Q376 294 364 276 Q352 262 338 280 Q326 296 314 282 Q300 270 288 286 Q276 300 262 290 Q248 282 236 298 Q222 316 210 302 Q196 292 184 308 Q172 322 160 310 Q146 300 132 314 Q118 326 106 314 Q96 308 92 312 Z" fill="url(#cwF)"/>
<path d="M140 286 Q260 236 372 202" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="9" stroke-linecap="round" fill="none"/>
<g fill="url(#cwC)">
<rect x="200" y="240" width="26" height="9" rx="4.5" transform="rotate(-30 213 244)"/>
<rect x="262" y="222" width="26" height="9" rx="4.5" transform="rotate(25 275 226)"/>
<rect x="312" y="214" width="26" height="9" rx="4.5" transform="rotate(-55 325 218)"/>
<rect x="236" y="262" width="26" height="9" rx="4.5" transform="rotate(60 249 266)"/>
<rect x="164" y="268" width="26" height="9" rx="4.5" transform="rotate(10 177 272)"/>
<rect x="330" y="236" width="26" height="9" rx="4.5" transform="rotate(-15 343 240)"/>
</g>
</g>
<g transform="translate(112 86)">
<circle cx="58" cy="58" r="58" fill="#FFFFFF" stroke="#DDD3C6" stroke-width="3"/>
<path d="M46 33 L85 58 L46 83 Z" fill="#FF2D95" stroke="#FF2D95" stroke-width="8" stroke-linejoin="round"/>
</g>
<path d="M410 88 Q414 116 440 120 Q414 124 410 152 Q406 124 380 120 Q406 116 410 88 Z" fill="url(#cwC)" stroke="#8E939B" stroke-width="1.5"/>
</svg>`;
// ICON_SVG_END

// Sprinkle: an original cake-slice mascot with glossy lips, lashes, gold hoops and a rhinestone sparkle.
let artId = 0;
function sprinkleSVG() {
  const u = `s${++artId}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="Sprinkle">
<defs>
<linearGradient id="${u}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF6BB5"/><stop offset="1" stop-color="#FF2D95"/></linearGradient>
<linearGradient id="${u}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF8EE"/><stop offset="1" stop-color="#F3E2C9"/></linearGradient>
<linearGradient id="${u}c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#C9CCD1"/><stop offset="1" stop-color="#8E939B"/></linearGradient>
<linearGradient id="${u}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE28A"/><stop offset="1" stop-color="#C9962B"/></linearGradient>
<clipPath id="${u}b"><path d="M92 24 Q100 12 108 24 L176 156 Q182 172 166 172 L34 172 Q18 172 24 156 Z"/></clipPath>
</defs>
<ellipse cx="100" cy="184" rx="66" ry="8" fill="#000" fill-opacity=".08"/>
<g clip-path="url(#${u}b)">
<rect width="200" height="200" fill="url(#${u}s)"/>
<rect y="146" width="200" height="10" fill="#FF8DC4"/>
<path d="M0 0 H200 V86 Q190 98 180 86 Q170 76 160 90 Q150 104 140 90 Q130 78 120 92 Q110 104 100 90 Q90 78 80 92 Q70 104 60 90 Q50 78 40 90 Q30 102 20 88 Q10 78 0 88 Z" fill="url(#${u}f)"/>
<path d="M82 40 Q92 30 104 32" stroke="#fff" stroke-opacity=".75" stroke-width="5" stroke-linecap="round" fill="none"/>
</g>
<rect x="88" y="52" width="14" height="5" rx="2.5" fill="url(#${u}c)" transform="rotate(-30 95 54)"/>
<rect x="110" y="62" width="14" height="5" rx="2.5" fill="#39FF14" transform="rotate(25 117 64)"/>
<rect x="70" y="70" width="14" height="5" rx="2.5" fill="#39FF14" transform="rotate(50 77 72)"/>
<rect x="122" y="76" width="14" height="5" rx="2.5" fill="url(#${u}c)" transform="rotate(-50 129 78)"/>
<rect x="96" y="74" width="14" height="5" rx="2.5" fill="url(#${u}c)" transform="rotate(10 103 76)"/>
<ellipse cx="80" cy="116" rx="7" ry="9" fill="#2B2420"/><ellipse cx="120" cy="116" rx="7" ry="9" fill="#2B2420"/>
<circle cx="82.5" cy="112.5" r="2.6" fill="#fff"/><circle cx="122.5" cy="112.5" r="2.6" fill="#fff"/>
<g stroke="#2B2420" stroke-width="2.4" stroke-linecap="round" fill="none"><path d="M73 110 L67 105"/><path d="M75 107 L71 101"/><path d="M127 110 L133 105"/><path d="M125 107 L129 101"/></g>
<g fill="#FF2D95" fill-opacity=".28"><ellipse cx="66" cy="130" rx="9" ry="5"/><ellipse cx="134" cy="130" rx="9" ry="5"/></g>
<path d="M90 132 Q95 128 100 131 Q105 128 110 132 Q106 141 100 141 Q94 141 90 132 Z" fill="#E0187A"/>
<path d="M94 135 Q100 138 105 134" stroke="#fff" stroke-opacity=".85" stroke-width="1.8" stroke-linecap="round" fill="none"/>
<g fill="none" stroke="url(#${u}g)" stroke-width="3"><circle cx="42" cy="140" r="7"/><circle cx="158" cy="140" r="7"/></g>
<path d="M150 22 Q152 34 163 36 Q152 38 150 50 Q148 38 137 36 Q148 34 150 22 Z" fill="url(#${u}c)" stroke="#8E939B" stroke-width="1"/>
</svg>`;
}

// ---------- Themes ----------

const THEMES = [
  { id: 'bone', name: 'Bone', bg: '#F4EFE8', panel: '#EAE3D9', text: '#2B2420' },
  { id: 'concrete', name: 'Concrete', bg: '#EEEEEC', panel: '#E2E2DF', text: '#222222' },
  { id: 'babydoll', name: 'Baby Doll', bg: '#FFF1F6', panel: '#FFE1EC', text: '#3A1F2B' },
  { id: 'night', name: 'Night', bg: '#141214', panel: '#262226', text: '#F5F1EE' }
];

function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  document.documentElement.setAttribute('data-theme', theme.id);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.bg);
  try { localStorage.setItem('cw-theme', theme.id); } catch {}
  return theme.id;
}

// ---------- State ----------

let settings = {};
let current = 'home';
let lastCaps = null;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const $ = (sel, root = document) => root.querySelector(sel);
const mascotName = () => (settings.sprinkleName || '').trim() || 'Sprinkle';

function clone(id) {
  return document.getElementById(id).content.firstElementChild.cloneNode(true);
}

function fillSprinkles(root) {
  root.querySelectorAll('[data-slot="sprinkle"]').forEach((el) => { el.innerHTML = sprinkleSVG(); });
}

// ---------- Shared UI: toasts, sheets, sparkles ----------

function sparkleBurst(el) {
  if (reduceMotion()) return;
  for (let i = 0; i < 6; i++) {
    const s = document.createElement('span');
    s.className = `sparkle${i % 3 === 0 ? ' heart' : ''}`;
    s.setAttribute('aria-hidden', 'true');
    s.textContent = i % 3 === 0 ? '♥' : '✦';
    const a = (Math.PI * 2 * i) / 6;
    s.style.left = '20px';
    s.style.top = '10px';
    s.style.setProperty('--dx', `${Math.cos(a) * 34}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * 26}px`);
    el.appendChild(s);
  }
}

function toast(msg, { sparkle = false, ms = 2200 } = {}) {
  const root = $('#toast-root');
  const t = document.createElement('div');
  t.className = 'toast';
  const art = document.createElement('div');
  art.className = 'mascot-xs';
  art.innerHTML = sprinkleSVG();
  const text = document.createElement('span');
  text.textContent = msg;
  t.append(art, text);
  root.appendChild(t);
  if (sparkle) sparkleBurst(t);
  setTimeout(() => t.remove(), ms);
}

// A bottom sheet. Resolves with the chosen action's value, or null if dismissed.
function sheet({ title, text, body, actions = [] }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'sheet-backdrop';
    const box = document.createElement('div');
    box.className = 'sheet';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.innerHTML = '<div class="sheet-grab"></div>';
    const head = document.createElement('div');
    head.className = 'sheet-head';
    const art = document.createElement('div');
    art.className = 'mascot-sm';
    art.innerHTML = sprinkleSVG();
    const hWrap = document.createElement('div');
    const label = document.createElement('p');
    label.className = 'label';
    label.textContent = mascotName();
    const h = document.createElement('h2');
    h.textContent = title || '';
    hWrap.append(label, h);
    head.append(art, hWrap);
    box.appendChild(head);
    if (text) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = text;
      box.appendChild(p);
    }
    if (body) box.appendChild(body);
    const row = document.createElement('div');
    row.className = 'row';
    const close = (value) => { back.remove(); resolve(value); };
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.className = `btn ${a.main ? 'btn-main' : 'btn-ghost'}`;
      b.textContent = a.label;
      b.addEventListener('click', () => close(a.value));
      row.appendChild(b);
    });
    if (actions.length) box.appendChild(row);
    back.addEventListener('click', (e) => { if (e.target === back) close(null); });
    back.appendChild(box);
    $('#sheet-root').appendChild(back);
    // Clicks inside the sheet still reach the global handler (data-go, data-act).
    box.addEventListener('click', (e) => { if (e.target.closest('[data-go],[data-act]')) close(null); });
  });
}

function soon(feature) {
  return sheet({
    title: 'Coming soon',
    text: `${feature} is still in glam. It lands in a later build, and it's going to be good.`,
    actions: [{ label: 'Got it', value: true, main: true }]
  });
}

function emptyState(title, text) {
  const el = clone('tpl-empty');
  fillSprinkles(el);
  $('[data-slot="title"]', el).textContent = title;
  $('[data-slot="text"]', el).textContent = text || '';
  return el;
}

const ui = { sprinkleSVG, toast, sheet, soon, emptyState, mascotName };

// ---------- Screens ----------

const STARTER_CHALLENGES = [
  ['A walk video in flats.', 'Quick, about 15 minutes'],
  ['Open on your final look.', 'Normal'],
  ['An outfit check with 3 angles.', 'Quick, about 15 minutes'],
  ['One pose, wrong vs fixed.', 'Quick, about 15 minutes'],
  ['A portfolio reel of your 9 best photos.', 'Normal'],
  ['Behind the scenes of your next shoot.', 'Big shoot'],
  ['A character reveal (CREATIVE).', 'Normal']
];

function greeting() {
  const h = new Date().getHours();
  const first = (settings.name || '').trim().split(/\s+/)[0];
  const hello = h < 5 ? 'Up late' : h < 12 ? 'Morning' : h < 17 ? 'Hey' : 'Evening';
  return first ? `${hello}, ${first}.` : `${hello}, gorgeous.`;
}

const screens = {
  home(main) {
    const el = clone('tpl-home');
    fillSprinkles(el);
    $('[data-slot="sprinkle-name"]', el).textContent = mascotName();
    $('[data-slot="greeting"]', el).textContent = greeting();
    $('[data-slot="sub"]', el).textContent = 'Ready to serve?';
    const day = Math.floor(Date.now() / 86400000) % STARTER_CHALLENGES.length;
    $('[data-slot="challenge"]', el).textContent = STARTER_CHALLENGES[day][0];
    $('[data-slot="challenge-size"]', el).textContent = STARTER_CHALLENGES[day][1];
    renderWarnings($('[data-slot="warnings"]', el));
    main.appendChild(el);
  },

  async projects(main) {
    const el = clone('tpl-projects');
    const list = $('[data-slot="list"]', el);
    main.appendChild(el);
    const all = await PROJECTS.list().catch(() => []);
    if (!all.length) {
      list.appendChild(emptyState('No projects yet.', 'Tap New video on Home to start your first one.'));
      return;
    }
    all.forEach((p) => {
      const card = document.createElement('button');
      card.className = 'card project';
      const grow = document.createElement('div');
      grow.className = 'grow';
      const h = document.createElement('h3');
      h.textContent = p.name;
      const meta = document.createElement('p');
      meta.className = 'muted small';
      meta.textContent = `${p.lane} · edited ${new Date(p.updatedAt).toLocaleDateString()}`;
      grow.append(h, meta);
      card.appendChild(grow);
      card.addEventListener('click', () => go('editor'));
      list.appendChild(card);
    });
  },

  editor(main) {
    const el = clone('tpl-editor');
    main.appendChild(el);
    EDITOR.render($('[data-slot="body"]', el), ui);
  },

  export(main) {
    EXPORT.render(main, ui);
  },

  async settings(main) {
    const el = clone('tpl-settings');
    fillSprinkles(el);
    el.querySelectorAll('input[data-key]').forEach((input) => {
      input.value = settings[input.dataset.key] || '';
      input.addEventListener('input', () => queueSetting(input.dataset.key, input.value));
      input.addEventListener('change', () => flushSettings());
    });
    const themes = $('[data-slot="themes"]', el);
    THEMES.forEach((t) => {
      const b = document.createElement('button');
      b.className = 'theme';
      b.style.background = t.bg;
      b.style.color = t.text;
      b.style.borderColor = (settings.theme || 'bone') === t.id ? '' : t.panel;
      b.setAttribute('aria-pressed', String((settings.theme || 'bone') === t.id));
      b.innerHTML = `<span class="swatches"><i style="background:${t.panel}"></i><i style="background:#FF2D95"></i><i style="background:#C9CCD1"></i></span><b></b>`;
      b.querySelector('b').textContent = t.name;
      b.addEventListener('click', async () => {
        settings.theme = applyTheme(t.id);   // live preview: the whole app changes instantly
        await STORAGE.saveSetting('theme', settings.theme);
        themes.querySelectorAll('.theme').forEach((x, i) => {
          const on = THEMES[i].id === t.id;
          x.setAttribute('aria-pressed', String(on));
          x.style.borderColor = on ? '' : THEMES[i].panel;
        });
        toast(`${t.name}. Obviously.`, { sparkle: true, ms: 1400 });
      });
      themes.appendChild(b);
    });
    $('[data-slot="version"]', el).textContent = CONFIG.APP_VERSION;
    main.appendChild(el);
    const persisted = await STORAGE.isPersisted();
    $('[data-slot="persist"]', el).textContent = persisted ? 'On' : 'Off';
    $('[data-slot="persist-note"]', el).textContent = persisted
      ? 'iOS has agreed to keep your projects safe from automatic cleanup.'
      : isStandalone()
        ? 'iOS decides this on its own. Using Cake Walk often from its icon helps.'
        : 'Turns on only in the Home Screen app. Open Cake Walk from its icon.';
  },

  async debug(main) {
    const el = clone('tpl-debug');
    main.appendChild(el);
    $('[data-slot="version"]', el).textContent = CONFIG.APP_VERSION;
    $('[data-slot="mode"]', el).textContent = DEBUG.displayMode();
    const est = await STORAGE.estimate();
    $('[data-slot="used"]', el).textContent = est ? DEBUG.bytes(est.usage) : 'Unknown';
    $('[data-slot="free"]', el).textContent = est ? `about ${DEBUG.bytes(Math.max(0, est.quota - est.usage))}` : 'Unknown';
    $('[data-slot="persist"]', el).textContent = (await STORAGE.isPersisted()) ? 'On' : 'Off';
    await renderCaps(el);
    await renderLog(el);
  },

  icons(main) {
    const el = clone('tpl-icons');
    $('[data-slot="preview"]', el).innerHTML = ICON_SVG;
    main.appendChild(el);
  }
};

async function renderCaps(root) {
  const caps = lastCaps || (await DEBUG.getCaps());
  const mb = caps?.results?.mediabunny;
  $('[data-slot="mb"]', root).textContent = mb ? (mb.ok ? `${CONFIG.MEDIABUNNY_VERSION} loaded` : 'Not loaded') : 'Checking';
  $('[data-slot="checked"]', root).textContent = caps?.at ? new Date(caps.at).toLocaleString() : 'Checking now';
  const box = $('[data-slot="caps"]', root);
  box.innerHTML = '';
  for (const [key, r] of Object.entries(caps?.results || {})) {
    const row = document.createElement('div');
    row.className = 'cap';
    const pill = document.createElement('span');
    pill.className = `pill ${r.ok ? 'pill-green' : r.optional ? 'pill-chrome' : 'pill-error'}`;
    pill.textContent = r.ok ? 'Pass' : r.optional ? 'Note' : 'Fail';
    const grow = document.createElement('div');
    grow.className = 'grow';
    const name = document.createElement('div');
    name.textContent = DEBUG.label(key);
    const detail = document.createElement('div');
    detail.className = 'muted small';
    detail.textContent = r.detail || '';
    grow.append(name, detail);
    row.append(pill, grow);
    box.appendChild(row);
  }
}

async function renderLog(root) {
  const box = $('[data-slot="log"]', root);
  box.innerHTML = '';
  const entries = await DEBUG.entries();
  if (!entries.length) { box.textContent = 'No entries yet.'; return; }
  entries.slice(0, 100).forEach((e) => {
    const d = document.createElement('div');
    if (e.level === 'error') d.className = 'err';
    d.textContent = `${new Date(e.t).toLocaleString()} [${e.level}] v${e.v} ${e.msg}${e.where ? ` (${e.where})` : ''}`;
    box.appendChild(d);
  });
}

function renderWarnings(box) {
  if (!box) return;
  box.innerHTML = '';
  DEBUG.problems(lastCaps).forEach((msg) => {
    const card = clone('tpl-capwarn');
    $('[data-slot="text"]', card).textContent = msg;
    box.appendChild(card);
  });
}

async function go(name) {
  if (!screens[name]) name = 'home';
  current = name;
  const main = $('#screen');
  main.innerHTML = '';
  main.scrollTop = 0;
  document.querySelectorAll('.tab').forEach((t) => {
    if (t.dataset.go === name) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  try {
    await screens[name](main);
  } catch (err) {
    DEBUG.log('error', err.message, `screen ${name}`);
    main.appendChild(emptyState('Something slipped.', 'This screen hit a snag. Debug has the details for Claude.'));
  }
}

// ---------- Settings saving (debounced; stays on the phone) ----------

const pendingSettings = {};
let settingsTimer = null;
let lastSavedToast = 0;

function queueSetting(key, value) {
  settings[key] = value;
  pendingSettings[key] = value;
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(flushSettings, 600);
}

async function flushSettings() {
  clearTimeout(settingsTimer);
  const entries = Object.entries(pendingSettings);
  if (!entries.length) return;
  for (const [k] of entries) delete pendingSettings[k];
  try {
    for (const [k, v] of entries) await STORAGE.saveSetting(k, v);
    if (Date.now() - lastSavedToast > 4000) {
      lastSavedToast = Date.now();
      toast('Saved. Obviously.', { sparkle: true, ms: 1600 });
    }
  } catch (err) {
    DEBUG.log('error', `Settings save failed: ${err.name}`, 'settings');
    toast('That didn\'t save. Try again.');
  }
}

async function saveOpenWork() {
  await flushSettings();
  await EDITOR.saveOpenWork();
}

// ---------- Icon Generator (works in plain Chrome before install) ----------

const ICON_SIZES = [['icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]];
let iconFiles = [];

async function makeIcons() {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ICON_SVG)}`;
  await img.decode();
  iconFiles = [];
  for (const [name, size] of ICON_SIZES) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG failed'))), 'image/png'));
    iconFiles.push(new File([blob], name, { type: 'image/png' }));
  }
  const main = $('#screen');
  const thumbs = $('[data-slot="thumbs"]', main);
  const links = $('[data-slot="links"]', main);
  thumbs.innerHTML = '';
  links.innerHTML = '';
  iconFiles.forEach((f) => {
    const url = URL.createObjectURL(f);
    const fig = document.createElement('figure');
    const im = document.createElement('img');
    im.src = url;
    im.alt = f.name;
    const cap = document.createElement('figcaption');
    cap.textContent = f.name;
    fig.append(im, cap);
    thumbs.appendChild(fig);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    a.className = 'btn-text';
    a.textContent = `Download ${f.name} (if Save to Files doesn't show up)`;
    links.appendChild(a);
  });
  $('[data-act="save-icons"]', main)?.classList.remove('hidden');
  toast('Icons made. Cute, right?', { sparkle: true });
}

async function saveIcons() {
  if (!iconFiles.length) return;
  // Files are ready before the tap, so the share sheet opens inside the same tap.
  if (navigator.canShare && navigator.canShare({ files: iconFiles })) {
    try {
      await navigator.share({ files: iconFiles });
    } catch (err) {
      if (err.name !== 'AbortError') {
        DEBUG.log('warn', `Icon share failed: ${err.name}`, 'icons');
        toast('Share didn\'t open. Use the Download links below.');
      }
    }
  } else {
    toast('Use the Download links below.');
  }
}

// ---------- Install banner ----------

function renderInstallBanner() {
  const slot = $('#top-slot');
  slot.innerHTML = '';
  if (isStandalone()) return;
  try { if (sessionStorage.getItem('cw-hide-install')) return; } catch {}
  const el = clone('tpl-install');
  fillSprinkles(el);
  // Chrome on iPhone says "CriOS". In Safari, open the Safari steps first.
  if (!/CriOS/.test(navigator.userAgent)) $('[data-slot="safari"]', el).open = true;
  slot.appendChild(el);
}

// ---------- Global taps ----------

function bindGlobal() {
  document.addEventListener('click', async (e) => {
    const goEl = e.target.closest('[data-go]');
    if (goEl) { go(goEl.dataset.go); return; }
    const actEl = e.target.closest('[data-act]');
    if (!actEl) return;
    const act = actEl.dataset.act;
    if (act === 'soon') soon(actEl.dataset.feature || 'This');
    else if (act === 'new-video') go('editor');
    else if (act === 'more') sheet({ title: 'More tools', body: clone('tpl-more') });
    else if (act === 'icons') go('icons');
    else if (act === 'hide-install') {
      try { sessionStorage.setItem('cw-hide-install', '1'); } catch {}
      $('#top-slot').innerHTML = '';
    } else if (act === 'make-icons') {
      makeIcons().catch((err) => { DEBUG.log('error', `Icon maker: ${err.message}`, 'icons'); toast('The icon maker hit a snag. Check Debug.'); });
    } else if (act === 'save-icons') saveIcons();
    else if (act === 'copy-log') {
      try {
        const text = await DEBUG.report(Object.entries(settings).filter(([k]) => k !== 'theme').map(([, v]) => v));
        await navigator.clipboard.writeText(text);
        toast('Copied. Send it to Claude.', { sparkle: true });
      } catch (err) {
        toast('Copy didn\'t work. Try again.');
        DEBUG.log('warn', `Copy failed: ${err.name}`, 'debug');
      }
    } else if (act === 'recheck') {
      toast('Checking everything...');
      lastCaps = await DEBUG.runChecks();
      if (current === 'debug') go('debug');
    } else if (act === 'clear-log') {
      const yes = await sheet({ title: 'Clear the log?', text: 'This removes every log entry.', actions: [{ label: 'Keep', value: false }, { label: 'Clear', value: true, main: true }] });
      if (yes) { await DEBUG.clear(); go('debug'); }
    }
  });

  // Save on the way out (a bonus; Prompt 5 adds autosave as the real safety net).
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveOpenWork(); });
  window.addEventListener('pagehide', () => { saveOpenWork(); });
}

// ---------- Updates (service worker) ----------

async function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    DEBUG.log('warn', 'Service workers are not available, so offline mode is off.');
    return;
  }
  let accepted = false;
  let offered = null;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (accepted) { accepted = false; location.reload(); }   // reload once, only after a yes
  });
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    const offer = async (waiting) => {
      // No offer on the very first install (nothing to update from), and only once per waiting version.
      if (!waiting || !navigator.serviceWorker.controller || offered === waiting) return;
      offered = waiting;
      await saveOpenWork();
      const yes = await sheet({
        title: 'New version ready. Update now?',
        text: 'Your work is saved.',
        actions: [{ label: 'Later', value: false }, { label: 'Update now', value: true, main: true }]
      });
      if (yes) {
        accepted = true;
        waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        offered = null; // ask again next launch
      }
    };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => { if (nw.state === 'installed') offer(nw); });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  } catch (err) {
    DEBUG.log('error', `Service worker: ${err.message}`, 'sw');
  }
}

// ---------- Startup ----------

async function start() {
  const t0 = performance.now();
  try {
    await STORAGE.openDB();
  } catch (err) {
    $('#screen').appendChild(emptyState('Storage is blocked.', 'Cake Walk can\'t open its storage. Update iOS, then open Cake Walk again from its icon.'));
    DEBUG.log('error', `IndexedDB: ${err.message}`, 'start');
    return;
  }
  await DEBUG.ready();
  settings = await STORAGE.loadSettings().catch(() => ({}));
  if (settings.theme) applyTheme(settings.theme);

  WORKER.start();
  WORKER.onEvent((msg) => { if (msg.type === 'worker-error') DEBUG.log('error', msg.message, 'worker'); });

  bindGlobal();
  renderInstallBanner();
  lastCaps = await DEBUG.getCaps();
  await go('home');
  DEBUG.log('info', `Launched v${CONFIG.APP_VERSION} as ${DEBUG.displayMode()} in ${Math.round(performance.now() - t0)} ms`);

  setupServiceWorker();

  // Ask iOS to protect storage once, from the Home Screen app only.
  if (isStandalone()) {
    const asked = await STORAGE.get('meta', 'persistAsked');
    if (!asked) {
      const ok = await STORAGE.persist();
      await STORAGE.put('meta', true, 'persistAsked');
      DEBUG.log('info', `Protected storage request: ${ok ? 'granted' : 'not granted'}`);
    }
  }

  // Capability checks run on every launch, in the background.
  lastCaps = await DEBUG.runChecks();
  if (current === 'home') renderWarnings($('[data-slot="warnings"]'));
  if (current === 'debug') go('debug');
}

start();
