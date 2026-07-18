import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceWeeklyCycle,
  createWeeklyRecommendationRecord,
  evaluateWeeklyRecommendationRecords,
  getCurrentWeeklyRecord,
  getLatestEvaluatedWeeklyRecord,
  getSalesCutoffAt,
  summarizeWeeklyResults,
} from "../src/core/weekly-cycle.js";

const draw100 = {
  draw: 100,
  date: "2026-01-03",
  numbers: [1, 8, 15, 22, 29, 36],
  bonus: 43,
};

test("same week is created once and remains exactly three sets", () => {
  const first = advanceWeeklyCycle({ records: [], draws: [draw100], generatedAt: "2026-01-04T00:00:00.000Z" });
  const second = advanceWeeklyCycle({ records: first, draws: [draw100], generatedAt: "2026-01-05T00:00:00.000Z" });

  assert.deepEqual(second, first);
  assert.equal(second.length, 1);
  assert.equal(second[0].targetDraw, 101);
  assert.equal(second[0].recommendations.length, 3);
  assert.equal(new Set(second[0].recommendations.flatMap((item) => item.numbers)).size, 18);
});

test("next result evaluates all three sets before creating the following week", () => {
  const records = advanceWeeklyCycle({ records: [], draws: [draw100], generatedAt: "2026-01-04T00:00:00.000Z" });
  const [first, second] = records[0].recommendations;
  const used = new Set(records[0].recommendations.flatMap((item) => item.numbers));
  const unused = Array.from({ length: 45 }, (_, index) => index + 1).find((number) => !used.has(number));
  const draw101 = {
    draw: 101,
    date: "2026-01-10",
    numbers: [...first.numbers.slice(0, 3), ...second.numbers.slice(0, 2), unused].sort((a, b) => a - b),
    bonus: second.numbers[2],
  };

  const advanced = advanceWeeklyCycle({
    records,
    draws: [draw101, draw100],
    generatedAt: "2026-01-11T00:00:00.000Z",
  });
  const evaluated = getLatestEvaluatedWeeklyRecord(advanced);
  const current = getCurrentWeeklyRecord(advanced, draw101);

  assert.deepEqual(evaluated.result.setResults.map((result) => result.hitCount), [3, 2, 0]);
  assert.equal(evaluated.result.setResults[0].rank, "5등");
  assert.equal(evaluated.result.setResults[1].bonusHit, true);
  assert.equal(evaluated.result.setResults.length, 3);
  assert.equal(current.targetDraw, 102);
  assert.equal(current.baseDraw, 101);
  assert.equal(current.recommendations.length, 3);

  const summary = summarizeWeeklyResults(advanced);
  assert.equal(summary.evaluatedWeeks, 1);
  assert.equal(summary.evaluatedSets, 3);
  assert.equal(summary.prizeSetCount, 1);
});

test("recommendations cannot be created at or after the Korean sales cutoff", () => {
  const cutoff = getSalesCutoffAt("2026-01-10");
  assert.doesNotThrow(() =>
    createWeeklyRecommendationRecord({ baseDraw: draw100, generatedAt: new Date(cutoff.getTime() - 1).toISOString() }),
  );
  assert.throws(
    () => createWeeklyRecommendationRecord({ baseDraw: draw100, generatedAt: cutoff.toISOString() }),
    /after its sales cutoff/,
  );
});

test("an existing pending record does not hide stale winning data", () => {
  const records = advanceWeeklyCycle({ records: [], draws: [draw100], generatedAt: "2026-01-04T00:00:00.000Z" });
  const cutoff = getSalesCutoffAt("2026-01-10");

  assert.throws(
    () => advanceWeeklyCycle({ records, draws: [draw100], generatedAt: cutoff.toISOString() }),
    /Winning data is stale/,
  );
});

test("a pending record created after cutoff is invalid even before a result exists", () => {
  const record = createWeeklyRecommendationRecord({
    baseDraw: draw100,
    generatedAt: "2026-01-04T00:00:00.000Z",
  });
  record.createdAt = getSalesCutoffAt(record.targetDate).toISOString();

  const [validated] = evaluateWeeklyRecommendationRecords([record], [draw100]);

  assert.equal(validated.status, "invalid");
  assert.match(validated.invalidReason, /created after the target draw sales cutoff/);
});

test("missed weeks are never backfilled after their draw", () => {
  const draw101 = {
    draw: 101,
    date: "2026-01-10",
    numbers: [2, 9, 16, 23, 30, 37],
    bonus: 44,
  };
  const draw102 = {
    draw: 102,
    date: "2026-01-17",
    numbers: [3, 10, 17, 24, 31, 38],
    bonus: 45,
  };

  const records = advanceWeeklyCycle({
    records: [],
    draws: [draw102, draw101, draw100],
    generatedAt: "2026-01-18T00:00:00.000Z",
  });

  assert.deepEqual(records.map((record) => record.targetDraw), [103]);
});

test("tampered weekly numbers are excluded from evaluation", () => {
  const [record] = advanceWeeklyCycle({ records: [], draws: [draw100], generatedAt: "2026-01-04T00:00:00.000Z" });
  const tampered = structuredClone(record);
  tampered.recommendations[0].numbers[0] = tampered.recommendations[1].numbers[0];
  const draw101 = {
    draw: 101,
    date: "2026-01-10",
    numbers: [2, 9, 16, 23, 30, 37],
    bonus: 44,
  };

  const advanced = advanceWeeklyCycle({
    records: [tampered],
    draws: [draw101, draw100],
    generatedAt: "2026-01-11T00:00:00.000Z",
  });
  const invalid = advanced.find((item) => item.targetDraw === 101);

  assert.equal(invalid.status, "invalid");
  assert.match(invalid.invalidReason, /must not share numbers/);
  assert.equal(summarizeWeeklyResults(advanced).evaluatedWeeks, 0);
});
