import { LOTTO_WINNING_NUMBERS } from "../data/lotto-data.js";
import { generateRecommendationSets } from "./core/recommendation-engine.js";
import { makeSeed } from "./core/random.js";
import { computeStats } from "./core/statistics.js";
import { initInstallPrompt } from "./pwa/install-prompt.js";
import { registerServiceWorker } from "./pwa/service-worker-registration.js";
import {
  renderFrequencyChart,
  renderHistory,
  renderMissingData,
  renderRecommendations,
} from "./ui/renderers.js";

const draws = Array.isArray(LOTTO_WINNING_NUMBERS) ? [...LOTTO_WINNING_NUMBERS] : [];

const state = {
  seed: makeSeed(),
  count: 3,
};

const elements = {
  recommendations: document.querySelector("#recommendations"),
  generateButton: document.querySelector("#generateButton"),
  generateTopButton: document.querySelector("#generateTopButton"),
  refreshSeedButton: document.querySelector("#refreshSeedButton"),
  installButton: document.querySelector("#installButton"),
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
  registerServiceWorker();
  initInstallPrompt(elements.installButton);

  if (!draws.length) {
    renderMissingData(elements.recommendations);
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
  elements.historySearch.addEventListener("input", renderDrawHistory);
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

  renderFrequencyChart(elements.frequencyChart, stats);
  renderDrawHistory();
}

function generateRecommendations() {
  const history = getHistory();
  const stats = computeStats(history);
  const recommendations = generateRecommendationSets({
    history,
    stats,
    count: state.count,
    strategy: elements.strategySelect.value,
    options: readOptions(),
    seed: state.seed,
  });

  state.seed = makeSeed();
  elements.seedLabel.textContent = state.seed;
  renderRecommendations(elements.recommendations, recommendations);
}

function readOptions() {
  return {
    avoidRecent: elements.avoidRecentInput.checked,
    strictBalance: elements.strictBalanceInput.checked,
    excludePast: elements.excludePastInput.checked,
  };
}

function getHistory() {
  return draws.slice(0, Number(elements.windowRange.value));
}

function renderDrawHistory() {
  renderHistory(elements.historyList, draws, elements.historySearch.value.trim());
}
