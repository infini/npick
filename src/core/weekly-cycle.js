import {
  assertWeeklyRecommendationSets,
  createLegacyWeeklySeed,
  createWeeklySeed,
  generateLegacyRecommendationNumberSets,
  generateWeeklyRecommendationSets,
  LEGACY_RECOMMENDATION_ENGINE_VERSION,
  RECOMMENDATION_ENGINE_VERSION,
  WEEKLY_RECOMMENDATION_COUNT,
} from "./recommendation-engine.js?v=14";

export const WEEKLY_RECORD_LIMIT = 52;
export const LOTTO_SALES_CUTOFF_KST = "20:00:00+09:00";

export function advanceWeeklyCycle({ records, draws, generatedAt = new Date().toISOString(), dataMeta = null }) {
  const sortedDraws = validateAndSortDraws(draws);
  assertLatestDrawIsCurrent(sortedDraws[0], generatedAt);
  const normalizedRecords = migrateLegacyPendingRecords(records, sortedDraws, generatedAt);
  assertUniqueTargets(normalizedRecords);

  const evaluatedRecords = evaluateWeeklyRecommendationRecords(normalizedRecords, sortedDraws);
  const latestDraw = sortedDraws[0];
  const targetDraw = latestDraw.draw + 1;
  const existingTargetRecord = evaluatedRecords.find((record) => record.targetDraw === targetDraw);

  if (existingTargetRecord) {
    if (existingTargetRecord.status !== "pending") {
      throw new Error(`Target draw ${targetDraw} already has a non-pending weekly record.`);
    }
    return pruneWeeklyRecommendationRecords(evaluatedRecords);
  }

  const nextRecord = createWeeklyRecommendationRecord({
    baseDraw: latestDraw,
    generatedAt,
    dataMeta,
  });

  return pruneWeeklyRecommendationRecords([nextRecord, ...evaluatedRecords]);
}

export function createWeeklyRecommendationRecord({ baseDraw, generatedAt = new Date().toISOString(), dataMeta = null }) {
  const targetDraw = baseDraw.draw + 1;
  const targetDate = addDaysToIsoDate(baseDraw.date, 7);
  const salesCutoffAt = getSalesCutoffAt(targetDate).toISOString();
  const generatedDate = parseTimestamp(generatedAt, "generatedAt");

  if (generatedDate.getTime() >= Date.parse(salesCutoffAt)) {
    throw new Error(
      `Cannot generate draw ${targetDraw} recommendations after its sales cutoff. Winning data is stale.`,
    );
  }

  const recommendations = generateWeeklyRecommendationSets({ baseDraw });
  return {
    id: `${targetDraw}-${RECOMMENDATION_ENGINE_VERSION}`,
    status: "pending",
    createdAt: generatedDate.toISOString(),
    salesCutoffAt,
    baseDraw: baseDraw.draw,
    baseDate: baseDraw.date,
    targetDraw,
    targetDate,
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    seed: createWeeklySeed(baseDraw),
    source: "scheduled-data-update",
    dataVersion: {
      latestDraw: dataMeta?.latestDraw ?? baseDraw.draw,
      generatedAt: dataMeta?.generatedAt ?? null,
    },
    settings: {
      count: WEEKLY_RECOMMENDATION_COUNT,
      portfolio: "single-uniform",
    },
    recommendations,
  };
}

export function evaluateWeeklyRecommendationRecords(records, draws) {
  const sortedDraws = validateAndSortDraws(draws);
  const drawByRound = new Map(sortedDraws.map((draw) => [draw.draw, draw]));

  return records.map((record) => {
    const actualDraw = drawByRound.get(record?.targetDraw);
    if (!actualDraw) {
      return validatePendingRecord(record, drawByRound);
    }

    try {
      validateRecordForEvaluation(record, actualDraw, drawByRound);
      return {
        ...record,
        status: "evaluated",
        invalidReason: undefined,
        result: evaluateWeeklyRecommendationRecord(record, actualDraw),
      };
    } catch (error) {
      return {
        ...record,
        status: "invalid",
        invalidReason: error instanceof Error ? error.message : String(error),
        result: undefined,
      };
    }
  });
}

export function evaluateWeeklyRecommendationRecord(record, actualDraw) {
  assertWeeklyRecommendationSets(record.recommendations);
  const winningSet = new Set(actualDraw.numbers);
  const setResults = record.recommendations.map((recommendation, index) => {
    const matchedNumbers = recommendation.numbers.filter((number) => winningSet.has(number));
    const bonusHit = recommendation.numbers.includes(actualDraw.bonus);
    const hitCount = matchedNumbers.length;

    return {
      index: index + 1,
      numbers: recommendation.numbers,
      matchedNumbers,
      bonusHit,
      hitCount,
      rank: getPrizeRank(hitCount, bonusHit),
    };
  });
  const bestResult = [...setResults].sort(
    (left, right) => right.hitCount - left.hitCount || Number(right.bonusHit) - Number(left.bonusHit),
  )[0];
  const totalHits = setResults.reduce((total, result) => total + result.hitCount, 0);

  return {
    draw: actualDraw.draw,
    date: actualDraw.date,
    winningNumbers: actualDraw.numbers,
    bonus: actualDraw.bonus,
    setResults,
    bestHits: bestResult?.hitCount ?? 0,
    bestRank: bestResult?.rank ?? "미당첨",
    averageHits: setResults.length ? Number((totalHits / setResults.length).toFixed(2)) : 0,
    totalHits,
    prizeSetCount: setResults.filter((result) => result.hitCount >= 3).length,
  };
}

export function summarizeWeeklyResults(records) {
  const evaluated = records.filter((record) => record.status === "evaluated" && record.result);
  const setResults = evaluated.flatMap((record) => record.result.setResults);
  const totalHits = setResults.reduce((total, result) => total + result.hitCount, 0);

  return {
    evaluatedWeeks: evaluated.length,
    evaluatedSets: setResults.length,
    averageHitsPerSet: setResults.length ? Number((totalHits / setResults.length).toFixed(2)) : 0,
    prizeSetCount: setResults.filter((result) => result.hitCount >= 3).length,
    prizeWeekCount: evaluated.filter((record) => record.result.prizeSetCount > 0).length,
    bestHits: setResults.length ? Math.max(...setResults.map((result) => result.hitCount)) : 0,
  };
}

export function getCurrentWeeklyRecord(records, latestDraw) {
  return records.find(
    (record) => record.status === "pending" && record.targetDraw === latestDraw.draw + 1,
  ) ?? null;
}

export function getLatestEvaluatedWeeklyRecord(records) {
  return [...records]
    .filter((record) => record.status === "evaluated" && record.result)
    .sort((left, right) => right.targetDraw - left.targetDraw)[0] ?? null;
}

export function pruneWeeklyRecommendationRecords(records, limit = WEEKLY_RECORD_LIMIT) {
  return [...records]
    .sort((left, right) => right.targetDraw - left.targetDraw || String(right.createdAt).localeCompare(String(left.createdAt)))
    .slice(0, limit);
}

export function addDaysToIsoDate(dateText, days) {
  const date = parseIsoDate(dateText);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getSalesCutoffAt(drawDate) {
  parseIsoDate(drawDate);
  return new Date(`${drawDate}T${LOTTO_SALES_CUTOFF_KST}`);
}

export function assertLatestDrawIsCurrent(latestDraw, checkedAt = new Date().toISOString()) {
  const nextDrawDate = addDaysToIsoDate(latestDraw.date, 7);
  const nextCutoff = getSalesCutoffAt(nextDrawDate);
  if (parseTimestamp(checkedAt, "checkedAt").getTime() >= nextCutoff.getTime()) {
    throw new Error(
      `Winning data is stale: draw ${latestDraw.draw + 1} has reached its sales cutoff without a result.`,
    );
  }
  return true;
}

export function getPrizeRank(hitCount, bonusHit) {
  if (hitCount === 6) return "1등";
  if (hitCount === 5 && bonusHit) return "2등";
  if (hitCount === 5) return "3등";
  if (hitCount === 4) return "4등";
  if (hitCount === 3) return "5등";
  return "미당첨";
}

function validatePendingRecord(record, drawByRound) {
  try {
    validateRecordShape(record, drawByRound);
    return record;
  } catch (error) {
    return {
      ...record,
      status: "invalid",
      invalidReason: error instanceof Error ? error.message : String(error),
      result: undefined,
    };
  }
}

function migrateLegacyPendingRecords(records, draws, migratedAt) {
  if (!Array.isArray(records)) {
    throw new Error("Weekly recommendation records must be an array.");
  }

  const drawByRound = new Map(draws.map((draw) => [draw.draw, draw]));
  return records.map((record) => {
    if (record?.status !== "pending" || record.engineVersion !== LEGACY_RECOMMENDATION_ENGINE_VERSION) {
      return record;
    }

    const baseDraw = drawByRound.get(record.baseDraw);
    if (record.migration) {
      validateMigratedLegacyRecord(record, baseDraw);
      return record;
    }

    const migrationDate = parseTimestamp(migratedAt, "migratedAt");
    validateLegacyPendingRecord(record, baseDraw, migrationDate);
    const firstRecommendation = record.recommendations[0];

    return {
      ...record,
      settings: {
        count: WEEKLY_RECOMMENDATION_COUNT,
        portfolio: "single-uniform",
      },
      recommendations: [
        {
          ...firstRecommendation,
          strategy: "weekly-single-random",
          tags: (firstRecommendation.tags ?? []).filter((tag) => tag !== "세트 간 중복 0"),
        },
      ],
      migration: {
        version: "three-to-one-v1",
        fromCount: 3,
        keptSetIndex: 0,
        policy: "keep-original-first-set",
        migratedAt: migrationDate.toISOString(),
      },
    };
  });
}

function validateLegacyPendingRecord(record, baseDraw, migrationDate) {
  if (!baseDraw || record.targetDraw !== record.baseDraw + 1) {
    throw new Error("Legacy weekly recommendation has an invalid base or target draw.");
  }
  if (record.id !== `${record.targetDraw}-${LEGACY_RECOMMENDATION_ENGINE_VERSION}`) {
    throw new Error("Legacy weekly recommendation id is invalid.");
  }
  if (record.settings?.count !== 3 || record.settings?.portfolio !== "disjoint-uniform") {
    throw new Error("Legacy weekly recommendation settings are invalid.");
  }
  if (record.seed !== createLegacyWeeklySeed(baseDraw)) {
    throw new Error("Legacy weekly recommendation seed does not match its base draw.");
  }
  if (record.targetDate !== addDaysToIsoDate(baseDraw.date, 7)) {
    throw new Error("Legacy weekly recommendation target date does not match its base draw.");
  }

  const createdAt = parseTimestamp(record.createdAt, "createdAt");
  const expectedSalesCutoffAt = getSalesCutoffAt(record.targetDate);
  if (
    record.salesCutoffAt !== expectedSalesCutoffAt.toISOString() ||
    createdAt.getTime() >= expectedSalesCutoffAt.getTime() ||
    migrationDate.getTime() >= expectedSalesCutoffAt.getTime()
  ) {
    throw new Error("Legacy weekly recommendation was not created and migrated before its sales cutoff.");
  }
  if (!Array.isArray(record.recommendations) || record.recommendations.length !== 3) {
    throw new Error("Legacy weekly recommendation must contain exactly three sets.");
  }

  const legacyNumbers = record.recommendations.flatMap((recommendation) => recommendation?.numbers ?? []);
  if (
    legacyNumbers.length !== 18 ||
    new Set(legacyNumbers).size !== 18 ||
    legacyNumbers.some((number) => !Number.isInteger(number) || number < 1 || number > 45)
  ) {
    throw new Error("Legacy weekly recommendation must contain 18 distinct valid numbers.");
  }

  const expectedKeys = generateLegacyRecommendationNumberSets({ baseDraw })
    .map((numbers) => numbers.join("-"))
    .join("|");
  const actualKeys = record.recommendations.map((recommendation) => recommendation.numbers.join("-")).join("|");
  if (actualKeys !== expectedKeys) {
    throw new Error("Legacy weekly recommendations do not match the deterministic engine output.");
  }
}

function validateMigratedLegacyRecord(record, baseDraw) {
  if (!baseDraw || record.targetDraw !== record.baseDraw + 1) {
    throw new Error("Migrated legacy recommendation has an invalid base or target draw.");
  }
  if (record.seed !== createLegacyWeeklySeed(baseDraw)) {
    throw new Error("Migrated legacy recommendation seed does not match its base draw.");
  }
  if (
    record.migration?.version !== "three-to-one-v1" ||
    record.migration?.fromCount !== 3 ||
    record.migration?.keptSetIndex !== 0 ||
    record.migration?.policy !== "keep-original-first-set"
  ) {
    throw new Error("Migrated legacy recommendation metadata is invalid.");
  }
  const migratedAt = parseTimestamp(record.migration.migratedAt, "migration.migratedAt");
  if (
    migratedAt.getTime() < parseTimestamp(record.createdAt, "createdAt").getTime() ||
    migratedAt.getTime() >= getSalesCutoffAt(record.targetDate).getTime()
  ) {
    throw new Error("Migrated legacy recommendation has an invalid migration time.");
  }
  if (record.id !== `${record.targetDraw}-${LEGACY_RECOMMENDATION_ENGINE_VERSION}`) {
    throw new Error("Migrated legacy recommendation id is invalid.");
  }
  if (record.settings?.count !== 1 || record.settings?.portfolio !== "single-uniform") {
    throw new Error("Migrated legacy recommendation settings are invalid.");
  }
  assertWeeklyRecommendationSets(record.recommendations);
  const [expectedFirstSet] = generateLegacyRecommendationNumberSets({ baseDraw });
  if (record.recommendations[0].numbers.join("-") !== expectedFirstSet.join("-")) {
    throw new Error("Migrated legacy recommendation does not preserve the original first set.");
  }
}

function validateRecordForEvaluation(record, actualDraw, drawByRound) {
  validateRecordShape(record, drawByRound);
  if (record.targetDraw !== actualDraw.draw) {
    throw new Error("The result draw does not match the recommendation target.");
  }
  if (Date.parse(record.createdAt) >= getSalesCutoffAt(actualDraw.date).getTime()) {
    throw new Error("The recommendation was created after the target draw sales cutoff.");
  }
}

function validateRecordShape(record, drawByRound) {
  if (!record || typeof record !== "object") {
    throw new Error("Weekly recommendation record must be an object.");
  }
  if (!Number.isInteger(record.baseDraw) || record.targetDraw !== record.baseDraw + 1) {
    throw new Error("Weekly recommendation target must be exactly one draw after its base draw.");
  }
  const baseDraw = drawByRound.get(record.baseDraw);
  if (!baseDraw) {
    throw new Error(`Base draw ${record.baseDraw} is missing from winning data.`);
  }
  if (record.baseDate !== baseDraw.date) {
    throw new Error("Weekly recommendation base date does not match its base draw.");
  }
  if (record.targetDate !== addDaysToIsoDate(baseDraw.date, 7)) {
    throw new Error("Weekly recommendation target date does not match its base draw.");
  }
  const createdAt = parseTimestamp(record.createdAt, "createdAt");
  const expectedSalesCutoffAt = getSalesCutoffAt(record.targetDate);
  if (record.salesCutoffAt !== expectedSalesCutoffAt.toISOString()) {
    throw new Error("Weekly recommendation sales cutoff does not match its target date.");
  }
  if (createdAt.getTime() >= expectedSalesCutoffAt.getTime()) {
    throw new Error("The recommendation was created after the target draw sales cutoff.");
  }
  assertWeeklyRecommendationSets(record.recommendations);

  if (record.engineVersion === LEGACY_RECOMMENDATION_ENGINE_VERSION && record.migration) {
    validateMigratedLegacyRecord(record, baseDraw);
    return;
  }
  if (record.engineVersion !== RECOMMENDATION_ENGINE_VERSION) {
    throw new Error(`Unsupported recommendation engine version: ${record.engineVersion ?? "missing"}.`);
  }
  if (record.seed !== createWeeklySeed(baseDraw)) {
    throw new Error("Weekly recommendation seed does not match its base draw.");
  }
  if (record.id !== `${record.targetDraw}-${RECOMMENDATION_ENGINE_VERSION}`) {
    throw new Error("Weekly recommendation id does not match its target and engine version.");
  }
  if (record.settings?.count !== WEEKLY_RECOMMENDATION_COUNT || record.settings?.portfolio !== "single-uniform") {
    throw new Error("Weekly recommendation settings are invalid.");
  }

  const expected = generateWeeklyRecommendationSets({ baseDraw });
  const actualKeys = record.recommendations.map((item) => item.numbers.join("-")).join("|");
  const expectedKeys = expected.map((item) => item.numbers.join("-")).join("|");
  if (actualKeys !== expectedKeys) {
    throw new Error("Weekly recommendation numbers do not match the deterministic engine output.");
  }
}

function validateAndSortDraws(draws) {
  if (!Array.isArray(draws) || !draws.length) {
    throw new Error("At least one winning draw is required for the weekly cycle.");
  }
  const sorted = [...draws].sort((left, right) => right.draw - left.draw);
  for (let index = 0; index < sorted.length - 1; index += 1) {
    if (sorted[index].draw !== sorted[index + 1].draw + 1) {
      throw new Error(`Winning draw data has a gap between ${sorted[index].draw} and ${sorted[index + 1].draw}.`);
    }
  }
  return sorted;
}

function assertUniqueTargets(records) {
  const targets = records.map((record) => record?.targetDraw);
  if (new Set(targets).size !== targets.length) {
    throw new Error("Weekly recommendation records contain duplicate target draws.");
  }
}

function parseIsoDate(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    throw new Error(`Invalid ISO date: ${dateText}`);
  }
  const date = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) {
    throw new Error(`Invalid ISO date: ${dateText}`);
  }
  return date;
}

function parseTimestamp(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label} timestamp.`);
  }
  return date;
}
