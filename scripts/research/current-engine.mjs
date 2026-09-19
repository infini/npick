import { LOTTO_WINNING_NUMBERS } from "../../data/lotto-data.js";
import { generateWeeklyRecommendationSets } from "../../src/core/recommendation-engine.js";

const ordered = [...LOTTO_WINNING_NUMBERS].sort((left, right) => left.draw - right.draw);
process.stdout.write(JSON.stringify(ordered.map((baseDraw) => generateWeeklyRecommendationSets({ baseDraw })[0].numbers)));
