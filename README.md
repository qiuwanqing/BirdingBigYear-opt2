# SUPERMARKET BIRDING — SKY PORTAL / STUDY 003

A Three.js rounded image volume in a photographed open sky. Scroll toward the volume to enter a preliminary 3D supermarket. Inside, use BACK TO SKY or Escape to return outside.

## Run locally

```bash
npm install
npm run dev
```

Open the Local URL printed by Vite. `npm run build` produces `dist/`.

## Controls

- Wheel / trackpad or arrow / page keys: approach and reverse the portal.
- ENTER HABITAT: animate into the store.
- Hover the volume: play the video and gently reveal its halo. Move away to pause and retain the current frame.
- Drag the volume: rotate it with video playback and background effects suspended.
- Inside: move the mouse to look around with a gentle damped response. Holding it in the outer left/right 17.5% of the viewport continues turning, with unrestricted yaw. Return to the center to stop turning; moving over buttons or off the canvas immediately suspends mouse steering. Touch retains drag-to-look.
- WASD / arrow keys inside: walk forward/backward and strafe relative to the current heading. Movement stays within the repaired aisle corridor.
- Wheel inside: adjust binocular magnification from 1× to 2× without leaving the store.
- ZOOM 1× / 2×: change the observation camera field of view.
- BACK TO SKY / Escape: return outside.
- Double-click inside or LOCK VIEW: freeze camera and walking; the red reticle follows the pointer.
- Aim at the authored product region on the existing right-hand shelf, then click, double-click, or OPEN PRODUCT to magnify its associated scan inside the binocular apertures.
- In the product view: drag to rotate, wheel to zoom; click the bird printed near the lower middle of the label, or use CAPTURE BIRD when targeted.
- Capture releases a bird silhouette from the label into the photographed sky, keeping the binocular frame throughout. A close-up sighting is saved in this browser; SIGHTING 01 opens it on request.
- RESUME LOOK or a double-click away from a product: leave locked aim. Escape closes the capture card, then product view, then unlocks aim, then exits the habitat.

## Current image-volume behavior

The rounded geometry now has a longer time axis (5.8 × 3.15 × 5.8, radius .68), with a lower initial elevation and more visible side depth, adjusted against the supplied reference still. These are a visual approximation, not recovered source dimensions. The front image changes over time while the geometry stays stable. X/Y select a pixel and depth selects an earlier point in time, so the front, top and sides share one continuous source. There is no local wave distortion.

The supplied supermarket video is now connected as `assets/supermarket.mp4` (66.68 seconds, 960 × 540, H.264). It was exported locally from the user-provided `光厂_6736311_最新超市环境展示（场景一） 已调色.mp4`; the original download is unchanged.

If the video is removed or unavailable, with `assets/supermarket.jpg`, a whole-image pan and zoom provides a hover-activated preview. The sides evaluate that same camera movement at earlier times. This moves the photographic view; it does not invent independent movement of products or people.

For real content motion, add **one** locally licensed source as `assets/supermarket.mp4` (H.264 recommended) or `assets/supermarket.webm`, then restart Vite. MP4 takes priority if both exist. The video loads a paused first frame and plays muted/inline at half speed (0.5×) only while a raycast hits the actual volume under the pointer. Moving away, dragging, entering the interior or leaving the browser window pauses playback. It does not automatically loop. A fresh hover after the clip ends starts it again. The front uses the live decoded frame. `VideoHistory.js` captures a GPU ring buffer of 96 frames, up to 24 samples/second. The sides/top interpolate earlier frames according to depth. One poster frame is captured while idle; history advances only during playback, without sampling uninitialized slots. The 3840 × 1440 linear atlas uses about 22 MB, and is allocated only when a video is supplied. Video sampling preserves the source aspect ratio with a cover crop. An unavailable video keeps the hover-activated photo preview; a blocked play request retains the paused video frame. Reduced-motion mode pauses image motion.

The [Pentagram TwelveLabs reference](https://www.pentagram.com/work/twelvelabs) describes the concept as “video as volume.” The timestamp sampling here is our implementation of that direction, not a claim about Pentagram's internal rendering technique.

## Progressive optical softness

The inflated outline mesh is removed. The center of the front keeps its current-frame detail; spatial sampling and temporal exposure broaden toward the rounded perimeter and deeper history. This blends several neighboring video moments per pixel rather than showing one hard slice.

`VolumePass.js` renders the volume separately from the sky, then uses half-resolution horizontal/vertical Gaussian passes and blurred coverage to feather the silhouette from clear to soft. Only the volume is blurred, with no CSS filter or glass border. A separate quarter-resolution Gaussian mask gives the active halo a broad, low-intensity outer glow beyond its restrained warm luminous core. Its 25 contiguous samples per axis remove the repeated-outline bands of a sparsely sampled large blur. These two additional passes run only while the halo is visible. Real hardware performance still needs testing.

## Black-hole entry shading

As scroll progress increases from 22% to 78%, the volume's photo/video radiance is progressively absorbed in its own material, without fading its alpha or the sky. Bright packaging and the image trails therefore disappear into an opaque black volume. The fully black threshold is held before the interior reveal (90% to 98.5%). Reverse scrolling follows the same shading curve back to the visible image. A very restrained cool edge shade exists only during the darkening phase, disappearing at full blackout. The sky's blue shoulder is slightly grayer and its blend reduced from .78 to .62; hover playback, halo and drag gating remain separate.

## Environment and portal

- Local Poly Haven `Kloppenheim 05 (Pure Sky)` 2K HDR panorama, loaded with `RGBELoader`. See [asset attribution](assets/ATTRIBUTION.md). The source panorama is still; its screen projection bends toward the portal as scroll progress grows. The sky uses its own cooler color grade and low-horizon haze, without recoloring the supermarket video.
- Minimal landing UI: SCROLL TO APPROACH and ENTER HABITAT.
- Real perspective-camera travel, a fixed physical volume size, sky refraction around the projected volume, restrained radial stretching during entry, and a linear HDR blend between exterior and interior scenes.
- Only one scene renders at either endpoint; both render during the short transition. Device pixel ratio is capped at 1.8.
- The interior loads the user’s cropped photogrammetry aisle from `assets/scanned-aisle.glb`, with a clean floor, ceiling, shelf caps, backing walls and light fixtures.

## Sky suction during approach

`VolumePass.js` renders a 170% wider camera view of the photographic sky into a separate target. A fullscreen shader pulls visible cloud features toward the projected rounded volume: the inverse sampler reaches farther outward as scroll progress grows, creating inward motion, bending and short directional streaks. Projected bounds follow the real 3D camera and object rotation. A smooth superellipse gradient avoids hard rectangular seams around the portal. Overscan supplies offscreen sky pixels instead of stretching the texture's viewport borders.

Sky distortion strength ramps from 12% to 48% of the reversible scroll timeline, while the approaching volume is still medium sized. At approximately 36–38% progress (about 40% of viewport width in the desktop reference view), halo and refraction are already prominent, with ample surrounding sky still visible. Untouched idle and rotation leave the background undistorted. At untouched idle it has zero displacement. Once approach activates the lens, a separate elapsed-time uniform keeps clouds streaming inward even while scroll progress is held still. Two staggered advection phases crossfade to hide loop resets. Dragging pauses the flow clock and disables displacement; leaving the portal stops it. Returning fully outside resets the clock and restores the still sky. Reversing the timeline gradually releases the lens strength. The halo softly fades in on hover or approach and fades away on leave; neither halo nor blue shoulder is present in untouched idle. The blue shoulder and sky displacement are driven only by zoom progress. During drag, both are forced to zero, and wheel input is ignored so rotating cannot also advance the portal. Hover tests use the actual 3D mesh, not its rectangular screen bounds. A warm luminous core follows the current silhouette and a wider, weaker Gaussian falloff blends into the surrounding sky. Outside it, a saturated blue shoulder appears only during entry and fades into the pale gray-blue photographic atmosphere. The initial camera distance is increased from 13.8 to 24 world units, so the volume starts roughly half as wide and leaves more sky visible. Sky displacement is increased from .18 to .32 viewport-height units; the larger overscan prevents clamped streaks at the image border. Reduced-motion mode disables this additional distortion. The video volume retains its geometry, current-frame detail and graduated optical blur. The technique is an interpretation of the supplied [Your uncertain archive reference](https://olafureliasson.net/uncertain), not a copy of its rendering code or artwork assets.

## Scope and verification

JavaScript syntax and the Vite production build pass. Headless Chrome with software WebGL rendered the changing front at two times, entered the interior, reversed on wheel input and returned with Escape, with no console or shader errors. A temporary generated WebM previously verified pause behavior. After connecting the actual supermarket clip, Chrome confirmed live playback, all 96 history slots filled, distinct old/new frame samples, and successful ring-buffer wrap. Hover-only playback, pause on leave, no automatic loop, replay on a fresh hover after end, idle effects off and drag suppression were also checked in Chrome. The volume proportions and graduated blur were visually inspected in screenshots. The sky suction was checked at idle, approach, threshold, reverse and return, including screenshots with refraction enabled/disabled at the same approach stage; the displacement returned to zero on exit. No reference footage or test video was added to project assets. The continuous-flow revision was checked by holding zoom unchanged with the video paused: cloud pixels continued to change while the sky-flow clock advanced. Dragging stopped that clock and refraction. The black threshold produced an opaque black center before the interior appeared; reverse scrolling restored the image and reset the sky-flow clock. This validation does not establish hardware frame rate or Safari parity.

One authored bird discovery, capture, simple release feedback and browser-local sighting storage are implemented. Automatic bird detection, species identification, full archive, accounts and Big Year counting rules are not implemented. The original Blender file remains unchanged. The first scanned aisle is connected; local scan distortions and incomplete packaging remain, so this is an observation prototype rather than a fully restored supermarket.

## Scanned habitat

Source: user-provided `未命名.blend`, object `textured_output.001`. The derived GLB retains the original merchandise UVs, with a 4K JPEG texture. Overhead ribbons, distant/side fragments and small disconnected islands are cropped away; the retained mesh has approximately 45,000 faces. `scripts/prepare-scanned-aisle.py` reproduces the export with Blender, accepting source and destination after `--`. It does not save the source blend or overwrite source textures. The JPEG alongside the GLB is an export derivative; the GLB embeds its own texture.

The entry camera faces down the selected aisle. `HabitatControls.js` provides mouse-follow look, continuous edge turning, keyboard walking and conservative corridor bounds around shelf fronts and the end display. An entrance wall and door complete the reverse view. Re-entering resets the observer; blur, hidden tabs and exit clear held movement keys. Captured lighting is retained on the scanned goods, while newly modeled architecture uses scene lighting. Entry waits for the GLB to load. The binocular overlay contains only the three control buttons, has no lens outlines or text labels, and uses a 97% dark surround with soft inner edges. The two enlarged circular apertures overlap to match the supplied binocular reference, with centers separated by 1.64 radii. Their outer 8% fades into opaque black; a masked 7px backdrop blur progressively softens the outer perimeter while preserving the connected central image. Each blur ring excludes the other aperture to avoid an internal blurred seam. A red bracket reticle stays at the center of the view. Action buttons indicate whether the view is roaming, locked for aiming, or targeting the sample product.

Habitat validation: headless Chrome rendered the GLB without console errors, confirmed that the interior contains only button text, lens borders are zero, and surround opacity is 0.97. Observation zoom toggled, prototype feedback stayed in its button, all controls fit a 390 × 844 viewport, and BACK TO SKY returned outside. The production build passes. Real GPU frame rate and Safari remain unverified.

First-person validation: Chrome previously verified tangent apertures, the blurred perimeter, keyboard walking, corridor limits, wheel magnification and exit without page errors. The mouse-follow revision passes control simulation checks for unpressed pointer steering, edge turning beyond 360°, stopping at center, simultaneous keyboard walking, suspending steering over controls, and clearing movement on window blur. The production build passes.

The overlapping-aperture revision passed the production build and was visually checked in a Chrome screenshot using the local supermarket photo as an overlay preview. Navigation code was unchanged.

## First bird encounter

`BirdEncounter.js` implements roaming → locked aim → magnified product → capture → sky release → return. Locking freezes movement and magnification; the red reticle follows the pointer. An authored hotspot is anchored to the nearest original scan surface in the right-hand shelf region, with a 17cm hit radius and nearest-surface raycasting. No extra bottle or platform is placed in the aisle. Empty space cannot open the close-up.

The associated close-up is the bird-illustrated bottle `textured_output.006` from the user's Blender scene, exported as `assets/bird-bottle.glb` with a 2K texture. `scripts/prepare-bird-product.py` trims the scan's table and exports a normalized copy without changing source files. This prototype manually links an existing shelf region to that separate scan; the shelf texture is not yet a verified depiction of the same package. The final content should pair each shelf product with its matching scan. There is no automatic bird detection or species identification.

Inspection retains the same blurred overlapping binocular apertures and the habitat behind the enlarged bottle. The model smoothly approaches the observation camera; drag rotates and wheel adjusts its scale in the view. The bird region is manually annotated on the label, with a surface-depth check that rejects the hidden back side. Clicking it captures a close-up image and releases an SVG bird silhouette from the selected point. The habitat and product fade behind a view of the existing photographic sky while the bird flies away. The sky remains in the binocular view; no record card opens automatically. BACK TO HABITAT restores the original locked camera pose, and RESUME LOOK resumes navigation.

A single sample record (product, ISO timestamp, JPEG around the label region) is stored under `supermarket-birding:first-sighting:v1` in localStorage, with in-memory fallback if storage is unavailable. Repeating the sample replaces that record rather than increasing a count. SIGHTING 01 opens the record only when requested. A full archive and Big Year counting are not implemented.

Chrome full-flow verification passed: double-click lock, stationary camera while aiming and pressing movement keys, empty-space rejection, original-shelf targeting, binocular close-up, bird-region targeting, visible silhouette release into sky, no automatic popup, saved image creation, return to the locked habitat, resuming look, and reopening the record. Screenshots were visually inspected and no page console errors occurred. Real GPU frame rate and Safari parity remain unverified.

## Habitat tool placement

`HabitatToolTray.js` owns one toolbar directly under `#app`, outside the binocular, sky-release and product layers. It stays at the upper left, above those layers, and displays the current mode's buttons vertically. The small menu button expands after 350ms hover; leaving closes it after 600ms. Clicking or keyboard focus also opens the controls, and collapsed content is hidden and inert. Habitat, product and record-close buttons all use this shared layer. Chrome verified delayed expansion, collapse, topmost button hit testing, vertical positions, mode switches, functional lock/return actions and a 390px viewport without page errors.

## Cube-controlled panorama

The current sky is the user-provided `sky.png`, copied unchanged as `assets/sky-panorama.png`. It is loaded as an sRGB equirectangular PNG rather than an HDR radiance asset. The old panorama's global blue/haze grade is removed to preserve the supplied image; the approach halo and localized lens color remain. Dragging the exterior cube applies the same yaw/pitch deltas to `exterior.backgroundRotation`; yaw is unbounded for continuous 360° turns and pitch is bounded at ±1.1 radians. The selected orientation stays after release. Scroll continues to control entry and suction independently. The bird release also inherits this sky. Chrome verified the new texture dimensions, equal cube/sky pitch deltas, held orientation, yaw beyond one full turn, and zero suction during rotation, without page errors. The production build passes.

## Volume silhouette sampling

The volume's offscreen target uses 4-sample MSAA, since canvas antialiasing does not cover separate render targets. Optical blur uses contiguous 25-tap separable Gaussian samples at half resolution, with sigma scaled to the viewport, rather than stretching a sparse five-tap kernel. The halo retains its own wider Gaussian. This removes separated outline bands without changing the video history or cube geometry. Build and headless Chrome shader checks pass; screenshots were inspected at the initial view and with the active halo. Hardware performance remains unverified.

## Light glass finish

The cube's existing volume shader now adds a restrained dielectric finish inspired by the local “A Change of Perspective” sphere: angle-dependent Fresnel reflection, refracted panorama contribution (nominal IOR 1.45), and stronger radiance at grazing rounded edges. `uGlass` controls the amount (currently 0.7). This is a surface approximation blended with the video volume, not a second physical transmission mesh. Both samples use the current panorama with its inverse world rotation, so dragging updates the reflected environment consistently. The complete finish is applied before the existing blackout, so reflections disappear with the imagery during entry. Geometry, video-history sampling and continuous silhouette blur are retained. Chrome rendered on/off and rotated comparisons without shader errors; the fully black threshold was visually verified. The production build passes.

The repository playback video is a web-size H.264 encode at 960 × 540, 66.68 seconds, target 2.5 Mbps (approximately 20 MB). Audio is omitted because playback is muted. The original source video in Downloads is unchanged.

## GitHub Pages

The production base is `/BirdingBigYear-opt2/`, configured in `vite.config.js`. `.github/workflows/deploy.yml` runs `npm ci` and `npm run build` with Node 22 on pushes to `main` or manual dispatch, then publishes `dist` using GitHub Pages Actions. In Settings → Pages, keep Source set to GitHub Actions. The expected site URL is https://qiuwanqing.github.io/BirdingBigYear-opt2/.

All active local images, the panorama, MP4 and GLBs are imported through Vite (`?url` or the video glob), so their built paths include the repository base. GLB textures are embedded. Google Fonts remains the existing external stylesheet, with the existing system-font fallbacks. No visual, shader or interaction changes are part of this deployment configuration.
