// Cake Walk: EDITOR and PLAYER
// Import, timeline (trim, split, speed, volume, reorder, undo), music and the preview.
// Clip bytes live in OPFS (copied in by the Worker). The project record in IndexedDB holds only the edit.
//
// Preview note (draft build): the preview plays the original clips with the iPhone's own video player,
// framed exactly like the export (center fill, 9:16), so playback is smooth and in sync with sound.
// The export draws every frame in the Worker. // VERIFY on iPhone that preview and export framing match.

import { CONFIG } from './config.js';
import { PROJECTS, OPFS, WORKER, THUMBS, SAVE, SESSION, UNDO } from './storage.js';
import { checkClips, missingSheet } from './safety.js';
import { DEBUG } from './debug.js';
import { renderGuard, timelineGuides, trimProjectTo, platformSheet, fmtLen } from './platforms.js';

const E = CONFIG.EDITOR;
const $ = (sel, root = document) => root.querySelector(sel);
const uid = () => crypto.randomUUID();

export const fmt = (s) => {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec < 10 ? '0' : ''}${sec.toFixed(1)}`;
};
export const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round((n || 0) / 1e3)} KB`);

// ---------- Timeline math (shared with export.js) ----------

export function clipLen(c) { return (c.out - c.in) / c.speed; }
export function layout(project) {
  let t = 0;
  return project.clips.map((clip) => {
    const seg = { clip, asset: project.assets[clip.assetId], start: t, end: t + clipLen(clip) };
    t = seg.end;
    return seg;
  });
}
export function totalLength(project) { return project.clips.reduce((a, c) => a + clipLen(c), 0); }

// ---------- State ----------

let ui = null;
let project = null;
let root = null;
let t = 0;                 // playhead, in timeline seconds
let selected = null;       // clip id
let missingWarned = false;
let safeMode = false;      // Recovery: open with effects and filmstrips off
let px = E.PX_PER_SEC;     // timeline zoom
const undoStack = [];
const redoStack = [];
const urls = new Map();    // assetId -> object URL
const thumbs = new Map();  // assetId -> [object URL]
let importAbort = null;

// ---------- Saving (an automatic draft for every project) ----------

// Every save goes through the shared save system (Prompt 5): within a second of each change.
async function writeProject() {
  if (!project) return;
  try { await PROJECTS.save(project); } catch (err) {
    DEBUG.log('error', `Project save failed: ${err.name}`, 'editor');
    ui?.toast('That didn\'t save. Free up some space and try again.');
    throw err;
  }
}
function queueSave() {
  if (project) SAVE.queue(`project:${project.id}`, writeProject, 400);
}
async function saveNow() {
  if (project) await SAVE.now(`project:${project.id}`, writeProject).catch(() => {});
}

// Where you are, for restoring after an accidental exit.
let panel = null;
function noteSession() {
  if (project) SESSION.set({ screen: 'editor', params: { id: project.id }, playhead: t, selected, panel });
}
async function openPanel(name, fn) {
  panel = name;
  noteSession();
  try { return await fn(); } finally { panel = null; noteSession(); }
}

function snapshot() { return JSON.stringify({ clips: project.clips, music: project.music }); }
function remember() {
  undoStack.push(snapshot());
  if (undoStack.length > E.UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
  UNDO.save(project.id, undoStack, redoStack);
}
function restore(json) {
  const s = JSON.parse(json);
  project.clips = s.clips;
  project.music = s.music;
  if (!project.clips.some((c) => c.id === selected)) selected = null;
  changed();
}
function undo() { if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); UNDO.save(project.id, undoStack, redoStack); }
function redo() { if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); UNDO.save(project.id, undoStack, redoStack); }

function changed() {
  t = Math.min(t, totalLength(project));
  queueSave();
  renderTimeline();
  renderSelection();
  renderLengthGuard();
  PLAYER.seek(t);
}

// ---------- PLAYER ----------

async function assetUrl(assetId) {
  if (urls.has(assetId)) return urls.get(assetId);
  const asset = project.assets[assetId];
  const file = await OPFS.file(asset.path);
  const url = URL.createObjectURL(file);
  urls.set(assetId, url);
  return url;
}

export const PLAYER = {
  ready: false,
  playing: false,
  els: null,        // { a, b, img, music }
  active: null,     // the <video> showing now
  seg: null,
  raf: 0,
  actx: null,
  gains: new Map(),
  clockStart: 0,
  clockT: 0,

  mount(stage) {
    const mk = () => {
      const v = document.createElement('video');
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.preload = 'auto';
      v.muted = true;
      v.className = 'pv hidden';
      stage.appendChild(v);
      return v;
    };
    const img = document.createElement('img');
    img.className = 'pv hidden';
    img.alt = '';
    stage.appendChild(img);
    const music = document.createElement('audio');
    music.preload = 'auto';
    this.els = { a: mk(), b: mk(), img, music };
    this.active = this.els.a;
    this.ready = true;
  },

  unmount() {
    this.pause();
    if (this.els) for (const el of [this.els.a, this.els.b, this.els.music]) { el.pause(); el.removeAttribute('src'); el.load(); }
    this.els = null;
    this.ready = false;
    this.gains.clear();
    if (this.actx) { this.actx.close?.().catch?.(() => {}); this.actx = null; }
  },

  // Route sound through Web Audio, so per-clip volume works on iPhone (it ignores element volume).
  audioGraph() {
    if (this.actx || !this.els) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.actx = new Ctx();
      for (const key of ['a', 'b', 'music']) {
        const g = this.actx.createGain();
        this.actx.createMediaElementSource(this.els[key]).connect(g).connect(this.actx.destination);
        this.gains.set(this.els[key], g);
      }
    } catch (err) {
      DEBUG.log('warn', `Preview sound mixer unavailable: ${err.message}`, 'player');
    }
  },
  setGain(el, v) {
    const g = this.gains.get(el);
    if (g) g.gain.value = v;
    else el.volume = Math.max(0, Math.min(1, v));
  },

  segAt(time) {
    const segs = layout(project);
    if (!segs.length) return null;
    return segs.find((s) => time < s.end - 1e-6) || segs[segs.length - 1];
  },

  async show(seg, time, { play = false } = {}) {
    if (!this.els) return;
    const { a, b, img } = this.els;
    this.seg = seg;
    if (!seg) { [a, b, img].forEach((x) => x.classList.add('hidden')); return; }
    let src;
    try { src = await assetUrl(seg.clip.assetId); }
    catch (err) {
      DEBUG.log('error', `Preview: clip file missing (${err.name})`, 'preview');
      if (!missingWarned) { missingWarned = true; ui?.toast('One clip\'s file is missing from Cake Walk. Delete it and import it again.'); }
      return;
    }
    if (!this.els) return;
    if (seg.asset.kind === 'photo') {
      if (img.getAttribute('src') !== src) img.src = src;
      img.classList.remove('hidden');
      a.classList.add('hidden'); b.classList.add('hidden');
      a.pause(); b.pause();
      return;
    }
    img.classList.add('hidden');
    // Reuse the element that already holds this clip (preloaded), otherwise the free one.
    let el = [a, b].find((x) => x.dataset.asset === seg.clip.assetId) || (this.active === a ? b : a);
    if (el.dataset.asset !== seg.clip.assetId) { el.src = src; el.dataset.asset = seg.clip.assetId; }
    const srcTime = seg.clip.in + (time - seg.start) * seg.clip.speed;
    if (Math.abs(el.currentTime - srcTime) > 0.04) { try { el.currentTime = srcTime; } catch {} }
    el.playbackRate = seg.clip.speed;
    const silent = seg.clip.muted || seg.clip.speed !== 1;
    el.muted = silent;
    this.setGain(el, silent ? 0 : seg.clip.volume);
    el.classList.remove('hidden');
    const other = el === a ? b : a;
    other.classList.add('hidden');
    other.pause();
    this.active = el;
    if (play) el.play().catch(() => {});
  },

  // Prepare the next clip in the hidden element so the cut is clean.
  async preload(next) {
    if (!next || next.asset.kind === 'photo' || !this.els) return;
    const { a, b } = this.els;
    const el = this.active === a ? b : a;
    const src = await assetUrl(next.clip.assetId);
    if (el.dataset.asset !== next.clip.assetId) { el.src = src; el.dataset.asset = next.clip.assetId; }
    try { el.currentTime = next.clip.in; } catch {}
  },

  seek(time) {
    if (!project || !this.els) return;
    t = Math.max(0, Math.min(time, totalLength(project)));
    this.show(this.segAt(t), t);
    this.syncMusic(false);
    renderClock();
    if (!this.playing) noteSession();
  },

  syncMusic(play) {
    const m = project?.music;
    const el = this.els?.music;
    if (!el) return;
    if (!m) { el.pause(); return; }
    const asset = project.assets[m.assetId];
    if (!asset) return;
    assetUrl(m.assetId).then((src) => {
      if (!this.els) return;
      if (el.dataset.asset !== m.assetId) { el.src = src; el.dataset.asset = m.assetId; }
      const want = Math.min(t, asset.duration);
      if (Math.abs(el.currentTime - want) > 0.15) { try { el.currentTime = want; } catch {} }
      this.setGain(el, musicGain(m, t, Math.min(totalLength(project), asset.duration)));
      if (play && t < asset.duration) el.play().catch(() => {}); else if (!play) el.pause();
    });
  },

  async play() {
    if (!project?.clips.length || this.playing) return;
    this.audioGraph();
    this.actx?.resume?.();
    if (t >= totalLength(project) - 0.05) t = 0;
    this.playing = true;
    renderPlayButton();
    await this.show(this.segAt(t), t, { play: true });
    this.syncMusic(true);
    this.clockStart = performance.now();
    this.clockT = t;
    let preloaded = null;
    const tick = () => {
      if (!this.playing) return;
      const seg = this.seg;
      const total = totalLength(project);
      if (!seg) { this.pause(); return; }
      if (seg.asset.kind === 'photo') {
        t = this.clockT + (performance.now() - this.clockStart) / 1000;
      } else {
        t = seg.start + (this.active.currentTime - seg.clip.in) / seg.clip.speed;
      }
      const segs = layout(project);
      const idx = segs.findIndex((s) => s.clip.id === seg.clip.id);
      const next = segs[idx + 1];
      if (next && preloaded !== next.clip.id && seg.end - t < 1.5) { preloaded = next.clip.id; this.preload(next); }
      const ended = seg.asset.kind !== 'photo' && (this.active.ended || this.active.currentTime >= seg.clip.out - 0.02);
      if (t >= seg.end - 0.01 || ended) {
        if (!next) { t = total; this.pause(); this.seek(total); return; }
        t = next.start;
        this.clockStart = performance.now();
        this.clockT = t;
        this.show(next, t, { play: true });
      }
      const m = project.music;
      if (m && project.assets[m.assetId]) {
        const dur = project.assets[m.assetId].duration;
        this.setGain(this.els.music, musicGain(m, t, Math.min(total, dur)));
        if (t >= dur) this.els.music.pause();
      }
      renderClock();
      followPlayhead();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    if (this.els) { this.els.a.pause(); this.els.b.pause(); this.els.music.pause(); }
    renderPlayButton();
    noteSession();
  },

  toggle() { this.playing ? this.pause() : this.play(); }
};

function musicGain(m, time, end) {
  let g = m.volume ?? 1;
  if (m.fadeIn > 0 && time < m.fadeIn) g *= time / m.fadeIn;
  if (m.fadeOut > 0 && time > end - m.fadeOut) g *= Math.max(0, (end - time) / m.fadeOut);
  return Math.max(0, g);
}

// ---------- Import ----------

function pick({ accept, multiple = true }) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve([...input.files]); input.remove(); });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

function progressPanel(title) {
  const box = document.createElement('div');
  box.className = 'sheet-backdrop';
  box.innerHTML = `<div class="sheet"><div class="sheet-grab"></div><p class="label">Importing</p><h2 class="imp-title"></h2>
    <div class="bar"><i></i></div><p class="muted small imp-note">Copying into Cake Walk so your edit never depends on the camera roll.</p>
    <div class="row"><button class="btn btn-ghost imp-cancel">Cancel</button></div></div>`;
  $('.imp-title', box).textContent = title;
  $('#sheet-root').appendChild(box);
  return {
    set(f, label) { $('.bar i', box).style.width = `${Math.round(f * 100)}%`; if (label) $('.imp-title', box).textContent = label; },
    note(text) { $('.imp-note', box).textContent = text; },
    onCancel(fn) { $('.imp-cancel', box).addEventListener('click', fn); },
    close() { box.remove(); }
  };
}

function extOf(file) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(file.name || '');
  if (m) return m[1].toLowerCase();
  if (file.type?.startsWith('image/')) return file.type.split('/')[1] || 'jpg';
  if (file.type === 'video/quicktime') return 'mov';
  return 'mp4';
}

// mode: 'quick' (Photos) or 'files' (Files app, exact original)
async function importFiles(files, mode) {
  if (!files.length) return;
  PLAYER.pause();
  const panel = progressPanel(`Clip 1 of ${files.length}`);
  importAbort = new AbortController();
  panel.onCancel(() => importAbort.abort());
  const warnings = [];
  let added = 0;
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const label = files.length > 1 ? `Clip ${i + 1} of ${files.length}` : (file.name || 'Your clip');
      panel.set(0, label);
      const assetId = uid();
      const path = `clips/${assetId}.${extOf(file)}`;
      await OPFS.copyIn(file, path, { signal: importAbort.signal, onProgress: (f) => panel.set(f * 0.9) });
      panel.note('Reading the clip...');
      let info;
      try {
        info = await WORKER.call('clip.probe', { path, type: file.type || '', photoSeconds: E.PHOTO_SECONDS }, [], 120000);
      } catch (err) {
        await OPFS.remove(path).catch(() => {});
        DEBUG.log('warn', `Import read failed: ${err.message}`, 'import');
        warnings.push(`${file.name || 'A file'} couldn't be read. Try Original quality (Files), or save it again from Photos.`);
        continue;
      }
      if (info.kind === 'audio') {
        await OPFS.remove(path).catch(() => {});
        warnings.push(`${file.name || 'That file'} is sound only. Add it with Music instead.`);
        continue;
      }
      if (info.kind === 'video' && (info.codec === 'prores' || !info.canDecode)) {
        await OPFS.remove(path).catch(() => {});
        warnings.push(info.codec === 'prores'
          ? 'ProRes clips can\'t be used here, because the iPhone\'s web video decoder can\'t read them. Record in HEVC for Cake Walk.'
          : `This iPhone can't decode ${info.codec || 'this'} video here.${info.codec === 'hevc' ? ' Try Settings, Camera, Formats, Most Compatible for clips meant for this app.' : ''}`);
        continue;
      }
      const asset = { id: assetId, path, name: file.name || 'clip', mode, importedAt: Date.now(), ...info };
      project.assets[assetId] = asset;
      remember();
      const clip = { id: uid(), assetId, in: 0, out: info.duration, speed: 1, volume: 1, muted: false };
      const at = selected ? project.clips.findIndex((c) => c.id === selected) + 1 : project.clips.length;
      project.clips.splice(at > 0 ? at : project.clips.length, 0, clip);
      selected = clip.id;
      added++;
      clipWarnings(asset).forEach((w) => warnings.push(w));
      DEBUG.log('info', `Imported ${info.kind} ${info.width}x${info.height} ${info.fps || ''}fps ${info.codec} ${info.hdr || 'SDR'} ${fmtBytes(info.size)} via ${mode}`, 'import');
      await saveNow();
      renderAll();
      loadThumbs(asset);
    }
  } catch (err) {
    if (err.name === 'AbortError') ui.toast('Import cancelled. Nothing half-copied was kept.');
    else if (err.name === 'QuotaExceededError') warnings.push('Your iPhone is out of space for Cake Walk. Free up space, then import again.');
    else { warnings.push('Import hit a snag. Debug has the details for Claude.'); DEBUG.log('error', `Import: ${err.name} ${err.message}`, 'import'); }
  } finally {
    panel.close();
    importAbort = null;
  }
  if (added) ui.toast(added === 1 ? 'Clip in. Let\'s cook.' : `${added} clips in. Let's cook.`, { sparkle: true });
  if (warnings.length) {
    const body = document.createElement('ul');
    body.className = 'warn-list';
    warnings.forEach((w) => { const li = document.createElement('li'); li.textContent = w; body.appendChild(li); });
    ui.sheet({ title: 'Heads up', body, actions: [{ label: 'Got it', value: true, main: true }] });
  }
}

function clipWarnings(a) {
  const out = [];
  if (a.kind !== 'video') return out;
  if (a.mode === 'quick' && a.codec === 'avc' && !a.hdr) out.push('iPhone converted this clip. For full quality, use Original quality (Files).');
  if (a.fps && a.fps >= 90) out.push(`This clip is ${Math.round(a.fps)} fps. Exports go up to 60 fps at most.`);
  if (a.hdr) out.push(`HDR clip (${a.hdr}). Exports come out as natural SDR. Check skin tones after your first export.`);
  // Apple Log 2 and spatial video can't be detected reliably yet. // VERIFY
  return out;
}

async function loadThumbs(asset) {
  try {
    let blobs = await THUMBS.get(asset.id);
    if (!blobs) {
      blobs = await WORKER.call('clip.thumbs', { path: asset.path, kind: asset.kind, duration: asset.duration, width: E.THUMB_WIDTH, every: E.THUMB_EVERY, max: E.THUMB_MAX }, [], 180000);
      await THUMBS.put(asset.id, blobs);
    }
    thumbs.get(asset.id)?.forEach((u) => URL.revokeObjectURL(u));
    thumbs.set(asset.id, blobs.map((b) => URL.createObjectURL(b)));
    renderTimeline();
  } catch (err) {
    DEBUG.log('warn', `Thumbnails: ${err.message}`, 'editor');
  }
}

async function addMusic() {
  const files = await pick({ accept: 'audio/*,video/*', multiple: false });
  if (!files.length) return;
  const file = files[0];
  const panel = progressPanel('Adding your music');
  importAbort = new AbortController();
  panel.onCancel(() => importAbort.abort());
  try {
    const assetId = uid();
    const path = `music/${assetId}.${extOf(file)}`;
    await OPFS.copyIn(file, path, { signal: importAbort.signal, onProgress: (f) => panel.set(f) });
    const info = await WORKER.call('clip.probe', { path, type: '' }, [], 120000);
    if (!(info.kind === 'audio' || info.hasAudio) || info.canDecode === false || info.audioCanDecode === false && info.kind !== 'audio') {
      await OPFS.remove(path).catch(() => {});
      ui.toast('That file has no sound Cake Walk can read.');
      return;
    }
    remember();
    project.assets[assetId] = { id: assetId, path, name: file.name || 'music', kind: 'audio', duration: info.duration, size: info.size, codec: info.codec || info.audioCodec };
    project.music = { assetId, volume: 0.8, fadeIn: 0, fadeOut: 1.5 };
    changed();
    ui.toast('Music on. Vibes secured.', { sparkle: true });
  } catch (err) {
    if (err.name !== 'AbortError') { DEBUG.log('error', `Music import: ${err.message}`, 'import'); ui.toast('That music file didn\'t work. Try another one.'); }
  } finally {
    panel.close();
    importAbort = null;
  }
}

// ---------- Edits ----------

const selClip = () => project.clips.find((c) => c.id === selected) || null;

function clipAtPlayhead() {
  const s = PLAYER.segAt(t);
  return s ? s.clip : null;
}

function split() {
  const target = selClip() && layout(project).find((s) => s.clip.id === selected && t > s.start + 0.05 && t < s.end - 0.05)
    ? selClip() : clipAtPlayhead();
  if (!target) return ui.toast('Add a clip first.');
  const seg = layout(project).find((s) => s.clip.id === target.id);
  if (!(t > seg.start + E.MIN_CLIP / 2 && t < seg.end - E.MIN_CLIP / 2)) return ui.toast('Move the playhead inside the clip to split it.');
  remember();
  const at = target.in + (t - seg.start) * target.speed;
  const second = { ...target, id: uid(), in: at };
  target.out = at;
  project.clips.splice(project.clips.indexOf(target) + 1, 0, second);
  selected = second.id;
  changed();
  ui.toast('Split.');
}

function del() {
  const c = selClip();
  if (!c) return;
  remember();
  project.clips.splice(project.clips.indexOf(c), 1);
  selected = null;
  changed();
}

function duplicate() {
  const c = selClip();
  if (!c) return;
  remember();
  const copy = { ...c, id: uid() };
  project.clips.splice(project.clips.indexOf(c) + 1, 0, copy);
  selected = copy.id;
  changed();
}

function move(dir) {
  const c = selClip();
  if (!c) return;
  const i = project.clips.indexOf(c);
  const j = i + dir;
  if (j < 0 || j >= project.clips.length) return;
  remember();
  project.clips.splice(i, 1);
  project.clips.splice(j, 0, c);
  changed();
}

function chips(values, current, label, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'chips';
  values.forEach((v) => {
    const b = document.createElement('button');
    b.className = `chip${v === current ? ' on' : ''}`;
    b.textContent = label(v);
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
  const wrap = document.createElement('label');
  wrap.className = 'field slider';
  wrap.innerHTML = '<span></span><input type="range"><b></b>';
  $('span', wrap).textContent = label;
  const input = $('input', wrap);
  Object.assign(input, { min, max, step, value });
  const out = $('b', wrap);
  out.textContent = fmtV(value);
  input.addEventListener('input', () => { out.textContent = fmtV(+input.value); onInput(+input.value); });
  return wrap;
}

async function speedSheet() {
  const c = selClip();
  if (!c) return;
  const body = document.createElement('div');
  body.appendChild(chips(E.SPEEDS, c.speed, (v) => `${v}x`, (v) => {
    remember();
    // Keep the same part of the clip; only its length on the timeline changes.
    c.speed = v;
    changed();
  }));
  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = 'A clip\'s own sound is muted when its speed changes.';
  body.appendChild(note);
  await ui.sheet({ title: 'Speed', body, actions: [{ label: 'Done', value: true, main: true }] });
}

async function volumeSheet() {
  const c = selClip();
  if (!c) return;
  const a = project.assets[c.assetId];
  const body = document.createElement('div');
  if (a.kind === 'photo' || !a.hasAudio) {
    body.innerHTML = '<p class="muted">This clip has no sound of its own.</p>';
  } else {
    let first = true;
    body.appendChild(slider('Volume', 0, 1, 0.05, c.volume, (v) => `${Math.round(v * 100)}%`, (v) => {
      if (first) { remember(); first = false; }
      c.volume = v;
      queueSave();
      PLAYER.seek(t);
    }));
    const mute = document.createElement('button');
    mute.className = 'btn btn-ghost wide';
    const label = () => { mute.textContent = c.muted ? 'Unmute clip' : 'Mute clip'; };
    label();
    mute.addEventListener('click', () => { remember(); c.muted = !c.muted; label(); changed(); });
    body.appendChild(mute);
    if (c.speed !== 1) {
      const n = document.createElement('p');
      n.className = 'note';
      n.textContent = 'Muted for now, because this clip\'s speed is changed.';
      body.appendChild(n);
    }
  }
  await ui.sheet({ title: 'Clip sound', body, actions: [{ label: 'Done', value: true, main: true }] });
}

async function musicSheet() {
  if (!project.music) return addMusic();
  const m = project.music;
  const body = document.createElement('div');
  const name = document.createElement('p');
  name.className = 'muted small';
  name.textContent = project.assets[m.assetId]?.name || 'Music';
  body.appendChild(name);
  let first = true;
  const once = () => { if (first) { remember(); first = false; } };
  body.appendChild(slider('Volume', 0, 1, 0.05, m.volume, (v) => `${Math.round(v * 100)}%`, (v) => { once(); m.volume = v; queueSave(); }));
  body.appendChild(slider('Fade in', 0, 5, 0.5, m.fadeIn, (v) => `${v}s`, (v) => { once(); m.fadeIn = v; queueSave(); }));
  body.appendChild(slider('Fade out', 0, 5, 0.5, m.fadeOut, (v) => `${v}s`, (v) => { once(); m.fadeOut = v; queueSave(); }));
  const pickAct = await ui.sheet({ title: 'Music', body, actions: [{ label: 'Remove', value: 'remove' }, { label: 'Replace', value: 'replace' }, { label: 'Done', value: 'done', main: true }] });
  if (pickAct === 'remove') { remember(); project.music = null; changed(); }
  else if (pickAct === 'replace') addMusic();
  else changed();
}

async function infoSheet() {
  const c = selClip();
  if (!c) return;
  const a = project.assets[c.assetId];
  const body = document.createElement('div');
  const rows = [
    ['File', a.name],
    ['Type', a.kind === 'photo' ? 'Photo' : `${(a.codec || '?').toUpperCase()}${a.codecString ? ` (${a.codecString})` : ''}`],
    ['Resolution', a.width ? `${a.width} x ${a.height}` : 'Unknown'],
    ['Frame rate', a.fps ? `${a.fps} fps` : a.kind === 'photo' ? 'Still' : 'Unknown'],
    ['Length', fmt(a.duration)],
    ['HDR', a.hdr || 'No (SDR)'],
    ['Size', fmtBytes(a.size)],
    ['Imported with', a.mode === 'files' ? 'Original quality (Files)' : 'Quick import (Photos)']
  ];
  rows.forEach(([k, v]) => {
    const d = document.createElement('div');
    d.className = 'kv';
    d.innerHTML = '<span></span><b></b>';
    $('span', d).textContent = k;
    $('b', d).textContent = v;
    body.appendChild(d);
  });
  if (a.kind === 'photo') {
    let first = true;
    body.appendChild(slider('Photo length', 0.5, 10, 0.5, c.out - c.in, (v) => `${v}s`, (v) => {
      if (first) { remember(); first = false; }
      c.in = 0; c.out = v; a.duration = Math.max(a.duration, v);
      queueSave(); renderTimeline();
    }));
  }
  clipWarnings(a).forEach((w) => { const p = document.createElement('p'); p.className = 'note warn-note'; p.textContent = w; body.appendChild(p); });
  await ui.sheet({ title: 'Clip details', body, actions: [{ label: 'Done', value: true, main: true }] });
  changed();
}

async function moreSheet() {
  const body = document.createElement('div');
  body.className = 'sheet-list';
  const items = [
    ['Add clips (Photos)', () => pick({ accept: 'image/*,video/*' }).then((f) => importFiles(f, 'quick'))],
    ['Add clips (Files, original quality)', () => pick({}).then((f) => importFiles(f, 'files'))],
    ['Rename project', rename],
    ['Color', () => ui.soon('Color tools')],
    ['Transitions', () => ui.soon('Transitions')],
    ['Reframe', () => ui.soon('Reframe')],
    ['Stickers', () => ui.soon('Stickers')],
    ['Remix timing', () => ui.soon('Remix')]
  ];
  let chosen = null;
  items.forEach(([label, fn]) => {
    const b = document.createElement('button');
    b.className = 'list-btn';
    b.textContent = label;
    b.dataset.pick = '1';
    b.addEventListener('click', () => { chosen = fn; document.querySelector('.sheet-backdrop')?.click(); });
    body.appendChild(b);
  });
  await ui.sheet({ title: 'More tools', body });
  chosen?.();
}

async function rename() {
  const body = document.createElement('label');
  body.className = 'field';
  body.innerHTML = '<span>Project name</span><input autocomplete="off" autocapitalize="words">';
  const input = $('input', body);
  input.value = project.name;
  const ok = await ui.sheet({ title: 'Rename', body, actions: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, main: true }] });
  if (ok && input.value.trim()) { project.name = input.value.trim(); await saveNow(); renderHead(); }
}

// ---------- Rendering ----------

function renderHead() {
  if (!root) return;
  $('[data-slot="name"]', root).textContent = project.name;
  const lane = $('[data-slot="lane"]', root);
  lane.textContent = project.lane;
  lane.className = `pill ${project.lane === 'PRO' ? 'pill-chrome' : 'pill-pink'}`;
}

function renderClock() {
  if (!root) return;
  $('[data-slot="clock"]', root).textContent = `${fmt(t)} / ${fmt(totalLength(project))}`;
}

function renderPlayButton() {
  const b = root && $('[data-act="ed-play"]', root);
  if (b) { b.textContent = PLAYER.playing ? '❚❚' : '▶'; b.setAttribute('aria-label', PLAYER.playing ? 'Pause' : 'Play'); }
}

function renderSelection() {
  if (!root) return;
  noteSession();
  const c = selClip();
  $('[data-slot="clipbar"]', root).classList.toggle('hidden', !c);
  const meta = $('[data-slot="meta"]', root);
  if (!c) { meta.textContent = project.clips.length ? 'Tap a clip to edit it.' : ''; return; }
  const a = project.assets[c.assetId];
  meta.textContent = a.kind === 'photo'
    ? `Photo · ${a.width} x ${a.height} · ${fmt(clipLen(c))}`
    : `${a.width} x ${a.height} · ${a.fps ? `${Math.round(a.fps)} fps` : '? fps'} · ${fmt(a.duration)} · ${(a.codec || '').toUpperCase()} · ${a.hdr ? `HDR ${a.hdr}` : 'SDR'} · ${fmtBytes(a.size)}${c.speed !== 1 ? ` · ${c.speed}x, clip sound muted` : ''}`;
}

let programmaticScroll = false;
function followPlayhead() {
  const sc = root && $('[data-slot="tl-scroll"]', root);
  if (!sc) return;
  programmaticScroll = true;
  sc.scrollLeft = t * px;
  requestAnimationFrame(() => { programmaticScroll = false; });
}

function renderTimeline() {
  if (!root) return;
  const track = $('[data-slot="tl-track"]', root);
  const sc = $('[data-slot="tl-scroll"]', root);
  track.innerHTML = '';
  const half = sc.clientWidth / 2 || 180;
  track.style.paddingLeft = `${half}px`;
  track.style.paddingRight = `${half}px`;
  const segs = layout(project);
  const row = document.createElement('div');
  row.className = 'tl-row';
  segs.forEach((s) => {
    const w = Math.max(8, (s.end - s.start) * px);
    const el = document.createElement('div');
    el.className = `tl-clip${s.clip.id === selected ? ' sel' : ''}`;
    el.style.width = `${w}px`;
    el.dataset.id = s.clip.id;
    const strip = document.createElement('div');
    strip.className = 'tl-strip';
    const list = thumbs.get(s.clip.assetId) || [];
    if (list.length) {
      const n = Math.max(1, Math.ceil(w / 40));
      for (let i = 0; i < n; i++) {
        const srcT = s.clip.in + ((i + 0.5) / n) * (s.clip.out - s.clip.in);
        const k = Math.min(list.length - 1, Math.floor((srcT / (s.asset.duration || 1)) * list.length));
        const im = document.createElement('img');
        im.src = list[Math.max(0, k)];
        im.alt = '';
        im.draggable = false;
        strip.appendChild(im);
      }
    }
    el.appendChild(strip);
    if (s.clip.speed !== 1) { const b = document.createElement('span'); b.className = 'tl-badge'; b.textContent = `${s.clip.speed}x`; el.appendChild(b); }
    if (s.clip.muted) { const b = document.createElement('span'); b.className = 'tl-badge tl-badge-r'; b.textContent = 'muted'; el.appendChild(b); }
    if (s.clip.id === selected) {
      for (const side of ['l', 'r']) {
        const h = document.createElement('div');
        h.className = `tl-h tl-h-${side}`;
        h.dataset.side = side;
        h.setAttribute('aria-label', side === 'l' ? 'Trim start' : 'Trim end');
        el.appendChild(h);
      }
    }
    row.appendChild(el);
  });
  track.appendChild(row);
  // Music lane
  const mrow = document.createElement('div');
  mrow.className = 'tl-mrow';
  if (project.music && project.assets[project.music.assetId]) {
    const a = project.assets[project.music.assetId];
    const m = document.createElement('button');
    m.className = 'tl-music';
    m.style.width = `${Math.max(40, Math.min(a.duration, totalLength(project) || a.duration) * px)}px`;
    m.textContent = `♪ ${a.name}`;
    m.addEventListener('click', musicSheet);
    mrow.appendChild(m);
  }
  track.appendChild(mrow);
  // Target band and limit line for the chosen platform.
  const guides = timelineGuides(guardOpts());
  if (guides.band) {
    const b = document.createElement('div');
    b.className = 'tl-band';
    b.style.left = `${half + guides.band[0] * px}px`;
    b.style.width = `${(guides.band[1] - guides.band[0]) * px}px`;
    track.appendChild(b);
  }
  if (guides.limit != null) {
    const l = document.createElement('div');
    l.className = 'tl-limit';
    l.style.left = `${half + guides.limit * px}px`;
    l.title = `Limit ${fmtLen(guides.limit)}`;
    track.appendChild(l);
  }
  programmaticScroll = true;
  sc.scrollLeft = t * px;
  requestAnimationFrame(() => { programmaticScroll = false; });
  renderClock();
}

function renderEmpty(show) {
  $('[data-slot="empty"]', root).classList.toggle('hidden', !show);
  $('[data-slot="workspace"]', root).classList.toggle('hidden', show);
}

// Live length guard (Prompt 4): running length, green target band, amber limit, one-tap trim.
function guardOpts() {
  return { platform: project.platform || 'tiktok', lane: project.lane, length: totalLength(project), settings: ui?.settings || {} };
}
function renderLengthGuard() {
  const el = root && $('[data-slot="guard"]', root);
  if (el) renderGuard(el, guardOpts());
}

function renderAll() {
  renderHead();
  renderEmpty(!project.clips.length);
  renderTimeline();
  renderSelection();
  renderLengthGuard();
  PLAYER.seek(t);
}

// ---------- Timeline gestures: scrub, select, trim, reorder, zoom ----------

function bindTimeline() {
  const sc = $('[data-slot="tl-scroll"]', root);
  let scrubRaf = 0;
  sc.addEventListener('scroll', () => {
    if (programmaticScroll || trimming || dragging) return;
    if (PLAYER.playing) PLAYER.pause();
    cancelAnimationFrame(scrubRaf);
    scrubRaf = requestAnimationFrame(() => PLAYER.seek(sc.scrollLeft / px));
  }, { passive: true });

  // Trim handles
  let trimming = null;
  sc.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.tl-h');
    if (!h) return;
    e.preventDefault();
    const c = selClip();
    if (!c) return;
    remember();
    trimming = { side: h.dataset.side, x: e.clientX, c, in0: c.in, out0: c.out, asset: project.assets[c.assetId] };
    h.setPointerCapture(e.pointerId);
    PLAYER.pause();
  });
  sc.addEventListener('pointermove', (e) => {
    if (!trimming) return;
    const { side, c, in0, out0, asset } = trimming;
    let d = ((e.clientX - trimming.x) / px) * c.speed;
    const seg = layout(project).find((s) => s.clip.id === c.id);
    if (side === 'l') {
      let v = Math.max(0, Math.min(out0 - E.MIN_CLIP, in0 + d));
      if (asset.kind === 'photo') v = 0;
      c.in = v;
      if (seg) PLAYER.show(seg, seg.start);
    } else {
      const max = asset.kind === 'photo' ? 60 : asset.duration;
      let v = Math.max(in0 + E.MIN_CLIP, Math.min(max, out0 + d));
      // Magnetic snap: clip end to the playhead
      const endTl = (seg?.start || 0) + (v - c.in) / c.speed;
      if (Math.abs(endTl - t) * px < 10) v = c.in + (t - (seg?.start || 0)) * c.speed;
      if (asset.kind === 'photo') asset.duration = Math.max(asset.duration, v);
      c.out = v;
      if (seg && asset.kind !== 'photo') PLAYER.show(seg, seg.start + (v - c.in) / c.speed - 0.02);
    }
    renderTimeline();
  });
  const endTrim = () => { if (trimming) { trimming = null; changed(); } };
  sc.addEventListener('pointerup', endTrim);
  sc.addEventListener('pointercancel', endTrim);

  // Tap to select; long-press and drag to reorder
  let press = null;
  let dragging = null;
  sc.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.tl-h') || e.target.closest('.tl-music')) return;
    const el = e.target.closest('.tl-clip');
    if (!el) return;
    press = { id: el.dataset.id, x: e.clientX, y: e.clientY, moved: false, timer: setTimeout(() => {
      if (!press || press.moved) return;
      dragging = { id: press.id, el };
      el.classList.add('lift');
      navigator.vibrate?.(10);
      sc.style.overflowX = 'hidden';
      try { el.setPointerCapture(e.pointerId); } catch {}
    }, 450) };
  });
  sc.addEventListener('pointermove', (e) => {
    if (press && (Math.abs(e.clientX - press.x) > 8 || Math.abs(e.clientY - press.y) > 8)) press.moved = true;
    if (!dragging) return;
    dragging.el.style.transform = `translateX(${e.clientX - press.x}px)`;
  });
  const endPress = (e) => {
    if (dragging) {
      const rect = sc.getBoundingClientRect();
      const x = sc.scrollLeft + (e.clientX - rect.left) - parseFloat($('[data-slot="tl-track"]', root).style.paddingLeft || '0');
      const time = Math.max(0, x / px);
      const c = project.clips.find((k) => k.id === dragging.id);
      const others = layout(project).filter((s) => s.clip.id !== dragging.id);
      let idx = others.findIndex((s) => time < (s.start + s.end) / 2);
      if (idx < 0) idx = others.length;
      const from = project.clips.indexOf(c);
      const order = project.clips.filter((k) => k.id !== dragging.id);
      order.splice(idx, 0, c);
      sc.style.overflowX = '';
      dragging = null;
      if (order.indexOf(c) !== from) { remember(); project.clips = order; }
      selected = c.id;
      changed();
    } else if (press && !press.moved) {
      selected = press.id === selected ? null : press.id;
      renderTimeline();
      renderSelection();
    }
    if (press) clearTimeout(press.timer);
    press = null;
  };
  sc.addEventListener('pointerup', endPress);
  sc.addEventListener('pointercancel', () => { if (press) clearTimeout(press.timer); press = null; if (dragging) { dragging = null; sc.style.overflowX = ''; renderTimeline(); } });

  // Pinch to zoom (iOS gesture events), plus the zoom buttons as a backup.
  let px0 = px;
  sc.addEventListener('gesturestart', (e) => { e.preventDefault(); px0 = px; });
  sc.addEventListener('gesturechange', (e) => { e.preventDefault(); zoomTo(px0 * e.scale); });
  sc.addEventListener('gestureend', (e) => e.preventDefault());
}

function zoomTo(v) {
  px = Math.max(8, Math.min(400, v));
  renderTimeline();
}

// ---------- EDITOR ----------

export const EDITOR = {
  get project() { return project; },

  // Called by app.js when the Editor screen opens. `uiApi` gives shared helpers (sheets, toasts, go).
  // opts.restore: the saved session (playhead, selection, open panel). opts.safe: open with effects and filmstrips off.
  async render(container, uiApi, projectId, opts = {}) {
    ui = uiApi;
    await this.close();
    project = projectId ? await PROJECTS.get(projectId) : null;
    container.innerHTML = '';
    if (!project) {
      container.appendChild(ui.emptyState('No project open.', 'Tap New video on Home, or pick one from Projects.'));
      return;
    }
    project.assets ||= {};
    project.clips ||= [];
    project.music ||= null;
    project.platform ||= 'tiktok';
    project.openedAt = Date.now();
    safeMode = !!opts.safe;
    const hist = await UNDO.load(project.id);
    undoStack.length = 0;
    redoStack.length = 0;
    undoStack.push(...(hist.undo || []));
    redoStack.push(...(hist.redo || []));
    const r = opts.restore;
    selected = r?.selected && project.clips.some((c) => c.id === r.selected) ? r.selected : null;
    t = Math.min(r?.playhead ?? project.playhead ?? 0, totalLength(project));
    missingWarned = false;
    root = document.getElementById('tpl-editor-body').content.firstElementChild.cloneNode(true);
    container.appendChild(root);
    PLAYER.mount($('[data-slot="stage"]', root));
    root.addEventListener('click', onClick);
    bindTimeline();
    renderAll();
    if (!safeMode) Object.values(project.assets).forEach((a) => { if (a.kind !== 'audio') loadThumbs(a); });
    window.addEventListener('resize', renderTimeline);
    queueSave();
    noteSession();
    // Every clip must be intact inside Cake Walk; the edit never depends on the camera roll.
    const opened = project;
    checkClips(project).then((missing) => {
      if (missing.length && project === opened && root) missingSheet(ui, project, missing, () => { urls.clear(); thumbs.clear(); renderAll(); if (!safeMode) Object.values(project.assets).forEach((a) => { if (a.kind !== 'audio') loadThumbs(a); }); });
    }).catch((err) => DEBUG.log('warn', `Clip check: ${err.message}`, 'editor'));
    if (r?.panel && !safeMode) {
      const fns = { speed: speedSheet, volume: volumeSheet, info: infoSheet, music: musicSheet, more: moreSheet };
      const needsClip = ['speed', 'volume', 'info'].includes(r.panel);
      if (fns[r.panel] && (!needsClip || selClip()) && (r.panel !== 'music' || project.music)) setTimeout(() => openPanel(r.panel, fns[r.panel]), 350);
    }
  },

  async close() {
    if (!project) return;
    project.playhead = t;
    await saveNow();
    PLAYER.unmount();
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls.clear();
    thumbs.forEach((list) => list.forEach((u) => URL.revokeObjectURL(u)));
    thumbs.clear();
    window.removeEventListener('resize', renderTimeline);
    root = null;
    project = null;
  },

  // Called before an update, on hide and on pagehide: write everything waiting, right now.
  async saveOpenWork() {
    if (project) { project.playhead = t; queueSave(); noteSession(); UNDO.save(project.id, undoStack, redoStack); }
    await SAVE.flush();
    return true;
  },
  get safeMode() { return safeMode; }
};

async function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b || !root?.contains(b)) return;
  const act = b.dataset.act;
  if (!act.startsWith('ed-')) return;
  e.stopPropagation();
  switch (act) {
    case 'ed-play': PLAYER.toggle(); break;
    case 'ed-back': PLAYER.pause(); ui.go('projects'); break;
    case 'ed-undo': undo(); break;
    case 'ed-redo': redo(); break;
    case 'ed-quick': importFiles(await pick({ accept: 'image/*,video/*' }), 'quick'); break;
    case 'ed-files': importFiles(await pick({}), 'files'); break;
    case 'ed-add': {
      const which = await ui.sheet({ title: 'Add clips', text: 'For full quality, save the clip to Files first (in Photos, tap Share, then Save to Files), then use Original quality.', actions: [{ label: 'Quick (Photos)', value: 'quick' }, { label: 'Original (Files)', value: 'files', main: true }] });
      if (which === 'quick') importFiles(await pick({ accept: 'image/*,video/*' }), 'quick');
      if (which === 'files') importFiles(await pick({}), 'files');
      break;
    }
    case 'ed-trim': {
      if (!selClip()) { const c = clipAtPlayhead(); if (c) { selected = c.id; renderTimeline(); renderSelection(); } }
      ui.toast(selClip() ? 'Drag the pink handles to trim.' : 'Add a clip first.');
      break;
    }
    case 'ed-split': split(); break;
    case 'ed-speed': openPanel('speed', speedSheet); break;
    case 'ed-volume': openPanel('volume', volumeSheet); break;
    case 'ed-dup': duplicate(); break;
    case 'ed-del': del(); break;
    case 'ed-left': move(-1); break;
    case 'ed-right': move(1); break;
    case 'ed-info': openPanel('info', infoSheet); break;
    case 'ed-music': openPanel('music', musicSheet); break;
    case 'ed-platform': {
      const key = await platformSheet(ui, project.platform);
      if (key) { project.platform = key; project.exportPicks = null; queueSave(); renderTimeline(); renderLengthGuard(); }
      break;
    }
    case 'ed-autotrim': {
      const to = Number(b.dataset.to);
      if (!(to > 0)) break;
      remember();
      if (trimProjectTo(project, to, clipLen)) { changed(); ui.toast(`Trimmed to ${fmtLen(to)}.`); }
      else undoStack.pop();
      break;
    }
    case 'ed-text': ui.soon('Text'); break;
    case 'ed-template': ui.soon('Templates'); break;
    case 'ed-more': openPanel('more', moreSheet); break;
    case 'ed-zoom-in': zoomTo(px * 1.5); break;
    case 'ed-zoom-out': zoomTo(px / 1.5); break;
    case 'ed-export':
      PLAYER.pause();
      if (!project.clips.length) { ui.toast('Add a clip first.'); break; }
      await EDITOR.saveOpenWork();
      ui.go('export', { id: project.id });
      break;
  }
}
