# INCIDENT ARCHIVE v0.2.9.8 — CHEMICAL / LEAK ENGINE SEPARATION

## Changes
- `engines/chemical.js`: own GLSL utility source, fragment shader, palette, recipe generator, and uniform setter. The CHEMICAL visual algorithm is unchanged from v0.2.9.7.
- `engines/leak.js`: independent GLSL utility source, fragment shader, 8 strong color palettes, mutation logic and uniform setter. The LEAK visual algorithm is unchanged from v0.2.9.7.
- `sketch.js`: only dispatches to each engine. SOLAR and REGISTER retain the original shared renderer and shader source.
- Mode-specific `modeRecipes` and `modeParams` preserve results and slider values independently. Switching away and back no longer automatically randomizes a mode; press MUTATE to change it.
- The original photo remains the only shared texture source; neither engine uses the previous mode's output as input.
- Save UI (DOWNLOAD PNG / SHARE / SAVE TO PHOTOS), high-resolution export and original aspect ratio are preserved.

## Important diagnostic note
The uploaded examples show translucent angular boundaries at nearly identical locations in both mode outputs. The reviewed CHEMICAL and LEAK shaders do not explicitly draw triangles; separation prevents cross-engine source changes but cannot guarantee removal of shapes already present in the source photograph or arising in the common WebGL renderer. If angles remain, compare an unmodified original photo and the app input, then investigate the shared WebGL draw path.

## Deployment
Unzip into the GitHub Pages repository root. Overwrite `index.html`, `sketch.js`, `style.css`, `sw.js`, `manifest.webmanifest`, and ADD the NEW `engines/chemical.js` and `engines/leak.js` files (maintaining their directory). Keep the existing `icons/` folder. Check the header reads `0.2.9.8` after reload. When running as an iPhone home-screen app, close and restart; if cached files remain, remove and reinstall the home-screen shortcut.

## Tests
- JS syntax check for all three JavaScript files.
- CHEMICAL and LEAK shader sources byte-for-byte match v0.2.9.7 content when the dedicated GLSL utilities are prepended, so their appearance should not change in this structural release.
- Cross-mode state isolation and randomization tested programmatically.
- Safari iPhone real-device drawing/export not verified.
