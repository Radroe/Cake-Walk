// Cake Walk: CONFIG
// One place for numbers and names that change. APP_VERSION must match sw.js.

export const CONFIG = Object.freeze({
  APP_NAME: 'Cake Walk',
  APP_VERSION: '1.0.0',

  // Mediabunny: one exact version, ES module build, served by jsDelivr.
  // 1.66.4 was the newest 1.x on the npm registry on Nov 24, 2026.
  // The file path below exists in that package (checked in the npm tarball).
  MEDIABUNNY_VERSION: '1.66.4',
  MEDIABUNNY_URL: 'https://cdn.jsdelivr.net/npm/mediabunny@1.66.4/dist/bundles/mediabunny.min.mjs',

  // Saved-data schema. Prompt 5 adds step-by-step upgrades on top of this.
  DB_NAME: 'cakewalk',
  SCHEMA_VERSION: 1,

  // Ask Sprinkle (Prompt 10). // VERIFY the current model name at Prompt 10.
  AI_MODEL: 'gemini-2.5-flash',
  AI_HOST: 'generativelanguage.googleapis.com',

  // Platform length and resolution table (filled in Prompt 4).
  PLATFORMS: {},

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

  // Debug log keeps the newest entries only.
  LOG_LIMIT: 400
});
