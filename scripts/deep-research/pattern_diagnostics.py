"""Simulation-calibrated maxima, including the whole window/number search in each test."""

from math import comb

import numpy as np

from evaluation import HIT_PMF
from features import BASE_RATE
from pattern_evaluation import random_history

DIAGNOSTICS = ["local-frequency-window-scan", "number-frequency-change-points", "cycle-phase-number-bias",
    "previous-bonus-to-next-main", "odd-even-shape", "sum-level-and-serial-correlation", "successive-draw-overlap"]


def pattern_statistics(outcomes, bonuses):
    count = len(outcomes)
    prefix = np.vstack([np.zeros(45), np.cumsum(outcomes, axis=0)])
    variance = BASE_RATE * (1 - BASE_RATE)
    local = max(float(np.max(np.abs(prefix[window:] - prefix[:-window] - window * BASE_RATE)
        / np.sqrt(window * variance))) for window in [26, 52, 104, 260, 520] if window <= count)
    splits = np.arange(104, count - 103, 26)
    before = prefix[splits] / splits[:, None]
    after = (prefix[-1] - prefix[splits]) / (count - splits[:, None])
    change = float(np.max(np.abs(before - after) / np.sqrt(variance * (1 / splits[:, None] + 1 / (count - splits[:, None])))))
    cycle = 0
    for period in [13, 26, 52, 104]:
        frequencies = np.zeros((period, 45))
        phase = np.arange(count) % period
        np.add.at(frequencies, phase, outcomes)
        sizes = np.bincount(phase, minlength=period)[:, None]
        cycle = max(cycle, float(np.max(np.abs(frequencies - sizes * BASE_RATE) / np.sqrt(sizes * variance))))
    transitions = np.zeros((45, 45))
    np.add.at(transitions, bonuses[:-1] - 1, outcomes[1:])
    sizes = np.bincount(bonuses[:-1] - 1, minlength=45)[:, None]
    bonus = float(np.max(np.abs(transitions - sizes * BASE_RATE) / np.sqrt(np.maximum(sizes, 1) * variance)))
    odd_counts = outcomes[:, ::2].sum(axis=1).astype(int)
    expected = count * np.array([comb(23, k) * comb(22, 6 - k) / comb(45, 6) for k in range(7)])
    odd = float(np.sum((np.bincount(odd_counts, minlength=7) - expected) ** 2 / expected))
    sums = outcomes @ np.arange(1, 46) - 138
    sum_variance = 6 * ((45 ** 2 - 1) / 12) * (39 / 44)
    sum_stats = [abs(sums.mean()) / np.sqrt(sum_variance / count)]
    sum_stats += [abs(float(sums[:-lag] @ sums[lag:])) / (sum_variance * np.sqrt(count - lag)) for lag in range(1, 13)]
    overlaps = np.minimum((outcomes[1:] * outcomes[:-1]).sum(axis=1).astype(int), 3)
    expected = (count - 1) * np.r_[HIT_PMF[:3], HIT_PMF[3:].sum()]
    overlap = float(np.sum((np.bincount(overlaps, minlength=4) - expected) ** 2 / expected))
    return np.array([local, change, cycle, bonus, odd, max(sum_stats), overlap])


def diagnose_patterns(outcomes, bonuses, policy):
    observed = pattern_statistics(outcomes, bonuses)
    rng = np.random.default_rng(policy["randomSeed"] + 2)
    exceedances = np.zeros(len(observed), dtype=int)
    for index in range(policy["diagnosticSimulations"]):
        simulated, simulated_bonus = random_history(rng, len(outcomes))
        exceedances += pattern_statistics(simulated, simulated_bonus) >= observed
        if (index + 1) % 500 == 0:
            print(f"Pattern diagnostics {index + 1}/{policy['diagnosticSimulations']}", flush=True)
    return {"simulations": policy["diagnosticSimulations"], "tests": [
        {"id": name, "statistic": float(observed[index]),
            "monteCarloPValue": float((exceedances[index] + 1) / (policy["diagnosticSimulations"] + 1)),
            "adjustedPValue": min(1.0, float(len(observed) * (exceedances[index] + 1) / (policy["diagnosticSimulations"] + 1)))}
        for index, name in enumerate(DIAGNOSTICS)],
        "interpretation": "Each simulation repeats each entire scan; seven new test families are Bonferroni-adjusted. Historical exploratory diagnostics, not proof of fairness."}
