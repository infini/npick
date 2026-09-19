import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { LOTTO_DATA_META, LOTTO_WINNING_NUMBERS } from "../data/lotto-data.js";
import {
  WEEKLY_RECOMMENDATION_RECORDS,
  WEEKLY_RECOMMENDATIONS_META,
} from "../data/weekly-recommendations.js";
import {
  RECOMMENDATION_ENGINE_VERSION,
} from "../src/core/recommendation-engine.js";
import {
  addDaysToIsoDate,
  advanceWeeklyCycle,
  evaluateWeeklyRecommendationRecords,
  getCurrentWeeklyRecord,
  getLatestEvaluatedWeeklyRecord,
  summarizeWeeklyResults,
} from "../src/core/weekly-cycle.js";

test("checked-in weekly artifact is aligned and contains one valid current set", async () => {
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
  assert.deepEqual(
    JSON.parse(JSON.stringify(records)),
    JSON.parse(JSON.stringify(WEEKLY_RECOMMENDATION_RECORDS)),
  );

  assert.ok(current);
  assert.equal(records.some((record) => record.status === "invalid"), false);
  assert.equal(records.filter((record) => record.status === "pending").length, 1);
  assert.equal(
    records.every(
      (record) =>
        record.status === "pending" ||
        (record.status === "evaluated" && record.targetDraw <= latestDraw.draw),
    ),
    true,
  );
  assert.equal(current.targetDraw, latestDraw.draw + 1);
  assert.equal(current.settings.count, 1);
  assert.equal(current.settings.portfolio, "single-uniform");
  assert.equal(current.recommendations.length, 1);
  const numbers = current.recommendations[0].numbers;
  assert.equal(numbers.length, 6);
  assert.equal(new Set(numbers).size, 6);
  assert.equal(numbers.every((number) => Number.isInteger(number) && number >= 1 && number <= 45), true);
});

test("checked-in current record rolls forward without a fixed draw or engine assumption", () => {
  const draws = [...LOTTO_WINNING_NUMBERS].sort((left, right) => right.draw - left.draw);
  const currentRecords = evaluateWeeklyRecommendationRecords(WEEKLY_RECOMMENDATION_RECORDS, draws);
  const current = getCurrentWeeklyRecord(currentRecords, draws[0]);
  assert.ok(current);

  const syntheticResult = {
    draw: current.targetDraw,
    date: current.targetDate,
    numbers: [1, 2, 3, 4, 5, 6],
    bonus: 7,
  };
  const advanced = advanceWeeklyCycle({
    records: WEEKLY_RECOMMENDATION_RECORDS,
    draws: [syntheticResult, ...draws],
    generatedAt: `${addDaysToIsoDate(current.targetDate, 1)}T00:00:00.000Z`,
  });
  const next = getCurrentWeeklyRecord(advanced, syntheticResult);
  const evaluated = getLatestEvaluatedWeeklyRecord(advanced);

  assert.ok(next);
  assert.equal(next.targetDraw, syntheticResult.draw + 1);
  assert.equal(next.engineVersion, RECOMMENDATION_ENGINE_VERSION);
  assert.equal(next.recommendations.length, 1);
  assert.equal(evaluated.targetDraw, syntheticResult.draw);
  assert.equal(evaluated.status, "evaluated");
});
