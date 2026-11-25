// Cake Walk: TEMPLATE GALLERY (Prompt 8). Pick a template, pick clips, Cake Walk fills the slots, you tweak,
// you export. Tabs by goal; each card has a small animated preview made from shapes (no stock footage).
// Also: filling a project from its template (used by the editor) and the template sheet inside the editor.

import { PROJECTS, WORKER, UNDO, SAVE } from './storage.js';
import { DEBUG } from './debug.js';
import { sourcesOf } from './remix.js';
import { TEXT_STYLES, TRANSITIONS, GRADES, TEXT_DEFAULT } from './look.js';
import {
  TEMPLATES, GOALS, templateById, laneChoices, defaultLane, lookFor, planSlots, buildTemplate, templateRecord,
  seriesLabel, rangeText, fillText
} from './templates.js';

const $ = (sel, root = document) => root.querySelector(sel);
const uid = () => crypto.randomUUID();
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function chipRow(items, current, onPick) {
  const wrap = el('div', 'chips');
  items.forEach(([value, label]) => {
    const b = el('button', `chip${value === current ? ' on' : ''}`, label);
    b.type = 'button';
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
      onPick(value);
    });
    wrap.appendChild(b);
  });
  return wrap;
}
const secs = (x) => (x >= 10 ? `${Math.round(x)}s` : `${(+x.toFixed(1))}s`);
const mmss = (x) => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`;

// ---------- The animated preview: shapes only ----------

const TINTS = {
  PRO: ['#E9E1D6', '#D9CCBC', '#F7F2EA', '#CBBBA8', '#EFE7DC'],
  CREATIVE: ['#FFD1E6', '#FFB3D9', '#F3DDFF', '#FF9CCE', '#FFE4F1']
};
function shotKind(name) {
  if (/card|credit|title|booking/i.test(name)) return 'card';
  if (/photo|pic\b|frame|image/i.test(name)) return 'photo';
  if (/profile/i.test(name)) return 'profile';
  if (/close|face|hook|skin|eyes|lips|base|spoken/i.test(name)) return 'close';
  if (/waist|piece|product|hair|glam/i.test(name)) return 'mid';
  return 'full';
}
function figure(kind, ink) {
  switch (kind) {
    case 'close': return `<circle cx="0" cy="-6" r="15" fill="${ink}"/><rect x="-22" y="10" width="44" height="30" rx="14" fill="${ink}"/>`;
    case 'profile': return `<ellipse cx="0" cy="-6" rx="12" ry="14" fill="${ink}"/><path d="M11 -8 L17 -3 L11 0 Z" fill="${ink}"/><rect x="-16" y="9" width="30" height="30" rx="12" fill="${ink}"/>`;
    case 'mid': return `<circle cx="0" cy="-18" r="8" fill="${ink}"/><rect x="-14" y="-8" width="28" height="44" rx="10" fill="${ink}"/>`;
    case 'photo': return `<rect x="-17" y="-24" width="34" height="46" rx="2" fill="#fff" stroke="${ink}" stroke-width="1"/><circle cx="0" cy="-8" r="5" fill="${ink}"/><rect x="-7" y="-2" width="14" height="18" rx="5" fill="${ink}"/>`;
    case 'card': return `<rect x="-20" y="-6" width="40" height="5" rx="2.5" fill="${ink}"/><rect x="-13" y="3" width="26" height="3.5" rx="1.75" fill="${ink}" opacity=".6"/>`;
    default: return `<circle cx="0" cy="-24" r="5" fill="${ink}"/><rect x="-7" y="-18" width="14" height="24" rx="5" fill="${ink}"/><rect x="-6" y="5" width="5" height="20" rx="2.5" fill="${ink}"/><rect x="1" y="5" width="5" height="20" rx="2.5" fill="${ink}"/>`;
  }
}
// One loop of the template, squeezed into about five seconds. Each shot shows for its share of the time.
export function previewSVG(t, lane, { still = false } = {}) {
  let slots = t.remix
    ? ['Shot', 'Shot', 'Shot', 'Shot', 'Shot'].map((name, i) => ({ name: `${name} ${i + 1}`, len: 1 }))
    : planSlots(t, { length: 'ig', count: t.each ? 6 : 0 });
  slots = slots.slice(0, 10);
  const total = slots.reduce((a, x) => a + x.len, 0) || 1;
  const L = Math.min(6, Math.max(3.5, slots.length * 0.55));
  const tints = TINTS[lane] || TINTS.PRO;
  const ink = lane === 'CREATIVE' ? '#C70F66' : '#6E6258';
  const look = lookFor(t, lane);
  const textFor = (i) => (t.texts || []).some((x) => x.slot === i || (x.slot === 'last' && i === slots.length - 1));
  let at = 0;
  const parts = slots.map((x, i) => {
    const a = at / total, z = (at + x.len) / total;
    at += x.len;
    const kind = shotKind(x.name);
    const show = still ? (i === 0 ? '' : ' opacity="0"')
      : ` opacity="${i === 0 ? 1 : 0}"`;
    const vis = still ? '' : i === 0
      ? `<animate attributeName="opacity" values="1;0" keyTimes="0;${z.toFixed(3)}" calcMode="discrete" dur="${L}s" repeatCount="indefinite"/>`
      : `<animate attributeName="opacity" values="0;1;0" keyTimes="0;${a.toFixed(3)};${Math.min(1, z).toFixed(3)}" calcMode="discrete" dur="${L}s" repeatCount="indefinite"/>`;
    let move = '';
    if (!still && /toward|walk to|walk$|runway|finale/i.test(x.name)) move = `<animateTransform attributeName="transform" type="scale" values="0.7;0.7;1.15;1.15" keyTimes="0;${a.toFixed(3)};${z.toFixed(3)};1" dur="${L}s" repeatCount="indefinite"/>`;
    else if (!still && /away/i.test(x.name)) move = `<animateTransform attributeName="transform" type="scale" values="1.1;1.1;0.65;0.65" keyTimes="0;${a.toFixed(3)};${z.toFixed(3)};1" dur="${L}s" repeatCount="indefinite"/>`;
    else if (!still && /360|turn/i.test(x.name)) move = `<animateTransform attributeName="transform" type="scale" values="1 1;1 1;-1 1;1 1;1 1" keyTimes="0;${a.toFixed(3)};${((a + z) / 2).toFixed(3)};${z.toFixed(3)};1" dur="${L}s" repeatCount="indefinite"/>`;
    else if (!still && x.move === 'pushin') move = `<animateTransform attributeName="transform" type="scale" values="1;1;1.14;1.14" keyTimes="0;${a.toFixed(3)};${z.toFixed(3)};1" dur="${L}s" repeatCount="indefinite"/>`;
    const bg = kind === 'card' ? (lane === 'CREATIVE' ? '#2B1020' : '#2B2420') : tints[i % tints.length];
    const fig = figure(kind, kind === 'card' ? '#F4EFE8' : ink);
    const bar = textFor(i) && kind !== 'card' ? `<rect x="12" y="${look.text === 'clean' ? 76 : 14}" width="30" height="5" rx="2.5" fill="${lane === 'CREATIVE' ? '#FF2D95' : '#FFFFFF'}" opacity=".95"/>` : '';
    return `<g${show}>${vis}<rect width="54" height="96" fill="${bg}"/><g transform="translate(27 52)"><g>${move}${fig}</g></g>${bar}</g>`;
  }).join('');
  const beat = t.beat && !still ? `<circle cx="46" cy="88" r="3" fill="#39FF14"><animate attributeName="r" values="3.4;1.6;3.4" dur="0.5s" repeatCount="indefinite"/></circle>` : '';
  return `<svg viewBox="0 0 54 96" class="tp-svg" aria-hidden="true">${parts}${beat}</svg>`;
}

// ---------- Screen ----------

let ui = null;
let main = null;
let target = null;   // a project to apply to, when you came from its editor
let tab = 'signed';

export async function renderGallery(container, uiApi, params = {}) {
  ui = uiApi;
  main = container;
  target = params.id ? await PROJECTS.get(params.id).catch(() => null) : null;
  if (target?.template?.id) tab = templateById(target.template.id)?.goal || tab;
  draw();
}

function draw() {
  main.innerHTML = '';
  const wrap = el('section', 'tp');
  const head = el('header', 'screen-head');
  head.append(el('p', 'label', 'Templates'), el('h1', null, 'Pick a template'));
  wrap.appendChild(head);
  wrap.appendChild(el('p', 'note', 'Pick a template, pick your clips, and Cake Walk fills the shots. Then tweak and export.'));
  if (target) {
    const card = el('div', 'card rx-target');
    card.append(el('p', 'label', 'For'), el('b', null, target.name));
    wrap.appendChild(card);
  }
  wrap.appendChild(chipRow(GOALS, tab, (v) => { tab = v; draw(); }));
  const grid = el('div', 'tp-grid');
  const still = reduceMotion();
  TEMPLATES.filter((t) => t.goal === tab).forEach((t) => {
    const lane = defaultLane(t, target?.lane);
    const card = el('button', 'tp-card');
    card.type = 'button';
    const prev = el('div', 'tp-prev');
    prev.innerHTML = previewSVG(t, lane, { still });
    const info = el('div', 'tp-info');
    const pills = el('div', 'tp-pills');
    (t.lane === 'either' ? ['PRO', 'CREATIVE'] : [t.lane]).forEach((l) => pills.appendChild(el('span', `pill ${l === 'PRO' ? 'pill-chrome' : 'pill-pink'}`, l)));
    info.append(el('h3', null, t.name), pills, el('p', 'muted small', rangeText(t)), el('p', 'small', t.about));
    card.append(prev, info);
    card.addEventListener('click', () => detail(t));
    grid.appendChild(card);
  });
  wrap.appendChild(grid);
  main.appendChild(wrap);
}

function shotList(t, length) {
  const box = el('div');
  if (t.remix) { box.appendChild(el('p', 'small', 'The shots come from the video you remix.')); return box; }
  if (t.each) {
    box.appendChild(el('p', 'small', `One shot per ${t.each.name.toLowerCase()}, ${t.each.minLen} to ${t.each.maxLen} seconds each${t.beat ? ', cut on the beat' : ''}.`));
    if (t.each.move === 'pushin') box.appendChild(el('p', 'muted small', 'Each one has a slow push-in.'));
    return box;
  }
  const slots = planSlots(t, { length });
  const ol = el('ol', 'tp-shots');
  slots.forEach((x) => {
    const li = el('li');
    li.append(el('span', null, x.name), el('b', null, secs(x.len)));
    if (x.tip) li.appendChild(el('small', 'muted', x.tip));
    ol.appendChild(li);
  });
  box.appendChild(ol);
  const total = slots.reduce((a, x) => a + x.len, 0);
  box.appendChild(el('p', 'muted small', `${slots.length} shots, ${mmss(total)}${t.beat ? '. Lengths shown at 120 BPM; with your song they land on its beat.' : '.'}`));
  return box;
}

const MUSIC = {
  none: 'No music. Your clips keep their own sound.',
  voice: 'Your voice on camera. Add music under it if you like.',
  yours: 'Your song from Music. Beat templates cut on its beat.',
  inapp: 'Add the sound inside TikTok or Instagram, so it stays licensed.'
};

async function nextEpisode(name) {
  if (!name) return '';
  const key = name.trim().toLowerCase();
  const eps = (await PROJECTS.list()).filter((p) => p.series?.name?.trim().toLowerCase() === key).map((p) => +p.series.ep || 0);
  return String((eps.length ? Math.max(...eps) : 0) + 1);
}

async function detail(t) {
  const lanes = laneChoices(t);
  const clash = target && t.lane !== 'either' && t.lane !== target.lane;
  let lane = target && !clash ? target.lane : defaultLane(t, target?.lane);
  let length = target ? (target.platform === 'tiktok' ? 'tt' : 'ig') : 'tt';
  const series = { name: target?.series?.name || '', ep: target?.series?.ep || '', show: target?.series ? target.series.show !== false : true };
  const body = el('div', 'tp-detail');
  const top = el('div', 'tp-top');
  const big = el('div', 'tp-prev tp-big');
  const paint = () => { big.innerHTML = previewSVG(t, lane, { still: reduceMotion() }); };
  paint();
  const facts = el('div');
  facts.append(el('p', 'small', t.about), el('p', 'muted small', rangeText(t)));
  top.append(big, facts);
  body.appendChild(top);
  if (lanes.length > 1 && !target) {
    body.appendChild(el('p', 'label', 'Lane'));
    body.appendChild(chipRow(lanes.map((l) => [l, l]), lane, (v) => { lane = v; paint(); lookLine(); }));
  } else if (clash) {
    body.appendChild(el('p', 'note', `This is a ${t.lane} template and ${target.name} is ${target.lane}, so it starts a new video.`));
  }
  if (t.target.ig !== t.target.tt) {
    body.appendChild(el('p', 'label', 'Length'));
    body.appendChild(chipRow([['ig', `Instagram ${mmss(t.target.ig)}`], ['tt', `TikTok ${mmss(t.target.tt)}`]], length, (v) => { length = v; shots.replaceChildren(shotList(t, length)); }));
  }
  body.appendChild(el('p', 'label', 'Shot list'));
  const shots = el('div');
  shots.appendChild(shotList(t, length));
  body.appendChild(shots);
  body.appendChild(el('p', 'label', 'Look'));
  const look = el('p', 'small');
  const lookLine = () => {
    const lk = lookFor(t, lane);
    const tr = [TRANSITIONS[lk.transition] || 'Cut'];
    if (lk.drop) tr.push(`${TRANSITIONS[lk.drop]} on the drop`);
    if (lk.after) tr.push(`${TRANSITIONS[lk.after]} after the drop`);
    if (lk.last) tr.push(`${TRANSITIONS[lk.last]} into the end`);
    look.textContent = `${TEXT_STYLES[lk.text] || 'Clean Pro'} text · ${tr.join(', ')} · ${GRADES[lk.grade]?.label || 'Natural'} color`;
  };
  lookLine();
  body.appendChild(look);
  body.appendChild(el('p', 'small muted', MUSIC[t.music] || ''));
  body.appendChild(el('p', 'label', 'Caption starter'));
  const cap = fillText(t.caption, ui.settings).text;
  body.appendChild(el('p', 'small tp-caption', `${cap}\n${t.tags.slice(0, 5).join(' ')}`));
  if (t.notes?.length) {
    const ul = el('ul', 'tp-notes');
    t.notes.forEach((n) => ul.appendChild(el('li', null, n)));
    body.appendChild(ul);
  }
  // Series: a tag and an episode number, carried by the project.
  body.appendChild(el('p', 'label', 'Series (optional)'));
  const srow = el('div', 'tp-series');
  const nameF = el('label', 'field');
  nameF.innerHTML = '<span>Series name</span><input autocomplete="off" autocapitalize="words" maxlength="40">';
  const epF = el('label', 'field');
  epF.innerHTML = '<span>Episode</span><input inputmode="numeric" maxlength="3">';
  $('input', nameF).value = series.name;
  $('input', epF).value = series.ep;
  $('input', nameF).addEventListener('change', async (e) => {
    series.name = e.target.value.trim();
    if (series.name && !$('input', epF).value) $('input', epF).value = await nextEpisode(series.name);
    series.ep = $('input', epF).value;
  });
  $('input', epF).addEventListener('input', (e) => { series.ep = e.target.value.replace(/\D/g, '').slice(0, 3); e.target.value = series.ep; });
  srow.append(nameF, epF);
  body.appendChild(srow);
  const showF = el('label', 'tp-check');
  showF.innerHTML = '<input type="checkbox"><span>Show it on the video for the first 3 seconds</span>';
  $('input', showF).checked = series.show;
  $('input', showF).addEventListener('change', (e) => { series.show = e.target.checked; });
  body.appendChild(showF);

  const actions = [{ label: 'Cancel', value: null }];
  if (target && !clash) actions.push({ label: t.remix ? 'Remix this project' : 'Use on this project', value: 'here', main: true });
  else actions.push({ label: t.remix ? 'Start in Remix' : 'Start a new video', value: 'new', main: true });
  const choice = await ui.sheet({ title: t.name, body, actions });
  if (!choice) return;
  series.name = $('input', nameF).value.trim();
  series.ep = series.name ? ($('input', epF).value || await nextEpisode(series.name)) : '';
  const opts = { lane, length, series: series.name ? { name: series.name, ep: series.ep, show: series.show } : null };
  if (choice === 'new') await startNew(t, opts);
  else await useHere(t, opts);
}

// ---------- Using a template ----------

// A new project from a template. Its clips come next: the editor opens its Add sheet, and the shots fill after.
async function startNew(t, { lane, length, series }) {
  const name = series ? `${series.name} · Ep ${series.ep}` : t.name;
  const p = await PROJECTS.create({ name, lane });
  p.platform = length === 'ig' ? 'reels' : 'tiktok';
  p.series = series;
  p.template = templateRecord(t, { lane, length, slots: [], pending: !t.remix });
  p.caption = captionFor(t, series);
  p.template.caption = p.caption;
  if (!t.remix) {
    const lk = lookFor(t, lane);
    p.grade = buildTemplate(t, { lane, slots: [], sources: [], uid }).grade || lk.grade || 'natural';
  }
  await SAVE.now(`project:${p.id}`, () => PROJECTS.save(p));
  DEBUG.log('info', `Template: new ${lane} project from ${t.id}`, 'templates');
  if (t.remix) { ui.go('remix', { id: p.id }); return; }
  ui.go('editor', { id: p.id, addClips: true });
}

async function useHere(t, { length, series }) {
  const p = target;
  if (series) p.series = series;
  if (t.remix) {
    p.template = templateRecord(t, { lane: p.lane, length, slots: [] });
    if (!p.caption?.trim()) { p.caption = captionFor(t, p.series); p.template.caption = p.caption; }
    await SAVE.now(`project:${p.id}`, () => PROJECTS.save(p));
    ui.go('remix', { id: p.id });
    return;
  }
  const rec = { ...templateRecord(t, { lane: p.lane, length, slots: [] }), caption: p.template?.caption };
  if (!p.clips.length) {
    p.template = { ...rec, pending: true };
    await SAVE.now(`project:${p.id}`, () => PROJECTS.save(p));
    ui.go('editor', { id: p.id, addClips: true });
    return;
  }
  const ok = await ui.sheet({
    title: 'Fill the shots?',
    text: `Cake Walk refills ${p.name} with your ${sourcesOf(p).length} clips, in the order they sit on your timeline. Your own text and stickers stay. Undo in the editor brings your old timeline back.`,
    actions: [{ label: 'Cancel', value: false }, { label: 'Fill the shots', value: true, main: true }]
  });
  if (!ok) return;
  const hist = await UNDO.load(p.id);
  hist.undo.push(JSON.stringify({ clips: p.clips, music: p.music, texts: p.texts, stickers: p.stickers, grade: p.grade }));
  UNDO.save(p.id, hist.undo, []);
  p.template = rec;
  const res = await fillProject(p, ui);
  await SAVE.now(`project:${p.id}`, () => PROJECTS.save(p));
  await SAVE.flush();
  await ui.go('editor', { id: p.id });
  if (res) ui.toast(doneText(res), { sparkle: true, ms: 4200 });
}

function captionFor(t, series) {
  const cap = buildTemplate(t, { lane: 'PRO', slots: [], sources: [], settings: ui.settings, uid }).caption;
  return series ? `${seriesLabel(series)}\n\n${cap}` : cap;
}

export function doneText(res) {
  const names = res.missing.map((m) => ({ proHandle: 'PRO handle' }[m] || m));
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  const miss = names.length ? ` Add your ${list} in Settings to show ${names.length > 1 ? 'them' : 'it'}.` : '';
  const beat = res.beatSource === 'song' ? ' Cuts land on your song\'s beat.' : res.beatSource === 'grid' ? ' Add your song, then Fill again, to cut on its beat.' : '';
  return `Filled ${res.shots} shots.${beat}${miss}`;
}

// Your song's beats, found once and kept with the song.
export async function songBeats(project, uiApi) {
  const a = project.music && project.assets[project.music.assetId];
  if (!a?.path) return null;
  if (Array.isArray(a.beats)) return a.beats;
  const job = uid();
  const box = el('div', 'sheet-backdrop');
  box.innerHTML = '<div class="sheet"><div class="sheet-grab"></div><p class="label">Template</p><h2>Finding your song\'s beat</h2><div class="bar"><i></i></div><p class="muted small">Keep Cake Walk open.</p><div class="row"><button class="btn btn-ghost">Skip</button></div></div>';
  $('#sheet-root')?.appendChild(box);
  $('.row .btn', box).addEventListener('click', () => WORKER.call('remix.cancel', { job }).catch(() => {}));
  const off = WORKER.onEvent((m) => { if (m.type === 'remix-progress' && m.job === job) $('.bar i', box).style.width = `${Math.round(m.value * 100)}%`; });
  try {
    const res = await WORKER.call('remix.analyze', { job, path: a.path, cuts: false }, [], 10 * 60 * 1000);
    a.beats = (res.beats || []).map((x) => +(+x).toFixed(3));
    a.bpm = res.bpm || null;
    return a.beats;
  } catch (err) {
    if (err.name !== 'AbortError') { DEBUG.log('warn', `Template beats: ${err.message}`, 'templates'); uiApi?.toast('Couldn\'t read your song\'s beat, so the cuts use a steady 120 BPM.'); }
    return null;
  } finally {
    off();
    box.remove();
  }
}

// Fills the project from project.template (its id, lane and length): clips, template text and stickers, the
// color preset and, if the caption is empty or still the template's, the caption starter. Your own text and
// stickers stay. The caller keeps the undo step. Returns { shots, missing, beatSource } or null.
export async function fillProject(project, uiApi) {
  const rec = project.template;
  const t = rec && templateById(rec.id);
  if (!t || t.remix) return null;
  const sources = sourcesOf(project);
  if (!sources.length) return null;
  const lane = project.lane;
  let beats = null;
  if (t.beat && project.music) beats = await songBeats(project, uiApi);
  const beatSource = t.beat ? (beats?.length >= 4 ? 'song' : 'grid') : null;
  const slots = planSlots(t, { length: rec.length, count: sources.length, beats: beatSource === 'song' ? beats : null });
  const out = buildTemplate(t, { lane, slots, sources, settings: uiApi.settings || {}, uid });
  if (!out.clips.length) return null;
  const byAsset = new Map();
  project.clips.forEach((c) => { if (!byAsset.has(c.assetId)) byAsset.set(c.assetId, c); });
  project.clips = out.clips.map((c) => {
    const from = byAsset.get(c.assetId);
    if (from?.color) c.color = { ...from.color };
    if (from?.frame) c.frame = JSON.parse(JSON.stringify(from.frame));
    if (from) { c.volume = from.volume ?? 1; c.muted = c.muted || !!from.muted; }
    return c;
  });
  const total = project.clips.reduce((a, c) => a + (c.out - c.in) / c.speed, 0);
  const own = (x) => x.from !== 'template' && x.from !== 'series';
  const seriesText = project.series?.name && project.series.show !== false ? [{
    ...TEXT_DEFAULT, id: uid(), from: 'series', text: seriesLabel(project.series), style: lookFor(t, lane).text || 'clean',
    y: 0.14, size: 0.028, start: 0, end: +Math.min(3, total).toFixed(3)
  }] : [];
  project.texts = [...(project.texts || []).filter(own), ...out.texts, ...seriesText];
  project.stickers = [...(project.stickers || []).filter(own), ...out.stickers];
  project.grade = out.grade;
  if (t.music === 'none') project.music = null;
  const starter = project.series ? `${seriesLabel(project.series)}\n\n${out.caption}` : out.caption;
  if (!project.caption?.trim() || project.caption === rec.caption) project.caption = starter;
  project.recipeId = null;
  project.guide = null;
  project.template = { ...templateRecord(t, { lane, length: rec.length, slots, beatSource }), caption: project.caption };
  DEBUG.log('info', `Template: ${t.id} filled ${out.clips.length} shots from ${sources.length} clips (${beatSource || 'timed'})`, 'templates');
  return { shots: out.clips.length, missing: out.missing, beatSource };
}

// ---------- In the editor ----------

// Before picking clips for a template: what to pick, in what order. Returns 'quick', 'files' or null.
export function addClipsSheet(uiApi, project) {
  const t = templateById(project.template?.id);
  if (!t) return Promise.resolve(null);
  const body = el('div');
  if (t.each) body.appendChild(el('p', 'small', `Pick your ${t.each.name.toLowerCase()}s in the order you want them${t.each.min > 1 ? ` (${t.each.min} to ${t.each.max})` : ''}.`));
  else {
    body.appendChild(el('p', 'small', 'Pick your clips in shot order. One clip can fill more than one shot.'));
    const ol = el('ol', 'tp-shots');
    planSlots(t, { length: project.template.length }).forEach((x) => {
      if (x.pool === 'first' && x.start > 0) return;   // reuses your first clip
      const li = el('li');
      li.append(el('span', null, x.name));
      ol.appendChild(li);
    });
    body.appendChild(ol);
  }
  body.appendChild(el('p', 'muted small', 'For full quality, save clips to Files first and pick Original.'));
  return uiApi.sheet({ title: `Clips for ${t.name}`, body, actions: [{ label: 'Quick (Photos)', value: 'quick' }, { label: 'Original (Files)', value: 'files', main: true }] });
}

// api: { ui, project, remember(), changed(), clipLen(c) }
export async function templateSheet(api) {
  const { project } = api;
  const rec = project.template;
  const t = templateById(rec?.id);
  if (!t) { api.ui.go('templates', { id: project.id }); return; }
  const body = el('div');
  const beatTxt = rec.beatSource === 'song' ? ' · on your song\'s beat' : rec.beatSource === 'grid' ? ' · 120 BPM' : '';
  body.appendChild(el('p', 'muted small', `${project.lane} · ${rec.length === 'tt' ? 'TikTok' : 'Instagram'} length${beatTxt}${project.series?.name ? ` · ${seriesLabel(project.series)}` : ''}`));
  if (rec.slots?.length) {
    const ol = el('ol', 'tp-shots');
    rec.slots.forEach((x, i) => {
      const clip = project.clips.find((c) => c.slot === i);
      const li = el('li');
      li.append(el('span', null, x.name), el('b', null, secs(x.len)));
      li.appendChild(el('small', 'muted', clip ? (project.assets[clip.assetId]?.name || 'clip') : 'empty'));
      ol.appendChild(li);
    });
    body.appendChild(ol);
    body.appendChild(el('p', 'muted small', 'Tap a clip on the timeline, then Slot, to swap which clip fills a shot.'));
  }
  const choice = await api.ui.sheet({
    title: t.name, body,
    actions: [{ label: 'Another template', value: 'other' }, { label: 'Fill again', value: 'fill', main: true }]
  });
  if (choice === 'other') { await api.leave?.(); api.ui.go('templates', { id: project.id }); }
  if (choice === 'fill') {
    if (!sourcesOf(project).length) { api.ui.toast('Add clips first.'); return; }
    api.remember();
    const res = await fillProject(project, api.ui);
    if (!res) { api.ui.toast('Nothing to fill.'); return; }
    api.changed();
    api.refresh?.();
    api.ui.toast(doneText(res), { sparkle: true, ms: 4200 });
  }
}
