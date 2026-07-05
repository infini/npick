import { LOTTO_PICK_COUNT } from "./number-utils.js";

const BASE_HIT_RATE = LOTTO_PICK_COUNT / 45;
const FEEDBACK_RECORD_LIMIT = 12;
const MAX_NUMBER_MULTIPLIER = 1.18;
const MIN_NUMBER_MULTIPLIER = 0.88;

export function evaluateRecommendationRecords(records, draws) {
  const drawByRound = new Map(draws.map((draw) => [draw.draw, draw]));

  return records.map((record) => {
    if (record.status === "evaluated") {
      return record;
    }

    const actualDraw = drawByRound.get(record.targetDraw);
    if (!actualDraw) {
      return record;
    }

    return {
      ...record,
      status: "evaluated",
      result: evaluateRecommendationRecord(record, actualDraw),
    };
  });
}

export function evaluateRecommendationRecord(record, actualDraw) {
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
      accuracy: Math.round((hitCount / LOTTO_PICK_COUNT) * 100),
      rank: getPrizeRank(hitCount, bonusHit),
    };
  });

  const bestResult = [...setResults].sort((a, b) => b.hitCount - a.hitCount || Number(b.bonusHit) - Number(a.bonusHit))[0];
  const averageHits = setResults.reduce((total, result) => total + result.hitCount, 0) / Math.max(1, setResults.length);

  return {
    draw: actualDraw.draw,
    date: actualDraw.date,
    winningNumbers: actualDraw.numbers,
    bonus: actualDraw.bonus,
    setResults,
    bestHits: bestResult?.hitCount || 0,
    bestAccuracy: bestResult?.accuracy || 0,
    bestRank: bestResult?.rank || getPrizeRank(0, false),
    averageHits: Number(averageHits.toFixed(1)),
  };
}

export function createFeedbackProfile(records) {
  const evaluatedRecords = records.filter((record) => record.status === "evaluated" && record.result).slice(0, FEEDBACK_RECORD_LIMIT);
  const numberResults = new Map();

  evaluatedRecords.forEach((record) => {
    const winningSet = new Set(record.result.winningNumbers);

    record.recommendations.forEach((recommendation) => {
      recommendation.numbers.forEach((number) => {
        const result = numberResults.get(number) || { selected: 0, hits: 0 };
        result.selected += 1;
        result.hits += winningSet.has(number) ? 1 : 0;
        numberResults.set(number, result);
      });
    });
  });

  const numberMultipliers = {};
  numberResults.forEach((result, number) => {
    const hitRate = result.hits / Math.max(1, result.selected);
    const confidence = Math.min(result.selected, 4) / 4;
    const multiplier = 1 + (hitRate - BASE_HIT_RATE) * confidence * 0.5;
    numberMultipliers[number] = clamp(multiplier, MIN_NUMBER_MULTIPLIER, MAX_NUMBER_MULTIPLIER);
  });

  return {
    evaluatedCount: evaluatedRecords.length,
    numberMultipliers,
  };
}

export function getLatestPendingRecord(records, latestDraw) {
  return records.find((record) => record.status === "pending" && record.targetDraw > latestDraw.draw) || null;
}

export function getLatestEvaluatedRecord(records) {
  return records.find((record) => record.status === "evaluated" && record.result) || null;
}

export function pruneRecommendationRecords(records, limit = FEEDBACK_RECORD_LIMIT) {
  return [...records]
    .sort((a, b) => b.targetDraw - a.targetDraw || String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

export function getPrizeRank(hitCount, bonusHit) {
  if (hitCount === 6) {
    return "1등";
  }

  if (hitCount === 5 && bonusHit) {
    return "2등";
  }

  if (hitCount === 5) {
    return "3등";
  }

  if (hitCount === 4) {
    return "4등";
  }

  if (hitCount === 3) {
    return "5등";
  }

  return "미당첨";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
