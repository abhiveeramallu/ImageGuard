import hashlib

import numpy as np

from evaluation import dataset, metrics


def test_pixel_metrics_hand_computed():
    gt = np.zeros((4, 4), np.uint8); gt[:2, :2] = 255        # 4 positives
    pred = np.zeros((4, 4), np.uint8); pred[:2, :3] = 255     # 6 predicted: 4 TP, 2 FP
    c = metrics.pixel_counts(pred, gt)
    assert c == {"tp": 4, "fp": 2, "tn": 10, "fn": 0}
    m = metrics.prf(c)
    assert m["precision"] == 4 / 6 and m["recall"] == 1.0 and abs(m["f1"] - 0.8) < 1e-9 and abs(m["iou"] - 4 / 6) < 1e-9


def test_metrics_undefined_cases_are_none():
    assert metrics.prf({"tp": 0, "fp": 0, "fn": 0, "tn": 9})["f1"] is None


def test_image_level_metrics():
    r = metrics.image_level([(True, True), (True, False), (False, False), (False, True), (False, False)])
    assert (r["tp"], r["fn"], r["tn"], r["fp"]) == (1, 1, 2, 1)
    assert r["recall"] == 0.5 and r["precision"] == 0.5 and abs(r["false_positive_rate"] - 1 / 3) < 1e-9


def test_dataset_is_deterministic_and_has_ground_truth(tmp_path):
    a = dataset.build(tmp_path / "a")
    b = dataset.build(tmp_path / "b")
    assert [c["id"] for c in a] == [c["id"] for c in b]
    for c in a[:30]:
        assert hashlib.sha256((tmp_path / "a" / c["file"]).read_bytes()).hexdigest() == hashlib.sha256((tmp_path / "b" / c["file"]).read_bytes()).hexdigest()
    cats = {c["category"] for c in a}
    assert {"clean", "copy_move_translation", "copy_move_rotation", "splice_different_noise", "repeated_pattern", "low_texture"} <= cats
    assert all((c["gt"] is not None) == c["manipulated"] for c in a)
