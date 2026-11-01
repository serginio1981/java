# Imagen para Hugging Face Spaces (Docker) o cualquier host de contenedores.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

# ffmpeg: decodifica el audio del navegador. gcc: compila webrtcvad (dependencia de resemblyzer).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg gcc python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements-server.txt .
RUN pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements-server.txt \
    && apt-get purge -y gcc python3-dev && apt-get autoremove -y

# Spaces ejecuta como uid 1000; todo lo escribible va bajo /home/user.
RUN useradd -m -u 1000 user
COPY --chown=user . .
USER user
ENV HOME=/home/user \
    HF_HOME=/home/user/.cache/huggingface \
    VKA_PROFILES_DIR=/home/user/profiles \
    PORT=7860
EXPOSE 7860

CMD ["sh", "-c", "python -m uvicorn server.app:app --host 0.0.0.0 --port ${PORT}"]
