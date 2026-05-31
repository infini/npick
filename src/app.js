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
  renderNumberSummary,
  renderRecommendations,
} from "./ui/renderers.js";

const draws = Array.isArray(LOTTO_WINNING_NUMBERS) ? [...LOTTO_WINNING_NUMBERS] : [];
const DEFAULT_HISTORY_WINDOW = 260;
const HISTORY_WINDOW_STORAGE_KEY = "npick.historyWindow";
const SUMMARY_NUMBER_LIMIT = 6;

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
  elements.windowRange.value = String(loadHistoryWindowValue());

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
    saveHistoryWindowValue();
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
  const windowLabel = getHistoryWindowLabel(history.length);

  elements.seedLabel.textContent = state.seed;
  elements.windowLabel.textContent = windowLabel;
  elements.chartCaption.textContent = `${windowLabel} 기준`;
  elements.latestDrawMetric.textContent = latest ? `${latest.draw}회` : "-";
  elements.drawCountMetric.textContent = `${draws.length.toLocaleString("ko-KR")}회`;
  renderNumberSummary(elements.hotMetric, stats.hotNumbers, { limit: SUMMARY_NUMBER_LIMIT });
  renderNumberSummary(elements.overdueMetric, stats.overdueNumbers, { limit: SUMMARY_NUMBER_LIMIT });

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

function getHistoryWindowLabel(count) {
  const formatted = count.toLocaleString("ko-KR");
  return count >= draws.length ? `전체 ${formatted}회` : `최근 ${formatted}회`;
}

function loadHistoryWindowValue() {
  const fallback = clampHistoryWindowValue(DEFAULT_HISTORY_WINDOW);
  const stored = readStoredHistoryWindow();

  if (!stored) {
    return fallback;
  }

  if (stored.mode === "all") {
    return draws.length;
  }

  return clampHistoryWindowValue(stored.value);
}

function saveHistoryWindowValue() {
  const value = Number(elements.windowRange.value);
  const payload = {
    mode: value >= draws.length ? "all" : "recent",
    value,
  };

  try {
    localStorage.setItem(HISTORY_WINDOW_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // The app can still run when storage is blocked.
  }
}

function readStoredHistoryWindow() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_WINDOW_STORAGE_KEY));

    if (!value || typeof value !== "object") {
      return null;
    }

    return {
      mode: value.mode,
      value: Number(value.value),
    };
  } catch {
    return null;
  }
}

function clampHistoryWindowValue(value) {
  const min = Number(elements.windowRange.min);
  const max = draws.length;
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return Math.min(DEFAULT_HISTORY_WINDOW, max);
  }

  return Math.min(Math.max(Math.round(numericValue), min), max);
}

function renderDrawHistory() {
  renderHistory(elements.historyList, draws, elements.historySearch.value.trim());
}
