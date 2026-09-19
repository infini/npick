from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import unittest

import numpy as np

from evaluation import HIT_PMF, passes_gate, summarize, total_distribution
from features import build_features, encode_draws, hit_counts, top_six
from models import adaptive_models, fit_model, statistical_models
from prospective import advance_shadow_records, digest, history_digest, summarize_prospective

POLICY = json.loads(Path(__file__).with_name("protocol.json").read_text())


def synthetic_draws(count):
    rng = np.random.default_rng(7919)
    draws = []
    for index in range(count):
        balls = rng.choice(np.arange(1, 46), 7, replace=False).tolist()
        draws.append({"draw": index + 1, "date": (date(2002, 12, 7) + timedelta(weeks=index)).isoformat(),
            "numbers": sorted(balls[:6]), "bonus": balls[6]})
    return draws


class ResearchTests(unittest.TestCase):
    def test_generated_hashes_match_the_registered_protocol(self):
        root = Path(__file__).resolve().parents[2]
        report = json.loads((root / "data/research-analysis.json").read_text())
        ledger = json.loads((root / "data/research-shadow-records.json").read_text())
        draws, _ = encode_draws(json.loads((root / "data/lotto-data.json").read_text())["draws"])
        self.assertEqual(report["protocol"], POLICY)
        self.assertEqual(report["protocolHash"], digest(POLICY))
        self.assertEqual(ledger["protocolHash"], digest(POLICY))
        self.assertEqual(report["historyDigest"], history_digest([draw for draw in draws if draw["draw"] <= report["latestDraw"]]))
        for record in ledger["records"]:
            self.assertEqual(record["protocolHash"], digest(POLICY))
            self.assertEqual(record["forecastDigest"], digest(record["predictions"]))

    def test_features_exclude_target_and_future(self):
        _, outcomes = encode_draws(synthetic_draws(120))
        changed = outcomes.copy()
        changed[80:] = np.roll(changed[80:], 9, axis=1)
        np.testing.assert_array_equal(build_features(outcomes)["x"][:81], build_features(changed)["x"][:81])
        np.testing.assert_array_equal(build_features(outcomes[:80])["x"], build_features(outcomes)["x"][:81])

    def test_statistical_models_have_prefix_invariance(self):
        _, outcomes = encode_draws(synthetic_draws(100))
        full = statistical_models(outcomes, build_features(outcomes), POLICY)
        prefix = statistical_models(outcomes[:70], build_features(outcomes[:70]), POLICY)
        for name in full:
            np.testing.assert_array_equal(full[name][:71], prefix[name], err_msg=name)

    def test_learning_and_preprocessing_never_fit_future_targets(self):
        _, outcomes = encode_draws(synthetic_draws(100))
        changed = outcomes.copy()
        changed[80:] = np.roll(changed[80:], 9, axis=1)
        policy = {**POLICY, "firstEvaluationDraw": 61}
        config = {"id": "test-logistic", "family": "logistic", "window": 0, "c": 0.1}
        _, first = fit_model(config, build_features(outcomes)["x"], outcomes, policy)
        _, second = fit_model(config, build_features(changed)["x"], changed, policy)
        np.testing.assert_array_equal(first[:81], second[:81])

    def test_adaptive_selection_uses_completed_predictions_only(self):
        _, outcomes = encode_draws(synthetic_draws(110))
        changed = outcomes.copy()
        changed[90:] = np.roll(changed[90:], 9, axis=1)
        rng = np.random.default_rng(42)
        scores = {str(i): rng.random((111, 45)) for i in range(6)}
        ties = rng.random((111, 45))
        policy = {**POLICY, "firstEvaluationDraw": 21}
        first, _ = adaptive_models(scores, outcomes, ties, policy)
        second, _ = adaptive_models(scores, changed, ties, policy)
        for name in first:
            np.testing.assert_array_equal(first[name][:91], second[name][:91])

    def test_positive_control_recovers_a_real_transition_signal(self):
        outcomes = np.zeros((400, 45))
        outcomes[::2, :6] = 1
        outcomes[1::2, 6:12] = 1
        scores = statistical_models(outcomes, build_features(outcomes), POLICY)["transition-all-26"]
        numbers = top_six(scores, np.random.default_rng(1).random(scores.shape))
        hits = hit_counts(numbers[:-1], outcomes)[260:]
        self.assertTrue(np.all(hits == 6))
        summary = summarize(hits, total_distribution(len(hits)))
        summary["adjustedPValue"] = min(1, summary["uniformPValue"] * 60)
        self.assertTrue(passes_gate(summary, POLICY))

    def test_likelihood_ratio_has_unit_expectation_under_the_null(self):
        expectation = 0
        for hits, probability in enumerate(HIT_PMF):
            records = [{"status": "evaluated", "targetDraw": 1243,
                "predictions": {"current": [1, 2, 3, 4, 5, 6], "test": [7, 8, 9, 10, 11, 12]},
                "hits": {"current": 0, "test": hits}}]
            summary = summarize_prospective(records, POLICY)
            evidence = next(model for model in summary["models"] if model["id"] == "test")
            expectation += probability * evidence["eValue"]
        self.assertAlmostEqual(expectation, 1, places=12)

    def test_shadow_records_are_immutable_and_never_backfilled(self):
        draws = synthetic_draws(300)
        policy = {**POLICY, "firstProspectiveDraw": 301}
        predictions = {"current": np.tile(np.arange(1, 7), (301, 1)), "test": np.tile(np.arange(7, 13), (301, 1))}
        now = datetime.fromisoformat(draws[-1]["date"]).replace(tzinfo=timezone.utc) + timedelta(days=1)
        records = advance_shadow_records([], draws, predictions, policy, "code-v1", now)
        original = json.loads(json.dumps(records))
        predictions["test"][-1] = np.arange(13, 19)
        repeated = advance_shadow_records(records, draws, predictions, policy, "code-v2", now + timedelta(days=1))
        self.assertEqual(original, repeated)
        more_draws = synthetic_draws(304)
        later = datetime.fromisoformat(more_draws[-1]["date"]).replace(tzinfo=timezone.utc) + timedelta(days=1)
        more_predictions = {name: np.tile(numbers[-1], (305, 1)) for name, numbers in predictions.items()}
        advanced = advance_shadow_records(records, more_draws, more_predictions, policy, "code-v2", later)
        self.assertEqual([record["targetDraw"] for record in advanced], [301, 305])
        self.assertEqual(advanced[0]["status"], "evaluated")
        self.assertEqual(advanced[0]["predictions"], original[0]["predictions"])
        tampered = json.loads(json.dumps(records))
        tampered[0]["predictions"]["test"][0] = 40
        with self.assertRaisesRegex(ValueError, "digest"):
            advance_shadow_records(tampered, draws, predictions, policy, "code-v1", now)
        with self.assertRaisesRegex(ValueError, "cutoff"):
            advance_shadow_records([], draws, predictions, policy, "code-v1", now + timedelta(days=7))
        with self.assertRaisesRegex(ValueError, "registered"):
            advance_shadow_records([], draws, predictions, POLICY, "code-v1", now)
        with self.assertRaisesRegex(ValueError, "align"):
            advance_shadow_records([], more_draws, predictions, policy, "code-v1", later)

    def test_invalid_draw_history_is_rejected(self):
        draws = synthetic_draws(30)
        draws[5]["draw"] = 4
        with self.assertRaises(ValueError):
            encode_draws(draws)


if __name__ == "__main__":
    unittest.main()
