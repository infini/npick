import { createNumberRange, LOTTO_PICK_COUNT, sum } from "./number-utils.js?v=14";
import { createRng } from "./random.js?v=14";

export const WEEKLY_RECOMMENDATION_COUNT = 1;
export const LEGACY_RECOMMENDATION_ENGINE_VERSION = "weekly-disjoint-random-v1";
export const RECOMMENDATION_ENGINE_VERSION = "weekly-single-random-v2";

export function createWeeklySeed(baseDraw) {
  assertBaseDraw(baseDraw);

  return [
    RECOMMENDATION_ENGINE_VERSION,
    baseDraw.draw,
    baseDraw.date,
    [...baseDraw.numbers].sort((a, b) => a - b).join("-"),
    baseDraw.bonus,
  ].join(":");
}

export function createLegacyWeeklySeed(baseDraw) {
  assertBaseDraw(baseDraw);

  return [
    LEGACY_RECOMMENDATION_ENGINE_VERSION,
    baseDraw.draw,
    baseDraw.date,
    [...baseDraw.numbers].sort((a, b) => a - b).join("-"),
    baseDraw.bonus,
  ].join(":");
}

export function generateLegacyRecommendationNumberSets({ baseDraw }) {
  const rng = createRng(createLegacyWeeklySeed(baseDraw));
  const shuffled = shuffle(createNumberRange(), rng);

  return Array.from({ length: 3 }, (_, index) => {
    const start = index * LOTTO_PICK_COUNT;
    return shuffled.slice(start, start + LOTTO_PICK_COUNT).sort((a, b) => a - b);
  });
}

export function generateWeeklyRecommendationSets({ baseDraw }) {
  const seed = createWeeklySeed(baseDraw);
  const rng = createRng(seed);
  const shuffled = shuffle(createNumberRange(), rng);

  const recommendations = Array.from({ length: WEEKLY_RECOMMENDATION_COUNT }, (_, index) => {
    const start = index * LOTTO_PICK_COUNT;
    const numbers = shuffled.slice(start, start + LOTTO_PICK_COUNT).sort((a, b) => a - b);
    return describeCandidate(numbers);
  });

  assertWeeklyRecommendationSets(recommendations);
  return recommendations;
}

export function assertWeeklyRecommendationSets(recommendations) {
  if (!Array.isArray(recommendations) || recommendations.length !== WEEKLY_RECOMMENDATION_COUNT) {
    throw new Error(`Weekly recommendations must contain exactly ${WEEKLY_RECOMMENDATION_COUNT} sets.`);
  }

  recommendations.forEach((recommendation, index) => {
    const numbers = recommendation?.numbers;
    if (!Array.isArray(numbers) || numbers.length !== LOTTO_PICK_COUNT) {
      throw new Error(`Recommendation set ${index + 1} must contain exactly ${LOTTO_PICK_COUNT} numbers.`);
    }

    const unique = new Set(numbers);
    if (unique.size !== LOTTO_PICK_COUNT || numbers.some((number) => !Number.isInteger(number) || number < 1 || number > 45)) {
      throw new Error(`Recommendation set ${index + 1} contains invalid numbers.`);
    }
  });

  return true;
}

function shuffle(values, rng) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function describeCandidate(numbers) {
  const oddCount = numbers.filter((number) => number % 2 === 1).length;
  const lowCount = numbers.filter((number) => number <= 22).length;

  return {
    numbers,
    strategy: "weekly-single-random",
    tags: [
      `합계 ${sum(numbers)}`,
      `홀짝 ${oddCount}:${LOTTO_PICK_COUNT - oddCount}`,
      `저고 ${lowCount}:${LOTTO_PICK_COUNT - lowCount}`,
    ],
  };
}

function assertBaseDraw(baseDraw) {
  const numbers = baseDraw?.numbers;
  if (
    !Number.isInteger(baseDraw?.draw) ||
    typeof baseDraw?.date !== "string" ||
    !Array.isArray(numbers) ||
    numbers.length !== LOTTO_PICK_COUNT ||
    new Set(numbers).size !== LOTTO_PICK_COUNT ||
    numbers.some((number) => !Number.isInteger(number) || number < 1 || number > 45) ||
    !Number.isInteger(baseDraw?.bonus) ||
    baseDraw.bonus < 1 ||
    baseDraw.bonus > 45 ||
    numbers.includes(baseDraw.bonus)
  ) {
    throw new Error("A valid base draw is required to generate weekly recommendations.");
  }
}
