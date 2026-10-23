import {
  assertWeeklyRecommendationSets,
  createWeeklySeed,
  generateWeeklyRecommendationSets,
  RECOMMENDATION_ENGINE_VERSION,
} from "./recommendation-engine.js?v=16";
import { HOT104_ENGINE_VERSION } from "./hot104-engine.js?v=16";
import { summarizeHits } from "./recommendation-performance.js?v=16";

export function createRandomComparison(baseDraw, createdAt) {
  return {
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    createdAt,
    seed: createWeeklySeed(baseDraw),
    recommendations: generateWeeklyRecommendationSets({ baseDraw }),
  };
}

export function assertRandomComparison(record, baseDraw) {
  const comparison = record.comparison;
  if (comparison?.engineVersion !== RECOMMENDATION_ENGINE_VERSION ||
      comparison.createdAt !== record.createdAt || comparison.seed !== createWeeklySeed(baseDraw)) {
    throw new Error("Comparison must be recorded together with the Hot104 prediction.");
  }
  assertWeeklyRecommendationSets(comparison.recommendations);
  const expected = generateWeeklyRecommendationSets({ baseDraw });
  if (comparison.recommendations[0].numbers.join("-") !== expected[0].numbers.join("-")) {
    throw new Error("Comparison numbers do not match the original random engine.");
  }
}

export function summarizePairedComparison(records) {
  const pairs = records.filter((record) => record.status === "evaluated" &&
    record.engineVersion === HOT104_ENGINE_VERSION &&
    record.comparison?.engineVersion === RECOMMENDATION_ENGINE_VERSION && record.result?.comparison)
    .map((record) => ({ draw: record.targetDraw, hot104: record.result.setResults[0].hitCount,
      random: record.result.comparison.hitCount }))
    .sort((left, right) => right.draw - left.draw);
  return {
    pairs,
    hot104: summarizeHits(pairs.map((pair) => pair.hot104)),
    random: summarizeHits(pairs.map((pair) => pair.random)),
    wins: pairs.filter((pair) => pair.hot104 > pair.random).length,
    ties: pairs.filter((pair) => pair.hot104 === pair.random).length,
    losses: pairs.filter((pair) => pair.hot104 < pair.random).length,
  };
}
