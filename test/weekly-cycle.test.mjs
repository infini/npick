import assert from "node:assert/strict";
import test from "node:test";
import {
  createLegacyWeeklySeed,
  generateLegacyRecommendationNumberSets,
  LEGACY_RECOMMENDATION_ENGINE_VERSION,
  RECOMMENDATION_ENGINE_VERSION,
} from "../src/core/recommendation-engine.js";
import {
  addDaysToIsoDate,
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

test("same week is created once and remains exactly one set", () => {
  const first = advanceWeeklyCycle({ records: [], draws: [draw100], generatedAt: "2026-01-04T00:00:00.000Z" });
  const second = advanceWeeklyCycle({ records: first, draws: [draw100], generatedAt: "2026-01-05T00:00:00.000Z" });

  assert.deepEqual(second, first);
  assert.equal(second.length, 1);
  assert.equal(second[0].targetDraw, 101);
  assert.equal(second[0].recommendations.length, 1);
  assert.equal(new Set(second[0].recommendations[0].numbers).size, 6);
});

test("next result evaluates one set before creating the following week", () => {
  const records = advanceWeeklyCycle({ records: [], draws: [draw100], generatedAt: "2026-01-04T00:00:00.000Z" });
  const recommendation = records[0].recommendations[0];
  const unused = Array.from({ length: 45 }, (_, index) => index + 1).filter(
    (number) => !recommendation.numbers.includes(number),
  );
  const draw101 = {
    draw: 101,
    date: "2026-01-10",
    numbers: [...recommendation.numbers.slice(0, 3), ...unused.slice(0, 3)].sort((a, b) => a - b),
    bonus: unused[3],
  };

  const advanced = advanceWeeklyCycle({
    records,
    draws: [draw101, draw100],
    generatedAt: "2026-01-11T00:00:00.000Z",
  });
  const evaluated = getLatestEvaluatedWeeklyRecord(advanced);
  const current = getCurrentWeeklyRecord(advanced, draw101);

  assert.deepEqual(evaluated.result.setResults.map((result) => result.hitCount), [3]);
  assert.equal(evaluated.result.setResults[0].rank, "5등");
  assert.equal(evaluated.result.setResults.length, 1);
  assert.equal(current.targetDraw, 102);
  assert.equal(current.baseDraw, 101);
  assert.equal(current.recommendations.length, 1);

  const summary = summarizeWeeklyResults(advanced);
  assert.equal(summary.evaluatedWeeks, 1);
  assert.equal(summary.evaluatedSets, 1);
  assert.equal(summary.prizeSetCount, 1);
});

test("legacy three-set pending record keeps its original first set exactly once", () => {
  const legacy = createLegacyRecord(draw100);
  const expectedFirstSet = legacy.recommendations[0].numbers;

  const migrated = advanceWeeklyCycle({
    records: [legacy],
    draws: [draw100],
    generatedAt: "2026-01-05T00:00:00.000Z",
  });
  const repeated = advanceWeeklyCycle({
    records: migrated,
    draws: [draw100],
    generatedAt: "2026-01-06T00:00:00.000Z",
  });

  assert.deepEqual(repeated, migrated);
  assert.equal(migrated[0].id, legacy.id);
  assert.equal(migrated[0].engineVersion, LEGACY_RECOMMENDATION_ENGINE_VERSION);
  assert.equal(migrated[0].seed, legacy.seed);
  assert.deepEqual(migrated[0].recommendations.map((item) => item.numbers), [expectedFirstSet]);
  assert.deepEqual(migrated[0].migration, {
    version: "three-to-one-v1",
    fromCount: 3,
    keptSetIndex: 0,
    policy: "keep-original-first-set",
    migratedAt: "2026-01-05T00:00:00.000Z",
  });
});

test("legacy migration rejects a tampered second or third set", () => {
  const legacy = createLegacyRecord(draw100);
  const tampered = structuredClone(legacy);
  const secondNumber = tampered.recommendations[1].numbers[0];
  const thirdNumber = tampered.recommendations[2].numbers[0];
  tampered.recommendations[1].numbers[0] = thirdNumber;
  tampered.recommendations[2].numbers[0] = secondNumber;
  tampered.recommendations[1].numbers.sort((a, b) => a - b);
  tampered.recommendations[2].numbers.sort((a, b) => a - b);

  assert.throws(
    () =>
      advanceWeeklyCycle({
        records: [tampered],
        draws: [draw100],
        generatedAt: "2026-01-05T00:00:00.000Z",
      }),
    /do not match the deterministic engine output/,
  );
});

test("legacy migration is rejected after its target draw cutoff", () => {
  const legacy = createLegacyRecord(draw100);
  const draw101 = {
    draw: 101,
    date: "2026-01-10",
    numbers: [2, 9, 16, 23, 30, 37],
    bonus: 44,
  };

  assert.throws(
    () =>
      advanceWeeklyCycle({
        records: [legacy],
        draws: [draw101, draw100],
        generatedAt: "2026-01-11T00:00:00.000Z",
      }),
    /migrated before its sales cutoff/,
  );
});

test("migrated legacy set is evaluated before a native v2 single set is created", () => {
  const [migrated] = advanceWeeklyCycle({
    records: [createLegacyRecord(draw100)],
    draws: [draw100],
    generatedAt: "2026-01-05T00:00:00.000Z",
  });
  const recommended = migrated.recommendations[0].numbers;
  const unused = Array.from({ length: 45 }, (_, index) => index + 1).filter((number) => !recommended.includes(number));
  const draw101 = {
    draw: 101,
    date: "2026-01-10",
    numbers: [...recommended.slice(0, 2), ...unused.slice(0, 4)].sort((a, b) => a - b),
    bonus: unused[4],
  };

  const advanced = advanceWeeklyCycle({
    records: [migrated],
    draws: [draw101, draw100],
    generatedAt: "2026-01-11T00:00:00.000Z",
  });
  const evaluated = getLatestEvaluatedWeeklyRecord(advanced);
  const current = getCurrentWeeklyRecord(advanced, draw101);

  assert.equal(evaluated.engineVersion, LEGACY_RECOMMENDATION_ENGINE_VERSION);
  assert.equal(evaluated.result.setResults.length, 1);
  assert.equal(current.engineVersion, RECOMMENDATION_ENGINE_VERSION);
  assert.equal(current.recommendations.length, 1);
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
  tampered.recommendations[0].numbers[1] = tampered.recommendations[0].numbers[0];
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
  assert.match(invalid.invalidReason, /contains invalid numbers/);
  assert.equal(summarizeWeeklyResults(advanced).evaluatedWeeks, 0);
});

function createLegacyRecord(baseDraw) {
  const targetDraw = baseDraw.draw + 1;
  const targetDate = addDaysToIsoDate(baseDraw.date, 7);
  return {
    id: `${targetDraw}-${LEGACY_RECOMMENDATION_ENGINE_VERSION}`,
    status: "pending",
    createdAt: `${addDaysToIsoDate(baseDraw.date, 1)}T00:00:00.000Z`,
    salesCutoffAt: getSalesCutoffAt(targetDate).toISOString(),
    baseDraw: baseDraw.draw,
    baseDate: baseDraw.date,
    targetDraw,
    targetDate,
    engineVersion: LEGACY_RECOMMENDATION_ENGINE_VERSION,
    seed: createLegacyWeeklySeed(baseDraw),
    source: "scheduled-data-update",
    dataVersion: { latestDraw: baseDraw.draw, generatedAt: null },
    settings: { count: 3, portfolio: "disjoint-uniform" },
    recommendations: generateLegacyRecommendationNumberSets({ baseDraw }).map((numbers) => ({
      numbers,
      strategy: "weekly-disjoint-random",
      tags: ["세트 간 중복 0"],
    })),
  };
}
