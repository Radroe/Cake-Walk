// Cake Walk: RHYTHM (Prompt 7): the math behind Remix. Finding cuts and beats, snapping, and filling
// timing slots with your clips. Plain functions with no DOM, used by the Worker (analysis) and remix.js (editing).

// ---------- Cuts: how different each small frame is from the one before ----------

// Luma of an RGBA image, plus a 32-bin histogram.
export function lumaOf(rgba) {
  const n = rgba.length / 4;
  const y = new Uint8Array(n);
  const hist = new Float32Array(32);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const v = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    y[i] = v;
    hist[v >> 3]++;
  }
  for (let b = 0; b < 32; b++) hist[b] /= n || 1;
  return { y, hist };
}

// 0 (same picture) to 1 (completely different): half pixel change, half change in the spread of brightness.
// The brightness part compares running totals of the histogram, not bin by bin: on flat colors, compression
// noise can tip a whole frame into the next bin, which bin-by-bin reads as a cut. Running totals barely move.
export function frameDiff(a, b) {
  if (!a || !b || a.y.length !== b.y.length) return 0;
  let px = 0;
  for (let i = 0; i < a.y.length; i++) px += Math.abs(a.y[i] - b.y[i]);
  px /= a.y.length * 255;
  let ca = 0, cb = 0, h = 0;
  for (let k = 0; k < 31; k++) { ca += a.hist[k]; cb += b.hist[k]; h += Math.abs(ca - cb); }
  return 0.5 * Math.min(1, px * 2.2) + 0.5 * Math.min(1, (h / 31) * 3);
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

// scores[i] belongs to times[i] (the first frame after a possible cut). Returns cut times in seconds.
export function detectCuts(scores, times, { minGap = 0.3, floor = 0.16 } = {}) {
  const med = median(scores);
  const T = Math.max(floor, med * 3 + 0.05);
  const cuts = [];
  for (let i = 1; i < scores.length; i++) {
    const s = scores[i];
    if (s < T) continue;
    // Only the strongest frame in a small neighborhood counts (fast motion can spread over a few frames).
    let peak = true;
    for (let j = Math.max(1, i - 2); j <= Math.min(scores.length - 1, i + 2); j++) if (j !== i && scores[j] > s) { peak = false; break; }
    if (!peak) continue;
    const t = times[i];
    if (cuts.length && t - cuts[cuts.length - 1] < minGap) continue;
    cuts.push(t);
  }
  return cuts;
}

// ---------- Beats: an onset envelope from the sound, then the steady pulse that fits it best ----------

export const HOP_SECONDS = 0.01;

// Feed it mono samples chunk by chunk; it keeps only 100 numbers a second, never the whole song.
export class OnsetMeter {
  constructor(rate) {
    this.rate = rate;
    this.hop = Math.max(1, Math.round(rate * HOP_SECONDS));
    this.acc = 0;
    this.count = 0;
    this.prev = 0;
    this.energy = [];
  }
  push(mono) {
    for (let i = 0; i < mono.length; i++) {
      const hp = mono[i] - this.prev;   // a simple high-pass, so kicks, snares and claps stand out over hum
      this.prev = mono[i];
      this.acc += hp * hp;
      if (++this.count === this.hop) { this.energy.push(this.acc / this.hop); this.acc = 0; this.count = 0; }
    }
  }
  // Rising loudness, frame by frame (log scale, so quiet songs work too).
  envelope() {
    const e = this.energy.map((v) => Math.log10(1e-9 + v));
    const o = new Float32Array(e.length);
    for (let k = 1; k < e.length; k++) o[k] = Math.max(0, e[k] - e[k - 1]);
    const sm = new Float32Array(o.length);
    for (let k = 0; k < o.length; k++) sm[k] = (o[k - 1] || 0) * 0.25 + o[k] * 0.5 + (o[k + 1] || 0) * 0.25;
    return sm;
  }
}

// Returns { beats: [seconds], bpm } or { beats: [], bpm: null } when there's no clear pulse.
export function detectBeats(env, { duration = env.length * HOP_SECONDS, minBpm = 60, maxBpm = 180 } = {}) {
  const n = env.length;
  if (n < 200) return { beats: [], bpm: null };
  let mean = 0;
  for (let k = 0; k < n; k++) mean += env[k];
  mean /= n;
  let max = 0;
  for (let k = 0; k < n; k++) max = Math.max(max, env[k]);
  if (max < 0.15 || mean < 1e-4) return { beats: [], bpm: null };
  const x = Float32Array.from(env, (v) => v - mean);
  const fps = 1 / HOP_SECONDS;
  const lo = Math.floor((60 / maxBpm) * fps), hi = Math.ceil((60 / minBpm) * fps);
  let best = 0, bestLag = 0, zero = 0;
  for (let k = 0; k < n; k++) zero += x[k] * x[k];
  const ac = new Float32Array(hi + 2);
  for (let lag = lo; lag <= hi + 1; lag++) {
    let s = 0;
    for (let k = lag; k < n; k++) s += x[k] * x[k - lag];
    ac[lag] = s / (n - lag);
  }
  for (let lag = lo; lag <= hi; lag++) {
    // Prefer tempos near 120 BPM a little, so we don't lock onto half or double time.
    const bpm = (60 * fps) / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    const s = ac[lag] * w;
    if (s > best) { best = s; bestLag = lag; }
  }
  if (!bestLag || ac[bestLag] <= (zero / n) * 0.02) return { beats: [], bpm: null };
  // Parabolic refinement for a period between frames.
  const a = ac[bestLag - 1] || 0, b = ac[bestLag], c = ac[bestLag + 1] || 0;
  const den = a - 2 * b + c;
  const period = bestLag + (den ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0);
  // The phase that lands on the most onsets.
  let bestPhase = 0, phaseScore = -1;
  for (let p = 0; p < period; p++) {
    let s = 0;
    for (let t = p; t < n; t += period) s += env[Math.round(t)] || 0;
    if (s > phaseScore) { phaseScore = s; bestPhase = p; }
  }
  const beats = [];
  const reach = 4;   // nudge each beat onto the real hit within 40 ms
  for (let t = bestPhase; t < n; t += period) {
    let k = Math.round(t), top = k;
    for (let j = Math.max(0, k - reach); j <= Math.min(n - 1, k + reach); j++) if (env[j] > env[top]) top = j;
    const sec = +(top * HOP_SECONDS).toFixed(3);
    if (sec <= duration) beats.push(sec);
  }
  return { beats, bpm: Math.round(((60 * fps) / period) * 10) / 10 };
}

// ---------- Editing helpers ----------

export function nearest(list, t) {
  let best = null;
  for (const v of list || []) if (best === null || Math.abs(v - t) < Math.abs(best - t)) best = v;
  return best;
}

// Snap a time to the nearest beat if one is close enough.
export function snap(t, beats, within = 0.15) {
  const b = nearest(beats, t);
  return b !== null && Math.abs(b - t) <= within ? b : t;
}

export function cleanTimes(list, duration, minGap = 0.1) {
  const out = [];
  for (const t of [...list].filter((v) => v > 0.05 && v < duration - 0.05).sort((a, b) => a - b)) {
    if (!out.length || t - out[out.length - 1] >= minGap) out.push(+t.toFixed(3));
  }
  return out;
}

// The recipe's timing slots: one per shot.
export function slotsOf(recipe) {
  const d = recipe.duration || 0;
  const marks = [0, ...cleanTimes(recipe.cuts || [], d), d];
  const slots = [];
  for (let i = 0; i < marks.length - 1; i++) if (marks[i + 1] - marks[i] > 0.04) slots.push({ start: marks[i], len: +(marks[i + 1] - marks[i]).toFixed(3) });
  return slots;
}

// Fill each slot with your footage at the matching length. sources: [{ assetId, kind, duration }] in the order
// they sit on your timeline. Clips take turns, and each clip moves on to a fresh part each time it comes back.
export function fillSlots(slots, sources) {
  const usable = sources.filter((s) => s && (s.kind === 'photo' || s.duration > 0.1));
  if (!usable.length || !slots.length) return [];
  const used = new Map();   // assetId -> seconds already used
  const clips = [];
  slots.forEach((slot, i) => {
    // Start with the clip whose turn it is; skip clips too short for this slot when a longer one exists.
    let src = null;
    for (let k = 0; k < usable.length; k++) {
      const s = usable[(i + k) % usable.length];
      if (s.kind === 'photo' || s.duration >= slot.len) { src = s; break; }
    }
    let speed = 1;
    if (!src) {
      // Nothing is long enough: slow down the longest clip to fit (its own sound mutes, like any speed change).
      src = usable.reduce((a, b) => (b.duration > a.duration ? b : a));
      speed = Math.max(0.25, src.duration / slot.len);
    }
    let inT = 0, outT;
    if (src.kind === 'photo') { outT = slot.len; }
    else if (speed !== 1) { outT = src.duration; }
    else {
      const room = src.duration - slot.len;
      const at = used.get(src.assetId) || 0;
      inT = at <= room ? at : (at % (room + 1e-6));
      if (inT > room) inT = 0;
      outT = inT + slot.len;
      used.set(src.assetId, outT >= src.duration - 0.05 ? 0 : outT);
    }
    clips.push({ assetId: src.assetId, in: +inT.toFixed(3), out: +outT.toFixed(3), speed: +speed.toFixed(4), slot: i });
  });
  return clips;
}
