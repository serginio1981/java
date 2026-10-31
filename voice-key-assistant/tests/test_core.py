"""Tests de la lógica pura (no requieren micrófono ni modelos)."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from audio.capture import AudioConfig, PhraseSegmenter  # noqa: E402
from config import load_config  # noqa: E402
from voice.embedding import cosine_similarity, l2_normalize  # noqa: E402
from voice.enroll import build_profile  # noqa: E402
from voice.permissions import PermissionManager  # noqa: E402
from voice.verify import AdaptationConfig, SpeakerVerifier, adapt_profile  # noqa: E402

rng = np.random.default_rng(0)


def voice_like(base, noise=0.15):
    # noise = norma aproximada del ruido relativo al embedding unitario
    return l2_normalize(base + noise * rng.standard_normal(base.shape) / np.sqrt(base.size))


@pytest.fixture
def owner_base():
    return l2_normalize(rng.standard_normal(256))


def test_build_profile_requires_five(owner_base):
    with pytest.raises(ValueError):
        build_profile([voice_like(owner_base) for _ in range(4)])


def test_build_profile_close_to_base(owner_base):
    profile, scores = build_profile([voice_like(owner_base, 0.05) for _ in range(7)])
    assert cosine_similarity(profile, owner_base) > 0.95
    assert all(s > 0.9 for s in scores)


def test_verify_accepts_owner_rejects_stranger(tmp_path, owner_base):
    v = SpeakerVerifier(tmp_path, threshold=0.75, persist=False)
    v.add_profile("owner", owner_base)
    assert v.verify(voice_like(owner_base, 0.05)).name == "owner"
    stranger = v.verify(l2_normalize(rng.standard_normal(256)))
    assert stranger.name is None and not stranger.accepted


def test_identifies_best_profile(tmp_path, owner_base):
    family = l2_normalize(rng.standard_normal(256))
    v = SpeakerVerifier(tmp_path, persist=False)
    v.add_profile("owner", owner_base)
    v.add_profile("maria", family)
    assert v.verify(voice_like(family, 0.05)).name == "maria"


def test_adaptation_moves_profile(tmp_path, owner_base):
    v = SpeakerVerifier(tmp_path, adaptation=AdaptationConfig(alpha=0.1, min_score=0.8), persist=False)
    v.add_profile("owner", owner_base)
    sample = voice_like(owner_base, 0.05)
    before = cosine_similarity(v.profiles["owner"], sample)
    assert v.verify(sample).adapted
    assert cosine_similarity(v.profiles["owner"], sample) > before


def test_no_adaptation_below_min_score(tmp_path, owner_base):
    v = SpeakerVerifier(tmp_path, threshold=0.5, adaptation=AdaptationConfig(min_score=0.99), persist=False)
    v.add_profile("owner", owner_base)
    r = v.verify(voice_like(owner_base, 0.4))
    assert r.accepted and not r.adapted


def test_drift_guard_blocks_runaway(tmp_path, owner_base):
    v = SpeakerVerifier(tmp_path, threshold=0.0,
                        adaptation=AdaptationConfig(alpha=0.5, min_score=0.0, max_drift=0.9), persist=False)
    v.add_profile("owner", owner_base)
    other = l2_normalize(rng.standard_normal(256))
    for _ in range(20):
        v.verify(other)
    assert cosine_similarity(v.profiles["owner"], owner_base) >= 0.9


def test_adaptation_persists(tmp_path, owner_base):
    v = SpeakerVerifier(tmp_path, adaptation=AdaptationConfig(min_score=0.8))
    v.add_profile("owner", owner_base)
    v.verify(voice_like(owner_base, 0.05))
    assert (tmp_path / "owner.npy").exists()
    reloaded = SpeakerVerifier(tmp_path)
    assert np.allclose(reloaded.profiles["owner"], v.profiles["owner"], atol=1e-6)


def test_adapt_profile_normalized(owner_base):
    out = adapt_profile(owner_base, voice_like(owner_base), 0.3)
    assert np.isclose(np.linalg.norm(out), 1.0)


def test_permissions(tmp_path):
    cfg = load_config()["permissions"]
    pm = PermissionManager(cfg, tmp_path)
    pm.assign("owner", "owner")
    pm.assign("maria", "family")
    assert pm.role_for("owner").can("settings")
    assert not pm.role_for("maria").can("personal_data")
    assert pm.role_for(None).name == "guest"
    assert pm.role_for("sin_rol").name == "guest"  # fail-closed
    with pytest.raises(ValueError):
        pm.assign("otro", "owner")  # un solo dueño
    assert PermissionManager(cfg, tmp_path).role_for("maria").name == "family"  # persistido


def test_guest_ignore_mode(tmp_path):
    cfg = dict(load_config()["permissions"], guest_mode="ignore")
    pm = PermissionManager(cfg, tmp_path)
    assert not pm.should_respond(pm.role_for(None))


def test_segmenter_emits_phrase():
    cfg = AudioConfig(min_phrase_ms=300)
    frame_bytes = cfg.frame_samples * 2
    speech, silence = b"\x10\x00" * (frame_bytes // 2), b"\x00\x00" * (frame_bytes // 2)
    seg = PhraseSegmenter(cfg, is_speech=lambda f: f == speech)
    stream = [silence] * 10 + [speech] * 40 + [silence] * 15
    phrases = [p for p in (seg.push(f) for f in stream) if p is not None]
    assert len(phrases) == 1
    assert phrases[0].dtype == np.float32 and len(phrases[0]) >= 40 * cfg.frame_samples


def test_segmenter_drops_short_noise():
    # 11 frames de voz + 300 ms de padding de cierre ~= 630 ms < 900 ms
    cfg = AudioConfig(min_phrase_ms=900)
    n = cfg.frame_samples
    speech, silence = b"\x10\x00" * n, b"\x00\x00" * n
    seg = PhraseSegmenter(cfg, is_speech=lambda f: f == speech)
    stream = [speech] * 11 + [silence] * 15
    assert all(seg.push(f) is None for f in stream)
