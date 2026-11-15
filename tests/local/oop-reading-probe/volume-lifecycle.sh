#!/usr/bin/env bash
# A fixed run-scoped name and a fresh ownership label prevent removing an unrelated volume.
probe_volume_owned=no
probe_volume_name=''
probe_volume_owner=''

probe_volume_create() {
  case "${GITHUB_RUN_ID:-}" in ''|*[!0-9]*) echo 'volume-identity=invalid'; return 1;; esac
  case "${GITHUB_RUN_ATTEMPT:-}" in ''|*[!0-9]*) echo 'volume-identity=invalid'; return 1;; esac
  if [ "${#GITHUB_RUN_ID}" -gt 20 ] || [ "${#GITHUB_RUN_ATTEMPT}" -gt 10 ]; then
    echo 'volume-identity=invalid'; return 1
  fi
  probe_volume_name="oop-reading-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
  local listed
  listed=$(mktemp "$RUNNER_TEMP/oop-volume-list.XXXXXX") || return 1
  if ! docker volume ls --format '{{.Name}}' >"$listed" 2>/dev/null; then
    rm -f "$listed"; echo 'volume-list=failed'; return 1
  fi
  local grep_code=0
  grep -Fxq -- "$probe_volume_name" "$listed" || grep_code=$?
  if [ "$grep_code" -eq 0 ]; then
    rm -f "$listed"; echo 'volume-preexisting=blocked'; return 1
  elif [ "$grep_code" -ne 1 ]; then
    rm -f "$listed"; echo 'volume-list=failed'; return 1
  fi
  rm -f "$listed"
  probe_volume_owner=$(python3 -c 'import uuid; print(uuid.uuid4().hex)') || return 1
  case "$probe_volume_owner" in *[!0-9a-f]*|'') echo 'volume-owner=invalid'; return 1;; esac
  if [ "${#probe_volume_owner}" != 32 ]; then echo 'volume-owner=invalid'; return 1; fi
  if ! docker volume create --label "tsumucode.oop-owner=$probe_volume_owner" "$probe_volume_name" >/dev/null 2>&1; then
    echo 'volume-create=failed'; return 1
  fi
  local observed
  if ! observed=$(docker volume inspect --format '{{index .Labels "tsumucode.oop-owner"}}' "$probe_volume_name" 2>/dev/null) || [ "$observed" != "$probe_volume_owner" ]; then
    echo 'volume-ownership=unverified'; return 1
  fi
  probe_volume_owned=yes
  echo 'volume-create=passed'
}

probe_volume_cleanup() {
  [ "$probe_volume_owned" = yes ] || return 0
  if ! probe_volume_verify; then
    echo 'volume-cleanup=ownership-unverified'; return 1
  fi
  if ! docker volume rm "$probe_volume_name" >/dev/null 2>&1; then
    echo 'volume-cleanup=failed'; return 1
  fi
  probe_volume_owned=no
  echo 'volume-cleanup=passed'
}

probe_volume_verify() {
  [ "$probe_volume_owned" = yes ] || return 1
  local observed
  if ! observed=$(docker volume inspect --format '{{index .Labels "tsumucode.oop-owner"}}' "$probe_volume_name" 2>/dev/null) || [ "$observed" != "$probe_volume_owner" ]; then
    return 1
  fi
}
