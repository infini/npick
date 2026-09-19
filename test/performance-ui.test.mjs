import assert from "node:assert/strict";
import test from "node:test";
import { renderPerformance } from "../src/ui/performance.js";
import { RECOMMENDATION_ANALYSIS } from "../data/recommendation-analysis.js";

test("performance view tolerates the old shell during a service worker upgrade", () => {
  assert.doesNotThrow(() => renderPerformance(null, { records: [], report: null, latestDraw: 1 }));
});

test("stale reports hide historical comparisons without hiding actual performance", () => {
  const container = { innerHTML: "" };
  renderPerformance(container, {
    records: [], report: RECOMMENDATION_ANALYSIS, latestDraw: RECOMMENDATION_ANALYSIS.latestDraw + 1,
  });
  assert.match(container.innerHTML, /비교 분석 갱신 대기/);
  assert.match(container.innerHTML, /실제 추천/);
  assert.doesNotMatch(container.innerHTML, /<details/);
});
