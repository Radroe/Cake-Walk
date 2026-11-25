// Cake Walk: EDITING HELPERS (Prompt 8). Three quick checks from the editor's More tools:
// HOOK CHECK: are the first 2 seconds dark, static, or missing text? Offers a fix for each.
// PACING GUIDE: average shot length against a target (PRO, digitals and walks, or every beat).
// LOOP HELPER: the first and last frames side by side, with how closely they match.
// Frames come from the Worker (frames.grab), drawn with each clip's framing and color, so they match the export.

import { WORKER } from './storage.js';
import { DEBUG } from './debug.js';
import { frameFor, moveFrame, colorFor, TEXT_DEFAULT } from './look.js';
import { frameDiff } from './rhythm.js';
import { layout, totalLength } from './player.js';
import { templateById } from './templates.js';

const $ = (sel, root = document) => root.querySelector(sel);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const s1 = (x) => `${(+x).toFixed(1)}s`;

// Thresholds, tuned on test clips. // VERIFY on real iPhone footage.
export const HOOK = {
  SECONDS: 2,
  DARK: 0.2,        // average brightness (0 to 1) below this reads as dark on a phone
  STILL: 0.035,     // the biggest change between samples below this reads as static
  SAMPLES: [0, 0.5, 1, 1.5, 1.95]
};
export const LOOP = { GOOD: 0.85, CLOSE: 0.65 };   // match scores. // VERIFY

// What to draw for the picture at time T of the timeline: the clip, the time inside it, framing and color.
export function frameItem(project, T) {
  const segs = layout(project);
  const seg = segs.find((s) => T >= s.start && T < s.end) || segs[segs.length - 1];
  if (!seg?.asset) return null;
  const c = seg.clip;
  const local = Math.max(0, Math.min(seg.end, T) - seg.start);
  const progress = local / Math.max(0.001, seg.end - seg.start);
  return {
    path: seg.asset.path,
    kind: seg.asset.kind,
    t: seg.asset.kind === 'photo' ? 0 : Math.min(c.out - 0.02, c.in + local * c.speed),
    frame: moveFrame(frameFor(c, '9:16'), c.move, progress),
    color: colorFor(c.color, project.grade, project.lane),
    seg
  };
}

async function grab(project, times, jpeg = false) {
  const items = times.map((T) => frameItem(project, T));
  const res = await WORKER.call('frames.grab', {
    items: items.map((x) => (x ? { path: x.path, kind: x.kind, t: x.t, frame: x.frame, color: x.color } : null)),
    width: 180, height: 320, jpeg
  }, [], 90000);
  return { items, res };
}

function busy(ui, text) {
  const box = el('div', 'sheet-backdrop');
  box.innerHTML = '<div class="sheet"><div class="sheet-grab"></div><p class="label">Helper</p><h2></h2><div class="bar bar-busy"><i></i></div></div>';
  $('h2', box).textContent = text;
  $('#sheet-root')?.appendChild(box);
  return () => box.remove();
}

function line(ok, title, detail) {
  const li = el('li', `hp-line ${ok ? 'ok' : 'warn'}`);
  li.append(el('span', 'hp-mark', ok ? '✓' : '!'), el('b', null, title));
  if (detail) li.appendChild(el('small', 'muted', detail));
  return li;
}

// ---------- Hook check ----------

// The scoring, without the Worker or the DOM, so it can be tested. frames: [{ mean, y, hist } | null].
export function scoreHook(project, frames) {
  const total = totalLength(project);
  const end = Math.min(HOOK.SECONDS, total);
  const segs = layout(project);
  const read = frames.filter(Boolean);
  const mean = read.length ? read.reduce((a, f) => a + f.mean, 0) / read.length : null;
  let change = 0;
  for (let i = 1; i < frames.length; i++) if (frames[i] && frames[i - 1]) change = Math.max(change, frameDiff(frames[i - 1], frames[i]));
  const cut = segs.some((s, i) => i > 0 && s.start > 0.05 && s.start < end && s.clip.assetId !== segs[i - 1].clip.assetId);
  const push = segs.some((s) => s.start < end && s.clip.move === 'pushin');
  const text = (project.texts || []).some((x) => String(x.text || '').trim() && (x.start || 0) < end && (x.end ?? Infinity) > 0);
  return {
    read: read.length > 0,
    dark: mean != null && mean < HOOK.DARK,
    mean,
    still: read.length > 1 && change < HOOK.STILL && !cut && !push,
    change, cut, push, text
  };
}

// api: { ui, project, remember(), changed(), select(clipId), showStyle(name) }
export async function hookCheck(api) {
  const { ui, project } = api;
  if (!project.clips.length) { ui.toast('Add a clip first.'); return; }
  const total = totalLength(project);
  const times = HOOK.SAMPLES.filter((x) => x < total);
  const done = busy(ui, 'Checking your first 2 seconds');
  let r;
  try {
    const { res } = await grab(project, times.length ? times : [0]);
    r = scoreHook(project, res);
  } catch (err) {
    DEBUG.log('warn', `Hook check: ${err.message}`, 'helpers');
    r = scoreHook(project, []);
  } finally { done(); }
  DEBUG.log('info', `Hook check: mean ${r.mean?.toFixed(3) ?? 'n/a'} change ${r.change.toFixed(3)} cut ${r.cut} push ${r.push} text ${r.text}`, 'helpers');
  const body = el('div');
  const ul = el('ul', 'hp-list');
  const first = project.clips[0];
  if (!r.read) ul.appendChild(line(false, 'Couldn\'t read the picture', 'The first clip couldn\'t be opened, so brightness and motion weren\'t checked.'));
  else {
    ul.appendChild(line(!r.dark, r.dark ? 'Dark' : 'Bright enough', r.dark ? 'The opening reads dark on a phone. Brighten it in Color.' : null));
    ul.appendChild(line(!r.still, r.still ? 'Static' : 'Moves', r.still
      ? 'Nothing moves in the first 2 seconds. Add a push-in, start on movement, or cut sooner.'
      : r.cut ? 'There\'s a cut in the first 2 seconds.' : r.push ? 'The push-in keeps it moving.' : null));
  }
  ul.appendChild(line(r.text, r.text ? 'Has text' : 'No text', r.text ? null : 'A short text hook in the first 2 seconds tells people why to stay, even with the sound off.'));
  const issues = (r.read ? [r.dark, r.still] : [true]).filter(Boolean).length + (r.text ? 0 : 1);
  body.appendChild(el('p', 'small', issues ? `${issues === 1 ? 'One thing' : `${issues} things`} to fix in your opening.` : 'Your opening has light, movement and text. Nice hook.'));
  body.appendChild(ul);
  // Fixes as full-width rows, so all of them fit on a phone.
  const fixes = [];
  if (!r.text) fixes.push(['text', 'Add hook text']);
  if (r.read && r.still && first) fixes.push(['push', 'Add a push-in to the first clip']);
  if (r.read && r.dark) fixes.push(['color', 'Brighten in Color']);
  let pick = null;
  if (fixes.length) {
    body.appendChild(el('p', 'label', 'Fix it'));
    fixes.forEach(([value, label]) => {
      const b = el('button', 'list-btn', label);
      b.type = 'button';
      b.addEventListener('click', () => { pick = value; b.closest('.sheet-backdrop')?.click(); });
      body.appendChild(b);
    });
  }
  await ui.sheet({ title: 'Hook check', body, actions: [{ label: 'Done', value: true, main: true }] });
  if (pick === 'text') {
    api.remember();
    const style = project.lane === 'CREATIVE' ? 'bubble' : 'clean';
    const item = { ...TEXT_DEFAULT, id: crypto.randomUUID(), text: 'Your hook here', style, y: 0.3, size: 0.055, start: 0, end: +Math.min(HOOK.SECONDS + 1, total).toFixed(3) };
    project.texts.push(item);
    api.changed();
    api.showStyle('text', { text: item.id });
  } else if (pick === 'color') {
    api.select(first.id);
    api.showStyle('color');
  } else if (pick === 'push') {
    api.remember();
    first.move = 'pushin';
    api.changed();
    ui.toast('Push-in on your first clip. Turn it off in Reframe.');
  }
}

// ---------- Pacing guide ----------

export const PACES = {
  pro: { label: 'PRO 1.5 to 3s', min: 1.5, max: 3 },
  model: { label: 'Digitals and walks 2 to 6s', min: 2, max: 6 },
  beat: { label: 'Every beat', beat: true }
};

// Which target fits this project: its template's pace, or PRO.
export function paceFor(project) {
  const t = templateById(project.template?.id);
  if (t?.pace === 'model') return 'model';
  if (t?.pace === 'beat' || t?.beat) return 'beat';
  return 'pro';
}

// The numbers, without the DOM. beats: your song's beat times or null.
export function scorePace(project, key, beats = null) {
  const segs = layout(project);
  const lens = segs.map((s) => s.end - s.start);
  const total = lens.reduce((a, x) => a + x, 0);
  const avg = lens.length ? total / lens.length : 0;
  const p = PACES[key];
  const out = { shots: lens.length, avg, total, key };
  if (p.beat) {
    const gaps = [];
    for (let i = 1; i < (beats || []).length; i++) gaps.push(beats[i] - beats[i - 1]);
    gaps.sort((a, b) => a - b);
    const interval = gaps.length ? gaps[gaps.length >> 1] : 0.5;
    out.interval = interval;
    out.hasBeats = (beats || []).length >= 4;
    const cuts = segs.slice(1).map((s) => s.start);
    if (out.hasBeats) {
      const near = (x) => beats.some((b) => Math.abs(b - x) <= 0.06);
      out.onBeat = cuts.filter(near).length;
    }
    out.cuts = cuts.length;
    out.min = interval * 0.75;
    out.max = interval * 2.25;   // a cut every beat or two
  } else { out.min = p.min; out.max = p.max; }
  out.verdict = !lens.length ? 'empty' : avg < out.min ? 'fast' : avg > out.max ? 'slow' : 'good';
  return out;
}

// api: { ui, project, beats() -> Promise<beats|null> }
export async function pacingGuide(api) {
  const { ui, project } = api;
  if (!project.clips.length) { ui.toast('Add a clip first.'); return; }
  let key = paceFor(project);
  let beats = null;
  const a = project.music && project.assets[project.music.assetId];
  if (Array.isArray(a?.beats)) beats = a.beats;
  const body = el('div');
  const res = el('div');
  const draw = () => {
    const r = scorePace(project, key, beats);
    res.innerHTML = '';
    const big = el('p', 'hp-big');
    big.append(el('b', null, s1(r.avg)), el('span', 'muted', ` average shot · ${r.shots} shots`));
    res.appendChild(big);
    // The range bar: 0 to 8 seconds, the target band in pink, your average as a mark.
    const scale = Math.max(8, r.avg * 1.2, r.max * 1.2);
    const bar = el('div', 'hp-range');
    const band = el('i', 'hp-band');
    band.style.left = `${(r.min / scale) * 100}%`;
    band.style.width = `${((r.max - r.min) / scale) * 100}%`;
    const mark = el('b', `hp-dot ${r.verdict}`);
    mark.style.left = `${Math.min(100, (r.avg / scale) * 100)}%`;
    bar.append(band, mark);
    res.appendChild(bar);
    const say = {
      good: 'Right in range.',
      fast: 'Faster than the target. Let your best shots breathe a little longer.',
      slow: 'Slower than the target. Trim or split your longer shots.',
      empty: 'Add clips to see your pacing.'
    }[r.verdict];
    res.appendChild(el('p', 'small', `Target ${PACES[key].beat ? `${s1(r.min)} to ${s1(r.max)} (a cut every beat or two)` : `${s1(r.min)} to ${s1(r.max)}`}. ${say}`));
    if (PACES[key].beat) {
      if (r.hasBeats) res.appendChild(el('p', 'small', `${r.onBeat} of ${r.cuts} cuts land on your song's beat (one beat is ${s1(r.interval)}).`));
      else res.appendChild(el('p', 'muted small', project.music ? 'Your song\'s beat isn\'t found yet. Tap Find the beat.' : 'Add your song in Music to check cuts against its beat. This uses 120 BPM until then.'));
    }
  };
  const chips = el('div', 'chips');
  Object.entries(PACES).forEach(([k, p]) => {
    const b = el('button', `chip${k === key ? ' on' : ''}`, p.label);
    b.type = 'button';
    b.addEventListener('click', () => { key = k; chips.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
    chips.appendChild(b);
  });
  body.append(el('p', 'label', 'Target'), chips, res);
  draw();
  for (;;) {
    const needBeats = PACES[key].beat && project.music && !beats;
    const pick = await ui.sheet({ title: 'Pacing guide', body, actions: needBeats ? [{ label: 'Find the beat', value: 'beat' }, { label: 'Done', value: null, main: true }] : [{ label: 'Done', value: null, main: true }] });
    if (pick !== 'beat') break;
    beats = await api.beats();
    draw();
  }
}

// ---------- Loop helper ----------

export async function loopHelper(api) {
  const { ui, project } = api;
  const total = totalLength(project);
  if (!project.clips.length || total < 0.2) { ui.toast('Add a clip first.'); return; }
  const done = busy(ui, 'Grabbing your first and last frames');
  let r = null;
  try { r = await grab(project, [0, Math.max(0, total - 0.04)], true); }
  catch (err) { DEBUG.log('warn', `Loop helper: ${err.message}`, 'helpers'); }
  finally { done(); }
  const [a, b] = r?.res || [];
  const body = el('div');
  const urls = [];
  const pair = el('div', 'hp-pair');
  [['First frame', a], ['Last frame', b]].forEach(([label, f]) => {
    const fig = el('figure');
    if (f?.blob) { const img = el('img'); const u = URL.createObjectURL(f.blob); urls.push(u); img.src = u; img.alt = label; fig.appendChild(img); }
    else fig.appendChild(el('div', 'hp-noframe', 'Couldn\'t read'));
    fig.appendChild(el('figcaption', 'small', label));
    pair.appendChild(fig);
  });
  body.appendChild(pair);
  if (a && b) {
    const match = Math.max(0, 1 - frameDiff(a, b));
    const pct = Math.round(match * 100);
    const say = match >= LOOP.GOOD ? 'These match, so the video loops smoothly.'
      : match >= LOOP.CLOSE ? 'Close. Line up the pose or framing a little more for a seamless loop.'
        : 'These don\'t match yet. End on the same pose, spot and framing you open with, so the replay feels seamless.';
    body.appendChild(el('p', 'hp-big', `${pct}% match`));
    body.appendChild(el('p', 'small', say));
    DEBUG.log('info', `Loop helper: match ${match.toFixed(3)}`, 'helpers');
  } else body.appendChild(el('p', 'small', 'One of the frames couldn\'t be read, so there\'s no match score.'));
  body.appendChild(el('p', 'muted small', 'Text and stickers aren\'t shown here, only the picture.'));
  await ui.sheet({ title: 'Loop helper', body, actions: [{ label: 'Done', value: true, main: true }] });
  urls.forEach((u) => URL.revokeObjectURL(u));
}

