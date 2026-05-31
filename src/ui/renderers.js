import { renderBall } from "./lotto-balls.js";

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

export function renderFrequencyChart(container, stats) {
  container.innerHTML = stats.numberStats
    .map((item) => {
      const height = Math.max(4, Math.round((item.count / stats.maxCount) * 100));
      return `
        <div class="frequency-cell" title="${item.number}번: ${item.count}회">
          <div class="bar-shell"><div class="bar" style="height: ${height}%"></div></div>
          <span>${item.number}</span>
        </div>
      `;
    })
    .join("");
}

export function renderHistory(container, draws, query) {
  const filtered = draws
    .filter((draw) => {
      if (!query) {
        return true;
      }

      const number = Number(query);
      return draw.draw === number || draw.numbers.includes(number) || draw.bonus === number;
    })
    .slice(0, 24);

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

function strategyLabel(strategy) {
  const labels = {
    balanced: "균형형",
    hot: "빈도형",
    cold: "역발상형",
    fallback: "랜덤 보완",
  };
  return labels[strategy] || strategy;
}
