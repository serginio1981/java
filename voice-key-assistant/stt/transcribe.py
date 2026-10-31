"""Transcripción con faster-whisper."""
from __future__ import annotations

import numpy as np


class Transcriber:
    def __init__(self, model: str = "small", language: str = "es", device: str = "auto",
                 compute_type: str = "int8", beam_size: int = 5):
        from faster_whisper import WhisperModel

        self.language = language
        self.beam_size = beam_size
        self.model = WhisperModel(model, device=device, compute_type=compute_type)

    @classmethod
    def from_dict(cls, d: dict) -> "Transcriber":
        keys = ("model", "language", "device", "compute_type", "beam_size")
        return cls(**{k: d[k] for k in keys if k in (d or {})})

    def transcribe(self, audio: np.ndarray) -> str:
        """`audio`: float32 mono 16 kHz en [-1, 1]."""
        segments, _info = self.model.transcribe(
            audio.astype(np.float32), language=self.language, beam_size=self.beam_size
        )
        return " ".join(s.text.strip() for s in segments).strip()
