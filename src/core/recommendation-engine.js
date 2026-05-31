import { createRng, weightedPick } from "./random.js";
import {
  bucketCounts,
  countMatches,
  createNumberRange,
  LOTTO_MAX_NUMBER,
  LOTTO_PICK_COUNT,
  longestConsecutiveRun,
  normalize,
  sum,
} from "./number-utils.js";

const RECENT_DRAWS_TO_DAMPEN = 5;
const MAX_ATTEMPTS_PER_SET = 900;

export function generateRecommendationSets({ history, stats, count, strategy, options, seed, salt = Date.now() }) {
  const rng = createRng(`${seed}:${salt}:${strategy}:${history.length}`);
  const recommendations = [];
  const used = new Set();

  let attempts = 0;
  while (recommendations.length < count && attempts < count * MAX_ATTEMPTS_PER_SET) {
    attempts += 1;
    const activeStrategy = strategy === "mixed" ? pickMixedStrategy(recommendations.length) : strategy;
    const numbers = buildCandidate(stats, history, activeStrategy, options, rng);
    const key = numbers.join("-");

    if (!used.has(key) && validateCandidate(numbers, stats, options)) {
      used.add(key);
      recommendations.push(describeCandidate(numbers, stats, activeStrategy));
    }
  }

  while (recommendations.length < count) {
    const numbers = fallbackCandidate(rng);
    const key = numbers.join("-");

    if (!used.has(key)) {
      used.add(key);
      recommendations.push(describeCandidate(numbers, stats, "fallback"));
    }
  }

  return recommendations;
}

function buildCandidate(stats, history, strategy, options, rng) {
  const selected = [];
  const recentNumbers = new Set(history.slice(0, RECENT_DRAWS_TO_DAMPEN).flatMap((draw) => draw.numbers));

  while (selected.length < LOTTO_PICK_COUNT) {
    const candidates = stats.numberStats
      .filter((item) => !selected.includes(item.number))
      .map((item) => ({
        number: item.number,
        weight: getWeight(item, stats, strategy, recentNumbers, options, rng),
      }));

    selected.push(weightedPick(candidates, rng).number);
  }

  return selected.sort((a, b) => a - b);
}

function getWeight(item, stats, strategy, recentNumbers, options, rng) {
  const frequencyScore = normalize(item.count, stats.minCount, stats.maxCount);
  const coldScore = 1 - frequencyScore;
  const overdueScore = normalize(item.gap, 0, stats.maxGap);
  const balancedScore = 1 - Math.abs(0.5 - frequencyScore) * 1.55;
  let weight;

  if (strategy === "hot") {
    weight = 0.65 * frequencyScore + 0.2 * overdueScore + 0.15 * rng();
  } else if (strategy === "cold") {
    weight = 0.48 * coldScore + 0.42 * overdueScore + 0.1 * rng();
  } else {
    weight = 0.42 * Math.max(0.08, balancedScore) + 0.28 * frequencyScore + 0.2 * overdueScore + 0.1 * rng();
  }

  if (options.avoidRecent && recentNumbers.has(item.number)) {
    weight *= 0.42;
  }

  return Math.max(0.001, weight);
}

function validateCandidate(numbers, stats, options) {
  if (numbers.length !== LOTTO_PICK_COUNT || new Set(numbers).size !== LOTTO_PICK_COUNT) {
    return false;
  }

  if (options.excludePast && stats.historicalKeys.has(numbers.join("-"))) {
    return false;
  }

  const total = sum(numbers);
  if (total < stats.sumLow || total > stats.sumHigh) {
    return false;
  }

  if (longestConsecutiveRun(numbers) > 3) {
    return false;
  }

  if (!options.strictBalance) {
    return true;
  }

  const oddCount = numbers.filter((number) => number % 2 === 1).length;
  const lowCount = numbers.filter((number) => number <= 22).length;
  const decadeMax = Math.max(...bucketCounts(numbers));

  return oddCount >= 2 && oddCount <= 4 && lowCount >= 2 && lowCount <= 4 && decadeMax <= 3;
}

function describeCandidate(numbers, stats, strategy) {
  const hotSet = new Set(stats.hotNumbers.slice(0, 12).map((item) => item.number));
  const coldSet = new Set(stats.coldNumbers.slice(0, 12).map((item) => item.number));
  const overdueSet = new Set(stats.overdueNumbers.slice(0, 12).map((item) => item.number));
  const oddCount = numbers.filter((number) => number % 2 === 1).length;
  const lowCount = numbers.filter((number) => number <= 22).length;

  return {
    numbers,
    strategy,
    tags: [
      `합계 ${sum(numbers)}`,
      `홀짝 ${oddCount}:${LOTTO_PICK_COUNT - oddCount}`,
      `저고 ${lowCount}:${LOTTO_PICK_COUNT - lowCount}`,
      `핫 ${countMatches(numbers, hotSet)}`,
      `미출현 ${countMatches(numbers, overdueSet)}`,
      `콜드 ${countMatches(numbers, coldSet)}`,
    ],
  };
}

function fallbackCandidate(rng) {
  const picked = new Set();
  const range = createNumberRange();

  while (picked.size < LOTTO_PICK_COUNT) {
    picked.add(range[Math.floor(rng() * LOTTO_MAX_NUMBER)]);
  }

  return [...picked].sort((a, b) => a - b);
}

function pickMixedStrategy(index) {
  return ["balanced", "hot", "cold"][index % 3];
}
