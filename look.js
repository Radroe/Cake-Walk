// Cake Walk: LOOK (Prompt 6): the one renderer for framing, color, grades, text, stickers and transitions.
// The preview (main page) and the export (Worker) both draw with these same functions, so they look the same.
// No DOM here: only canvas calls, so it runs in the Worker too. Sizes are fractions of the frame, so any
// resolution and aspect ratio comes out the same.

// ---------- Lanes ----------
// PRO (agencies and brands): natural color, true skin tones, neutral white balance, soft contrast, low saturation,
// clean white or black text only, no neon, glow or colored-gel looks. CREATIVE: stylized grades, neon text, effects.

export const RATIOS = { '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9 };

export const COLOR_KEYS = ['brightness', 'contrast', 'saturation', 'warmth'];

export const LANES = {
  PRO: {
    color: { brightness: [-0.15, 0.15], contrast: [-0.15, 0.1], saturation: [-0.3, 0], warmth: [-0.15, 0.15] },
    textStyles: ['clean'],
    textColors: ['white', 'black'],
    fonts: ['sans', 'avenir', 'futura', 'didot', 'georgia'],
    transitions: ['cut', 'crossfade', 'zoom', 'flash'],
    stickers: false,
    grades: ['natural']
  },
  CREATIVE: {
    color: { brightness: [-0.5, 0.5], contrast: [-0.5, 0.6], saturation: [-1, 1], warmth: [-0.6, 0.6] },
    textStyles: ['clean', 'bubble', 'sparkle', 'gloss'],
    textColors: ['white', 'black', 'pink', 'babypink', 'neon', 'lilac', 'chrome', 'gold'],
    fonts: ['sans', 'avenir', 'futura', 'didot', 'georgia', 'marker', 'script'],
    transitions: ['cut', 'crossfade', 'zoom', 'flash', 'sparkle', 'heart'],
    stickers: true,
    grades: ['natural', 'pinkhaze', 'chrome', 'neon', 'y2k', 'gel']
  }
};

export const laneOf = (lane) => LANES[lane] || LANES.PRO;

export const TEXT_STYLES = { clean: 'Clean Pro', bubble: 'Bubble', sparkle: 'Sparkle', gloss: 'Gloss' };

// iOS system fonts, available to canvases on the page and in the Worker. // VERIFY each renders on iOS 26.
export const FONTS = {
  sans: { label: 'Clean', css: '"Helvetica Neue", Helvetica, Arial, sans-serif', weight: 700 },
  avenir: { label: 'Avenir', css: '"Avenir Next", Avenir, "Helvetica Neue", sans-serif', weight: 700 },
  futura: { label: 'Futura', css: 'Futura, "Avenir Next", sans-serif', weight: 700 },
  didot: { label: 'Didot', css: 'Didot, "Bodoni 72", Georgia, serif', weight: 700 },
  georgia: { label: 'Georgia', css: 'Georgia, "Times New Roman", serif', weight: 700 },
  marker: { label: 'Marker', css: '"Marker Felt", "Chalkboard SE", sans-serif', weight: 700 },
  script: { label: 'Script', css: '"Snell Roundhand", "Apple Chancery", cursive', weight: 700 }
};

export const TEXT_COLORS = {
  white: { label: 'White', fill: '#FFFFFF' },
  black: { label: 'Black', fill: '#111111' },
  pink: { label: 'Hot pink', fill: '#FF2D95' },
  babypink: { label: 'Baby pink', fill: '#FFB3D9' },
  neon: { label: 'Neon', fill: '#39FF14' },
  lilac: { label: 'Lilac', fill: '#C8A2FF' },
  chrome: { label: 'Chrome', fill: '#C9CCD1', stops: ['#FFFFFF', '#C9CCD1', '#8E939B'] },
  gold: { label: 'Gold', fill: '#E8B84A', stops: ['#FFE28A', '#E8B84A', '#C9962B'] }
};

export const TRANSITIONS = {
  cut: 'Cut', crossfade: 'Crossfade', zoom: 'Zoom punch', flash: 'White flash', sparkle: 'Sparkle wipe', heart: 'Heart wipe'
};

// Stylized grades for CREATIVE. Each nudges the color sliders and lays a tint over the picture.
export const GRADES = {
  natural: { label: 'Natural' },
  pinkhaze: { label: 'Pink Haze', adj: { contrast: -0.06, saturation: 0.1, brightness: 0.03 }, tint: ['#FF6BB5', 'soft-light', 0.35] },
  chrome: { label: 'Chrome', adj: { saturation: -0.65, contrast: 0.18 }, tint: ['#C9CCD1', 'overlay', 0.18] },
  neon: { label: 'Neon Night', adj: { contrast: 0.22, saturation: 0.45, brightness: -0.04 }, tint: ['#8A2BE2', 'soft-light', 0.4] },
  y2k: { label: 'Y2K Flash', adj: { brightness: 0.08, saturation: 0.25, contrast: 0.05 }, tint: ['#FFE28A', 'soft-light', 0.3] },
  gel: { label: 'Pink Gel', adj: { saturation: 0.15 }, tint: ['#FF2D95', 'overlay', 0.32] }
};

export const STICKERS = {
  heart: 'Heart', chromeHeart: 'Chrome heart', star: 'Star', sparkle: 'Sparkle', rhinestone: 'Rhinestone',
  lipGloss: 'Lip gloss', hoop: 'Hoop earring', butterfly: 'Butterfly clip', bow: 'Bow', cherries: 'Cherries',
  cloud: 'Cloud', cake: 'Cake'
};

// Where each app's buttons and captions sit, as fractions of a 9:16 frame. // VERIFY against the apps; they move.
export const SAFE_ZONES = {
  tiktok: { label: 'TikTok', zones: [
    { name: 'Tabs', x0: 0, y0: 0, x1: 1, y1: 0.09 },
    { name: 'Buttons', x0: 0.86, y0: 0.36, x1: 1, y1: 0.86 },
    { name: 'Caption and sound', x0: 0, y0: 0.79, x1: 1, y1: 1 }
  ] },
  reels: { label: 'Instagram', zones: [
    { name: 'Top bar', x0: 0, y0: 0, x1: 1, y1: 0.08 },
    { name: 'Buttons', x0: 0.87, y0: 0.45, x1: 1, y1: 0.88 },
    { name: 'Caption', x0: 0, y0: 0.8, x1: 1, y1: 1 }
  ] },
  story: { label: 'Instagram Story', zones: [
    { name: 'Name and progress', x0: 0, y0: 0, x1: 1, y1: 0.12 },
    { name: 'Reply bar', x0: 0, y0: 0.87, x1: 1, y1: 1 }
  ] },
  shorts: { label: 'YouTube Shorts', zones: [
    { name: 'Top bar', x0: 0, y0: 0, x1: 1, y1: 0.07 },
    { name: 'Buttons', x0: 0.85, y0: 0.4, x1: 1, y1: 0.88 },
    { name: 'Title and channel', x0: 0, y0: 0.8, x1: 1, y1: 1 }
  ] },
  youtube: { label: 'YouTube', zones: [
    { name: 'Progress bar', x0: 0, y0: 0.9, x1: 1, y1: 1 }
  ] }
};

// The box text should stay inside for a platform (center points), from its zones.
export function safeBox(platform) {
  const z = (SAFE_ZONES[platform] || SAFE_ZONES.tiktok).zones;
  let top = 0.04, bottom = 0.96, right = 0.96;
  for (const r of z) {
    if (r.y0 === 0 && r.x1 === 1 && r.x0 === 0) top = Math.max(top, r.y1 + 0.02);
    else if (r.y1 === 1 && r.x0 === 0) bottom = Math.min(bottom, r.y0 - 0.02);
    else if (r.x1 === 1) right = Math.min(right, r.x0 - 0.02);
  }
  return { left: 0.04, right, top, bottom };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- Lane rules, applied at draw time so old or copied data always obeys its lane ----------

export function laneColor(color, lane) {
  color ||= {};   // a clip with no color set comes through as null from the export, not undefined
  const L = laneOf(lane).color;
  const out = {};
  for (const k of COLOR_KEYS) out[k] = clamp(+color[k] || 0, L[k][0], L[k][1]);
  return out;
}

export function laneText(item, lane) {
  const L = laneOf(lane);
  return {
    ...item,
    style: L.textStyles.includes(item.style) ? item.style : 'clean',
    color: L.textColors.includes(item.color) ? item.color : (item.color === 'black' ? 'black' : 'white'),
    font: L.fonts.includes(item.font) ? item.font : 'sans'
  };
}

export const laneTransition = (kind, lane) => (laneOf(lane).transitions.includes(kind) ? kind : (kind === 'sparkle' || kind === 'heart' ? 'crossfade' : 'cut'));
export const laneGrade = (grade, lane) => (laneOf(lane).grades.includes(grade) ? grade : 'natural');

// ---------- Framing ----------

// Reframe once, use it everywhere: a ratio without its own framing borrows the 9:16 one.
export function frameFor(clip, ratio = '9:16') {
  const f = clip?.frame?.[ratio] || clip?.frame?.['9:16'];
  return { mode: 'fill', zoom: 1, x: 0, y: 0, ...(f || {}) };
}

let tmpCanvas = null;
function tmp(w, h) {
  if (!tmpCanvas) tmpCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : null;
  if (!tmpCanvas) return null;
  if (tmpCanvas.width !== w || tmpCanvas.height !== h) { tmpCanvas.width = w; tmpCanvas.height = h; }
  return tmpCanvas;
}

// draw(ctx, dx, dy, dw, dh) paints the source; sw x sh is its displayed size.
export function drawSource(ctx, draw, sw, sh, W, H, f) {
  if (!sw || !sh) return;
  const cover = Math.max(W / sw, H / sh);
  const contain = Math.min(W / sw, H / sh);
  if (f.mode === 'blur') {
    // Blurred background: the picture drawn tiny, then stretched back up (same result everywhere, no filters needed).
    const bw = Math.max(8, Math.round(W / 24)), bh = Math.max(8, Math.round(H / 24));
    const c = tmp(bw, bh);
    if (c) {
      const t = c.getContext('2d');
      const s = Math.max(bw / sw, bh / sh);
      t.clearRect(0, 0, bw, bh);
      draw(t, (bw - sw * s) / 2, (bh - sh * s) / 2, sw * s, sh * s);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(c, -W * 0.05, -H * 0.05, W * 1.1, H * 1.1);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
  const s = (f.mode === 'fill' ? cover : contain) * clamp(f.zoom || 1, 1, 4);
  const dw = sw * s, dh = sh * s;
  let dx = (W - dw) / 2 + (f.x || 0) * W;
  let dy = (H - dh) / 2 + (f.y || 0) * H;
  if (f.mode === 'fill' || dw >= W) dx = clamp(dx, W - dw, 0);
  if (f.mode === 'fill' || dh >= H) dy = clamp(dy, H - dh, 0);
  draw(ctx, dx, dy, dw, dh);
}

// ---------- Color ----------

let filterOK = null;
export function supportsFilter(ctx) {
  if (filterOK !== null) return filterOK;
  try { const before = ctx.filter; ctx.filter = 'brightness(1.5)'; filterOK = ctx.filter === 'brightness(1.5)'; ctx.filter = before || 'none'; }
  catch { filterOK = false; }
  return filterOK;
}

// The final color for a clip: its sliders (kept inside the lane's range) plus the project grade.
export function colorFor(clipColor, grade, lane) {
  const c = laneColor(clipColor, lane);
  const g = GRADES[laneGrade(grade, lane)];
  if (g?.adj) for (const k of COLOR_KEYS) c[k] += g.adj[k] || 0;
  return { ...c, tint: g?.tint || null };
}

const isNeutral = (c) => !c.brightness && !c.contrast && !c.saturation;

export function filterString(c) {
  return `brightness(${(1 + c.brightness).toFixed(3)}) contrast(${(1 + c.contrast).toFixed(3)}) saturate(${(1 + c.saturation).toFixed(3)})`;
}

// Warmth and grade tints go on top of the picture.
function tints(ctx, c, W, H) {
  ctx.save();
  if (c.warmth) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = Math.min(1, Math.abs(c.warmth) * 0.9);
    ctx.fillStyle = c.warmth > 0 ? '#FF8A1F' : '#1F7BFF';
    ctx.fillRect(0, 0, W, H);
  }
  if (c.tint) {
    ctx.globalCompositeOperation = c.tint[1];
    ctx.globalAlpha = c.tint[2];
    ctx.fillStyle = c.tint[0];
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// Fallback when this canvas can't take a filter: brightness and lower saturation only. // VERIFY iOS 26 supports ctx.filter.
function fallbackColor(ctx, c, W, H) {
  ctx.save();
  if (c.brightness) {
    ctx.globalCompositeOperation = c.brightness > 0 ? 'screen' : 'multiply';
    ctx.globalAlpha = Math.min(1, Math.abs(c.brightness) * 0.8);
    ctx.fillStyle = c.brightness > 0 ? '#FFFFFF' : '#000000';
    ctx.fillRect(0, 0, W, H);
  }
  if (c.saturation < 0) {
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = Math.min(1, -c.saturation);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

// The picture layer: black, the framed source, then color. Transitions mix this layer between clips.
export function drawBase(ctx, W, H, { draw, sw, sh, frame, color }) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const useFilter = color && !isNeutral(color) && supportsFilter(ctx);
  if (useFilter) ctx.filter = filterString(color);
  if (draw) drawSource(ctx, draw, sw, sh, W, H, frame || { mode: 'fill', zoom: 1, x: 0, y: 0 });
  if (useFilter) ctx.filter = 'none';
  ctx.restore();
  if (color) {
    if (!useFilter && !isNeutral(color)) fallbackColor(ctx, color, W, H);
    tints(ctx, color, W, H);
  }
}

// ---------- Transitions (into a clip, over its first moments) ----------

export const TRANSITION_SECONDS = 0.5;

// How far into the incoming clip's transition we are (0 to 1), or null outside it.
export function transitionAt(clip, segStart, segLen, time, lane) {
  const kind = laneTransition(clip?.transition?.kind || 'cut', lane);
  if (kind === 'cut') return null;
  const d = Math.min(clip.transition.dur || TRANSITION_SECONDS, segLen / 2);
  const into = time - segStart;
  if (into < 0 || into >= d) return null;
  return { kind, p: into / d };
}

function heartPath(ctx, cx, cy, s) {
  // s = half-width of the heart
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.25, cy + s * 0.05, cx - s * 0.95, cy - s * 1.0, cx, cy - s * 0.42);
  ctx.bezierCurveTo(cx + s * 0.95, cy - s * 1.0, cx + s * 1.25, cy + s * 0.05, cx, cy + s * 0.9);
  ctx.closePath();
}

function sparkPath(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r * 0.12, cy - r * 0.12, cx + r, cy);
  ctx.quadraticCurveTo(cx + r * 0.12, cy + r * 0.12, cx, cy + r);
  ctx.quadraticCurveTo(cx - r * 0.12, cy + r * 0.12, cx - r, cy);
  ctx.quadraticCurveTo(cx - r * 0.12, cy - r * 0.12, cx, cy - r);
  ctx.closePath();
}

// out: final canvas context. base: this clip's picture layer. held: the last picture of the clip before (or null).
export function composite(out, W, H, base, held, tr) {
  out.save();
  out.globalAlpha = 1;
  out.globalCompositeOperation = 'source-over';
  if (!tr) { out.drawImage(base, 0, 0, W, H); out.restore(); return; }
  const p = clamp(tr.p, 0, 1);
  const prev = () => { if (held) out.drawImage(held, 0, 0, W, H); else { out.fillStyle = '#000'; out.fillRect(0, 0, W, H); } };
  const ease = p * p * (3 - 2 * p);
  if (tr.kind === 'crossfade') {
    out.drawImage(base, 0, 0, W, H);
    out.globalAlpha = 1 - ease;
    prev();
  } else if (tr.kind === 'zoom') {
    const s = 1 + 0.14 * (1 - ease);
    out.drawImage(base, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s);
  } else if (tr.kind === 'flash') {
    out.drawImage(base, 0, 0, W, H);
    out.globalAlpha = Math.pow(1 - p, 1.6);
    out.fillStyle = '#FFFFFF';
    out.fillRect(0, 0, W, H);
  } else if (tr.kind === 'sparkle') {
    prev();
    // A diagonal edge sweeps from the top left to the bottom right.
    const k = ease * (W + H) * 1.05;
    out.save();
    out.beginPath();
    out.moveTo(0, 0); out.lineTo(Math.min(k, W), 0);
    if (k > W) out.lineTo(W, k - W);
    out.lineTo(Math.max(0, k - H), Math.min(k, H));
    if (k > H) out.lineTo(0, H); else out.lineTo(0, k);
    out.closePath();
    out.clip();
    out.drawImage(base, 0, 0, W, H);
    out.restore();
    const r = Math.min(W, H) * 0.035;
    out.fillStyle = '#FFFFFF';
    out.shadowColor = 'rgba(255,45,149,0.9)';
    out.shadowBlur = r;
    for (let i = 0; i < 7; i++) {
      const u = (i + 0.5) / 7;
      const x = clamp(k * u, 0, W), y = clamp(k - k * u, 0, H);
      if (x >= W || y >= H) continue;
      sparkPath(out, x, y, r * (0.6 + 0.6 * Math.abs(Math.sin(i * 1.7 + p * 6))));
      out.fill();
    }
  } else if (tr.kind === 'heart') {
    prev();
    const s = ease * Math.hypot(W, H) * 0.9;
    out.save();
    heartPath(out, W / 2, H / 2 + s * 0.12, s);
    out.clip();
    out.drawImage(base, 0, 0, W, H);
    out.restore();
    if (p < 0.98) {
      heartPath(out, W / 2, H / 2 + s * 0.12, s);
      out.lineWidth = Math.min(W, H) * 0.012;
      out.strokeStyle = '#FF2D95';
      out.stroke();
    }
  } else {
    out.drawImage(base, 0, 0, W, H);
  }
  out.restore();
}

// ---------- Text ----------

export const TEXT_DEFAULT = { text: 'Your text', font: 'sans', color: 'white', style: 'clean', outline: false, shadow: true, x: 0.5, y: 0.42, size: 0.05 };
export const wordCount = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

function fillFor(ctx, colorKey, x0, y0, x1, y1) {
  const c = TEXT_COLORS[colorKey] || TEXT_COLORS.white;
  if (!c.stops) return c.fill;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  c.stops.forEach((s, i) => g.addColorStop(i / (c.stops.length - 1), s));
  return g;
}
const isLight = (colorKey) => !['black', 'pink', 'lilac'].includes(colorKey) || colorKey === 'babypink';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Text box size and position (used for drawing and for tapping/dragging in the preview).
export function textBox(ctx, item, W, H) {
  const f = FONTS[item.font] || FONTS.sans;
  let px = Math.max(8, (item.size || 0.05) * H);
  ctx.font = `${f.weight} ${px}px ${f.css}`;
  let w = ctx.measureText(item.text || '').width;
  const maxW = W * 0.88;
  if (w > maxW) { px *= maxW / w; ctx.font = `${f.weight} ${px}px ${f.css}`; w = ctx.measureText(item.text || '').width; }
  const pad = item.style === 'bubble' ? px * 0.45 : px * 0.12;
  return { px, w, h: px * 1.15, cx: item.x * W, cy: item.y * H, pad, font: ctx.font };
}

export function drawText(ctx, raw, W, H, lane) {
  const item = laneText(raw, lane);
  if (!item.text) return;
  const b = textBox(ctx, item, W, H);
  ctx.save();
  ctx.font = b.font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const x0 = b.cx - b.w / 2, y0 = b.cy - b.h / 2;
  if (item.style === 'bubble') {
    roundRect(ctx, x0 - b.pad, y0 - b.pad * 0.5, b.w + b.pad * 2, b.h + b.pad, (b.h + b.pad) / 2);
    ctx.fillStyle = fillFor(ctx, item.color, x0, y0, x0, y0 + b.h);
    if (item.shadow) { ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = b.px * 0.25; ctx.shadowOffsetY = b.px * 0.06; }
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = isLight(item.color) ? '#111111' : '#FFFFFF';
    ctx.fillText(item.text, b.cx, b.cy);
    ctx.restore();
    return;
  }
  if (item.shadow) {
    ctx.shadowColor = item.color === 'black' ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = b.px * 0.18;
    ctx.shadowOffsetY = b.px * 0.05;
  }
  const outline = item.outline || item.style === 'gloss' || item.style === 'sparkle';
  if (outline) {
    ctx.lineWidth = b.px * (item.style === 'gloss' ? 0.16 : 0.1);
    ctx.strokeStyle = item.style === 'gloss' ? '#FFFFFF' : (item.color === 'black' ? '#FFFFFF' : '#111111');
    ctx.strokeText(item.text, b.cx, b.cy);
    ctx.shadowColor = 'transparent';
  }
  if (item.style === 'gloss') {
    // Glossy: a bright top half and the color below, with a thin dark rim.
    const c = TEXT_COLORS[item.color] || TEXT_COLORS.white;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + b.h);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.45, c.stops ? c.stops[0] : c.fill);
    g.addColorStop(0.55, c.fill);
    g.addColorStop(1, c.stops ? c.stops[c.stops.length - 1] : c.fill);
    ctx.fillStyle = g;
    ctx.fillText(item.text, b.cx, b.cy);
    ctx.lineWidth = b.px * 0.025;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeText(item.text, b.cx, b.cy);
  } else if (item.style === 'sparkle') {
    const c = TEXT_COLORS[item.color] || TEXT_COLORS.white;
    const g = ctx.createLinearGradient(x0, y0, x0 + b.w, y0 + b.h);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.5, c.fill);
    g.addColorStop(1, '#FFFFFF');
    ctx.fillStyle = g;
    ctx.fillText(item.text, b.cx, b.cy);
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = c.fill;
    ctx.shadowBlur = b.px * 0.3;
    sparkPath(ctx, x0 - b.px * 0.25, y0 + b.px * 0.05, b.px * 0.32); ctx.fill();
    sparkPath(ctx, x0 + b.w + b.px * 0.2, y0 + b.h * 0.85, b.px * 0.24); ctx.fill();
    sparkPath(ctx, x0 + b.w * 0.7, y0 - b.px * 0.2, b.px * 0.16); ctx.fill();
  } else {
    ctx.fillStyle = fillFor(ctx, item.color, x0, y0, x0, y0 + b.h);
    ctx.fillText(item.text, b.cx, b.cy);
  }
  ctx.restore();
}

// ---------- Stickers (original vector art, CREATIVE only) ----------
// Each draws in a 100 x 100 box centered on 0,0.

function grad(ctx, stops, x0 = -50, y0 = -50, x1 = 50, y1 = 50) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}
const CHROME = ['#FFFFFF', '#C9CCD1', '#8E939B', '#E6E8EB'];
const GOLD = ['#FFF1B8', '#FFE28A', '#C9962B'];

function shine(ctx, x, y, w, h, a = 0.75) {
  ctx.save(); ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.beginPath(); ctx.ellipse(x, y, w, h, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

const ART = {
  heart(ctx) { heartPath(ctx, 0, 2, 44); ctx.fillStyle = grad(ctx, ['#FF6BB5', '#FF2D95', '#E0187A']); ctx.fill(); shine(ctx, -18, -14, 10, 5); },
  chromeHeart(ctx) {
    heartPath(ctx, 0, 2, 44); ctx.fillStyle = grad(ctx, CHROME); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#6E737B'; ctx.stroke(); shine(ctx, -18, -14, 11, 5, 0.9);
  },
  star(ctx) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 20 : 46; const a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r + 3); }
    ctx.closePath(); ctx.fillStyle = grad(ctx, GOLD); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#B07D1E'; ctx.stroke(); shine(ctx, -8, -14, 6, 3);
  },
  sparkle(ctx) { sparkPath(ctx, 0, 0, 46); ctx.fillStyle = grad(ctx, CHROME); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#8E939B'; ctx.stroke(); sparkPath(ctx, 30, -30, 12); ctx.fillStyle = '#FFFFFF'; ctx.fill(); },
  rhinestone(ctx) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; ctx.lineTo(Math.cos(a) * 42, Math.sin(a) * 42); }
    ctx.closePath(); ctx.fillStyle = grad(ctx, ['#FFFFFF', '#D6F0FF', '#9FC9E8', '#FFFFFF']); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#7FA7C4'; ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 22); }
    ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill(); ctx.stroke();
    for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 22, Math.sin(a) * 22); ctx.lineTo(Math.cos(a) * 42, Math.sin(a) * 42); ctx.stroke(); }
  },
  lipGloss(ctx) {
    ctx.rotate(-0.5);
    roundRect(ctx, -14, -8, 28, 52, 8); ctx.fillStyle = grad(ctx, ['#FFB3D9', '#FF2D95'], -14, 0, 14, 0); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#C70F66'; ctx.stroke();
    roundRect(ctx, -11, -46, 22, 40, 6); ctx.fillStyle = grad(ctx, CHROME, -11, 0, 11, 0); ctx.fill(); ctx.strokeStyle = '#6E737B'; ctx.stroke();
    shine(ctx, -6, 14, 3, 14, 0.6);
  },
  hoop(ctx) {
    ctx.lineWidth = 11; ctx.strokeStyle = grad(ctx, GOLD); ctx.beginPath(); ctx.arc(0, 8, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(0, 8, 37, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
    ctx.fillStyle = grad(ctx, GOLD); ctx.beginPath(); ctx.arc(0, -30, 7, 0, Math.PI * 2); ctx.fill();
  },
  butterfly(ctx) {
    const wing = (sx) => {
      ctx.beginPath(); ctx.ellipse(sx * 22, -14, 22, 26, sx * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(sx * 18, 20, 15, 18, -sx * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    };
    ctx.fillStyle = grad(ctx, ['#FFD1EA', '#C8A2FF', '#9FD8FF']); ctx.lineWidth = 2.5; ctx.strokeStyle = '#8A6FC4';
    wing(-1); wing(1);
    roundRect(ctx, -5, -38, 10, 74, 5); ctx.fillStyle = grad(ctx, CHROME, -5, 0, 5, 0); ctx.fill(); ctx.strokeStyle = '#6E737B'; ctx.stroke();
  },
  bow(ctx) {
    ctx.fillStyle = grad(ctx, ['#FFB3D9', '#FF6BB5', '#FF2D95']); ctx.strokeStyle = '#C70F66'; ctx.lineWidth = 2.5;
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(s * 20, -38, s * 52, -26, s * 46, 2); ctx.bezierCurveTo(s * 42, 22, s * 16, 14, 0, 0); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 4, 6); ctx.lineTo(s * 22, 44); ctx.lineTo(s * 30, 36); ctx.lineTo(s * 12, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(0, 2, 10, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); shine(ctx, -24, -12, 8, 4, 0.6);
  },
  cherries(ctx) {
    ctx.strokeStyle = '#3E7A2B'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-16, 16); ctx.quadraticCurveTo(-6, -24, 8, -38); ctx.moveTo(20, 20); ctx.quadraticCurveTo(16, -16, 8, -38); ctx.stroke();
    ctx.fillStyle = '#5DBB3F'; ctx.beginPath(); ctx.ellipse(22, -36, 14, 7, -0.4, 0, Math.PI * 2); ctx.fill();
    for (const [x, y] of [[-18, 26], [20, 30]]) { ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fillStyle = grad(ctx, ['#FF4D6D', '#D0103A'], x - 17, y - 17, x + 17, y + 17); ctx.fill(); shine(ctx, x - 6, y - 7, 5, 3); }
  },
  cloud(ctx) {
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#C9D6E8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(-24, 8, 20, Math.PI * 0.5, Math.PI * 1.5); ctx.arc(-6, -10, 24, Math.PI, Math.PI * 1.9); ctx.arc(22, -2, 20, Math.PI * 1.3, Math.PI * 0.2);
    ctx.arc(14, 18, 12, Math.PI * 1.8, Math.PI * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
  },
  cake(ctx) {
    ctx.beginPath(); ctx.moveTo(-44, 8); ctx.lineTo(36, -24); ctx.lineTo(44, -10); ctx.lineTo(44, 34); ctx.lineTo(-44, 38); ctx.closePath();
    ctx.fillStyle = grad(ctx, ['#FFF8EE', '#F3E2C9'], 0, -24, 0, 38); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-44, 8); ctx.lineTo(36, -24); ctx.lineTo(44, -10); ctx.lineTo(44, -2); ctx.lineTo(-44, 20); ctx.closePath();
    ctx.fillStyle = grad(ctx, ['#FF6BB5', '#FF2D95'], 0, -24, 0, 20); ctx.fill();
    ctx.fillStyle = '#FF8DC4'; ctx.fillRect(-44, 26, 88, 4);
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(34, -30, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#D0103A'; ctx.beginPath(); ctx.arc(34, -34, 6, 0, Math.PI * 2); ctx.fill();
  }
};

export function drawSticker(ctx, s, W, H) {
  const art = ART[s.kind];
  if (!art) return;
  const px = (s.size || 0.14) * H;
  ctx.save();
  ctx.translate(s.x * W, s.y * H);
  ctx.rotate(s.rot || 0);
  ctx.scale(px / 100, px / 100);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  art(ctx);
  ctx.restore();
}

// ---------- Overlays for a moment on the timeline ----------

export const activeAt = (items, T) => (items || []).filter((it) => T >= (it.start || 0) && T < (it.end ?? Infinity));

export function drawOverlays(ctx, W, H, { texts, stickers, T, lane }) {
  if (laneOf(lane).stickers) for (const s of activeAt(stickers, T)) drawSticker(ctx, s, W, H);
  for (const tx of activeAt(texts, T)) drawText(ctx, tx, W, H, lane);
}

// Preview only: where the app's buttons will cover the video, and the rule-of-thirds grid.
export function drawGuides(ctx, W, H, { platform, safe, grid }) {
  ctx.save();
  if (safe) {
    const z = SAFE_ZONES[platform] || SAFE_ZONES.tiktok;
    ctx.font = `600 ${Math.round(H * 0.018)}px "Helvetica Neue", sans-serif`;
    ctx.textBaseline = 'top';
    for (const r of z.zones) {
      ctx.fillStyle = 'rgba(255,45,149,0.28)';
      ctx.fillRect(r.x0 * W, r.y0 * H, (r.x1 - r.x0) * W, (r.y1 - r.y0) * H);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.setLineDash([H * 0.008, H * 0.006]);
      ctx.lineWidth = Math.max(1, H * 0.002);
      ctx.strokeRect(r.x0 * W, r.y0 * H, (r.x1 - r.x0) * W, (r.y1 - r.y0) * H);
      ctx.setLineDash([]);
      ctx.fillStyle = '#FFFFFF';
      const label = `${z.label} ${r.name.toLowerCase()}`;
      if ((r.x1 - r.x0) > 0.3) ctx.fillText(label, r.x0 * W + H * 0.01, r.y0 * H + H * 0.006);
    }
  }
  if (grid) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1, H * 0.0015);
    ctx.beginPath();
    for (const f of [1 / 3, 2 / 3]) { ctx.moveTo(W * f, 0); ctx.lineTo(W * f, H); ctx.moveTo(0, H * f); ctx.lineTo(W, H * f); }
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- Dual cut: the same clips and timeline, made to follow the other lane ----------

export function convertLane(project, lane) {
  const p = JSON.parse(JSON.stringify(project));
  p.lane = lane;
  p.grade = laneGrade(p.grade || 'natural', lane);
  for (const c of p.clips || []) {
    if (c.color) c.color = laneColor(c.color, lane);
    if (c.transition) c.transition = { ...c.transition, kind: laneTransition(c.transition.kind, lane) };
  }
  p.texts = (p.texts || []).map((tx) => laneText(tx, lane));
  if (!laneOf(lane).stickers) p.stickers = [];
  return p;
}
