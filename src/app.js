import { LOTTO_DATA_META, LOTTO_WINNING_NUMBERS } from "../data/lotto-data.js?v=13";
import {
  WEEKLY_RECOMMENDATION_RECORDS,
  WEEKLY_RECOMMENDATIONS_META,
} from "../data/weekly-recommendations.js?v=13";
import { computeStats } from "./core/statistics.js?v=13";
import {
  addDaysToIsoDate,
  evaluateWeeklyRecommendationRecords,
  getCurrentWeeklyRecord,
  getLatestEvaluatedWeeklyRecord,
  getSalesCutoffAt,
  pruneWeeklyRecommendationRecords,
  summarizeWeeklyResults,
} from "./core/weekly-cycle.js?v=13";
import { initInstallPrompt } from "./pwa/install-prompt.js?v=13";
import { registerServiceWorker } from "./pwa/service-worker-registration.js?v=13";
import {
  renderFrequencyChart,
  renderHistory,
  renderMissingData,
  renderNumberSummary,
  renderRecommendationPlaceholder,
  renderRecommendations,
  renderWeeklyCycleStatus,
} from "./ui/renderers.js?v=13";

const draws = Array.isArray(LOTTO_WINNING_NUMBERS) ? [...LOTTO_WINNING_NUMBERS] : [];
const DEFAULT_HISTORY_WINDOW = 260;
const HISTORY_WINDOW_STORAGE_KEY = "npick.historyWindow";
const SUMMARY_NUMBER_LIMIT = 6;

const state = {
  records: [],
  summary: summarizeWeeklyResults([]),
};

const elements = {
  recommendations: document.querySelector("#recommendations"),
  weeklyStatus: document.querySelector("#weeklyStatus"),
  installButton: document.querySelector("#installButton"),
  windowRange: document.querySelector("#windowRange"),
  windowLabel: document.querySelector("#windowLabel"),
  weeklyTargetLabel: document.querySelector("#weeklyTargetLabel"),
  dataStatusLabel: document.querySelector("#dataStatusLabel"),
  latestDrawMetric: document.querySelector("#latestDrawMetric"),
  drawCountMetric: document.querySelector("#drawCountMetric"),
  hotMetric: document.querySelector("#hotMetric"),
  overdueMetric: document.querySelector("#overdueMetric"),
  frequencyChart: document.querySelector("#frequencyChart"),
  chartCaption: document.querySelector("#chartCaption"),
  historySearch: document.querySelector("#historySearch"),
  historyList: document.querySelector("#historyList"),
};

init();

function init() {
  registerServiceWorker();
  initInstallPrompt(elements.installButton);

  if (!draws.length) {
    renderMissingData(elements.recommendations);
    return;
  }

  draws.sort((left, right) => right.draw - left.draw);
  elements.windowRange.max = String(draws.length);
  elements.windowRange.value = String(loadHistoryWindowValue());
  syncWeeklyRecords();
  bindEvents();
  renderAll();
  renderRecommendationState();
}

function bindEvents() {
  elements.windowRange.addEventListener("input", () => {
    saveHistoryWindowValue();
    renderAll();
  });
  elements.historySearch.addEventListener("input", renderDrawHistory);
}

function syncWeeklyRecords() {
  const records = Array.isArray(WEEKLY_RECOMMENDATION_RECORDS) ? WEEKLY_RECOMMENDATION_RECORDS : [];
  state.records = pruneWeeklyRecommendationRecords(evaluateWeeklyRecommendationRecords(records, draws));
  state.summary = summarizeWeeklyResults(state.records);
}

function renderAll() {
  const history = getHistory();
  const stats = computeStats(history);
  const latest = draws[0];
  const windowLabel = getHistoryWindowLabel(history.length);

  elements.windowLabel.textContent = windowLabel;
  elements.chartCaption.textContent = `${windowLabel} 기준 · 추천 번호에는 영향 없음`;
  elements.latestDrawMetric.textContent = latest ? `${latest.draw}회` : "-";
  elements.drawCountMetric.textContent = `${draws.length.toLocaleString("ko-KR")}회`;
  renderNumberSummary(elements.hotMetric, stats.hotNumbers, { limit: SUMMARY_NUMBER_LIMIT });
  renderNumberSummary(elements.overdueMetric, stats.overdueNumbers, { limit: SUMMARY_NUMBER_LIMIT });
  renderFrequencyChart(elements.frequencyChart, stats);
  renderDrawHistory();
}

function renderRecommendationState() {
  const latest = draws[0];
  const currentRecord = getCurrentWeeklyRecord(state.records, latest);
  const latestEvaluatedRecord = getLatestEvaluatedWeeklyRecord(state.records);
  const cycleStatus = getCycleStatus(latest, currentRecord);

  elements.weeklyTargetLabel.textContent = currentRecord
    ? `${currentRecord.targetDraw}회 · 3세트 고정`
    : `${latest.draw + 1}회 · 생성 대기`;
  elements.dataStatusLabel.textContent = cycleStatus.label;

  if (currentRecord) {
    renderRecommendations(elements.recommendations, currentRecord.recommendations, {
      targetDraw: currentRecord.targetDraw,
    });
  } else {
    renderRecommendationPlaceholder(elements.recommendations, {
      title: cycleStatus.title,
      description: cycleStatus.description,
    });
  }

  renderWeeklyCycleStatus(elements.weeklyStatus, {
    currentRecord,
    latestEvaluatedRecord,
    summary: state.summary,
    cycleStatus,
    dataMeta: LOTTO_DATA_META,
    weeklyMeta: WEEKLY_RECOMMENDATIONS_META,
  });
}

function getCycleStatus(latest, currentRecord) {
  const targetDate = addDaysToIsoDate(latest.date, 7);
  const cutoff = getSalesCutoffAt(targetDate);
  const afterCutoff = Date.now() >= cutoff.getTime();
  const dataAligned =
    LOTTO_DATA_META?.latestDraw === latest.draw &&
    WEEKLY_RECOMMENDATIONS_META?.latestBaseDraw === latest.draw;

  if (currentRecord && dataAligned) {
    return {
      code: afterCutoff ? "awaiting-result-data" : "ready",
      label: afterCutoff ? "당첨 데이터 갱신 대기" : `${targetDate} 추첨 예정`,
      title: `${currentRecord.targetDraw}회 추천 3세트`,
      description: afterCutoff
        ? "추천은 추첨 전에 확정됐습니다. 당첨 데이터가 갱신되면 세트별 결과를 평가합니다."
        : "세 세트는 추첨일까지 고정되며 다시 생성하지 않습니다.",
    };
  }

  if (afterCutoff) {
    return {
      code: "stale-winning-data",
      label: "최신 당첨 데이터 필요",
      title: "당첨 데이터 갱신 대기",
      description: "추첨 마감 시각이 지나 새 추천을 만들지 않았습니다. 최신 당첨 데이터가 배포되면 다음 주 3세트가 생성됩니다.",
    };
  }

  return {
    code: "weekly-data-missing",
    label: "주간 추천 동기화 필요",
    title: "주간 추천 데이터 준비 중",
    description: "최신 당첨 데이터와 주간 추천 파일이 일치하면 정확히 3세트가 표시됩니다.",
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

  if (!stored) return fallback;
  if (stored.mode === "all") return draws.length;
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
    // Statistics still render when browser storage is blocked.
  }
}

function readStoredHistoryWindow() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_WINDOW_STORAGE_KEY));
    if (!value || typeof value !== "object") return null;
    return { mode: value.mode, value: Number(value.value) };
  } catch {
    return null;
  }
}

function clampHistoryWindowValue(value) {
  const min = Number(elements.windowRange.min);
  const max = draws.length;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return Math.min(DEFAULT_HISTORY_WINDOW, max);
  return Math.min(Math.max(Math.round(numericValue), min), max);
}

function renderDrawHistory() {
  renderHistory(elements.historyList, draws, elements.historySearch.value.trim());
}
