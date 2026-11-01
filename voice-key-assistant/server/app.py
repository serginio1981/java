"""API HTTP + PWA para usar el asistente desde el iPhone (o cualquier navegador).

El servidor hace todo el trabajo: verifica la voz, transcribe, consulta a Claude y
sintetiza la respuesta. El navegador solo graba y reproduce.

Variables de entorno:
  VKA_TOKEN            token compartido obligatorio (cabecera X-Auth-Token). Sin él el
                       servidor no arranca, salvo VKA_ALLOW_NO_TOKEN=1 (solo desarrollo local).
  ANTHROPIC_API_KEY    credencial de la API de Anthropic.
  VKA_PROFILES_DIR     carpeta de perfiles (por defecto la de config.yaml).
  VKA_CONFIG           ruta alternativa a config.yaml.
"""
from __future__ import annotations

import base64
import io
import logging
import os
import sys
import zipfile
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Optional

import numpy as np
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from audit import Attempt, AuditLogger  # noqa: E402
from config import PROJECT_ROOT, load_config  # noqa: E402
from main import process_phrase  # noqa: E402
from server.audio_io import TARGET_SR, AudioDecodeError, decode_audio  # noqa: E402
from voice.embedding import save_profile  # noqa: E402
from voice.enroll import PROMPTS, build_profile  # noqa: E402
from voice.permissions import ROLES_FILE, PermissionManager  # noqa: E402
from voice.verify import AdaptationConfig, SpeakerVerifier  # noqa: E402

log = logging.getLogger("vka.server")
WEB_DIR = PROJECT_ROOT / "web"


class BytesSpeaker:
    """Reemplaza al TTS con parlantes: guarda el MP3 para devolverlo al navegador."""

    def __init__(self, synthesize: Callable[[str], bytes]):
        self._synthesize = synthesize
        self.audio: Optional[bytes] = None

    def say(self, text: str) -> None:
        self.audio = None
        if not text:
            return
        try:
            self.audio = self._synthesize(text)
        except Exception as e:  # sin audio el navegador usa su propia voz
            log.warning("TTS falló: %s", e)


@dataclass
class Deps:
    """Componentes pesados. Se construyen perezosamente; en tests se inyectan dobles."""

    cfg: dict
    embed: Optional[Callable[[np.ndarray, int], np.ndarray]] = None
    stt: object = None
    llm: object = None
    synthesize: Optional[Callable[[str], bytes]] = None
    verifier: SpeakerVerifier = field(init=False)
    perms: PermissionManager = field(init=False)
    audit: AuditLogger = field(init=False)

    def __post_init__(self):
        vcfg = self.cfg["voice"]
        self.verifier = SpeakerVerifier(
            vcfg["profiles_dir"], threshold=vcfg.get("threshold", 0.75),
            adaptation=AdaptationConfig.from_dict(vcfg.get("adaptation", {})),
        )
        self.perms = PermissionManager(self.cfg["permissions"], vcfg["profiles_dir"])
        lcfg = self.cfg.get("logging", {})
        self.audit = AuditLogger(lcfg.get("attempts_file"), lcfg.get("log_transcripts", True))

    def load_models(self) -> None:
        if self.embed is None:
            from voice.embedding import embed
            self.embed = embed
        if self.stt is None:
            from stt.transcribe import Transcriber
            self.stt = Transcriber.from_dict(self.cfg.get("stt", {}))
        if self.llm is None:
            from llm.respond import Responder
            self.llm = Responder.from_dict(self.cfg.get("llm", {}))
        if self.synthesize is None:
            from tts.speak import Speaker
            self.synthesize = Speaker.from_dict(self.cfg.get("tts", {})).synthesize

    @property
    def models_loaded(self) -> bool:
        return None not in (self.embed, self.stt, self.llm, self.synthesize)


def _load_cfg() -> dict:
    cfg = load_config(os.environ.get("VKA_CONFIG"))
    if os.environ.get("VKA_PROFILES_DIR"):
        cfg["voice"]["profiles_dir"] = os.environ["VKA_PROFILES_DIR"]
    Path(cfg["voice"]["profiles_dir"]).mkdir(parents=True, exist_ok=True)
    return cfg


def create_app(deps: Deps | None = None, token: str | None = None) -> FastAPI:
    token = token if token is not None else os.environ.get("VKA_TOKEN", "")
    if not token and os.environ.get("VKA_ALLOW_NO_TOKEN") != "1":
        raise RuntimeError("Define VKA_TOKEN (o VKA_ALLOW_NO_TOKEN=1 solo para desarrollo local)")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if app.state.deps is None:
            app.state.deps = Deps(_load_cfg())
        if os.environ.get("VKA_PRELOAD", "1") == "1" and not app.state.deps.models_loaded:
            log.info("Cargando modelos...")
            app.state.deps.load_models()
            log.info("Modelos listos")
        yield

    app = FastAPI(title="voice-key-assistant", lifespan=lifespan)
    app.state.deps = deps

    def get_deps(request: Request) -> Deps:
        d: Deps = request.app.state.deps
        if not d.models_loaded:
            d.load_models()
        return d

    def get_deps_light(request: Request) -> Deps:
        """Sin cargar modelos: estado y respaldo no los necesitan."""
        return request.app.state.deps

    def require_token(request: Request) -> None:
        if token and request.headers.get("X-Auth-Token", "") != token:
            raise HTTPException(401, "Token inválido")

    auth = [Depends(require_token)]

    async def read_audio(upload: UploadFile) -> np.ndarray:
        data = await upload.read()
        try:
            return decode_audio(data, upload.filename or "")
        except AudioDecodeError as e:
            raise HTTPException(400, str(e))

    @app.get("/api/health")
    def health():
        return {"ok": True}

    @app.get("/api/status", dependencies=auth)
    def status(d: Deps = Depends(get_deps_light)):
        return {
            "profiles": sorted(d.verifier.profiles),
            "roles": d.perms.assignments,
            "threshold": d.verifier.threshold,
            "guest_mode": d.perms.guest_mode,
            "enroll_samples": d.cfg["voice"].get("enroll_samples", 7),
            "prompts": PROMPTS,
            "models_loaded": d.models_loaded,
        }

    @app.post("/api/enroll", dependencies=auth)
    async def enroll(name: str = Form(...), role: str = Form("owner"),
                     files: list[UploadFile] = File(...), d: Deps = Depends(get_deps)):
        name = "".join(c for c in name.strip().lower() if c.isalnum() or c in "-_")
        if not name:
            raise HTTPException(400, "Nombre inválido")
        if not 5 <= len(files) <= 10:
            raise HTTPException(400, "Se requieren entre 5 y 10 muestras")
        try:
            d.perms.assign(name, role)
        except ValueError as e:
            raise HTTPException(400, str(e))
        embeddings = []
        for i, f in enumerate(files):
            audio = await read_audio(f)
            try:
                embeddings.append(await run_in_threadpool(d.embed, audio, TARGET_SR))
            except ValueError as e:
                raise HTTPException(400, f"Muestra {i + 1}: {e}")
        profile, scores = build_profile(embeddings)
        pdir = d.cfg["voice"]["profiles_dir"]
        save_profile(pdir, name, profile)
        save_profile(pdir, name, profile, anchor=True)
        d.verifier.reload()
        log.info("Perfil '%s' (%s) enrolado con %d muestras", name, role, len(files))
        return {"name": name, "role": role, "scores": [round(s, 4) for s in scores]}

    @app.post("/api/command", dependencies=auth)
    async def command(audio: UploadFile = File(...), d: Deps = Depends(get_deps)):
        phrase = await read_audio(audio)
        speaker = BytesSpeaker(d.synthesize)
        # Hilo aparte: trabajo de CPU pesado y el TTS usa asyncio.run (no puede correr en el loop).
        attempt: Attempt = await run_in_threadpool(
            process_phrase, phrase, TARGET_SR, d.embed, d.verifier, d.perms, d.stt, d.llm, speaker)
        d.audit.record(attempt)
        body = {
            "outcome": attempt.outcome, "speaker": attempt.speaker, "role": attempt.role,
            "score": round(attempt.score, 4) if attempt.score is not None else None,
            "threshold": attempt.threshold, "accepted": attempt.accepted, "adapted": attempt.adapted,
            "transcript": attempt.transcript, "response": attempt.response, "error": attempt.error,
            "audio_b64": base64.b64encode(speaker.audio).decode() if speaker.audio else None,
            "audio_mime": "audio/mpeg",
        }
        return JSONResponse(body)

    @app.get("/api/profiles/export", dependencies=auth)
    def export_profiles(d: Deps = Depends(get_deps_light)):
        """Respaldo de perfiles (Spaces borra el disco al reiniciar)."""
        pdir = Path(d.cfg["voice"]["profiles_dir"])
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in sorted(pdir.glob("*.npy")):
                zf.write(p, p.name)
            if (pdir / ROLES_FILE).exists():
                zf.write(pdir / ROLES_FILE, ROLES_FILE)
        return Response(buf.getvalue(), media_type="application/zip",
                        headers={"Content-Disposition": 'attachment; filename="vka-profiles.zip"'})

    @app.post("/api/profiles/import", dependencies=auth)
    async def import_profiles(file: UploadFile = File(...), d: Deps = Depends(get_deps_light)):
        data = await file.read()
        pdir = Path(d.cfg["voice"]["profiles_dir"])
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                names = [n for n in zf.namelist() if "/" not in n and "\\" not in n
                         and (n.endswith(".npy") or n == ROLES_FILE)]
                if not names:
                    raise HTTPException(400, "El archivo no contiene perfiles")
                for n in names:
                    (pdir / n).write_bytes(zf.read(n))
        except zipfile.BadZipFile:
            raise HTTPException(400, "Archivo ZIP inválido")
        for n in names:
            if n.endswith(".npy"):
                arr = np.load(pdir / n)
                if arr.ndim != 1:
                    (pdir / n).unlink()
                    raise HTTPException(400, f"Perfil inválido: {n}")
        d.verifier.reload()
        d.perms.assignments = d.perms._load_assignments()
        return {"restored": names, "profiles": sorted(d.verifier.profiles)}

    # --- PWA ---
    if WEB_DIR.exists():
        @app.get("/", include_in_schema=False)
        def index():
            return FileResponse(WEB_DIR / "index.html", headers={"Cache-Control": "no-cache"})

        app.mount("/", StaticFiles(directory=str(WEB_DIR)), name="web")

    return app


# uvicorn server.app:app
app = create_app() if os.environ.get("VKA_TOKEN") or os.environ.get("VKA_ALLOW_NO_TOKEN") == "1" else None
