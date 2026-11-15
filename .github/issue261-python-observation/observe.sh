#!/bin/sh
set -eu

# This is a disposable, network-isolated container with public fixed Source only.
# No grade, edited source, user account, saved progress, or private data is used.
export HOME=/tmp/issue261-home
export BASE_PATH=/
export PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
mkdir -p "$HOME" /capture /tmp/issue261-private
phase=preview
server_pid=
classify_failure() {
  for entry in 'permission:EACCES|EPERM|Permission denied' 'read-only:EROFS|read-only file system' 'missing:ENOENT|Cannot find module|Executable.*doesn.t exist' 'browser-launch:browserType.launch|Failed to launch|Target closed' 'timeout:Timeout|timed out' 'cli-daemon:Daemon process exited'; do
    category=${entry%%:*}
    pattern=${entry#*:}
    if grep -Eiq "$pattern" /tmp/issue261-private/cli.log 2>/dev/null; then
      printf 'diagnostic-marker=%s\n' "$category" >&2
    fi
  done
}
trap 'status=$?; if [ -n "$server_pid" ]; then kill "$server_pid" 2>/dev/null || true; fi; if [ "$status" -ne 0 ]; then printf "observation failed at %s\n" "$phase" >&2; classify_failure; fi' EXIT
npm --prefix /workspace run preview -- --host 127.0.0.1 --port 4173 --strictPort > /tmp/issue261-private/server.log 2>&1 &
server_pid=$!
node - <<'NODE'
const deadline = Date.now() + 60_000;
(async function wait() {
  while (Date.now() < deadline) {
    try { if ((await fetch('http://127.0.0.1:4173/')).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  process.exit(1);
})();
NODE
PW=/tool/node_modules/.bin/playwright-cli
phase=browser-open
if ! node - > /tmp/issue261-private/browser-preflight.log 2>&1 <<'NODE'
const fs = require('node:fs');
const core = require('/tool/node_modules/playwright-core/package.json');
if (core.version !== '1.61.1') throw Error('Fixed browser library differs');
const executable = require('/tool/node_modules/playwright').chromium.executablePath();
try {
  for (const file of [executable, '/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell'])
    fs.accessSync(file, fs.constants.R_OK | fs.constants.X_OK);
  console.log('Fixed Chromium and headless shell are readable and executable.');
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : 'unknown';
  console.error(code === 'ENOENT' ? 'Fixed Chromium executable missing.' : code === 'EACCES' || code === 'EPERM' ? 'Fixed Chromium executable denied.' : 'Fixed Chromium executable unavailable.');
  process.exit(1);
}
NODE
then
  if grep -Fq 'Fixed Chromium executable missing.' /tmp/issue261-private/browser-preflight.log; then
    echo 'Fixed Chromium executable missing.' >&2
  elif grep -Fq 'Fixed Chromium executable denied.' /tmp/issue261-private/browser-preflight.log; then
    echo 'Fixed Chromium executable denied.' >&2
  else
    echo 'Fixed Chromium preflight failed.' >&2
  fi
  exit 1
fi
echo 'Fixed Chromium preflight passed.'
"$PW" --version > /capture/cli-version.txt
"$PW" -s=issue261 open 'http://127.0.0.1:4173/' > /tmp/issue261-private/cli.log 2>&1

snapshot() {
  "$PW" -s=issue261 snapshot --filename="$1" >> /tmp/issue261-private/cli.log 2>&1
}
find_ref() {
  node - "$1" "$2" <<'NODE'
const fs = require('node:fs');
const [file, label] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8');
const re = /button "([^"\n]+)" \[ref=(e\d+)\]/gu;
const refs = [...text.matchAll(re)].filter((match) => match[1] === label);
if (refs.length !== 1) process.exit(1);
process.stdout.write(refs[0][2]);
NODE
}
for lesson in 01 02 03; do
  phase="lesson-${lesson}-initial"
  "$PW" -s=issue261 goto "http://127.0.0.1:4173/#/courses/python-practice/lessons/python-practice-ch01-l${lesson}/exercises/python-practice-ch01-l${lesson}-e01" >> /tmp/issue261-private/cli.log 2>&1
  ready=0
  for attempt in $(seq 1 40); do
    snapshot "/capture/l${lesson}-initial.yml"
    if find_ref "/capture/l${lesson}-initial.yml" '説明を見直す' > /tmp/issue261-private/ref; then ready=1; break; fi
    sleep 1
  done
  test "$ready" = 1
  "$PW" -s=issue261 eval '() => window.location.hash' > /tmp/issue261-private/location.txt
  grep -Fq "#/courses/python-practice/lessons/python-practice-ch01-l${lesson}/exercises/python-practice-ch01-l${lesson}-e01" /tmp/issue261-private/location.txt
  case "$lesson" in
    01) title='内包表記で変換とfilterを分ける' ;;
    02) title='Iteratorの消費位置と作り直し' ;;
    03) title='Generatorを作り、進め、使い切る' ;;
  esac
  grep -Fq "$title" "/capture/l${lesson}-initial.yml"
  "$PW" -s=issue261 screenshot --filename="/capture/l${lesson}-initial.png" >> /tmp/issue261-private/cli.log 2>&1
  phase="lesson-${lesson}-review-open"
  "$PW" -s=issue261 click "$(cat /tmp/issue261-private/ref)" >> /tmp/issue261-private/cli.log 2>&1
  snapshot "/capture/l${lesson}-review-open.yml"
  grep -Fq 'dialog "関連スライド：' "/capture/l${lesson}-review-open.yml"
  find_ref "/capture/l${lesson}-review-open.yml" '閉じる' > /tmp/issue261-private/close-ref
  "$PW" -s=issue261 screenshot --filename="/capture/l${lesson}-review-open.png" >> /tmp/issue261-private/cli.log 2>&1
  phase="lesson-${lesson}-review-close"
  "$PW" -s=issue261 click "$(cat /tmp/issue261-private/close-ref)" >> /tmp/issue261-private/cli.log 2>&1
  snapshot "/capture/l${lesson}-review-closed.yml"
  find_ref "/capture/l${lesson}-review-closed.yml" '説明を見直す' > /dev/null
  if grep -Fq 'dialog "関連スライド：' "/capture/l${lesson}-review-closed.yml"; then exit 1; fi
  for state in initial review-open review-closed; do
    if grep -Fq '制作途中のCourseであり、公開Pathへは追加していません。' "/capture/l${lesson}-${state}.yml"; then value=present; else value=absent; fi
    printf 'l%s %s accessibility-snapshot=%s\n' "$lesson" "$state" "$value" >> /capture/observations.txt
  done
done
"$PW" -s=issue261 close >> /tmp/issue261-private/cli.log 2>&1
