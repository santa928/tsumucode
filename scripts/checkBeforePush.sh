#!/bin/sh
# 型付きcheckerの実行中はNodeの親processを保持しない。
set -eu

script_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
snapshot=$(mktemp)
trap 'rm -f "$snapshot"' EXIT

"$script_root/node_modules/.bin/tsx" "$script_root/scripts/checkBeforePush.ts" prepare "$snapshot" "$@"
export TEST_BASE_SHA=$1
check_script=check
if [ "${2-}" = '--release' ]; then
  check_script=check:release
fi

echo 'pre-push: npm run content:provenance'
npm run content:provenance
echo "pre-push: npm run $check_script"
npm run "$check_script"
"$script_root/node_modules/.bin/tsx" "$script_root/scripts/checkBeforePush.ts" finish "$snapshot" "$@"
