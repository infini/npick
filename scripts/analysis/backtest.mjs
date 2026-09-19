import { createHash } from "node:crypto";
import { assertWeeklyRecommendationSets, RECOMMENDATION_ENGINE_VERSION } from "../../src/core/recommendation-engine.js";
import { RANDOM_BASELINE, summarizeHits, summarizeLivePerformance, totalHitDistribution, upperTailProbability } from "../../src/core/recommendation-performance.js";
import { evaluateWeeklyRecommendationRecords } from "../../src/core/weekly-cycle.js";
import { STRATEGIES, predictNumbers } from "./strategies.mjs";

export const ANALYSIS_POLICY = Object.freeze({
  version: "walk-forward-v1",
  warmupDraws: 260,
  holdoutDraws: 260,
  familyAlpha: 0.05,
  minimumMeanGain: 0.1,
  minimumZeroRateReduction: 0.05,
});

export function backtestStrategy(draws, strategy, { warmupDraws = ANALYSIS_POLICY.warmupDraws, predict = predictNumbers } = {}) {
  const ordered = validateDrawHistory(draws);
  if (!Number.isInteger(warmupDraws) || warmupDraws < 1 || warmupDraws >= ordered.length) {
    throw new Error("Backtest requires a valid warmup and at least one unseen draw.");
  }
  return ordered.slice(warmupDraws).map((target, offset) => {
    // The predictor gets a copy of the past only, never the target or any future draw.
    const history = structuredClone(ordered.slice(0, warmupDraws + offset));
    const numbers = predict(strategy, history);
    assertWeeklyRecommendationSets([{ numbers }]);
    return { targetDraw: target.draw, numbers, hits: numbers.filter((number) => target.numbers.includes(number)).length };
  });
}

export function analyzeRecommendations({ draws, records }) {
  const ordered = validateDrawHistory(draws);
  const developmentCount = ordered.length - ANALYSIS_POLICY.warmupDraws - ANALYSIS_POLICY.holdoutDraws;
  if (developmentCount < ANALYSIS_POLICY.holdoutDraws) throw new Error("Analysis needs at least 780 draws.");
  const developmentDistribution = totalHitDistribution(developmentCount);
  const holdoutDistribution = totalHitDistribution(ANALYSIS_POLICY.holdoutDraws);
  const alternatives = STRATEGIES.length - 1;
  const candidates = STRATEGIES.map((strategy) => {
    const trials = backtestStrategy(ordered, strategy);
    const development = summarizeTrials(trials.slice(0, developmentCount), developmentDistribution, alternatives);
    const holdout = summarizeTrials(trials.slice(developmentCount), holdoutDistribution, alternatives);
    return {
      id: strategy.id, label: strategy.label, development, holdout,
      qualifies: strategy.id !== "current" && passesEvidenceGate(development) && passesEvidenceGate(holdout),
    };
  });
  const evaluated = evaluateWeeklyRecommendationRecords(records, ordered);
  if (evaluated.some((record) => record.status === "invalid")) throw new Error("Invalid live records cannot enter the analysis.");
  const qualifiedIds = candidates.filter((candidate) => candidate.qualifies).map((candidate) => candidate.id);
  return {
    policy: ANALYSIS_POLICY,
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    latestDraw: ordered.at(-1).draw,
    historyDigest: createHash("sha256").update(JSON.stringify(ordered.map(({ draw, date, numbers, bonus }) =>
      ({ draw, date, numbers, bonus })))).digest("hex"),
    baseline: RANDOM_BASELINE,
    live: summarizeLivePerformance(evaluated),
    candidates,
    decision: {
      status: qualifiedIds.length ? "prospective-validation-required" : "no-validated-improvement",
      qualifiedIds,
      activeStrategy: "current",
    },
  };
}

export function passesEvidenceGate(summary) {
  return summary.adjustedPValue <= ANALYSIS_POLICY.familyAlpha &&
    summary.averageHits >= RANDOM_BASELINE.averageHits + ANALYSIS_POLICY.minimumMeanGain &&
    summary.zeroHitRate <= RANDOM_BASELINE.zeroHitRate - ANALYSIS_POLICY.minimumZeroRateReduction &&
    summary.prizeRate >= RANDOM_BASELINE.prizeRate;
}

function summarizeTrials(trials, distribution, comparisons) {
  const summary = summarizeHits(trials.map((trial) => trial.hits));
  const pValue = upperTailProbability(distribution, summary.totalHits);
  return { fromDraw: trials[0].targetDraw, toDraw: trials.at(-1).targetDraw, ...summary,
    pValue, adjustedPValue: Math.min(1, pValue * comparisons) };
}

function validateDrawHistory(draws) {
  if (!Array.isArray(draws) || !draws.length) throw new Error("Draw history is required.");
  const ordered = [...draws].sort((left, right) => left.draw - right.draw);
  ordered.forEach((draw, index) => {
    if (!Number.isInteger(draw.draw) || draw.draw < 1 || (index && draw.draw !== ordered[index - 1].draw + 1)) {
      throw new Error("Draw history must be contiguous and unique.");
    }
    assertWeeklyRecommendationSets([{ numbers: draw.numbers }]);
    if (!Number.isInteger(draw.bonus) || draw.bonus < 1 || draw.bonus > 45 || draw.numbers.includes(draw.bonus)) {
      throw new Error("Invalid bonus number in draw history.");
    }
  });
  return ordered;
}
