"""Decodifica el audio que sube el navegador (WAV, MP4/AAC de Safari, WebM/Opus de Chrome)
a float32 mono 16 kHz. WAV PCM se decodifica en Python; el resto con ffmpeg."""
from __future__ import annotations

import io
import os
import shutil
import subprocess
import tempfile
import wave

import numpy as np

TARGET_SR = 16000
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


class AudioDecodeError(ValueError):
    pass


def _decode_wav(data: bytes) -> np.ndarray:
    with wave.open(io.BytesIO(data)) as wf:
        n_ch, width, sr = wf.getnchannels(), wf.getsampwidth(), wf.getframerate()
        frames = wf.readframes(wf.getnframes())
    if width == 2:
        pcm = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0
    elif width == 4:
        pcm = np.frombuffer(frames, dtype=np.int32).astype(np.float32) / 2147483648.0
    elif width == 1:
        pcm = (np.frombuffer(frames, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    else:
        raise AudioDecodeError(f"WAV con ancho de muestra no soportado: {width}")
    if n_ch > 1:
        pcm = pcm.reshape(-1, n_ch).mean(axis=1)
    if sr != TARGET_SR:
        pcm = _resample_linear(pcm, sr, TARGET_SR)
    return pcm


def _resample_linear(x: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    n_out = int(round(len(x) * sr_out / sr_in))
    if n_out <= 1 or len(x) <= 1:
        return x.astype(np.float32)
    t_in = np.linspace(0.0, 1.0, num=len(x), endpoint=False)
    t_out = np.linspace(0.0, 1.0, num=n_out, endpoint=False)
    return np.interp(t_out, t_in, x).astype(np.float32)


def _decode_ffmpeg(data: bytes, suffix: str) -> np.ndarray:
    if not shutil.which("ffmpeg"):
        raise AudioDecodeError("ffmpeg no está instalado en el servidor")
    # Archivo temporal: el MP4 de Safari necesita entrada con búsqueda (moov al final).
    fd, path = tempfile.mkstemp(suffix=suffix or ".bin")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        proc = subprocess.run(
            ["ffmpeg", "-v", "error", "-nostdin", "-i", path,
             "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "1", "-ar", str(TARGET_SR), "pipe:1"],
            capture_output=True, timeout=60,
        )
    finally:
        os.unlink(path)
    if proc.returncode != 0:
        raise AudioDecodeError("ffmpeg no pudo decodificar el audio: " + proc.stderr.decode(errors="replace")[-300:])
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()


def decode_audio(data: bytes, filename: str = "") -> np.ndarray:
    """Bytes subidos -> float32 mono 16 kHz en [-1, 1]."""
    if not data:
        raise AudioDecodeError("Audio vacío")
    if len(data) > MAX_UPLOAD_BYTES:
        raise AudioDecodeError("Audio demasiado grande (máx. 10 MB)")
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        try:
            return _decode_wav(data)
        except (wave.Error, EOFError, AudioDecodeError):
            pass  # WAV no PCM (p. ej. flotante): dejar que ffmpeg lo intente
    suffix = os.path.splitext(filename)[1].lower()
    if suffix not in (".wav", ".mp4", ".m4a", ".webm", ".ogg", ".mp3", ".caf", ".aac", ".flac"):
        suffix = ""
    return _decode_ffmpeg(data, suffix)
