/**
 * Deterministic noise + RNG helpers.
 * Seeded so the same world comes back every time you hit "Regenerate" with the same seed.
 */

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tiny value-noise lattice: smooth, tileable, good enough for rolling voxel hills. */
export function makeNoise2D(seed = 1337) {
  const rand = mulberry32(seed);
  const P = new Float32Array(512);
  for (let i = 0; i < 256; i++) P[i] = rand();
  for (let i = 256; i < 512; i++) P[i] = P[i - 256];

  const fade = t => t * t * (3 - 2 * t);

  return function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const i = xi & 255, j = yi & 255;
    const hash = (xx, yy) => P[((xx * 73) ^ (yy * 151) ^ (xx * yy * 19)) & 255];
    const a = hash(i, j);
    const b = hash(i + 1, j);
    const c = hash(i, j + 1);
    const d = hash(i + 1, j + 1);
    const u = fade(xf), v = fade(yf);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  };
}

/** Fractal sum of the lattice — the actual terrain shape. */
export function fbm(noise, x, y, octaves = 4, lac = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return sum / norm;
}

/** Smoothstep between two edges — used for biome blends. */
export function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Pick a random element with a seeded rng. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}
