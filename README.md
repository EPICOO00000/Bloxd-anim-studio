# Bloxd Studio 4.0

A small, local 3D animation editor with an editable **8-second Maple clearing**. Version 4.0 expands the public game asset library to 1,309 base block names / 4,032 block states, 1,110 item entries and 1,674 source-model choices. It retains reliable video downloads and direct shortest-path motion between saved poses. It keeps the optional **Gemini Director** that plans terrain, characters, item movement, camera travel and lighting using your own API key. Version 2.1’s keyframe fixes, original-color tool textures, manual editing, model imports and MP3 export are retained.

## 🌐 Live website

**Play it in your browser (free, hosted on GitHub Pages): <https://epicoo00000.github.io/Bloxd-anim-studio/>**

The site is hosted **free on GitHub Pages**, served directly from the `main` branch: the repository root *is* the website (`index.html` + `lib/` + `vendor/` + `assets/`). Every push to `main` republishes it automatically.

**Hosting setup** (one time, in the GitHub web UI): *Settings → Pages → Build and deployment → Source: “Deploy from a branch” → Branch: `main`, folder: `/ (root)` → Save.* The included `.nojekyll` file makes Pages serve the files as-is (no Jekyll processing), which is required because some asset filenames start with `_`.

<details>
<summary>Optional: deploy with GitHub Actions instead (click to expand)</summary>

If you prefer CI-based deployment, add this file as `.github/workflows/deploy.yml`, then set *Settings → Pages → Source: “GitHub Actions”*:

```yaml
name: Deploy website to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - name: Stage site files
        run: |
          mkdir -p _site_stage
          rsync -a --exclude='.git' --exclude='.github' --exclude='node_modules' \
            --exclude='tests' --exclude='tools' --exclude='*.tgz' \
            --exclude='package-lock.json' --exclude='_site_stage' ./ _site_stage/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site_stage
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

</details>

## New in this update: living water, bigger builds, schematics

- **Realistic water.** Water is now a single welded, full-block surface per pond with an animated shader: scrolling wave normals, depth-based color absorption (turquoise shallows → deep blue), Fresnel sky reflection at grazing angles, sun glints and shoreline foam. Waves follow the timeline during playback and explicit timestamps during video export, so renders stay deterministic. Placed water blocks use the same surface.
- **Bigger builds.** The placement limit is raised from ±50 to ±400 blocks from the center, the camera far plane from 180 to 4,000 units, orbit distance to 600, shadows cover ±70, and fog starts at 160 instead of 30 — distant blocks no longer fade out or vanish. Voxel batches also no longer frustum-cull incorrectly, so off-center builds stay visible from every angle.
- **Bloxd schematic import.** *Import schematic* (or drop a `.json` / `.schem` / `.vf` file) parses tolerant schematic formats — block maps (`"x,y,z": "name"`), block lists (`{x,y,z,name}`), paletted lists (Sponge-style `palette` + `state` index) and studio project worlds — resolves names against the public asset library, places the build on the terrain with Undo/Redo, and reports unmapped block types.
- **Binary `.bloxdschem` import.** `.bloxdschem` — the binary format Bloxd itself uses, and the format both the Bloxd Map Editor and VoxelForge/Blockstudio encode — is decoded byte-for-byte and verified against VoxelForge's own `encodeSchematic` in `tests/voxelforge-codec-smoke.mjs` (including its header-origin handling and empty-chunk padding). Any file with a Bloxd extension is tried as binary first, even without the four-zero magic header, and failed imports now report the decoder's actual error instead of a generic message. Layout: the zero-byte header, zigzag-varint name/origin/sizes, group-count chunk layout (including the negative-count writer variant), length-prefixed RLE payloads of unsigned-varint `(run, blockId)` pairs over 32³ chunks, and multi-part `_x…_z…` filename offsets. Numeric Bloxd ids are mapped onto the studio catalog through each block's `gameId`; unmapped ids are reported in the import toast.
- **Phone mode, rethought.** Choose *Phone* at the start gate (or the device button in the header) and every menu becomes a **dedicated full screen**: the asset library, inspector and timeline each take 100 % of the display with a big ✕ close button, the dock stays reachable as a tab bar, lists and keying use all the room, dialogs and inputs are sized for fingers (16 px fields stop iOS zoom), and focused fields scroll clear of the virtual keyboard. Picking a block, build, item or brush automatically steps the panel away so the scene owns the screen while you place it. Desktop mode is untouched.
- **Ghost placement previews.** Importing a schematic no longer dumps it at the camera target: a translucent ghost of the whole build follows your cursor, snapped to the terrain surface. Left-click commits it, right-click or Esc cancels. Placing an item or source model from the library works the same way — a 45 %-opacity ghost of the actual asset trails the cursor until you click to set it down. Like the VoxelForge ghost system it is based on, the preview reacts to its destination: overlapping blocks tint the ghost red and a status chip reports exactly how many cells would be replaced, the **mouse wheel lifts or lowers** the ghost, and **R rotates** builds in 90° steps.
- **Terrain brushes.** The **⛰ Terrain** button (or `T`) in the Blocks library opens the sculpting panel, ported from VoxelForge's `bloxd-terrain-brush`: **Raise, Lower, Flatten, Smooth, Erode, Terrace, Cliff, Road, Beach, River, Snow cover, Biome paint and Vegetation** brushes with radius, strength and falloff (smooth/linear/hard) controls plus six biome palettes (temperate, tropical, arid, alpine, volcanic, alien) that choose the surface/subsurface/stone/road/vegetation materials. Left-drag paints the brush along the terrain (right-drag still turns the camera), a ring shows the brush footprint, and every stroke is a single Undo step.
- **Builds library (922 prefabs).** A new **Builds** tab in the asset dock carries the open Bloxd Map Editor asset pack: 315 houses, 385 rocks, 217 trees and 5 stands, embedded as a 0.66 MB gzip+base64 module (`lib/prefab-data.js`, regenerated with `node tools/build-prefabs.mjs <schems-dir>`). Each entry is a real `.bloxdschem` payload; clicking one decodes it and drops it into the world through the same ghost-preview flow, with group filtering, search and pagination.
- **One-click animation suite.** The Pose panel now **bakes real keyframes**: *Walk, Run, Wave, Jump, Dance and Spin* clips drop synced pose + movement keys from the playhead, following the character's facing and the terrain height. A **pose clipboard** (Copy / Paste / Mirror) moves poses between keys and characters — Mirror swaps left ↔ right, handy for fixing a wave or tool-holding pose. **Onion skin** is on by default, showing translucent ghosts of the pose keys before and after the playhead (toggle it off next to *Joints*). The **＋ Path** button lets you click a route on the ground and bakes a constant-speed walk that turns at corners with steps synced to distance (Enter bakes, Esc cancels). In the timeline toolbar, per-key **easing** (Smooth, Linear, Ease in, Ease out, In & out, Hold) works on character and camera keys, and **● Auto** keys every edit at the playhead so you can animate by performing. The Camera tab adds **Follow selected**, which keys your current camera view to track the selected player or object across the whole clip. Everything is one Undo step and works in phone mode too (`lib/anim-clips.js`, covered by `tests/anim-clips-smoke.mjs`).
- **More clips, sequences & crowd choreography.** The bake grid doubles to **14 clips**: Punch, Kick, Backflip (a real aerial flip — full rotation, air arc, landing drift), Sneak, Death, Cheer, Clap and Swim join the originals, and a compact **Options** row tunes any bake (duration, speed, walking **Backwards**). Tick **All chars** and the same clip — or the same walk path — bakes across every character in the scene with an adjustable stagger: instant group dances and squad walks. **＋ Chain** queues clips into a sequence (*Walk → Wave → Dance*) and bakes them end to end as real keys, each clip continuing from exactly where the previous stopped. Still one Undo step each, phone mode included (tests now at 267 assertions).
- **FX tab: particles, PNG billboards & lens distortion.** A new **FX** dock tab carries five GPU particle emitters — Fire, Smoke, Rain, Snow and Sparkle — placed like any other object, movable, scalable and keyable, and simulated entirely from the timeline clock so scrubbing and video exports stay frame-exact. **Import image** (or just drag a PNG/JPG/WebP into the scene) drops it as a double-sided 3D panel about 2.2 blocks tall that can be moved, keyed and duplicated; images embed themselves in the project file, and any imported image can become the particle sprite through the **Particle sprite** picker. In the Camera tab, **Lens distortion** keys a warp amount (0–100 %) that widens the lens with a subtle swaying roll — distant things read as even further away — and it shows *only while the clip plays or records*, never while editing (`lib/fx.js`, covered by `tests/fx-smoke.mjs`, 79 assertions).
- **Procedural worlds, custom textures & Shorts/TikTok video formats.** The ⛰ Terrain panel now **generates whole worlds**: pick a style (Mountains with snow-capped peaks, Islands, Canyon & river, Rolling hills), a size up to **160×160** (~130k blocks), a free-text seed with a 🎲 dice button, the brush panel's biome palette (volcanic worlds get lava seas, alien worlds get glass water), plus **Trees** and **Cliff vines** toggles — ivy hangs down cliff faces with tufts peeking over the rim, and canyon rivers carve through the plateau. Generation runs in milliseconds, re-grounds placed objects onto the new surface, flies the camera back to frame the fresh landscape, and is **one Undo step** back to your old terrain (`lib/terrain-gen.js`, covered by `tests/terrain-gen-smoke.mjs`, 30 assertions). The 🎨 **Texture** button in the Blocks library gives any plain cube block **your own PNG/JPG/WebP** — every placed copy updates instantly — and ✕ Reset restores the original art. In the Light tab, 🖼 **Skybox image** replaces the flat sky color with any picture (2:1 equirectangular panoramas wrap seamlessly). Both embed into the project file, survive save/load and are Undoable. Video export resolutions now include **vertical 9:16** sizes (540×960 / 720×1280 / 1080×1920) ready for **YouTube Shorts & TikTok**, and **square 1:1** sizes (720×720 / 1080×1080) for feeds, beside the classic 16:9 options — the preview player adapts to any shape. The project block limit rises from 50,000 to **250,000** so generated worlds can be saved.
- **Armor, nine landscapes & 500-block worlds.** The character inspector's *Equipment* section now dresses Bob in **armor**: four slots (Helmet, Chest, Legs, Boots) × five materials (**Leather, Iron, Gold, Diamond, Netherite**), rendered as metal-shaded plates parented to the pose joints — armor follows every walk, wave, backflip and mirror for free, persists in the project file and is one Undo step per slot (`lib/armor.js`, covered by `tests/armor-smoke.mjs`, 23 assertions). World generation grows from four styles to **nine**: join Mountains, Islands, Canyon & river and Rolling hills with a seed-jittered **Volcano** (bare-rock cone, caldera bowl and a crater lake — lava in the volcanic biome), stepped **Mesas & plateaus** with sheer cliff bands, wind-stretched **Sand dunes** with oasis hollows, karst **Stone pillars** rising out of lake valleys (dripping with vines), and a **Crater field** of impact bowls with raised rims that flood into lakes. World size now goes **96 → 500**: the maximum footprint builds ~730,000 blocks in about three seconds total, thins its subsoil automatically, pulls the reveal camera back with a wider lens, and saves/loads fine — the project block limit rises to **1,500,000** and the coordinate window to ±260.
- **Render distance (big-world performance).** The Light tab's *Render* section gains a **Render distance** slider — **default 125 blocks, adjustable 20–500**: blocks, water and items further than that from the camera are **not drawn at all**. Culling happens on the GPU inside every world material's vertex shader (one shared uniform, `lib/render-dist.js`), so it costs **zero CPU time per frame** — no chunk rebuilds, no buffer churn — and distant geometry is discarded before rasterization. Distance fog now fades out exactly where the cull cuts, so nothing visibly pops, and generating a world larger than the current distance automatically raises it to fit (Undo restores both). The setting lives in the light state, so it saves with the project and round-trips through load (`tests/render-dist-smoke.mjs`, 22 assertions).
- **Blended multi-biome worlds.** *Generate a world* gains a **Mix with** selector: pick any second biome and the generator paints **big noise-driven regions of both palettes into one world** — grass meets sand, pine forests give way to palms, lava lakes sit beside water lakes. Borders are not hard lines: a smoothstep'd region noise plus a **2×2 patch dither** creates a mosaic transition zone that reads like a natural biome edge instead of TV static, and every column's surface/subsurface/stone/beach/water/snow — plus its trees (cacti in the arid pockets, palms in the tropical ones) and cliff vines — comes from that column's own biome. Region scale adapts to world size so even a 96 world shows a readable blend and a 500 world gets several continents' worth. Blends are deterministic per seed, work with all nine landscape styles, ride the same one-Undo-step flow, and are covered by 12 new assertions (`tests/terrain-gen-smoke.mjs` now at 67).
- **Import, cut & assemble video clips (montage).** The Export dialog gains a **Video clips** panel: **Import video…** takes your own **MP4 / WebM / MOV** files (up to 24 clips, 400 MB each, several at once) and lists them as rows — each with a **▶ preview** of the kept piece, **Start/End seconds** (that is the cut: trim the middle out, keep an intro, shorten a outro), the kept length, **▲▼ reorder** and **✕ remove**. **🎞 Render assembly** concatenates the kept pieces **back-to-back into one new video** using the format / resolution / fps you already picked (vertical 9:16 for Shorts works too): clips are seeked frame by frame into a dedicated canvas for exact cuts, scaled with your **Fit** choice (Contain · bars, Cover · crop, Stretch), and each clip's **sound is decoded, trimmed with the video and mixed into the output** (toggle off with *Clip sound*). The result flows through the normal **Video ready → Download** panel, the existing progress bar and Cancel button abort an assembly, and clips stay session-only so saved projects never bloat. Assembly needs the frame-accurate encoder (current Chrome / Edge) and caps at 10 minutes (`lib/video-editor.js`, covered by `tests/video-editor-smoke.mjs`, 50 assertions).

## Open it locally

Double-click **START-HERE.html** in Chrome, Edge or another modern desktop WebGL browser. The separately supplied **Bloxd-Studio-4.0.html** and **Bloxd-Studio.html** are identical. Manual editing assets/libraries are embedded; no install, account, CDN or internet connection is needed for the editor itself. **Gemini generation is optional and requires internet and your own Google API key.**

The live preview also works. The embedded file viewer may block downloads: **download the HTML and open it in a browser to export or save projects**. There is no automatic persistent save—save a project before closing.

## New in 4.0: the expanded game library

- **Blocks:** 1,309 base names (including the 1,179 published Code API roots), with **4,032** orientation/placement/state entries.
- **Items:** all **1,044** published item names plus **66** newer live entries. **1,098** have published usable visuals; 12 internal caught-NPC/brainrot entries are clearly disabled. Blocks can also be placed/held as inventory objects.
- **Models:** **1,674** static source models, including all 1,382 original default-pack GLBs.
- **Textures:** browse/download **3,588 PNG images**, comprising all **2,074 unchanged original-pack PNGs**, newer public images, model-image extractions and labeled equipment tints.
- The ZIP includes the complete public default pack: **3,486 original PNG/GLB/JPEG files**, including all **30 skybox faces**. Skybox files are supplied separately, not as a new background selector.

Use text search, group filters and the page arrows. **States / internal** shows advanced variants; search also reveals matching internal/state names. **Coverage** explains what is included and unavailable. The `temp` block and 12 internal items have no published graphic; no fake replacement is advertised as original.

See **ASSET-LIBRARY.md**, **ASSET-CATALOG.csv** and **ASSET-COVERAGE.json** for the exact scope and sources. This is the complete public default-pack collection and the catalog that could be verified—not every private cosmetic, skin or future asset.

## Fixed in 3.1: video downloads and direct motion

**Video:** use **Export → Render video**, wait for **Video ready**, then click **Download MP4 / WebM** underneath the player. This is a real, user-clicked download—not a delayed automatic download that can be silently blocked. The finished clip stays in the tab for preview and repeated downloading. Render again after editing the scene; the ready clip is the last completed export.

**Motion:** the editor calculates the transition between saved positions, scales and orientations. Rotation now uses the **shortest quaternion path**, independent of which way you dragged or how many extra turns the angle value contains. For example, 355° → 5° is a 10° turn, and 0° → 270° takes the direct −90° route. Multi-axis and body-part poses use the same method. Explicitly saved intermediate keys remain intentional waypoints.

If you really want revolutions, select **Motion between saved poses → Full spins** for that object. Then 0° → 720° produces two turns. On a player, this setting covers its root, body-part and held-item keys together. The choice is undoable and saved with the project. Old projects without the setting now use shortest-path rotation by default; no authored keys are deleted.

## Gemini Director

1. Open the downloaded HTML in a full browser (or use the live app), then click **Gemini**.
2. Enter your key in the password-style field. It stays in tab memory and is not saved in projects.
3. Describe a scene, for example: **“Build a stone bridge, add another Bob with a diamond pickaxe, make him walk across and wave, orbit the camera and use sunset lighting.”**
4. Click **Generate plan**. Review the commands and any replacement/removal warnings.
5. **Apply & play** creates real editable objects and keys. One **Undo** restores the complete old scene.

Gemini can fill/erase terrain, create rolling terrain, extract a terrain block for animation, add characters/items/props, equip and pose characters, bake walk/run/wave/mine/jump motion, set precise root/held-item keys, create camera travel and adjust lighting. Ground-aware walking follows voxel terrain heights. You can edit the result with all existing controls.

**Google receives your prompt and a limited scene summary**, not actual textures, model files, skins or audio. API quota/charges can apply; no automatic retries. A generated plan is checked against a restricted command vocabulary, not executed as JavaScript. **Forget** clears the key. The embedded file preview can block Google requests; use the live app or downloaded file for real generation.

**Try an offline command example** demonstrates the same command runner without a key. It is labeled as a local example, **not a Gemini response**.

See **GEMINI-COMMANDS.md** for privacy/security details, supported operations, limits, the exact JSON format and troubleshooting. `gemini-command-schema.json` is the machine-readable schema. Live model quality/availability was not tested with a real key; browser integration tests use mocked Google responses.

## Quick controls

| What you want | What to click |
|---|---|
| Generate an animation with your Gemini key | **Gemini → describe → Generate plan → review → Apply & play** |
| Add blocks | **Blocks → choose a texture → Place**, then click a block face |
| Remove blocks | **Remove**, then ordinary left-click; right-click in Place mode also erases |
| Rotate one block | **Select**, click the block, then **Rotate selected** or **E** |
| Rotate the player | Select Bob in the scene list → **Whole player** → Rotate |
| Pose an arm, head or leg | Click the visible body part, or choose a part in **Pose rig** |
| Rotate the held pickaxe | **Held item**, then drag a colored ring or type XYZ angles |
| Put a separate tool in the scene | **Tools → Place item → choose an item** |
| Equip a player | Select Bob → **Tools → Equip player → choose an item** |
| Make the edit move | Set **Time**, edit, click **Apply pose / transform**, then **From start** |
| Hear/export sound | **Export → Sound track → MP3 audio** |
| Export the moving picture | **Export → Render video → Download** |

Rotation has exact XYZ angle fields, **+90°** buttons and optional **15° snap**. Selecting a terrain block converts that one instanced cell into an independent, centered block without duplicating it. That conversion, block placement/removal, transforms and animation-key edits support Undo/Redo.

Body parts rotate at fixed joint pivots; use **Whole player** to move or scale the character. A held item can move, rotate and scale independently. Deleting a selected held item clears the hand, not the player. Choose Whole player before deleting the character itself.

### Reliable keyframing in 2.1

For example, to rotate a block over three seconds:
1. Select the block.
2. Type **3.00** into the timeline's **Time** field.
3. Rotate it (for example, Y = 90°).
4. Click **Apply transform**.
5. Click **From start** to preview the complete motion.

Its original pose is automatically saved at **0 seconds**, so the result actually animates instead of holding a single later key for the whole clip. You can also **rotate first, then choose the time**: the amber pending-edit indicator means your changes are kept, not wiped out by scrubbing. Only edited channels are carried; other animated positions, body parts and held-item channels continue to sample at the chosen time.

**Revert edit** cancels a pending change without deleting existing keys. Apply is undoable as one action, including an automatically added starting key. Play, From start, video recording and Save project also apply pending edits at their chosen times, so they are not silently lost. Raw project data preserves pending edits as well.

Normal Play resumes from the playhead. **From start** rewinds before playing, so a key at 3 seconds is not previewed only from its already-finished pose. Your editing view stays put while choosing key times; playback restores the animated camera, and the Camera inspector still previews camera keys.

If an older saved project contains only a later key, its original pre-edit pose was never stored. Applying another key now adds a safe 0-second key from that track's earliest saved pose; it does not invent the missing original. You can explicitly edit and apply a new pose at Time = 0 to choose a different start.

### Shortcuts

- **V** Select; **B** Place blocks; **X** Remove blocks.
- **W / E / R** move / rotate / scale. **F** focus selection.
- Drag to orbit; right-drag to pan; scroll to zoom.
- **Space** play/pause; **H** clean view / return to editor.
- **Ctrl+Z / Ctrl+Shift+Z** Undo / Redo; **Ctrl+D** duplicate.
- **Delete** removes the selected timeline key, or otherwise the selected object.
- **Ctrl+S** downloads the project JSON. Use **Open** to continue later.

## What changed about the tools?

The original 32-equipment selection keeps its source PNGs on thin pixel-extruded meshes. The expanded library uses original-textured sprites and decoded source-model geometry, depending on the asset. Opaque pixels form the silhouette; transparent pixels are holes, not a rectangle. Nearest-neighbor filtering and unlit, non-tone-mapped face materials preserve the PNG colors. The five gold textures are included explicitly, not substituted with iron icons.

Select a tool or Bob to see the **Applied texture** preview and download the PNG. **Shade tools with scene lighting** is optional; original colors are the default. The sword/axe display stands are separate selectable blocks, not part of the tool pivots.

Original source GLBs remain unchanged in `assets/default-pack/models/`; the old small sample remains under `assets/models/` for compatibility. The Models tab exposes source geometry, while selected inventory tools retain the thinner PNG-derived display. Bob is still a reference-based classic-skin recreation, not a verified game extraction.

## Animation and cameras

- Every character has an independent pose track. Keys store its root transform, all ten joint rotations, body lift and held-item transform.
- Separate blocks, tools, trees, lamps and imported models have their own transform tracks. Select an object to reveal its keys.
- Rotation defaults to the shortest orientation-to-orientation path. **Full spins** is an explicit per-object option for intentional revolutions. Positions/scales interpolate directly between their saved endpoints with smooth timing; mouse gestures are not replayed.
- Scrubbing previews all tracks, while pending edits are preserved until applied or reverted. Apply stores the edited channels together with the rest of the sampled pose/transform at that time.
- Click a key to preview it; drag to retime; use the timeline trash button to delete it. Applying or dragging onto the same moment replaces the key instead of creating duplicate timestamps. Closely spaced keys (including adjacent 30 fps frames) stay separate. Clear track buttons support Undo.
- **Animate preset** provides idle/walk/wave/mining/jump motion. Existing pose keys take precedence during playback; clear that track to use the procedural preset throughout.
- Orbit/pan to a view and click **Key camera**. Keys store position, target and field of view. Smooth mode uses an arc-length-sampled spline; linear mode is also available.
- Duration is 2–60 seconds. Keys beyond a shortened end remain saved. Non-looping playback holds on the final frame.
- In **Light**, drag the sun pad or adjust direction, intensity, color, shadows and fog. The camera and lighting features from version 1 are retained.

## MP3, sound and video

**MP3 is audio only. It cannot contain moving images.** The Export dialog keeps MP3 and video separate.

Choose a sound source:
1. **Built-in mining + footsteps:** original synthesized demo effects, repeated every eight seconds for longer clips. These are not copied Bloxd sounds and are not automatically inferred from your edits/movements.
2. **Imported audio:** load a local, browser-decodable MP3, WAV, OGG or supported M4A (up to 15 MB). Set volume, the start time within the scene, and optional looping. Without looping, the remainder after the audio ends is silent. The audio is embedded in the saved project.
3. **Silence:** an explicit silent track.

**Preview sound** plays the whole track; **Stop sound** stops it. **Sound on timeline** enables sound during animation preview. Export produces real **128 kbps, 44.1 kHz, mono MP3**, synthesized/decoded/resampled and encoded locally. Imported stereo audio is mixed to mono. A few tens of milliseconds of MP3 encoder padding are normal. The separately provided `Maple-Clearing-Soundtrack.mp3` is the built-in eight-second demo track, not a video.

**Video:** real MP4 (H.264, with AAC audio when supported) or WebM (VP9/VP8 + optional Opus sound). **Auto** selects a compatible combination; it never renames WebM bytes to `.mp4` or silently drops requested audio. Some browsers, including the tested Linux Chromium, lack AAC encoding: use WebM for sound, or uncheck Include sound for a silent MP4.

Choose 360p / 540p / 720p / 1080p and 24 or 30 fps. Modern browsers use local WebCodecs to render the whole timeline **frame by frame with explicit timestamps**. Rendering may take longer than the clip, but the video is not stretched by that wait. Normal codec padding can add a few milliseconds (the tested Opus/WebM files add 20 ms). Loop is exported once. Imported clips and live character presets are sampled deterministically, not recorded from your mouse gestures.

The export panel shows actual frame progress, cancellation and a retained video player/download link. Export restores the editor's scene, view and playhead afterward; failed/cancelled work does not replace the last good file. PNG and video omit editor controls, selection rings, handles, path overlays and joint markers.

If WebCodecs is unavailable, the editor uses a clearly labeled real-time compatibility capture, then re-muxes the packets into a valid, seekable file. This fallback is hardware-dependent and can have lower frame rate / timing variation; keep the tab visible. It no longer uses the old WebM duration patch that could produce container warnings.

**Embedded previews can still forbid downloads at the platform level.** The app cannot override its parent iframe's sandbox. Use the live app in its own tab or open the downloaded HTML in a full Chrome/Edge browser. Save your current project before refreshing or switching versions.

## Bring your own models

Imports: self-contained, uncompressed **GLB** with textures/optional animation; **OBJ** geometry; **STL**; **PLY** meshes. Imports stay in your browser. The first embedded GLB animation can be previewed.

Limits: 20 MB per model; 1.5 million vertices. Draco/KTX/meshopt compression and external OBJ/MTL textures are not supported. There is no automatic humanoid rigging for arbitrary imports. Bob is the built-in poseable character; the recreated neutral rig and atlas are included as `assets/bob-classic-rig.glb` and `assets/bob-classic-skin.png`. You can load a standard 64×64 skin PNG.

Optional voxel conversion uses uniform cubes and works best on closed meshes. Fine details/open surfaces may disappear; Undo restores the original mesh.

**Download selected GLB** exports the selected whole object, held item or body-part hierarchy in its current pose. It does **not** export the editor's full timeline. Keep the project JSON for editable animation data.

## Project compatibility and assets

Version 4.0 saves blocks, object keys, held-item transforms, rotation-path settings, embedded audio, scene titles and optional pending edits. Old block IDs are retained through aliases. Projects using newly added assets need this expanded editor to reopen correctly. It retains the version-2 project format with an editor-version marker. Generated scenes need no key or internet to reopen. Gemini API credentials and request history are not saved. Version 1 projects can also be opened; legacy tool stands are separated into editable blocks during conversion. Project-file limit: 40 MB, 50,000 terrain cells and 1,000 scene objects.

The full public default pack and expanded live/catalog mappings are included. Exact counts and the 13 unavailable/internal entries are documented in ASSET-LIBRARY.md. The Bob atlas/rig is still a separate reference-based recreation. See `CREDITS.md` and `assets/manifest.json` for exact provenance and rights notices. This is an unofficial fan-made editor.

## Modify / rebuild

The repository root **is** the website. Run the modular app with Python 3:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Open `http://localhost:8000`. To rebuild the standalone file using Node 20+:

```sh
npm ci
npm run build
```

Key source files:
- `app.js`: scene editing, scoped selection, timeline, history, recording and persistence.
- `lib/assets.js`: source textures, source-model/procedural geometry, lazy materials and previews; `lib/asset-data.js`: locally compressed complete asset bank.
- `assets/catalog.json`, `assets/catalog-sources/`: source-aware catalog and normalized provenance.
- `tools/build-asset-library.py`: reproducible public asset-bank builder (Pillow / NumPy / DracoPy needed only for rebuilding).
- `lib/character.js`: recreated Bob rig; `lib/world.js`: instanced terrain/props.
- `lib/tracks.js`, `lib/interpolation.js`: keyframe sampling and shortest-path quaternion interpolation.
- `lib/video-export.js`: capability detection, exact-timestamp frame rendering, real-time fallback and container muxing.
- `lib/key-edit.js`: per-channel pending edits, key snapshots and draft validation.
- `lib/ai-commands.js`: command schema, planner instructions, safe compiler and offline example.
- `lib/gemini-client.js`: fixed-origin Google API requests, model discovery, cancellation and error handling.
- `lib/ai-panel.js`: key entry, prompt UI, command review and apply workflow.
- `lib/audio.js`: local effects, audio import/mixing/preview and MP3 encoding.
- `lib/importers.js`: model loaders and voxel conversion.
- `index.html`, `style.css`: editor UI.
- `vendor/`: local libraries, full licenses and lamejs's complete upstream source archive.

The LGPL MP3 library is replaceable. Its only local changes are an attribution comment and ESM export. Extract `vendor/lamejs-1.2.1-source.tgz`, modify or replace `vendor/lamejs.js`, and run `npm run build` to relink the standalone editor. The full application source is included; no restriction is imposed on reverse engineering for debugging modifications to the LGPL library.

For regression tests, install Chromium with `npx playwright install --with-deps chromium`, start the server above, then run `npm test`. Run `npm run build && npm run test:offline` for file/offline/sandbox checks. `npm run test:video` uses `ffprobe` / `ffmpeg` (QA only) to decode and inspect the actual video downloads. See `TESTED.md` for the actual verified results.
