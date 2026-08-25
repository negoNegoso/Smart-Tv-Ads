#!/usr/bin/env bash
#
# dev.sh — Sobe o ambiente de desenvolvimento completo do SignageOS:
#   1. Carrega variáveis do .env
#   2. Sobe um PostgreSQL via Docker (credenciais derivadas do DATABASE_URL)
#   3. Instala dependências (se necessário) e aplica o schema Drizzle
#   4. Inicia a API (Express) e o frontend (Vite)
#
# Uso:
#   ./dev.sh          # sobe banco + API + frontend
#   ./dev.sh --db     # sobe apenas o banco e aplica o schema
#   ./dev.sh --stop   # para os serviços e o container do banco
#
set -euo pipefail

cd "$(dirname "$0")"

# --- Configuração ------------------------------------------------------------
DB_CONTAINER="signage-db"
PG_IMAGE="postgres:16"
SIGNAGE_PORT="${SIGNAGE_PORT:-21153}"   # porta do frontend Vite
SIGNAGE_BASE_PATH="${BASE_PATH:-/}"     # base path exigido pelo Vite

log()  { printf '\033[1;34m[dev]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[dev]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[dev]\033[0m %s\n' "$*" >&2; }

# --- --stop ------------------------------------------------------------------
if [[ "${1:-}" == "--stop" ]]; then
  log "Parando container do banco ($DB_CONTAINER)..."
  docker stop "$DB_CONTAINER" >/dev/null 2>&1 && log "Banco parado." || warn "Container não estava rodando."
  log "Serviços de API/frontend são encerrados ao fechar o dev.sh (Ctrl+C)."
  exit 0
fi

# --- Pré-requisitos ----------------------------------------------------------
command -v docker >/dev/null 2>&1 || { err "Docker não encontrado. Instale o Docker."; exit 1; }
command -v pnpm   >/dev/null 2>&1 || { err "pnpm não encontrado. Instale o pnpm (npm i -g pnpm)."; exit 1; }
[[ -f .env ]] || { err ".env não encontrado na raiz do projeto."; exit 1; }

# --- Carrega .env ------------------------------------------------------------
log "Carregando variáveis do .env..."
set -a
# shellcheck disable=SC1091
. ./.env
set +a
[[ -n "${DATABASE_URL:-}" ]] || { err "DATABASE_URL não definido no .env."; exit 1; }

# --- Deriva credenciais do DATABASE_URL --------------------------------------
eval "$(node -e '
const u = new URL(process.env.DATABASE_URL);
const q = (s) => `"${String(s).replace(/"/g, "\\\"")}"`;
console.log(`PG_USER=${q(decodeURIComponent(u.username))}`);
console.log(`PG_PASS=${q(decodeURIComponent(u.password))}`);
console.log(`PG_DB=${q(u.pathname.slice(1))}`);
console.log(`PG_PORT=${q(u.port || "5432")}`);
console.log(`PG_HOST=${q(u.hostname)}`);
')"
log "Banco alvo: $PG_USER@$PG_HOST:$PG_PORT/$PG_DB"

# --- Sobe o PostgreSQL -------------------------------------------------------
if docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  log "Container '$DB_CONTAINER' já está rodando."
elif docker ps -a --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  log "Iniciando container existente '$DB_CONTAINER'..."
  docker start "$DB_CONTAINER" >/dev/null
else
  log "Criando container PostgreSQL '$DB_CONTAINER' na porta $PG_PORT..."
  docker run -d --name "$DB_CONTAINER" \
    -e POSTGRES_USER="$PG_USER" \
    -e POSTGRES_PASSWORD="$PG_PASS" \
    -e POSTGRES_DB="$PG_DB" \
    -p "${PG_PORT}:5432" \
    "$PG_IMAGE" >/dev/null
fi

# --- Espera o banco aceitar conexões -----------------------------------------
log "Aguardando o PostgreSQL ficar pronto..."
for i in $(seq 1 30); do
  if docker exec "$DB_CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
    log "PostgreSQL pronto."
    break
  fi
  [[ $i -eq 30 ]] && { err "Timeout aguardando o PostgreSQL."; exit 1; }
  sleep 1
done

# --- Dependências ------------------------------------------------------------
if [[ ! -d node_modules ]]; then
  log "Instalando dependências (pnpm install)..."
  pnpm install
fi

# --- Compila lib/db e aplica o schema ----------------------------------------
log "Compilando lib/db e aplicando schema (drizzle-kit push)..."
( cd lib/db && npx tsc --build && npx drizzle-kit push --config ./drizzle.config.ts )

# --- --db: encerra aqui ------------------------------------------------------
if [[ "${1:-}" == "--db" ]]; then
  log "Banco pronto e schema aplicado. (--db) Encerrando."
  exit 0
fi

# --- Inicia API + frontend ---------------------------------------------------
API_PID=""
WEB_PID=""
cleanup() {
  log "Encerrando serviços..."
  [[ -n "$API_PID" ]] && kill "$API_PID" >/dev/null 2>&1 || true
  [[ -n "$WEB_PID" ]] && kill "$WEB_PID" >/dev/null 2>&1 || true
  warn "O banco continua rodando. Use './dev.sh --stop' para pará-lo."
}
trap cleanup EXIT INT TERM

log "Iniciando API na porta ${PORT:-8080}..."
pnpm --filter @workspace/api-server run dev &
API_PID=$!

log "Iniciando frontend (Vite) na porta ${SIGNAGE_PORT}..."
PORT="$SIGNAGE_PORT" BASE_PATH="$SIGNAGE_BASE_PATH" pnpm --filter @workspace/signage run dev &
WEB_PID=$!

log "-----------------------------------------------------------"
log "Painel:    http://localhost:${SIGNAGE_PORT}/admin"
log "Display:   http://localhost:${SIGNAGE_PORT}/tv.html?key=DEVICE_KEY"
log "API health: http://localhost:${PORT:-8080}/api/healthz"
log "Ctrl+C para encerrar API e frontend."
log "-----------------------------------------------------------"

wait
