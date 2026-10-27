# NEGATIVE WEATHER v0.4.3 — Lens Return

A photograph becomes a temporary audiovisual weather system.

## Use
1. Tap **SHOOT** or **USE PHOTO LIBRARY**.
2. Tap **PLAY** to hear the generated sound loop.
3. Tap **MUTATE** to explore another sound and motion variation.
4. Tap **SAVE** to export WAV audio or the current PNG frame.

## Eight sound engines
- **VEIL** — Ambient harmonics
- **PULSE** — Micro-rhythm
- **CURRENT** — Slow drone
- **PARTICLE** — Broken electronics
- **RELAY** — Melodic echoes and responses
- **RIFT** — Off-grid interlocking beats
- **ASH** — Lo-fi noise and resonance
- **ORBIT** — Phasing arpeggios

Each photo biases the engine selection, BPM, pitch, and timing. Consecutive MUTATE results avoid repeating the same sound engine. Six visual motion behaviors remain available.

## Publish
Upload all extracted files to the `main` branch root and enable **Settings → Pages → main / (root)**.

Audio and images are processed locally in your browser. Performance on iPhone Safari may vary.

## v0.4.3 — Lens Return
- Restored distinct animation behavior: drift, column, ripple, shutter, solvent, and afterimage.
- Added an audio-aligned visual time base and four-stage evolution.
- Reduced permanent lens overlays; colors and deformations emerge selectively.
- Adapted visual motion to the 8 sound engines without changing audio synthesis.
- iPhone-friendly Canvas 2D rendering; no required network services.

## Testing status
Checked in a desktop Chromium mock-browser flow: image loading, all six motion recipes,
PLAY, changing visual frames, WAV export, and 320px layout. iPhone Safari performance
and visual quality still require testing on the device.


## What changed in v0.4.3
- Removed rectangular / box-like light animation shapes
- Replaced column, shutter and afterimage masks with organic ribbons and blobs
- Allowed stronger photo mutation while keeping the 8 audio engines
