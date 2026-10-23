import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts/research"))

import numpy as np
from threadpoolctl import threadpool_limits

from features import hit_counts
from evaluation import HIT_PMF
from pattern_diagnostics import pattern_statistics
from pattern_evaluation import adjusted_metrics, common_pattern_probabilities, historical_gate, historical_objectives, random_history
from pattern_models import adaptive_predictions, diverse_numbers, model_names, pattern_predictions, top_numbers
from pattern_prospective import log_evidence, summarize_pattern_prospective
from prospective import digest

POLICY = json.loads(Path(__file__).with_name("protocol.json").read_text())


class PatternTests(unittest.TestCase):
    def setUp(self):
        self.limits = threadpool_limits(limits=1)
        self.outcomes, self.bonuses = random_history(np.random.default_rng(7), 160)
        self.policy = {**POLICY, "firstEvaluationDraw": 105, "firstSelectionDraw": 131, "selectionWindow": 26, "selectionBlock": 13}

    def tearDown(self):
        self.limits.restore_original_limits()

    def test_fixed_scope_and_valid_numbers(self):
        predictions = pattern_predictions(self.outcomes, self.bonuses, self.policy)
        self.assertEqual(len(model_names(POLICY)), 35)
        adaptive, _ = adaptive_predictions(predictions, self.outcomes, self.policy)
        self.assertEqual(len(adaptive), 5)
        predictions.update(adaptive)
        for name, numbers in predictions.items():
            self.assertEqual(numbers.shape, (161, 6), name)
            self.assertTrue(np.all((numbers >= 1) & (numbers <= 45)), name)
            self.assertTrue(np.all(np.diff(numbers, axis=1) > 0), name)

    def test_every_predictor_excludes_target_future_and_future_bonus(self):
        full = pattern_predictions(self.outcomes, self.bonuses, self.policy)
        prefix = pattern_predictions(self.outcomes[:135], self.bonuses[:135], self.policy)
        changed = self.outcomes.copy()
        changed[135:] = np.roll(changed[135:], 9, axis=1)
        bonuses = self.bonuses.copy()
        bonuses[135:] = 1
        altered = pattern_predictions(changed, bonuses, self.policy)
        for name in full:
            np.testing.assert_array_equal(full[name][:136], prefix[name], err_msg=name)
            np.testing.assert_array_equal(full[name][:136], altered[name][:136], err_msg=name)

    def test_block_selection_and_mixtures_do_not_use_future_performance(self):
        full = pattern_predictions(self.outcomes, self.bonuses, self.policy)
        first, _ = adaptive_predictions(full, self.outcomes, self.policy)
        changed = self.outcomes.copy()
        changed[135:] = np.roll(changed[135:], 9, axis=1)
        second, _ = adaptive_predictions(full, changed, self.policy)
        for name in first:
            np.testing.assert_array_equal(first[name][:136], second[name][:136], err_msg=name)
        prefix = {name: values[:136] for name, values in full.items()}
        third, _ = adaptive_predictions(prefix, self.outcomes[:135], self.policy)
        for name in first:
            np.testing.assert_array_equal(first[name][:136], third[name], err_msg=name)

    def test_hot104_equals_integer_frequency_with_ascending_ties(self):
        predictions = pattern_predictions(self.outcomes, self.bonuses, self.policy)
        for t in range(104, len(self.outcomes) + 1):
            expected = top_numbers(self.outcomes[t - 104:t].sum(axis=0))
            np.testing.assert_array_equal(predictions["hot-104"][t], expected)

    def test_coverage_positive_control_and_prize_tradeoff(self):
        history = np.zeros((70, 45))
        for index in range(70):
            history[index, (index % 7) * 6:(index % 7 + 1) * 6] = 1
        covered = diverse_numbers(history)
        concentrated = top_numbers(history.sum(axis=0))
        coverage_hits = hit_counts(np.tile(covered, (70, 1)), history)
        hot_hits = hit_counts(np.tile(concentrated, (70, 1)), history)
        self.assertEqual(int(np.sum(coverage_hits == 0)), 10)
        self.assertEqual(int(np.sum(hot_hits == 0)), 60)
        self.assertAlmostEqual(coverage_hits.mean(), hot_hits.mean())
        self.assertEqual(int(np.sum(coverage_hits >= 3)), 0)

    def test_extreme_real_signal_is_detectable_but_small_samples_are_not_proof(self):
        self.assertTrue(historical_gate(adjusted_metrics(np.full(260, 3), 300), POLICY))
        self.assertFalse(historical_gate(adjusted_metrics(np.array([1, 2, 1, 3]), 300), POLICY))
        self.assertFalse(historical_gate(adjusted_metrics(np.ones(260, dtype=int), 300), POLICY))

    def test_pattern_class_probability_is_not_single_combination_probability(self):
        result = common_pattern_probabilities()
        self.assertEqual(result["totalCombinations"], 8145060)
        self.assertGreater(result["atLeastOneConsecutivePair"], 0.5)
        self.assertGreater(result["sum100To180"], 0.5)
        self.assertAlmostEqual(result["probabilityOfAnySpecificSixNumbers"], 1 / 8145060)

    def test_each_prospective_objective_has_unit_null_expectation(self):
        evidence = [log_evidence([hits], POLICY) for hits in range(7)]
        for objective in ["mean", "zero", "prize"]:
            self.assertAlmostEqual(sum(HIT_PMF[hits] * np.exp(row[objective])
                for hits, row in enumerate(evidence)), 1.0)

    def test_zero_and_prize_objectives_do_not_require_mean_significance(self):
        fewer_zeros = np.repeat([0, 1, 2, 3], [70, 165, 15, 10])
        more_prizes = np.repeat([0, 1, 3], [90, 130, 40])
        self.assertEqual(historical_objectives(adjusted_metrics(fewer_zeros, 300), POLICY), ["zero"])
        self.assertEqual(historical_objectives(adjusted_metrics(more_prizes, 300), POLICY), ["prize"])

    def test_prospective_gate_budgets_all_objectives_and_requires_observation(self):
        names = [f"candidate-{index}" for index in range(40)] + ["current"]
        records = [{"targetDraw": 1248 + index, "status": "evaluated",
            "predictions": dict.fromkeys(names, [1, 2, 3, 4, 5, 6]),
            "hits": dict.fromkeys(names, 3)} for index in range(104)]
        result = summarize_pattern_prospective(records, POLICY)
        self.assertEqual(result["evidenceThreshold"], 12000)
        self.assertTrue(result["models"][0]["evidenceReached"])
        self.assertFalse(result["models"][-1]["evidenceReached"])
        short = summarize_pattern_prospective(records[:4], POLICY)
        self.assertTrue(all(not row["evidenceReached"] for row in short["models"]))

    def test_diagnostic_scan_is_finite(self):
        outcomes, bonuses = random_history(np.random.default_rng(19), 600)
        values = pattern_statistics(outcomes, bonuses)
        self.assertEqual(values.shape, (7,))
        self.assertTrue(np.isfinite(values).all())

    def test_saved_protocol_is_separate_from_original_research(self):
        old = json.loads((ROOT / "scripts/research/protocol.json").read_text())
        self.assertNotEqual(digest(old), digest(POLICY))
        self.assertEqual(POLICY["firstProspectiveDraw"], 1248)
        self.assertFalse(POLICY["autoPromote"])


if __name__ == "__main__":
    unittest.main()
