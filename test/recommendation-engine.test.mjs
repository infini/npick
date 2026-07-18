import assert from "node:assert/strict";
import test from "node:test";
import {
  assertWeeklyRecommendationSets,
  createWeeklySeed,
  generateWeeklyRecommendationSets,
  WEEKLY_RECOMMENDATION_COUNT,
} from "../src/core/recommendation-engine.js";

const baseDraw = {
  draw: 100,
  date: "2026-01-03",
  numbers: [1, 8, 15, 22, 29, 36],
  bonus: 43,
};

test("weekly engine always creates exactly three disjoint sets", () => {
  const recommendations = generateWeeklyRecommendationSets({ baseDraw });

  assert.equal(recommendations.length, WEEKLY_RECOMMENDATION_COUNT);
  assert.equal(new Set(recommendations.flatMap((item) => item.numbers)).size, 18);
  assert.equal(assertWeeklyRecommendationSets(recommendations), true);
});

test("weekly engine is deterministic and auditable from its base draw", () => {
  const first = generateWeeklyRecommendationSets({ baseDraw });
  const second = generateWeeklyRecommendationSets({ baseDraw: structuredClone(baseDraw) });

  assert.deepEqual(second, first);
  assert.equal(createWeeklySeed(baseDraw), createWeeklySeed(structuredClone(baseDraw)));
});

test("weekly validation rejects a fourth set and cross-set duplicate numbers", () => {
  const recommendations = generateWeeklyRecommendationSets({ baseDraw });
  assert.throws(() => assertWeeklyRecommendationSets([...recommendations, recommendations[0]]), /exactly 3 sets/);

  const duplicated = structuredClone(recommendations);
  duplicated[1].numbers[0] = duplicated[0].numbers[0];
  assert.throws(() => assertWeeklyRecommendationSets(duplicated), /must not share numbers/);
});
