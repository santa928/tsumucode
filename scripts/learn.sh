#!/bin/sh
set -eu

# ローカルEngineを明示し、学習用web/controllerだけを専用Composeで起動する。
cd "$(dirname "$0")/.."
if [ -n "${DOCKER_CONTEXT:-}" ]; then
  endpoint=$(docker context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}')
else
  endpoint=${DOCKER_HOST:-$(docker context inspect --format '{{.Endpoints.docker.Host}}')}
fi
case "$endpoint" in unix:///*) ;; *) echo 'Local learning requires a local Unix Docker socket.' >&2; exit 1 ;; esac
export DOCKER_HOST=$endpoint
unset DOCKER_CONTEXT
export TSUMUCODE_LOCAL_SOCKET=${endpoint#unix://}
test -S "$TSUMUCODE_LOCAL_SOCKET" || { echo 'Docker socket is unavailable. Start Docker first.' >&2; exit 1; }
# Docker Desktopのbind sourceはmacOSのclient socketではなくLinux VM側で解決される。
if [ "$(uname -s)" = Darwin ]; then export TSUMUCODE_LOCAL_SOCKET=/var/run/docker.sock; fi
installation=$(pwd -P | shasum -a 256 | cut -c 1-16)
export TSUMUCODE_LOCAL_OWNER="tsumucode-learning-$installation"
case "${1:-up}" in
  up)
    echo 'ローカル学習を起動します。信頼するcontrollerだけにDocker管理socketを渡します。個人の学習用であり、第三者の敵対コードを安全に実行する公開サービスではありません。'
    docker image inspect node:24.18.0-bookworm-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5 >/dev/null 2>&1 || docker pull node:24.18.0-bookworm-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5
    ./scripts/docker-compose.sh -p "$TSUMUCODE_LOCAL_OWNER" -f compose.learning.yaml --profile build-project build project
    exec ./scripts/docker-compose.sh -p "$TSUMUCODE_LOCAL_OWNER" -f compose.learning.yaml up --build
    ;;
  down|config|logs|ps)
    exec ./scripts/docker-compose.sh -p "$TSUMUCODE_LOCAL_OWNER" -f compose.learning.yaml "$1"
    ;;
  *) echo 'Usage: scripts/learn.sh [up|down|config|logs|ps]' >&2; exit 1 ;;
esac
