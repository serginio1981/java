"""Tests de la API HTTP con componentes simulados (sin modelos ni red)."""
import io
import shutil
import sys
import wave
import zipfile
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import load_config  # noqa: E402
from server.app import Deps, create_app  # noqa: E402
from server.audio_io import AudioDecodeError, decode_audio  # noqa: E402
from voice.embedding import l2_normalize  # noqa: E402

rng = np.random.default_rng(7)
OWNER = l2_normalize(rng.standard_normal(256))
STRANGER = l2_normalize(rng.standard_normal(256))
TOKEN = "secreto"


def wav_bytes(seconds=1.0, sr=16000, freq=440.0, channels=1):
    t = np.arange(int(sr * seconds)) / sr
    pcm = (np.sin(2 * np.pi * freq * t) * 12000).astype(np.int16)
    if channels == 2:
        pcm = np.column_stack([pcm, pcm]).ravel()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())
    return buf.getvalue()


class FakeEmbed:
    """El 'hablante' se codifica en la frecuencia del tono: 440 Hz = dueño, otra = extraño."""

    def __call__(self, audio, sr):
        if len(audio) < sr // 2:
            raise ValueError("Audio demasiado corto")
        spectrum = np.abs(np.fft.rfft(audio))
        freq = np.argmax(spectrum) * sr / len(audio)
        return OWNER if abs(freq - 440) < 20 else STRANGER


class FakeSTT:
    def transcribe(self, audio):
        return "hola asistente"


class FakeLLM:
    def respond(self, text, role, speaker):
        return f"[{role.name}] respuesta"


@pytest.fixture
def client(tmp_path):
    cfg = load_config()
    cfg["voice"]["profiles_dir"] = str(tmp_path / "profiles")
    cfg["logging"]["attempts_file"] = str(tmp_path / "attempts.jsonl")
    (tmp_path / "profiles").mkdir()
    deps = Deps(cfg, embed=FakeEmbed(), stt=FakeSTT(), llm=FakeLLM(), synthesize=lambda t: b"ID3mp3")
    app = create_app(deps=deps, token=TOKEN)
    with TestClient(app) as c:
        c.headers["X-Auth-Token"] = TOKEN
        yield c


def enroll(client, name="owner", role="owner", n=7, freq=440.0):
    files = [("files", (f"s{i}.wav", wav_bytes(freq=freq), "audio/wav")) for i in range(n)]
    return client.post("/api/enroll", data={"name": name, "role": role}, files=files)


# ---------- auth ----------
def test_requires_token(client):
    assert client.get("/api/status", headers={"X-Auth-Token": "malo"}).status_code == 401
    assert client.get("/api/health").status_code == 200  # público, sin datos


def test_create_app_fails_closed_without_token(monkeypatch):
    monkeypatch.delenv("VKA_TOKEN", raising=False)
    monkeypatch.delenv("VKA_ALLOW_NO_TOKEN", raising=False)
    with pytest.raises(RuntimeError):
        create_app(token="")


# ---------- enrolamiento ----------
def test_enroll_and_status(client):
    assert client.get("/api/status").json()["profiles"] == []
    r = enroll(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "owner" and len(body["scores"]) == 7
    st = client.get("/api/status").json()
    assert st["profiles"] == ["owner"] and st["roles"] == {"owner": "owner"}


def test_enroll_validations(client):
    assert enroll(client, n=3).status_code == 400
    assert enroll(client, name="../x").status_code == 200  # se sanea a "x"
    assert enroll(client, name="otro", role="owner").status_code == 400  # un solo dueño
    assert enroll(client, name="maria", role="family").status_code == 200


# ---------- comandos ----------
def post_command(client, freq=440.0):
    return client.post("/api/command", files={"audio": ("cmd.wav", wav_bytes(freq=freq), "audio/wav")})


def test_command_owner(client):
    enroll(client)
    r = post_command(client)
    assert r.status_code == 200
    d = r.json()
    assert d["outcome"] == "accepted" and d["speaker"] == "owner" and d["role"] == "owner"
    assert d["transcript"] == "hola asistente" and d["response"] == "[owner] respuesta"
    assert d["audio_b64"] and d["audio_mime"] == "audio/mpeg"


def test_command_stranger_guest(client):
    enroll(client)
    d = post_command(client, freq=900.0).json()
    assert d["outcome"] == "guest_answered" and d["speaker"] is None and d["role"] == "guest"
    assert d["response"] == "[guest] respuesta"


def test_command_no_profiles_is_guest(client):
    d = post_command(client).json()
    assert d["outcome"] == "guest_answered"


def test_command_bad_audio(client):
    r = client.post("/api/command", files={"audio": ("x.bin", b"no es audio", "application/octet-stream")})
    assert r.status_code == 400


def test_command_tts_failure_still_answers(tmp_path):
    cfg = load_config()
    cfg["voice"]["profiles_dir"] = str(tmp_path)
    cfg["logging"]["attempts_file"] = None

    def boom(_):
        raise RuntimeError("sin red")
    deps = Deps(cfg, embed=FakeEmbed(), stt=FakeSTT(), llm=FakeLLM(), synthesize=boom)
    with TestClient(create_app(deps=deps, token=TOKEN)) as c:
        c.headers["X-Auth-Token"] = TOKEN
        d = post_command(c).json()
    assert d["response"] and d["audio_b64"] is None


# ---------- respaldo ----------
def test_export_import_roundtrip(client, tmp_path):
    enroll(client)
    enroll(client, name="maria", role="family", freq=900.0)
    z = client.get("/api/profiles/export")
    assert z.status_code == 200
    names = set(zipfile.ZipFile(io.BytesIO(z.content)).namelist())
    assert names == {"owner.npy", "owner.anchor.npy", "maria.npy", "maria.anchor.npy", "roles.yaml"}

    # "reinicio" del servidor: se pierde el disco
    shutil.rmtree(tmp_path / "profiles")
    (tmp_path / "profiles").mkdir()
    client.app.state.deps.verifier.reload()
    assert client.get("/api/status").json()["profiles"] == []

    r = client.post("/api/profiles/import", files={"file": ("b.zip", z.content, "application/zip")})
    assert r.status_code == 200 and r.json()["profiles"] == ["maria", "owner"]
    assert client.get("/api/status").json()["roles"] == {"owner": "owner", "maria": "family"}
    assert post_command(client).json()["speaker"] == "owner"


def test_import_rejects_garbage(client):
    assert client.post("/api/profiles/import", files={"file": ("b.zip", b"zzz", "application/zip")}).status_code == 400
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("../evil.npy", b"x")
        zf.writestr("readme.txt", b"x")
    assert client.post("/api/profiles/import", files={"file": ("b.zip", buf.getvalue(), "application/zip")}).status_code == 400


# ---------- PWA ----------
def test_serves_pwa(client):
    assert "Llave de Voz" in client.get("/").text
    assert client.get("/manifest.webmanifest").status_code == 200
    assert client.get("/app.js").status_code == 200
    assert client.get("/icons/icon-180.png").headers["content-type"] == "image/png"


# ---------- decodificación ----------
def test_decode_wav_resamples_and_downmixes():
    audio = decode_audio(wav_bytes(seconds=1.0, sr=44100, channels=2), "a.wav")
    assert audio.dtype == np.float32 and abs(len(audio) - 16000) <= 2
    assert np.abs(audio).max() <= 1.0


def test_decode_rejects_empty_and_garbage():
    with pytest.raises(AudioDecodeError):
        decode_audio(b"", "a.wav")
    with pytest.raises(AudioDecodeError):
        decode_audio(b"basura" * 100, "a.webm")


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg no disponible")
def test_decode_m4a_via_ffmpeg(tmp_path):
    import subprocess

    wav = tmp_path / "in.wav"
    wav.write_bytes(wav_bytes(seconds=1.0))
    m4a = tmp_path / "in.m4a"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-c:a", "aac", str(m4a)], check=True)
    audio = decode_audio(m4a.read_bytes(), "in.m4a")
    assert 15000 <= len(audio) <= 17500  # AAC agrega algo de relleno
    assert FakeEmbed()(audio, 16000) is OWNER  # la señal sobrevive a la compresión
