# NEGATIVE WEATHER v0.5.1 — Motion Range

Turn a phone photograph into experimental music and a moving color image.

## Use
1. **SHOOT** to take a photo or **USE PHOTO LIBRARY** to load one.
2. **PLAY** starts the generated loop; **STOP** pauses it.
3. **MUTATE** generates another sound and visual variation from the same photo.
4. **SAVE** exports a WAV audio loop or the current PNG frame.

## Sound engines
VEIL, PULSE, CURRENT, PARTICLE, RELAY, RIFT, ASH, ORBIT,
OBJECT, DUB TRACE, DUST LOOP, TOY HOUSE.

OBJECT uses synthesized taps and resonances to suggest small physical objects. No external sound samples are used.

## Visuals
Eight genuinely different motion behaviors, six light-leak color profiles, and three clearly separated levels of motion activity. Color leak effects use soft, cached photographic masks instead of rectangular light overlays. The moving oval oil-film lens effects remain.

## Publish
Upload the extracted files to the root of the `main` branch in GitHub and enable **Settings → Pages → Deploy from a branch → main / (root)**.

Photos are processed on-device. WAV and PNG downloads use the browser's share/download support. iPhone Safari performance depends on the device.

## v0.5.1 motion revision
- Eight distinct internal motion families: LENS FLOAT, TIDAL SHEAR, IRIS, GLITCH BLOOM, SOLVENT, GHOST FIELD, CHROMA MORPH and COLLAPSE/RETURN.
- Stronger distinction between QUIET, MEDIUM and ACTIVE motion.
- Organic soft-masked photo layers are baked once per image or mutation. No heavy per-pixel processing inside the animation loop.
- Existing 12 sound engines, UI, oil-film lens and WAV/PNG export are retained.
- The first eight MUTATE results visit all eight motion families before repeating.
