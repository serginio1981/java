"""Respuesta hablada: edge-tts (online) con fallback a pyttsx3 (offline)."""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import subprocess
import tempfile

log = logging.getLogger(__name__)

PLAYERS = {
    "mpv": ["mpv", "--no-video", "--really-quiet"],
    "ffplay": ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet"],
}


class Speaker:
    def __init__(self, engine: str = "edge", voice: str = "es-CL-CatalinaNeural", player: str | None = None):
        self.engine = engine
        self.voice = voice
        self.player = player or next((p for p in PLAYERS if shutil.which(p)), None)
        self._pyttsx3 = None

    @classmethod
    def from_dict(cls, d: dict) -> "Speaker":
        return cls(**{k: d[k] for k in ("engine", "voice", "player") if k in (d or {})})

    def say(self, text: str) -> None:
        if not text:
            return
        if self.engine == "edge" and self.player:
            try:
                self._say_edge(text)
                return
            except Exception as e:  # red caída, voz inexistente, etc.
                log.warning("edge-tts falló (%s); usando pyttsx3", e)
        self._say_pyttsx3(text)

    def synthesize(self, text: str) -> bytes:
        """Devuelve MP3 generado con edge-tts (sin reproducir). Lanza excepción si falla."""
        import edge_tts

        fd, path = tempfile.mkstemp(suffix=".mp3")
        os.close(fd)
        try:
            asyncio.run(edge_tts.Communicate(text, self.voice).save(path))
            with open(path, "rb") as fh:
                return fh.read()
        finally:
            os.unlink(path)

    def _say_edge(self, text: str) -> None:
        fd, path = tempfile.mkstemp(suffix=".mp3")
        os.close(fd)
        try:
            with open(path, "wb") as fh:
                fh.write(self.synthesize(text))
            subprocess.run(PLAYERS.get(self.player, [self.player]) + [path], check=True)
        finally:
            os.unlink(path)

    def _say_pyttsx3(self, text: str) -> None:
        import pyttsx3

        if self._pyttsx3 is None:
            self._pyttsx3 = pyttsx3.init()
            for v in self._pyttsx3.getProperty("voices"):
                langs = " ".join(str(x) for x in (getattr(v, "languages", []) or []))
                if "es" in (v.id or "").lower() or "es" in langs.lower():
                    self._pyttsx3.setProperty("voice", v.id)
                    break
        self._pyttsx3.say(text)
        self._pyttsx3.runAndWait()
