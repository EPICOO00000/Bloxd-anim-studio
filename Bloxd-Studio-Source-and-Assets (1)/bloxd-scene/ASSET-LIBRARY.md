# Expanded asset library — version 4.0

This collection was checked on **23 October 2026**. It expands the editor's former 15-block / 32-tool selection into a source-audited catalog. It is **not a claim that every private cosmetic, premium skin, unpublished resource, or future update has been extracted**.

## Included

| Collection | Count / scope |
|---|---|
| Official public default-pack PNGs | **2,074**, original files unchanged |
| Official public default-pack GLBs | **1,382**, original files unchanged |
| Official public skybox JPEG faces | **30**, original files in the ZIP |
| Total original default-pack files | **3,486**, all checked against their upstream Git blob hashes |
| Published Code API block root names | **1,179**, every name indexed |
| Base block names including live additions / parts | **1,309** |
| Block + orientation / placement / state entries | **4,032**; 4,031 have a usable visual |
| Published Code API item names | **1,044**, every name indexed |
| Inventory-item entries including live additions | **1,110**; 1,098 have a published usable graphic |
| Source-model choices | **1,674**: 1,382 original-pack GLBs, 174 newer public game GLBs and 118 live block-model data records |
| Images available in the texture browser | **3,588**: 2,074 original PNGs, 171 newer public PNGs, 1,258 model-image extractions and 85 explicitly tinted equipment variants |

The Items tab also includes block-shaped inventory objects so a player can hold blocks. Those are **not counted as additional unique non-block game items**. The Models tab includes raw source models; some represent assets also present in other tabs.

## Use the library

- **Blocks:** search or filter by family, choose a block and use Place / Remove. The same selection, rotation, keyframe and Undo controls work on converted/placed blocks.
- **Items:** place an independent item or equip the selected player. Newer examples include clocks, vehicles, riding gear, equipment, food, potions, spawn items and caught-creature icons.
- **Models:** place or hold static source geometry. This is not automatic character rigging. Bob remains the editor's separately recreated ten-joint character.
- **Textures:** inspect/download PNG files with dimensions and source labels. This includes source atlases, effects/UI images and unused art; a texture file is not automatically a valid placeable game block.
- **Bob:** add another poseable classic Bob recreation.

The library uses **48 cards per page**, group filters and text search. **States / internal** reveals extra states and system/part entries. Searching also includes those entries so an exact name is not silently hidden. Model/non-cube thumbnails are rendered lazily.

Click **Coverage** for totals and the list of unavailable entries. `ASSET-CATALOG.csv` lists every block/state and non-block item entry; `ASSET-COVERAGE.json` records counts, source revisions and gaps.

## Shapes, faces and states

The catalog uses per-face texture assignments instead of inventing a single texture from the display name. Cube faces, slabs, stairs, cutout plants, transparent glass and source-model furniture use separate geometry/material handling. Door states, part blocks and orientation variants are distinct entries. Animated texture frames are switched locally at a uniform preview rate.

Bulk terrain remains instanced. Material and geometry prototypes are created lazily. Static GLB source geometry is decoded during the build, including Draco-compressed source models, so the packaged editor does **not** need an online decoder or model CDN.

Rendering limitations:
- This is an animation editor, not Bloxd's full gameplay/physics/shader engine.
- Doors, bed heads, tall-plant parts, machines and other multi-block structures may require placing their separate part entries. Selecting a door state is not a simulated door interaction.
- Slab/stair dimensions and source-model UVs are retained; plants/custom-plane blocks are editor-generated plane layouts from the catalog's shape type.
- Large wave/internal rocket models can legitimately extend across multiple cells. Antler wall decorations are fitted to one cell to avoid the source node-scale + model-scale combination making them ten blocks tall; raw source files remain unchanged.
- Original source models are static in this library. Importing/auto-rigging every game mob or implementing vehicle controls, weapon firing, crop growth and item mechanics is not included.
- Armor items can be placed/held; this does not add automatic wearable armor slots. The generic held-item grip can be adjusted through the existing Held item transform controls.
- The skybox JPEG originals are supplied in `assets/default-pack/skyBoxes/`; this release does not add a skybox-background selector. The PNG texture browser and models are embedded in the standalone editor.

## Explicit gaps

The developer placeholder **`temp`** has no usable block graphic. The following 12 generated/internal item names have no published image/model at the checked sources and are **listed but disabled**, not represented as invented gray placeholders:

- Caught Mob NPC Default
- Caught Mob NPC Emma
- Caught Mob NPC Leo
- Caught Mob NPC Isabel
- Caught Mob NPC Sanjay
- Caught Mob NPC Imara
- Caught Mob NPC Enoch
- Caught Mob NPC Sara
- Caught Mob NPC Carmen
- Caught Mob 67 Default
- Caught Mob Bobino_Musculino Default
- Caught Mob Capitano_Explovissimo Default

Some metadata variants intentionally share a source appearance, such as charging/ammunition states or caught-creature variants that the game itself maps to a common icon. Grayscale wood equipment uses the publicly exposed game color palette; those derived PNGs are labeled **palette variants**, not falsely described as unchanged originals.

## Sources and provenance

1. **Bloxdy / texture-packs**, full `default/` asset collection, pinned revision:
   `e7c5a7e17f895c7df6bfe788667ccb7cbdee00c9`
   https://github.com/Bloxdy/texture-packs
2. **Bloxdy / code-api**, published `BLOCK_NAMES.txt` and `ITEM_NAMES.txt`, revision:
   `dad3ae7adee0b3d9b2e281c830d776698db4ca1c`
   https://github.com/Bloxdy/code-api
3. **BloxdHub Builder Studio**, public block/state/face mappings and public live asset mirror:
   https://bloxdhub.com/builder-studio
   https://bloxdhub.com/build/assets/blocks-DzukVGOz.js
4. **Public Bloxd game client**, graphic references, metadata families and equipment colors:
   https://bloxd.io/static/js/9s8fb.main.a0c909b6.js
   New model files use their explicitly referenced public URLs under `https://static1.bloxd.io/models/`.

Only graphics-related normalized data and public art/model files are included. The full game or BloxdHub editor application code is **not** bundled. No account, login, private storage or user credentials were used to collect the public files.

Per-file URLs, hashes and source categories are in `assets/manifest.json`, `assets/default-pack-manifest.json`, `assets/catalog.json` and `assets/catalog-sources/`. Original upstream PNG/GLB/JPEG files are preserved. Model-image copies are losslessly re-encoded PNGs for the local texture bank.

These assets remain associated with their owners. Public accessibility does not make them public-domain or grant blanket redistribution/commercial permission. This is an unofficial fan-made editor. See `CREDITS.md`.

## Rebuilding the collection

The source bundle contains the normalized catalog inputs, original asset files and a portable build tool:

```sh
python3 -m pip install -r tools/requirements-assets.txt
python3 tools/build-asset-library.py
npm ci
npm run build
```

`DracoPy` is a **build-time** decoder only. The runtime uses the included `fflate` MIT-licensed decompressor to unpack a local data bank; there is no runtime fetch of game assets. Existing v1–v3 projects retain the old short block IDs through aliases.

Gemini receives compact base-block/item catalogs, not thousands of duplicated geometry blobs or images. New block names and item choices work with the existing validated command interpreter. Gemini still uses your own API key and is optional.
