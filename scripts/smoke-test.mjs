import { LOTTO_WINNING_NUMBERS } from "../data/lotto-data.js";
import { addDaysToIsoDate, advanceWeeklyCycle, getCurrentWeeklyRecord, getLatestEvaluatedWeeklyRecord } from "../src/core/weekly-cycle.js";

const draws = [...LOTTO_WINNING_NUMBERS].sort((left, right) => right.draw - left.draw);
const target = draws[0];
const base = draws[1];
const pendingRecords = advanceWeeklyCycle({
  records: [],
  draws: [base],
  generatedAt: `${addDaysToIsoDate(base.date, 1)}T00:00:00.000Z`,
});
const advancedRecords = advanceWeeklyCycle({
  records: pendingRecords,
  draws: [target, base],
  generatedAt: `${addDaysToIsoDate(target.date, 1)}T00:00:00.000Z`,
});
const evaluated = getLatestEvaluatedWeeklyRecord(advancedRecords);
const current = getCurrentWeeklyRecord(advancedRecords, target);

if (!evaluated || evaluated.targetDraw !== target.draw || evaluated.result.setResults.length !== 1) {
  throw new Error("Expected the previous weekly single-set recommendation to be evaluated.");
}

if (!current || current.targetDraw !== target.draw + 1 || current.recommendations.length !== 1) {
  throw new Error("Expected exactly one recommendation for the next draw.");
}

if (new Set(current.recommendations[0].numbers).size !== 6) {
  throw new Error("Expected the weekly set to contain six distinct numbers.");
}

console.log("Weekly cycle smoke test passed.");
