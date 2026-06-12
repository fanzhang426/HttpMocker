#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UI_HOST="${LOCAL_UI_HOST:-127.0.0.1}"
UI_PORT="${LOCAL_UI_PORT:-8898}"
PROXY_PORT="${LOCAL_PROXY_PORT:-8899}"
LOCAL_HOST_VALUE="${LOCAL_HOST:-0.0.0.0}"
MAX_BODY_BYTES="${LOCAL_MAX_BODY_BYTES:-5242880}"
MAX_RECENT_REQUESTS="${LOCAL_MAX_RECENT_REQUESTS:-250}"
UI_URL="http://${UI_HOST}:${UI_PORT}"
HEALTH_URL="${UI_URL}/api/health"
LOG_FILE="${LOCAL_LOG_FILE:-${ROOT_DIR}/data/http-mocker.log}"
PID_FILE="${LOCAL_PID_FILE:-${ROOT_DIR}/data/http-mocker.pid}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"

is_healthy() {
  curl -fsS "${HEALTH_URL}" >/dev/null 2>&1
}

open_ui() {
  if command -v open >/dev/null 2>&1; then
    open "${UI_URL}"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${UI_URL}" >/dev/null 2>&1 &
  else
    printf '控制面板: %s\n' "${UI_URL}"
  fi
}

wait_until_healthy() {
  for _ in $(seq 1 120); do
    if is_healthy; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

start_service() {
  if [[ -z "${NODE_BIN}" ]]; then
    printf '未找到 node，请先安装 Node.js。\n' >&2
    exit 1
  fi

  (
    cd "${ROOT_DIR}"
    LOCAL_UI_PORT="${UI_PORT}" \
    LOCAL_PROXY_PORT="${PROXY_PORT}" \
    LOCAL_HOST="${LOCAL_HOST_VALUE}" \
    LOCAL_MAX_BODY_BYTES="${MAX_BODY_BYTES}" \
    LOCAL_MAX_RECENT_REQUESTS="${MAX_RECENT_REQUESTS}" \
      nohup "${NODE_BIN}" src/server.js >"${LOG_FILE}" 2>&1 </dev/null &
    printf '%s\n' "$!" >"${PID_FILE}"
    disown || true
  )
}

mkdir -p "${ROOT_DIR}/data"

if is_healthy; then
  printf 'HttpMocker 已启动: %s\n' "${UI_URL}"
  open_ui
  exit 0
fi

printf '正在启动 HttpMocker...\n'
start_service

if wait_until_healthy; then
  printf 'HttpMocker 已启动: %s\n' "${UI_URL}"
  open_ui
  exit 0
fi

printf 'HttpMocker 启动失败，日志如下：\n' >&2
tail -n 40 "${LOG_FILE}" >&2 || true
exit 1
