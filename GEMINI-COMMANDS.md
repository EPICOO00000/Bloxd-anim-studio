# Gemini Director — scene commands

Version 4.0 includes a bring-your-own-key Gemini planner. It generates **editable scene data and animation keys**, not a rendered Veo video or a new 3D model file. The existing manual editor, textures, imports, animation fixes, sound and export controls remain available.

## Use it

1. Open `Bloxd-Studio-4.0.html` / `START-HERE.html` in Chrome or Edge, or use the live app. The embedded file preview cannot reliably make external API calls.
2. Click **Gemini** in the top bar.
3. Paste your key into **Gemini API key**. Do not put it in the prompt, chat, scene names or shared JSON.
4. Optionally use **Check key / load models**. Auto chooses a listed Flash text model; you can select another listed model or enter a supported Gemini model ID.
5. Choose **This scene** or **A new scene**, then describe the animation.
6. **Generate plan** sends one generation request. Read the operation list and warnings. Nothing changes yet.
7. Acknowledge replacements/removals, then **Apply & play**. Uncheck the preview box if you only want to apply it.
8. Edit the resulting objects, joints and keys normally. **One Undo** restores the entire previous scene; Redo needs no new API call.

Example request:

> Keep the scene. Build a small plank bridge and add another Bob holding a diamond pickaxe. Make him walk across, mine for a moment, then wave. Move the camera smoothly around the action and use warm sunset lighting. Make it 12 seconds.

You can issue another request after applying, such as “keep the animation but make the lighting moonlit” or “make the selected block float and spin.” The new request receives a summary of the current scene and the selected object/part.

**Try an offline command example** loads a deterministic, locally authored example. It is clearly labeled **not Gemini**. It works without a key or internet and exercises the same validator/executor. `examples/offline-adventure.commands.json` contains that plan.

## Privacy, credentials and cost

- The key is held only in the password-style field / tab memory. This editor never stores it in localStorage, sessionStorage, project files, generated scene data, logs or URL parameters. **Forget** clears it.
- Requests go directly from your browser to `https://generativelanguage.googleapis.com`, using the `x-goog-api-key` header. Requests omit cookies and refuse redirects. The custom model field cannot supply another URL.
- Google receives your prompt, object names/IDs/transforms, character pose information, limited key summaries, camera/light settings, and a compact nearby terrain-surface map. Large scenes are summarized (at most 100 object summaries and 650 terrain columns). The selected object is included first.
- Actual model files/geometry, PNG textures, skin files, audio files and editor source are **not uploaded**. The “What scene data is sent?” section shows the summary.
- Google processes submitted data under its own API terms. This is not a promise that Google stores no data or provides free usage.
- Requests use **your own Google quota/billing**. There are no automatic retries. Output is capped at up to 16,384 tokens; availability and quotas depend on the selected model/key/project.
- Cancellation stops waiting and prevents applying a late result; Google may still count a request it already received.
- Use this as a personal BYO-key tool. Do not embed a shared/billable key in a publicly distributed HTML file. A public service with a shared credential needs a properly secured server-side proxy and secret management instead.
- HTTP-referrer/API restrictions on your key must be compatible with your app's actual origin. A local `file://` page does not have an ordinary website referrer. If necessary, serve the editor from an allowed HTTP(S) origin; do not share an unrestricted key.

## How execution works

The request includes an explicit command vocabulary, current scene summary and JSON response schema. The planner returns a list of operations. The editor independently validates types, allowed assets, IDs, ranges, key times and resource budgets, then compiles the whole list against a plain-data scene copy.

There is **no eval, generated JavaScript execution, shell, file-access command, arbitrary function-name dispatch, or model-directed network endpoint**. Unknown operations/arguments are rejected. Untrusted titles and labels are displayed as text, not HTML.

New roots are prepared off-scene. The live scene is changed only after the complete plan validates and the user applies it. A stale-plan check prevents overwriting a scene that changed after review; explicitly Validate again or regenerate. Pending manual edits are kept in the resulting animation, and Undo restores the old drafts too. Existing imported objects retain their actual geometry/materials rather than being re-imported during Undo/Redo.

## Plan format

```json
{
  "title": "A short walk",
  "summary": "Add an actor and a camera move without replacing other objects.",
  "commands": [
    { "op": "duration", "seconds": 8 },
    {
      "op": "add", "id": "walker", "kind": "character",
      "name": "Bob the explorer", "position": [-3, 1, 0],
      "tool": "Diamond Pickaxe", "grounded": true
    },
    {
      "op": "motion", "id": "walker", "preset": "walk",
      "start": 0, "end": 5,
      "from": [-3, 1, 0], "to": [1, 1, 0], "grounded": true
    },
    {
      "op": "motion", "id": "walker", "preset": "wave",
      "start": 5, "end": 8, "rotation": [0, 0, 0]
    },
    {
      "op": "camera", "smooth": true,
      "keys": [
        { "time": 0, "position": [12, 8, 14], "target": [0, 2, 0], "fov": 45 },
        { "time": 8, "position": [-7, 5, 11], "target": [1, 2, 0], "fov": 45 }
      ]
    },
    { "op": "lighting", "preset": "golden", "azimuth": -45, "shadows": true }
  ]
}
```

The machine-readable schema is `gemini-command-schema.json`. The planner instruction is generated by `systemInstruction()` in `lib/ai-commands.js`. Compact base-block and inventory catalogs are supplied once in the scene summary; relevant source-model choices are matched to the prompt. The full state/alias catalog remains available to validation. No texture/model bytes are sent to Gemini.

### Coordinates and refs

- **Y is up. All command rotations are degrees.** Positions and scales are three-number arrays.
- A terrain cell `[x,y,z]` occupies `[x,x+1]`, `[y,y+1]`, `[z,z+1]`. Standing feet are normally at the top cell's Y + 1.
- Characters / trees / rocks / lamps use a root-base position. Independent blocks and items use a centered pivot.
- `grounded:true` places actors/props on voxel terrain and lets walk/run motion follow terrain heights. It does not provide collision physics or attach characters to moving/independent platforms.
- Existing objects use the exact `ref` from the scene summary (for example `object-1`). New objects use an alias such as `hero`, referenced by later commands in the same plan. Do not invent an existing ref or use the reserved `object-N` format for a new alias.
- Omit optional values you do not need. `null` is not a valid substitute for them.

## Supported operations

| Operation | Arguments / behavior |
|---|---|
| `duration` | `seconds` 2–60; optional `loop` |
| `terrain_fill` | Integer `from`, `to` inclusive corners; exact `block` ID or `air`; optional `hollow` |
| `terrain_height` | Integer `center:[x,z]`, `size:[width,depth]` (2–32); optional `baseY`, `height`, `variation`, `seed`, top `block`. Replaces columns with dirt/stone below the surface |
| `clear_terrain` | Clears voxel terrain only; leaves separate objects |
| `add` | `id`, `kind`, `position`; optional `name`, `rotation`, `scale`, `grounded`. `block` kind requires a `block`; `tool` requires an `asset`; `character` can choose a `tool`; `tree` can use `autumn` |
| `extract_block` | `id`, integer terrain-cell `position`, optional `name`. Converts a terrain cell into a centered editable block without duplicating it |
| `remove` | Existing object `id` |
| `rename` | Existing object `id`, `name` |
| `transform` | `id`, one or more of `position`, `rotation`, `scale`. Rebases existing motion so the object does not snap back on playback |
| `equip` | Character `id`, exact item `asset` or `none` |
| `pose` | Character `id`; optional `preset`, `joints`, `bodyLift`, `held`. Unedited motion is preserved |
| `clear_animation` | `id` of an object, `camera`, or `all` |
| `animate` | Object `id`, `keys`, optional `replace` (default true), `rotationMode` (`shortest` / `spins`). Keys accept `time`, optional root transform fields, and character pose/held fields |
| `motion` | Character `id`, `preset`, `start`, `end`; optional `from`, `to`, facing `rotation`, `speed`, `grounded`, `rotationMode`. Bakes limb motion at eight keys per second inside the interval |
| `camera` | `keys` with `time`, `position`, `target`, optional `fov`; optional `replace` (default true), `smooth` |
| `lighting` | Optional `preset`, `azimuth`, `elevation`, `intensity`, `ambient`, `color`, `sky`, `shadows`, `soft`, `fog`, `toolLighting` |

**Object kinds:** `character`, `tool`, `block`, `tree`, `rock`, `lamp`. Existing `import` / `voxel` objects can be transformed and animated, but Gemini cannot create arbitrary imported meshes from nothing.

**Pose/motion presets:** `idle`, `walk`, `run`, `wave`, `mine`, `jump`, `sit`, `tpose`.

**Joint edit:** `{"joint":"head","rotation":[0,30,0]}`. Valid joints: `body`, `head`, `armR`, `forearmR`, `armL`, `forearmL`, `legR`, `shinR`, `legL`, `shinL`.

**Held item:** `{"held":{"position":[0,0,0],"rotation":[0,0,90],"scale":[1,1,1]}}`. Equip an item before keying it. Held transforms are local to the hand mount.

**Lighting presets:** `day`, `golden`, `night`, `studio`. Azimuth −180…180; elevation 5…90; intensity 0…6; ambient 0…3; colors `#RRGGBB`. Lighting edits are global/static, not animated light tracks.

**Key semantics:** `animate` replaces that track unless `replace:false` is supplied. `motion` replaces keys only inside its interval; successive intervals can chain walking, mining and waving. First-late-key protection adds a starting key when needed. Rotation now defaults to the shortest quaternion path, independent of angle winding. For an intentional spin, use `"rotationMode":"spins"` on `animate` or `motion`; then 0° → 720° produces two full turns. `"rotationMode":"shortest"` restores direct motion. This is a per-object/whole-player track setting, and appears in the scene summary.

**Terrain versus objects:** `terrain_fill` edits grid cells, not standalone block objects. Use `extract_block` to animate an existing grid block, or `remove` to delete an independent object. Static bulk terrain stays efficiently instanced.

### Resource limits

Per plan: 180 commands, 80 newly created objects, 12,000 terrain writes, 6,000 generated object/pose keys. At most 120 explicit keys per `animate` or `camera` command; clip duration 2–60 seconds. The final scene is limited to 50,000 terrain cells / 1,000 objects. Positions are bounded; malformed, unknown or oversized plans are rejected without partial execution. Prefer compact fills and motion commands.

## Limitations / troubleshooting

- **No real key was supplied during development.** The API flow was exercised with controlled/mocked Google responses, including valid generation, failures and cancellation. A live account/model's response quality and availability have not been verified with a billable request.
- Model/key/quota/region errors appear in the panel. The editor does not silently retry or charge more requests.
- If a model rejects the full JSON schema, enable **Compatibility options → JSON-only mode** and explicitly generate again. Only the remote schema constraint changes; local command validation is still mandatory.
- If the file preview blocks requests, use the live app or open the downloaded HTML in a full browser. Internet is required for Gemini, not for manual editing or already generated scenes.
- This is not auto-rigging, new mesh/texture generation, physics simulation, character AI during playback, or timed equipment swapping. It uses the existing character rig/assets and baked timeline keys. Imported models can have root motion, not automatically generated skeleton poses.
- Sound stays on the existing local soundtrack. Gemini does not generate speech/music or infer sound effects from scene actions in this version.
- AI can still choose imperfect poses, staging or camera composition. Review the plan and adjust the resulting keys; the validator guarantees supported operations/ranges, not artistic quality.

## Implementation references

The client uses Google's `generateContent` request and authentication conventions [1](https://ai.google.dev/api/generate-content) [3](https://ai.google.dev/api), with structured JSON output [4](https://ai.google.dev/gemini-api/docs/generate-content/structured-output). Key-management guidance: [6](https://ai.google.dev/gemini-api/docs/generate-content/api-key). Model discovery reference: https://ai.google.dev/api/models.

The optional feature calls Google directly; it does not depend on an Arena connected-app integration. Gemini/Google names belong to their respective owners. This is not a Google- or Bloxd-endorsed product.
