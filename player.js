// Cake Walk: PLAYER (the preview) and the timeline math.
// Split out of editor.js in Prompt 6. The iPhone's own video player decodes each clip (smooth, in sync with
// sound), and every frame is then drawn onto a canvas with look.js, the same renderer the export uses.
// So framing, color, grades, transitions, text and stickers look the same in the preview and the export.

import { OPFS } from './storage.js';
import { DEBUG } from './debug.js';
import { RATIOS, frameFor, colorFor, drawBase, transitionAt, composite, drawOverlays, drawGuides } from './look.js';

// ---------- Timeline math (shared with editor.js and export.js) ----------

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

export function musicGain(m, time, end) {
  let g = m.volume ?? 1;
  if (m.fadeIn > 0 && time < m.fadeIn) g *= time / m.fadeIn;
  if (m.fadeOut > 0 && time > end - m.fadeOut) g *= Math.max(0, (end - time) / m.fadeOut);
  return Math.max(0, g);
}

// The editor connects itself here: where the project and playhead live, and what to redraw.
// host: { project(), time(), setTime(v), clock(), follow(), playButton(), note(), toast(msg), view() }
// view(): { ratio, safe, grid, effects, decorate(ctx, W, H) }
let host = null;
const urls = new Map();    // assetId -> object URL
let missingWarned = false;

// A file by its OPFS path (the Remix guide track, which isn't one of the project's clips).
async function pathUrl(path) {
  const key = `path:${path}`;
  if (urls.has(key)) return urls.get(key);
  const url = URL.createObjectURL(await OPFS.file(path));
  urls.set(key, url);
  return url;
}

async function assetUrl(assetId) {
  if (urls.has(assetId)) return urls.get(assetId);
  const asset = host.project().assets[assetId];
  const file = await OPFS.file(asset.path);
  const url = URL.createObjectURL(file);
  urls.set(assetId, url);
  return url;
}

function newCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
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
  stage: null,
  canvas: null,     // what you see
  base: null,       // this clip's picture layer
  held: null,       // the last picture of the clip before, for transitions
  heldFor: null,    // clip id the held picture leads into
  heldJob: 0,

  attach(h) { host = h; missingWarned = false; },

  mount(stage) {
    this.stage = stage;
    const mk = () => {
      const v = document.createElement('video');
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.preload = 'auto';
      v.muted = true;
      v.className = 'pv-src';
      v.setAttribute('aria-hidden', 'true');
      stage.appendChild(v);
      v.addEventListener('seeked', () => { if (v === this.active && !this.playing) this.draw(); });
      v.addEventListener('loadeddata', () => { if (v === this.active && !this.playing) this.draw(); });
      return v;
    };
    const img = document.createElement('img');
    img.className = 'pv-src';
    img.alt = '';
    img.addEventListener('load', () => { if (!this.playing) this.draw(); });
    stage.appendChild(img);
    const music = document.createElement('audio');
    music.preload = 'auto';
    const guide = document.createElement('audio');   // Remix guide: the reference's sound, preview only
    guide.preload = 'auto';
    this.els = { a: mk(), b: mk(), img, music, guide };
    this.active = this.els.a;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pv-canvas';
    stage.appendChild(this.canvas);
    this.ready = true;
    this.fit();
  },

  unmount() {
    this.pause();
    if (this.els) for (const el of [this.els.a, this.els.b, this.els.music, this.els.guide]) { el.pause(); el.removeAttribute('src'); el.load(); }
    this.els = null;
    this.canvas = null;
    this.stage = null;
    this.base = this.held = null;
    this.heldFor = null;
    this.ready = false;
    this.gains.clear();
    if (this.actx) { this.actx.close?.().catch?.(() => {}); this.actx = null; }
  },

  clearUrls() {
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls.clear();
    if (this.els) for (const el of [this.els.a, this.els.b, this.els.music, this.els.guide]) delete el.dataset.asset;
  },

  // Size the stage for the preview ratio (9:16, 4:5, 1:1 or 16:9) inside the space available.
  fit() {
    const stage = this.stage;
    if (!stage || !host) return;
    const wrap = stage.parentElement;
    const ratio = RATIOS[host.view().ratio] || RATIOS['9:16'];
    const availW = Math.max(120, wrap?.clientWidth || 320);
    const availH = Math.max(160, Math.min(wrap?.clientHeight || 420, window.innerHeight * 0.52));
    let w = availH * ratio, h = availH;
    if (w > availW) { w = availW; h = availW / ratio; }
    stage.style.width = `${Math.round(w)}px`;
    stage.style.height = `${Math.round(h)}px`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(2, Math.round(w * dpr)), H = Math.max(2, Math.round(h * dpr));
    if (this.canvas && (this.canvas.width !== W || this.canvas.height !== H)) {
      this.canvas.width = W; this.canvas.height = H;
      this.base = newCanvas(W, H);
      this.held = newCanvas(W, H);
      this.heldFor = null;
    }
    this.draw();
  },

  // One preview frame, drawn exactly the way the Worker draws an export frame.
  draw() {
    if (!this.canvas || !host) return;
    const p = host.project();
    if (!p) return;
    const ctx = this.canvas.getContext('2d');
    const W = this.canvas.width, H = this.canvas.height;
    const v = host.view();
    const T = host.time();
    const seg = this.seg;
    if (!seg) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      drawGuides(ctx, W, H, { platform: p.platform, safe: v.safe, grid: v.grid });
      return;
    }
    this.paintBase(this.base, seg, null);
    const tr = v.effects ? transitionAt(seg.clip, seg.start, seg.end - seg.start, T, p.lane) : null;
    if (tr && this.heldFor !== seg.clip.id && !this.playing) this.captureHeld(seg);
    composite(ctx, W, H, this.base, tr && this.heldFor === seg.clip.id ? this.held : null, tr);
    if (v.effects) drawOverlays(ctx, W, H, { texts: p.texts, stickers: p.stickers, T, lane: p.lane });
    drawGuides(ctx, W, H, { platform: p.platform, safe: v.safe, grid: v.grid });
    v.decorate?.(ctx, W, H);
  },

  // The picture layer for a clip: its source framed for the preview ratio, with its color and the grade.
  paintBase(canvas, seg, src) {
    const p = host.project();
    const v = host.view();
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    let el = src;
    if (!el) el = seg.asset?.kind === 'photo' ? this.els?.img : this.active;
    let sw = 0, sh = 0;
    if (el && el.tagName === 'IMG') { if (el.complete) { sw = el.naturalWidth; sh = el.naturalHeight; } }
    else if (el && el.readyState >= 2 && el.dataset.asset === seg.clip.assetId) { sw = el.videoWidth; sh = el.videoHeight; }
    drawBase(ctx, W, H, {
      draw: sw ? (c, dx, dy, dw, dh) => c.drawImage(el, dx, dy, dw, dh) : null,
      sw, sh,
      frame: frameFor(seg.clip, v.ratio),
      color: v.effects ? colorFor(seg.clip.color, p.grade, p.lane) : null
    });
  },

  // Paused inside a transition: fetch the last picture of the clip before, so the mix matches the export.
  async captureHeld(seg) {
    const job = ++this.heldJob;
    const segs = layout(host.project());
    const i = segs.findIndex((s) => s.clip.id === seg.clip.id);
    const prev = segs[i - 1];
    const mark = () => { if (job === this.heldJob) { this.heldFor = seg.clip.id; this.draw(); } };
    if (!prev || !this.held) { if (this.held) { const c = this.held.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, this.held.width, this.held.height); } mark(); return; }
    try {
      const src = await assetUrl(prev.clip.assetId);
      if (job !== this.heldJob || !this.els) return;
      if (prev.asset.kind === 'photo') {
        const im = new Image();
        im.src = src;
        await im.decode();
        if (job !== this.heldJob || !this.held) return;
        this.paintBase(this.held, prev, im);
        mark();
        return;
      }
      const el = this.active === this.els.a ? this.els.b : this.els.a;
      if (el.dataset.asset !== prev.clip.assetId) { el.src = src; el.dataset.asset = prev.clip.assetId; }
      await new Promise((resolve) => {
        const done = () => { el.removeEventListener('seeked', done); resolve(); };
        el.addEventListener('seeked', done);
        try { el.currentTime = Math.max(prev.clip.in, prev.clip.out - 0.04); } catch { done(); }
        setTimeout(done, 1500);
      });
      if (job !== this.heldJob || !this.held) return;
      this.paintBase(this.held, prev, el);
      mark();
    } catch (err) {
      DEBUG.log('warn', `Preview transition: ${err.name}`, 'preview');
    }
  },

  // Route sound through Web Audio, so per-clip volume works on iPhone (it ignores element volume).
  audioGraph() {
    if (this.actx || !this.els) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.actx = new Ctx();
      for (const key of ['a', 'b', 'music', 'guide']) {
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
    const segs = layout(host.project());
    if (!segs.length) return null;
    return segs.find((s) => time < s.end - 1e-6) || segs[segs.length - 1];
  },

  async show(seg, time, { play = false } = {}) {
    if (!this.els) return;
    const { a, b } = this.els;
    this.seg = seg;
    if (!seg) { this.draw(); return; }
    let src;
    try { src = await assetUrl(seg.clip.assetId); }
    catch (err) {
      DEBUG.log('error', `Preview: clip file missing (${err.name})`, 'preview');
      if (!missingWarned) { missingWarned = true; host.toast('One clip\'s file is missing from Cake Walk. Delete it and import it again.'); }
      return;
    }
    if (!this.els) return;
    if (seg.asset.kind === 'photo') {
      const img = this.els.img;
      a.pause(); b.pause();
      if (img.getAttribute('src') !== src) img.src = src; else this.draw();
      return;
    }
    // Reuse the element that already holds this clip (preloaded), otherwise the free one.
    let el = [a, b].find((x) => x.dataset.asset === seg.clip.assetId) || (this.active === a ? b : a);
    if (el.dataset.asset !== seg.clip.assetId) { el.src = src; el.dataset.asset = seg.clip.assetId; }
    const srcTime = seg.clip.in + (time - seg.start) * seg.clip.speed;
    if (Math.abs(el.currentTime - srcTime) > 0.04) { try { el.currentTime = srcTime; } catch {} }
    el.playbackRate = seg.clip.speed;
    const silent = seg.clip.muted || seg.clip.speed !== 1;
    el.muted = silent;
    this.setGain(el, silent ? 0 : seg.clip.volume);
    const other = el === a ? b : a;
    other.pause();
    this.active = el;
    if (play) el.play().catch(() => {});
    else this.draw();
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
    const p = host?.project();
    if (!p || !this.els) return;
    host.setTime(Math.max(0, Math.min(time, totalLength(p))));
    const t = host.time();
    this.heldJob++;
    const seg = this.segAt(t);
    if (seg?.clip.id !== this.heldFor) this.heldFor = null;
    this.show(seg, t);
    this.syncMusic(false);
    host.clock();
    if (!this.playing) host.note();
  },

  syncMusic(play) {
    const p = host?.project();
    const m = p?.music;
    const el = this.els?.music;
    if (!el) return;
    this.syncGuide(play);
    if (!m) { el.pause(); return; }
    const asset = p.assets[m.assetId];
    if (!asset) return;
    assetUrl(m.assetId).then((src) => {
      if (!this.els) return;
      const t = host.time();
      if (el.dataset.asset !== m.assetId) { el.src = src; el.dataset.asset = m.assetId; }
      const want = Math.min(t, asset.duration);
      if (Math.abs(el.currentTime - want) > 0.15) { try { el.currentTime = want; } catch {} }
      this.setGain(el, musicGain(m, t, Math.min(totalLength(p), asset.duration)));
      if (play && t < asset.duration) el.play().catch(() => {}); else if (!play) el.pause();
    }).catch(() => {});
  },

  // The Remix guide track: muted unless you turn on Hear guide. It is never part of the export.
  syncGuide(play) {
    const p = host?.project();
    const g = p?.guide;
    const el = this.els?.guide;
    if (!el) return;
    if (!g?.path || !g.hear) { el.pause(); return; }
    pathUrl(g.path).then((src) => {
      if (!this.els) return;
      const t = host.time();
      if (el.dataset.asset !== g.path) { el.src = src; el.dataset.asset = g.path; }
      const want = Math.min(t, g.duration || t);
      if (Math.abs(el.currentTime - want) > 0.15) { try { el.currentTime = want; } catch {} }
      this.setGain(el, 0.9);
      if (play && t < (g.duration || Infinity)) el.play().catch(() => {}); else if (!play) el.pause();
    }).catch(() => {
      if (!missingWarned) { missingWarned = true; host.toast('The guide sound is missing. Its reference video was deleted.'); }
    });
  },

  async play() {
    const p = host?.project();
    if (!p?.clips.length || this.playing) return;
    this.audioGraph();
    this.actx?.resume?.();
    if (host.time() >= totalLength(p) - 0.05) host.setTime(0);
    this.playing = true;
    this.heldJob++;
    host.playButton();
    await this.show(this.segAt(host.time()), host.time(), { play: true });
    this.syncMusic(true);
    this.clockStart = performance.now();
    this.clockT = host.time();
    let preloaded = null;
    const tick = () => {
      if (!this.playing) return;
      const seg = this.seg;
      const total = totalLength(p);
      if (!seg) { this.pause(); return; }
      let t;
      if (seg.asset.kind === 'photo') t = this.clockT + (performance.now() - this.clockStart) / 1000;
      else t = seg.start + (this.active.currentTime - seg.clip.in) / seg.clip.speed;
      host.setTime(t);
      const segs = layout(p);
      const idx = segs.findIndex((s) => s.clip.id === seg.clip.id);
      const next = segs[idx + 1];
      if (next && preloaded !== next.clip.id && seg.end - t < 1.5) { preloaded = next.clip.id; this.preload(next); }
      const ended = seg.asset.kind !== 'photo' && (this.active.ended || this.active.currentTime >= seg.clip.out - 0.02);
      if (t >= seg.end - 0.01 || ended) {
        if (!next) { this.pause(); this.seek(total); return; }
        // Keep this clip's last picture for the next clip's transition (the export does the same).
        if (this.held && this.base) {
          const hc = this.held.getContext('2d');
          hc.globalAlpha = 1;
          hc.globalCompositeOperation = 'source-over';
          hc.drawImage(this.base, 0, 0);
          this.heldFor = next.clip.id;
        }
        host.setTime(next.start);
        this.clockStart = performance.now();
        this.clockT = next.start;
        this.show(next, next.start, { play: true });
      }
      const m = p.music;
      if (m && p.assets[m.assetId]) {
        const dur = p.assets[m.assetId].duration;
        this.setGain(this.els.music, musicGain(m, host.time(), Math.min(total, dur)));
        if (host.time() >= dur) this.els.music.pause();
      }
      if (p.guide?.hear && p.guide.duration && host.time() >= p.guide.duration) this.els.guide.pause();
      this.draw();
      host.clock();
      host.follow();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    if (this.els) { this.els.a.pause(); this.els.b.pause(); this.els.music.pause(); this.els.guide.pause(); }
    host?.playButton();
    host?.note();
    this.draw();
  },

  toggle() { this.playing ? this.pause() : this.play(); }
};
