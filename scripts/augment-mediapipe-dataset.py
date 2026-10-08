#!/usr/bin/env python3
"""
MediaPipe Dataset Augmentation Script for Imbalanced Classes

Augments training samples for under-represented classes using PIL
(rotations, flips, brightness, contrast adjustments) while strictly
preserving the 'test' split (Golden Test Set) and 'val' split unchanged.

Usage:
    python3 scripts/augment-mediapipe-dataset.py \
      --source-dataset-dir state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset \
      --output-dataset-dir state/mediapipe-dataset/augmented \
      --target-per-class 15
"""
from __future__ import annotations

import argparse
import hashlib
import random
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image, ImageEnhance
except ImportError:
    Image = None  # type: ignore[assignment]
    ImageEnhance = None  # type: ignore[assignment]


def check_dependencies() -> None:
    if Image is None or ImageEnhance is None:
        print(
            "ERROR: 'Pillow' is not installed in the current Python environment.\n"
            "Please use the project's virtual environment:\n"
            "  uv run --python .venv_mediapipe python scripts/augment-mediapipe-dataset.py ...\n",
            file=sys.stderr,
        )
        sys.exit(1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Augment training images for minority classes in a MediaPipe dataset."
    )
    parser.add_argument(
        "--source-dataset-dir",
        type=str,
        default="state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset",
        help="Path to source dataset directory containing train/val/test splits",
    )
    parser.add_argument(
        "--output-dataset-dir",
        type=str,
        default="state/mediapipe-dataset/augmented",
        help="Path to output augmented dataset directory",
    )
    parser.add_argument(
        "--target-per-class",
        type=int,
        default=15,
        help="Target minimum number of training images per class (default: 15)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for deterministic augmentations (default: 42)",
    )
    return parser.parse_args()


def augment_image(img: Image.Image, op_idx: int) -> Image.Image:
    """Apply deterministic augmentation operations based on index."""
    res = img.copy()
    if op_idx == 0:
        res = res.transpose(Image.FLIP_LEFT_RIGHT)
    elif op_idx == 1:
        res = res.rotate(10, expand=False, resample=Image.BILINEAR)
    elif op_idx == 2:
        res = res.rotate(-10, expand=False, resample=Image.BILINEAR)
    elif op_idx == 3:
        enhancer = ImageEnhance.Brightness(res)
        res = enhancer.enhance(1.15)
    elif op_idx == 4:
        enhancer = ImageEnhance.Brightness(res)
        res = enhancer.enhance(0.85)
    elif op_idx == 5:
        enhancer = ImageEnhance.Contrast(res)
        res = enhancer.enhance(1.15)
    elif op_idx == 6:
        res = res.transpose(Image.FLIP_LEFT_RIGHT).rotate(8, expand=False, resample=Image.BILINEAR)
    elif op_idx == 7:
        res = res.transpose(Image.FLIP_LEFT_RIGHT).rotate(-8, expand=False, resample=Image.BILINEAR)
    else:
        # Combination of subtle zoom crop and flip
        w, h = res.size
        crop_box = (int(w * 0.05), int(h * 0.05), int(w * 0.95), int(h * 0.95))
        res = res.crop(crop_box).resize((w, h), Image.BILINEAR)
    return res


def file_sha256(path: Path) -> str:
    """Calculate SHA256 hash of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def validate_split_integrity(src_dir: Path, dst_dir: Path) -> None:
    """
    Ensure test and val splits in dst_dir are 100% bit-for-bit identical to src_dir,
    and verify no files from test or val appear in train (prevent data leakage).
    """
    for split in ["test", "val"]:
        src_split = src_dir / split
        dst_split = dst_dir / split
        if not src_split.exists():
            continue

        src_files = sorted(
            [f for f in src_split.rglob("*.*") if f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]]
        )
        dst_files = sorted(
            [f for f in dst_split.rglob("*.*") if f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]]
        )

        if len(src_files) != len(dst_files):
            raise ValueError(
                f"Integrity check failed: '{split}' file count mismatch: src={len(src_files)}, dst={len(dst_files)}"
            )

        for sf, df in zip(src_files, dst_files):
            rel_s = sf.relative_to(src_split)
            rel_d = df.relative_to(dst_split)
            if rel_s != rel_d:
                raise ValueError(f"Integrity check failed: relative path mismatch {rel_s} != {rel_d}")
            if file_sha256(sf) != file_sha256(df):
                raise ValueError(f"Integrity check failed: SHA256 mismatch for {sf.name}")

        print(f"  ✓ Integrity verified for '{split}': {len(src_files)} files identical to source.")

    # Data leakage check: train must not share any files with test or val
    train_dir = dst_dir / "train"
    train_files = list(train_dir.rglob("*.*"))
    test_and_val_hashes = set()
    for split in ["test", "val"]:
        s_dir = src_dir / split
        if s_dir.exists():
            for f in s_dir.rglob("*.*"):
                if f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]:
                    test_and_val_hashes.add(file_sha256(f))

    for tf in train_files:
        if tf.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]:
            # Check original name vs test
            thash = file_sha256(tf)
            if thash in test_and_val_hashes:
                raise ValueError(
                    f"CRITICAL: Data leakage detected! Train image {tf.name} matches a hash in test/val split."
                )
    print("  ✓ Data leakage check passed: No overlap between train and test/val splits.")


def main() -> None:
    args = parse_args()
    check_dependencies()
    random.seed(args.seed)

    src_dir = Path(args.source_dataset_dir).resolve()
    dst_dir = Path(args.output_dataset_dir).resolve()

    if not src_dir.exists():
        raise FileNotFoundError(f"Source dataset directory not found: {src_dir}")

    print(f"Source dataset: {src_dir}")
    print(f"Output dataset: {dst_dir}")
    print(f"Target training samples per class: {args.target_per_class}")

    if dst_dir.exists():
        shutil.rmtree(dst_dir)
    dst_dir.mkdir(parents=True, exist_ok=True)

    # 1. Copy metadata files
    for meta_file in ["labels.txt", "label_map.json"]:
        p = src_dir / meta_file
        if p.exists():
            shutil.copy2(p, dst_dir / meta_file)

    # 2. Copy test and val splits WITHOUT modification (strictly preserves Golden Test Set)
    for fixed_split in ["test", "val"]:
        src_split = src_dir / fixed_split
        if src_split.exists():
            dst_split = dst_dir / fixed_split
            shutil.copytree(src_split, dst_split)
            print(f"✓ Preserved '{fixed_split}' split exactly as Golden Reference ({len(list(dst_split.rglob('*.*')))} files)")

    # 3. Augment train split only
    src_train = src_dir / "train"
    dst_train = dst_dir / "train"
    dst_train.mkdir(parents=True, exist_ok=True)

    class_dirs = sorted([d for d in src_train.iterdir() if d.is_dir()])
    print(f"\nProcessing {len(class_dirs)} training classes:")

    for cls_dir in class_dirs:
        cls_name = cls_dir.name
        dst_cls_dir = dst_train / cls_name
        dst_cls_dir.mkdir(parents=True, exist_ok=True)

        original_images = sorted(
            [f for f in cls_dir.glob("*.*") if f.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]]
        )

        # Validate images for corruptions
        valid_images: list[Path] = []
        for orig in original_images:
            try:
                with Image.open(orig) as img:
                    img.verify()
                valid_images.append(orig)
                shutil.copy2(orig, dst_cls_dir / orig.name)
            except Exception as e:
                print(f"    Warning: Corrupt or unreadable image skipped: {orig.name} ({e})")

        orig_count = len(valid_images)
        if orig_count == 0:
            print(f"  - `{cls_name}`: 0 valid images (skipping augmentation)")
            continue

        needed = max(0, args.target_per_class - orig_count)
        # Avoid extreme overfitting if a class only has 1 or 2 images (limit max multiplier to 4x)
        max_allowed_augmented = min(needed, orig_count * 4)
        target_augmented = min(needed, max_allowed_augmented)

        generated_count = 0
        op_cycle = 0
        max_op_cycles = 30

        while generated_count < target_augmented and op_cycle < max_op_cycles:
            for orig in valid_images:
                if generated_count >= target_augmented:
                    break
                try:
                    with Image.open(orig) as img:
                        rgb_img = img.convert("RGB")
                        aug = augment_image(rgb_img, op_cycle % 9)
                        out_name = f"{orig.stem}__aug{op_cycle:02d}_{generated_count:03d}.jpg"
                        aug.save(dst_cls_dir / out_name, quality=92)
                        generated_count += 1
                except Exception as e:
                    print(f"    Warning: Failed to augment {orig.name}: {e}")
                    # Do not increment generated_count on failure
            op_cycle += 1

        total_cls = orig_count + generated_count
        print(f"  - `{cls_name:<16}`: {orig_count:>2} orig + {generated_count:>2} augmented -> {total_cls:>2} total")

    print("\n🔍 Verifying dataset split integrity and absence of data leakage...")
    validate_split_integrity(src_dir, dst_dir)

    print("\nDataset augmentation completed successfully!")
    print(f"Augmented dataset ready at: {dst_dir}")


if __name__ == "__main__":
    main()
