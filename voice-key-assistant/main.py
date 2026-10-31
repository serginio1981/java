"""voice-key-assistant: asistente de voz que solo obedece a voces enroladas.

Uso:
    python main.py enroll --name owner --role owner
    python main.py enroll --name maria --role family
    python main.py run
"""
from __future__ import annotations

import argparse
import logging

from config import load_config

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

    log.info("Escuchando... (Ctrl+C para salir)")
    for phrase in mic.phrases():
        try:
            emb = embed(phrase, acfg.sample_rate)
        except ValueError:
            continue
        result = verifier.verify(emb)
        role = perms.role_for(result.name)
        log.info("Hablante=%s rol=%s score=%.3f adaptado=%s",
                 result.name or "desconocido", role.name, result.score, result.adapted)
        # Verificación ANTES de transcribir: si se ignora, el audio no se procesa.
        if not perms.should_respond(role):
            continue
        text = stt.transcribe(phrase)
        if not text:
            continue
        log.info("Transcripción: %s", text)
        answer = llm.respond(text, role, result.name)
        log.info("Respuesta: %s", answer)
        tts.say(answer)


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
