#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: $0 [--from <bundled tasks data dir>] [--to <tasks-plus data dir>]" >&2
  exit 2
}

data_dir="${BB_DATA_DIR:-$HOME/.bb}"
from="$data_dir/plugins/tasks"
to="$data_dir/plugins/tasks-plus"
while [ $# -gt 0 ]; do
  case "$1" in
    --from) from="${2:?}"; shift 2 ;;
    --to) to="${2:?}"; shift 2 ;;
    *) usage ;;
  esac
done

fail() {
  echo "error: $*" >&2
  exit 1
}

command -v sqlite3 >/dev/null || fail "sqlite3 is not installed"
[ -f "$from/data.db" ] || fail "no database at $from/data.db"

if command -v bb >/dev/null && bb plugin list 2>/dev/null | grep -Eq '^tasks-plus@[^ ]+ +running'; then
  fail "tasks-plus is running. Run 'bb plugin disable tasks-plus' first"
fi

if [ -f "$to/data.db" ]; then
  existing=$(sqlite3 "$to/data.db" \
    "SELECT CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE name = 'tasks')
       THEN (SELECT count(*) FROM tasks) ELSE 0 END")
  [ "$existing" -eq 0 ] || fail "$to/data.db already has $existing tasks. Nothing was changed"
fi

tmp=$(mktemp -d "${TMPDIR:-/tmp}/tasks-import.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

sqlite3 "$from/data.db" ".backup '$tmp/data.db'"
[ "$(sqlite3 "$tmp/data.db" 'PRAGMA integrity_check')" = "ok" ] ||
  fail "the copy of $from/data.db failed the integrity check"

mkdir -p "$to"
rm -f "$to/data.db" "$to/data.db-wal" "$to/data.db-shm"
mv "$tmp/data.db" "$to/data.db"

for entry in "$from"/*; do
  case "$(basename "$entry")" in
    data.db | data.db-wal | data.db-shm | logs) ;;
    *) cp -R "$entry" "$to/" ;;
  esac
done

sqlite3 "$to/data.db" "
  SELECT 'tasks: ' || count(*) FROM tasks;
  SELECT 'presets: ' || count(*) FROM presets;
  SELECT 'thread links: ' || count(*) FROM task_threads;
  SELECT 'attachments: ' || count(*) FROM attachments;"
echo "Imported $from into $to. Enable the fork with 'bb plugin enable tasks-plus'."
