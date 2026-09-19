import { RANDOM_BASELINE, summarizeLivePerformance } from "../core/recommendation-performance.js?v=15";
import { RECOMMENDATION_ENGINE_VERSION } from "../core/recommendation-engine.js?v=15";

const percent = (value) => value === null ? "-" : `${(value * 100).toFixed(1)}%`;
const mean = (value) => value === null ? "-" : `${value.toFixed(3)}개`;

export function renderPerformance(container, { records, report, latestDraw }) {
  // An older cached app shell may still be active while the new worker installs.
  if (!container) return;
  const live = summarizeLivePerformance(records);
  const aligned = report?.latestDraw === latestDraw && report?.engineVersion === RECOMMENDATION_ENGINE_VERSION;
  const range = live.expectedAverageRange;
  const liveNote = range
    ? `무작위 ${live.count}회 추천의 평균 적중은 95% 범위에서 ${range[0].toFixed(3)}~${range[1].toFixed(3)}개입니다.`
    : "당첨 결과가 발표되면 실제 추천 성적을 비교합니다.";
  const candidates = aligned ? report.candidates : [];
  const holdout = candidates[0]?.holdout;
  const conclusion = !aligned ? "비교 분석 갱신 대기"
    : report.decision.status === "no-validated-improvement" ? "검증된 개선 전략 없음" : "후보 전략 추가 검증 중";

  container.innerHTML = `
    <div class="section-title">
      <h2>추천 성적</h2><span>추첨 전 확정한 ${live.count}회 기준</span>
    </div>
    <table class="performance-table">
      <caption class="visually-hidden">실제 추천과 무작위 이론값 비교</caption>
      <thead><tr><th scope="col">비교 기준</th><th scope="col">평균 적중</th><th scope="col">0개 적중</th><th scope="col">3개 이상</th></tr></thead>
      <tbody>
        <tr><th scope="row">실제 추천</th><td>${mean(live.averageHits)}</td><td>${percent(live.zeroHitRate)}</td><td>${percent(live.prizeRate)}</td></tr>
        <tr class="baseline-row"><th scope="row">무작위 이론값</th><td>${mean(RANDOM_BASELINE.averageHits)}</td><td>${percent(RANDOM_BASELINE.zeroHitRate)}</td><td>${percent(RANDOM_BASELINE.prizeRate)}</td></tr>
      </tbody>
    </table>
    <p class="performance-note">${liveNote}</p>
    <div class="performance-verdict"><strong>${conclusion}</strong><span>현재 추천 방식 유지</span></div>
    ${holdout ? `
      <details class="strategy-comparison">
        <summary>전략별 과거 검증 · ${holdout.fromDraw}~${holdout.toDraw}회</summary>
        <p class="performance-note">각 회차 직전까지의 데이터로 1세트씩 재현한 결과입니다. 실제 추천 실적과는 별개이며, 미래 적중률을 보장하지 않습니다.</p>
        <table class="performance-table">
          <caption class="visually-hidden">최근 ${holdout.count}회 전략별 검증</caption>
          <thead><tr><th scope="col">추천 방식</th><th scope="col">평균 적중</th><th scope="col">0개 적중</th><th scope="col">3개 이상</th></tr></thead>
          <tbody>${candidates.map((candidate) => `
            <tr><th scope="row">${candidate.label}</th><td>${mean(candidate.holdout.averageHits)}</td><td>${percent(candidate.holdout.zeroHitRate)}</td><td>${percent(candidate.holdout.prizeRate)}</td></tr>
          `).join("")}</tbody>
        </table>
      </details>` : ""}
  `;
}
