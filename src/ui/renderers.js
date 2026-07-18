import { renderBall } from "./lotto-balls.js?v=13";

const DEFAULT_HISTORY_LIMIT = 5;
const SEARCH_HISTORY_LIMIT = 24;
const DEFAULT_SUMMARY_ROW_SIZE = 3;

export function renderRecommendations(container, recommendations, { targetDraw = null } = {}) {
  container.innerHTML = recommendations
    .map(
      (item, index) => `
        <article class="recommendation">
          <div class="recommendation-header">
            <span>세트 ${index + 1}</span>
            <span>${targetDraw ? `${targetDraw}회 추첨 대기` : strategyLabel(item.strategy)}</span>
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

export function renderWeeklyCycleStatus(
  container,
  { currentRecord, latestEvaluatedRecord, summary, cycleStatus, dataMeta, weeklyMeta },
) {
  const currentHtml = currentRecord
    ? `
      <article class="learning-card">
        <span>이번 주 추천 확정</span>
        <strong>${currentRecord.targetDraw}회 · 정확히 3세트</strong>
        <p>${currentRecord.targetDate} 추첨용으로 생성됐으며 세트끼리 번호가 겹치지 않습니다. 결과 발표 전에는 다시 생성하지 않습니다.</p>
      </article>
    `
    : `
      <article class="learning-card">
        <span>이번 주 추천 상태</span>
        <strong>${cycleStatus.title}</strong>
        <p>${cycleStatus.description}</p>
      </article>
    `;
  const result = latestEvaluatedRecord?.result;
  const evaluatedHtml = result
    ? `
      <article class="learning-card weekly-evaluation-card">
        <span>지난주 3세트 평가</span>
        <strong>${result.draw}회 · 최고 ${result.bestHits}개 · 평균 ${result.averageHits}개</strong>
        <div class="winning-row" aria-label="${result.draw}회 당첨번호">
          ${result.winningNumbers.map(renderBall).join("")}
          <span class="bonus-plus">+</span>
          ${renderBall(result.bonus)}
        </div>
        <div class="weekly-result-list">
          ${result.setResults.map(renderWeeklySetResult).join("")}
        </div>
      </article>
    `
    : `
      <article class="learning-card">
        <span>지난주 3세트 평가</span>
        <strong>아직 평가된 주간 추천이 없습니다</strong>
        <p>이번 주 3세트의 당첨번호가 갱신되면 각 세트별 적중 번호와 등수를 표시합니다.</p>
      </article>
    `;
  const summaryHtml = `
    <article class="learning-card">
      <span>누적 주간 분석</span>
      <strong>${summary.evaluatedWeeks}주 · ${summary.evaluatedSets}세트 평가</strong>
      <p>세트당 평균 ${summary.averageHitsPerSet}개 · 3개 이상 ${summary.prizeSetCount}세트 · 당첨 주차 ${summary.prizeWeekCount}주 · 최고 ${summary.bestHits}개</p>
      <p class="data-version">당첨 데이터 ${dataMeta?.latestDraw ?? "-"}회 · 주간 파일 ${weeklyMeta?.latestBaseDraw ?? "-"}회 기준</p>
    </article>
  `;

  container.innerHTML = `${currentHtml}${evaluatedHtml}${summaryHtml}`;
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
    "weekly-disjoint-random": "주간 분산 랜덤",
  };
  return labels[strategy] || strategy;
}

function renderWeeklySetResult(result) {
  const matched = result.matchedNumbers.length ? result.matchedNumbers.join(", ") : "없음";
  const bonus = result.bonusHit ? " · 보너스 번호 포함" : "";
  return `
    <div class="weekly-result-row">
      <strong>세트 ${result.index} · ${result.hitCount}개 적중 · ${result.rank}</strong>
      <p>적중 번호 ${matched}${bonus}</p>
    </div>
  `;
}
