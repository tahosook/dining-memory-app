#!/usr/bin/env python3
"""
scripts/publish_mediapipe_model.py

MediaPipe Model Publishing & 4-File SHA-256 Synchronization Automation

Workflow:
1. Validates the candidate .task model file (file existence, size 1MB-20MB, TFLite/ZIP signature).
2. Computes the SHA-256 checksum and creates a .task.sha256 file.
3. Uploads model and sha256 to GitHub Releases (via `gh release upload --clobber`).
4. Performs clean fetch verification by downloading via curl into a temp dir and verifying checksum.
5. Atomically updates the SHA-256 checksum across all 4 canonical files:
   - src/ai/mealInputAssist/modelConfig.ts
   - scripts/ensure-mediapipe-model.sh
   - scripts/build-android-release.sh
   - android/app/build.gradle
6. Synchronizes local bundled assets via `bash scripts/ensure-mediapipe-model.sh`.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Dict, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent

CANONICAL_MODELS: Dict[str, Dict[str, str]] = {
    "cooking_method_9class": {
        "file_name": "meal-input-assist.task",
        "env_var": "MEDIAPIPE_MODEL_SHA256",
        "gradle_property": "expectedShaStandard",
    },
    "universal_dining_23class": {
        "file_name": "universal_dining_23class.task",
        "env_var": "MEDIAPIPE_UNIVERSAL_MODEL_SHA256",
        "gradle_property": "expectedShaUniversal",
    },
    "personal_multilabel_44tag": {
        "file_name": "personal_multilabel_44tag.task",
        "env_var": "MEDIAPIPE_PERSONAL_MODEL_SHA256",
        "gradle_property": "expectedShaPersonal",
    },
}

DEFAULT_RELEASE_TAG = "mediapipe-model-v0.1.0"
MIN_MODEL_BYTES = 1024 * 1024  # 1 MB
MAX_MODEL_BYTES = 25 * 1024 * 1024  # 25 MB


def compute_sha256(file_path: Path) -> str:
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def validate_model_file(file_path: Path, expected_filename: str) -> None:
    if not file_path.is_file():
        raise FileNotFoundError(f"Model file not found: {file_path}")

    size = file_path.stat().st_size
    if size < MIN_MODEL_BYTES or size > MAX_MODEL_BYTES:
        raise ValueError(
            f"Invalid model file size: {size} bytes (expected between {MIN_MODEL_BYTES} and {MAX_MODEL_BYTES} bytes)"
        )

    # MediaPipe .task files are either zip archives containing metadata or raw TFLite buffers
    with open(file_path, "rb") as f:
        header = f.read(16)

    is_zip = header.startswith(b"PK\x03\x04")
    is_tflite = len(header) >= 8 and (header[4:8] == b"TFL3" or b"TFL" in header)

    if not (is_zip or is_tflite):
        raise ValueError(
            f"File {file_path} is neither a valid TFLite model nor a MediaPipe task ZIP archive (header: {header[:8]!r})"
        )

    if is_zip:
        try:
            with zipfile.ZipFile(file_path, "r") as z:
                names = z.namelist()
                has_model = any(n.endswith(".tflite") for n in names)
                if not has_model:
                    raise ValueError(f"Task ZIP archive does not contain a .tflite model: {names}")
        except zipfile.BadZipFile as e:
            raise ValueError(f"Corrupted ZIP task archive: {e}") from e


def update_model_config_ts(ts_path: Path, model_id: str, new_sha: str) -> str:
    content = ts_path.read_text(encoding="utf-8")
    # Match the model block within MEDIAPIPE_CLASSIFIER_MODELS
    pattern = re.compile(
        rf"({re.escape(model_id)}:\s*\{{[^}}]*?sha256:\s*')[a-f0-9]{{64}}(')",
        re.DOTALL,
    )
    if not pattern.search(content):
        raise ValueError(f"Could not find model block for '{model_id}' in {ts_path}")

    updated = pattern.sub(rf"\g<1>{new_sha}\g<2>", content)
    return updated


def update_ensure_script_sh(sh_path: Path, file_name: str, new_sha: str) -> str:
    content = sh_path.read_text(encoding="utf-8")
    # Match MODEL_X_FILE="<file_name>" followed by MODEL_X_SHA="...:-<old_sha>}"
    pattern = re.compile(
        rf'(MODEL_\d+_FILE="{re.escape(file_name)}"[^\n]*\nMODEL_\d+_SHA=".*?[:-])[a-f0-9]{{64}}([}}"]+)',
        re.MULTILINE,
    )
    if not pattern.search(content):
        raise ValueError(f"Could not find MODEL_X_SHA for '{file_name}' in {sh_path}")

    return pattern.sub(rf"\g<1>{new_sha}\g<2>", content)


def update_build_android_release_sh(sh_path: Path, file_name: str, new_sha: str) -> str:
    content = sh_path.read_text(encoding="utf-8")
    # Match "<file_name>")\n      echo "${...:-<sha>}"
    pattern = re.compile(
        rf'("{re.escape(file_name)}"\)\s*\n\s*echo "\${{[^}}]*?:-)[a-f0-9]{{64}}(\}}")',
        re.MULTILINE,
    )
    if not pattern.search(content):
        raise ValueError(f"Could not find expected_sha256 for '{file_name}' in {sh_path}")

    return pattern.sub(rf"\g<1>{new_sha}\g<2>", content)


def update_build_gradle(gradle_path: Path, file_name: str, gradle_property: str, new_sha: str) -> str:
    content = gradle_path.read_text(encoding="utf-8")

    # 1. Update inputs.property("<gradle_property>", ... ?: "<old_sha>")
    prop_pattern = re.compile(
        rf'(inputs\.property\("{re.escape(gradle_property)}",\s*System\.getenv\([^)]*\)\s*\?:\s*")[a-f0-9]{{64}}(")',
        re.MULTILINE,
    )
    if not prop_pattern.search(content):
        raise ValueError(f"Could not find inputs.property for '{gradle_property}' in {gradle_path}")
    content = prop_pattern.sub(rf"\g<1>{new_sha}\g<2>", content)

    # 2. Update requiredModels entry
    model_pattern = re.compile(
        rf'(name:\s*"{re.escape(file_name)}",\s*\n\s*expectedSha:\s*System\.getenv\([^)]*\)\s*\?:\s*")[a-f0-9]{{64}}(")',
        re.MULTILINE,
    )
    if not model_pattern.search(content):
        raise ValueError(f"Could not find requiredModels entry for '{file_name}' in {gradle_path}")
    content = model_pattern.sub(rf"\g<1>{new_sha}\g<2>", content)

    return content


def sync_all_files(root: Path, model_id: str, new_sha: str, dry_run: bool = False) -> None:
    spec = CANONICAL_MODELS[model_id]
    file_name = spec["file_name"]
    gradle_property = spec["gradle_property"]

    paths = {
        "modelConfig.ts": root / "src/ai/mealInputAssist/modelConfig.ts",
        "ensure-mediapipe-model.sh": root / "scripts/ensure-mediapipe-model.sh",
        "build-android-release.sh": root / "scripts/build-android-release.sh",
        "build.gradle": root / "android/app/build.gradle",
    }

    for name, p in paths.items():
        if not p.is_file():
            raise FileNotFoundError(f"Required target file not found: {p}")

    new_ts = update_model_config_ts(paths["modelConfig.ts"], model_id, new_sha)
    new_ensure = update_ensure_script_sh(paths["ensure-mediapipe-model.sh"], file_name, new_sha)
    new_release = update_build_android_release_sh(paths["build-android-release.sh"], file_name, new_sha)
    new_gradle = update_build_gradle(paths["build.gradle"], file_name, gradle_property, new_sha)

    if dry_run:
        print(f"[DRY-RUN] Would update SHA-256 to {new_sha} in:")
        for name in paths:
            print(f"  - {name}")
        return

    paths["modelConfig.ts"].write_text(new_ts, encoding="utf-8")
    paths["ensure-mediapipe-model.sh"].write_text(new_ensure, encoding="utf-8")
    paths["build-android-release.sh"].write_text(new_release, encoding="utf-8")
    paths["build.gradle"].write_text(new_gradle, encoding="utf-8")

    print(f"✓ Synchronized SHA-256 checksum ({new_sha}) across 4 canonical files:")
    for name in paths:
        print(f"  ✓ {name}")


def prepare_release_assets(
    model_path: Path, expected_filename: str, sha256: str, staging_dir: Path
) -> Tuple[Path, Path]:
    """
    Ensures release assets always match the canonical model file name and SHA-256 file name,
    regardless of what input filename the user supplied.
    """
    staging_dir.mkdir(parents=True, exist_ok=True)
    canonical_model = staging_dir / expected_filename
    if model_path != canonical_model:
        shutil.copy2(model_path, canonical_model)
    canonical_sha = staging_dir / f"{expected_filename}.sha256"
    canonical_sha.write_text(f"{sha256}  {expected_filename}\n", encoding="utf-8")
    return canonical_model, canonical_sha


def upload_to_github_releases(model_file: Path, sha_file: Path, release_tag: str) -> None:
    print(f"Uploading {model_file.name} to GitHub Releases ({release_tag})...")
    cmd = [
        "gh",
        "release",
        "upload",
        release_tag,
        str(model_file),
        str(sha_file),
        "--clobber",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"Failed to upload release asset via gh CLI:\n{res.stderr}\n{res.stdout}")
    print(f"✓ Uploaded {model_file.name} and {sha_file.name} to {release_tag}")


def verify_clean_fetch(download_url: str, expected_sha: str) -> None:
    print(f"Verifying clean fetch from remote: {download_url}...")
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_file = Path(tmp_dir) / "downloaded_model.task"
        cmd = ["curl", "-fL", "--retry", "3", "--retry-delay", "2", "-o", str(tmp_file), download_url]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"Clean fetch verification failed - download error:\n{res.stderr}")
        actual_sha = compute_sha256(tmp_file)
        if actual_sha != expected_sha:
            raise RuntimeError(
                f"Clean fetch verification failed - checksum mismatch:\nExpected: {expected_sha}\nActual:   {actual_sha}"
            )
    print(f"✓ Clean fetch verification passed (100% checksum match: {expected_sha})")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Publish MediaPipe model to GitHub Releases and synchronize SHA-256 across all canonical files."
    )
    parser.add_argument(
        "--model-id",
        required=True,
        choices=list(CANONICAL_MODELS.keys()),
        help=f"Target model identifier ({', '.join(CANONICAL_MODELS.keys())})",
    )
    parser.add_argument(
        "--model-path",
        required=True,
        type=Path,
        help="Path to the trained .task model file",
    )
    parser.add_argument(
        "--release-tag",
        default=DEFAULT_RELEASE_TAG,
        help=f"GitHub Releases tag (default: {DEFAULT_RELEASE_TAG})",
    )
    parser.add_argument(
        "--skip-upload",
        action="store_true",
        help="Skip uploading to GitHub Releases (only sync files and local assets)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and preview SHA changes without modifying files or uploading",
    )
    args = parser.parse_args()

    model_spec = CANONICAL_MODELS[args.model_id]
    expected_filename = model_spec["file_name"]
    model_path = args.model_path.resolve()

    print(f"==> Publishing MediaPipe Model: {args.model_id} ({expected_filename})")
    print(f"Source file: {model_path}")

    # Step 1: Validate file
    validate_model_file(model_path, expected_filename)
    sha256 = compute_sha256(model_path)
    print(f"✓ Binary validated: size={model_path.stat().st_size} bytes, sha256={sha256}")

    # Optionally persist .sha256 next to the source file for convenience
    try:
        source_sha_file = model_path.parent / f"{model_path.name}.sha256"
        if not args.dry_run:
            source_sha_file.write_text(f"{sha256}  {model_path.name}\n", encoding="utf-8")
    except OSError:
        pass

    # Step 2: Upload to Releases & Verify fetch
    download_url = f"https://github.com/tahosook/dining-memory-app/releases/download/{args.release_tag}/{expected_filename}"
    if not args.skip_upload and not args.dry_run:
        with tempfile.TemporaryDirectory() as staging_tmp:
            staging_dir = Path(staging_tmp)
            canonical_model, canonical_sha = prepare_release_assets(
                model_path, expected_filename, sha256, staging_dir
            )
            upload_to_github_releases(canonical_model, canonical_sha, args.release_tag)
            verify_clean_fetch(download_url, sha256)
    else:
        print("[INFO] Skipping remote upload & fetch verification.")

    # Step 3: Update 4 canonical files
    sync_all_files(ROOT_DIR, args.model_id, sha256, dry_run=args.dry_run)

    # Step 4: Ensure local assets
    if not args.dry_run:
        print("==> Synchronizing bundled local assets...")
        ensure_cmd = ["bash", str(ROOT_DIR / "scripts/ensure-mediapipe-model.sh")]
        subprocess.run(ensure_cmd, check=True)

    print("==> Model publishing and 4-file synchronization complete!")


if __name__ == "__main__":
    main()
