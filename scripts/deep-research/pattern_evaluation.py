"""Multiple-metric historical audit, tie sensitivity, controls and power calculations."""

from math import comb
from functools import lru_cache

import numpy as np
from scipy.optimize import brentq
from scipy.stats import binom

from evaluation import HIT_PMF, summarize, total_distribution
from features import hit_counts
from pattern_models import adaptive_predictions, pattern_predictions

cached_null = lru_cache(maxsize=None)(total_distribution)


def adjusted_metrics(hits, comparisons):
    summary = summarize(hits)
    distribution = cached_null(len(hits))
    raw = {"mean": min(1.0, float(distribution[int(np.sum(hits)):].sum())),
        "zero": float(binom.cdf(summary["histogram"][0], len(hits), HIT_PMF[0])),
        "prize": float(binom.sf(sum(summary["histogram"][3:]) - 1, len(hits), HIT_PMF[3:].sum()))}
    return {**summary, "rawPValues": raw,
        "adjustedPValues": {key: min(1.0, value * comparisons) for key, value in raw.items()}}


def practical_objectives(metrics, policy):
    mean, zero, prize = metrics["meanHits"], metrics["zeroRate"], metrics["prizeRate"]
    fair_zero, fair_prize = float(HIT_PMF[0]), float(HIT_PMF[3:].sum())
    return {
        "mean": mean >= 0.8 + policy["minimumMeanGain"] and zero <= fair_zero and prize >= fair_prize,
        "zero": zero <= fair_zero - policy["minimumZeroRateReduction"] and mean >= 0.8 and prize >= fair_prize,
        "prize": prize >= fair_prize + policy["minimumPrizeRateGain"] and mean >= 0.8 and zero <= fair_zero,
    }


def historical_objectives(metrics, policy):
    return [name for name, practical in practical_objectives(metrics, policy).items()
        if practical and metrics["adjustedPValues"][name] <= policy["historicalFamilyAlpha"]]


def historical_gate(metrics, policy):
    return bool(historical_objectives(metrics, policy))


def evaluate_patterns(predictions, outcomes, policy):
    start = policy["firstEvaluationDraw"] - 1
    count = len(outcomes)
    late = count - 260
    if late < start or count < policy["firstSelectionDraw"]:
        raise ValueError("Insufficient history for the registered periods")
    comparisons = 3 * (len(predictions) - 1 + policy["previouslyTestedAlternatives"])
    hits = {name: hit_counts(numbers[:-1], outcomes) for name, numbers in predictions.items()}
    rng = np.random.default_rng(policy["randomSeed"])
    block_starts = rng.integers(0, 260, (policy["bootstrapSamples"], 20))
    resamples = ((block_starts[:, :, None] + np.arange(13)) % 260).reshape(len(block_starts), 260)
    rows = []
    for name in sorted(hits):
        late_metrics = adjusted_metrics(hits[name][late:], comparisons)
        difference = hits[name][late:] - hits["current"][late:]
        rows.append({"id": name, "all": summarize(hits[name][start:]), "recent260": late_metrics,
            "recent104": summarize(hits[name][-104:]),
            "selectionPeriod": summarize(hits[name][policy["firstSelectionDraw"] - 1:]),
            "meanGainVsV2": float(difference.mean()),
            "pairedDescriptive95IntervalVsV2": np.quantile(difference[resamples].mean(axis=1), [0.025, 0.975]).tolist(),
            "blocks": [{"fromDraw": t + 1, "toDraw": min(t + 260, count),
                **summarize(hits[name][t:min(t + 260, count)])} for t in range(start, count, 260)],
            "historicalObjectivesReached": historical_objectives(late_metrics, policy) if name != "current" else [],
            "passesHistoricalScreen": name != "current" and historical_gate(late_metrics, policy)})
    return {"models": rows, "historicalComparisonFactor": comparisons,
        "periods": {"all": [start + 1, count], "recent260": [late + 1, count],
            "selectionPeriod": [policy["firstSelectionDraw"], count]},
        "historicalOnlyNotUnseenHoldout": True,
        "historicalScreenPasses": [row["id"] for row in rows if row["passesHistoricalScreen"]]}


def hot104_tie_audit(outcomes, policy):
    prefix = np.vstack([np.zeros(45), np.cumsum(outcomes, axis=0)])
    strict_hits, tied_winners, tied_count, slots, actual_hits = [], [], [], [], []
    for t in range(policy["firstEvaluationDraw"] - 1, len(outcomes)):
        counts = prefix[t] - prefix[t - 104]
        boundary = np.sort(counts)[-6]
        strict, tied = counts > boundary, counts == boundary
        strict_hits.append(int(outcomes[t, strict].sum()))
        tied_winners.append(int(outcomes[t, tied].sum()))
        tied_count.append(int(tied.sum()))
        slots.append(6 - int(strict.sum()))
        picked = np.argsort(-counts, kind="stable")[:6]
        actual_hits.append(int(outcomes[t, picked].sum()))
    strict_hits, tied_winners, tied_count, slots = map(np.asarray, [strict_hits, tied_winners, tied_count, slots])
    rng = np.random.default_rng(policy["randomSeed"])
    realizations = rng.hypergeometric(tied_winners, tied_count - tied_winners, slots,
        size=(policy["diagnosticSimulations"], len(slots))) + strict_hits
    return {"window": 104, "count": len(slots), "ambiguousCutoffDraws": int(np.sum(tied_count > slots)),
        "ascendingTieMean": float(np.mean(actual_hits)),
        "uniformTieExpectedMean": float(np.mean(strict_hits + slots * tied_winners / tied_count)),
        "tieRealization95Range": np.quantile(realizations.mean(axis=1), [0.025, 0.975]).tolist(),
        "interpretation": "Tie-rule sensitivity on already observed outcomes, not a predictive significance test."}


def random_history(rng, count):
    order = np.argsort(rng.random((count, 45)), axis=1)[:, :7]
    outcomes = np.zeros((count, 45), dtype=float)
    np.put_along_axis(outcomes, order[:, :6], 1, axis=1)
    return outcomes, order[:, 6] + 1


def negative_controls(policy, draw_count, observed_best_mean):
    rng = np.random.default_rng(policy["randomSeed"] + 1)
    best_means, nominal, adjusted, passes = [], 0, 0, 0
    for index in range(policy["negativeControlSimulations"]):
        outcomes, bonuses = random_history(rng, draw_count)
        predictions = pattern_predictions(outcomes, bonuses, policy)
        adaptive, _ = adaptive_predictions(predictions, outcomes, policy)
        predictions.update(adaptive)
        comparisons = 3 * (len(predictions) + policy["previouslyTestedAlternatives"])
        summaries = [adjusted_metrics(hit_counts(numbers[:-1], outcomes)[-260:], comparisons) for numbers in predictions.values()]
        best_means.append(max(row["meanHits"] for row in summaries))
        nominal += any(min(row["rawPValues"].values()) < 0.05 for row in summaries)
        adjusted += any(min(row["adjustedPValues"].values()) < 0.05 for row in summaries)
        passes += any(historical_gate(row, policy) for row in summaries)
        if (index + 1) % 10 == 0:
            print(f"Negative controls {index + 1}/{policy['negativeControlSimulations']}", flush=True)
    return {"simulations": policy["negativeControlSimulations"], "drawsPerHistory": draw_count,
        "historiesWithAnyNominalPBelow005": nominal, "historiesWithAnyAdjustedPBelow005": adjusted,
        "historiesPassingFullScreen": passes, "medianBestMean": float(np.median(best_means)),
        "bestMean95Range": np.quantile(best_means, [0.025, 0.975]).tolist(),
        "observedBestMean": observed_best_mean,
        "exploratoryMaxMeanMonteCarloPValue": (1 + sum(value >= observed_best_mean for value in best_means)) / (len(best_means) + 1),
        "interpretation": "Finite simulation of this fixed search under fair draws; not proof that an observed historical winner is genuine."}


def detection_power(comparisons):
    rows = []
    support = np.arange(7)
    for count in [104, 260, 520, 986]:
        null = total_distribution(count)
        tails = np.cumsum(null[::-1])[::-1]
        critical = int(np.flatnonzero(tails <= 0.05 / comparisons)[0])
        for mean in [0.9, 1.0, 1.2]:
            def tilted(tilt):
                weights = HIT_PMF * np.exp(tilt * support)
                return weights / weights.sum()
            tilt = brentq(lambda value: tilted(value) @ support - mean, 0, 5)
            alternative = np.ones(1)
            for _ in range(count):
                alternative = np.convolve(alternative, tilted(tilt))
            rows.append({"weeks": count, "alternativeMean": mean, "criticalTotalHits": critical,
                "power": min(1.0, float(alternative[critical:].sum()))})
    return {"comparisonFactor": comparisons, "alpha": 0.05,
        "assumption": "Hypothetical IID exponential tilt of fair hit counts; mean-only test, not all practical gates.", "rows": rows}


def common_pattern_probabilities():
    sums = np.zeros((7, 256), dtype=np.int64)
    sums[0, 0] = 1
    for number in range(1, 46):
        for picks in range(6, 0, -1):
            sums[picks, number:] += sums[picks - 1, :-number]
    total = comb(45, 6)
    return {"totalCombinations": total, "sum100To180": int(sums[6, 100:181].sum()) / total,
        "oddCount2To4": sum(comb(23, k) * comb(22, 6 - k) for k in range(2, 5)) / total,
        "atLeastOneConsecutivePair": 1 - comb(40, 6) / total,
        "probabilityOfAnySpecificSixNumbers": 1 / total,
        "interpretation": "Pattern classes contain many combinations; individual combinations remain equiprobable under fairness."}
