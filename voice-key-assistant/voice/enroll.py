"""Enrolamiento: graba N muestras, promedia embeddings y guarda el perfil."""
from __future__ import annotations

import logging
from typing import Callable, Iterable

import numpy as np

from voice.embedding import cosine_similarity, l2_normalize, save_profile

log = logging.getLogger(__name__)

PROMPTS = [
    "Hola, este es mi asistente personal y solo responde a mi voz.",
    "Hoy es un buen día para revisar la agenda de la semana.",
    "Recuérdame llamar a la oficina mañana a las nueve.",
    "¿Cuál es el pronóstico del tiempo para el fin de semana?",
    "Pon música tranquila y baja un poco el volumen.",
    "Envía un mensaje diciendo que llegaré en veinte minutos.",
    "Necesito un resumen de los pendientes del proyecto.",
    "Apaga las luces del living y cierra las cortinas.",
    "Busca una receta fácil para la cena de hoy.",
    "Gracias, eso es todo por ahora.",
]


def build_profile(embeddings: Iterable[np.ndarray], min_consistency: float = 0.6) -> tuple[np.ndarray, list[float]]:
    """Promedia embeddings normalizados. Devuelve (perfil, similitud de cada muestra al perfil)."""
    embs = [l2_normalize(e) for e in embeddings]
    if len(embs) < 5:
        raise ValueError("Se requieren al menos 5 muestras para enrolar")
    profile = l2_normalize(np.mean(embs, axis=0))
    scores = [cosine_similarity(e, profile) for e in embs]
    bad = [i for i, s in enumerate(scores) if s < min_consistency]
    if bad:
        log.warning("Muestras poco consistentes (posible ruido u otra voz): %s", bad)
    return profile, scores


def enroll(
    name: str,
    profiles_dir: str,
    record: Callable[[], np.ndarray],
    embed: Callable[[np.ndarray], np.ndarray],
    n_samples: int = 7,
    prompt: Callable[[str], None] = print,
) -> np.ndarray:
    """Flujo interactivo. `record` devuelve una frase de audio; `embed` su embedding."""
    if not 5 <= n_samples <= 10:
        raise ValueError("n_samples debe estar entre 5 y 10")
    embeddings = []
    for i in range(n_samples):
        prompt(f"[{i + 1}/{n_samples}] Lee en voz alta: \"{PROMPTS[i]}\"")
        embeddings.append(embed(record()))
    profile, scores = build_profile(embeddings)
    prompt("Consistencia por muestra: " + ", ".join(f"{s:.2f}" for s in scores))
    save_profile(profiles_dir, name, profile)
    save_profile(profiles_dir, name, profile, anchor=True)
    prompt(f"Perfil '{name}' guardado en {profiles_dir}/{name}.npy")
    return profile
