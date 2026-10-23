import { assertWeeklyRecommendationSets } from "./recommendation-engine.js?v=16";
import { createNumberRange, sum } from "./number-utils.js?v=16";

export const HOT104_ENGINE_VERSION = "weekly-hot104-v3";
export const HOT104_WINDOW = 104;
export const HOT104_FIRST_TARGET = 1248;

export function createHot104Seed(baseDraw) {
  return `${HOT104_ENGINE_VERSION}:${baseDraw.draw}:104:number-asc`;
}

export function getHot104Window(baseDraw) {
  return { fromDraw: baseDraw.draw - HOT104_WINDOW + 1, toDraw: baseDraw.draw, count: HOT104_WINDOW };
}

export function generateHot104Recommendations({ baseDraw, draws }) {
  if (!Array.isArray(draws) || !Number.isInteger(baseDraw?.draw)) {
    throw new Error("Hot104 requires a base draw and winning history.");
  }
  const history = draws.filter((draw) => draw.draw <= baseDraw.draw)
    .sort((left, right) => right.draw - left.draw).slice(0, HOT104_WINDOW);
  if (history.length !== HOT104_WINDOW || history.some((draw, index) => draw.draw !== baseDraw.draw - index)) {
    throw new Error("Hot104 requires exactly 104 contiguous past draws ending at its base draw.");
  }
  const counts = Array(46).fill(0);
  for (const draw of history) {
    assertWeeklyRecommendationSets([{ numbers: draw.numbers }]);
    draw.numbers.forEach((number) => { counts[number] += 1; });
  }
  const numbers = createNumberRange().sort((left, right) => counts[right] - counts[left] || left - right)
    .slice(0, 6).sort((left, right) => left - right);
  const odd = numbers.filter((number) => number % 2).length;
  const low = numbers.filter((number) => number <= 22).length;
  return [{ numbers, strategy: "weekly-hot-104", tags: [
    "최근 104회 최다 출현", `합계 ${sum(numbers)}`, `홀짝 ${odd}:${6 - odd}`, `저고 ${low}:${6 - low}`,
  ] }];
}

export function assertHot104Record(record, baseDraw, draws) {
  const settings = record.settings;
  if (record.targetDraw < HOT104_FIRST_TARGET || record.id !== `${record.targetDraw}-${HOT104_ENGINE_VERSION}` ||
      record.seed !== createHot104Seed(baseDraw)) {
    throw new Error("Hot104 record has an invalid version, activation draw or seed.");
  }
  if (settings?.count !== 1 || settings.portfolio !== "single-hot-104" ||
      settings.window !== HOT104_WINDOW || settings.tieBreak !== "number-asc") {
    throw new Error("Hot104 settings are invalid.");
  }
  const window = getHot104Window(baseDraw);
  if (Object.entries(window).some(([key, value]) => record.analysisWindow?.[key] !== value)) {
    throw new Error("Hot104 analysis window does not match its base draw.");
  }
  const expected = generateHot104Recommendations({ baseDraw, draws });
  if (record.recommendations[0].numbers.join("-") !== expected[0].numbers.join("-")) {
    throw new Error("Hot104 numbers do not match the deterministic engine output.");
  }
}
