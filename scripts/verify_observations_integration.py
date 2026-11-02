#!/usr/bin/env python3
"""Verification script for observations_all_3391.jsonl integration."""

from __future__ import annotations

import json
import os
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

EXPECTED_LINE_COUNT = 3391
ALL_13_KEYS = [
    "free_tags",
    "image_id",
    "image_path",
    "meshi_key",
    "notable_characteristics",
    "observed_at",
    "observed_by",
    "original_path",
    "prompt_version",
    "short_caption",
    "source_set",
    "tableware_and_setting",
    "visual_elements",
]


def verify_observations_integration(
    jsonl_path: str | Path,
    mapping_json_path: str | Path | None = None,
) -> Dict[str, Any]:
    jsonl_path = Path(jsonl_path)
    if not jsonl_path.exists():
        raise FileNotFoundError(f"Observation file not found: {jsonl_path}")

    w2_map: Dict[str, Dict[str, Any]] = {}
    if mapping_json_path and Path(mapping_json_path).exists():
        with open(mapping_json_path, encoding="utf-8") as f:
            data = json.load(f)
            records = data.get("records", [])
            w2_map = {r["blind_id"]: r for r in records}

    total_lines = 0
    image_ids: List[str] = []
    meshi_keys: List[str] = []
    missing_meshi_key_ids: List[str] = []
    
    key_distribution: Counter[Tuple[str, ...]] = Counter()
    missing_keys_summary: Counter[str] = Counter()
    empty_fields_summary: Counter[str] = Counter()
    
    image_path_exists_count = 0
    original_path_exists_count = 0
    either_path_exists_count = 0
    neither_path_exists_ids: List[str] = []

    records: List[Dict[str, Any]] = []

    with open(jsonl_path, encoding="utf-8") as f:
        for idx, line in enumerate(f, 1):
            total_lines += 1
            record = json.loads(line)
            records.append(record)
            
            iid = record.get("image_id", "")
            image_ids.append(iid)

            # Key presence
            current_keys = tuple(sorted(record.keys()))
            key_distribution[current_keys] += 1
            for k in ALL_13_KEYS:
                if k not in record:
                    missing_keys_summary[k] += 1
                else:
                    v = record[k]
                    if v is None or v == "" or (isinstance(v, (list, dict)) and len(v) == 0):
                        empty_fields_summary[k] += 1

            # Path checks
            ip = record.get("image_path")
            op = record.get("original_path")
            ip_exists = bool(ip and os.path.exists(ip))
            op_exists = bool(op and os.path.exists(op))

            if ip_exists:
                image_path_exists_count += 1
            if op_exists:
                original_path_exists_count += 1
            if ip_exists or op_exists:
                either_path_exists_count += 1
            else:
                neither_path_exists_ids.append(iid)

            # meshi_key check
            mk = record.get("meshi_key")
            if mk:
                meshi_keys.append(mk)
            else:
                missing_meshi_key_ids.append(iid)

    # Sequence and continuity verification
    blind_a_ids = [iid for iid in image_ids if iid.startswith("blind_A_")]
    blind_ext_ids = [iid for iid in image_ids if iid.startswith("blind_ext_")]
    blind_w2_ids = [iid for iid in image_ids if iid.startswith("blind_w2_")]

    # Check continuity of blind_A (001..280), blind_ext (0001..0367), blind_w2 (0001..2744)
    a_nums = [int(re.search(r"blind_A_(\d+)", iid).group(1)) for iid in blind_a_ids]
    ext_nums = [int(re.search(r"blind_ext_(\d+)", iid).group(1)) for iid in blind_ext_ids]
    w2_nums = [int(re.search(r"blind_w2_(\d+)", iid).group(1)) for iid in blind_w2_ids]

    a_continuous = a_nums == list(range(1, 281))
    ext_continuous = ext_nums == list(range(1, 368))
    w2_continuous = w2_nums == list(range(1, 2745))

    id_counter = Counter(image_ids)
    duplicate_image_ids = {k: v for k, v in id_counter.items() if v > 1}

    meshi_counter = Counter(meshi_keys)
    duplicate_meshi_keys = {k: v for k, v in meshi_counter.items() if v > 1}

    return {
        "total_lines": total_lines,
        "line_count_match": total_lines == EXPECTED_LINE_COUNT,
        "image_id_stats": {
            "total_ids": len(image_ids),
            "unique_ids": len(set(image_ids)),
            "duplicate_ids_count": len(duplicate_image_ids),
            "duplicate_ids": duplicate_image_ids,
            "blind_a_count": len(blind_a_ids),
            "blind_a_continuous": a_continuous,
            "blind_ext_count": len(blind_ext_ids),
            "blind_ext_continuous": ext_continuous,
            "blind_w2_count": len(blind_w2_ids),
            "blind_w2_continuous": w2_continuous,
            "blind_w2_min": min(w2_nums) if w2_nums else None,
            "blind_w2_max": max(w2_nums) if w2_nums else None,
        },
        "key_completeness": {
            "all_13_keys_complete_count": key_distribution[tuple(sorted(ALL_13_KEYS))],
            "key_distribution": [
                {"keys_count": len(k), "count": count, "missing_keys": sorted(set(ALL_13_KEYS) - set(k))}
                for k, count in key_distribution.items()
            ],
            "missing_keys_per_field": dict(missing_keys_summary),
            "empty_fields_per_field": dict(empty_fields_summary),
        },
        "path_resolution": {
            "image_path_exists_count": image_path_exists_count,
            "original_path_exists_count": original_path_exists_count,
            "either_path_exists_count": either_path_exists_count,
            "neither_path_exists_count": len(neither_path_exists_ids),
            "neither_path_exists_ids": neither_path_exists_ids,
        },
        "meshi_key_uniqueness": {
            "meshi_keys_present_count": len(meshi_keys),
            "missing_meshi_key_count": len(missing_meshi_key_ids),
            "missing_meshi_key_ids": missing_meshi_key_ids,
            "unique_meshi_keys_count": len(set(meshi_keys)),
            "duplicate_meshi_keys_count": len(duplicate_meshi_keys),
            "duplicate_meshi_keys": duplicate_meshi_keys,
        },
    }


if __name__ == "__main__":
    base = Path("state/mediapipe_labeling_runs/open_observation_20261013")
    jsonl = base / "observations_all_3391.jsonl"
    mapping = base / "blind_w2_mapping.json"
    result = verify_observations_integration(jsonl, mapping)
    print(json.dumps(result, indent=2, ensure_ascii=False))
