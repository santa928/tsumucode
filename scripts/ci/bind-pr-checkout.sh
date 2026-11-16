#!/bin/sh
set -eu

# The event's base SHA can be stale. The remote-tracking ref is the base fetched
# by the immediately preceding trusted actions/checkout; it is not a freshness
# proof after that checkout, so main and head must be checked again before merge.
test "$PR_BASE_REF" = main
test "$PR_BASE_REPO" = "$GITHUB_REPOSITORY"
test "$(git remote get-url origin)" = "https://github.com/$GITHUB_REPOSITORY"
for sha in "$PR_EVENT_BASE_SHA" "$PR_HEAD_SHA" "$PR_MERGE_SHA"; do
  case "$sha" in *[!0-9a-f]*|'') exit 1 ;; esac
  test "${#sha}" -eq 40
done
checked_base=$(git show-ref --verify --hash refs/remotes/origin/main)
case "$checked_base" in *[!0-9a-f]*|'') exit 1 ;; esac
test "${#checked_base}" -eq 40
test "$(git rev-parse HEAD)" = "$PR_MERGE_SHA"
test "$(git rev-parse HEAD^1)" = "$checked_base"
test "$(git rev-parse HEAD^2)" = "$PR_HEAD_SHA"
if git rev-parse --verify HEAD^3 >/dev/null 2>&1; then exit 1; fi
test "$(git rev-parse 'HEAD^{tree}')" = "$(git rev-parse "${PR_HEAD_SHA}^{tree}")"
git merge-base --is-ancestor "$PR_EVENT_BASE_SHA" "$checked_base"
git merge-base --is-ancestor "$checked_base" "$PR_HEAD_SHA"
printf 'checked_base_sha=%s\n' "$checked_base" >> "$GITHUB_OUTPUT"
printf 'event_base_sha=%s\n' "$PR_EVENT_BASE_SHA" >> "$GITHUB_OUTPUT"
