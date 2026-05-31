(function () {
  const draws = Array.isArray(window.LOTTO_WINNING_NUMBERS) ? window.LOTTO_WINNING_NUMBERS : [];
  const meta = window.LOTTO_DATA_META || {};

  const state = {
    seed: makeSeed(),
    count: 3,
  };

  const elements = {
    recommendations: document.querySelector("#recommendations"),
    generateButton: document.querySelector("#generateButton"),
    generateTopButton: document.querySelector("#generateTopButton"),
    refreshSeedButton: document.querySelector("#refreshSeedButton"),
    strategySelect: document.querySelector("#strategySelect"),
    windowRange: document.querySelector("#windowRange"),
    windowLabel: document.querySelector("#windowLabel"),
    seedLabel: document.querySelector("#seedLabel"),
    avoidRecentInput: document.querySelector("#avoidRecentInput"),
    strictBalanceInput: document.querySelector("#strictBalanceInput"),
    excludePastInput: document.querySelector("#excludePastInput"),
    latestDrawMetric: document.querySelector("#latestDrawMetric"),
    drawCountMetric: document.querySelector("#drawCountMetric"),
    hotMetric: document.querySelector("#hotMetric"),
    overdueMetric: document.querySelector("#overdueMetric"),
    frequencyChart: document.querySelector("#frequencyChart"),
    chartCaption: document.querySelector("#chartCaption"),
    historySearch: document.querySelector("#historySearch"),
    historyList: document.querySelector("#historyList"),
    countButtons: [...document.querySelectorAll("[data-count]")],
  };

  init();

  function init() {
    if (!draws.length) {
      renderMissingData();
      return;
    }

    draws.sort((a, b) => b.draw - a.draw);
    elements.windowRange.max = String(draws.length);
    elements.windowRange.value = String(Math.min(260, draws.length));
    bindEvents();
    renderAll();
    generateRecommendations();
  }

  function bindEvents() {
    elements.generateButton.addEventListener("click", generateRecommendations);
    elements.generateTopButton.addEventListener("click", generateRecommendations);
    elements.refreshSeedButton.addEventListener("click", () => {
      state.seed = makeSeed();
      generateRecommendations();
    });
    elements.strategySelect.addEventListener("change", generateRecommendations);
    elements.windowRange.addEventListener("input", () => {
      renderAll();
      generateRecommendations();
    });
    elements.avoidRecentInput.addEventListener("change", generateRecommendations);
    elements.strictBalanceInput.addEventListener("change", generateRecommendations);
    elements.excludePastInput.addEventListener("change", generateRecommendations);
    elements.historySearch.addEventListener("input", renderHistory);
    elements.countButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.count = Number(button.dataset.count);
        elements.countButtons.forEach((item) => item.classList.toggle("is-active", item === button));
        generateRecommendations();
      });
    });
  }

  function renderAll() {
    const history = getHistory();
    const stats = computeStats(history);
    const latest = draws[0];

    elements.seedLabel.textContent = state.seed;
    elements.windowLabel.textContent = `최근 ${history.length.toLocaleString("ko-KR")}회`;
    elements.chartCaption.textContent = `최근 ${history.length.toLocaleString("ko-KR")}회 기준`;
    elements.latestDrawMetric.textContent = latest ? `${latest.draw}회` : "-";
    elements.drawCountMetric.textContent = `${draws.length.toLocaleString("ko-KR")}회`;
    elements.hotMetric.textContent = stats.hotNumbers
      .slice(0, 3)
      .map((item) => `${item.number}번`)
      .join(", ");
    elements.overdueMetric.textContent = stats.overdueNumbers
      .slice(0, 3)
      .map((item) => `${item.number}번`)
      .join(", ");

    renderFrequencyChart(stats);
    renderHistory();
  }

  function generateRecommendations() {
    const history = getHistory();
    const stats = computeStats(history);
    const options = readOptions();
    const rng = createRng(`${state.seed}:${Date.now()}:${options.strategy}:${history.length}`);
    const recommendations = [];
    const used = new Set();

    let attempts = 0;
    while (recommendations.length < state.count && attempts < state.count * 900) {
      attempts += 1;
      const strategy = options.strategy === "mixed" ? pickMixedStrategy(recommendations.length) : options.strategy;
      const numbers = buildCandidate(stats, history, strategy, options, rng);
      const key = numbers.join("-");

      if (!used.has(key) && validateCandidate(numbers, stats, history, options)) {
        used.add(key);
        recommendations.push(describeCandidate(numbers, stats, strategy));
      }
    }

    while (recommendations.length < state.count) {
      const numbers = fallbackCandidate(rng);
      const key = numbers.join("-");
      if (!used.has(key)) {
        used.add(key);
        recommendations.push(describeCandidate(numbers, stats, "랜덤 보완"));
      }
    }

    state.seed = makeSeed();
    elements.seedLabel.textContent = state.seed;
    renderRecommendations(recommendations);
  }

  function readOptions() {
    return {
      strategy: elements.strategySelect.value,
      avoidRecent: elements.avoidRecentInput.checked,
      strictBalance: elements.strictBalanceInput.checked,
      excludePast: elements.excludePastInput.checked,
    };
  }

  function getHistory() {
    return draws.slice(0, Number(elements.windowRange.value));
  }

  function computeStats(history) {
    const counts = new Map();
    const lastSeen = new Map();
    const sums = [];
    const historicalKeys = new Set();

    for (let number = 1; number <= 45; number += 1) {
      counts.set(number, 0);
      lastSeen.set(number, Number.POSITIVE_INFINITY);
    }

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

    const numberStats = Array.from({ length: 45 }, (_, index) => {
      const number = index + 1;
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

  function buildCandidate(stats, history, strategy, options, rng) {
    const selected = [];
    const recentNumbers = new Set(history.slice(0, 5).flatMap((draw) => draw.numbers));

    while (selected.length < 6) {
      const candidates = stats.numberStats
        .filter((item) => !selected.includes(item.number))
        .map((item) => ({
          number: item.number,
          weight: getWeight(item, stats, strategy, recentNumbers, options, rng),
        }));

      const picked = weightedPick(candidates, rng);
      selected.push(picked.number);
    }

    return selected.sort((a, b) => a - b);
  }

  function getWeight(item, stats, strategy, recentNumbers, options, rng) {
    const frequencyScore = normalize(item.count, stats.minCount, stats.maxCount);
    const coldScore = 1 - frequencyScore;
    const overdueScore = normalize(item.gap, 0, stats.maxGap);
    const balancedScore = 1 - Math.abs(0.5 - frequencyScore) * 1.55;
    let weight;

    if (strategy === "hot") {
      weight = 0.65 * frequencyScore + 0.2 * overdueScore + 0.15 * rng();
    } else if (strategy === "cold") {
      weight = 0.48 * coldScore + 0.42 * overdueScore + 0.1 * rng();
    } else {
      weight = 0.42 * Math.max(0.08, balancedScore) + 0.28 * frequencyScore + 0.2 * overdueScore + 0.1 * rng();
    }

    if (options.avoidRecent && recentNumbers.has(item.number)) {
      weight *= 0.42;
    }

    return Math.max(0.001, weight);
  }

  function validateCandidate(numbers, stats, history, options) {
    if (numbers.length !== 6 || new Set(numbers).size !== 6) {
      return false;
    }

    if (options.excludePast && stats.historicalKeys.has(numbers.join("-"))) {
      return false;
    }

    const total = sum(numbers);
    if (total < stats.sumLow || total > stats.sumHigh) {
      return false;
    }

    if (longestConsecutiveRun(numbers) > 3) {
      return false;
    }

    if (!options.strictBalance) {
      return true;
    }

    const oddCount = numbers.filter((number) => number % 2 === 1).length;
    const lowCount = numbers.filter((number) => number <= 22).length;
    const decadeMax = Math.max(...bucketCounts(numbers));

    return oddCount >= 2 && oddCount <= 4 && lowCount >= 2 && lowCount <= 4 && decadeMax <= 3;
  }

  function describeCandidate(numbers, stats, strategy) {
    const hotSet = new Set(stats.hotNumbers.slice(0, 12).map((item) => item.number));
    const coldSet = new Set(stats.coldNumbers.slice(0, 12).map((item) => item.number));
    const overdueSet = new Set(stats.overdueNumbers.slice(0, 12).map((item) => item.number));
    const oddCount = numbers.filter((number) => number % 2 === 1).length;
    const lowCount = numbers.filter((number) => number <= 22).length;

    return {
      numbers,
      strategy,
      tags: [
        `합계 ${sum(numbers)}`,
        `홀짝 ${oddCount}:${6 - oddCount}`,
        `저고 ${lowCount}:${6 - lowCount}`,
        `핫 ${countMatches(numbers, hotSet)}`,
        `미출현 ${countMatches(numbers, overdueSet)}`,
        `콜드 ${countMatches(numbers, coldSet)}`,
      ],
    };
  }

  function renderRecommendations(recommendations) {
    elements.recommendations.innerHTML = recommendations
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

  function renderFrequencyChart(stats) {
    elements.frequencyChart.innerHTML = stats.numberStats
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

  function renderHistory() {
    const query = elements.historySearch.value.trim();
    const filtered = draws
      .filter((draw) => {
        if (!query) {
          return true;
        }
        const number = Number(query);
        return draw.draw === number || draw.numbers.includes(number) || draw.bonus === number;
      })
      .slice(0, 24);

    elements.historyList.innerHTML = filtered
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

  function renderBall(number) {
    return `<span class="ball ${ballColor(number)}">${number}</span>`;
  }

  function renderMissingData() {
    elements.recommendations.innerHTML = `
      <article class="recommendation">
        <div class="recommendation-header"><span>데이터 없음</span></div>
        <p class="notice">data/lotto-data.js 파일을 생성해야 합니다. 터미널에서 node scripts/update-lotto-data.mjs 를 실행하세요.</p>
      </article>
    `;
  }

  function fallbackCandidate(rng) {
    const picked = new Set();
    while (picked.size < 6) {
      picked.add(1 + Math.floor(rng() * 45));
    }
    return [...picked].sort((a, b) => a - b);
  }

  function weightedPick(candidates, rng) {
    const total = candidates.reduce((acc, item) => acc + item.weight, 0);
    let cursor = rng() * total;
    for (const item of candidates) {
      cursor -= item.weight;
      if (cursor <= 0) {
        return item;
      }
    }
    return candidates[candidates.length - 1];
  }

  function pickMixedStrategy(index) {
    return ["balanced", "hot", "cold"][index % 3];
  }

  function strategyLabel(strategy) {
    const labels = {
      balanced: "균형형",
      hot: "빈도형",
      cold: "역발상형",
      "랜덤 보완": "랜덤 보완",
    };
    return labels[strategy] || strategy;
  }

  function ballColor(number) {
    if (number <= 10) return "yellow";
    if (number <= 20) return "blue";
    if (number <= 30) return "red";
    if (number <= 40) return "gray";
    return "green";
  }

  function normalize(value, min, max) {
    if (max === min) {
      return 0.5;
    }
    return (value - min) / (max - min);
  }

  function quantile(sortedValues, ratio) {
    if (!sortedValues.length) {
      return null;
    }
    return sortedValues[Math.floor((sortedValues.length - 1) * ratio)];
  }

  function sum(numbers) {
    return numbers.reduce((acc, number) => acc + number, 0);
  }

  function countMatches(numbers, targetSet) {
    return numbers.filter((number) => targetSet.has(number)).length;
  }

  function bucketCounts(numbers) {
    const buckets = [0, 0, 0, 0, 0];
    numbers.forEach((number) => {
      buckets[Math.min(4, Math.floor((number - 1) / 10))] += 1;
    });
    return buckets;
  }

  function longestConsecutiveRun(numbers) {
    let longest = 1;
    let current = 1;
    for (let index = 1; index < numbers.length; index += 1) {
      if (numbers[index] === numbers[index - 1] + 1) {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 1;
      }
    }
    return longest;
  }

  function createRng(seedText) {
    let seed = 2166136261;
    for (let index = 0; index < seedText.length; index += 1) {
      seed ^= seedText.charCodeAt(index);
      seed = Math.imul(seed, 16777619);
    }
    return function rng() {
      seed += 0x6d2b79f5;
      let value = seed;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeSeed() {
    const bytes = new Uint32Array(1);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(bytes);
      return bytes[0].toString(36).slice(0, 7);
    }
    return Math.floor(Math.random() * 0xffffffff).toString(36).slice(0, 7);
  }
})();
