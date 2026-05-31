import { LOTTO_WINNING_NUMBERS } from "../data/lotto-data.js";
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

console.log("Smoke test passed.");
