"""Past-only number features. Row t predicts draw t+1 from rows strictly before t."""

from datetime import date

import numpy as np

BASE_RATE = 6 / 45
GAP_EDGES = np.array([1, 2, 3, 5, 8, 13, 21, 35])


def encode_draws(draws):
    ordered = sorted(draws, key=lambda draw: draw["draw"])
    outcomes = np.zeros((len(ordered), 45), dtype=np.float64)
    for index, draw in enumerate(ordered):
        numbers = draw["numbers"]
        if draw["draw"] != index + 1 or len(numbers) != 6 or len(set(numbers)) != 6:
            raise ValueError("Research requires complete, unique draws starting at one")
        if any(not isinstance(number, int) or not 1 <= number <= 45 for number in numbers):
            raise ValueError("Invalid main number")
        if draw["bonus"] in numbers or not 1 <= draw["bonus"] <= 45:
            raise ValueError("Invalid bonus number")
        if index and (date.fromisoformat(draw["date"]) - date.fromisoformat(ordered[index - 1]["date"])).days != 7:
            raise ValueError("Draw dates must be seven days apart")
        outcomes[index, np.array(numbers) - 1] = 1
    return ordered, outcomes


def build_features(outcomes):
    count = len(outcomes)
    prefix = np.vstack([np.zeros(45), np.cumsum(outcomes, axis=0)])
    gaps = np.zeros((count + 1, 45))
    for t in range(1, count + 1):
        gaps[t] = np.where(outcomes[t - 1] == 1, 0, gaps[t - 1] + 1)
    parts = []
    frequencies = {}
    for window in [5, 13, 26, 52, 104, 260, 520]:
        start = np.maximum(0, np.arange(count + 1) - window)
        lengths = np.arange(count + 1) - start
        rate = (prefix - prefix[start] + 26 * BASE_RATE) / (lengths[:, None] + 26)
        frequencies[window] = rate
        parts.append(rate)
    decays = {}
    for half_life in [13, 26, 52, 104, 260]:
        decay = np.zeros((count + 1, 45))
        decay[0] = BASE_RATE
        weight = 1 - np.exp(np.log(0.5) / half_life)
        for t in range(1, count + 1):
            decay[t] = (1 - weight) * decay[t - 1] + weight * outcomes[t - 1]
        parts.append(decay)
        decays[half_life] = decay
    for lag in range(1, 11):
        lagged = np.zeros((count + 1, 45))
        lagged[lag:] = outcomes[:count + 1 - lag]
        parts.append(lagged)
    parts.extend([np.minimum(gaps, 100) / 100, np.log1p(gaps), frequencies[13] - frequencies[260]])
    local = np.stack(parts, axis=-1)
    identities = np.broadcast_to(np.eye(45), (count + 1, 45, 45))
    features = np.concatenate([local, identities], axis=-1).astype(np.float32)
    return {"x": features, "gaps": gaps, "prefix": prefix, "decays": decays}


def top_six(scores, tie_breaks):
    scores = np.asarray(scores)
    if scores.ndim != 2 or scores.shape[1] != 45 or not np.isfinite(scores).all():
        raise ValueError("Scores must be a finite draw-by-45 matrix")
    # Lexicographic random tie breaks do not change unequal scores.
    order = np.lexsort((tie_breaks, scores), axis=1)[:, -6:]
    return np.sort(order + 1, axis=1)


def hit_counts(numbers, outcomes):
    return np.take_along_axis(outcomes, numbers - 1, axis=1).sum(axis=1).astype(int)
