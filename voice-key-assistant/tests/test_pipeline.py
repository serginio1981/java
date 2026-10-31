"""Tests del loop principal (process_phrase) y del log de auditoría, con dobles de prueba."""
import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from audit import Attempt, AuditLogger  # noqa: E402
from config import load_config  # noqa: E402
from main import process_phrase  # noqa: E402
from voice.embedding import l2_normalize  # noqa: E402
from voice.permissions import PermissionManager  # noqa: E402
from voice.verify import SpeakerVerifier  # noqa: E402

rng = np.random.default_rng(1)
OWNER = l2_normalize(rng.standard_normal(256))
STRANGER = l2_normalize(rng.standard_normal(256))
PHRASE = np.zeros(16000, dtype=np.float32)


class FakeSTT:
    def __init__(self, text="¿qué hora es?"):
        self.text, self.calls = text, 0

    def transcribe(self, audio):
        self.calls += 1
        return self.text


class FakeLLM:
    def __init__(self):
        self.roles = []

    def respond(self, text, role, speaker):
        self.roles.append(role.name)
        return "Son las diez."


class FakeTTS:
    def __init__(self):
        self.said = []

    def say(self, text):
        self.said.append(text)


def make(tmp_path, guest_mode="limited"):
    verifier = SpeakerVerifier(tmp_path, persist=False)
    verifier.add_profile("owner", OWNER)
    perms = PermissionManager(dict(load_config()["permissions"], guest_mode=guest_mode), tmp_path)
    perms.assign("owner", "owner")
    return verifier, perms, FakeSTT(), FakeLLM(), FakeTTS()


def run(emb, parts):
    verifier, perms, stt, llm, tts = parts
    embed = emb if callable(emb) else (lambda a, sr: emb)
    return process_phrase(PHRASE, 16000, embed, verifier, perms, stt, llm, tts)


def test_owner_accepted(tmp_path):
    parts = make(tmp_path)
    a = run(OWNER, parts)
    assert a.outcome == "accepted" and a.speaker == "owner" and a.role == "owner"
    assert parts[3].roles == ["owner"] and parts[4].said == ["Son las diez."]
    assert a.audio_seconds == 1.0 and a.threshold == 0.75


def test_stranger_guest_mode(tmp_path):
    parts = make(tmp_path)
    a = run(STRANGER, parts)
    assert a.outcome == "guest_answered" and a.speaker is None and not a.accepted
    assert parts[3].roles == ["guest"]


def test_stranger_ignored_never_transcribed(tmp_path):
    parts = make(tmp_path, guest_mode="ignore")
    a = run(STRANGER, parts)
    assert a.outcome == "ignored"
    assert parts[2].calls == 0 and parts[4].said == []


def test_invalid_audio(tmp_path):
    def bad(a, sr):
        raise ValueError("Audio vacío")
    a = run(bad, make(tmp_path))
    assert a.outcome == "invalid_audio" and "vacío" in a.error


def test_empty_transcript(tmp_path):
    parts = make(tmp_path)
    parts = (parts[0], parts[1], FakeSTT(""), parts[3], parts[4])
    assert run(OWNER, parts).outcome == "empty_transcript"


def test_error_does_not_raise(tmp_path):
    parts = make(tmp_path)

    class Boom(FakeTTS):
        def say(self, text):
            raise RuntimeError("sin audio")
    a = run(OWNER, (*parts[:4], Boom()))
    assert a.outcome == "error" and "sin audio" in a.error


@pytest.mark.parametrize("keep", [True, False])
def test_audit_jsonl(tmp_path, keep):
    path = tmp_path / "logs" / "attempts.jsonl"
    audit = AuditLogger(path, log_transcripts=keep)
    audit.record(Attempt(outcome="accepted", speaker="owner", score=0.912345,
                         transcript="hola", response="hola", scores={"owner": 0.912345}))
    audit.record(Attempt(outcome="ignored", score=0.3))
    lines = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    assert [x["outcome"] for x in lines] == ["accepted", "ignored"]
    assert lines[0]["score"] == 0.9123 and "timestamp" in lines[0]
    assert (lines[0]["transcript"] == "hola") is keep
