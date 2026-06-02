#!/bin/bash
# Resetea el entorno Docker local (Postgres + Redis) — borra volúmenes.
set -e
echo "🔄 Reiniciando entorno Docker..."
cd "$(dirname "$0")/../../docker"
docker compose down -v
docker compose up -d
echo "✅ Docker reiniciado. Esperar ~10s para que Postgres esté listo."
