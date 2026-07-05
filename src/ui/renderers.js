import { renderBall } from "./lotto-balls.js";

const DEFAULT_HISTORY_LIMIT = 5;
const SEARCH_HISTORY_LIMIT = 24;
const DEFAULT_SUMMARY_ROW_SIZE = 3;

export function renderRecommendations(container, recommendations) {
  container.innerHTML = recommendations
    .map(
      (item, index) => `
        <article class="recommendation">
          <div class="recommendation-header">
            <span>#${index + 1}</span>
            <span>${strategyLabel(item.strategy)}</span>
          </div>
          <div class="ball-row" aria-label="추천 번호 ${item.numbers.join(", ")}">
            ${item.numbers.map(renderBall).join("")}
          </div>
          <div class="tags">
            ${item.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
          </div>
        </article>
      `,
    )
    .join("");
}

export function renderRecommendationPlaceholder(container, { title, description }) {
  container.innerHTML = `
    <article class="recommendation recommendation-placeholder">
      <div class="recommendation-header"><span>추천 대기</span></div>
      <strong>${title}</strong>
      <p>${description}</p>
    </article>
  `;
}

export function renderLearningStatus(container, { pendingRecord, latestEvaluatedRecord, feedbackProfile }) {
  const pendingHtml = pendingRecord
    ? `
      <article class="learning-card">
        <span>보관 중인 추천</span>
        <strong>${pendingRecord.targetDraw}회 당첨번호 발표 후 자동 평가</strong>
        <p>${pendingRecord.baseDraw}회까지의 데이터와 ${pendingRecord.historyLength.toLocaleString("ko-KR")}회 분석 범위로 만든 추천입니다.</p>
      </article>
    `
    : `
      <article class="learning-card">
        <span>추천 생성 가능</span>
        <strong>다음 회차 추천을 만들 수 있습니다</strong>
        <p>추천을 만들면 같은 회차가 발표될 때까지 새 번호를 다시 뽑지 않습니다.</p>
      </article>
    `;
  const result = latestEvaluatedRecord?.result;
  const evaluatedHtml = result
    ? `
      <article class="learning-card">
        <span>지난 추천 평가</span>
        <strong>${result.draw}회 최고 ${result.bestHits}/6 · 정확도 ${result.bestAccuracy}% · ${result.bestRank}</strong>
        <p>평균 적중 ${result.averageHits}개. 다음 추천에는 평가된 ${feedbackProfile.evaluatedCount}회 기록이 약하게 반영됩니다.</p>
      </article>
    `
    : `
      <article class="learning-card">
        <span>지난 추천 평가</span>
        <strong>아직 평가된 추천이 없습니다</strong>
        <p>다음 회차 당첨번호가 데이터에 들어오면 보관된 추천을 자동 비교합니다.</p>
      </article>
    `;

  container.innerHTML = `${pendingHtml}${evaluatedHtml}`;
}

export function renderFrequencyChart(container, stats) {
  container.innerHTML = [...stats.numberStats]
    .sort((a, b) => b.count - a.count || a.number - b.number)
    .map((item) => {
      return `
        <div class="frequency-cell" title="${item.number}번: ${item.count}회">
          <span class="frequency-number">${item.number}번</span>
          <strong class="frequency-count">${item.count}회</strong>
        </div>
      `;
    })
    .join("");
}

export function renderNumberSummary(container, items, { limit, rowSize = DEFAULT_SUMMARY_ROW_SIZE }) {
  const numbers = items.slice(0, limit).map((item) => item.number);
  const rows = chunk(numbers, rowSize).map((row) => {
    const rowElement = document.createElement("span");
    rowElement.className = "summary-number-row";
    rowElement.textContent = row.join(", ");
    return rowElement;
  });

  container.replaceChildren(...rows);
}

export function renderHistory(container, draws, query) {
  const normalizedQuery = query.trim();
  const filtered = draws
    .filter((draw) => {
      if (!normalizedQuery) {
        return true;
      }

      const number = Number(normalizedQuery);
      return draw.draw === number || draw.numbers.includes(number) || draw.bonus === number;
    })
    .slice(0, normalizedQuery ? SEARCH_HISTORY_LIMIT : DEFAULT_HISTORY_LIMIT);

  container.innerHTML = filtered
    .map(
      (draw) => `
        <article class="history-item">
          <div class="draw-meta">
            <strong>${draw.draw}회</strong>
            <span>${draw.date}</span>
          </div>
          <div class="ball-row">
            ${draw.numbers.map(renderBall).join("")}
            <span class="bonus-plus">+</span>
            ${renderBall(draw.bonus)}
          </div>
        </article>
      `,
    )
    .join("");
}

export function renderMissingData(container) {
  container.innerHTML = `
    <article class="recommendation">
      <div class="recommendation-header"><span>데이터 없음</span></div>
      <p class="notice">data/lotto-data.js 파일을 생성해야 합니다. 터미널에서 node scripts/update-lotto-data.mjs 를 실행하세요.</p>
    </article>
  `;
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function strategyLabel(strategy) {
  const labels = {
    balanced: "균형형",
    hot: "빈도형",
    cold: "역발상형",
    fallback: "랜덤 보완",
  };
  return labels[strategy] || strategy;
}
