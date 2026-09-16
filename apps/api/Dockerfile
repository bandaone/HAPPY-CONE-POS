FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN addgroup --system happycone \
    && adduser --system --ingroup happycone --home /nonexistent --no-create-home happycone

COPY pyproject.toml ./
COPY app ./app
COPY alembic.ini ./
COPY alembic ./alembic

RUN pip install --no-cache-dir .

USER happycone

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=12 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8000/ready', headers={'Host':'127.0.0.1'}), timeout=3).read()"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
