// Cake Walk: TEMPLATES (Prompt 8). One-tap edit templates: timing slots, a shot list, text style, transitions,
// a color preset, a caption starter, up to 5 hashtags and a lane. Plain data and plain functions (no DOM).
// Your name, height, city, handle and email come from Settings when a template is used, never from this file.

import { TEXT_DEFAULT, laneTransition, laneGrade } from './look.js';

export const GOALS = [['signed', 'Get signed'], ['booked', 'Get booked'], ['views', 'Get views'], ['cute', 'Just cute']];
export const GRID_BPM = 120;          // beat templates use this beat when your project has no song yet
const BEAT = 60 / GRID_BPM;

// A shot measured in seconds (s) or in beats (b). fixed: keeps its length when the template is stretched.
// pool: which of your clips fills it: 'first' (your first clip, from its start, for loops and end cards),
// 'rest' (every clip but the first) or all of them (default).
const s = (name, len, more = {}) => ({ name, len, ...more });
const b = (name, beats, more = {}) => ({ name, beats, ...more });

const PRO_LOOK = { text: 'clean', font: 'sans', transition: 'cut', grade: 'natural' };

// texts: { slot (index or 'last'), text, y, size, span: 'slot' (whole shot) or seconds from the shot's start }
export const TEMPLATES = [
  {
    id: 'digitals', name: 'Digitals video', goal: 'signed', lane: 'PRO', ig: [30, 45], tt: [30, 45], target: { ig: 45, tt: 45 },
    pace: 'model', music: 'none',
    about: 'The video agencies ask for. Clean, true to life, no music.',
    shots: [
      s('Front close-up', 2, { fixed: true, tip: 'Face the camera, neutral expression' }),
      s('Left profile', 4), s('Right profile', 4),
      s('Waist-up', 5), s('Full length', 5),
      s('Slow 360', 12, { tip: 'Turn slowly on the spot, arms relaxed' }),
      s('Walk to camera', 10),
      s('End card', 3, { fixed: true, pool: 'first' })
    ],
    looks: { PRO: PRO_LOOK },
    texts: [
      { slot: 0, text: '{name}', y: 0.67, size: 0.05 },
      { slot: 0, text: '{height} · {city}', y: 0.73, size: 0.034 },
      { slot: 'last', text: '{name}', y: 0.44, size: 0.055 },
      { slot: 'last', text: '{proHandle}', y: 0.51, size: 0.034 }
    ],
    caption: 'Digitals. | {name} · {height} · {city}. | No filter, no edits.',
    tags: ['#digitals', '#modeldigitals', '#newfaces', '#model', '#polaroids'],
    notes: ['No music, no filter, hard cuts only.', 'Your name, height and city come from Settings.']
  },
  {
    id: 'walk', name: 'Walk video', goal: 'signed', lane: 'PRO', ig: [30, 45], tt: [30, 45], target: { ig: 36, tt: 36 },
    pace: 'model', music: 'none',
    about: 'Your walk, in heels and flats, the way agents want to see it.',
    shots: [
      s('Heels: walk toward camera', 9), s('Heels: turn', 3), s('Heels: walk away', 6),
      s('Flats: walk toward camera', 9), s('Flats: turn', 3), s('Flats: walk away', 6)
    ],
    looks: { PRO: PRO_LOOK },
    texts: [],
    caption: 'Walk check. Heels and flats, no edits.',
    tags: ['#modelwalk', '#runwaywalk', '#newfaces', '#model', '#catwalk'],
    notes: ['Camera locked at hip height.', 'Ambient sound only, so no music is added.']
  },
  {
    id: 'meet', name: 'Meet the model', goal: 'signed', lane: 'PRO', ig: [45, 75], tt: [60, 90], target: { ig: 60, tt: 75 },
    pace: 'pro', music: 'voice', pin: true,
    about: 'A pinned intro: who you are, your work and how to book you.',
    shots: [
      s('Spoken hook: name, height, city', 8, { tip: 'Say who you are, straight to camera' }),
      s('Work clip 1', 9), s('Work clip 2', 9), s('Work clip 3', 9),
      s('Personality beat', 20, { tip: 'Something that shows you off set' }),
      s('Booking card', 5, { fixed: true, pool: 'first' })
    ],
    looks: { PRO: PRO_LOOK },
    texts: [
      { slot: 0, text: "Hi, I'm {name}", y: 0.16, size: 0.045, span: 3 },
      { slot: 0, text: '{height} · {city}', y: 0.22, size: 0.034, span: 3 },
      { slot: 'last', text: 'Booking', y: 0.42, size: 0.04 },
      { slot: 'last', text: '{email}', y: 0.48, size: 0.034 },
      { slot: 'last', text: '{proHandle}', y: 0.53, size: 0.034 }
    ],
    caption: "Hi, I'm {name}. | {height} · {city}. | Here's a little of my work and a little of me.",
    tags: ['#meetthemodel', '#model', '#newfaces', '#modeling', '#introduction'],
    notes: ['Pin it to the top of your profile.', 'Add captions with TikTok or Edits auto-captions after upload, or type them with the Text tool.']
  },
  {
    id: 'bts', name: 'Shoot-day BTS', goal: 'booked', lane: 'PRO', ig: [45, 90], tt: [60, 150], target: { ig: 60, tt: 90 },
    pace: 'pro', music: 'yours',
    about: 'A shoot day from the best frame to the team credits.',
    shots: [
      s('Best final frame', 3, { tip: 'Open on the strongest image' }),
      s('Arrival', 6), s('Glam', 12), s('Set', 15),
      s('Final images next to BTS', 18, { tip: 'Film the final image on a screen beside you, or cut between them' }),
      s('Team credits card', 6, { fixed: true, pool: 'first' })
    ],
    looks: { PRO: PRO_LOOK },
    texts: [
      { slot: 'last', text: 'Photo @ · Glam @ · Styling @', y: 0.48, size: 0.032 }
    ],
    caption: 'Shoot day, start to finish. Team credits on the last frame.',
    tags: ['#bts', '#behindthescenes', '#photoshoot', '#model', '#setlife'],
    notes: ['Only post set images once the client says you can (many shoots have a release date).', 'Type your team\'s handles into the credits card.']
  },
  {
    id: 'transformation', name: 'Transformation', goal: 'views', lane: 'either', ig: [30, 60], tt: [30, 75], target: { ig: 30, tt: 45 },
    pace: 'beat', beat: true, music: 'yours',
    about: 'Everyday to glam, with a hard cut on the beat drop.',
    shots: [
      b('Everyday clip with a text hook', 8, { pool: 'first' }),
      b('Look 1 (beat drop)', 8, { pool: 'rest', drop: true }), b('Look 2', 8, { pool: 'rest' }), b('Look 3', 8, { pool: 'rest' }),
      b('Look 4', 8, { pool: 'rest' }), b('Look 5', 8, { pool: 'rest' }), b('Look 6', 8, { pool: 'rest' }),
      b('Back to the start (loop)', 4, { pool: 'first' })
    ],
    looks: {
      PRO: PRO_LOOK,
      CREATIVE: { text: 'bubble', font: 'sans', transition: 'cut', after: 'zoom', grade: 'natural' }
    },
    texts: [{ slot: 0, text: 'Everyday me vs. on set', y: 0.2, size: 0.045 }],
    caption: 'Everyday to on set.',
    tags: ['#transformation', '#glowup', '#model', '#beforeandafter', '#fashion'],
    notes: ['Pick your everyday clip first, then 3 to 6 looks.', 'The cuts land on your song\'s beat. If its drop isn\'t on the first cut, drag that cut to it.', 'The last shot goes back to your first clip, so it loops.']
  },
  {
    id: 'posing', name: 'Posing breakdown', goal: 'booked', lane: 'PRO', ig: [45, 90], tt: [60, 150], target: { ig: 60, tt: 90 },
    pace: 'pro', music: 'yours',
    about: 'A hook pose, then three rounds of wrong, fixed and why.',
    shots: [
      s('Hook pose', 5),
      s('Round 1: wrong', 4), s('Round 1: fixed', 5), s('Round 1: why', 7),
      s('Round 2: wrong', 4), s('Round 2: fixed', 5), s('Round 2: why', 7),
      s('Round 3: wrong', 4), s('Round 3: fixed', 5), s('Round 3: why', 7),
      s('Hero frame', 7)
    ],
    looks: { PRO: PRO_LOOK },
    texts: [
      { slot: 0, text: '3 posing fixes', y: 0.18, size: 0.05 },
      { slot: 1, text: 'Not this', y: 0.18, size: 0.045 }, { slot: 2, text: 'This', y: 0.18, size: 0.045 }, { slot: 3, text: 'Why: (type the fix)', y: 0.18, size: 0.036 },
      { slot: 4, text: 'Not this', y: 0.18, size: 0.045 }, { slot: 5, text: 'This', y: 0.18, size: 0.045 }, { slot: 6, text: 'Why: (type the fix)', y: 0.18, size: 0.036 },
      { slot: 7, text: 'Not this', y: 0.18, size: 0.045 }, { slot: 8, text: 'This', y: 0.18, size: 0.045 }, { slot: 9, text: 'Why: (type the fix)', y: 0.18, size: 0.036 }
    ],
    caption: 'Three posing fixes I use on every shoot.',
    tags: ['#posingtips', '#posing', '#modeltips', '#model', '#photoshoot'],
    notes: ['Tap each "Why" text to type the fix.']
  },
  {
    id: 'casting', name: 'Casting or open-call POV', goal: 'signed', lane: 'PRO', ig: [60, 90], tt: [90, 180], target: { ig: 75, tt: 120 },
    pace: 'pro', music: 'yours',
    about: 'Your casting day from prep to outcome.',
    shots: [s('Hook text', 4), s('Prep', 18), s('Travel', 15), s('Waiting', 18), s('Outcome', 20)],
    looks: { PRO: PRO_LOOK },
    texts: [{ slot: 0, text: 'POV: open call day', y: 0.2, size: 0.045 }],
    caption: 'Open call day. Here\'s how it went.',
    tags: ['#casting', '#opencall', '#modellife', '#model', '#newfaces'],
    notes: ['Never film inside an agency without permission.']
  },
  {
    id: 'styling', name: 'Styling breakdown', goal: 'booked', lane: 'PRO', ig: [45, 90], tt: [60, 150], target: { ig: 60, tt: 90 },
    pace: 'pro', music: 'yours',
    about: 'The finished look, then piece by piece with brand tags.',
    shots: [
      s('Finished look', 6),
      s('Piece 1', 7), s('Piece 2', 7), s('Piece 3', 7), s('Piece 4', 7),
      s('Alternate 1', 8), s('Alternate 2', 8),
      s('Walk', 10)
    ],
    looks: { PRO: PRO_LOOK },
    texts: [
      { slot: 1, text: 'Piece: @brand', y: 0.74, size: 0.036 }, { slot: 2, text: 'Piece: @brand', y: 0.74, size: 0.036 },
      { slot: 3, text: 'Piece: @brand', y: 0.74, size: 0.036 }, { slot: 4, text: 'Piece: @brand', y: 0.74, size: 0.036 }
    ],
    caption: 'Every piece of this look, broken down.',
    tags: ['#styling', '#outfitbreakdown', '#fashion', '#ootd', '#model'],
    notes: ['If a piece was gifted or paid for, turn on the app\'s paid partnership or branded content label when you post.']
  },
  {
    id: 'campaign', name: 'Campaign-style mini film', goal: 'booked', lane: 'PRO', ig: [30, 60], tt: [45, 90], target: { ig: 30, tt: 45 },
    pace: 'beat', beat: true, music: 'yours',
    about: 'A hero frame, quick beat cuts, the product and your name.',
    shots: [
      b('Hero frame', 6),
      b('Shot 1', 4), b('Shot 2', 2), b('Shot 3', 4), b('Shot 4', 6), b('Shot 5', 2),
      b('Shot 6', 4), b('Shot 7', 4), b('Shot 8', 2), b('Shot 9', 6),
      b('Product moment', 8),
      b('Name title card', 12, { pool: 'first' })
    ],
    looks: { PRO: { ...PRO_LOOK, last: 'crossfade' } },
    texts: [{ slot: 'last', text: '{name}', y: 0.48, size: 0.06, font: 'didot' }],
    caption: 'A little film from set.',
    tags: ['#campaign', '#fashionfilm', '#model', '#editorial', '#fashion'],
    notes: ['Shots run 1 to 3 seconds each, cut on the beat.', 'Only post client work after its release date, with the client\'s OK.']
  },
  {
    id: 'runway', name: 'Runway or event recap', goal: 'booked', lane: 'PRO', ig: [30, 60], tt: [45, 90], target: { ig: 45, tt: 60 },
    pace: 'pro', music: 'yours',
    about: 'Runway, backstage, line-up, walk, finale and the designer credit.',
    shots: [s('Runway moment', 6), s('Backstage', 10), s('Line-up', 8), s('Walk', 12), s('Finale', 6), s('Designer credit', 3, { fixed: true })],
    looks: { PRO: PRO_LOOK },
    texts: [{ slot: 'last', text: 'Designer: @', y: 0.48, size: 0.04 }],
    caption: 'Show day, from the runway to the finale.',
    tags: ['#runway', '#fashionweek', '#backstage', '#model', '#runwaymodel'],
    notes: ['Some shows don\'t allow backstage posts. Check before you post.']
  },
  {
    id: 'character', name: 'Character transformation', goal: 'views', lane: 'CREATIVE', ig: [30, 60], tt: [30, 90], target: { ig: 30, tt: 45 },
    pace: 'beat', beat: true, music: 'yours',
    about: 'Reference next to you, everyday you, then the reveal on the drop.',
    shots: [
      b('Reference-vs-me split', 12, { pool: 'first', tip: 'Film this one as a split: hold a printed picture or a second screen next to you' }),
      b('Everyday clip', 12),
      b('Reveal (beat drop)', 8, { drop: true }), b('Reveal 2', 8), b('Reveal 3', 8), b('Reveal 4', 8),
      b('Back to the start (loop)', 4, { pool: 'first' })
    ],
    looks: { CREATIVE: { text: 'bubble', font: 'sans', transition: 'cut', drop: 'sparkle', grade: 'natural' } },
    texts: [{ slot: 0, text: 'Me as [character]', y: 0.18, size: 0.045 }],
    stickers: [{ slot: 2, kind: 'sparkle', x: 0.8, y: 0.2, size: 0.14 }],
    caption: 'Everyday me to [character].',
    tags: ['#transformation', '#cosplay', '#character', '#glowup', '#model'],
    notes: ['Cake Walk has one video track, so the split is a shot you film.', 'Use a reference picture you\'re allowed to show.']
  },
  {
    id: 'trend', name: 'Trend remix', goal: 'views', lane: 'either', defaultLane: 'CREATIVE', ig: [30, 45], tt: [30, 60], target: { ig: 30, tt: 45 },
    pace: 'beat', remix: true, music: 'inapp',
    about: 'Copy the timing of a trend you like with Remix.',
    shots: [],
    looks: {
      PRO: PRO_LOOK,
      CREATIVE: { text: 'bubble', font: 'sans', transition: 'cut', grade: 'natural' }
    },
    texts: [],
    caption: 'Tried the trend.',
    tags: ['#trend', '#modeltok', '#fashion', '#model', '#remix'],
    notes: ['Remix copies the timing only.', 'Add the trend\'s sound inside TikTok or Instagram, so it stays licensed.']
  },
  {
    id: 'portfolio', name: 'Portfolio reel', goal: 'signed', lane: 'PRO', ig: [30, 45], tt: [30, 45], target: { ig: 36, tt: 36 },
    pace: 'beat', beat: true, music: 'yours',
    about: '9 to 15 portfolio photos with a slow push-in, cut on the beat.',
    each: { name: 'Photo', min: 9, max: 15, minLen: 2, maxLen: 5, move: 'pushin' },
    looks: { PRO: PRO_LOOK },
    texts: [
      { slot: 0, text: '{name}', y: 0.67, size: 0.05, span: 3 },
      { slot: 0, text: '{height} · {city}', y: 0.73, size: 0.034, span: 3 },
      { slot: 'last', text: '{proHandle}', y: 0.74, size: 0.036 }
    ],
    caption: 'Portfolio update.',
    tags: ['#portfolio', '#modelportfolio', '#editorial', '#model', '#newfaces'],
    notes: ['Pick 9 to 15 photos, in the order you want them.', 'Only use photos you\'re allowed to post, and credit the photographers in the caption.']
  },
  {
    id: 'outfit', name: 'Outfit check', goal: 'cute', lane: 'either', ig: [30, 45], tt: [30, 45], target: { ig: 30, tt: 30 },
    pace: 'beat', beat: true, music: 'yours',
    about: '3 to 5 angles of your look, item text, cut on the beat.',
    shots: [
      b('Full look', 6),
      ...Array.from({ length: 12 }, (_, i) => b(`Angle ${i + 1}`, 4)),
      b('Full look again', 6, { pool: 'first' })
    ],
    looks: {
      PRO: PRO_LOOK,
      CREATIVE: { text: 'bubble', font: 'sans', transition: 'cut', grade: 'natural' }
    },
    texts: [
      { slot: 0, text: 'Outfit check', y: 0.18, size: 0.05 },
      { slot: 1, text: 'Top: @brand', y: 0.74, size: 0.036, span: 'slots3' },
      { slot: 4, text: 'Bottom: @brand', y: 0.74, size: 0.036, span: 'slots3' },
      { slot: 7, text: 'Shoes: @brand', y: 0.74, size: 0.036, span: 'slots3' }
    ],
    caption: 'Outfit check.',
    tags: ['#outfitcheck', '#ootd', '#fashion', '#style', '#outfit'],
    notes: ['Pick 3 to 5 angles. They take turns, a fresh part each time.', 'Gifted or paid pieces need the app\'s paid partnership label.']
  },
  {
    id: 'grwm', name: 'Glam GRWM', goal: 'cute', lane: 'CREATIVE', ig: [45, 90], tt: [45, 90], target: { ig: 60, tt: 60 },
    pace: 'creative', music: 'yours',
    about: 'Get ready with me, with gloss text, sparkle wipes and stickers.',
    shots: [s('Bare-face hook', 5), s('Skin', 10), s('Base', 10), s('Eyes', 10), s('Lips', 8), s('Hair', 8), s('Final look', 9)],
    looks: { CREATIVE: { text: 'gloss', font: 'sans', color: 'white', transition: 'sparkle', grade: 'pinkhaze' } },
    texts: [
      { slot: 0, text: 'Get ready with me', y: 0.18, size: 0.05 },
      { slot: 'last', text: 'Final look', y: 0.18, size: 0.05 }
    ],
    stickers: [
      { slot: 0, kind: 'sparkle', x: 0.8, y: 0.2, size: 0.12 },
      { slot: 'last', kind: 'chromeHeart', x: 0.8, y: 0.2, size: 0.13 }
    ],
    caption: 'Get ready with me.',
    tags: ['#grwm', '#getreadywithme', '#makeup', '#glam', '#beauty'],
    notes: ['Gifted or paid products need the app\'s paid partnership label.']
  },
  {
    id: 'dump', name: 'Photo dump', goal: 'cute', lane: 'either', ig: [30, 60], tt: [30, 60], target: { ig: 30, tt: 30 },
    pace: 'beat', beat: true, music: 'yours',
    about: 'Photos and clips, cut on the beat.',
    each: { name: 'Pic', min: 1, max: 60, minLen: 1, maxLen: 3 },
    looks: {
      PRO: PRO_LOOK,
      CREATIVE: { text: 'bubble', font: 'sans', transition: 'cut', grade: 'y2k' }
    },
    texts: [{ slot: 0, text: 'Lately', y: 0.18, size: 0.05, span: 2 }],
    caption: 'Lately.',
    tags: ['#photodump', '#dump', '#model', '#lately', '#fashion'],
    notes: ['Pick 10 to 30 photos and clips, in order.']
  }
];

export const templateById = (id) => TEMPLATES.find((t) => t.id === id) || null;
export const laneChoices = (t) => (t.lane === 'either' ? ['PRO', 'CREATIVE'] : [t.lane]);
export const defaultLane = (t, projectLane) => (t.lane === 'either' ? (t.defaultLane || projectLane || 'PRO') : t.lane);
export const lookFor = (t, lane) => t.looks[lane] || t.looks.PRO || t.looks.CREATIVE;

// ---------- Your details (from Settings) ----------

const TOKENS = ['name', 'height', 'city', 'proHandle', 'email'];

function handle(v) {
  const h = String(v || '').trim();
  return h && !h.startsWith('@') && !/\s/.test(h) ? `@${h}` : h;
}

// Fills {name}, {height}, {city}, {proHandle} and {email}. Text is written in parts: " | " splits sentences and
// " · " splits pieces. A piece with a missing detail is dropped, and so is a sentence left empty, so a missing
// height never leaves a stray dot or comma. Returns { text, missing: [token] }.
export function fillText(raw, settings = {}) {
  const missing = new Set();
  const value = (key) => (key === 'proHandle' ? handle(settings.proHandle) : String(settings[key] || '').trim());
  const out = [];
  for (const seg of String(raw || '').split(' | ')) {
    const end = /[.!?:]$/.exec(seg)?.[0] || '';
    const body = end ? seg.slice(0, -1) : seg;
    const pieces = [];
    for (const piece of body.split(' · ')) {
      let ok = true;
      const filled = piece.replace(/\{(\w+)\}/g, (m, key) => {
        if (!TOKENS.includes(key)) return m;
        const v = value(key);
        if (!v) { missing.add(key); ok = false; }
        return v;
      });
      if (ok && filled.trim()) pieces.push(filled.trim());
    }
    if (pieces.length) out.push(pieces.join(' · ') + end);
  }
  return { text: out.join(' '), missing: [...missing] };
}

// ---------- Timing ----------

const round = (x, d = 3) => +x.toFixed(d);

// The shot list for a template at a target length. sources: how many clips you picked (for 'each' templates).
// beats: your song's beat times (seconds), or null for the 120 BPM grid. Returns [{ name, start, len, ...shot }].
export function planSlots(t, { length = 'ig', count = 0, beats = null } = {}) {
  const target = t.target[length] || t.target.ig;
  const interval = beatInterval(beats);
  let shots;
  if (t.each) {
    const n = Math.max(1, Math.min(t.each.max, count || t.each.min));
    let per = Math.min(t.each.maxLen, Math.max(t.each.minLen, target / n));
    if (t.beat) per = Math.max(1, Math.round(per / interval)) * interval;
    shots = Array.from({ length: n }, (_, i) => ({ name: `${t.each.name} ${i + 1}`, len: per, move: t.each.move }));
  } else if (t.beat) {
    // Stretch the beat counts to the target, then make each a whole number of beats.
    const total = t.shots.reduce((a, x) => a + x.beats, 0);
    const want = Math.max(total * 0.5, Math.round(target / interval));
    const k = want / total;
    shots = t.shots.map((x) => ({ ...x, len: Math.max(1, Math.round(x.beats * k)) * interval }));
  } else {
    const fixed = t.shots.filter((x) => x.fixed).reduce((a, x) => a + x.len, 0);
    const free = t.shots.reduce((a, x) => a + (x.fixed ? 0 : x.len), 0);
    const k = free ? Math.max(0.2, (target - fixed) / free) : 1;
    shots = t.shots.map((x) => ({ ...x, len: x.fixed ? x.len : x.len * k }));
  }
  let at = 0;
  let slots = shots.map((x) => { const o = { ...x, start: at }; at += x.len; return o; });
  if (t.beat && beats?.length >= 4) {
    slots = onBeats(slots, beats, interval);
    // A song whose first beat comes late can leave the video a little short: the last shot runs on, whole beats
    // at a time, so the length stays in range and every cut stays on the beat.
    const last = slots[slots.length - 1];
    while (last && last.start + last.len < at - 0.01) last.len += interval;
  }
  return slots.map((x) => ({ ...x, start: round(x.start), len: round(x.len) }));
}

function beatInterval(beats) {
  if (!beats || beats.length < 4) return BEAT;
  const gaps = [];
  for (let i = 1; i < beats.length; i++) gaps.push(beats[i] - beats[i - 1]);
  gaps.sort((a, b) => a - b);
  const m = gaps[gaps.length >> 1];
  return m > 0.25 && m < 1.5 ? m : BEAT;
}

// Puts every cut exactly on a beat of your song: shot lengths are whole beats, so cut k lands on the beat that
// many beats in. The first shot starts at 0 and runs to its beat. Past the song's last beat, the beat carries on.
function onBeats(slots, beats, interval) {
  const counts = slots.map((x) => Math.max(1, Math.round(x.len / interval)));
  const at = (j) => (j < beats.length ? beats[j] : beats[beats.length - 1] + (j - beats.length + 1) * interval);
  let j = beats[0] < interval * 0.5 ? 0 : -1;   // a beat right at the start counts as the start
  const marks = [0];
  for (const c of counts) { j += c; marks.push(at(j)); }
  return slots.map((x, i) => ({ ...x, start: marks[i], len: Math.max(0.2, marks[i + 1] - marks[i]) }));
}

// ---------- Filling the slots with your clips ----------

// sources: [{ assetId, kind, duration }] in the order you picked them. Clips take turns inside each pool, longer
// clips are used when a slot is longer than the clip whose turn it is, and each clip moves on to a fresh part
// when it comes back. A clip shorter than every option is slowed down to fit (its own sound mutes, like any
// speed change). Returns [{ assetId, in, out, speed, slot }].
export function fillTemplate(slots, sources) {
  const usable = sources.filter((x) => x && (x.kind === 'photo' || x.duration > 0.1));
  if (!usable.length || !slots.length) return [];
  const pools = {
    all: usable,
    first: [usable[0]],
    rest: usable.length > 1 ? usable.slice(1) : usable
  };
  const turn = { all: 0, first: 0, rest: 0 };
  const used = new Map();
  return slots.map((slot, i) => {
    const key = slot.pool && pools[slot.pool] ? slot.pool : 'all';
    const pool = pools[key];
    let src = null;
    for (let k = 0; k < pool.length; k++) {
      const x = pool[(turn[key] + k) % pool.length];
      if (x.kind === 'photo' || x.duration >= slot.len) { src = x; break; }
    }
    turn[key]++;
    let speed = 1;
    if (!src) {
      src = pool.reduce((a, c) => (c.duration > a.duration ? c : a));
      speed = Math.max(0.25, src.duration / slot.len);
    }
    let inT = 0, outT;
    if (src.kind === 'photo') outT = slot.len;
    else if (speed !== 1) outT = src.duration;
    else if (key === 'first') outT = slot.len;           // loops and end cards start the clip from its top
    else {
      const room = src.duration - slot.len;
      const at = used.get(src.assetId) || 0;
      inT = at <= room ? at : 0;
      outT = inT + slot.len;
      used.set(src.assetId, outT >= src.duration - 0.05 ? 0 : outT);
    }
    return { assetId: src.assetId, in: round(inT), out: round(outT), speed: round(speed, 4), slot: i };
  });
}

// ---------- The whole look: clips, texts, stickers, transitions and grade ----------

// Returns everything a template puts into a project, without touching it. settings: your Settings.
// uid: makes ids. Missing Settings details come back in `missing`, so the app can say what to fill in.
export function buildTemplate(t, { lane, slots, sources, settings = {}, uid }) {
  const look = lookFor(t, lane);
  const filled = fillTemplate(slots, sources);
  const missing = new Set();
  const lastIdx = slots.length - 1;
  const idx = (k) => (k === 'last' ? lastIdx : Math.min(k, lastIdx));
  const clips = filled.map((f, i) => {
    const slot = slots[f.slot];
    const clip = { id: uid(), assetId: f.assetId, in: f.in, out: f.out, speed: f.speed, volume: 1, muted: f.speed !== 1, slot: f.slot };
    let kind = look.transition;
    if (i > 0 && slot.drop && look.drop) kind = look.drop;
    else if (i > 0 && look.after && slots.slice(0, f.slot).some((x) => x.drop)) kind = look.after;
    if (i > 0 && f.slot === lastIdx && look.last) kind = look.last;
    if (i > 0 && kind && kind !== 'cut') clip.transition = { kind: laneTransition(kind, lane) };
    if (slot.move) clip.move = slot.move;
    return clip;
  });
  const texts = [];
  for (const tx of t.texts || []) {
    if (!slots.length) break;
    const sl = slots[idx(tx.slot)];
    const { text, missing: miss } = fillText(tx.text, settings);
    miss.forEach((m) => missing.add(m));
    if (!text) continue;
    let end = sl.start + sl.len;
    if (typeof tx.span === 'number') end = Math.min(end, sl.start + tx.span);
    if (tx.span === 'slots3') { const s3 = slots[Math.min(lastIdx, idx(tx.slot) + 2)]; end = s3.start + s3.len; }
    texts.push({
      ...TEXT_DEFAULT, id: uid(), from: 'template', text,
      font: tx.font || look.font || 'sans', style: look.text || 'clean', color: tx.color || look.color || 'white',
      x: 0.5, y: tx.y ?? 0.42, size: tx.size ?? 0.05,
      start: round(sl.start), end: round(end)
    });
  }
  const stickers = lane === 'CREATIVE' ? (t.stickers || []).filter(() => slots.length).map((st) => {
    const sl = slots[idx(st.slot)];
    return { id: uid(), from: 'template', kind: st.kind, x: st.x, y: st.y, size: st.size, rot: 0, start: round(sl.start), end: round(sl.start + sl.len) };
  }) : [];
  const caption = [fillText(t.caption, settings).text, (t.tags || []).slice(0, 5).join(' ')].filter(Boolean).join('\n\n');
  return { clips, texts, stickers, grade: laneGrade(look.grade || 'natural', lane), caption, missing: [...missing] };
}

// What gets stored on the project, so the editor knows its shot names and can fill again.
export function templateRecord(t, { lane, length, slots, beatSource, pending = false }) {
  return {
    id: t.id, name: t.name, lane, length, pending, beatSource: beatSource || (t.beat ? 'grid' : null),
    slots: slots.map((x) => ({ name: x.name, start: x.start, len: x.len })), at: Date.now()
  };
}

// The Series line: "Series name · Ep 3".
export const seriesLabel = (series) => (series?.name ? `${series.name}${series.ep ? ` · Ep ${series.ep}` : ''}` : '');

// Length to show on a card: "0:30 to 0:45" or "0:45 to 1:15 / 1:00 to 1:30".
export function rangeText(t) {
  const f = (x) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`;
  const r = (a) => `${f(a[0])} to ${f(a[1])}`;
  return t.ig[0] === t.tt[0] && t.ig[1] === t.tt[1] ? r(t.ig) : `${r(t.ig)} / ${r(t.tt)}`;
}
