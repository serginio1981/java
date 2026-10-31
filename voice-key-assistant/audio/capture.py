"""Captura de micrófono (sounddevice) y segmentación en frases con VAD (webrtcvad)."""
from __future__ import annotations

import collections
from dataclasses import dataclass
from typing import Callable, Iterator, Optional

import numpy as np


@dataclass
class AudioConfig:
    sample_rate: int = 16000
    frame_ms: int = 30
    vad_aggressiveness: int = 2
    padding_ms: int = 300
    trigger_ratio: float = 0.9
    min_phrase_ms: int = 600
    max_phrase_ms: int = 15000
    device: Optional[int | str] = None

    @classmethod
    def from_dict(cls, d: dict) -> "AudioConfig":
        return cls(**{k: v for k, v in (d or {}).items() if k in cls.__annotations__})

    @property
    def frame_samples(self) -> int:
        return int(self.sample_rate * self.frame_ms / 1000)

    def validate(self) -> None:
        if self.sample_rate not in (8000, 16000, 32000, 48000):
            raise ValueError("webrtcvad solo acepta 8000/16000/32000/48000 Hz")
        if self.frame_ms not in (10, 20, 30):
            raise ValueError("webrtcvad solo acepta frames de 10/20/30 ms")


class PhraseSegmenter:
    """Máquina de estados que agrupa frames PCM16 en frases.

    Independiente del micrófono para poder testearla. `is_speech` recibe los
    bytes de un frame y devuelve True/False (normalmente webrtcvad.Vad.is_speech).
    """

    def __init__(self, cfg: AudioConfig, is_speech: Callable[[bytes], bool]):
        self.cfg = cfg
        self.is_speech = is_speech
        n_pad = max(1, cfg.padding_ms // cfg.frame_ms)
        self._ring: collections.deque[tuple[bytes, bool]] = collections.deque(maxlen=n_pad)
        self._triggered = False
        self._voiced: list[bytes] = []

    def _emit(self) -> Optional[np.ndarray]:
        frames, self._voiced = self._voiced, []
        self._triggered = False
        self._ring.clear()
        pcm = b"".join(frames)
        dur_ms = len(pcm) / 2 / self.cfg.sample_rate * 1000
        if dur_ms < self.cfg.min_phrase_ms:
            return None
        return np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0

    def push(self, frame: bytes) -> Optional[np.ndarray]:
        """Procesa un frame; devuelve una frase (float32 [-1,1]) cuando se cierra."""
        speech = self.is_speech(frame)
        if not self._triggered:
            self._ring.append((frame, speech))
            n_voiced = sum(1 for _, s in self._ring if s)
            if n_voiced > self.cfg.trigger_ratio * self._ring.maxlen:
                self._triggered = True
                self._voiced.extend(f for f, _ in self._ring)
                self._ring.clear()
            return None

        self._voiced.append(frame)
        self._ring.append((frame, speech))
        n_unvoiced = sum(1 for _, s in self._ring if not s)
        max_frames = self.cfg.max_phrase_ms // self.cfg.frame_ms
        if n_unvoiced > self.cfg.trigger_ratio * self._ring.maxlen or len(self._voiced) >= max_frames:
            return self._emit()
        return None


class MicrophoneCapture:
    """Lee el micrófono y entrega frases completas detectadas por VAD."""

    def __init__(self, cfg: AudioConfig):
        cfg.validate()
        self.cfg = cfg
        import webrtcvad  # import diferido: dependencia nativa

        self._vad = webrtcvad.Vad(cfg.vad_aggressiveness)

    def _is_speech(self, frame: bytes) -> bool:
        return self._vad.is_speech(frame, self.cfg.sample_rate)

    def phrases(self) -> Iterator[np.ndarray]:
        import sounddevice as sd

        segmenter = PhraseSegmenter(self.cfg, self._is_speech)
        with sd.InputStream(
            samplerate=self.cfg.sample_rate,
            channels=1,
            dtype="int16",
            blocksize=self.cfg.frame_samples,
            device=self.cfg.device,
        ) as stream:
            while True:
                data, _overflowed = stream.read(self.cfg.frame_samples)
                phrase = segmenter.push(data[:, 0].tobytes())
                if phrase is not None:
                    yield phrase

    def record_phrase(self) -> np.ndarray:
        """Bloquea hasta capturar una frase (usado en el enrolamiento)."""
        return next(iter(self.phrases()))
