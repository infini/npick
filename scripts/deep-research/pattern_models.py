"""Past-only, deterministic pattern candidates; no optimization against future results."""

import numpy as np

from features import BASE_RATE, GAP_EDGES, hit_counts


def top_numbers(scores):
    scores = np.asarray(scores, dtype=np.float64)
    if scores.shape != (45,) or not np.isfinite(scores).all():
        raise ValueError("Expected 45 finite scores")
    return np.sort(np.argsort(-scores, kind="stable")[:6] + 1)


def diverse_numbers(history, penalty=None):
    selected = []
    uncovered = np.ones(len(history), dtype=bool)
    counts = history.sum(axis=0)
    pairs = history.T @ history if penalty is not None else None
    for _ in range(6):
        scores = history[uncovered].sum(axis=0) if penalty is None else counts - penalty * pairs[:, selected].sum(axis=1)
        scores = scores.astype(float)
        scores[selected] = -np.inf
        number = int(np.argmax(scores))
        selected.append(number)
        uncovered &= history[:, number] == 0
    return np.sort(np.array(selected) + 1)


def model_names(policy):
    names = [f"{kind}-{window or 'all'}" for kind in ["hot", "cold", "coverage"] for window in policy["frequencyWindows"]]
    names += [f"pair-{window}-{penalty}" for window in policy["pairWindows"] for penalty in policy["pairPenalties"]]
    names += [f"momentum-{short}-{long}" for short, long in policy["momentumWindows"]]
    names += [f"{kind}-{window or 'all'}" for kind in ["bonus-transition", "number-hazard"] for window in policy["conditionalWindows"]]
    names += [f"cycle-{period}" for period in policy["cyclePeriods"]]
    return sorted(names)


def pattern_predictions(outcomes, bonuses, policy):
    count = len(outcomes)
    if outcomes.shape != (count, 45) or len(bonuses) != count or np.any(outcomes.sum(axis=1) != 6):
        raise ValueError("Expected aligned six-number outcomes and bonuses")
    predictions = {name: np.tile(np.arange(1, 7), (count + 1, 1)) for name in model_names(policy)}
    prefix = np.vstack([np.zeros(45), np.cumsum(outcomes, axis=0)])
    gaps = np.zeros((count + 1, 45), dtype=int)
    for t in range(1, count + 1):
        gaps[t] = np.where(outcomes[t - 1] == 1, 0, gaps[t - 1] + 1)
    bins = np.digitize(gaps, GAP_EDGES)
    prior = policy["conditionalPrior"]
    for t in range(policy["firstEvaluationDraw"] - 1, count + 1):
        for window in policy["frequencyWindows"]:
            start = max(0, t - window) if window else 0
            counts = prefix[t] - prefix[start]
            predictions[f"hot-{window or 'all'}"][t] = top_numbers(counts)
            predictions[f"cold-{window or 'all'}"][t] = top_numbers(-counts)
            predictions[f"coverage-{window or 'all'}"][t] = diverse_numbers(outcomes[start:t])
        for window in policy["pairWindows"]:
            for penalty in policy["pairPenalties"]:
                predictions[f"pair-{window}-{penalty}"][t] = diverse_numbers(outcomes[max(0, t - window):t], penalty)
        for short, long in policy["momentumWindows"]:
            recent = (prefix[t] - prefix[max(0, t - short)]) / min(t, short)
            previous = (prefix[t] - prefix[max(0, t - long)]) / min(t, long)
            predictions[f"momentum-{short}-{long}"][t] = top_numbers(2 * recent - previous)
        for window in policy["conditionalWindows"]:
            start = max(1, t - window) if window else 1
            selected = bonuses[start - 1:t - 1] == bonuses[t - 1]
            scores = (outcomes[start:t][selected].sum(axis=0) + prior * BASE_RATE) / (selected.sum() + prior)
            predictions[f"bonus-transition-{window or 'all'}"][t] = top_numbers(scores)
            start = max(0, t - window) if window else 0
            matching = bins[start:t] == bins[t]
            scores = ((outcomes[start:t] * matching).sum(axis=0) + prior * BASE_RATE) / (matching.sum(axis=0) + prior)
            predictions[f"number-hazard-{window or 'all'}"][t] = top_numbers(scores)
        for period in policy["cyclePeriods"]:
            lag = t - np.arange(t)
            phase = lag % period
            selected = (lag >= period - policy["cycleRadius"]) & (
                (phase <= policy["cycleRadius"]) | (phase >= period - policy["cycleRadius"]))
            predictions[f"cycle-{period}"][t] = top_numbers(outcomes[:t][selected].sum(axis=0))
    return predictions


def adaptive_predictions(predictions, outcomes, policy):
    names = sorted(predictions)
    count = len(outcomes)
    hits = np.stack([hit_counts(predictions[name][:-1], outcomes) for name in names])
    result, choices = {}, {}
    start = policy["firstSelectionDraw"] - 1
    window = policy["selectionWindow"]
    for objective in ["mean", "any-hit", "prize"]:
        output = predictions["hot-104"].copy()
        selected = []
        for t in range(start, count + 1, policy["selectionBlock"]):
            previous = hits[:, max(policy["firstEvaluationDraw"] - 1, t - window):t]
            values = previous if objective == "mean" else previous > 0 if objective == "any-hit" else previous >= 3
            best = int(np.argmax(values.mean(axis=1)))
            end = min(t + policy["selectionBlock"], count + 1)
            output[t:end] = predictions[names[best]][t:end]
            selected.append({"fromDraw": t + 1, "toDraw": end, "model": names[best]})
        name = f"nested-{objective}"
        result[name], choices[name] = output, selected
    for eta in policy["expertLearningRates"]:
        output = predictions["hot-104"].copy()
        for t in range(start, count + 1):
            previous = hits[:, max(policy["firstEvaluationDraw"] - 1, t - window):t]
            log_weights = eta * previous.sum(axis=1)
            weights = np.exp(log_weights - log_weights.max())
            votes = np.zeros(45)
            for weight, name in zip(weights, names):
                votes[predictions[name][t] - 1] += weight
            output[t] = top_numbers(votes)
        result[f"expert-mixture-{eta}"] = output
    return result, choices
