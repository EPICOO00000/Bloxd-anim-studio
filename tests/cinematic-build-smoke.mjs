// Smoke test for the cinematic build planner: zone → ordered layered plan → per-block
// keyframe tracks. Pure logic only, so no browser or three.js is needed.
import assert from 'node:assert/strict';
import {
  BUILD_ORDERS, BUILD_ORDER_LABELS, BUILD_STYLES, BUILD_EASES, MAX_ZONE_BLOCKS, ZONE_DEFAULTS,
  normalizeRegion, regionCenter, regionRadius, collectCells, groupCells, buildKeys, planBuild,
  cameraPlan, planSummary, zoneCells, buildEntries
} from '../lib/cinematic-build.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// A tiny map-only world: the planner only ever calls world.get(x,y,z).
function fakeWorld(cells) {
  const map = new Map(cells.map(([x, y, z, t]) => [`${x},${y},${z}`, t]));
  return { map, get: (x, y, z) => map.get(`${x},${y},${z}`) || null };
}
// A 5×3×5 solid stone box sitting on the ground at y = 0..2.
const boxCells = [];
for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) for (let y = 0; y < 3; y++) boxCells.push([x, y, z, y === 2 ? 'grass' : 'stone']);
const world = fakeWorld(boxCells);

// ── regions ──
const r = normalizeRegion([4, 2, 9], [1, 0, 3]);
ok(r.min[0] === 1 && r.max[0] === 4 && r.min[1] === 0 && r.max[1] === 2 && r.min[2] === 3 && r.max[2] === 9, 'corners normalised');
ok(r.size[0] === 4 && r.size[1] === 3 && r.size[2] === 7, 'region size is inclusive');
ok(r.volume === 84, 'region volume');
ok(near(regionCenter(r)[0], 3) && near(regionCenter(r)[1], 1.5) && near(regionCenter(r)[2], 6.5), 'region centre');
ok(regionRadius(r) === 7, 'region radius = longest axis');

// ── cell collection ──
const zone = normalizeRegion([0, 0, 0], [4, 2, 4]);
const cells = collectCells(world, zone);
ok(cells.length === 75, 'collected every solid cell of the box, got ' + cells.length);
ok(cells.every(c => c.type === 'grass' || c.type === 'stone'), 'cell types read back from the world');
ok(cells[0].x === 0 && cells[0].y === 0 && cells[0].z === 0, 'cells sorted x,z,y');
ok(collectCells(world, normalizeRegion([20, 0, 0], [22, 0, 2])).length === 0, 'empty zone yields no cells');
// a cell further inside the zone is picked up too
const extra = fakeWorld([...boxCells, [50, 0, 0, 'stone']]);
ok(collectCells(extra, normalizeRegion([0, 0, 0], [99, 2, 4])).length === 76, 'only solid cells are lifted');

// ── build orders ──
const layered = groupCells(cells, 'layers');
ok(layered.length === 3, 'bottom-up has one beat per layer, got ' + layered.length);
ok(layered.every(g => g.cells.every(c => c.y === g.cells[0].y)), 'each beat is a single y layer');
ok(layered[0].cells.every(c => c.y === 0) && layered[2].cells.every(c => c.y === 2), 'layers ascend bottom-up');
const down = groupCells(cells, 'top-down');
ok(down.length === 3 && down[0].cells.every(c => c.y === 2) && down.at(-1).cells.every(c => c.y === 0), 'top-down starts at the roof');
const out = groupCells(cells, 'center-out');
ok(out.length >= 2, 'center-out produces distance rings');
ok(out[0].cells.length < out.at(-1).cells.length, 'inner rings are smaller than outer rings');
const scatter = groupCells(cells, 'random', 'zone');
ok(scatter.length >= 3 && scatter.length <= 24, 'random waves stay bounded: ' + scatter.length);
ok(scatter.reduce((s, g) => s + g.cells.length, 0) === 75, 'random keeps every cell');
const again = groupCells(cells, 'random', 'zone');
assert.deepStrictEqual(scatter.map(g => g.cells.map(c => c.x + ',' + c.y + ',' + c.z)), again.map(g => g.cells.map(c => c.x + ',' + c.y + ',' + c.z)), 'same seed → same shuffle');
ok(!deepEqual(groupCells(cells, 'random', 'other'), scatter), 'a different seed reshuffles');
function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
ok(groupCells([], 'layers').length === 0, 'no cells → no beats');
for (const o of BUILD_ORDERS) ok(BUILD_ORDER_LABELS[o], 'order label: ' + o);

// ── per-block keyframes ──
const k = buildKeys({ x: 3, y: 4, z: -2 }, 'rise', 1, 1.3, 'smooth');
ok(k.length === 3, 'rise writes hidden@0, hidden@turn, final@turn');
ok(k[0].time === 0 && k[1].time === 1 && k[2].time === 1.3, 'key times');
ok(k[0].scale.every(s => s === 0), 'hidden block is scaled to zero');
ok(k[0].position[1] === 4.5 - .95, 'rise starts below its cell');
ok(k[2].scale.every(s => s === 1) && near(k[2].position[1], 4.5), 'final key sits exactly on the cell');
ok(k.every(key => key.rotation.length === 3 && key.position.length === 3 && key.scale.length === 3), 'key shape matches the studio track format');
ok(k.every(key => key.ease === 'smooth'), 'ease stamped on every key');
const spin = buildKeys({ x: 0, y: 0, z: 0 }, 'spin', 0, .4, 'out');
ok(spin.length === 2 && near(spin[0].rotation[1], -Math.PI * .85) && spin[0].rotation.every(v => v === 0 || v < 0), 'spin starts rotated');
const pop = buildKeys({ x: 0, y: 0, z: 0 }, 'pop', 0, .5);
ok(pop.length === 3 && near(pop[1].scale[0], 1.18) && pop[1].time > 0 && pop[1].time < .5, 'pop overshoots mid-flight');
ok(buildKeys({ x: 0, y: 0, z: 0 }, 'pop', 0, .08).length === 2, 'a too-short pop skips the overshoot');
ok(buildKeys({ x: 0, y: 0, z: 0 }, 'drop', 0, .4)[0].position[1] === .5 + 1.6, 'drop starts above its cell');
ok(buildKeys({ x: 0, y: 0, z: 0 }, 'nonsense', 2, 3)[0].time === 0, 'unknown style falls back to rise');

// ── the plan ──
const plan = planBuild(cells, { order: 'layers', style: 'rise', ease: 'inout', start: 2, duration: 4, blockTime: .3, stagger: .08 });
ok(plan.count === 75, 'plan covers every cell');
ok(plan.layers === 3, 'three beats for three layers');
ok(plan.start === 2 && near(plan.total, 6), 'plan ends exactly at start + duration');
ok(near(plan.blocks.at(-1).end, 6), 'the last block finishes exactly on the clip end');
ok(plan.blocks.every(b => b.end > b.time), 'every block animates forwards');
ok(plan.blocks.every(b => b.keys[0].time === 0), 'every block is hidden from the first frame');
// bottom-up: the lowest layer is scheduled first
ok(plan.blocks.filter(b => b.y === 0).every(b => b.time < Math.min(...plan.blocks.filter(c => c.y === 1).map(c => c.time))), 'layer 0 builds before layer 1');
ok(plan.blocks.filter(b => b.y === 1).every(b => b.time < Math.min(...plan.blocks.filter(c => c.y === 2).map(c => c.time))), 'layer 1 builds before layer 2');
// within a layer blocks ripple in order
const layer0 = plan.blocks.filter(b => b.y === 0).sort((a, b) => a.time - b.time);
ok(layer0.every((b, i) => i === 0 || b.time >= layer0[i - 1].time - 1e-9), 'layer blocks ordered by time');
ok(near(layer0.at(-1).time - layer0[0].time, .08), 'in-layer ripple = stagger');
ok(near(plan.blocks.find(b => b.y === 1).time - plan.blocks.find(b => b.y === 0).time, (4 - .3 - .08) / 2), 'layer gap = (duration - blockTime - ripple) / (layers - 1)');
// top-down reverses the schedule
const down2 = planBuild(cells, { order: 'top-down', start: 0, duration: 3 });
ok(down2.blocks.filter(b => b.y === 2).every(b => b.time < Math.min(...down2.blocks.filter(c => c.y === 0).map(c => c.time))), 'top-down builds the roof first');
// random still schedules every block inside the window
const rnd = planBuild(cells, { order: 'random', start: 1, duration: 5, seed: 'z' });
ok(rnd.count === 75 && rnd.blocks.every(b => b.time >= 1 && b.end <= 6 + 1e-9), 'random stays inside the window');
// tiny durations collapse the beats instead of overshooting
const tight = planBuild(cells, { start: 0, duration: .1, blockTime: .3, stagger: .08 });
ok(tight.blocks.every(b => b.end <= .1 + 1e-9), 'a too-short duration never overruns');
ok(tight.layers === 3 && tight.blocks.every(b => b.time === 0 || b.time <= .08), 'collapsed beats only ripple');
// every style plans
for (const style of BUILD_STYLES) {
  const p = planBuild(cells, { style, start: 0, duration: 2 });
  ok(p.count === 75 && p.blocks.every(b => b.keys.length >= 2 && b.keys.at(-1).scale.every(s => near(s, 1))), style + ' style plans');
}
for (const ease of BUILD_EASES) ok(planBuild(cells, { ease, duration: 1 }).blocks.every(b => b.keys.every(k => k.ease === ease)), 'ease ' + ease);
assert.throws(() => planBuild([], {}), /no blocks/, 'empty zone rejected');
ok(MAX_ZONE_BLOCKS > 500 && ZONE_DEFAULTS.order === 'layers' && ZONE_DEFAULTS.duration === 4, 'defaults');

// a plan replays through the real sampler
const { sampleTransform } = await import('../lib/tracks.js');
const one = planBuild([{ x: 0, y: 0, z: 0, type: 'stone' }], { order: 'layers', start: 0, duration: 1, blockTime: .5, stagger: 0 }).blocks[0];
ok(near(sampleTransform(one.keys, 0).scale[0], 0), 'sampled at 0 s the block is hidden');
ok(sampleTransform(one.keys, .25).scale[0] > 0 && sampleTransform(one.keys, .25).scale[0] < 1, 'mid-build the block is partly grown');
ok(near(sampleTransform(one.keys, 1).scale[0], 1), 'sampled at the end the block is full size');
ok(near(sampleTransform(one.keys, 9).scale[0], 1), 'after the build the block stays built');
const later = planBuild([{ x: 0, y: 0, z: 0, type: 'stone' }], { start: 3, duration: 1, blockTime: .5, stagger: 0 }).blocks[0];
ok(near(sampleTransform(later.keys, 1.5).scale[0], 0), 'before its turn the block is still hidden');

// ── cinematic camera ──
const cam = cameraPlan(zone, { start: 2, duration: 4 });
ok(cam.keys.length === 4, 'four camera keys');
ok(near(cam.keys[0].time, 2) && near(cam.keys.at(-1).time, 6), 'camera spans the same window as the build');
ok(cam.keys.every(k => Array.isArray(k.position) && Array.isArray(k.target) && Number.isFinite(k.fov)), 'camera key shape');
ok(cam.keys.every((k, i) => i === 0 || k.time > cam.keys[i - 1].time), 'camera keys ascend in time');
ok(Math.hypot(...cam.keys[0].position.map((v, i) => v - cam.center[i])) > Math.hypot(...cam.keys[1].position.map((v, i) => v - cam.center[i])), 'the camera moves closer mid-build');
ok(cam.keys[0].position[1] > zone.min[1], 'the camera looks down at the zone');

// ── the studio-facing bake (what app.js hands to the scene) ──
// zoneCells merges world cells with blocks already lifted out of the terrain, and
// buildEntries says which cells need a fresh record and which already own one.
const lifted = [{ x: 1, y: 5, z: 1, type: 'stone', record: { id: 'object-9' } }];
const merged = zoneCells(world, normalizeRegion([0, 0, 0], [4, 2, 4]), lifted);
ok(merged.length === 75, 'a lifted block outside the zone Y range is ignored, got ' + merged.length);
const merged2 = zoneCells(world, normalizeRegion([0, 0, 0], [4, 9, 4]), lifted);
ok(merged2.length === 76, 'a lifted block inside the zone is added back, got ' + merged2.length);
ok(merged2.filter(c => c.record).length === 1, 'the lifted block keeps its record');
ok(merged2.filter(c => c.record)[0].record.id === 'object-9', 'the record survives the merge');
// no duplicates when the world still reports the cell
const clash = zoneCells(world, normalizeRegion([0, 0, 0], [4, 9, 4]), [{ x: 0, y: 0, z: 0, type: 'stone', record: { id: 'x' } }]);
ok(clash.length === 75 && clash.filter(c => c.record).length === 0, 'a cell the world still reports keeps the world copy, never both');

const bake = buildEntries(merged2, { order: 'layers', style: 'pop', ease: 'out', start: 1, duration: 3, blockTime: .3, stagger: .08 });
ok(bake.entries.length === bake.plan.count && bake.plan.count === 76, 'one entry per cell');
ok(bake.entries.filter(e => e.record).length === 1, 'only the lifted block reuses a record');
ok(bake.entries.filter(e => !e.record).length === 75, 'every other cell needs a new record');
ok(bake.entries.every(e => e.keys.length >= 2 && e.keys[0].time === 0 && e.keys.at(-1).scale.every(v => near(v, 1))), 'entries carry ready-to-assign key tracks');
ok(bake.entries.every(e => e.keys.at(-1).time === e.end), 'the final key lands on the entry end');
ok(bake.entries.every(e => near(e.keys.at(-1).position[0], e.x + .5) && near(e.keys.at(-1).position[1], e.y + .5)), 'the final key sits on the cell');
ok(bake.entries.every(e => e.type === 'grass' || e.type === 'stone'), 'entries carry the block type');
// a second bake over the same cells must reuse the records and never double them
const second = buildEntries(merged2, { order: 'layers', duration: 3 });
ok(second.entries.length === 76 && second.entries.filter(e => e.record).length === 1, 're-baking is idempotent');

// ── summary ──
ok(planSummary(plan).includes('75 blocks'), planSummary(plan));
ok(planSummary(plan).includes('2.00s → 6.00s'), 'summary shows the window');

console.log('cinematic-build smoke OK · ' + n + ' assertions passed');
