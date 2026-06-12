#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${ROOT_DIR}/dist-app/mac-arm64/HttpMocker.app"
LOG_FILE="${HTTPMOCKER_APP_LOG:-/tmp/httpmocker-app.log}"
UI_PORT="${LOCAL_UI_PORT:-8898}"
PROXY_PORT="${LOCAL_PROXY_PORT:-8899}"

app_pids() {
  pgrep -x HttpMocker || true
}

port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_stop() {
  local deadline=$((SECONDS + 12))
  while (( SECONDS < deadline )); do
    if [[ -z "$(app_pids)" ]] && ! port_in_use "${UI_PORT}" && ! port_in_use "${PROXY_PORT}"; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

wait_for_start() {
  local deadline=$((SECONDS + 15))
  while (( SECONDS < deadline )); do
    if port_in_use "${UI_PORT}" && port_in_use "${PROXY_PORT}"; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

if [[ ! -d "${APP_PATH}" ]]; then
  printf '未找到可执行 App，请先运行 npm run pack:mac。\n' >&2
  exit 1
fi

if [[ -n "$(app_pids)" ]]; then
  pkill -TERM -x HttpMocker || true
  if ! wait_for_stop; then
    pkill -KILL -x HttpMocker || true
    if ! wait_for_stop; then
      printf '旧 HttpMocker 进程或端口仍未释放。\n' >&2
      exit 1
    fi
  fi
fi

if command -v open >/dev/null 2>&1; then
  open "${APP_PATH}"
else
  nohup "${APP_PATH}/Contents/MacOS/HttpMocker" >"${LOG_FILE}" 2>&1 </dev/null &
fi

if wait_for_start; then
  printf 'HttpMocker 已启动: http://127.0.0.1:%s\n' "${UI_PORT}"
  exit 0
fi

printf 'HttpMocker 启动后端口未就绪，日志如下：\n' >&2
tail -n 80 "${LOG_FILE}" >&2 || true
exit 1
