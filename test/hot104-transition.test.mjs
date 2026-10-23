import assert from "node:assert/strict";
import test from "node:test";
import { generateWeeklyRecommendationSets, RECOMMENDATION_ENGINE_VERSION } from "../src/core/recommendation-engine.js";
import { generateHot104Recommendations, HOT104_ENGINE_VERSION } from "../src/core/hot104-engine.js";
import { addDaysToIsoDate, advanceWeeklyCycle, evaluateWeeklyRecommendationRecords } from "../src/core/weekly-cycle.js";
import { summarizePairedComparison } from "../src/core/recommendation-comparison.js";
import { renderStrategyComparison } from "../src/ui/strategy-comparison.js";

function history(base = 1247, date = "2026-10-24") {
  return Array.from({ length: 104 }, (_, index) => ({
    draw: base - index, date: addDaysToIsoDate(date, -7 * index),
    numbers: index < 52 ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12], bonus: 45,
  }));
}

function makeHotRecord() {
  const draws = history();
  const [record] = advanceWeeklyCycle({ records: [], draws, generatedAt: "2026-10-25T00:00:00Z" });
  return { draws, record };
}

test("hot104 uses main-number counts, ascending ties and exactly 104 past draws", () => {
  const draws = history();
  const result = generateHot104Recommendations({ baseDraw: draws[0], draws });
  assert.deepEqual(result[0].numbers, [1, 2, 3, 4, 5, 6]);
  const outside = Array.from({ length: 200 }, (_, index) => [
    { ...draws[0], draw: 1248 + index, numbers: [39, 40, 41, 42, 43, 44] },
    { ...draws.at(-1), draw: 1143 - index, numbers: [39, 40, 41, 42, 43, 44] },
  ]).flat();
  assert.deepEqual(generateHot104Recommendations({ baseDraw: draws[0], draws: [...outside, ...draws].reverse() }), result);
  const changed = structuredClone(draws);
  changed[52].numbers = [7, 8, 9, 10, 11, 13];
  assert.deepEqual(generateHot104Recommendations({ baseDraw: draws[0], draws: changed })[0].numbers, [1, 2, 3, 4, 5, 6]);
  changed[51].numbers = [7, 8, 9, 10, 11, 12];
  assert.deepEqual(generateHot104Recommendations({ baseDraw: draws[0], draws: changed })[0].numbers, [7, 8, 9, 10, 11, 12]);
});

test("hot104 fails on missing, duplicate or invalid source data instead of silently falling back", () => {
  const draws = history();
  assert.throws(() => generateHot104Recommendations({ baseDraw: draws[0], draws: draws.slice(0, 103) }), /104 contiguous/);
  const duplicated = [...draws];
  duplicated[10] = duplicated[9];
  assert.throws(() => generateHot104Recommendations({ baseDraw: draws[0], draws: duplicated }), /104 contiguous/);
  const invalid = structuredClone(draws);
  invalid[10].numbers = [1, 1, 2, 3, 4, 5];
  assert.throws(() => generateHot104Recommendations({ baseDraw: draws[0], draws: invalid }), /invalid numbers/);
  assert.throws(() => advanceWeeklyCycle({ records: [], draws: [draws[0]], generatedAt: "2026-10-25T00:00:00Z" }), /104 contiguous/);
});

test("published v2 stays untouched and only the next new record becomes v3 with a paired v2 forecast", () => {
  const draws = history(1246, "2026-10-17");
  const [original] = advanceWeeklyCycle({ records: [], draws, generatedAt: "2026-10-18T00:00:00Z" });
  const [preserved] = advanceWeeklyCycle({ records: [original], draws, generatedAt: "2026-10-23T00:00:00Z" });
  assert.deepEqual(preserved, original);
  assert.equal(preserved.engineVersion, RECOMMENDATION_ENGINE_VERSION);
  assert.equal(preserved.comparison, undefined);

  const nextDraw = { draw: 1247, date: "2026-10-24", numbers: [1, 2, 3, 4, 5, 6], bonus: 45 };
  const advanced = advanceWeeklyCycle({ records: [original], draws: [nextDraw, ...draws], generatedAt: "2026-10-25T00:00:00Z" });
  const current = advanced[0];
  assert.equal(current.engineVersion, HOT104_ENGINE_VERSION);
  assert.equal(current.targetDraw, 1248);
  assert.equal(current.recommendations.length, 1);
  assert.deepEqual(current.comparison.recommendations, generateWeeklyRecommendationSets({ baseDraw: nextDraw }));
  assert.equal(current.comparison.createdAt, current.createdAt);
  assert.deepEqual(current.analysisWindow, { fromDraw: 1144, toDraw: 1247, count: 104 });
  assert.equal(advanced[1].status, "evaluated");
  assert.equal(advanced[1].comparison, undefined);
  assert.equal(summarizePairedComparison(advanced).hot104.count, 0);
  assert.deepEqual(advanceWeeklyCycle({ records: advanced, draws: [nextDraw, ...draws], generatedAt: "2026-10-26T00:00:00Z" }), advanced);
});

test("paired evaluation keeps zero-hit weeks and evaluates both forecasts against the same result", () => {
  const { draws, record } = makeHotRecord();
  const actual = { draw: 1248, date: "2026-10-31", numbers: [33, 34, 35, 36, 37, 38], bonus: 45 };
  const [evaluated] = evaluateWeeklyRecommendationRecords([record], [actual, ...draws]);
  assert.equal(evaluated.status, "evaluated");
  const summary = summarizePairedComparison([evaluated, record]);
  assert.equal(summary.hot104.count, 1);
  assert.equal(summary.random.count, 1);
  assert.equal(summary.hot104.zeroCount, 1);
  assert.equal(summary.random.totalHits, record.comparison.recommendations[0].numbers.filter((number) => actual.numbers.includes(number)).length);
  assert.equal(summary.wins + summary.ties + summary.losses, 1);
  const html = renderStrategyComparison([evaluated]);
  assert.match(html, /1248회/);
  assert.match(html, /0\.000개/);
  assert.match(html, /100\.0%/);
});

test("tampering with the primary, comparison, timestamp or window excludes the pair", () => {
  const { draws, record } = makeHotRecord();
  const actual = { draw: 1248, date: "2026-10-31", numbers: [33, 34, 35, 36, 37, 38], bonus: 45 };
  const changes = [
    (value) => { value.comparison.createdAt = "2026-10-26T00:00:00.000Z"; },
    (value) => { value.comparison.recommendations[0].numbers = [1, 1, 2, 3, 4, 5]; },
    (value) => { value.comparison.recommendations[0].numbers = [1, 2, 3, 4, 5, 6]; },
    (value) => { value.comparison = undefined; },
    (value) => { value.analysisWindow.fromDraw -= 1; },
    (value) => { value.recommendations[0].numbers = [7, 8, 9, 10, 11, 12]; },
    (value) => { value.settings.window = 260; },
  ];
  for (const change of changes) {
    const tampered = structuredClone(record);
    change(tampered);
    const [invalid] = evaluateWeeklyRecommendationRecords([tampered], [actual, ...draws]);
    assert.equal(invalid.status, "invalid");
    assert.equal(summarizePairedComparison([invalid]).hot104.count, 0);
  }
});

test("legacy records cannot be retroactively given a comparison", () => {
  const draws = history(1246, "2026-10-17");
  const [legacy] = advanceWeeklyCycle({ records: [], draws, generatedAt: "2026-10-18T00:00:00Z" });
  legacy.comparison = makeHotRecord().record.comparison;
  assert.equal(evaluateWeeklyRecommendationRecords([legacy], draws)[0].status, "invalid");
});

test("empty paired performance shows pending rather than zero percent or old research results", () => {
  const html = renderStrategyComparison([]);
  assert.match(html, /1248회부터/);
  assert.match(html, /평가 대기/);
  assert.match(html, /<td>-<\/td>/);
  assert.doesNotMatch(html, /0\.0%|1\.750/);
});
