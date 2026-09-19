import { generateWeeklyRecommendationSets } from "../../src/core/recommendation-engine.js";
import { createRng } from "../../src/core/random.js";

const numbers = Array.from({ length: 45 }, (_, index) => index + 1);

// Fixed candidates and tie-break seeds: never search seeds against known results.
export const STRATEGIES = Object.freeze([
  { id: "current", label: "현재 추천", kind: "current" },
  { id: "hot-52", label: "최근 52회 최다 출현", kind: "hot", window: 52 },
  { id: "hot-260", label: "최근 260회 최다 출현", kind: "hot", window: 260 },
  { id: "hot-all", label: "전체 최다 출현", kind: "hot", window: Infinity },
  { id: "cold-260", label: "최근 260회 최소 출현", kind: "cold", window: 260 },
  { id: "overdue", label: "최장 미출현", kind: "overdue", window: Infinity },
  { id: "blend", label: "빈도·미출현 혼합", kind: "blend", window: 260 },
  { id: "balanced", label: "홀짝·합계 균형", kind: "balanced" },
  { id: "exclude-last", label: "직전 당첨번호 제외", kind: "exclude-last" },
]);

export function predictNumbers(strategy, history) {
  if (!history.length) throw new Error("Prediction requires past draws.");
  const baseDraw = history.at(-1);
  if (strategy.kind === "current") return generateWeeklyRecommendationSets({ baseDraw })[0].numbers;
  const rng = createRng(`npick-analysis-v1:${strategy.id}:${baseDraw.draw}`);
  const candidates = numbers.map((number) => ({ number, tie: rng() }));
  if (strategy.kind === "balanced" || strategy.kind === "exclude-last") {
    const pool = strategy.kind === "exclude-last"
      ? candidates.filter((item) => !baseDraw.numbers.includes(item.number)) : candidates;
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      const selected = pool.map((item) => ({ ...item, tie: rng() }))
        .sort((left, right) => right.tie - left.tie).slice(0, 6).map((item) => item.number);
      const odd = selected.filter((number) => number % 2).length;
      const low = selected.filter((number) => number <= 22).length;
      const sum = selected.reduce((total, number) => total + number, 0);
      if (strategy.kind !== "balanced" || (odd >= 2 && odd <= 4 && low >= 2 && low <= 4 && sum >= 100 && sum <= 180)) {
        return selected.sort((left, right) => left - right);
      }
    }
    throw new Error("Balanced candidate sampling exhausted.");
  }
  const selectedHistory = history.slice(-strategy.window);
  const counts = Array(46).fill(0);
  const gaps = Array(46).fill(selectedHistory.length);
  selectedHistory.forEach((draw, index) => draw.numbers.forEach((number) => {
    counts[number] += 1;
    gaps[number] = selectedHistory.length - index - 1;
  }));
  const expected = selectedHistory.length * 6 / 45;
  const deviation = Math.sqrt(selectedHistory.length * (6 / 45) * (39 / 45));
  function score(number) {
    if (strategy.kind === "hot") return counts[number];
    if (strategy.kind === "cold") return -counts[number];
    if (strategy.kind === "overdue") return gaps[number];
    if (strategy.kind === "blend") return (counts[number] - expected) / deviation + Math.min(gaps[number], 30) / 10;
    throw new Error(`Unknown strategy: ${strategy.kind}`);
  }
  return candidates.sort((left, right) => score(right.number) - score(left.number) || right.tie - left.tie)
    .slice(0, 6).map((item) => item.number).sort((left, right) => left - right);
}
