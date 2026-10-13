FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends supervisor curl tzdata \
 && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src ./src
COPY alembic ./alembic
COPY alembic.ini supervisord.conf ./

RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir .

RUN useradd -m appuser \
 && mkdir /data \
 && chown appuser /data
USER appuser

EXPOSE 8000
EXPOSE 9999/udp

CMD ["supervisord", "-c", "/app/supervisord.conf", "-n"]
