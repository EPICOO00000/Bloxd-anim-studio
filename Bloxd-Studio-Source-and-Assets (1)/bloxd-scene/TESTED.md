# Verified behavior — Bloxd Studio 4.0

Verified on **23 October 2026** with real Playwright Chromium 156 / software-rendered WebGL. Downloaded media was inspected and decoded with FFmpeg/ffprobe 7.1.5. Those command-line tools are for QA only; the editor does not require them.

## Current results

| Suite | Result | Included report |
|---|---:|---|
| Editor regression | **58 / 58** | `tests/verified-functional-report.json` |
| Textures, editing and audio | **60 / 60** | `tests/verified-refinement-report.json` |
| Keyframe application regression | **43 / 43** | `tests/verified-keyframe-report.json` |
| Gemini client / command interpreter (mocked API) | **70 / 70** | `tests/verified-gemini-report.json` |
| Full asset catalog / geometry / source integrity | **37 / 37** | `tests/verified-catalog-report.json` |
| Standalone, offline, opaque iframe | **21 / 21** | `tests/verified-offline-report.json` |

Earlier v3.0 standalone-Gemini and v3.1 dedicated video/rotation reports are retained under `tests/historical/` as historical coverage, not counted as current v4.0 test runs. The v4.0 editor and offline suites re-encoded/downloaded the full eight-second video and verified its media tracks/timing. No real Gemini key or billable model request was used. API tests use controlled responses and do not verify live model quality, account access or quota.

## Full asset library verification — v4.0

The same 37-check catalog suite passed on both the HTTP-served app and the actual standalone file opened with `file://`. All original default-pack files were rehashed and checked against the pinned upstream Git blob IDs.

- **3,486** unchanged original files verified: 2,074 PNGs, 1,382 GLBs and 30 skybox JPEG faces.
- All **1,179 published block root names** and **1,044 published item names** are indexed, plus live additions. The current catalog has **1,309 base block names / 4,032 states** and **1,110 non-block item entries**.
- All **4,031 enabled block/state entries** and **4,080 enabled inventory/block-item/source-model choices** were instantiated and checked for nonempty, finite geometry. No geometry construction failures were found. This count includes overlapping source-model choices, not 4,080 unique game items.
- Slabs have half-height geometry; stairs have two-box geometry; open/closed doors differ; furniture and lanterns use source models; cutout plants are planes; glass uses transparent/cutout materials rather than an opaque fake cube.
- Rare/new items such as clocks can be placed. New inventory items can be equipped and rotated. Tinted wood equipment uses distinct, labeled game-palette images.
- Pagination limits DOM cards to 48. Page navigation, group filters, state/name search, the Models tab, raw texture inspection and byte-identical original PNG downloads were exercised.
- Twelve internal item graphics and the `temp` block are explicitly unavailable. The Coverage dialog names them instead of advertising invented substitutes.
- Gemini receives the expanded usable catalog with a compact context of roughly **59,000 characters** in the test scene, below the 180,000-character guard. Canonical game names and legacy short block IDs both work.
- Non-cube terrain uses the correct prototype geometry and surface height; new block types survive project round-trips.
- The previous 32-equipment texture checks still pass: 225 sampled front-face pixels have zero RGB error against their source PNGs.
- No missing-asset or unexpected JavaScript errors were observed. The asset library makes no remote runtime requests; its bank is decompressed locally.

This verifies technical inclusion and rendering behavior, not that every game shader, multi-block placement rule, collision mechanic or private cosmetic has been reproduced. Read ASSET-LIBRARY.md for the exact scope, part/state behavior, antler display normalization, skybox-file scope and named gaps.

The expanded library preserves the tested v3.1 export and shortest-rotation code. Historical details below describe those fixes; the v4.0 regression/offline runs verify they remain integrated.

## Video download fix

The old implementation attempted a delayed automatic download after MediaRecorder completed, then discarded the temporary URL. A browser could block the download with no retained clip or retry control. Its WebM-duration patch also produced an invalid-container warning in the compatibility-capture test: an unknown-sized cluster was enclosed in a finite-sized parent.

The retained v3.1 video implementation was tested to:
- Keep a finished, playable video in the Export panel with an explicit, user-clicked **Download MP4 / WebM** link.
- Make **no automatic video-download attempt**. The same retained file can be downloaded again without rendering again; closing and reopening Export keeps it available.
- Render each timeline frame with explicit timestamps using native WebCodecs when supported. The editor's scene, camera and time are restored after success, failure and cancellation.
- Create genuine containers with matching filenames/codecs—not WebM renamed to MP4.
- Keep the previous good clip if a later export fails or is cancelled.
- Provide a real-time MediaRecorder compatibility path when WebCodecs is unavailable. Its packets are re-muxed into a seekable container, not patched with the old duration helper.
- Report unsupported MP4/AAC configurations instead of silently losing sound or claiming a successful save.

### Actual downloaded files

| Test export | Verified result |
|---|---|
| 2-second WebM + sound | VP9 + Opus, **640×360, 24 fps, 48 decoded video frames**, 2.020 s container duration |
| 2-second silent MP4 | H.264 in MP4, **640×360, 24 fps, 48 decoded video frames**, **2.000 s** duration |
| Full starter WebM + sound | **192 frames**, 640×360 at 24 fps, **8.020 s** container duration for the eight-second timeline |
| Compatibility capture | VP8 + Opus in a valid re-muxed WebM; completely decoded without container errors |

Both normal downloaded formats completely decoded without errors. Frame hashes showed **48 different pictures** in the two-second test, not one frozen screenshot. The 20 ms WebM extension is normal audio codec padding, not seconds of recording drift.

The tested Linux Chromium supports H.264 video encoding but not AAC audio encoding. Therefore **silent MP4 and WebM with sound were verified**, while MP4+AAC with sound was not available to exercise here. Auto selects WebM when compatible MP4+sound encoding is unavailable. Availability on other browsers/platforms may differ.

Real-time fallback does not guarantee a fixed frame rate or exact length on slow hardware. VFR decoding tests use a fine output time base so FFmpeg's null-output timestamp rounding is not misidentified as input corruption.

### Platform download restrictions

A sandbox without `allow-downloads` can still forbid downloads even after a valid clip exists. The app cannot override its parent iframe policy. Tests verified clip retention and the warning inside an opaque preview, but did not claim that the sandbox permits downloading. Actual user-clicked file downloads were verified in full HTTP and `file://` browser pages.

## Direct, endpoint-based motion

Rotation now uses shortest-path quaternion interpolation by default, not linear interpolation of accumulated Euler turns. Position and scale are calculated between saved endpoint values; intermediate mouse/number-field edits are not replayed as animation keys.

Verified:
- 0° → 270° takes the direct **−90°** route; its halfway orientation is −45°.
- 355° → 5° crosses zero by the short route rather than traversing 350°.
- A position edited through −4 and +7 before ending at +4 produces only the saved endpoint transition, with midpoint +2; scale 1 → 2 has midpoint 1.5.
- Blocks, whole players, individual body parts and held tools share the corrected behavior.
- Sixty multi-axis endpoint pairs at three intermediate fractions were compared against equivalent representations with added/subtracted full turns. Maximum quaternion mismatch was approximately **5.96×10⁻⁸ radians**.
- Exactly-180° ties have a deterministic convention independent of angle winding. Equivalent Euler representations do not introduce unwanted movement.
- **Full spins** explicitly preserves numeric revolution counts when wanted. The setting supports Undo/Redo and project save/load; Gemini's `animate` / `motion` commands can explicitly choose it.

The older explicit-full-turn checks were updated to opt into Full spins. Tests of ambiguous 180° cases now compare orientations/shortest arcs rather than assuming the old Euler direction.

## Earlier keyframe fix retained

The prior first-late-key defect and edit-loss-on-scrub defect remain fixed. A block first keyed to 90° at three seconds samples **0°, 45°, 90°** at 0, 1.5 and 3 seconds. Both edit-first/time-second and time-first/edit-second workflows work, including a real timeline click while a number field is still focused.

Other checks include real rotation-ring drags; pending per-channel edits; automatic starting keys; Apply Undo/Redo; preserving unrelated animated channels; exact time entry; From start playback; pause-inspector synchronization; save/open; reversible Revert; nearby key spacing; retiming onto an occupied moment; legacy late-only tracks; and animated duplicate offsets. Bob's original unmentioned demo keys remain intact.

## Gemini retained

The current HTTP-app suite rechecked model discovery, authenticated POST request structure, structured JSON schema, compatibility mode, privacy boundaries, review-before-apply, destructive-change acknowledgement, atomic batches, Undo/Redo, terrain and height maps, grounded actor motion, items, camera travel, lighting, scene titles, imported-model preservation, pending-edit preservation and save/open.

Malformed, truncated, blocked, unauthenticated, over-quota, timed-out, cancelled and stale responses were exercised without unintended scene changes or automatic retries. Custom model input cannot redirect the key to another host. Credentials remain out of project data and browser storage. The exact live Google model response/artistic quality still requires the user's own key and is not claimed by these mocked tests.

## Other retained features

All 32 tools retain their original PNG maps and thin pixel geometry. GPU front-face colors still match 225 sampled source pixels with maximum RGB error zero in original-color mode. The ten-joint recreated Bob, manual posing, lighting/shadows, camera splines, imported GLB/OBJ/STL/PLY, voxel conversion, GLB export/reimport, PNG capture, clean view, undo/redo and project compatibility remain covered.

Real local MP3 encoding, non-silent built-in effects, audio import/downmix/resampling, volume/offset/loop controls and embedded-audio project round-trips still pass. MP3 is audio only.

## Reproduce

```sh
npm ci
npx playwright install --with-deps chromium
# Start the HTTP server separately:
python3 -m http.server 8000 --bind 0.0.0.0
# Install ffmpeg/ffprobe on PATH for video decode tests, then:
npm test
npm run build
npm run test:offline
APP_URL=file:///absolute/path/to/Bloxd-Studio-3.1.html npm run test:video
```

Tests write fresh results to `tests/results/`. Final report copies are included in the source bundle. These checks do not promise universal browser support, unlimited scene size, automatic rigging, physics simulation, or bypassing a host browser's sandbox.
