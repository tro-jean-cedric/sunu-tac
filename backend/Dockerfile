# Build context: repository root (needs shared/referentiel.json)
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /usr/local/bin/uv
WORKDIR /srv/backend
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1 \
    REFERENTIEL_PATH=/srv/shared/referentiel.json
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
COPY shared/ /srv/shared/
EXPOSE 8000
CMD ["sh", "-c", "uv run --no-dev alembic upgrade head && uv run --no-dev uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers"]
