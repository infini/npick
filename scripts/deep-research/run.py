"""Separate pattern audit and prospective ledger; never rewrites production or v1 research."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import warnings

for variable in ["OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"]:
    os.environ.setdefault(variable, "1")

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "scripts/research"))

import numpy as np
import scipy
from threadpoolctl import threadpool_limits

from features import encode_draws
from prospective import advance_shadow_records, digest, history_digest
from pattern_diagnostics import diagnose_patterns
from pattern_evaluation import common_pattern_probabilities, detection_power, evaluate_patterns, hot104_tie_audit, negative_controls
from pattern_models import adaptive_predictions, pattern_predictions
from pattern_prospective import summarize_pattern_prospective


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data")
    args = parser.parse_args()
    warnings.simplefilter("error", RuntimeWarning)
    started = time.monotonic()
    policy = json.loads((HERE / "protocol.json").read_text())
    draws, outcomes = encode_draws(json.loads((ROOT / "data/lotto-data.json").read_text())["draws"])
    bonuses = np.array([draw["bonus"] for draw in draws])
    with threadpool_limits(limits=1):
        predictions = pattern_predictions(outcomes, bonuses, policy)
        adaptive, choices = adaptive_predictions(predictions, outcomes, policy)
        predictions.update(adaptive)
        baseline = json.loads(subprocess.check_output(["node", str(ROOT / "scripts/research/current-engine.mjs")], text=True))
        predictions["current"] = np.vstack([np.arange(1, 7), baseline])
        report = evaluate_patterns(predictions, outcomes, policy)
        print(f"Evaluated {len(predictions)} methods through draw {draws[-1]['draw']}", flush=True)
        report["tieAudit"] = hot104_tie_audit(outcomes, policy)
        report["diagnostics"] = diagnose_patterns(outcomes, bonuses, policy)
        best_mean = max(row["recent260"]["meanHits"] for row in report["models"] if row["id"] != "current")
        report["negativeControls"] = negative_controls(policy, len(outcomes), best_mean)
        report["detectionPower"] = detection_power(report["historicalComparisonFactor"])
    source_files = sorted(HERE.glob("*.py")) + [HERE / "protocol.json"]
    source_files += [ROOT / "scripts/research" / name for name in ["features.py", "evaluation.py", "prospective.py", "current-engine.mjs", "requirements.txt"]]
    source_files += [ROOT / "src/core" / name for name in ["recommendation-engine.js", "number-utils.js", "random.js"]]
    code_hash = hashlib.sha256(b"".join(str(path.relative_to(ROOT)).encode() + path.read_bytes() for path in source_files)).hexdigest()
    ledger_path = args.output_dir / "deep-research-shadow-records.json"
    input_ledger = ledger_path if ledger_path.exists() else ROOT / "data/deep-research-shadow-records.json"
    existing = json.loads(input_ledger.read_text())["records"] if input_ledger.exists() else []
    if draws[-1]["draw"] + 1 >= policy["firstProspectiveDraw"]:
        records = advance_shadow_records(existing, draws, predictions, policy, code_hash)
    else:
        if existing:
            raise ValueError("Unexpected pre-registration ledger")
        records = []
    report.update({"protocol": policy, "protocolHash": digest(policy), "codeHash": code_hash,
        "latestDraw": draws[-1]["draw"], "historyDigest": history_digest(draws),
        "versions": {"numpy": np.__version__, "scipy": scipy.__version__}, "productionEngineChanged": False,
        "modelCount": len(predictions), "adaptiveChoices": choices,
        "prospective": summarize_pattern_prospective(records, policy), "commonPatterns": common_pattern_probabilities(),
        "sourceFields": sorted(draws[0]),
        "dataQuality": {"drawCount": len(draws), "firstDraw": draws[0]["draw"], "lastDraw": draws[-1]["draw"],
            "ascendingNumberRows": sum(draw["numbers"] == sorted(draw["numbers"]) for draw in draws),
            "repeatedMainCombinations": len(draws) - len({tuple(sorted(draw["numbers"])) for draw in draws}),
            "completeWeeklyHistory": True},
        "missingPhysicalInputs": ["draw-order", "machine-id", "ball-set-id", "ball-measurements", "pre-cutoff-environment"]})
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "deep-research-analysis.json").write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
    ledger_path.write_text(json.dumps({"protocolHash": digest(policy), "records": records}, indent=2, allow_nan=False) + "\n")
    for row in sorted(report["models"], key=lambda row: -row["recent260"]["meanHits"]):
        result = row["recent260"]
        print(f"{row['id']:28s} mean={result['meanHits']:.3f} zero={result['zeroRate']:.3f} prize={result['prizeRate']:.3f} adjusted-p={result['adjustedPValues']['mean']:.3f}")
    print("Historical screen passes:", report["historicalScreenPasses"])
    print("Negative controls:", report["negativeControls"])
    print(f"Elapsed {time.monotonic() - started:.1f}s; primary recommendations unchanged.")


if __name__ == "__main__":
    main()
