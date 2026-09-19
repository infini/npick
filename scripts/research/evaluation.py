"""Exact hit tests, descriptive paired intervals and simulated randomness diagnostics."""

from math import comb

import numpy as np

from features import BASE_RATE, hit_counts

HIT_PMF = np.array([comb(6, k) * comb(39, 6 - k) / comb(45, 6) for k in range(7)])


def total_distribution(count):
    distribution = np.ones(1)
    for _ in range(count):
        distribution = np.convolve(distribution, HIT_PMF)
    return distribution


def summarize(hits, distribution=None):
    hits = np.asarray(hits, dtype=int)
    if not len(hits) or np.any((hits < 0) | (hits > 6)):
        raise ValueError("A nonempty sequence of valid hit counts is required")
    summary = {"count": len(hits), "meanHits": float(hits.mean()),
        "zeroRate": float((hits == 0).mean()), "prizeRate": float((hits >= 3).mean()),
        "histogram": np.bincount(hits, minlength=7).tolist()}
    if distribution is not None:
        summary["uniformPValue"] = min(1.0, float(distribution[int(hits.sum()):].sum()))
    return summary


def evaluate_models(predictions, scores, outcomes, policy):
    start = policy["firstEvaluationDraw"] - 1
    split = policy["selectionEndDraw"]
    end = min(len(outcomes), policy["confirmationEndDraw"])
    if not start < split < end:
        raise ValueError("Data must cover the fixed development and confirmation periods")
    development_null = total_distribution(split - start)
    confirmation_null = total_distribution(end - split)
    comparisons = len(predictions) - 1 + policy["previouslyTestedAlternatives"]
    baseline_hits = hit_counts(predictions["current"][:len(outcomes)], outcomes)
    rng = np.random.default_rng(policy["randomSeed"])
    size = end - split
    # Shared moving-block samples preserve short-run dependence in paired differences.
    block_starts = rng.integers(0, size, (policy["bootstrapSamples"], (size + 12) // 13))
    resamples = ((block_starts[:, :, None] + np.arange(13)) % size).reshape(len(block_starts), -1)[:, :size]
    rows = []
    for name in sorted(predictions):
        hits = hit_counts(predictions[name][:len(outcomes)], outcomes)
        development = summarize(hits[start:split], development_null)
        confirmation = summarize(hits[split:end], confirmation_null)
        for section in [development, confirmation]:
            section["adjustedPValue"] = min(1.0, section["uniformPValue"] * comparisons)
        differences = hits[split:end] - baseline_hits[split:end]
        interval = np.quantile(differences[resamples].mean(axis=1), [0.025, 0.975]).tolist()
        brier = float(np.mean((scores[name][split:end] - outcomes[split:end]) ** 2))
        rows.append({"id": name, "development": development, "confirmation": confirmation,
            "confirmationMeanGainVsCurrent": float(differences.mean()), "pairedDescriptive95Interval": interval,
            "confirmationBrierScore": brier,
            "confirmationBlocks": [summarize(hits[t:min(t + 52, end)]) for t in range(split, end, 52)],
            "eligibleForProspectiveReview": name != "current" and passes_gate(development, policy) and passes_gate(confirmation, policy)})
    challengers = [row for row in rows if row["id"] != "current"]
    selected = sorted(challengers, key=lambda row: (-row["development"]["meanHits"], row["development"]["zeroRate"], row["id"]))[0]
    best_confirmation = sorted(challengers, key=lambda row: (-row["confirmation"]["meanHits"], row["confirmation"]["zeroRate"], row["id"]))[0]
    return {"models": rows, "comparisonsIncludingPreviousSearch": comparisons,
        "developmentSelectedModel": selected["id"], "exploratoryBestConfirmationModel": best_confirmation["id"],
        "eligibleModelIds": [row["id"] for row in challengers if row["eligibleForProspectiveReview"]],
        "periods": {"development": [start + 1, split], "confirmation": [split + 1, end]},
        "uniformBaseline": {"meanHits": 0.8, "zeroRate": float(HIT_PMF[0]), "prizeRate": float(HIT_PMF[3:].sum()),
            "brierScore": BASE_RATE * (1 - BASE_RATE)}}


def passes_gate(summary, policy):
    return (summary["adjustedPValue"] <= policy["familyAlpha"]
        and summary["meanHits"] >= 0.8 + policy["minimumMeanGain"]
        and summary["zeroRate"] <= HIT_PMF[0] - policy["minimumZeroRateReduction"]
        and summary["prizeRate"] >= HIT_PMF[3:].sum())


def diagnostic_statistics(outcomes):
    count = len(outcomes)
    frequency_z = (outcomes.sum(axis=0) - count * BASE_RATE) / np.sqrt(count * BASE_RATE * (1 - BASE_RATE))
    cooccurrence = outcomes.T @ outcomes
    pair_rate = 6 * 5 / (45 * 44)
    upper = np.triu_indices(45, 1)
    pair_z = (cooccurrence[upper] - count * pair_rate) / np.sqrt(count * pair_rate * (1 - pair_rate))
    centered = outcomes - BASE_RATE
    correlations = np.array([np.sum(centered[:-lag] * centered[lag:], axis=0)
        / ((count - lag) * BASE_RATE * (1 - BASE_RATE)) for lag in range(1, 13)])
    return np.array([np.sum(frequency_z ** 2), np.max(np.abs(frequency_z)),
        np.max(np.abs(pair_z)), np.max(np.abs(correlations))])


def diagnose_draws(outcomes, policy):
    observed = diagnostic_statistics(outcomes)
    rng = np.random.default_rng(policy["randomSeed"])
    simulations = policy["diagnosticSimulations"]
    exceedances = np.zeros(len(observed), dtype=int)
    with np.errstate(all="raise"):
        for index in range(simulations):
            values = rng.random(outcomes.shape)
            picks = np.argpartition(values, 5, axis=1)[:, :6]
            simulated = np.zeros_like(outcomes)
            np.put_along_axis(simulated, picks, 1, axis=1)
            exceedances += diagnostic_statistics(simulated) >= observed
            if (index + 1) % 500 == 0:
                print(f"Randomness diagnostics {index + 1}/{simulations}", flush=True)
    names = ["overall-frequency", "largest-number-bias", "largest-pair-bias", "largest-lag-1-to-12-correlation"]
    return {"simulations": simulations, "tests": [{"id": name, "statistic": float(observed[index]),
        "monteCarloPValue": float((exceedances[index] + 1) / (simulations + 1)),
        "adjustedPValue": min(1.0, float(4 * (exceedances[index] + 1) / (simulations + 1)))} for index, name in enumerate(names)]}
