# Diagnóstico AiMesh Casa

Página HTML autocontenida para diagnosticar la malla RT-BE50 (principal) + RT-AX82U (nodo AiMesh).

- Motor de reglas local: ordena causas probables según el cuestionario y el registro del router.
- Analizador del "Registro general" de Asuswrt (patrones comunes; varían según firmware).
- Monitor de latencia/jitter/pérdida (pide `ping.txt` al mismo servidor cada segundo).
- Análisis con Claude: solo cuando se abre como Artifact en claude.ai (capacidad `sample`).

La captura de pantalla de la app no se versiona a propósito (contiene nombres de red).
