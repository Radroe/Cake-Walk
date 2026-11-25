// Cake Walk: REMIX (Prompt 7). Copy the editing and timing of a video you like.
// A recipe holds only timing: where the cuts land, the beat, and a link back to the original. The reference video
// stays in Cake Walk's storage with its recipe (for the preview, the guide sound and analyzing again) until you
// delete the recipe or clean it up in Storage. Nothing from the reference ever goes into an export.

import { PROJECTS, RECIPES, OPFS, WORKER, UNDO, SAVE, SESSION } from './storage.js';
import { DEBUG } from './debug.js';
import { slotsOf, fillSlots, snap, cleanTimes } from './rhythm.js';

const $ = (sel, root = document) => root.querySelector(sel);
const uid = () => crypto.randomUUID();
const PX = 64;               // recipe timeline: pixels per second
const TAP_LATENCY = 0.08;    // seconds taken off each tap, for the time between hearing and tapping // VERIFY on iPhone
const HISTORY = 60;

// Parts of the frame to watch when finding cuts, so the app's buttons, captions and bars don't count as cuts.
// Fractions of the width and height. // VERIFY against real screen recordings; apps move their buttons.
export const CROPS = [
  { key: 'tiktok', label: 'TikTok or Reels', c: { x0: 0.03, y0: 0.09, x1: 0.83, y1: 0.74 } },
  { key: 'story', label: 'Story', c: { x0: 0, y0: 0.12, x1: 1, y1: 0.86 } },
  { key: 'shorts', label: 'Shorts', c: { x0: 0.03, y0: 0.08, x1: 0.84, y1: 0.78 } },
  { key: 'whole', label: 'Whole frame', c: { x0: 0, y0: 0, x1: 1, y1: 1 } }
];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function btn(label, cls = 'btn btn-ghost', onClick) {
  const b = el('button', cls, label);
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
export function fmtT(s) {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
}
function pick(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    input.addEventListener('cancel', () => { resolve(null); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}
function extOf(file) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(file.name || '');
  if (m) return m[1].toLowerCase();
  return /quicktime/.test(file.type) ? 'mov' : /mp4/.test(file.type) ? 'mp4' : /mpeg|mp3/.test(file.type) ? 'mp3' : /m4a|aac/.test(file.type) ? 'm4a' : 'bin';
}
// Only plain web links are kept, and they only ever open in Safari when you tap Open.
export function cleanLink(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  try {
    const u = new URL(t);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch { return null; }
}
function chipRow(items, current, onPick) {
  const wrap = el('div', 'chips');
  items.forEach(([value, label]) => {
    const b = el('button', `chip${value === current ? ' on' : ''}`, label);
    b.dataset.value = value;
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
      onPick(value);
    });
    wrap.appendChild(b);
  });
  return wrap;
}
function progressOverlay(title, note) {
  const box = el('div', 'sheet-backdrop');
  box.innerHTML = '<div class="sheet"><div class="sheet-grab"></div><p class="label">Remix</p><h2></h2><div class="bar"><i></i></div><p class="muted small"></p><div class="row"><button class="btn btn-ghost">Cancel</button></div></div>';
  $('h2', box).textContent = title;
  $('p.small', box).textContent = note || '';
  $('#sheet-root').appendChild(box);
  return {
    set(f, label) { $('.bar i', box).style.width = `${Math.round(f * 100)}%`; if (label) $('h2', box).textContent = label; },
    onCancel(fn) { $('.row .btn', box).addEventListener('click', fn); },
    close() { box.remove(); }
  };
}
async function fileExists(path) {
  if (!path) return false;
  try { await OPFS.file(path); return true; } catch { return false; }
}

// ---------- Screen state ----------

let ui = null;
let main = null;
let target = null;      // the project to apply to, when you came from its More menu
let S = null;           // the open recipe view

export function closeRemix() {
  if (!S) return;
  S.closed = true;
  cancelAnimationFrame(S.raf);
  S.media?.forEach((m) => { m.pause(); m.removeAttribute('src'); m.load(); });
  S.urls.forEach((u) => URL.revokeObjectURL(u));
  if (S.job) WORKER.call('remix.cancel', { job: S.job }).catch(() => {});
  S.offEvent?.();
  S = null;
}

// params.id: the project to apply a recipe to. params.recipe: a recipe to open.
export async function renderRemix(container, uiApi, params = {}) {
  ui = uiApi;
  main = container;
  closeRemix();
  target = params.id ? await PROJECTS.get(params.id).catch(() => null) : null;
  if (params.recipe && (await RECIPES.get(params.recipe))) return openRecipe(params.recipe);
  return listView();
}

function noteSession(recipeId) {
  SESSION.set({ screen: 'remix', params: target ? { id: target.id } : {}, recipe: recipeId || null });
}

// ---------- Recipe list ----------

async function listView() {
  closeRemix();
  noteSession(null);
  main.innerHTML = '';
  const wrap = el('section');
  const head = el('header', 'screen-head');
  head.append(el('p', 'label', 'Remix'), el('h1', null, 'Copy the timing of a video you like'));
  wrap.appendChild(head);
  wrap.appendChild(el('p', 'note', 'A recipe copies only the timing: where the cuts land and the beat. Your video is made from your own clips and sound.'));
  if (target) {
    const card = el('div', 'card rx-target');
    card.append(el('p', 'label', 'Applying to'), el('b', null, target.name));
    wrap.appendChild(card);
  }
  wrap.appendChild(btn('New recipe', 'btn btn-main wide', () => newRecipe()));
  const list = el('div', 'rx-list');
  wrap.appendChild(list);
  main.appendChild(wrap);
  const all = await RECIPES.list();
  if (!all.length) {
    list.appendChild(ui.emptyState('No recipes yet.', 'Save the video you like (or screen record it), then tap New recipe.'));
    return;
  }
  for (const r of all) {
    const card = el('button', 'card project');
    const grow = el('div', 'grow');
    grow.append(el('h3', null, r.name), el('p', 'muted small', summary(r)));
    card.appendChild(grow);
    card.addEventListener('click', () => openRecipe(r.id));
    list.appendChild(card);
  }
}

function summary(r) {
  const shots = slotsOf(r).length;
  const bits = [`${shots} shot${shots === 1 ? '' : 's'}`, fmtT(r.duration)];
  if (r.beats.length) bits.push(r.bpm ? `${Math.round(r.bpm)} BPM` : `${r.beats.length} beats`);
  if (!r.refPath) bits.push('timing only');
  return bits.join(' · ');
}

// ---------- New recipe: a link, then the saved video ----------

async function newRecipe() {
  const body = el('div');
  body.innerHTML = '<label class="field"><span>Name</span><input autocomplete="off" autocapitalize="sentences" placeholder="Like: Fast outfit cuts"></label>'
    + '<label class="field"><span>Link to the video (optional)</span><input type="url" inputmode="url" autocomplete="off" autocapitalize="off" placeholder="Paste the link"></label>'
    + '<p class="note">Next, pick the saved copy or a screen recording of it from Photos or Files. Only its timing is used.</p>';
  const [nameIn, linkIn] = body.querySelectorAll('input');
  const go = await ui.sheet({ title: 'New recipe', body, actions: [{ label: 'Cancel', value: false }, { label: 'Pick the video', value: true, main: true }] });
  if (!go) return;
  let link = cleanLink(linkIn.value);
  if (link === null) { ui.toast('That doesn\'t look like a link, so I left it off.'); link = ''; }
  const file = await pick('video/*');
  if (!file) return;
  const id = uid();
  const recipe = await importReference({ id, name: nameIn.value.trim() || `Recipe ${new Date().toLocaleDateString()}`, link }, file);
  if (recipe) openRecipe(recipe.id, { fresh: true });
}

// Copy the reference into Cake Walk (refs/) and read its details. Used for new recipes and "Import it again".
async function importReference(base, file) {
  const path = `refs/${base.id}.${extOf(file)}`;
  const ctrl = new AbortController();
  const panel = progressOverlay('Bringing in the video', 'Kept with this recipe until you delete it. Only its timing is used.');
  panel.onCancel(() => ctrl.abort());
  try {
    await OPFS.copyIn(file, path, { signal: ctrl.signal, onProgress: (f) => panel.set(f * 0.9) });
    const info = await WORKER.call('clip.probe', { path, type: file.type || '' }, [], 60000);
    if (info.kind !== 'video' || !info.canDecode) throw new Error(info.kind === 'video' ? 'This iPhone can\'t read that video' : 'That file has no video');
    panel.set(1);
    const old = await RECIPES.get(base.id);
    const recipe = {
      cuts: [], beats: [], bpm: null, beatSource: 'reference', beatPath: null, crop: { ...CROPS[0].c }, cropKey: 'tiktok', createdAt: Date.now(),
      ...(old || {}), ...base,
      refPath: path, refName: file.name || 'video', refSize: info.size, duration: info.duration,
      width: info.width, height: info.height, hasAudio: !!info.hasAudio
    };
    if (old?.refPath && old.refPath !== path) await OPFS.remove(old.refPath).catch(() => {});
    await RECIPES.save(recipe, { now: true });
    DEBUG.log('info', `Remix: reference imported, ${Math.round(info.duration)}s`, 'remix');
    if (info.duration > 180) ui.toast(`It's ${Math.round(info.duration / 60)} minutes long, so finding the timing can take a few minutes. A shorter clip of it works too.`, { ms: 5000 });
    return recipe;
  } catch (err) {
    await OPFS.remove(path).catch(() => {});
    if (err.name !== 'AbortError') {
      DEBUG.log('error', `Remix import: ${err.message}`, 'remix');
      ui.toast(/space|quota/i.test(err.message) ? 'Not enough space. Free some up in Storage.' : 'That video didn\'t work. Try a screen recording of it.');
    }
    return null;
  } finally {
    panel.close();
  }
}

// ---------- Recipe view ----------

async function openRecipe(id, { fresh = false } = {}) {
  closeRemix();
  const recipe = await RECIPES.get(id);
  if (!recipe) return listView();
  noteSession(id);
  S = { recipe, urls: [], media: [], history: [], sel: null, snap: recipe.snap ?? false, raf: 0, job: null, closed: false, thumbs: [] };
  const hasRef = await fileExists(recipe.refPath);
  if (!hasRef && recipe.refPath) recipe.refPath = null;
  main.innerHTML = '';
  const view = el('section', 'rx');
  S.view = view;
  main.appendChild(view);

  // Head
  const head = el('div', 'rx-head');
  head.append(
    btn('‹ Recipes', 'btn btn-ghost btn-sm', () => listView()),
    el('div', 'grow'),
    btn('Rename', 'btn btn-ghost btn-sm', () => renameRecipe()),
    btn('Delete recipe', 'btn btn-ghost btn-sm danger', () => deleteRecipe())
  );
  view.appendChild(head);
  const title = el('h1', 'rx-title', recipe.name);
  S.titleEl = title;
  view.appendChild(title);
  view.appendChild(linkRow());

  if (target) {
    const t = el('p', 'note', `When it looks right, tap Use this timing to fill ${target.name} with your clips.`);
    view.appendChild(t);
  }

  if (hasRef) {
    view.appendChild(await stageBlock());
  } else {
    const card = el('div', 'card');
    card.append(el('p', 'label', 'Reference video'), el('p', 'muted small', 'The video isn\'t stored here (it was cleaned up, or this recipe came from a backup). The timing still works. Import it again to watch it, hear it, analyze it or tap along.'));
    card.appendChild(btn('Import it again', 'btn btn-ghost', async () => {
      const file = await pick('video/*');
      if (!file) return;
      if (await importReference({ id: recipe.id }, file)) openRecipe(recipe.id);
    }));
    view.appendChild(card);
  }
  if (hasRef) view.appendChild(cropBlock());
  if (hasRef) view.appendChild(analyzeBlock(fresh));
  view.appendChild(timelineBlock());
  view.appendChild(applyBlock());
  renderTimeline();
  if (hasRef) loadThumbs();
}

function linkRow() {
  const r = S.recipe;
  const row = el('div', 'rx-link');
  if (r.link) {
    row.append(el('span', 'muted small wrap', r.link), btn('Open', 'btn btn-ghost btn-sm', () => window.open(r.link, '_blank', 'noopener')));
  }
  row.appendChild(btn(r.link ? 'Change' : 'Add the link', 'btn btn-ghost btn-sm', async () => {
    const body = el('label', 'field');
    body.innerHTML = '<span>Link</span><input type="url" inputmode="url" autocomplete="off" autocapitalize="off">';
    const input = $('input', body);
    input.value = r.link || '';
    const ok = await ui.sheet({ title: 'Link to the video', body, actions: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, main: true }] });
    if (!ok) return;
    const link = cleanLink(input.value);
    if (link === null) { ui.toast('That doesn\'t look like a link.'); return; }
    r.link = link;
    await RECIPES.save(r);
    row.replaceWith(linkRow());
  }));
  return row;
}

async function renameRecipe() {
  const body = el('label', 'field');
  body.innerHTML = '<span>Recipe name</span><input autocomplete="off" autocapitalize="sentences">';
  const input = $('input', body);
  input.value = S.recipe.name;
  const ok = await ui.sheet({ title: 'Rename', body, actions: [{ label: 'Cancel', value: false }, { label: 'Save', value: true, main: true }] });
  if (!ok || !input.value.trim() || !S) return;
  S.recipe.name = input.value.trim();
  S.titleEl.textContent = S.recipe.name;
  await RECIPES.save(S.recipe);
}

async function deleteRecipe() {
  const r = S.recipe;
  const using = (await PROJECTS.list().catch(() => [])).filter((p) => p.recipeId === r.id);
  const yes = await ui.sheet({
    title: `Delete ${r.name}?`,
    text: `Its reference video is deleted too.${using.length ? ` ${using.length} project${using.length === 1 ? '' : 's'} using it keep${using.length === 1 ? 's' : ''} their clips and timing, without the guide sound.` : ''}`,
    actions: [{ label: 'Keep it', value: false }, { label: 'Delete', value: true, main: true }]
  });
  if (!yes) return;
  closeRemix();
  for (const p of using) { p.recipeId = null; p.guide = null; await PROJECTS.save(p); }
  for (const path of [r.refPath, r.beatPath]) if (path) await OPFS.remove(path).catch(() => {});
  await RECIPES.remove(r.id);
  DEBUG.log('info', 'Remix: recipe deleted', 'remix');
  ui.toast('Recipe deleted.');
  listView();
}

// ---------- The reference player with the crop shown on top ----------

async function stageBlock() {
  const r = S.recipe;
  const card = el('div', 'card rx-stage-card');
  const stage = el('div', 'rx-stage');
  const w = r.width || 9, h = r.height || 16;
  stage.style.aspectRatio = `${w} / ${h}`;
  // Width follows the height limit, so the box always has the video's own shape and the crop lines up with it.
  stage.style.width = `min(100%, 300px, calc(52dvh * ${w} / ${h}))`;
  const video = document.createElement('video');
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.preload = 'auto';
  video.muted = true;
  const url = URL.createObjectURL(await OPFS.file(r.refPath));
  S.urls.push(url);
  video.src = url;
  const mask = el('div', 'rx-crop');
  stage.append(video, mask);
  S.video = video;
  S.mask = mask;
  S.media.push(video);
  const bar = el('div', 'rx-transport');
  const play = btn('▶', 'icon-btn play', () => (video.paused ? video.play().catch(() => {}) : video.pause()));
  const clock = el('span', 'clock', `0:00.0 / ${fmtT(r.duration)}`);
  const sound = btn('Sound off', 'btn btn-ghost btn-sm', () => { video.muted = !video.muted; sound.textContent = video.muted ? 'Sound off' : 'Sound on'; });
  bar.append(play, clock, el('div', 'grow'), sound);
  card.append(stage, bar);
  const tick = () => {
    if (!S || S.closed) return;
    clock.textContent = `${fmtT(video.currentTime)} / ${fmtT(r.duration)}`;
    play.textContent = video.paused ? '▶' : '❚❚';
    placePlayhead(video.currentTime, !video.paused);
    S.raf = requestAnimationFrame(tick);
  };
  S.raf = requestAnimationFrame(tick);
  drawCrop();
  return card;
}

function drawCrop() {
  if (!S?.mask) return;
  const c = S.recipe.crop;
  Object.assign(S.mask.style, { left: `${c.x0 * 100}%`, top: `${c.y0 * 100}%`, width: `${(c.x1 - c.x0) * 100}%`, height: `${(c.y1 - c.y0) * 100}%` });
}

function cropBlock() {
  const r = S.recipe;
  const card = el('div', 'card');
  card.append(el('p', 'label', 'Step 1: crop out the app'), el('p', 'muted small', 'Only the part inside the pink box is watched for cuts, so the app\'s buttons, captions and bars don\'t fool it.'));
  const sliders = el('div');
  const build = () => {
    sliders.innerHTML = '';
    const c = r.crop;
    const row = (label, get, set, max) => {
      const w = el('label', 'field slider');
      w.innerHTML = '<span></span><input type="range" min="0" step="1"><b></b>';
      $('span', w).textContent = label;
      const input = $('input', w);
      input.max = max;
      input.value = Math.round(get() * 100);
      $('b', w).textContent = `${input.value}%`;
      input.addEventListener('input', () => {
        set(+input.value / 100);
        $('b', w).textContent = `${input.value}%`;
        r.cropKey = 'custom';
        card.querySelectorAll('.chip').forEach((x) => x.classList.remove('on'));
        drawCrop();
        RECIPES.save(r);
      });
      sliders.appendChild(w);
    };
    row('Top', () => c.y0, (v) => { c.y0 = Math.min(v, c.y1 - 0.1); }, 45);
    row('Bottom', () => 1 - c.y1, (v) => { c.y1 = Math.max(1 - v, c.y0 + 0.1); }, 45);
    row('Left', () => c.x0, (v) => { c.x0 = Math.min(v, c.x1 - 0.1); }, 45);
    row('Right', () => 1 - c.x1, (v) => { c.x1 = Math.max(1 - v, c.x0 + 0.1); }, 45);
  };
  card.appendChild(chipRow(CROPS.map((p) => [p.key, p.label]), r.cropKey || 'custom', (key) => {
    r.crop = { ...CROPS.find((p) => p.key === key).c };
    r.cropKey = key;
    build();
    drawCrop();
    RECIPES.save(r);
  }));
  card.appendChild(sliders);
  build();
  return card;
}

// ---------- Analyze: cuts from the picture, beats from the sound ----------

function analyzeBlock(fresh) {
  const r = S.recipe;
  const card = el('div', `card${fresh ? ' rx-next' : ''}`);
  card.append(el('p', 'label', 'Step 2: find the timing'), el('p', 'muted small', 'Finds every cut and the beat. Your edits below are replaced, and Undo brings them back.'));
  const srcRow = el('div');
  const buildSrc = () => {
    srcRow.innerHTML = '';
    srcRow.append(el('p', 'muted small', 'Beats from'), chipRow([['reference', 'Its sound'], ['song', r.beatPath ? `My song: ${r.beatName || 'song'}` : 'My song']], r.beatSource || 'reference', async (v) => {
      if (v === 'song' && !r.beatPath && !(await pickSong())) { buildSrc(); return; }
      r.beatSource = v;
      RECIPES.save(r);
      buildSrc();
    }));
    if (r.beatPath) srcRow.appendChild(btn('Pick a different song', 'btn btn-ghost btn-sm', async () => { if (await pickSong()) { r.beatSource = 'song'; RECIPES.save(r); buildSrc(); } }));
  };
  buildSrc();
  card.appendChild(srcRow);
  card.appendChild(btn(r.cuts.length || r.beats.length ? 'Analyze again' : 'Analyze', 'btn btn-main wide', () => analyze()));
  return card;
}

// Your own song, for beats and tap-along. Kept with the recipe like the reference.
async function pickSong() {
  const r = S.recipe;
  const file = await pick('audio/*,video/*');
  if (!file || !S) return false;
  const path = `refs/${r.id}-song-${Date.now().toString(36)}.${extOf(file)}`;
  const ctrl = new AbortController();
  const panel = progressOverlay('Bringing in your song');
  panel.onCancel(() => ctrl.abort());
  try {
    await OPFS.copyIn(file, path, { signal: ctrl.signal, onProgress: (f) => panel.set(f) });
    const info = await WORKER.call('clip.probe', { path, type: file.type || '' }, [], 60000);
    const ok = info.kind === 'audio' ? info.canDecode : info.hasAudio && info.audioCanDecode;
    if (!ok) throw new Error('No readable sound in that file');
    if (r.beatPath) await OPFS.remove(r.beatPath).catch(() => {});
    r.beatPath = path;
    r.beatName = file.name || 'song';
    await RECIPES.save(r, { now: true });
    return true;
  } catch (err) {
    await OPFS.remove(path).catch(() => {});
    if (err.name !== 'AbortError') { DEBUG.log('warn', `Remix song: ${err.message}`, 'remix'); ui.toast('That song didn\'t work. Try another file.'); }
    return false;
  } finally {
    panel.close();
  }
}

async function analyze() {
  const r = S.recipe;
  const job = uid();
  S.job = job;
  const panel = progressOverlay('Finding the cuts', 'Keep Cake Walk open. A one-minute video takes about a minute.');
  panel.onCancel(() => WORKER.call('remix.cancel', { job }).catch(() => {}));
  S.offEvent?.();
  S.offEvent = WORKER.onEvent((msg) => {
    if (msg.type !== 'remix-progress' || msg.job !== job) return;
    panel.set(msg.value, msg.stage === 'beats' ? 'Finding the beat' : msg.stage === 'done' ? 'Done' : 'Finding the cuts');
  });
  const t0 = performance.now();
  try {
    const res = await WORKER.call('remix.analyze', {
      job, path: r.refPath, crop: r.crop,
      beatsPath: r.beatSource === 'song' ? r.beatPath : null
    }, [], 20 * 60 * 1000);
    if (!S || S.recipe !== r) return;
    remember();
    r.duration = res.duration || r.duration;
    r.cuts = cleanTimes(res.cuts, r.duration, 0.2);
    r.beats = cleanTimes(res.beats, r.duration + 0.05, 0.12);
    r.bpm = res.bpm;
    if (S.snap && r.beats.length) r.cuts = cleanTimes(r.cuts.map((c) => snap(c, r.beats)), r.duration, 0.1);
    r.analyzedAt = Date.now();
    await RECIPES.save(r, { now: true });
    DEBUG.log('info', `Remix: ${r.cuts.length} cuts, ${r.beats.length} beats, ${res.frames} frames in ${Math.round(performance.now() - t0)}ms`, 'remix');
    if (res.noAudio) ui.toast('No sound in it, so no beats. Tap along to add them.');
    else if (!r.beats.length) ui.toast('No steady beat found. Tap along to add beats.');
    else ui.toast(`Found ${r.cuts.length} cuts and the beat.`, { sparkle: true });
    renderTimeline();
    S.view.querySelector('.rx-next')?.classList.remove('rx-next');
  } catch (err) {
    if (err.name !== 'AbortError') {
      DEBUG.log('error', `Remix analyze: ${err.message}`, 'remix');
      ui.toast('Couldn\'t read that video\'s timing. Debug has the details.');
    }
  } finally {
    panel.close();
    S && (S.job = null);
    S?.offEvent?.();
    if (S) S.offEvent = null;
  }
}

// ---------- The EDIT RECIPE timeline: pink cuts, green beats ----------

function remember() {
  S.history.push(JSON.stringify({ cuts: S.recipe.cuts, beats: S.recipe.beats }));
  if (S.history.length > HISTORY) S.history.shift();
}
function undoRecipe() {
  if (!S.history.length) { ui.toast('Nothing to undo.'); return; }
  const s = JSON.parse(S.history.pop());
  S.recipe.cuts = s.cuts;
  S.recipe.beats = s.beats;
  S.sel = null;
  RECIPES.save(S.recipe);
  renderTimeline();
}
function now() { return S.video ? S.video.currentTime : (S.cursor || 0); }

function timelineBlock() {
  const card = el('div', 'card');
  card.append(el('p', 'label', 'Step 3: edit the recipe'));
  S.stats = el('p', 'muted small');
  card.appendChild(S.stats);
  const sc = el('div', 'rx-tl');
  const track = el('div', 'rx-track');
  sc.appendChild(track);
  S.sc = sc;
  S.track = track;
  card.appendChild(sc);
  card.appendChild(el('p', 'muted small', 'Pink lines are cuts and green ticks are beats. Drag one to move it, tap it to select it.'));
  const row = el('div', 'rx-tools');
  row.append(
    btn('+ Cut here', 'btn btn-ghost btn-sm', () => addMark('cuts')),
    btn('+ Beat here', 'btn btn-ghost btn-sm', () => addMark('beats')),
    S.delBtn = btn('Delete marker', 'btn btn-ghost btn-sm danger', () => deleteSel()),
    btn('Undo', 'btn btn-ghost btn-sm', () => undoRecipe())
  );
  card.appendChild(row);
  const row2 = el('div', 'rx-tools');
  const snapBtn = el('button', `chip${S.snap ? ' on' : ''}`, 'Snap cuts to beats');
  snapBtn.addEventListener('click', () => toggleSnap(snapBtn));
  row2.append(snapBtn, btn('Tap along', 'chip', () => tapAlong()));
  card.appendChild(row2);
  bindTrack();
  return card;
}

function toggleSnap(b) {
  const r = S.recipe;
  S.snap = !S.snap;
  r.snap = S.snap;
  b.classList.toggle('on', S.snap);
  if (S.snap && r.beats.length && r.cuts.length) {
    remember();
    r.cuts = cleanTimes(r.cuts.map((c) => snap(c, r.beats)), r.duration, 0.1);
    ui.toast('Cuts snapped to the nearest beat. Undo brings them back.');
  }
  RECIPES.save(r);
  renderTimeline();
}

function addMark(kind) {
  const r = S.recipe;
  let t = now();
  if (kind === 'cuts' && S.snap) t = snap(t, r.beats);
  if (t <= 0.05 || t >= r.duration - 0.05) { ui.toast('Move the playhead inside the video first.'); return; }
  remember();
  r[kind] = cleanTimes([...r[kind], t], r.duration + (kind === 'beats' ? 0.05 : 0), 0.05);
  S.sel = { kind, i: r[kind].indexOf(+t.toFixed(3)) };
  RECIPES.save(r);
  renderTimeline();
}

function deleteSel() {
  if (!S.sel) { ui.toast('Tap a cut or a beat first.'); return; }
  remember();
  S.recipe[S.sel.kind].splice(S.sel.i, 1);
  S.sel = null;
  RECIPES.save(S.recipe);
  renderTimeline();
}

async function loadThumbs() {
  const r = S.recipe;
  try {
    const every = Math.max(0.5, r.duration / 60);
    const blobs = await WORKER.call('clip.thumbs', { path: r.refPath, kind: 'video', duration: r.duration, width: 56, every, max: 60 }, [], 120000);
    if (!S || S.recipe !== r) return;
    S.thumbs = blobs.map((b) => { const u = URL.createObjectURL(b); S.urls.push(u); return u; });
    renderTimeline();
  } catch (err) {
    DEBUG.log('warn', `Remix filmstrip: ${err.message}`, 'remix');
  }
}

export function renderTimeline() {
  if (!S?.track) return;
  const r = S.recipe;
  const W = Math.max(1, r.duration * PX);
  const track = S.track;
  track.innerHTML = '';
  track.style.width = `${W}px`;
  const strip = el('div', 'rx-strip');
  if (S.thumbs.length) {
    const n = Math.max(1, Math.ceil(W / 40));
    for (let i = 0; i < n; i++) {
      const im = el('img');
      im.alt = '';
      im.draggable = false;
      im.src = S.thumbs[Math.min(S.thumbs.length - 1, Math.floor((i / n) * S.thumbs.length))];
      strip.appendChild(im);
    }
  }
  track.appendChild(strip);
  // Shots in alternating tints, so you can see each slot your clips will fill.
  slotsOf(r).forEach((s, i) => {
    const b = el('div', `rx-shot${i % 2 ? ' alt' : ''}`);
    b.style.left = `${s.start * PX}px`;
    b.style.width = `${s.len * PX}px`;
    b.textContent = s.len * PX > 34 ? `${s.len.toFixed(1)}s` : '';
    track.appendChild(b);
  });
  for (const kind of ['cuts', 'beats']) {
    r[kind].forEach((t, i) => {
      const m = el('div', `rx-mark rx-${kind === 'cuts' ? 'cut' : 'beat'}${S.sel?.kind === kind && S.sel.i === i ? ' sel' : ''}`);
      m.style.left = `${t * PX}px`;
      m.dataset.kind = kind;
      m.dataset.i = i;
      m.setAttribute('aria-label', `${kind === 'cuts' ? 'Cut' : 'Beat'} at ${fmtT(t)}`);
      track.appendChild(m);
    });
  }
  S.ph = el('div', 'rx-ph');
  track.appendChild(S.ph);
  placePlayhead(now(), false);
  const shots = slotsOf(r);
  const avg = shots.length ? r.duration / shots.length : 0;
  S.stats.textContent = `${shots.length} shot${shots.length === 1 ? '' : 's'} · average ${avg.toFixed(1)}s · ${fmtT(r.duration)} long · ${r.beats.length ? `${r.beats.length} beats${r.bpm ? `, about ${Math.round(r.bpm)} BPM` : ''}` : 'no beats yet'}`;
  if (S.delBtn) S.delBtn.disabled = !S.sel;
}

function placePlayhead(t, follow) {
  if (!S?.ph) return;
  S.ph.style.left = `${t * PX}px`;
  if (follow && S.sc && !S.dragging) {
    const x = t * PX - S.sc.clientWidth / 2;
    if (Math.abs(S.sc.scrollLeft - x) > S.sc.clientWidth / 3) S.sc.scrollLeft = x;
  }
}

function bindTrack() {
  const track = S.track;
  track.addEventListener('pointerdown', (e) => {
    const m = e.target.closest('.rx-mark');
    const r = S.recipe;
    if (!m) {
      // Tap empty space: move the playhead there.
      const x = e.clientX - track.getBoundingClientRect().left;
      const t = Math.max(0, Math.min(r.duration, x / PX));
      S.cursor = t;
      if (S.video) { S.video.pause(); S.video.currentTime = t; }
      S.sel = null;
      renderTimeline();
      return;
    }
    e.preventDefault();
    const kind = m.dataset.kind, i = +m.dataset.i;
    S.sel = { kind, i };
    S.dragging = { kind, i, x: e.clientX, t0: r[kind][i], moved: false };
    m.setPointerCapture(e.pointerId);
    track.querySelectorAll('.rx-mark.sel').forEach((x) => x.classList.remove('sel'));
    m.classList.add('sel');
    if (S.delBtn) S.delBtn.disabled = false;
  });
  track.addEventListener('pointermove', (e) => {
    const d = S?.dragging;
    if (!d) return;
    const r = S.recipe;
    if (!d.moved && Math.abs(e.clientX - d.x) < 4) return;
    if (!d.moved) { remember(); d.moved = true; }
    let t = Math.max(0.05, Math.min(r.duration - 0.05, d.t0 + (e.clientX - d.x) / PX));
    if (d.kind === 'cuts' && S.snap) t = snap(t, r.beats);
    r[d.kind][d.i] = +t.toFixed(3);
    const m = track.querySelector(`.rx-mark[data-kind="${d.kind}"][data-i="${d.i}"]`);
    if (m) m.style.left = `${t * PX}px`;
    if (S.video) S.video.currentTime = t;
  });
  const end = () => {
    const d = S?.dragging;
    if (!d) return;
    S.dragging = null;
    if (!d.moved) return;
    const r = S.recipe;
    const t = r[d.kind][d.i];
    r[d.kind] = cleanTimes(r[d.kind], r.duration + (d.kind === 'beats' ? 0.05 : 0), 0.05);
    S.sel = { kind: d.kind, i: r[d.kind].indexOf(t) };
    if (S.sel.i < 0) S.sel = null;
    RECIPES.save(r);
    renderTimeline();
  };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);
}

// ---------- Tap along: tap Cut and Beat while it plays ----------

async function tapAlong() {
  const r = S.recipe;
  const canRef = !!(r.refPath && S.video);
  if (!canRef && !r.beatPath) { ui.toast('Import the video or pick your song first.'); return; }
  let source = canRef ? 'reference' : 'song';
  let mode = 'replace';
  const body = el('div');
  body.appendChild(el('p', 'muted small', 'Play along to'));
  body.appendChild(chipRow([...(canRef ? [['reference', 'The video']] : []), ['song', r.beatPath ? 'My song' : 'My song (pick one)']], source, (v) => { source = v; }));
  body.appendChild(el('p', 'muted small', 'Your taps'));
  body.appendChild(chipRow([['replace', 'Replace what\'s there'], ['add', 'Add to it']], mode, (v) => { mode = v; }));
  body.appendChild(el('p', 'note', `Tap Cut where a new shot should start and Beat on each beat. It plays from the start.${S.snap ? ' Cuts snap to the nearest beat.' : ''}`));
  const go = await ui.sheet({ title: 'Tap along', body, actions: [{ label: 'Cancel', value: false }, { label: 'Start', value: true, main: true }] });
  if (!go || !S) return;
  if (source === 'song' && !r.beatPath && !(await pickSong())) return;
  let media;
  if (source === 'reference') {
    media = S.video;
    media.muted = false;
  } else {
    media = document.createElement('audio');
    media.preload = 'auto';
    const url = URL.createObjectURL(await OPFS.file(r.beatPath));
    S.urls.push(url);
    media.src = url;
    S.media.push(media);
  }
  const taps = { cuts: [], beats: [] };
  const box = el('div', 'rx-tap');
  box.innerHTML = '<div class="rx-tap-in"><p class="label">Tap along</p><p class="clock rx-tap-clock">0:00.0</p><div class="rx-tap-btns"><button class="tap-btn tap-cut">Cut<small>0</small></button><button class="tap-btn tap-beat">Beat<small>0</small></button></div><div class="row"><button class="btn btn-ghost rx-tap-cancel">Cancel</button><button class="btn btn-main rx-tap-done">Done</button></div></div>';
  $('#sheet-root').appendChild(box);
  const clock = $('.rx-tap-clock', box);
  const tap = (kind, b) => (e) => {
    e.preventDefault();
    const t = Math.max(0, media.currentTime - TAP_LATENCY);
    if (t >= r.duration) return;
    taps[kind].push(+t.toFixed(3));
    $('small', b).textContent = String(taps[kind].length);
    b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
  };
  const cutB = $('.tap-cut', box), beatB = $('.tap-beat', box);
  cutB.addEventListener('pointerdown', tap('cuts', cutB));
  beatB.addEventListener('pointerdown', tap('beats', beatB));
  let raf = 0;
  const loop = () => { clock.textContent = `${fmtT(media.currentTime)} / ${fmtT(r.duration)}`; if (media.currentTime >= r.duration) finish(true); else raf = requestAnimationFrame(loop); };
  let done = false;
  const finish = (keep) => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    media.pause();
    if (media === S?.video) media.muted = true;
    box.remove();
    if (!keep || !S) return;
    if (!taps.cuts.length && !taps.beats.length) { ui.toast('No taps, so nothing changed.'); return; }
    remember();
    if (taps.beats.length) r.beats = cleanTimes(mode === 'replace' ? taps.beats : [...r.beats, ...taps.beats], r.duration + 0.05, 0.12);
    if (taps.cuts.length) {
      let cuts = mode === 'replace' ? taps.cuts : [...r.cuts, ...taps.cuts];
      if (S.snap && r.beats.length) cuts = cuts.map((c) => snap(c, r.beats));
      r.cuts = cleanTimes(cuts, r.duration, 0.1);
    }
    if (taps.beats.length >= 4) r.bpm = estimateBpm(r.beats);
    r.tappedAt = Date.now();
    RECIPES.save(r);
    renderTimeline();
    ui.toast(`Added ${taps.cuts.length} cut${taps.cuts.length === 1 ? '' : 's'} and ${taps.beats.length} beat${taps.beats.length === 1 ? '' : 's'}. Undo brings back the old ones.`);
  };
  $('.rx-tap-cancel', box).addEventListener('click', () => finish(false));
  $('.rx-tap-done', box).addEventListener('click', () => finish(true));
  media.addEventListener('ended', () => finish(true), { once: true });
  try { media.currentTime = 0; } catch {}
  await media.play().catch((err) => { DEBUG.log('warn', `Tap along play: ${err.message}`, 'remix'); });
  raf = requestAnimationFrame(loop);
}

export function estimateBpm(beats) {
  const gaps = [];
  for (let i = 1; i < beats.length; i++) { const g = beats[i] - beats[i - 1]; if (g > 0.25 && g < 1.5) gaps.push(g); }
  if (!gaps.length) return null;
  gaps.sort((a, b) => a - b);
  return Math.round((60 / gaps[Math.floor(gaps.length / 2)]) * 10) / 10;
}

// ---------- Apply: fill the recipe's slots with your clips ----------

function applyBlock() {
  const card = el('div', 'card');
  card.append(el('p', 'label', 'Step 4: use it'), el('p', 'muted small', 'Your clips fill the shots at the same lengths. Only the timing is copied: nothing from the reference goes into your video, and its sound is a muted guide you can turn on while editing.'));
  card.appendChild(btn(target ? `Use this timing in ${target.name}` : 'Use this timing', 'btn btn-main wide', () => applyFlow()));
  return card;
}

async function applyFlow() {
  const r = S.recipe;
  const slots = slotsOf(r);
  if (slots.length < 2) { ui.toast('Find or add some cuts first.'); return; }
  let project = target ? await PROJECTS.get(target.id).catch(() => null) : null;
  if (!project) {
    const all = (await PROJECTS.list().catch(() => [])).filter((p) => p.clips?.length);
    if (!all.length) { ui.toast('Make a project and add your clips first, then come back.'); return; }
    const body = el('div', 'sheet-list');
    let chosen = null;
    all.forEach((p) => {
      const b = el('button', 'list-btn', `${p.name} (${p.clips.length} clip${p.clips.length === 1 ? '' : 's'})`);
      b.addEventListener('click', () => { chosen = p; document.querySelector('.sheet-backdrop')?.click(); });
      body.appendChild(b);
    });
    await ui.sheet({ title: 'Which project?', body });
    project = chosen;
    if (!project) return;
  }
  if (!project.clips.length) { ui.toast(`Add your clips to ${project.name} first.`); return; }
  const yes = await ui.sheet({
    title: `Use this timing in ${project.name}?`,
    text: `${slots.length} shots, ${fmtT(r.duration)} long. Your clips fill them in timeline order, taking turns, each time from a fresh part. Text, stickers, music and looks stay. Undo in the editor brings back your old timeline.`,
    actions: [{ label: 'Cancel', value: false }, { label: 'Fill the shots', value: true, main: true }]
  });
  if (!yes || !S) return;
  const n = await applyRecipe(project, r);
  if (!n) { ui.toast('None of the clips in that project can fill a shot.'); return; }
  closeRemix();
  await ui.go('editor', { id: project.id });
  ui.toast(`Filled ${n} shots with your clips. Tap a clip, then Slot to swap it or slide which part plays.`, { sparkle: true, ms: 4200 });
}

// The clips a project can draw from: those on its timeline first (in order), then any other imported clips.
export function sourcesOf(project) {
  const seen = new Set();
  const list = [];
  const add = (id) => {
    const a = project.assets[id];
    if (!a || seen.has(id) || (a.kind !== 'video' && a.kind !== 'photo')) return;
    seen.add(id);
    list.push({ assetId: id, kind: a.kind, duration: a.duration || 0 });
  };
  project.clips.forEach((c) => add(c.assetId));
  Object.keys(project.assets).forEach(add);
  return list;
}

// Writes the filled timeline and one undo step (the same snapshot the editor keeps). Returns the shot count.
export async function applyRecipe(project, recipe) {
  const filled = fillSlots(slotsOf(recipe), sourcesOf(project));
  if (!filled.length) return 0;
  const byAsset = new Map();
  project.clips.forEach((c) => { if (!byAsset.has(c.assetId)) byAsset.set(c.assetId, c); });
  const hist = await UNDO.load(project.id);
  hist.undo.push(JSON.stringify({ clips: project.clips, music: project.music, texts: project.texts, stickers: project.stickers, grade: project.grade }));
  UNDO.save(project.id, hist.undo, []);
  project.clips = filled.map((f) => {
    const from = byAsset.get(f.assetId);
    const clip = { id: uid(), assetId: f.assetId, in: f.in, out: f.out, speed: f.speed, volume: from?.volume ?? 1, muted: !!from?.muted || f.speed !== 1, slot: f.slot };
    if (from?.color) clip.color = { ...from.color };
    if (from?.frame) clip.frame = JSON.parse(JSON.stringify(from.frame));
    return clip;
  });
  project.recipeId = recipe.id;
  project.guide = recipe.refPath ? { recipeId: recipe.id, path: recipe.refPath, name: recipe.name, duration: recipe.duration, hear: false } : null;
  await SAVE.now(`project:${project.id}`, () => PROJECTS.save(project));
  await SAVE.flush();
  DEBUG.log('info', `Remix: filled ${filled.length} shots from ${sourcesOf(project).length} clips`, 'remix');
  return filled.length;
}

// ---------- In the editor: swap a slot's clip or slide which part plays ----------

// api: { ui, project, clip, remember(), changed(), clipLen(c) }
export async function slotSheet(api) {
  const { project, clip } = api;
  const recipe = await RECIPES.get(project.recipeId);
  const len = api.clipLen(clip);
  const body = el('div');
  const total = recipe ? slotsOf(recipe).length : null;
  body.appendChild(el('p', 'muted small', `Shot ${clip.slot + 1}${total ? ` of ${total}` : ''} · ${len.toFixed(2)}s${recipe ? ` · ${recipe.name}` : ''}. The shot keeps its length.`));
  const slideBox = el('div');
  const buildSlide = () => {
    slideBox.innerHTML = '';
    const a = project.assets[clip.assetId];
    if (!a || a.kind === 'photo') { slideBox.appendChild(el('p', 'muted small', 'Photos have nothing to slide.')); return; }
    const span = clip.out - clip.in;
    const max = Math.max(0, a.duration - span);
    if (max < 0.05) { slideBox.appendChild(el('p', 'muted small', 'This clip is the same length as the shot, so there\'s nothing to slide.')); return; }
    const w = el('label', 'field slider');
    w.innerHTML = '<span>Part used</span><input type="range" min="0" step="0.05"><b></b>';
    const input = $('input', w);
    input.max = max.toFixed(2);
    input.value = clip.in;
    $('b', w).textContent = `${(+clip.in).toFixed(1)}s`;
    let saved = false;
    input.addEventListener('input', () => {
      if (!saved) { api.remember(); saved = true; }
      clip.in = +(+input.value).toFixed(3);
      clip.out = +(clip.in + span).toFixed(3);
      $('b', w).textContent = `${clip.in.toFixed(1)}s`;
      api.changed();
    });
    slideBox.append(el('p', 'label', 'Slide which part plays'), w);
  };
  body.appendChild(el('p', 'label', 'Swap the clip'));
  const list = el('div', 'chips');
  sourcesOf(project).forEach((s) => {
    const a = project.assets[s.assetId];
    const b = el('button', `chip${s.assetId === clip.assetId ? ' on' : ''}`, `${a.name || 'clip'}${a.kind === 'photo' ? ' (photo)' : ` (${a.duration.toFixed(1)}s)`}`);
    b.addEventListener('click', () => {
      if (s.assetId === clip.assetId) return;
      api.remember();
      fitClip(clip, a, s.assetId, len);
      list.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
      api.changed();
      buildSlide();
    });
    list.appendChild(b);
  });
  body.appendChild(list);
  buildSlide();
  body.appendChild(slideBox);
  await api.ui.sheet({ title: 'Slot', body, actions: [{ label: 'Done', value: true, main: true }] });
}

// Put a different clip in a shot without changing the shot's length.
export function fitClip(clip, asset, assetId, len) {
  clip.assetId = assetId;
  delete clip.frame;
  if (asset.kind === 'photo') { clip.in = 0; clip.out = +len.toFixed(3); clip.speed = 1; return clip; }
  if (asset.duration >= len) {
    clip.speed = 1;
    clip.in = 0;
    clip.out = +len.toFixed(3);
  } else {
    clip.speed = +Math.max(0.25, asset.duration / len).toFixed(4);
    clip.in = 0;
    clip.out = asset.duration;
    clip.muted = true;
  }
  return clip;
}

// The guide track row under the music lane. Tap to hear it in the preview; it's never in the export.
export function guideRow(project, px, total, onToggle) {
  const g = project.guide;
  if (!g?.path) return null;
  const b = el('button', `tl-guide${g.hear ? ' on' : ''}`);
  b.style.width = `${Math.max(60, Math.min(g.duration || total, total || g.duration) * px)}px`;
  b.textContent = g.hear ? `Guide: ${g.name} · on (preview only)` : `Guide: ${g.name} · muted, tap to hear`;
  b.addEventListener('click', () => { g.hear = !g.hear; onToggle(); });
  return b;
}
