// Cake Walk: platform rules (Prompt 4).
// Reads the one PLATFORMS table in config.js: length rules, the live length guard, export options,
// Story parts and the SPEC CHECK. Shared by editor.js and export.js.

import { CONFIG } from './config.js';

export const PLATFORMS = CONFIG.PLATFORMS;
export const PLATFORM_KEYS = Object.keys(PLATFORMS);

// 75 -> "1:15", 3725 -> "1:02:05"
export function fmtLen(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

function range(r) { return r ? `${fmtLen(r[0])} to ${fmtLen(r[1])}` : ''; }

// The longest length allowed before export is blocked, for this platform, lane and Settings.
export function ceilingFor(key, lane, settings = {}) {
  const p = PLATFORMS[key];
  if (!p || p.cardMax) return Infinity;              // Story splits into parts instead
  const unlocked = p.longSetting && settings[p.longSetting];
  if (p.overLimit) {                                // Reels: over the limit is a lane decision
    const mode = p.overLimit[lane] || 'block';
    return mode === 'warn' || unlocked ? p.longMax : p.hardMax;
  }
  return unlocked ? p.longMax : p.hardMax;
}

// How a length sits for one platform.
// level: 'good' (in the target band), 'ok', 'warn' (amber, export still allowed) or 'block'.
export function lengthStatus(key, length, lane = 'PRO', settings = {}) {
  const p = PLATFORMS[key];
  if (!p) return { level: 'ok', text: '' };
  const L = length || 0;
  const name = p.label;
  if (L < (p.minSeconds || 0)) {
    return { level: 'block', text: `${name} needs at least ${fmtLen(p.minSeconds)}.`, short: true };
  }
  if (p.cardMax) {
    const parts = Math.max(1, Math.ceil(L / p.cardMax - 1e-9));
    return parts > 1
      ? { level: 'ok', text: `Exports as ${parts} Story cards, ${fmtLen(L / parts)} each.`, parts }
      : { level: 'good', text: `Fits one Story card (${fmtLen(p.cardMax)} max).`, parts: 1 };
  }
  const ceiling = ceilingFor(key, lane, settings);
  if (L > ceiling + 1e-6) {
    const unlockable = p.longSetting && !settings[p.longSetting] && ceiling < p.longMax;
    const why = p.overLimit && lane === 'PRO' && ceiling === p.hardMax
      ? `Over ${fmtLen(p.hardMax)} isn't shown to non-followers, so the PRO lane blocks it.`
      : `${name} allows up to ${fmtLen(ceiling)}.`;
    return {
      level: 'block', over: L - ceiling, trimTo: ceiling,
      text: `Over by ${fmtLen(L - ceiling)}. ${why}${unlockable ? ' Settings can unlock longer videos if your account has them.' : ''}`
    };
  }
  if (p.overLimit && L > p.hardMax + 1e-6) {
    return { level: 'warn', text: `Over ${fmtLen(p.hardMax)} isn't recommended to non-followers.`, trimTo: p.hardMax };
  }
  if (p.allowed && L > p.allowed[1] + 1e-6) {
    return { level: 'warn', text: `Longer than the ${fmtLen(p.allowed[1])} that works best for your content.`, trimTo: p.allowed[1] };
  }
  if (p.allowed && L < p.allowed[0] - 1e-6) {
    return { level: 'warn', text: `Shorter than the ${fmtLen(p.allowed[0])} that works best for your content.` };
  }
  if (p.target && L >= p.target[0] - 1e-6 && L <= p.target[1] + 1e-6) {
    return { level: 'good', text: `In the sweet spot (${range(p.target)}).` };
  }
  return { level: 'ok', text: p.target ? `Target ${range(p.target)}.` : `Fits ${name} (up to ${fmtLen(ceiling)}).` };
}

// "Creator Rewards length" badge: TikTok, 1:00 or longer, and only after Rewards eligible is on in Settings.
export function rewardsBadge(key, length, settings = {}) {
  const p = PLATFORMS[key];
  return !!(p?.rewardsMin && settings.rewardsEligible && length >= p.rewardsMin);
}

// ---------- Live length guard (editor) ----------

export function renderGuard(el, { platform, lane, length, settings }) {
  const p = PLATFORMS[platform] || PLATFORMS.tiktok;
  const st = lengthStatus(platform, length, lane, settings);
  const ceiling = ceilingFor(platform, lane, settings);
  const scaleMax = Math.max(length * 1.08, (p.allowed?.[1] || p.target?.[1] || p.cardMax || 60) * 1.15, 10);
  const pct = (v) => `${Math.max(0, Math.min(100, (v / scaleMax) * 100)).toFixed(2)}%`;

  el.className = `guard lvl-${st.level}`;
  el.innerHTML = `
    <div class="guard-top">
      <button class="pill pill-chrome" data-act="ed-platform" aria-label="Change platform"></button>
      <b class="guard-time"></b>
      <span class="guard-badge pill pill-green hidden">Creator Rewards length</span>
    </div>
    <div class="guard-meter" aria-hidden="true"><i class="g-band"></i><i class="g-limit"></i><i class="g-now"></i></div>
    <div class="guard-bottom"><span class="guard-msg"></span></div>`;
  el.querySelector('[data-act="ed-platform"]').textContent = `${p.label} ▾`;
  el.querySelector('.guard-time').textContent = fmtLen(length);
  el.querySelector('.guard-msg').textContent = st.text;
  const band = el.querySelector('.g-band');
  if (p.target) { band.style.left = pct(p.target[0]); band.style.width = `calc(${pct(p.target[1])} - ${pct(p.target[0])})`; }
  else band.remove();
  const lim = el.querySelector('.g-limit');
  const limitAt = p.overLimit ? p.hardMax : ceiling;
  if (Number.isFinite(limitAt) && limitAt <= scaleMax) lim.style.left = pct(limitAt); else lim.remove();
  el.querySelector('.g-now').style.left = pct(length);
  if (rewardsBadge(platform, length, settings)) el.querySelector('.guard-badge').classList.remove('hidden');
  if (st.level === 'block' && st.trimTo) {
    const b = document.createElement('button');
    b.className = 'btn btn-main btn-sm';
    b.dataset.act = 'ed-autotrim';
    b.dataset.to = String(st.trimTo);
    b.textContent = `Trim to ${fmtLen(st.trimTo)}`;
    el.querySelector('.guard-bottom').appendChild(b);
  }
  return st;
}

// Green band and amber limit line drawn on the timeline itself.
export function timelineGuides({ platform, lane, settings }) {
  const p = PLATFORMS[platform];
  if (!p) return { band: null, limit: null };
  const ceiling = ceilingFor(platform, lane, settings);
  const limit = p.overLimit ? p.hardMax : ceiling;
  return { band: p.target || null, limit: Number.isFinite(limit) ? limit : null };
}

// Cut the timeline down to `to` seconds by trimming from the end. Returns true if anything changed.
export function trimProjectTo(project, to, clipLen) {
  let tl = 0;
  const keep = [];
  for (const c of project.clips) {
    const len = clipLen(c);
    if (tl >= to - 1e-6) break;
    if (tl + len > to + 1e-6) {
      const room = to - tl;
      if (room < CONFIG.EDITOR.MIN_CLIP) break;
      keep.push({ ...c, out: c.in + room * c.speed });
      tl = to;
      break;
    }
    keep.push(c);
    tl += len;
  }
  const changed = keep.length !== project.clips.length || keep.some((c, i) => c.out !== project.clips[i].out);
  if (changed) project.clips = keep;
  return changed;
}

// ---------- Export options ----------

// Never upscale and never go above the clips' frame rate.
export function sourceLimits(segs) {
  const vids = segs.map((s) => s.asset).filter((a) => a && a.kind === 'video');
  const photos = segs.map((s) => s.asset).filter((a) => a && a.kind === 'photo');
  const sides = [...vids, ...photos].map((a) => Math.min(a.width || 0, a.height || 0)).filter(Boolean);
  const shortSide = sides.length ? Math.max(...sides) : 1080;
  const fps = vids.length ? Math.max(...vids.map((a) => a.fps || 30)) : 30;
  return { shortSide, fps };
}

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

// Every export row for the chosen frame rate. Each row: platform, format, size, bitrate, why it's unavailable.
export function exportRows({ segs, length, lane, settings = {}, caps = null, fps = 30, max = false }) {
  const lim = sourceLimits(segs);
  const rows = [];
  for (const key of PLATFORM_KEYS) {
    const p = PLATFORMS[key];
    const status = lengthStatus(key, length, lane, settings);
    for (const f of p.formats) {
      const scale = Math.min(1, lim.shortSide / Math.min(f.width, f.height));
      const width = even(f.width * scale), height = even(f.height * scale);
      const rate = fps > 30 ? 60 : 30;
      const realFps = rate === 60 ? Math.min(60, Math.round(lim.fps)) : 30;
      const bitrate = (max ? f.maxBitrate : f.bitrate)[rate];
      let unavailable = '';
      if (f.needsCap) {
        const capKey = f.needsCap[rate];
        const r = caps?.results?.[capKey];
        if (r && r.ok === false) unavailable = `This iPhone didn't pass the ${rate} fps 4K check.`;
        else if (!r) unavailable = 'Needs the capability check first (Settings, Debug).';
        else if (scale < 1) unavailable = 'Needs 4K clips. Cake Walk never upscales.';
      }
      if (realFps < p.fps[0] || realFps > p.fps[1]) unavailable ||= `${p.label} takes ${p.fps[0]} to ${p.fps[1]} fps.`;
      if (status.level === 'block') unavailable ||= status.text;
      rows.push({
        id: `${key}:${f.key}`, platform: key, platformLabel: p.label, format: f.key, label: f.label, ratio: f.ratio,
        width, height, fps: realFps, bitrate, audioBitrate: p.audioBitrate || 256000,
        upscaleAvoided: scale < 1 && !f.needsCap, unavailable, status,
        parts: p.cardMax ? Math.max(1, Math.ceil(length / p.cardMax - 1e-9)) : 1,
        codecString: CONFIG.EXPORT.codecFor(width, height, realFps)
      });
    }
  }
  return rows;
}

// Rows that would make byte-identical files share one export (for example TikTok, Reels and Shorts at 9:16).
export function groupRows(rows) {
  const groups = new Map();
  for (const r of rows) {
    const sig = r.parts > 1 ? `${r.id}` : `${r.width}x${r.height}@${r.fps}:${r.bitrate}:${r.audioBitrate}`;
    if (!groups.has(sig)) groups.set(sig, { ...r, members: [] });
    groups.get(sig).members.push(r);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    tag: `${g.members.map((m) => m.format).join('_')}_${g.width}x${g.height}_${g.fps}fps`,
    labels: g.members.map((m) => m.label).join(' + ')
  }));
}

// Equal Story parts: [[start, end], ...]
export function storyRanges(length, cardMax) {
  const n = Math.max(1, Math.ceil(length / cardMax - 1e-9));
  const each = length / n;
  return Array.from({ length: n }, (_, i) => [i * each, i === n - 1 ? length : (i + 1) * each]);
}

// ---------- SPEC CHECK ----------
// facts: what the worker read back from the finished file. expected: the row it was made for.

export function specCheck(facts, expected) {
  const fails = [];
  const notes = [];
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  if (!facts || !facts.video) return { pass: false, fails: ['The file has no video track.'], notes };
  const v = facts.video;
  if (v.width !== expected.width || v.height !== expected.height) fails.push(`Size is ${v.width} x ${v.height}, expected ${expected.width} x ${expected.height}.`);
  const ratioWant = expected.width / expected.height, ratioGot = v.width / v.height;
  if (!near(ratioWant, ratioGot, 0.01)) fails.push(`Shape is ${ratioGot.toFixed(3)}, expected ${expected.ratio}.`);
  if (!v.fps || !near(v.fps, expected.fps, 0.6)) fails.push(`Frame rate reads ${v.fps ? v.fps.toFixed(2) : 'unknown'}, expected ${expected.fps}.`);
  const p = PLATFORMS[expected.platform];
  if (p && v.fps && (v.fps < p.fps[0] - 0.5 || v.fps > p.fps[1] + 0.5)) fails.push(`${p.label} takes ${p.fps[0]} to ${p.fps[1]} fps.`);
  if (!near(facts.duration, expected.duration, 1 / expected.fps + 0.08)) fails.push(`Length is ${facts.duration.toFixed(2)}s, expected ${expected.duration.toFixed(2)}s.`);
  if (v.codec !== 'avc') fails.push(`Video codec is ${v.codec}, expected H.264.`);
  const prof = /^avc[13]\.([0-9a-f]{2})/i.exec(v.codecString || '');
  if (!prof) fails.push('Could not read the H.264 profile.');
  else if (prof[1].toLowerCase() !== '64') fails.push(`H.264 profile is ${parseInt(prof[1], 16)}, expected High (100).`);
  const cs = v.colorSpace || {};
  if (cs.primaries !== 'bt709' || cs.matrix !== 'bt709' || cs.transfer !== 'bt709') {
    fails.push(`Color tag reads ${cs.primaries || 'none'} / ${cs.transfer || 'none'} / ${cs.matrix || 'none'}, expected BT.709.`); // VERIFY what iOS writes
  }
  if (!facts.fastStart) fails.push('Fast start is missing (the index is at the end of the file).');
  if (facts.maxKeyGap == null) fails.push('Could not read the keyframes.');
  else if (facts.maxKeyGap > CONFIG.EXPORT.KEYFRAME_SECONDS + 1 / expected.fps + 0.02) fails.push(`Keyframes are up to ${facts.maxKeyGap.toFixed(2)}s apart, expected ${CONFIG.EXPORT.KEYFRAME_SECONDS}s.`);
  if (!facts.audio) fails.push('No audio track.');
  else {
    if (facts.audio.codec !== 'aac') fails.push(`Audio codec is ${facts.audio.codec}, expected AAC.`);
    if (facts.audio.sampleRate !== 48000) fails.push(`Audio is ${facts.audio.sampleRate} Hz, expected 48 kHz.`);
    if (facts.audio.codecString && facts.audio.codecString !== 'mp4a.40.2') fails.push(`Audio is ${facts.audio.codecString}, expected AAC-LC (mp4a.40.2).`);
  }
  if (p && !p.cardMax) {
    const ceil = ceilingFor(expected.platform, expected.lane, expected.settings);
    if (facts.duration > ceil + 0.5) fails.push(`Longer than ${p.label}'s ${fmtLen(ceil)} limit.`);
  }
  if (p?.cardMax && facts.duration > p.cardMax + 0.5) fails.push(`Longer than one ${fmtLen(p.cardMax)} Story card.`);
  if (facts.size > CONFIG.BIG_FILE_BYTES) notes.push('Over 300 MB: may be slow or fail in the share sheet. Consider Save Video, then upload from Photos.');
  return { pass: fails.length === 0, fails, notes };
}

// Pick the target platform for a project (editor). Returns the key, or null if closed without a change.
export async function platformSheet(ui, current) {
  const body = document.createElement('div');
  body.className = 'stack';
  let chosen = null;
  for (const key of PLATFORM_KEYS) {
    const p = PLATFORMS[key];
    const b = document.createElement('button');
    b.className = `list-btn plat${key === current ? ' on' : ''}`;
    const rule = p.cardMax ? `${fmtLen(p.cardMax)} per card, longer splits into parts`
      : `${p.target ? `Target ${range(p.target)}, ` : ''}up to ${fmtLen(p.hardMax)}`;
    b.innerHTML = '<b></b><small class="muted"></small>';
    b.querySelector('b').textContent = p.label;
    b.querySelector('small').textContent = ` ${rule} · rules checked ${p.checked}`;
    b.addEventListener('click', () => { chosen = key; document.querySelector('#sheet-root .sheet-backdrop')?.click(); });
    body.appendChild(b);
  }
  await ui.sheet({ title: 'Made for', body, actions: [{ label: 'Close', value: false }] });
  return chosen && chosen !== current ? chosen : null;
}
