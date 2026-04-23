#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from mediapipe_labeling_common import compare_reports, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="before / after summary.json を比較し、MediaPipe labeling 改善判定を JSON で出力します。"
    )
    parser.add_argument("--before-summary", required=True, help="変更前 summary.json")
    parser.add_argument("--after-summary", required=True, help="変更後 summary.json")
    parser.add_argument("--config", required=True, help="config/mediapipe_labeling_goals.json")
    parser.add_argument("--output-path", default=None, help="比較 JSON の保存先")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    before_summary = Path(args.before_summary).expanduser().resolve()
    after_summary = Path(args.after_summary).expanduser().resolve()
    config_path = Path(args.config).expanduser().resolve()

    for path in (before_summary, after_summary, config_path):
        if not path.is_file():
            print(f"Required file not found: {path}", file=sys.stderr)
            return 2

    result = compare_reports(
        before_summary_path=before_summary,
        after_summary_path=after_summary,
        config_path=config_path,
    )

    if args.output_path:
        output_path = Path(args.output_path).expanduser().resolve()
        write_json(output_path, result)

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
