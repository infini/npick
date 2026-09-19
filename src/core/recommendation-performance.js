const NUMBER_COUNT = 45;
const PICK_COUNT = 6;

function choose(n, k) {
  let result = 1;
  for (let index = 1; index <= k; index += 1) result *= (n - index + 1) / index;
  return result;
}

export const HIT_PROBABILITIES = Object.freeze(
  Array.from({ length: PICK_COUNT + 1 }, (_, hits) =>
    choose(PICK_COUNT, hits) * choose(NUMBER_COUNT - PICK_COUNT, PICK_COUNT - hits) /
    choose(NUMBER_COUNT, PICK_COUNT)),
);

export const RANDOM_BASELINE = Object.freeze({
  averageHits: PICK_COUNT * PICK_COUNT / NUMBER_COUNT,
  zeroHitRate: HIT_PROBABILITIES[0],
  prizeRate: HIT_PROBABILITIES.slice(3).reduce((total, probability) => total + probability, 0),
  firstPrizeRate: HIT_PROBABILITIES[6],
});

export function summarizeHits(hits) {
  if (!Array.isArray(hits) || hits.some((hit) => !Number.isInteger(hit) || hit < 0 || hit > PICK_COUNT)) {
    throw new Error("Hit counts must be integers between zero and six.");
  }
  const histogram = Array(PICK_COUNT + 1).fill(0);
  hits.forEach((hit) => { histogram[hit] += 1; });
  const count = hits.length;
  const totalHits = hits.reduce((total, hit) => total + hit, 0);
  const prizeCount = histogram.slice(3).reduce((total, value) => total + value, 0);
  return {
    count, totalHits, histogram, zeroCount: histogram[0], prizeCount,
    averageHits: count ? totalHits / count : null,
    zeroHitRate: count ? histogram[0] / count : null,
    prizeRate: count ? prizeCount / count : null,
  };
}

// Convolve the exact hypergeometric law, avoiding normal approximations for short live histories.
export function totalHitDistribution(weeks) {
  if (!Number.isInteger(weeks) || weeks < 0) throw new Error("Weeks must be a nonnegative integer.");
  let distribution = [1];
  for (let week = 0; week < weeks; week += 1) {
    const next = Array(distribution.length + PICK_COUNT).fill(0);
    distribution.forEach((probability, total) => {
      HIT_PROBABILITIES.forEach((hitProbability, hits) => {
        next[total + hits] += probability * hitProbability;
      });
    });
    distribution = next;
  }
  return distribution;
}

export function upperTailProbability(distribution, totalHits) {
  return Math.min(1, distribution.slice(totalHits).reduce((total, probability) => total + probability, 0));
}

export function summarizeLivePerformance(records) {
  const evaluated = records.filter((record) => record.status === "evaluated" && record.result);
  const hits = evaluated.map((record) => {
    if (record.result.setResults?.length !== 1) throw new Error("Live performance requires one set per draw.");
    return record.result.setResults[0].hitCount;
  });
  const summary = summarizeHits(hits);
  if (!hits.length) return { ...summary, expectedAverageRange: null, belowBaselineProbability: null };
  const distribution = totalHitDistribution(hits.length);
  function quantile(probability) {
    let cumulative = 0;
    return distribution.findIndex((value) => { cumulative += value; return cumulative >= probability; });
  }
  return {
    ...summary,
    expectedAverageRange: [quantile(0.025) / hits.length, quantile(0.975) / hits.length],
    belowBaselineProbability: Math.min(1, distribution.slice(0, summary.totalHits + 1)
      .reduce((total, probability) => total + probability, 0)),
  };
}
