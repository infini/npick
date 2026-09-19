"""Immutable, pre-draw shadow predictions and optional-stopping-safe evidence tracking."""

from datetime import datetime, timedelta, timezone
import hashlib
import json
import math

import numpy as np
from scipy.special import logsumexp

from evaluation import HIT_PMF, summarize

KST = timezone(timedelta(hours=9))


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()).hexdigest()


def history_digest(draws):
    return digest([{key: draw[key] for key in ["draw", "date", "numbers", "bonus"]} for draw in draws])


def advance_shadow_records(existing, draws, predictions, policy, code_hash, now=None):
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("Research timestamp must have a timezone")
    if any(np.shape(numbers) != (len(draws) + 1, 6) for numbers in predictions.values()):
        raise ValueError("Forecast rows must align with the full history and next draw")
    policy_hash = digest(policy)
    by_draw = {draw["draw"]: draw for draw in draws}
    records = json.loads(json.dumps(existing))
    targets = set()
    for record in records:
        target = record["targetDraw"]
        if target in targets or target != record["baseDraw"] + 1 or target < policy["firstProspectiveDraw"]:
            raise ValueError("Invalid or duplicated shadow target")
        targets.add(target)
        if record["protocolHash"] != policy_hash:
            raise ValueError("Use a separate ledger for a new research protocol")
        base = by_draw.get(record["baseDraw"])
        expected_date = (datetime.fromisoformat(base["date"]) + timedelta(days=7)).date().isoformat() if base else None
        if record["targetDate"] != expected_date:
            raise ValueError("Shadow target date does not match the base draw")
        cutoff = datetime.fromisoformat(f"{expected_date}T20:00:00+09:00")
        created = datetime.fromisoformat(record["createdAt"])
        if created.tzinfo is None or created >= cutoff or created > now:
            raise ValueError("Shadow predictions must be timestamped before the sales cutoff")
        if record["historyDigest"] != history_digest([draw for draw in draws if draw["draw"] <= record["baseDraw"]]):
            raise ValueError("Shadow history has changed")
        if record["forecastDigest"] != digest(record["predictions"]):
            raise ValueError("Shadow forecast digest does not match")
        validate_predictions(record["predictions"], predictions.keys())
        actual = by_draw.get(target)
        if actual:
            record["status"] = "evaluated"
            record["hits"] = {name: len(set(numbers) & set(actual["numbers"])) for name, numbers in record["predictions"].items()}
        else:
            record["status"] = "pending"
            record.pop("hits", None)
    latest = draws[-1]
    target = latest["draw"] + 1
    if target < policy["firstProspectiveDraw"]:
        raise ValueError("Cannot record forecasts before the registered prospective period")
    if target not in targets:
        target_date = (datetime.fromisoformat(latest["date"]) + timedelta(days=7)).date().isoformat()
        if now >= datetime.fromisoformat(f"{target_date}T20:00:00+09:00"):
            raise ValueError("Cannot create a shadow forecast after the sales cutoff")
        forecast = {name: numbers[-1].tolist() for name, numbers in sorted(predictions.items())}
        validate_predictions(forecast, predictions.keys())
        records.append({"protocolVersion": policy["version"], "protocolHash": policy_hash,
            "codeHash": code_hash, "baseDraw": latest["draw"], "targetDraw": target,
            "targetDate": target_date, "createdAt": now.isoformat(), "historyDigest": history_digest(draws),
            "forecastDigest": digest(forecast), "status": "pending", "predictions": forecast})
    return sorted(records, key=lambda record: record["targetDraw"])


def validate_predictions(predictions, model_names):
    if set(predictions) != set(model_names):
        raise ValueError("Shadow model list has changed")
    for numbers in predictions.values():
        if len(numbers) != 6 or len(set(numbers)) != 6 or any(type(n) is not int or not 1 <= n <= 45 for n in numbers):
            raise ValueError("Shadow forecasts require six distinct numbers")


def summarize_prospective(records, policy):
    evaluated = [record for record in records if record["status"] == "evaluated"]
    models = sorted(records[-1]["predictions"]) if records else []
    challenger_count = len([name for name in models if name != "current"])
    threshold = challenger_count / policy["familyAlpha"] if challenger_count else None
    tilts = np.array(policy["eValueTilts"])
    normalizers = np.log(np.exp(tilts[:, None] * np.arange(7)) @ HIT_PMF)
    evidence = []
    for name in models:
        hits = [record["hits"][name] for record in evaluated]
        log_e = float(logsumexp(tilts * sum(hits) - len(hits) * normalizers) - math.log(len(tilts)))
        summary = summarize(hits) if hits else {"count": 0, "meanHits": None, "zeroRate": None, "prizeRate": None}
        evidence.append({"id": name, **summary, "logEValue": log_e,
            "eValue": math.exp(min(log_e, 700)),
            "evidenceReached": name != "current" and len(hits) >= policy["minimumProspectiveWeeks"] and log_e >= math.log(threshold)
                and summary["meanHits"] >= 0.8 + policy["minimumMeanGain"]
                and summary["zeroRate"] <= HIT_PMF[0] - policy["minimumZeroRateReduction"]
                and summary["prizeRate"] >= HIT_PMF[3:].sum()})
    return {"firstTargetDraw": records[0]["targetDraw"] if records else None,
        "pendingTargetDraw": next((record["targetDraw"] for record in reversed(records) if record["status"] == "pending"), None),
        "evaluatedWeeks": len(evaluated), "evidenceThreshold": threshold, "models": evidence}
