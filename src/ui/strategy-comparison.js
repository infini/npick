import { HOT104_ENGINE_VERSION, HOT104_FIRST_TARGET } from "../core/hot104-engine.js?v=16";
import { summarizePairedComparison } from "../core/recommendation-comparison.js?v=16";

const percent = (value) => value === null ? "-" : `${(value * 100).toFixed(1)}%`;
const mean = (value) => value === null ? "-" : `${value.toFixed(3)}개`;

export function renderStrategyComparison(records) {
  const summary = summarizePairedComparison(records);
  const current = records.find((record) => record.status === "pending");
  const active = current?.engineVersion === HOT104_ENGINE_VERSION;
  const status = active ? `${current.targetDraw}회 · 최근 104회 최다 출현`
    : `${HOT104_FIRST_TARGET}회부터 · 최근 104회 최다 출현`;
  const range = summary.pairs.length
    ? `${summary.pairs.at(-1).draw}~${summary.pairs[0].draw}회 · 같은 회차 ${summary.pairs.length}회`
    : "전환 후 평가 대기";
  return `
    <div class="strategy-live-comparison">
      <div class="section-title"><h3>방식별 비교</h3><span>${range}</span></div>
      <p class="performance-note">${status} · 실험 적용</p>
      <table class="performance-table">
        <caption class="visually-hidden">전환 후 최근 52회 이내 동일 회차의 사전 예측 비교</caption>
        <thead><tr><th scope="col">추천 방식</th><th scope="col">평균 적중</th><th scope="col">0개 적중</th><th scope="col">3개 이상</th></tr></thead>
        <tbody>
          ${[["104회 빈도", summary.hot104], ["기존 무작위", summary.random]].map(([label, result]) => `
            <tr><th scope="row">${label}</th><td>${mean(result.averageHits)}</td><td>${percent(result.zeroHitRate)}</td><td>${percent(result.prizeRate)}</td></tr>
          `).join("")}
        </tbody>
      </table>
      <p class="performance-note">최근 52회 이내 · 개선 효과 미검증${summary.pairs.length ?
        ` · 적중 수 기준 ${summary.wins}승 ${summary.ties}무 ${summary.losses}패` : ""}</p>
      ${summary.pairs.length ? `
        <details class="strategy-comparison">
          <summary>회차별 비교</summary>
          <table class="performance-table">
            <caption class="visually-hidden">회차별 두 방식의 적중 수</caption>
            <thead><tr><th scope="col">회차</th><th scope="col">104회 빈도</th><th scope="col">기존 무작위</th></tr></thead>
            <tbody>${summary.pairs.map((pair) => `<tr><th scope="row">${pair.draw}회</th><td>${pair.hot104}개</td><td>${pair.random}개</td></tr>`).join("")}</tbody>
          </table>
        </details>` : ""}
    </div>`;
}
