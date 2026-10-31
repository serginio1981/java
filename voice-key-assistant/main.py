"""voice-key-assistant: asistente de voz que solo obedece a voces enroladas.

Uso:
    python main.py enroll --name owner --role owner
    python main.py enroll --name maria --role family
    python main.py run
"""
from __future__ import annotations

import argparse
import logging
import sys

if sys.version_info < (3, 11):
    raise SystemExit("voice-key-assistant requiere Python 3.11 o superior")

from audit import (  # noqa: E402
    ACCEPTED, EMPTY_TRANSCRIPT, ERROR, GUEST_ANSWERED, IGNORED, INVALID_AUDIO, Attempt, AuditLogger,
)
from config import load_config  # noqa: E402

log = logging.getLogger("voice-key-assistant")


def cmd_enroll(cfg: dict, name: str, role: str) -> None:
    from audio.capture import AudioConfig, MicrophoneCapture
    from voice.embedding import embed
    from voice.enroll import enroll
    from voice.permissions import PermissionManager

    vcfg = cfg["voice"]
    perms = PermissionManager(cfg["permissions"], vcfg["profiles_dir"])
    perms.assign(name, role)  # valida antes de grabar (p. ej. un solo dueño)
    acfg = AudioConfig.from_dict(cfg.get("audio", {}))
    mic = MicrophoneCapture(acfg)
    enroll(
        name=name,
        profiles_dir=vcfg["profiles_dir"],
        record=mic.record_phrase,
        embed=lambda a: embed(a, acfg.sample_rate),
        n_samples=vcfg.get("enroll_samples", 7),
    )


def cmd_run(cfg: dict) -> None:
    from audio.capture import AudioConfig, MicrophoneCapture
    from llm.respond import Responder
    from stt.transcribe import Transcriber
    from tts.speak import Speaker
    from voice.embedding import embed
    from voice.permissions import PermissionManager
    from voice.verify import AdaptationConfig, SpeakerVerifier

    vcfg = cfg["voice"]
    verifier = SpeakerVerifier(
        vcfg["profiles_dir"],
        threshold=vcfg.get("threshold", 0.75),
        adaptation=AdaptationConfig.from_dict(vcfg.get("adaptation", {})),
    )
    if not verifier.profiles:
        raise SystemExit("No hay perfiles enrolados. Ejecuta primero: python main.py enroll --name owner --role owner")
    perms = PermissionManager(cfg["permissions"], vcfg["profiles_dir"])
    acfg = AudioConfig.from_dict(cfg.get("audio", {}))
    mic = MicrophoneCapture(acfg)
    stt = Transcriber.from_dict(cfg.get("stt", {}))
    llm = Responder.from_dict(cfg.get("llm", {}))
    tts = Speaker.from_dict(cfg.get("tts", {}))

    lcfg = cfg.get("logging", {})
    audit = AuditLogger(lcfg.get("attempts_file"), lcfg.get("log_transcripts", True))

    log.info("Escuchando... (Ctrl+C para salir)")
    for phrase in mic.phrases():
        audit.record(process_phrase(phrase, acfg.sample_rate, embed, verifier, perms, stt, llm, tts))


def process_phrase(phrase, sample_rate, embed, verifier, perms, stt, llm, tts) -> Attempt:
    """Pipeline de un intento: verificar → transcribir → responder → hablar."""
    attempt = Attempt(outcome=ERROR, threshold=verifier.threshold,
                      audio_seconds=round(len(phrase) / sample_rate, 2))
    try:
        emb = embed(phrase, sample_rate)
    except ValueError as e:
        attempt.outcome, attempt.error = INVALID_AUDIO, str(e)
        return attempt

    result = verifier.verify(emb)
    role = perms.role_for(result.name)
    attempt.speaker, attempt.role = result.name, role.name
    attempt.score, attempt.accepted, attempt.adapted = result.score, result.accepted, result.adapted
    attempt.scores = result.scores

    # Verificación ANTES de transcribir: si se ignora, el audio no se procesa.
    if not perms.should_respond(role):
        attempt.outcome = IGNORED
        return attempt
    try:
        text = stt.transcribe(phrase)
        if not text:
            attempt.outcome = EMPTY_TRANSCRIPT
            return attempt
        attempt.transcript = text
        attempt.response = llm.respond(text, role, result.name)
        tts.say(attempt.response)
    except Exception as e:  # un fallo puntual no debe detener el loop
        log.exception("Error procesando la frase")
        attempt.error = repr(e)
        return attempt
    attempt.outcome = ACCEPTED if result.accepted else GUEST_ANSWERED
    return attempt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", default=None, help="Ruta a config.yaml")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)
    p_enroll = sub.add_parser("enroll", help="Enrolar una voz")
    p_enroll.add_argument("--name", required=True)
    p_enroll.add_argument("--role", choices=["owner", "family"], default="owner")
    sub.add_parser("run", help="Iniciar el asistente")
    args = parser.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    cfg = load_config(args.config)
    try:
        if args.command == "enroll":
            cmd_enroll(cfg, args.name, args.role)
        else:
            cmd_run(cfg)
    except KeyboardInterrupt:
        log.info("Detenido.")


if __name__ == "__main__":
    main()
