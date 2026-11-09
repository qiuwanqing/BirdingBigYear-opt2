# Supermarket Birding — Sphere Portal

A Vite / Three.js experience: a glass sphere floats in a supermarket panorama. Scroll toward it to enter the scanned supermarket through binoculars. **SPACE LINES is the only Habitat view.**

## Run locally

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, including `/BirdingBigYear-opt2/`.

```sh
npm run build
npm run preview
```

## Entrance

The panorama, physical glass material, drag inertia, darkening and pull/halo pass come from the user’s local `supermarket-birding-sphere-portal` folder. That source folder is unchanged. The active panorama is `assets/retro-convenience-360.png`.

- Scroll or use Page Down / Page Up to approach or retreat. Click ENTER HABITAT to enter directly.
- Drag the sphere to rotate both the panorama and its reflection.
- `environment-config.js` holds the imported blur, exposure, halo and darkening settings.
- `SpherePortal.js` holds the physical glass material and camera motion; `PullBackground.js` retains the source optical pass.

## Habitat and capture

SPACE LINES preserves the existing scanned surfaces, colored point samples, open spatial contours, binocular mask and red aiming reticle. Alternative view selectors and the old video-cube entrance have been removed.

- Move the mouse to look; hold it near either side to keep turning.
- WASD or arrow keys walk within the scan bounds. Touch drag looks around.
- Wheel or ZOOM magnifies the binocular view.
- Double-click locks the camera. Aim at the authored bird-product location and click to open its scan.
- In the close-up, aim at the annotated bird on the label and click to capture. The silhouette still flies into the separately retained blue sky.
- The top-left monochrome tools open on hover, click or keyboard focus. Saved captures stay in this browser’s local storage.
- BACK TO SPHERE returns to the supermarket panorama. Escape closes the current inspection/lock first.

`ScanSpaceView.js` builds the long ground and overhead contours. `ScanTraceView.js` is its shared surface/point renderer, not a separate selectable view; its `makeBackground()` retains the user’s current black background. The contour extensions indicate space and are not a measured reconstruction of the original store layout. The source scans remain incomplete and there is no shelf collision system.

## Scan preparation

The source Blender file is read-only during export. All seven scans retain their authored relative placement.

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/prepare-all-scans.py -- /path/to/source.blend assets/all-scans.glb
python3 scripts/prepare-scan-edges.py
```

The bottle exporter remains in `scripts/prepare-bird-product.py`. GLB textures are embedded. Source information is in `assets/ATTRIBUTION.md` and `assets/PORTAL-SOURCES.md`.

## GitHub Pages

Vite base is `/BirdingBigYear-opt2/`. `.github/workflows/deploy.yml` runs `npm ci` and `npm run build` with Node 22, then publishes `dist` to GitHub Pages when `main` is pushed. Active local resources use Vite URL imports so their build paths include the repository base.

Expected URL: https://qiuwanqing.github.io/BirdingBigYear-opt2/

## Validation

Use `npm run build` for the production bundle. Browser QA should cover the original sphere appearance, drag orientation, darkening/entry/return, SPACE LINES, walking and aiming, product capture, blue-sky release, and mobile sizing.
