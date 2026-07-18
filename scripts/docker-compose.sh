#!/bin/sh
set -eu

# main checkoutとlinked worktreeのどちらでも、read-only Git metadata mountを自動構成する。
git_common_dir=$(git rev-parse --path-format=absolute --git-common-dir)
git_admin_dir=$(git rev-parse --path-format=absolute --git-dir)

case "$git_admin_dir" in
  "$git_common_dir")
    git_admin_relative=.
    ;;
  "$git_common_dir"/*)
    git_admin_relative=${git_admin_dir#"$git_common_dir"/}
    ;;
  *)
    echo "Git admin directory is outside the common directory: $git_admin_dir" >&2
    exit 1
    ;;
esac

export TSUMUCODE_GIT_COMMON_DIR=$git_common_dir
export TSUMUCODE_GIT_ADMIN=$git_admin_relative

exec docker compose "$@"
