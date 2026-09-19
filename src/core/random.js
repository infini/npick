export function createRng(seedText) {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    seed ^= seedText.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }

  return function rng() {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSeed() {
  const bytes = new Uint32Array(1);

  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(bytes);
    return bytes[0].toString(36).slice(0, 7);
  }

  return Math.floor(Math.random() * 0xffffffff)
    .toString(36)
    .slice(0, 7);
}

export function weightedPick(candidates, rng) {
  const total = candidates.reduce((acc, item) => acc + item.weight, 0);
  let cursor = rng() * total;

  for (const item of candidates) {
    cursor -= item.weight;
    if (cursor <= 0) {
      return item;
    }
  }

  return candidates[candidates.length - 1];
}
