"""Three separately budgeted, optional-stopping-safe prospective objectives."""

import math

import numpy as np
from scipy.special import logsumexp

from evaluation import HIT_PMF, summarize
from pattern_evaluation import practical_objectives

SCORES = {"mean": np.arange(7), "zero": (np.arange(7) > 0).astype(int),
    "prize": (np.arange(7) >= 3).astype(int)}


def log_evidence(hits, policy):
    tilts = np.asarray(policy["eValueTilts"])
    hits = np.asarray(hits, dtype=int)
    evidence = {}
    for name, score in SCORES.items():
        normalizers = np.log(np.exp(tilts[:, None] * score) @ HIT_PMF)
        evidence[name] = float(logsumexp(tilts * score[hits].sum() - len(hits) * normalizers)
            - math.log(len(tilts)))
    return evidence


def summarize_pattern_prospective(records, policy):
    evaluated = [record for record in records if record["status"] == "evaluated"]
    names = sorted(records[-1]["predictions"]) if records else []
    challenger_count = len([name for name in names if name != "current"])
    threshold = len(SCORES) * challenger_count / policy["familyAlpha"] if challenger_count else None
    rows = []
    for name in names:
        hits = [record["hits"][name] for record in evaluated]
        logs = log_evidence(hits, policy)
        summary = summarize(hits) if hits else {"count": 0, "meanHits": None, "zeroRate": None, "prizeRate": None}
        practical = practical_objectives(summary, policy) if hits else {}
        reached = [objective for objective, passes in practical.items() if passes
            and name != "current" and len(hits) >= policy["minimumProspectiveWeeks"]
            and logs[objective] >= math.log(threshold)]
        rows.append({"id": name, **summary, "logEValues": logs,
            "eValues": {objective: math.exp(min(value, 700)) for objective, value in logs.items()},
            "objectivesReached": reached, "evidenceReached": bool(reached)})
    return {"firstTargetDraw": records[0]["targetDraw"] if records else None,
        "pendingTargetDraw": next((record["targetDraw"] for record in reversed(records) if record["status"] == "pending"), None),
        "evaluatedWeeks": len(evaluated), "hypothesesPerChallenger": len(SCORES),
        "evidenceThreshold": threshold, "models": rows}
