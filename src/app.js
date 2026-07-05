import { LOTTO_WINNING_NUMBERS } from "../data/lotto-data.js";
import {
  createFeedbackProfile,
  evaluateRecommendationRecords,
  getLatestEvaluatedRecord,
  getLatestPendingRecord,
  pruneRecommendationRecords,
} from "./core/recommendation-learning.js";
import { generateRecommendationSets } from "./core/recommendation-engine.js";
import { makeSeed } from "./core/random.js";
import { computeStats } from "./core/statistics.js";
import { initInstallPrompt } from "./pwa/install-prompt.js";
import { registerServiceWorker } from "./pwa/service-worker-registration.js";
import {
  renderFrequencyChart,
  renderHistory,
  renderLearningStatus,
  renderMissingData,
  renderRecommendationPlaceholder,
  renderNumberSummary,
  renderRecommendations,
} from "./ui/renderers.js";

const draws = Array.isArray(LOTTO_WINNING_NUMBERS) ? [...LOTTO_WINNING_NUMBERS] : [];
const DEFAULT_HISTORY_WINDOW = 260;
const HISTORY_WINDOW_STORAGE_KEY = "npick.historyWindow";
const RECOMMENDATION_RECORDS_STORAGE_KEY = "npick.recommendationRecords";
const STORED_RECORD_LIMIT = 12;
const SUMMARY_NUMBER_LIMIT = 6;

const state = {
  records: [],
  feedbackProfile: createFeedbackProfile([]),
  count: 3,
};

const elements = {
  recommendations: document.querySelector("#recommendations"),
  learningStatus: document.querySelector("#learningStatus"),
  generateButton: document.querySelector("#generateButton"),
  generateTopButton: document.querySelector("#generateTopButton"),
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
  syncRecommendationRecords();
  ensureCurrentRecommendation();

  bindEvents();
  renderAll();
  renderRecommendationState();
}

function bindEvents() {
  elements.generateButton.addEventListener("click", handleGenerateRecommendation);
  elements.generateTopButton.addEventListener("click", handleGenerateRecommendation);
  elements.strategySelect.addEventListener("change", renderRecommendationState);
  elements.windowRange.addEventListener("input", () => {
    saveHistoryWindowValue();
    renderAll();
    renderRecommendationState();
  });
  elements.avoidRecentInput.addEventListener("change", renderRecommendationState);
  elements.strictBalanceInput.addEventListener("change", renderRecommendationState);
  elements.excludePastInput.addEventListener("change", renderRecommendationState);
  elements.historySearch.addEventListener("input", renderDrawHistory);
  elements.countButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.count = Number(button.dataset.count);
      elements.countButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      renderRecommendationState();
    });
  });
}

function renderAll() {
  const history = getHistory();
  const stats = computeStats(history);
  const latest = draws[0];
  const windowLabel = getHistoryWindowLabel(history.length);

  elements.windowLabel.textContent = windowLabel;
  elements.chartCaption.textContent = `${windowLabel} 기준`;
  elements.latestDrawMetric.textContent = latest ? `${latest.draw}회` : "-";
  elements.drawCountMetric.textContent = `${draws.length.toLocaleString("ko-KR")}회`;
  renderNumberSummary(elements.hotMetric, stats.hotNumbers, { limit: SUMMARY_NUMBER_LIMIT });
  renderNumberSummary(elements.overdueMetric, stats.overdueNumbers, { limit: SUMMARY_NUMBER_LIMIT });

  renderFrequencyChart(elements.frequencyChart, stats);
  renderDrawHistory();
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

function renderRecommendationState() {
  const latest = draws[0];
  const pendingRecord = getLatestPendingRecord(state.records, latest);
  const latestEvaluatedRecord = getLatestEvaluatedRecord(state.records);

  if (pendingRecord) {
    elements.seedLabel.textContent = `${pendingRecord.targetDraw}회 대기`;
    renderRecommendations(elements.recommendations, pendingRecord.recommendations);
  } else {
    elements.seedLabel.textContent = latestEvaluatedRecord ? `${latest.draw + 1}회 준비` : "대기 중";
    renderRecommendationPlaceholder(elements.recommendations, {
      title: `${latest.draw + 1}회 추천을 생성하세요`,
      description: latestEvaluatedRecord
        ? "지난 추천 평가를 반영해 다음 회차 추천을 자동으로 생성합니다."
        : "앱을 열면 다음 회차 추천을 자동으로 한 번 생성하고, 당첨번호 갱신 후 평가합니다.",
    });
  }

  updateGenerateButtons(Boolean(pendingRecord), latest.draw + 1);
  renderLearningStatus(elements.learningStatus, {
    pendingRecord,
    latestEvaluatedRecord,
    feedbackProfile: state.feedbackProfile,
  });
}

function handleGenerateRecommendation() {
  storeNextDrawRecommendation({ source: "manual" });
  renderRecommendationState();
}

function ensureCurrentRecommendation() {
  storeNextDrawRecommendation({ source: "auto" });
}

function storeNextDrawRecommendation({ source }) {
  const latest = draws[0];
  const pendingRecord = getLatestPendingRecord(state.records, latest);

  if (pendingRecord) {
    return null;
  }

  const history = getHistory();
  const stats = computeStats(history);
  const seed = makeSeed();
  const options = readOptions();
  const recommendations = generateRecommendationSets({
    history,
    stats,
    count: state.count,
    strategy: elements.strategySelect.value,
    options,
    seed,
    feedbackProfile: state.feedbackProfile,
  });
  const record = createRecommendationRecord({
    latest,
    historyLength: history.length,
    recommendations,
    seed,
    strategy: elements.strategySelect.value,
    options,
    source,
  });

  state.records = pruneRecommendationRecords([record, ...state.records], STORED_RECORD_LIMIT);
  saveRecommendationRecords();
  return record;
}

function createRecommendationRecord({ latest, historyLength, recommendations, seed, strategy, options, source }) {
  return {
    id: `${latest.draw + 1}-${Date.now().toString(36)}`,
    status: "pending",
    createdAt: new Date().toISOString(),
    baseDraw: latest.draw,
    baseDate: latest.date,
    targetDraw: latest.draw + 1,
    historyLength,
    seed,
    source,
    settings: {
      count: recommendations.length,
      strategy,
      options,
    },
    recommendations,
  };
}

function updateGenerateButtons(hasPendingRecord, targetDraw) {
  [elements.generateButton, elements.generateTopButton].forEach((button) => {
    button.textContent = `${targetDraw}회 추천 생성`;
    button.hidden = hasPendingRecord;
    button.disabled = false;
  });
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

function syncRecommendationRecords() {
  const loadedRecords = loadRecommendationRecords();
  const evaluatedRecords = evaluateRecommendationRecords(loadedRecords, draws);

  state.records = pruneRecommendationRecords(evaluatedRecords, STORED_RECORD_LIMIT);
  state.feedbackProfile = createFeedbackProfile(state.records);

  if (JSON.stringify(loadedRecords) !== JSON.stringify(state.records)) {
    saveRecommendationRecords();
  }
}

function loadRecommendationRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(RECOMMENDATION_RECORDS_STORAGE_KEY));

    if (!Array.isArray(records)) {
      return [];
    }

    return records.filter(isRecommendationRecord);
  } catch {
    return [];
  }
}

function saveRecommendationRecords() {
  try {
    localStorage.setItem(RECOMMENDATION_RECORDS_STORAGE_KEY, JSON.stringify(state.records));
  } catch {
    // The app can still recommend without saved evaluation history.
  }
}

function isRecommendationRecord(record) {
  return (
    record &&
    typeof record === "object" &&
    Number.isInteger(record.targetDraw) &&
    Array.isArray(record.recommendations) &&
    record.recommendations.every((item) => Array.isArray(item.numbers))
  );
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
