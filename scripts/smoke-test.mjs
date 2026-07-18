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

if (!evaluated || evaluated.targetDraw !== target.draw || evaluated.result.setResults.length !== 3) {
  throw new Error("Expected the previous weekly three-set recommendation to be evaluated.");
}

if (!current || current.targetDraw !== target.draw + 1 || current.recommendations.length !== 3) {
  throw new Error("Expected exactly three recommendations for the next draw.");
}

if (new Set(current.recommendations.flatMap((item) => item.numbers)).size !== 18) {
  throw new Error("Expected all three weekly sets to use distinct numbers.");
}

console.log("Weekly cycle smoke test passed.");
