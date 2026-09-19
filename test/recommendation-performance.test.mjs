import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HIT_PROBABILITIES, RANDOM_BASELINE, summarizeHits, summarizeLivePerformance, totalHitDistribution } from "../src/core/recommendation-performance.js";
import { analyzeRecommendations, backtestStrategy, passesEvidenceGate } from "../scripts/analysis/backtest.mjs";
import { STRATEGIES, predictNumbers } from "../scripts/analysis/strategies.mjs";
import { LOTTO_WINNING_NUMBERS } from "../data/lotto-data.js";
import { WEEKLY_RECOMMENDATION_RECORDS } from "../data/weekly-recommendations.js";
import { RECOMMENDATION_ANALYSIS } from "../data/recommendation-analysis.js";

test("exact single-ticket distribution matches combinatorial probabilities", () => {
  assert.ok(Math.abs(HIT_PROBABILITIES.reduce((sum, p) => sum + p, 0) - 1) < 1e-12);
  assert.ok(Math.abs(HIT_PROBABILITIES[0] - 3262623 / 8145060) < 1e-12);
  assert.ok(Math.abs(RANDOM_BASELINE.prizeRate - 194130 / 8145060) < 1e-12);
  assert.ok(Math.abs(RANDOM_BASELINE.firstPrizeRate - 1 / 8145060) < 1e-15);
  const distribution = totalHitDistribution(8);
  assert.ok(Math.abs(distribution.reduce((sum, p) => sum + p, 0) - 1) < 1e-12);
  assert.ok(Math.abs(distribution.reduce((sum, p, hits) => sum + p * hits, 0) - 6.4) < 1e-12);
});

test("live metrics keep zero-hit weeks and exclude pending or invalid records", () => {
  const records = [0, 1, 3].map((hitCount) => ({ status: "evaluated", result: { setResults: [{ hitCount }] } }));
  records.push({ status: "invalid", result: { setResults: [{ hitCount: 6 }] } }, { status: "pending" });
  const summary = summarizeLivePerformance(records);
  assert.equal(summary.count, 3);
  assert.equal(summary.averageHits, 4 / 3);
  assert.equal(summary.zeroHitRate, 1 / 3);
  assert.equal(summary.prizeRate, 1 / 3);
  assert.equal(summarizeLivePerformance([]).averageHits, null);
  assert.throws(() => summarizeHits([7]), /between zero and six/);
});

test("walk-forward predictions cannot read or mutate target and future draws", () => {
  const draws = [...LOTTO_WINNING_NUMBERS].sort((a, b) => a.draw - b.draw).slice(0, 12);
  const original = structuredClone(draws);
  let calls = 0;
  backtestStrategy(draws, STRATEGIES[0], { warmupDraws: 5, predict: (_, history) => {
    assert.equal(history.length, 5 + calls);
    assert.equal(history.at(-1).draw, 5 + calls);
    calls += 1;
    history[0].numbers[0] = 45;
    return [1, 2, 3, 4, 5, 6];
  } });
  assert.equal(calls, 7);
  assert.deepEqual(draws, original);
  const truncated = backtestStrategy(draws.slice(0, 9), STRATEGIES[0], { warmupDraws: 5 });
  assert.deepEqual(backtestStrategy(draws, STRATEGIES[0], { warmupDraws: 5 }).slice(0, 4), truncated);
  assert.throws(() => backtestStrategy([draws[0], draws[2]], STRATEGIES[0], { warmupDraws: 1 }), /contiguous/);
});

test("all fixed alternatives are deterministic six-number predictions from the past", () => {
  const history = [...LOTTO_WINNING_NUMBERS].sort((a, b) => a.draw - b.draw).slice(0, 260);
  for (const strategy of STRATEGIES) {
    const numbers = predictNumbers(strategy, history);
    assert.equal(numbers.length, 6);
    assert.equal(new Set(numbers).size, 6);
    assert.ok(numbers.every((number) => Number.isInteger(number) && number >= 1 && number <= 45));
    assert.deepEqual(predictNumbers(strategy, structuredClone(history)), numbers);
  }
});

test("evidence gate rejects insignificant lift, increased misses and weaker prize rate", () => {
  const strong = { adjustedPValue: 0.01, averageHits: 1.1, zeroHitRate: 0.3, prizeRate: 0.04 };
  assert.equal(passesEvidenceGate(strong), true);
  assert.equal(passesEvidenceGate({ ...strong, adjustedPValue: 0.06 }), false);
  assert.equal(passesEvidenceGate({ ...strong, averageHits: 0.85 }), false);
  assert.equal(passesEvidenceGate({ ...strong, zeroHitRate: 0.4 }), false);
  assert.equal(passesEvidenceGate({ ...strong, prizeRate: 0.01 }), false);
});

test("checked-in analysis is reproducible and separates historical tests from live performance", async () => {
  const report = analyzeRecommendations({ draws: LOTTO_WINNING_NUMBERS, records: WEEKLY_RECOMMENDATION_RECORDS });
  const artifact = JSON.parse(await readFile(new URL("../data/recommendation-analysis.json", import.meta.url), "utf8"));
  assert.deepEqual(report, artifact);
  assert.deepEqual(report, RECOMMENDATION_ANALYSIS);
  const { development, holdout } = report.candidates[0];
  assert.equal(holdout.fromDraw, development.toDraw + 1);
  assert.equal(holdout.count, 260);
  assert.equal(holdout.toDraw, report.latestDraw);
  assert.equal(report.live.count, WEEKLY_RECOMMENDATION_RECORDS.filter((record) => record.status === "evaluated").length);
  assert.equal(report.decision.activeStrategy, "current");
});
