"""Fixed model families for chronological prediction, including the next unseen draw."""

from concurrent.futures import ProcessPoolExecutor, as_completed

import numpy as np
from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

from features import BASE_RATE, GAP_EDGES, hit_counts, top_six


def statistical_models(outcomes, features, policy):
    count = len(outcomes)
    prefix = features["prefix"]
    times = np.arange(count + 1)
    predictions = {}
    for window in policy["frequencyWindows"]:
        start = np.maximum(0, times - window) if window else np.zeros(count + 1, dtype=int)
        frequency = (prefix - prefix[start] + 26 * BASE_RATE) / ((times - start)[:, None] + 26)
        predictions[f"hot-{window or 'all'}"] = frequency
        predictions[f"cold-{window or 'all'}"] = np.clip(2 * BASE_RATE - frequency, 0.001, 0.999)
    for half_life in policy["decayHalfLives"]:
        predictions[f"decay-{half_life}"] = features["decays"][half_life]

    transitions = np.zeros((count + 1, 45, 45))
    for t in range(2, count + 1):
        transitions[t] = transitions[t - 1] + np.outer(outcomes[t - 2], outcomes[t - 1])
    for window in policy["transitionWindows"]:
        for prior in policy["transitionPriors"]:
            scores = np.full((count + 1, 45), BASE_RATE)
            for t in range(2, count + 1):
                start = max(1, t - window) if window else 1
                counts = transitions[t] - transitions[start]
                observed = prefix[t - 1] - prefix[start - 1]
                conditional = (counts + prior * BASE_RATE) / (observed[:, None] + prior)
                scores[t] = conditional[outcomes[t - 1] == 1].mean(axis=0)
            predictions[f"transition-{window or 'all'}-{prior}"] = scores

    bins = np.digitize(features["gaps"], GAP_EDGES)
    trials = np.zeros(len(GAP_EDGES) + 1)
    successes = trials.copy()
    hazard_scores = {prior: np.full((count + 1, 45), BASE_RATE) for prior in policy["hazardPriors"]}
    for t in range(count + 1):
        for prior, scores in hazard_scores.items():
            rates = (successes + prior * BASE_RATE) / (trials + prior)
            scores[t] = rates[bins[t]]
        if t < count:
            trials += np.bincount(bins[t], minlength=len(trials))
            successes += np.bincount(bins[t], weights=outcomes[t], minlength=len(trials))
    predictions.update({f"gap-hazard-{prior}": scores for prior, scores in hazard_scores.items()})

    for neighbors in policy["neighborCounts"]:
        scores = np.full((count + 1, 45), BASE_RATE)
        for t in range(2, count + 1):
            similarities = outcomes[:t - 1] @ outcomes[t - 1]
            nearest = np.lexsort((-np.arange(t - 1), -similarities))[:neighbors]
            scores[t] = (outcomes[nearest + 1].sum(axis=0) + 26 * BASE_RATE) / (len(nearest) + 26)
        predictions[f"neighbors-{neighbors}"] = scores
    return predictions


def model_configs(policy):
    configs = []
    for window in policy["learningWindows"]:
        for c in policy["logisticC"]:
            configs.append({"id": f"logistic-{window or 'all'}-{c}", "family": "logistic", "window": window, "c": c})
        for leaves in policy["boostingLeaves"]:
            configs.append({"id": f"boosting-{window or 'all'}-{leaves}", "family": "boosting", "window": window, "leaves": leaves})
        for leaf in policy["extraTreesMinLeaf"]:
            configs.append({"id": f"extra-trees-{window or 'all'}-{leaf}", "family": "extra-trees", "window": window, "leaf": leaf})
    return configs


def fit_model(config, x, outcomes, policy):
    scores = np.full((len(x), 45), BASE_RATE)
    start = policy["firstEvaluationDraw"] - 1
    step = policy["fitEveryDraws"]
    with threadpool_limits(limits=1), np.errstate(over="raise", divide="raise", invalid="raise"):
        for t in range(start, len(x), step):
            if config["family"] == "logistic":
                model = make_pipeline(StandardScaler(), LogisticRegression(C=config["c"], max_iter=500, solver="lbfgs"))
            elif config["family"] == "boosting":
                model = HistGradientBoostingClassifier(max_iter=80, learning_rate=0.05,
                    max_leaf_nodes=config["leaves"], min_samples_leaf=100, l2_regularization=20,
                    max_bins=63, early_stopping=False, random_state=policy["randomSeed"])
            else:
                model = ExtraTreesClassifier(n_estimators=96, max_depth=8, min_samples_leaf=config["leaf"],
                    max_features=0.75, n_jobs=1, random_state=policy["randomSeed"])
            first = max(26, t - config["window"]) if config["window"] else 26
            last = min(t + step, len(x))
            model.fit(x[first:t].reshape(-1, x.shape[-1]), outcomes[first:t].reshape(-1))
            scores[t:last] = model.predict_proba(x[t:last].reshape(-1, x.shape[-1]))[:, 1].reshape(-1, 45)
    return config["id"], scores


def learned_models(outcomes, features, policy, workers=3):
    configs = model_configs(policy)
    result = {}
    with ProcessPoolExecutor(max_workers=workers) as pool:
        tasks = [pool.submit(fit_model, config, features["x"], outcomes, policy) for config in configs]
        for future in as_completed(tasks):
            name, scores = future.result()
            result[name] = scores
            print(f"Fitted {name} ({len(result)}/{len(configs)})", flush=True)
    return dict(sorted(result.items()))


def adaptive_models(scores, outcomes, tie_breaks, policy):
    names = sorted(scores)
    predictions = {name: top_six(scores[name], tie_breaks) for name in names}
    hits = np.stack([hit_counts(predictions[name][:-1], outcomes) for name in names])
    result = {}
    choices = {}
    first = policy["firstEvaluationDraw"] - 1
    for window in policy["adaptiveWindows"]:
        for objective in ["mean", "any-hit", "ensemble"]:
            output = np.full((len(outcomes) + 1, 45), BASE_RATE)
            selected = []
            for t in range(first, len(output)):
                if t < first + 52:
                    selected.append([])
                    continue
                previous = hits[:, max(first, t - window):t]
                performance = (previous > 0).mean(axis=1) if objective == "any-hit" else previous.mean(axis=1)
                order = np.argsort(-performance, kind="stable")
                chosen = order[:5] if objective == "ensemble" else order[:1]
                output[t] = np.mean([scores[names[index]][t] for index in chosen], axis=0)
                selected.append([names[index] for index in chosen])
            name = f"adaptive-{objective}-{window}"
            result[name] = output
            choices[name] = selected
    return result, choices
