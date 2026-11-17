#!/bin/sh
# Runs only inside an isolated, disposable writable staging mount at /repo.
# Values are claims; the caller must authenticate commit, tree, tag and checkout bytes.
set -eu
export PATH=/usr/bin:/bin LC_ALL=C
test "$#" -eq 6 || exit 2
target=$1 tree=$2 tag=$3 tag_object=$4 tag_target=$5 tag_sha256=$6
for value in "$target" "$tree" "$tag_object" "$tag_target"; do
  test "${#value}" -eq 40 || exit 2
  case "$value" in *[!0-9a-f]*) exit 2 ;; esac
done
test "${#tag_sha256}" -eq 64 || exit 2
case "$tag_sha256" in *[!0-9a-f]*) exit 2 ;; esac
case "$tag" in tsumucode-app-*) ;; *) exit 2 ;; esac
tag_numbers=${tag#tsumucode-app-}
tag_run=${tag_numbers%%-*}
tag_deployment=${tag_numbers#*-}
test "$tag_numbers" = "$tag_run-$tag_deployment" || exit 2
test -n "$tag_run" || exit 2
test -n "$tag_deployment" || exit 2
case "$tag_run$tag_deployment" in *[!0-9]*) exit 2 ;; esac
readonly target tree tag tag_object tag_target tag_sha256
git_safe() {
  seconds=$1
  shift
  /usr/bin/timeout "$seconds" /usr/bin/env -i PATH=/usr/bin:/bin HOME=/tmp \
    GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_NO_REPLACE_OBJECTS=1 \
    GIT_OPTIONAL_LOCKS=0 GIT_TERMINAL_PROMPT=0 \
    /usr/bin/git -C /repo -c core.fsmonitor=false "$@"
}
test -d /repo
test ! -L /repo
test -d /repo/.git
test ! -L /repo/.git
test -f /repo/.git/config
test ! -L /repo/.git/config
test -f /repo/.git/HEAD
test ! -L /repo/.git/HEAD
config_links=$(/usr/bin/stat -c '%h' /repo/.git/config) || exit 1
head_links=$(/usr/bin/stat -c '%h' /repo/.git/HEAD) || exit 1
test "$config_links" = 1
test "$head_links" = 1
test -d /repo/.git/info
test ! -L /repo/.git/info
test -d /repo/.git/hooks
test ! -L /repo/.git/hooks
absent() { test ! -e "$1" && test ! -L "$1"; }
absent /repo/.git/info/attributes
absent /repo/.git/info/exclude
absent /repo/.git/info/grafts
absent /repo/.git/objects/info/alternates
absent /repo/.git/objects/info/http-alternates
absent /repo/.git/packed-refs
absent /repo/.git/shallow
absent /repo/.git/commondir
absent /repo/.git/config.worktree
absent /repo/.git/index
expected=$(/usr/bin/mktemp /tmp/anchor-config.XXXXXX)
trap 'rm -f "$expected"' EXIT
trap 'exit 1' HUP INT TERM
printf '[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = true\n' > "$expected"
cmp -s "$expected" /repo/.git/config
# Never fetch into a pre-existing repository or reuse its object database.
test -d /repo/.git/objects
test ! -L /repo/.git/objects
test -d /repo/.git/refs
test ! -L /repo/.git/refs
objects=$(/usr/bin/find /repo/.git/objects -mindepth 1 ! -type d -print -quit) || exit 1
refs=$(/usr/bin/find /repo/.git/refs -mindepth 1 ! -type d -print -quit) || exit 1
hooks=$(/usr/bin/find /repo/.git/hooks -mindepth 1 -print -quit) || exit 1
worktree=$(/usr/bin/find /repo -mindepth 1 -maxdepth 1 ! -name .git -print -quit) || exit 1
test -z "$objects"
test -z "$refs"
test -z "$hooks"
test -z "$worktree"
git_safe 180 fetch --no-tags --no-write-fetch-head \
  https://github.com/santa928/tsumucode.git "$target" \
  "refs/tags/$tag:refs/tags/$tag"
printf '%s\n' "$target" > /repo/.git/HEAD
git_safe 120 fsck --full --strict --no-reflogs
actual_tree=$(git_safe 30 rev-parse "$target^{tree}") || exit 1
actual_tag=$(git_safe 30 rev-parse "refs/tags/$tag") || exit 1
actual_tag_type=$(git_safe 30 cat-file -t "$tag_object") || exit 1
actual_target=$(git_safe 30 rev-parse "refs/tags/$tag^{}") || exit 1
actual_target_type=$(git_safe 30 cat-file -t "$tag_target") || exit 1
test "$actual_tree" = "$tree"
test "$actual_tag" = "$tag_object"
test "$actual_tag_type" = tag
test "$actual_target" = "$tag_target"
test "$actual_target_type" = commit
tag_bytes=$(/usr/bin/mktemp /tmp/anchor-tag.XXXXXX)
trap 'rm -f "$expected" "$tag_bytes"' EXIT
git_safe 30 cat-file tag "$tag_object" > "$tag_bytes"
tag_hash=$(/usr/bin/sha256sum "$tag_bytes") || exit 1
test "${tag_hash%% *}" = "$tag_sha256"
tag_header=$(/usr/bin/head -n 2 "$tag_bytes") || exit 1
expected_tag_header=$(printf 'object %s\ntype commit' "$tag_target") || exit 1
test "$tag_header" = "$expected_tag_header"
git_safe 120 reset --hard "$target"
actual_head=$(git_safe 30 rev-parse --verify HEAD) || exit 1
test "$actual_head" = "$target"
printf 'checkout and object consistency: PASS\n'
