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

    # 3. Augment train split
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
        orig_count = len(original_images)

        # Copy original images
        for orig in original_images:
            shutil.copy2(orig, dst_cls_dir / orig.name)

        if orig_count == 0:
            print(f"  - `{cls_name}`: 0 images (skipping)")
            continue

        needed = max(0, args.target_per_class - orig_count)
        generated_count = 0

        op_cycle = 0
        max_op_cycles = 50
        while generated_count < needed and op_cycle < max_op_cycles:
            for orig in original_images:
                if generated_count >= needed:
                    break
                try:
                    with Image.open(orig) as img:
                        # Ensure RGB
                        rgb_img = img.convert("RGB")
                        aug = augment_image(rgb_img, op_cycle % 9)
                        out_name = f"{orig.stem}__aug{op_cycle:02d}_{generated_count:03d}.jpg"
                        aug.save(dst_cls_dir / out_name, quality=92)
                        generated_count += 1
                except Exception as e:
                    print(f"    Warning: Failed to augment {orig.name}: {e}")
                    # Count to prevent infinite loops on corrupt images
                    generated_count += 1
            op_cycle += 1

        total_cls = orig_count + generated_count
        print(f"  - `{cls_name:<16}`: {orig_count:>2} orig + {generated_count:>2} augmented -> {total_cls:>2} total")

    print("\nDataset augmentation completed successfully!")
    print(f"Augmented dataset ready at: {dst_dir}")


if __name__ == "__main__":
    main()
