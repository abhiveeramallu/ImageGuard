import cv2
import numpy as np
import pytest

from app.services import invisible_watermark_service as iw
from tests.synth_splice import jpeg_roundtrip, photo_like

KEY = b"unit-test-key-not-a-secret"


@pytest.fixture(scope="module")
def marked():
    img = photo_like(640, 480, seed=5)
    return img, iw.embed(img, "Acme-2026", KEY)


def test_embed_is_invisible_and_keeps_shape(marked):
    img, r = marked
    assert r.image.shape == img.shape and r.image.dtype == np.uint8
    assert r.psnr_db > 40
    assert np.abs(r.image.astype(int) - img.astype(int)).max() < 40
    assert not np.array_equal(r.image, img)


def test_verify_recovers_exact_payload(marked):
    v = iw.verify(marked[1].image, KEY)
    assert v.status == "verified" and v.owner == "Acme-2026" and v.integrity_verified


def test_unmarked_image_not_verified(marked):
    assert iw.verify(marked[0], KEY).status == "not_detected"


def test_wrong_key_does_not_verify(marked):
    v = iw.verify(marked[1].image, b"a-different-key")
    assert v.status != "verified" and v.owner is None


def test_tampered_payload_fails_integrity(marked):
    img, _ = marked
    other = iw.embed(img, "Acme-2026", b"another-key").image
    assert iw.verify(other, KEY).status != "verified"


@pytest.mark.parametrize("q", [95, 85, 75, 60])
def test_survives_jpeg_recompression(marked, q):
    assert iw.verify(jpeg_roundtrip(marked[1].image, q), KEY).owner == "Acme-2026"


def test_survives_mild_noise(marked):
    rng = np.random.default_rng(0)
    noisy = np.clip(marked[1].image + rng.normal(0, 3, marked[1].image.shape), 0, 255).astype(np.uint8)
    assert iw.verify(noisy, KEY).status == "verified"


def test_survives_small_crop(marked):
    assert iw.verify(marked[1].image[13:-9, 7:-21], KEY).status == "verified"


def test_resize_is_not_supported_and_reported_as_not_verified(marked):
    small = cv2.resize(marked[1].image, None, fx=0.75, fy=0.75, interpolation=cv2.INTER_AREA)
    assert iw.verify(small, KEY).status != "verified"  # documented limitation


@pytest.mark.parametrize("owner", ["", "x" * 13, "café"])
def test_invalid_owner_rejected(owner):
    with pytest.raises(iw.WatermarkError):
        iw.embed(photo_like(300, 300), owner, KEY)


def test_too_small_image_rejected():
    with pytest.raises(iw.WatermarkError):
        iw.embed(photo_like(100, 100), "a", KEY)


def test_strength_changes_distortion_and_all_levels_verify():
    img = photo_like(512, 384, seed=2)
    psnr = {}
    for s in iw.STRENGTHS:
        r = iw.embed(img, "id1", KEY, s)
        psnr[s] = r.psnr_db
        assert iw.verify(r.image, KEY).status == "verified"
    assert psnr["low"] > psnr["standard"] > psnr["high"]


def test_payload_roundtrip_and_mac():
    p = iw.build_payload("owner", KEY)
    assert iw.parse_payload(p, KEY) == (True, "owner", True)
    assert iw.parse_payload(p, b"x")[2] is False
    bad = bytearray(p); bad[16] ^= 1
    assert iw.parse_payload(bytes(bad), KEY)[2] is False
