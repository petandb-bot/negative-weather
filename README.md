# NEGATIVE WEATHER v0.5.3 — Minimal Interface

Turn a phone photograph into experimental music and a moving color image.

## Use
1. **SHOOT** to take a photo or **USE PHOTO LIBRARY** to load one.
2. **PLAY** starts the generated loop; **STOP** ends playback; **PLAY** restarts the loop.
3. **MUTATE** generates another sound and visual variation from the same photo.
4. **SAVE** exports a WAV audio loop or the current PNG frame.

## Sound engines
VEIL, PULSE, CURRENT, PARTICLE, RELAY, RIFT, ASH, ORBIT,
OBJECT, DUB TRACE, DUST LOOP, TOY HOUSE.

OBJECT uses synthesized taps and resonances to suggest small physical objects. No external sound samples are used.

## Visuals
Eight motion behaviors, six light-leak color profiles, and three levels of motion activity, all weighted toward the current photograph. Color leak effects use soft, cached photographic masks instead of rectangular light overlays. The moving oval oil-film lens effects remain.

## Publish
Upload the extracted files to the root of the `main` branch in GitHub and enable **Settings → Pages → Deploy from a branch → main / (root)**.

Photos are processed on-device. WAV and PNG downloads use the browser's share/download support. iPhone Safari performance depends on the device.

## v0.5.2 motion revision
- Eight distinct internal motion families: LENS FLOAT, TIDAL SHEAR, IRIS, GLITCH BLOOM, SOLVENT, GHOST FIELD, CHROMA MORPH and COLLAPSE/RETURN.
- Stronger distinction between QUIET, MEDIUM and ACTIVE motion.
- Organic soft-masked photo layers are baked once per image or mutation. No heavy per-pixel processing inside the animation loop.
- Existing 12 sound engines, UI, oil-film lens and WAV/PNG export are retained.
- **Photo-led selection**: each photograph favors certain sound and movement families.
- MUTATE explores biased variations; it does not cycle through all engines or guarantee variety.
- A different photograph can reveal different tendencies. The image is the input, not just a visual background.


## v0.5.2 — Breathing Field
- Full-frame breathing scale and slight geometric warp across all motion types.
- Restored the soft moving oval refraction field.
- Restored narrow horizontal and vertical source-pixel displacement, without glowing boxes.
- Eight existing motion families, six color variations, twelve audio engines remain.
- The 12 sound-generating algorithms are retained; the image-dependent engine selection is more strongly biased.


## v0.5.3 — Minimal Interface / Maintenance
- Removed decorative text overlays from the image frame.
- Shows the audio engine, BPM, loop duration, playback status, and progress below the photograph.
- Keeps the 12 audio engines, photo-weighted mutation, 8 visual motion families, and 6 light-leak color profiles.
- Reduced unnecessary image buffers and improved audio restart and image-loading lifecycle.
- The GUI remains SHOOT / MUTATE / PLAY / SAVE.
