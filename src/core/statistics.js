import { createNumberRange, quantile, sum } from "./number-utils.js";

export function computeStats(history) {
  const counts = new Map();
  const lastSeen = new Map();
  const sums = [];
  const historicalKeys = new Set();

  createNumberRange().forEach((number) => {
    counts.set(number, 0);
    lastSeen.set(number, Number.POSITIVE_INFINITY);
  });

  history.forEach((draw, index) => {
    const sorted = [...draw.numbers].sort((a, b) => a - b);
    historicalKeys.add(sorted.join("-"));
    sums.push(sum(sorted));

    sorted.forEach((number) => {
      counts.set(number, counts.get(number) + 1);
      if (lastSeen.get(number) === Number.POSITIVE_INFINITY) {
        lastSeen.set(number, index);
      }
    });
  });

  const numberStats = createNumberRange().map((number) => {
    const count = counts.get(number);
    const gap = lastSeen.get(number) === Number.POSITIVE_INFINITY ? history.length : lastSeen.get(number);
    return { number, count, gap };
  });

  const maxCount = Math.max(...numberStats.map((item) => item.count));
  const minCount = Math.min(...numberStats.map((item) => item.count));
  const maxGap = Math.max(...numberStats.map((item) => item.gap));
  const sortedSums = [...sums].sort((a, b) => a - b);

  return {
    history,
    numberStats,
    historicalKeys,
    maxCount,
    minCount,
    maxGap,
    sumLow: quantile(sortedSums, 0.18) || 90,
    sumHigh: quantile(sortedSums, 0.82) || 190,
    hotNumbers: [...numberStats].sort((a, b) => b.count - a.count || a.number - b.number),
    coldNumbers: [...numberStats].sort((a, b) => a.count - b.count || a.number - b.number),
    overdueNumbers: [...numberStats].sort((a, b) => b.gap - a.gap || a.number - b.number),
  };
}
