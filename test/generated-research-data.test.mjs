import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LOTTO_WINNING_NUMBERS } from "../data/lotto-data.js";
import { RESEARCH_ANALYSIS } from "../data/research-analysis.js";
import { generateWeeklyRecommendationSets } from "../src/core/recommendation-engine.js";

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const policy = readJson("../scripts/research/protocol.json");
const ledger = readJson("../data/research-shadow-records.json");
const draws = [...LOTTO_WINNING_NUMBERS].sort((a, b) => a.draw - b.draw);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const historyDigest = (history) => digest(history.map(({ draw, date, numbers, bonus }) => ({ draw, date, numbers, bonus })));

test("research report matches its JSON, fixed protocol and historical input", () => {
  assert.deepEqual(RESEARCH_ANALYSIS, readJson("../data/research-analysis.json"));
  assert.deepEqual(RESEARCH_ANALYSIS.protocol, policy);
  // Python preserves 1.0 in the protocol digest; its own suite verifies that hash.
  assert.match(RESEARCH_ANALYSIS.protocolHash, /^[a-f0-9]{64}$/);
  assert.equal(ledger.protocolHash, RESEARCH_ANALYSIS.protocolHash);
  assert.equal(RESEARCH_ANALYSIS.productionEngineChanged, false);
  assert.ok(RESEARCH_ANALYSIS.latestDraw <= draws.at(-1).draw);
  assert.equal(RESEARCH_ANALYSIS.historyDigest, historyDigest(draws.filter((draw) => draw.draw <= RESEARCH_ANALYSIS.latestDraw)));
  assert.deepEqual(RESEARCH_ANALYSIS.periods, {
    development: [policy.firstEvaluationDraw, policy.selectionEndDraw],
    confirmation: [policy.selectionEndDraw + 1, policy.confirmationEndDraw],
  });
  assert.equal(RESEARCH_ANALYSIS.models.length, 53);
  assert.equal(new Set(RESEARCH_ANALYSIS.models.map(({ id }) => id)).size, 53);
  assert.equal(RESEARCH_ANALYSIS.comparisonsIncludingPreviousSearch, 52 + policy.previouslyTestedAlternatives);
  for (const model of RESEARCH_ANALYSIS.models) {
    for (const [period, [first, last]] of Object.entries(RESEARCH_ANALYSIS.periods)) {
      const result = model[period];
      assert.equal(result.count, last - first + 1);
      assert.equal(result.histogram.reduce((sum, n) => sum + n, 0), result.count);
      assert.equal(result.meanHits, result.histogram.reduce((sum, n, hits) => sum + n * hits, 0) / result.count);
      assert.ok(result.adjustedPValue >= 0 && result.adjustedPValue <= 1);
    }
  }
});

test("shadow forecasts are pre-draw, immutable-digest records separate from production", () => {
  const names = RESEARCH_ANALYSIS.models.map(({ id }) => id).sort();
  const targets = new Set();
  for (const record of ledger.records) {
    assert.ok(!targets.has(record.targetDraw));
    targets.add(record.targetDraw);
    assert.ok(record.targetDraw >= policy.firstProspectiveDraw);
    assert.equal(record.targetDraw, record.baseDraw + 1);
    assert.equal(record.protocolHash, ledger.protocolHash);
    assert.equal(record.forecastDigest, digest(record.predictions));
    assert.equal(record.historyDigest, historyDigest(draws.filter((draw) => draw.draw <= record.baseDraw)));
    assert.match(record.codeHash, /^[a-f0-9]{64}$/);
    const baseDraw = draws.find((draw) => draw.draw === record.baseDraw);
    assert.equal(Date.parse(record.targetDate) - Date.parse(baseDraw.date), 7 * 86400000);
    assert.ok(Date.parse(record.createdAt) < Date.parse(`${record.targetDate}T20:00:00+09:00`));
    assert.ok(Date.parse(record.createdAt) <= Date.now());
    assert.deepEqual(Object.keys(record.predictions).sort(), names);
    assert.deepEqual(record.predictions.current, generateWeeklyRecommendationSets({ baseDraw })[0].numbers);
    for (const numbers of Object.values(record.predictions)) {
      assert.equal(numbers.length, 6);
      assert.equal(new Set(numbers).size, 6);
      assert.ok(numbers.every((number) => Number.isInteger(number) && number >= 1 && number <= 45));
    }
    const actual = draws.find((draw) => draw.draw === record.targetDraw);
    if (record.status === "evaluated") {
      assert.ok(actual);
      for (const [name, numbers] of Object.entries(record.predictions)) {
        assert.equal(record.hits[name], numbers.filter((number) => actual.numbers.includes(number)).length);
      }
    } else {
      assert.equal(record.status, "pending");
      assert.equal(record.hits, undefined);
    }
  }
  // A newer weekly release may precede the isolated, slower research update.
  assert.equal(ledger.records.at(-1).targetDraw, RESEARCH_ANALYSIS.latestDraw + 1);
  assert.equal(RESEARCH_ANALYSIS.prospective.evaluatedWeeks, ledger.records.filter((record) => record.status === "evaluated").length);
  assert.equal(RESEARCH_ANALYSIS.prospective.evidenceThreshold, 52 / policy.familyAlpha);
});
