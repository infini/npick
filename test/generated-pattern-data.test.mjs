import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LOTTO_WINNING_NUMBERS } from "../data/lotto-data.js";
import { generateWeeklyRecommendationSets } from "../src/core/recommendation-engine.js";
import { generateHot104Recommendations } from "../src/core/hot104-engine.js";

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const report = readJson("../data/deep-research-analysis.json");
const ledger = readJson("../data/deep-research-shadow-records.json");
const policy = readJson("../scripts/deep-research/protocol.json");
const draws = [...LOTTO_WINNING_NUMBERS].sort((a, b) => a.draw - b.draw);
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const historyDigest = (history) => digest(history.map(({ draw, date, numbers, bonus }) => ({ draw, date, numbers, bonus })));

test("pattern research has a separate fixed protocol, complete periods and valid metrics", () => {
  assert.deepEqual(report.protocol, policy);
  assert.equal(report.productionEngineChanged, false);
  assert.equal(report.historicalOnlyNotUnseenHoldout, true);
  assert.ok(report.latestDraw <= draws.at(-1).draw);
  assert.equal(report.historyDigest, historyDigest(draws.filter((draw) => draw.draw <= report.latestDraw)));
  assert.equal(report.modelCount, 41);
  assert.equal(report.dataQuality.drawCount, report.latestDraw);
  assert.equal(report.dataQuality.completeWeeklyHistory, true);
  assert.equal(new Set(report.models.map((model) => model.id)).size, 41);
  assert.equal(report.historicalComparisonFactor, 3 * (40 + 60));
  for (const model of report.models) {
    for (const [period, [first, last]] of Object.entries(report.periods)) {
      const result = model[period];
      assert.equal(result.count, last - first + 1);
      assert.equal(result.histogram.reduce((sum, value) => sum + value, 0), result.count);
      assert.equal(result.meanHits, result.histogram.reduce((sum, value, hits) => sum + value * hits, 0) / result.count);
      assert.equal(result.zeroRate, result.histogram[0] / result.count);
    }
    for (const value of Object.values(model.recent260.adjustedPValues)) assert.ok(value >= 0 && value <= 1);
  }
  assert.equal(report.negativeControls.simulations, policy.negativeControlSimulations);
  assert.equal(report.negativeControls.drawsPerHistory, report.latestDraw);
  assert.equal(report.diagnostics.tests.length, 7);
  for (const row of report.detectionPower.rows) assert.ok(row.power >= 0 && row.power <= 1);
  assert.equal(report.tieAudit.ascendingTieMean, report.models.find((model) => model.id === "hot-104").all.meanHits);
});

test("new pattern ledger never mixes old research or changes production hot104/v2 definitions", () => {
  assert.equal(ledger.protocolHash, report.protocolHash);
  assert.notEqual(ledger.protocolHash, readJson("../data/research-shadow-records.json").protocolHash);
  const names = report.models.map((model) => model.id).sort();
  const targets = new Set();
  for (const record of ledger.records) {
    assert.ok(!targets.has(record.targetDraw));
    targets.add(record.targetDraw);
    assert.ok(record.targetDraw >= policy.firstProspectiveDraw);
    assert.equal(record.targetDraw, record.baseDraw + 1);
    assert.equal(record.protocolHash, report.protocolHash);
    assert.equal(record.forecastDigest, digest(record.predictions));
    assert.equal(record.historyDigest, historyDigest(draws.filter((draw) => draw.draw <= record.baseDraw)));
    assert.ok(Date.parse(record.createdAt) < Date.parse(`${record.targetDate}T20:00:00+09:00`));
    assert.ok(Date.parse(record.createdAt) <= Date.now());
    assert.deepEqual(Object.keys(record.predictions).sort(), names);
    const baseDraw = draws.find((draw) => draw.draw === record.baseDraw);
    assert.equal(Date.parse(record.targetDate) - Date.parse(baseDraw.date), 7 * 86400000);
    assert.deepEqual(record.predictions.current, generateWeeklyRecommendationSets({ baseDraw })[0].numbers);
    assert.deepEqual(record.predictions["hot-104"], generateHot104Recommendations({ baseDraw, draws })[0].numbers);
    for (const numbers of Object.values(record.predictions)) {
      assert.equal(numbers.length, 6);
      assert.equal(new Set(numbers).size, 6);
      assert.ok(numbers.every((number) => Number.isInteger(number) && number >= 1 && number <= 45));
    }
    const actual = draws.find((draw) => draw.draw === record.targetDraw);
    if (actual) {
      assert.equal(record.status, "evaluated");
      for (const [name, numbers] of Object.entries(record.predictions)) {
        assert.equal(record.hits[name], numbers.filter((number) => actual.numbers.includes(number)).length);
      }
    } else {
      assert.equal(record.status, "pending");
      assert.equal(record.hits, undefined);
    }
  }
  if (report.latestDraw + 1 < policy.firstProspectiveDraw) assert.deepEqual(ledger.records, []);
  else assert.equal(ledger.records.at(-1).targetDraw, report.latestDraw + 1);
  assert.equal(report.prospective.evaluatedWeeks, ledger.records.filter((record) => record.status === "evaluated").length);
  assert.equal(report.prospective.hypothesesPerChallenger, 3);
  assert.equal(report.prospective.evidenceThreshold, ledger.records.length ? 3 * 40 / policy.familyAlpha : null);
});

test("official sample audit agrees with the matching local draw rows", () => {
  const audit = readJson("../data/deep-source-audit.json");
  assert.equal(audit.source, "https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do");
  assert.ok(audit.latestDraw <= draws.at(-1).draw);
  assert.deepEqual(audit.samples.map((sample) => sample.draw), [1, 260, 520, 780, 1040, audit.latestDraw]);
  for (const sample of audit.samples) {
    assert.equal(sample.status, "matched");
    const { draw, date, numbers, bonus } = draws.find((row) => row.draw === sample.draw);
    assert.deepEqual(sample.official, { draw, date, numbers, bonus });
  }
});
