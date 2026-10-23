# Asset provenance & notices — version 4.0

This is an **unofficial fan-made editor**, not a Bloxd.io product and not affiliated with or endorsed by Bloxd.io.

## Original textures and source equipment models

- Source: **Bloxdy / texture-packs**, `default/textures/` and `default/models/`.
- Repository: https://github.com/Bloxdy/texture-packs
- Pinned revision: `e7c5a7e17f895c7df6bfe788667ccb7cbdee00c9`.
- Retrieved: 22 October 2026.
- The **2,074 PNGs, 1,382 GLBs and 30 skybox JPEGs** in `assets/default-pack/` are unchanged and checked against their upstream Git blob hashes. `assets/manifest.json` records each exact URL, filename and original byte size. Bob's atlas is a separate recreation.
- Version 2 includes the five original `golden_*` PNGs explicitly.
- **Display geometry changed in version 2:** tool silhouettes are extruded from the original sprites' opaque pixels, with the PNG directly UV-mapped to the front and back. Edge walls use the same pixel's color with slight shading. The default unlit, non-tone-mapped material preserves source face colors. Optional scene lighting can be enabled. This is derived geometry, not the original GLB mesh.
- The complete source-model collection is retained in the bundle. Version 4.0 decodes static geometry for the Models tab and modeled blocks/items; the original small equipment set retains its corrected thin-sprite look.
- Held-item placement, centered standalone pivots and separate block stands are editor additions.
- The artwork is **not** public-domain or newly authored here. Relevant Bloxd rights remain with their owners. Public availability of the texture pack does not imply unrestricted redistribution or commercial permission. Check source terms for your intended use.

The original 32-item selection is now part of the much larger catalog. See ASSET-LIBRARY.md for complete counts, public/live sources and explicit gaps. No claim is made to include every private cosmetic or unpublished resource.

## Classic Bob recreation

`assets/bob-classic-skin.png`, `assets/bob-classic-rig.glb` and the rig in `lib/character.js` are **reference-based recreations**, not a verified original character model or extracted skin.

Visual references:
- https://bloxd-io.fandom.com/wiki/Bob
- https://bloxd-io.fandom.com/wiki/Skins#Gallery_of_old_skins
- https://static.wikia.nocookie.net/bloxd-io/images/b/b9/Bob_model_old.png

Recreated features: dark brown hair, light brown skin, blue-violet eyes, red hoodie with cords/pocket, brown belt, cyan trousers and dark shoes. The 64×64 PNG uses a standard cuboid skin atlas. Ten named joint pivots, including separate elbows and knees, were authored for this editor; they are not claimed to match the game's rig. No reference screenshot is embedded in the app.

Bob's design remains associated with Bloxd. No claim of exclusive ownership or blanket usage rights is made.

## Three.js

Three.js r160 and matching controls, loaders, utilities and GLTF exporter: **MIT**, copyright 2010–2023 Three.js Authors. Full notice: `vendor/LICENSE-three.txt`, also preserved in the standalone file.

## WebM duration helper

`fix-webm-duration` 1.0.6 by Yusitnikov: **MIT**. The UMD wrapper was adapted to ESM; implementation unchanged. Retained for source history; version 3.1 no longer uses it to modify recorded video. The new export pipeline muxes/re-muxes containers with Mediabunny instead.

- https://github.com/yusitnikov/fix-webm-duration
- `vendor/LICENSE-fix-webm-duration.txt`

## MP3 encoder: lamejs / LAME

`lamejs` 1.2.1 by **Alex Zhukov**, based on **LAME** and its Java port. The npm package declares **LGPL-3.0**. The upstream source archive also contains older LAME library-license notices, retained here verbatim.

- https://github.com/zhuker/lamejs
- https://lame.sourceforge.net/
- Package/source: https://registry.npmjs.org/lamejs/-/lamejs-1.2.1.tgz
- `vendor/lamejs-1.2.1-source.tgz`: complete, unchanged upstream npm source archive, not only the minified binary.
- `vendor/lamejs.js`: upstream `lame.min.js`, with an attribution comment and `export default lamejs;` added. No encoder internals changed.
- `vendor/LICENSE-lamejs.txt`: the upstream package's license/acknowledgement note.
- `vendor/LGPL-3.0.txt` and `vendor/GPL-3.0.txt`: full license texts.
- `vendor/COPYING-LAME-legacy.txt`: unchanged older library-license text from the source archive.

Full notices are also embedded in the standalone HTML. Complete editor/build sources accompany this distribution so the LGPL library can be replaced or modified and the app rebuilt with `npm run build`. No restriction is imposed on reverse engineering for debugging such modifications. The encoder is provided without warranty under its applicable licenses.

## Editor-authored elements and audio

Scene composition, terrain layout, tree assembly, separate block stands, lantern, animation data, editor UI, sprite-extrusion code and application logic were built for this project.

The built-in audio consists of **original, procedurally synthesized footsteps/mining-style effects**. It is not copied Bloxd audio, is not music, and is not automatically generated from arbitrary scene actions. Imported audio remains the user's responsibility. Audio processing and MP3 encoding happen locally in the browser.

## Optional Gemini Director

The browser client calls Google’s Gemini API directly using the user’s own key. No Google SDK, remote script, model weights or shared credentials are bundled. All scene command validation/execution is editor-authored local code. The fixed offline example is locally authored and is not presented as a Gemini generation.

Google/Gemini names are used descriptively and remain associated with their owners. This is not an endorsed Google product. Google’s API terms, account access, quotas, billing and data-processing conditions apply to requests the user submits. See `GEMINI-COMMANDS.md` for references and privacy details.

## Video muxing and encoding orchestration: Mediabunny

**Mediabunny 1.62.1**, copyright 2026-present Vanilagy and contributors, **Mozilla Public License 2.0**. The browser-native WebCodecs encoders perform actual encoding; no cloud video service or codec CDN is used.

- https://github.com/Vanilagy/mediabunny
- https://mediabunny.dev/
- `vendor/mediabunny.mjs`: unchanged upstream browser ESM bundle.
- `vendor/LICENSE-mediabunny.txt`: complete MPL-2.0 license, also embedded in the standalone HTML.
- `vendor/mediabunny-1.62.1-source.tgz`: complete upstream package, including 67 files in `src/` (the preferred TypeScript source form), plus generated distributions/maps.
- Upstream archive: https://registry.npmjs.org/mediabunny/-/mediabunny-1.62.1.tgz
- Verified SHA-512 (base64): `lYzeerDwo9QLhBCipqQDXOSV7InvaIFplllZQviPO5rPwH+IUr8M1uvumk1olIUgMRGkPiInRriv25WFErUgMw==`

No upstream library internals were modified. The source archive and rebuildable application accompany the release. Replace/rebuild the library and run `npm run build` to regenerate the standalone editor. Browser codec availability varies by browser/platform; an MP4 filename is never used for WebM data. FFmpeg is used only in development tests, not bundled or required by the editor.

## Expanded catalog and live public additions

The complete public default pack is supplemented by graphics metadata from Bloxdy's public Code API lists, the public Bloxd game client, and BloxdHub Builder Studio's public block/state/face mappings and live asset mirror. BloxdHub is credited for that mapping/mirror data. The editor does not include BloxdHub's editor application code or the full Bloxd game client. Only normalized graphics-related records and public art/model files are included.

Exact URLs/revisions/hashes and the distinction between unchanged files, extracted model images, and game-palette-derived sprites are recorded in `ASSET-LIBRARY.md`, `assets/manifest.json`, `assets/default-pack-manifest.json`, `assets/catalog.json`, and `assets/catalog-sources/`. Original game-art rights remain with their owners; public access is not a public-domain declaration or blanket commercial/redistribution permission.

## Local compression

`fflate` 0.8.2 by Arjun Barrett and contributors, **MIT**. The unchanged browser module is vendored as `vendor/fflate.js`; the full license is in `vendor/LICENSE-fflate.txt` and the standalone file. It decompresses the embedded asset bank locally, with no network dependency. https://github.com/101arrowz/fflate

DracoPy, NumPy and Pillow are build-time tools used to decode source geometry and prepare image data; they are not shipped as runtime binaries. Original compressed GLB files remain available in the package. Decoding source-pack Draco geometry does not add support for arbitrary Draco-compressed user imports in the editor's existing model importer.
