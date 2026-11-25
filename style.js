// Cake Walk: STYLE (Prompt 6): the docked tool panel for Text, Color, Transitions, Reframe, Stickers,
// Safe zones and Dual cut. The panel docks under the preview so you see every change as you make it.
// Drawing is done by look.js (shared with the export); this file is only the controls and touch gestures.

import {
  laneOf, RATIOS, TEXT_STYLES, FONTS, TEXT_COLORS, TRANSITIONS, TRANSITION_SECONDS, GRADES, STICKERS,
  SAFE_ZONES, safeBox, TEXT_DEFAULT, wordCount, textBox, drawSticker, frameFor, convertLane, activeAt
} from './look.js';
import { PROJECTS } from './storage.js';
import { DEBUG } from './debug.js';

const $ = (sel, root = document) => root.querySelector(sel);
const uid = () => crypto.randomUUID();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtS = (s) => `${(s || 0).toFixed(1)}s`;

const TITLES = { text: 'Text', color: 'Color', transition: 'Transitions', reframe: 'Reframe', stickers: 'Stickers', guides: 'Safe zones' };
export const STYLE_PANELS = Object.keys(TITLES);

let api = null;            // from editor.js
let mode = null;           // the open panel
let sel = null;            // { kind: 'text' | 'sticker', id }
const view = { safe: false, safePlatform: null, grid: false };
let gesture = null;

// ---------- Small building blocks ----------

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function chips(values, current, label, onPick, title) {
  const wrap = el('div', 'chips');
  if (title) wrap.setAttribute('aria-label', title);
  values.forEach((v) => {
    const b = el('button', `chip${v === current ? ' on' : ''}`, label(v));
    b.type = 'button';
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      onPick(v);
    });
    wrap.appendChild(b);
  });
  return wrap;
}

function slider(label, min, max, step, value, fmtV, onInput) {
  const wrap = el('label', 'field slider');
  wrap.innerHTML = '<span></span><input type="range"><b></b>';
  $('span', wrap).textContent = label;
  const input = $('input', wrap);
  Object.assign(input, { min, max, step, value });
  const out = $('b', wrap);
  out.textContent = fmtV(value);
  let first = true;
  input.addEventListener('input', () => {
    if (first) { api.remember(); first = false; }
    out.textContent = fmtV(+input.value);
    onInput(+input.value);
  });
  input.addEventListener('change', () => { first = true; });
  return wrap;
}

function toggle(label, on, onChange) {
  const wrap = el('label', 'switch');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = !!on;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.append(input, el('span', null, label));
  return wrap;
}

function button(label, cls, fn) {
  const b = el('button', cls || 'btn btn-ghost btn-sm', label);
  b.type = 'button';
  b.addEventListener('click', fn);
  return b;
}

function row(...kids) { const r = el('div', 'dock-row'); r.append(...kids.filter(Boolean)); return r; }
function note(text, warn) { return el('p', `note${warn ? ' warn-note' : ''}`, text); }
function head(text) { return el('p', 'label dock-label', text); }

const lane = () => api.project().lane;
const L = () => laneOf(lane());
const pct = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`;

function redraw() { api.draw(); }
function edited() { api.touch(); }

// ---------- Panel shell ----------

function dock() { return api.root() && $('[data-slot="dock"]', api.root()); }

function render() {
  const d = dock();
  if (!d) return;
  $('[data-slot="dock-title"]', d).textContent = TITLES[mode];
  const body = $('[data-slot="dock-body"]', d);
  const scroll = body.scrollTop;
  body.innerHTML = '';
  const fn = { text: textPanel, color: colorPanel, transition: transitionPanel, reframe: reframePanel, stickers: stickerPanel, guides: guidesPanel }[mode];
  fn(body);
  body.scrollTop = scroll;
}

export const STYLE = {
  attach(a) { api = a; mode = null; sel = null; gesture = null; view.safe = false; view.grid = false; view.safePlatform = null; },

  get open() { return mode; },

  // pick: { text: id } opens the text panel with that text selected (the hook check's Add hook text).
  show(name, pick) {
    if (!api || !TITLES[name]) return;
    if (api.safe()) { api.ui.toast('Styles and text are off while this project opens in safe mode.'); return; }
    if (!api.project().clips.length) { api.ui.toast('Add a clip first.'); return; }
    mode = name;
    if (name !== 'text' && sel?.kind === 'text') sel = null;
    if (name !== 'stickers' && sel?.kind === 'sticker') sel = null;
    if (name === 'guides') view.safe = true;
    if (name === 'text' && pick?.text) sel = { kind: 'text', id: pick.text };
    // Show the clip being styled: move the playhead into the selected clip if it's elsewhere.
    if (['color', 'transition', 'reframe'].includes(name)) api.showSelected();
    const d = dock();
    d.classList.remove('hidden');
    api.root().querySelector('.ed-work').classList.add('docked');
    bindStage();
    render();
    api.setPanel(name);
    api.refit();
  },

  close() {
    if (!mode) return;
    mode = null;
    sel = null;
    view.grid = false;
    const d = dock();
    if (d) d.classList.add('hidden');
    api?.root()?.querySelector('.ed-work')?.classList.remove('docked');
    api?.setPanel(null);
    api?.refit();
  },

  // After undo, redo or a seek: the panel shows the current values.
  refresh() {
    if (!mode) return;
    const p = api.project();
    if (sel?.kind === 'text' && !p.texts.some((x) => x.id === sel.id)) sel = null;
    if (sel?.kind === 'sticker' && !p.stickers.some((x) => x.id === sel.id)) sel = null;
    render();
  },

  // What the preview should show (read by player.js every frame).
  view(safeMode) {
    const p = api?.project();
    return {
      ratio: p?.viewRatio && RATIOS[p.viewRatio] ? p.viewRatio : '9:16',
      safe: view.safe && (!p?.viewRatio || p.viewRatio === '9:16'),
      platform: view.safePlatform,
      grid: view.grid && mode === 'reframe',
      effects: !safeMode,
      decorate: mode ? decorate : null
    };
  }
};

// The clip a panel works on: the selected clip, otherwise the clip under the playhead.
function clip() { return api.clip(); }

function safePlatformKey() {
  const p = api.project();
  const k = view.safePlatform || p.platform;
  return SAFE_ZONES[k] ? k : 'tiktok';
}

// ---------- Text ----------

function newText() {
  const p = api.project();
  const T = api.time();
  const total = api.total();
  const box = safeBox(safePlatformKey());
  api.remember();
  const item = { id: uid(), ...TEXT_DEFAULT, color: 'white', y: clamp(TEXT_DEFAULT.y, box.top, box.bottom), start: Math.min(T, Math.max(0, total - 0.5)), end: Math.min(total, T + 3) };
  if (item.end - item.start < 0.5) { item.start = 0; item.end = total; }
  p.texts.push(item);
  sel = { kind: 'text', id: item.id };
  edited();
  render();
}

function selText() { return sel?.kind === 'text' ? api.project().texts.find((x) => x.id === sel.id) : null; }

function measureCtx() {
  const c = api.canvas();
  return c ? c.getContext('2d') : null;
}

// Keep a text inside the safe zone and inside the frame.
function keepInside(item) {
  const c = api.canvas();
  if (!c) return;
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const b = textBox(ctx, item, W, H);
  const hw = (b.w / 2 + b.pad) / W, hh = (b.h / 2 + b.pad * 0.5) / H;
  const box = api.project().viewRatio && api.project().viewRatio !== '9:16' ? { left: 0.04, right: 0.96, top: 0.04, bottom: 0.96 } : safeBox(safePlatformKey());
  item.x = clamp(item.x, Math.min(0.5, box.left + hw), Math.max(0.5, box.right - hw));
  item.y = clamp(item.y, Math.min(0.5, box.top + hh), Math.max(0.5, box.bottom - hh));
}

function timing(item, total) {
  const wrap = el('div', 'dock-time');
  const label = el('p', 'small muted', `Shows from ${fmtS(item.start)} to ${fmtS(item.end)}`);
  wrap.append(label, row(
    button('Start here', null, () => { api.remember(); item.start = clamp(api.time(), 0, item.end - 0.2); label.textContent = `Shows from ${fmtS(item.start)} to ${fmtS(item.end)}`; edited(); }),
    button('End here', null, () => { api.remember(); item.end = clamp(api.time(), item.start + 0.2, total); label.textContent = `Shows from ${fmtS(item.start)} to ${fmtS(item.end)}`; edited(); }),
    button('Whole video', null, () => { api.remember(); item.start = 0; item.end = total; label.textContent = `Shows from ${fmtS(item.start)} to ${fmtS(item.end)}`; edited(); })
  ));
  return wrap;
}

function textPanel(body) {
  const p = api.project();
  const item = selText();
  if (!item) {
    body.appendChild(row(button('Add text', 'btn btn-main btn-sm', newText), safeToggle()));
    if (p.texts.length) {
      body.appendChild(head('Your text'));
      p.texts.forEach((tx) => {
        const b = button(`"${tx.text}" · ${fmtS(tx.start)} to ${fmtS(tx.end)}`, 'list-btn', () => { sel = { kind: 'text', id: tx.id }; api.seek(tx.start + 0.01); render(); });
        body.appendChild(b);
      });
    } else {
      body.appendChild(note('Keep it to one line of about 7 words. Drag it on the preview to move it; it stays inside the safe zone.'));
    }
    if (lane() === 'PRO') body.appendChild(note('PRO projects use the Clean Pro style in white or black.'));
    return;
  }
  const input = el('input', 'dock-input');
  input.value = item.text;
  input.setAttribute('aria-label', 'Text');
  input.autocapitalize = 'sentences';
  const count = el('p', 'small muted');
  const showCount = () => {
    const n = wordCount(item.text);
    count.textContent = n > 7 ? `${n} words. Short reads best: about 7 words on one line.` : `${n} of about 7 words`;
    count.classList.toggle('warn-note', n > 7);
  };
  showCount();
  let first = true;
  input.addEventListener('input', () => {
    if (first) { api.remember(); first = false; }
    item.text = input.value.replace(/\n/g, ' ');
    keepInside(item);
    showCount();
    edited();
  });
  body.append(input, count);
  if (L().textStyles.length > 1) body.appendChild(chips(L().textStyles, item.style, (k) => TEXT_STYLES[k], (k) => { api.remember(); item.style = k; keepInside(item); edited(); }, 'Text style'));
  body.appendChild(chips(L().textColors, L().textColors.includes(item.color) ? item.color : 'white', (k) => TEXT_COLORS[k].label, (k) => { api.remember(); item.color = k; edited(); }, 'Text color'));
  body.appendChild(chips(L().fonts, L().fonts.includes(item.font) ? item.font : 'sans', (k) => FONTS[k].label, (k) => { api.remember(); item.font = k; keepInside(item); edited(); }, 'Font'));
  body.appendChild(slider('Size', 0.03, 0.09, 0.005, item.size, (v) => `${Math.round(v * 1000) / 10}`, (v) => { item.size = v; keepInside(item); edited(); }));
  body.appendChild(row(
    toggle('Outline', item.outline, (on) => { api.remember(); item.outline = on; edited(); }),
    toggle('Shadow', item.shadow, (on) => { api.remember(); item.shadow = on; edited(); })
  ));
  body.appendChild(row(
    button('Top', null, () => { api.remember(); item.y = 0; keepInside(item); edited(); }),
    button('Middle', null, () => { api.remember(); item.x = 0.5; item.y = 0.5; keepInside(item); edited(); }),
    button('Bottom', null, () => { api.remember(); item.y = 1; keepInside(item); edited(); }),
    safeToggle()
  ));
  body.appendChild(timing(item, api.total()));
  body.appendChild(row(
    button('Delete text', 'btn btn-ghost btn-sm danger', () => { api.remember(); p.texts = p.texts.filter((x) => x.id !== item.id); sel = null; edited(); render(); }),
    button('All text', null, () => { sel = null; render(); redraw(); })
  ));
}

function safeToggle() {
  return toggle('Safe zones', view.safe, (on) => { view.safe = on; redraw(); });
}

// ---------- Color ----------

function colorPanel(body) {
  const p = api.project();
  const c = clip();
  const ranges = L().color;
  if (lane() === 'CREATIVE') {
    body.appendChild(head('Look (whole video)'));
    body.appendChild(chips(L().grades, p.grade || 'natural', (k) => GRADES[k].label, (k) => { api.remember(); p.grade = k; edited(); }, 'Look'));
  } else {
    body.appendChild(note('PRO keeps natural color: true skin tones, neutral white balance, soft contrast and low saturation.'));
  }
  if (!c) { body.appendChild(note('Tap a clip to adjust its color.')); return; }
  body.appendChild(head('This clip'));
  c.color ||= { brightness: 0, contrast: 0, saturation: 0, warmth: 0 };
  const labels = { brightness: 'Brightness', contrast: 'Contrast', saturation: 'Saturation', warmth: 'Warmth' };
  for (const k of Object.keys(labels)) {
    const [lo, hi] = ranges[k];
    c.color[k] = clamp(+c.color[k] || 0, lo, hi);
    body.appendChild(slider(labels[k], lo, hi, 0.01, c.color[k], pct, (v) => { c.color[k] = v; edited(); }));
  }
  body.appendChild(row(
    button('Same for all clips', null, () => { api.remember(); p.clips.forEach((x) => { x.color = { ...c.color }; }); edited(); api.ui.toast('Color copied to every clip.'); }),
    button('Reset', null, () => { api.remember(); delete c.color; edited(); render(); })
  ));
}

// ---------- Transitions ----------

function transitionPanel(body) {
  const p = api.project();
  const c = clip();
  const i = c ? p.clips.indexOf(c) : -1;
  if (!c) { body.appendChild(note('Tap a clip to pick how it starts.')); return; }
  if (i === 0) { body.appendChild(note('Transitions go between clips. Tap the second clip or later to pick how it comes in.')); return; }
  const kind = L().transitions.includes(c.transition?.kind) ? c.transition.kind : 'cut';
  body.appendChild(note(`Into clip ${i + 1}. Each transition takes ${TRANSITION_SECONDS}s at the start of the clip.`));
  body.appendChild(chips(L().transitions, kind, (k) => TRANSITIONS[k], (k) => {
    api.remember();
    if (k === 'cut') delete c.transition; else c.transition = { kind: k, dur: TRANSITION_SECONDS };
    edited();
    preview(c);
  }, 'Transition'));
  if (lane() === 'PRO') body.appendChild(note('Sparkle wipe and Heart wipe are for CREATIVE projects.'));
  body.appendChild(row(
    button('Preview it', null, () => preview(c)),
    button('Same for all', null, () => {
      api.remember();
      p.clips.forEach((x, j) => { if (j > 0) { if (c.transition) x.transition = { ...c.transition }; else delete x.transition; } });
      edited();
      api.ui.toast('Every cut now uses this transition.');
    })
  ));
}

// Play from just before the cut so you see the transition.
function preview(c) {
  const seg = api.segOf(c);
  if (!seg) return;
  api.seek(Math.max(0, seg.start - 0.8));
  api.play();
}

// ---------- Reframe ----------

function reframePanel(body) {
  const p = api.project();
  const c = clip();
  const ratio = p.viewRatio && RATIOS[p.viewRatio] ? p.viewRatio : '9:16';
  body.appendChild(chips(Object.keys(RATIOS), ratio, (k) => k, (k) => { p.viewRatio = k; api.save(); api.refit(); render(); }, 'Shape'));
  if (!c) { body.appendChild(note('Tap a clip to frame it.')); return; }
  const own = !!c.frame?.[ratio];
  const f = frameFor(c, ratio);
  body.appendChild(chips(['fill', 'fit', 'blur'], f.mode, (k) => ({ fill: 'Fill', fit: 'Fit', blur: 'Blurred background' }[k]), (k) => {
    api.remember();
    setFrame(c, ratio, { ...frameFor(c, ratio), mode: k });
    edited();
  }, 'Framing'));
  body.appendChild(note(own || ratio === '9:16'
    ? 'Pinch to zoom and drag to move, right on the preview.'
    : `Using your 9:16 framing. Pinch or drag to give ${ratio} its own.`));
  body.appendChild(row(
    toggle('Grid', view.grid, (on) => { view.grid = on; redraw(); }),
    button('Reset', null, () => { api.remember(); if (c.frame) delete c.frame[ratio]; edited(); render(); }),
    button('Same for all clips', null, () => {
      api.remember();
      const now = frameFor(c, ratio);
      p.clips.forEach((x) => { if (x !== c) setFrame(x, ratio, { ...now }); });
      edited();
      api.ui.toast(`Every clip uses this ${ratio} framing.`);
    })
  ));
  // Prompt 8: a slow push-in (8% over the clip), the same in the preview and the export.
  body.appendChild(row(toggle('Slow push-in', c.move === 'pushin', (on) => {
    api.remember();
    if (on) c.move = 'pushin'; else delete c.move;
    edited();
  })));
  body.appendChild(note('Each shape keeps its own framing, and the export uses the framing for its shape.'));
}

function setFrame(c, ratio, f) {
  c.frame ||= {};
  c.frame[ratio] = { mode: f.mode || 'fill', zoom: clamp(f.zoom || 1, 1, 4), x: clamp(f.x || 0, -1, 1), y: clamp(f.y || 0, -1, 1) };
}

// ---------- Stickers (CREATIVE only) ----------

function selSticker() { return sel?.kind === 'sticker' ? api.project().stickers.find((x) => x.id === sel.id) : null; }

function stickerPanel(body) {
  const p = api.project();
  if (!L().stickers) {
    body.appendChild(note('Stickers are for CREATIVE projects. Use Dual cut in More to make a CREATIVE version of this video.'));
    return;
  }
  const s = selSticker();
  if (s) {
    body.appendChild(slider('Size', 0.06, 0.4, 0.01, s.size, (v) => `${Math.round(v * 100)}`, (v) => { s.size = v; edited(); }));
    body.appendChild(slider('Turn', -3.14, 3.14, 0.05, s.rot || 0, (v) => `${Math.round((v * 180) / Math.PI)}°`, (v) => { s.rot = v; edited(); }));
    body.appendChild(timing(s, api.total()));
    body.appendChild(row(
      button('Delete sticker', 'btn btn-ghost btn-sm danger', () => { api.remember(); p.stickers = p.stickers.filter((x) => x.id !== s.id); sel = null; edited(); render(); }),
      button('Add another', null, () => { sel = null; render(); redraw(); }),
      safeToggle()
    ));
    return;
  }
  const grid = el('div', 'sticker-grid');
  for (const [kind, label] of Object.entries(STICKERS)) {
    const b = el('button', 'sticker-btn');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    const cv = el('canvas');
    cv.width = 112; cv.height = 112;
    drawSticker(cv.getContext('2d'), { kind, x: 0.5, y: 0.5, size: 0.8 }, 112, 112);
    b.appendChild(cv);
    b.addEventListener('click', () => {
      const T = api.time(), total = api.total();
      api.remember();
      const st = { id: uid(), kind, x: 0.5, y: 0.45, size: 0.16, rot: 0, start: Math.min(T, Math.max(0, total - 0.5)), end: Math.min(total, T + 3) };
      if (st.end - st.start < 0.5) { st.start = 0; st.end = total; }
      p.stickers.push(st);
      sel = { kind: 'sticker', id: st.id };
      edited();
      render();
    });
    grid.appendChild(b);
  }
  body.appendChild(grid);
  body.appendChild(note('Tap one to add it at the playhead. Drag it on the preview, and pinch to resize.'));
}

// ---------- Safe zones ----------

function guidesPanel(body) {
  const p = api.project();
  body.appendChild(toggle('Show safe zones on the preview', view.safe, (on) => { view.safe = on; redraw(); }));
  const keys = ['tiktok', 'reels', 'story', 'shorts'];
  body.appendChild(chips(keys, safePlatformKey(), (k) => SAFE_ZONES[k].label, (k) => { view.safePlatform = k; view.safe = true; redraw(); render(); }, 'App'));
  body.appendChild(note('Pink areas are where the app\'s buttons, captions and bars cover your video. Keep faces and text out of them.'));
  if (p.viewRatio && p.viewRatio !== '9:16') body.appendChild(note('Safe zones show on the 9:16 shape. Switch to 9:16 in Reframe to see them.', true));
}

// ---------- Dual cut ----------

export async function dualCut(ui, project, onOpen) {
  const other = project.lane === 'PRO' ? 'CREATIVE' : 'PRO';
  const ok = await ui.sheet({
    title: 'Dual cut',
    text: `Make a ${other} version with the same clips and timeline? It's a new project, "${project.name} (${other})". ${other === 'PRO' ? 'Looks, text styles, colors and transitions that PRO doesn\'t allow are swapped for natural ones, and stickers are left out.' : 'Everything carries over, and you can add CREATIVE looks, styles and stickers.'}`,
    actions: [{ label: 'Cancel', value: false }, { label: `Make ${other} version`, value: true, main: true }]
  });
  if (!ok) return null;
  const twin = convertLane(project, other);
  const now = Date.now();
  Object.assign(twin, { id: uid(), name: `${project.name} (${other})`, createdAt: now, updatedAt: now, openedAt: now, exportPicks: null, playhead: 0, twinOf: project.id });
  delete twin.restoredAt;
  await PROJECTS.save(twin);
  DEBUG.log('info', `Dual cut: made a ${other} version`, 'style');
  const open = await ui.sheet({ title: `${other} version ready`, text: 'Both versions use the same clips, so it takes almost no extra space.', actions: [{ label: 'Stay here', value: false }, { label: 'Open it', value: true, main: true }] });
  if (open) onOpen(twin.id);
  return twin;
}

// ---------- Touch on the preview: move text and stickers, pinch and drag to reframe ----------

function point(e) {
  const c = api.canvas();
  const r = c.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
}

function hitOverlay(pt) {
  const p = api.project();
  const c = api.canvas();
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const T = api.time();
  if (mode === 'stickers' && L().stickers) {
    for (const s of activeAt(p.stickers, T).reverse()) {
      const r = (s.size || 0.14) * H * 0.55;
      if (Math.hypot(pt.x * W - s.x * W, pt.y * H - s.y * H) < r + 12) return { kind: 'sticker', id: s.id };
    }
  }
  if (mode === 'text') {
    for (const tx of activeAt(p.texts, T).reverse()) {
      const b = textBox(ctx, tx, W, H);
      if (Math.abs(pt.x * W - b.cx) < b.w / 2 + b.pad + 14 && Math.abs(pt.y * H - b.cy) < b.h / 2 + b.pad + 14) return { kind: 'text', id: tx.id };
    }
  }
  return null;
}

let bound = null;
function bindStage() {
  const c = api.canvas();
  if (!c || bound === c) return;
  bound = c;
  c.style.touchAction = 'none';
  const pts = new Map();
  c.addEventListener('pointerdown', (e) => {
    if (!mode || !['text', 'stickers', 'reframe'].includes(mode)) return;
    c.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, point(e));
    api.pause();
    if (pts.size === 1) {
      const pt = point(e);
      if (mode === 'reframe') {
        const cl = clip();
        if (!cl) return;
        const ratio = api.view().ratio;
        api.remember();
        gesture = { type: 'frame', clip: cl, ratio, start: pt, f0: { ...frameFor(cl, ratio) } };
        return;
      }
      const hit = hitOverlay(pt);
      if (!hit) { if (sel) { sel = null; render(); redraw(); } gesture = null; return; }
      if (!sel || sel.id !== hit.id) { sel = hit; render(); }
      const item = hit.kind === 'text' ? selText() : selSticker();
      api.remember();
      gesture = { type: 'move', item, start: pt, x0: item.x, y0: item.y, size0: item.size };
    } else if (pts.size === 2 && gesture) {
      const [a, b] = [...pts.values()];
      gesture.pinch0 = Math.hypot(a.x - b.x, a.y - b.y) || 0.01;
      if (gesture.type === 'frame') gesture.z0 = frameFor(gesture.clip, gesture.ratio).zoom;
      else gesture.size0 = gesture.item.size;
    }
  });
  c.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !gesture) return;
    pts.set(e.pointerId, point(e));
    const pt = point(e);
    if (pts.size >= 2 && gesture.pinch0) {
      const [a, b] = [...pts.values()];
      const k = Math.hypot(a.x - b.x, a.y - b.y) / gesture.pinch0;
      if (gesture.type === 'frame') setFrame(gesture.clip, gesture.ratio, { ...frameFor(gesture.clip, gesture.ratio), zoom: gesture.z0 * k });
      else if (mode === 'stickers') gesture.item.size = clamp(gesture.size0 * k, 0.06, 0.4);
      else gesture.item.size = clamp(gesture.size0 * k, 0.03, 0.09);
      redraw();
      return;
    }
    const dx = pt.x - gesture.start.x, dy = pt.y - gesture.start.y;
    if (gesture.type === 'frame') {
      setFrame(gesture.clip, gesture.ratio, { ...gesture.f0, ...frameFor(gesture.clip, gesture.ratio), x: gesture.f0.x + dx, y: gesture.f0.y + dy });
    } else {
      gesture.item.x = clamp(gesture.x0 + dx, 0.02, 0.98);
      gesture.item.y = clamp(gesture.y0 + dy, 0.02, 0.98);
      if (mode === 'text') keepInside(gesture.item);
    }
    redraw();
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 0 && gesture) {
      gesture = null;
      edited();
      if (mode === 'reframe' || mode === 'stickers') render();
    } else if (gesture) {
      gesture.pinch0 = 0;
      const rest = [...pts.values()][0];
      if (rest) {
        gesture.start = rest;
        if (gesture.type === 'frame') gesture.f0 = { ...frameFor(gesture.clip, gesture.ratio) };
        else { gesture.x0 = gesture.item.x; gesture.y0 = gesture.item.y; }
      }
    }
  };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
}

// A dashed box around the text or sticker you're editing (preview only, never exported).
function decorate(ctx, W, H) {
  ctx.save();
  ctx.strokeStyle = '#FF2D95';
  ctx.lineWidth = Math.max(2, H * 0.003);
  ctx.setLineDash([H * 0.012, H * 0.008]);
  const tx = mode === 'text' ? selText() : null;
  if (tx) {
    const b = textBox(ctx, tx, W, H);
    ctx.strokeRect(b.cx - b.w / 2 - b.pad - 6, b.cy - b.h / 2 - b.pad * 0.5 - 6, b.w + b.pad * 2 + 12, b.h + b.pad + 12);
  }
  const s = mode === 'stickers' ? selSticker() : null;
  if (s && L().stickers) {
    const r = (s.size || 0.14) * H * 0.55;
    ctx.strokeRect(s.x * W - r, s.y * H - r, r * 2, r * 2);
  }
  // Text or stickers that aren't showing at the playhead: say so, so nothing seems lost.
  const off = mode === 'text' ? (tx && !(api.time() >= tx.start && api.time() < tx.end)) : (s && !(api.time() >= s.start && api.time() < s.end));
  if (off) {
    ctx.setLineDash([]);
    ctx.font = `600 ${Math.round(H * 0.024)}px "Helvetica Neue", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, H * 0.5 - H * 0.025, W, H * 0.05);
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText('Not showing at the playhead', W / 2, H * 0.5);
  }
  ctx.restore();
}

