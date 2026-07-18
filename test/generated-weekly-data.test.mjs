import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LOTTO_DATA_META, LOTTO_WINNING_NUMBERS } from "../data/lotto-data.js";
import {
  WEEKLY_RECOMMENDATION_RECORDS,
  WEEKLY_RECOMMENDATIONS_META,
} from "../data/weekly-recommendations.js";
import {
  LEGACY_RECOMMENDATION_ENGINE_VERSION,
  RECOMMENDATION_ENGINE_VERSION,
} from "../src/core/recommendation-engine.js";
import {
  evaluateWeeklyRecommendationRecords,
  getCurrentWeeklyRecord,
  getLatestEvaluatedWeeklyRecord,
  summarizeWeeklyResults,
} from "../src/core/weekly-cycle.js";

test("checked-in weekly artifact is aligned and contains only the preserved first set", async () => {
  const draws = [...LOTTO_WINNING_NUMBERS].sort((left, right) => right.draw - left.draw);
  const latestDraw = draws[0];
  const records = evaluateWeeklyRecommendationRecords(WEEKLY_RECOMMENDATION_RECORDS, draws);
  const current = getCurrentWeeklyRecord(records, latestDraw);
  const latestEvaluated = getLatestEvaluatedWeeklyRecord(records);
  const jsonArtifact = JSON.parse(
    await readFile(new URL("../data/weekly-recommendations.json", import.meta.url), "utf8"),
  );

  assert.equal(LOTTO_DATA_META.latestDraw, latestDraw.draw);
  assert.equal(LOTTO_DATA_META.count, draws.length);
  assert.equal(WEEKLY_RECOMMENDATIONS_META.engineVersion, RECOMMENDATION_ENGINE_VERSION);
  assert.equal(WEEKLY_RECOMMENDATIONS_META.latestBaseDraw, latestDraw.draw);
  assert.equal(WEEKLY_RECOMMENDATIONS_META.currentTargetDraw, latestDraw.draw + 1);
  assert.equal(WEEKLY_RECOMMENDATIONS_META.latestEvaluatedDraw, latestEvaluated?.targetDraw ?? null);
  assert.deepEqual(WEEKLY_RECOMMENDATIONS_META.summary, summarizeWeeklyResults(records));
  assert.deepEqual(jsonArtifact.meta, WEEKLY_RECOMMENDATIONS_META);
  assert.deepEqual(jsonArtifact.records, WEEKLY_RECOMMENDATION_RECORDS);

  assert.ok(current);
  assert.equal(current.engineVersion, LEGACY_RECOMMENDATION_ENGINE_VERSION);
  assert.equal(current.recommendations.length, 1);
  assert.deepEqual(current.recommendations[0].numbers, [5, 11, 16, 18, 24, 31]);
  assert.equal(new Set(current.recommendations[0].numbers).size, 6);
  assert.deepEqual(
    {
      version: current.migration.version,
      fromCount: current.migration.fromCount,
      keptSetIndex: current.migration.keptSetIndex,
      policy: current.migration.policy,
    },
    {
      version: "three-to-one-v1",
      fromCount: 3,
      keptSetIndex: 0,
      policy: "keep-original-first-set",
    },
  );
});
