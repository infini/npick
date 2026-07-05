import { LOTTO_WINNING_NUMBERS } from "../data/lotto-data.js";
import {
  createFeedbackProfile,
  evaluateRecommendationRecords,
  getLatestPendingRecord,
} from "../src/core/recommendation-learning.js";
import { generateRecommendationSets } from "../src/core/recommendation-engine.js";
import { computeStats } from "../src/core/statistics.js";

const draws = [...LOTTO_WINNING_NUMBERS].sort((a, b) => b.draw - a.draw);
const history = draws.slice(0, 260);
const stats = computeStats(history);
const recommendations = generateRecommendationSets({
  history,
  stats,
  count: 5,
  strategy: "mixed",
  options: {
    avoidRecent: true,
    strictBalance: true,
    excludePast: true,
  },
  seed: "smoke",
  salt: 1,
});

if (recommendations.length !== 5) {
  throw new Error(`Expected 5 recommendations, got ${recommendations.length}`);
}

recommendations.forEach((recommendation) => {
  if (recommendation.numbers.length !== 6 || new Set(recommendation.numbers).size !== 6) {
    throw new Error(`Invalid recommendation: ${recommendation.numbers.join(",")}`);
  }
});

const previousDraw = draws[1];
const latestDraw = draws[0];
const pendingRecord = {
  id: "smoke-learning",
  status: "pending",
  createdAt: "2026-01-01T00:00:00.000Z",
  baseDraw: previousDraw.draw,
  targetDraw: latestDraw.draw,
  recommendations,
};
const evaluatedRecords = evaluateRecommendationRecords([pendingRecord], draws);
const evaluatedRecord = evaluatedRecords[0];

if (evaluatedRecord.status !== "evaluated" || evaluatedRecord.result.draw !== latestDraw.draw) {
  throw new Error("Expected pending recommendation to be evaluated against the latest draw.");
}

if (evaluatedRecord.result.setResults.length !== recommendations.length) {
  throw new Error("Expected one evaluation result per recommendation set.");
}

const feedbackProfile = createFeedbackProfile(evaluatedRecords);
if (feedbackProfile.evaluatedCount !== 1) {
  throw new Error("Expected evaluated recommendations to create one feedback record.");
}

const futurePendingRecord = {
  ...pendingRecord,
  id: "smoke-pending",
  targetDraw: latestDraw.draw + 1,
};

if (!getLatestPendingRecord([futurePendingRecord], latestDraw)) {
  throw new Error("Expected a future target draw to remain pending.");
}

console.log("Smoke test passed.");
