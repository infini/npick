import assert from "node:assert/strict";
import test from "node:test";
import { LOTTO_DATA_META, LOTTO_WINNING_NUMBERS } from "../data/lotto-data.js";
import {
  WEEKLY_RECOMMENDATION_RECORDS,
  WEEKLY_RECOMMENDATIONS_META,
} from "../data/weekly-recommendations.js";
import {
  evaluateWeeklyRecommendationRecords,
  getCurrentWeeklyRecord,
  getLatestEvaluatedWeeklyRecord,
  summarizeWeeklyResults,
} from "../src/core/weekly-cycle.js";

test("checked-in weekly artifact is aligned with winning data", () => {
  const draws = [...LOTTO_WINNING_NUMBERS].sort((left, right) => right.draw - left.draw);
  const latestDraw = draws[0];
  const records = evaluateWeeklyRecommendationRecords(WEEKLY_RECOMMENDATION_RECORDS, draws);
  const current = getCurrentWeeklyRecord(records, latestDraw);
  const latestEvaluated = getLatestEvaluatedWeeklyRecord(records);

  assert.equal(LOTTO_DATA_META.latestDraw, latestDraw.draw);
  assert.equal(LOTTO_DATA_META.count, draws.length);
  assert.equal(WEEKLY_RECOMMENDATIONS_META.latestBaseDraw, latestDraw.draw);
  assert.equal(WEEKLY_RECOMMENDATIONS_META.currentTargetDraw, latestDraw.draw + 1);
  assert.equal(WEEKLY_RECOMMENDATIONS_META.latestEvaluatedDraw, latestEvaluated?.targetDraw ?? null);
  assert.deepEqual(WEEKLY_RECOMMENDATIONS_META.summary, summarizeWeeklyResults(records));

  assert.ok(current);
  assert.equal(current.recommendations.length, 3);
  assert.equal(new Set(current.recommendations.flatMap((item) => item.numbers)).size, 18);
});
