// Cake Walk: CONFIG
// One place for numbers and names that change. APP_VERSION must match sw.js.

export const CONFIG = Object.freeze({
  APP_NAME: 'Cake Walk',
  APP_VERSION: '1.5.0',

  // Mediabunny: one exact version, ES module build, served by jsDelivr.
  // 1.66.4 was the newest 1.x on the npm registry on Nov 24, 2026.
  // The file path below exists in that package (checked in the npm tarball).
  MEDIABUNNY_VERSION: '1.66.4',
  MEDIABUNNY_URL: 'https://cdn.jsdelivr.net/npm/mediabunny@1.66.4/dist/bundles/mediabunny.min.mjs',

  // Saved-data schema. Prompt 5 adds step-by-step upgrades on top of this.
  // 2: adds the thumbs store (filmstrip pictures, kept out of the project record).
  // 3: adds the undo store (each project's last 200 steps) and project fields for platform and last opened.
  DB_NAME: 'cakewalk',
  SCHEMA_VERSION: 4,

  // Ask Sprinkle (Prompt 10). // VERIFY the current model name at Prompt 10.
  AI_MODEL: 'gemini-2.5-flash',
  AI_HOST: 'generativelanguage.googleapis.com',

  // Platform rules (Prompt 4). One editable table: every length, size, frame rate and bitrate lives here.
  // // VERIFY: platforms change these often. When one changes, edit its row and its "checked" date.
  // Lengths are in seconds. target: the sweet spot (green band). allowed: what's fine for your content.
  // hardMax: the platform's limit. longMax + longSetting: the higher limit a Settings switch unlocks.
  PLATFORMS: {
    tiktok: {
      label: 'TikTok', checked: '2026-11-25',
      minSeconds: 3, target: [60, 180], allowed: [30, 240], hardMax: 600,
      longMax: 3600, longSetting: 'tiktokLong',
      fps: [23, 60], rewardsMin: 60, audioBitrate: 256000,
      formats: [
        { key: 'tiktok', label: 'TikTok', ratio: '9:16', width: 1080, height: 1920, bitrate: { 30: 12000000, 60: 16000000 }, maxBitrate: { 30: 20000000, 60: 20000000 } }
      ]
    },
    reels: {
      label: 'Instagram Reels', checked: '2026-11-25',
      minSeconds: 1, target: [45, 90], allowed: [30, 180], hardMax: 180,
      // Over 3:00 isn't recommended to non-followers: PRO blocks it unless the Settings switch is on; CREATIVE warns.
      overLimit: { PRO: 'block', CREATIVE: 'warn' }, longMax: 1200, longSetting: 'reelsLong',
      fps: [23, 60], audioBitrate: 256000,
      // Feed videos post as Reels now, so 4:5 and 1:1 follow the same length rules.
      formats: [
        { key: 'reels', label: 'Reels 9:16', ratio: '9:16', width: 1080, height: 1920, bitrate: { 30: 12000000, 60: 16000000 }, maxBitrate: { 30: 20000000, 60: 20000000 } },
        { key: 'feed45', label: 'Feed 4:5', ratio: '4:5', width: 1080, height: 1350, bitrate: { 30: 10000000, 60: 14000000 }, maxBitrate: { 30: 16000000, 60: 18000000 } },
        { key: 'feed11', label: 'Feed 1:1', ratio: '1:1', width: 1080, height: 1080, bitrate: { 30: 8000000, 60: 12000000 }, maxBitrate: { 30: 14000000, 60: 16000000 } }
      ]
    },
    story: {
      label: 'Instagram Story', checked: '2026-11-25',
      minSeconds: 1, cardMax: 60,   // longer projects export as numbered parts
      fps: [23, 60], audioBitrate: 256000,
      formats: [
        { key: 'story', label: 'Story', ratio: '9:16', width: 1080, height: 1920, bitrate: { 30: 12000000, 60: 16000000 }, maxBitrate: { 30: 20000000, 60: 20000000 } }
      ]
    },
    shorts: {
      label: 'YouTube Shorts', checked: '2026-11-25',
      minSeconds: 1, hardMax: 180,
      fps: [23, 60], audioBitrate: 256000,
      formats: [
        { key: 'shorts', label: 'Shorts', ratio: '9:16', width: 1080, height: 1920, bitrate: { 30: 12000000, 60: 16000000 }, maxBitrate: { 30: 20000000, 60: 20000000 } }
      ]
    },
    youtube: {
      label: 'YouTube', checked: '2026-11-25',
      minSeconds: 1, hardMax: 900,
      longMax: 43200, longSetting: 'youtubeVerified',   // verified accounts can go longer // VERIFY
      fps: [23, 60], audioBitrate: 384000,               // YouTube's published audio target: AAC-LC 384 kbps
      // YouTube's published SDR targets: 1080p 8 Mbps (30 fps) or 12 (60 fps); 4K 35 to 45 (30 fps) or 53 to 68 (60 fps).
      formats: [
        { key: 'yt1080', label: 'YouTube 1080p', ratio: '16:9', width: 1920, height: 1080, bitrate: { 30: 8000000, 60: 12000000 }, maxBitrate: { 30: 12000000, 60: 16000000 } },
        { key: 'yt4k', label: 'YouTube 4K', ratio: '16:9', width: 3840, height: 2160, bitrate: { 30: 40000000, 60: 60000000 }, maxBitrate: { 30: 45000000, 60: 68000000 }, needsCap: { 30: 'h264_4k30', 60: 'h264_4k60' } }
      ]
    }
  },
  // Exports bigger than this get the share sheet warning.
  BIG_FILE_BYTES: 300 * 1000 * 1000,

  // Capability checks run on every launch.
  // H.264 High levels: 4.0 fits 1080x1920@30, 4.2 fits @60,
  // 5.1 fits 3840x2160@30, 5.2 fits @60 (checked against the level limits).
  // // VERIFY these codec strings on iOS 26.
  VIDEO_ENCODE_TESTS: [
    { key: 'h264_1080p30', label: 'H.264 1080x1920 30 fps', codec: 'avc1.640028', width: 1080, height: 1920, framerate: 30, bitrate: 12000000, critical: true },
    { key: 'h264_1080p60', label: 'H.264 1080x1920 60 fps', codec: 'avc1.64002A', width: 1080, height: 1920, framerate: 60, bitrate: 16000000 },
    { key: 'h264_4k30', label: 'H.264 3840x2160 30 fps', codec: 'avc1.640033', width: 3840, height: 2160, framerate: 30, bitrate: 40000000 },
    { key: 'h264_4k60', label: 'H.264 3840x2160 60 fps', codec: 'avc1.640034', width: 3840, height: 2160, framerate: 60, bitrate: 60000000 }
  ],
  // AAC-LC 48 kHz stereo 256 kbps. // VERIFY on iOS 26.
  AUDIO_ENCODE_TEST: { key: 'aac_encode', label: 'AAC-LC 48 kHz stereo 256 kbps', codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 256000, critical: true },
  VIDEO_DECODE_TESTS: [
    { key: 'h264_decode', label: 'Decode H.264', codec: 'avc1.640028', codedWidth: 1920, codedHeight: 1080 },
    // HEVC Main 10, level 5.1: the format iPhone HDR video uses.
    // // VERIFY the codec string. hev1 is tried if hvc1 says no.
    { key: 'hevc_decode', label: 'Decode HEVC Main 10 (iPhone HDR)', codec: 'hvc1.2.4.L153.B0', alt: 'hev1.2.4.L153.B0', codedWidth: 3840, codedHeight: 2160 }
  ],

  // Editor (Prompt 2)
  EDITOR: {
    UNDO_LIMIT: 200,          // keep the last 200 steps
    THUMB_WIDTH: 96,          // filmstrip thumbnails, 160px wide or less
    THUMB_EVERY: 2,           // one filmstrip picture every 2 seconds of source
    THUMB_MAX: 40,            // per clip
    PHOTO_SECONDS: 3,         // photos start at 3 seconds
    MIN_CLIP: 0.2,            // shortest clip after a trim, in seconds
    SPEEDS: [0.5, 0.75, 1, 1.25, 1.5, 2],
    PX_PER_SEC: 60,           // timeline zoom at start
    COPY_CHUNK: 8 * 1024 * 1024 // OPFS copy chunk size (8 MB)
  },

  // Export (Prompt 3, sizes moved into PLATFORMS in Prompt 4).
  // H.264 High, keyframe every half second, variable bitrate, constant frame rate. AAC-LC 48 kHz stereo.
  // Only SDR H.264 for now: no HDR or HEVC export yet.
  EXPORT: {
    KEYFRAME_SECONDS: 0.5,
    // H.264 High level for each size and frame rate. // VERIFY on iOS 26 (export retries without it if iOS says no).
    // 4.0 fits 1080p30 and 4.2 fits 1080p60 (any shape up to 1920 wide); 5.1 fits 4K30 and 5.2 fits 4K60.
    codecFor(width, height, fps) {
      const big = width * height > 1920 * 1088;
      if (big) return fps > 30 ? 'avc1.640034' : 'avc1.640033';
      return fps > 30 ? 'avc1.64002A' : 'avc1.640028';
    }
  },

  // Debug log keeps the newest entries only.
  LOG_LIMIT: 400
});
