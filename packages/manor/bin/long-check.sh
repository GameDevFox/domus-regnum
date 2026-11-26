#!/usr/bin/env bash
# The long checks of packages/manor (the unit tests and the whole page check), run on what is COMMITTED and apart from the tree being
# worked in, so that work goes on while they run.
#
#   bin/long-check.sh start    begin a run on HEAD; does nothing when one is already going, or when nothing the checks read has changed
#                              since the commit that last passed (a commit of documents alone is not run)
#   bin/long-check.sh again    as start, but runs even when HEAD has already passed
#   bin/long-check.sh status   what is running, what the last runs found, and whether HEAD has been checked
#   bin/long-check.sh wait     returns when nothing is running; its exit status is the last run's (0 passed, 1 failed)
#
# A run puts the commit at HEAD in a git worktree of its own (.claude/worktrees/long-check, which git ignores; being inside the repo it
# finds the repo's node_modules), serves it with a dev server of its own on port 3111, and runs the checks there against that server:
# nothing edited in the working tree, and nothing done to the dev server on 3011, can reach it. When a run has passed and HEAD has moved
# on meanwhile, the next run begins on the new HEAD; so one `start` after each commit is enough, and what it says is "all was well up to
# this commit". A run that fails ends the loop, to be read; `start` after the fix begins again.
#
# What it writes, all under <repo>/tmp/long-check/ (which git ignores): `results` (a line a run, newest last), `<commit>.txt` (a run's
# whole output), `running` (the commit being checked, while one is), `server.log`, `loop.log`, and `running.sh` (the copy of this script
# that a run is made by, so that this file can be edited while one goes on).
set -u

ROOT=$(dirname "$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir)")
STATE="${ROOT}/tmp/long-check"
TREE="${ROOT}/.claude/worktrees/long-check"
PACKAGE="packages/manor"
# What the checks read: a commit that changes nothing here but documents needs no run of its own.
CHECKED=("packages/manor" "packages/common-web" ":(exclude,glob)**/*.md")
BIN="${ROOT}/node_modules/.bin"
PORT=3111
# How many browsers the page check uses at once (bin/check3d-pool.ts). Four, measured on this machine of 24 cores on 2026-11-18: every part
# one after another took 483 s, by four browsers 207 s and by six 182 s, all passing; the page is drawn in software, and four browsers
# already keep every core busy.
WORKERS="${CHECK_WORKERS:-4}"
# How long the dev server is given to come up, in tenths of a second.
SERVER_TENTHS=600
# How long `start` waits to see its run begin, in tenths of a second.
BEGIN_TENTHS=50

mkdir -p "${STATE}"

running() { ! flock -n "${STATE}/lock" true; }
head_now() { git -C "${ROOT}" rev-parse HEAD; }
short() { git -C "${ROOT}" rev-parse --short "$1"; }
last_line() { [[ -f "${STATE}/results" ]] && tail -n 1 "${STATE}/results"; }
# The results file's lines are: day, time, short commit, "passed" or "FAILED", then what each check found.
last_outcome() { last_line | cut -d' ' -f4; }
# Has this commit passed, or does it differ from the commit that last passed in nothing the checks read?
passed_already() {
  local last
  [[ "$(last_outcome)" == "passed" ]] || return 1
  last=$(last_line | cut -d' ' -f3)
  git -C "${ROOT}" diff --quiet "${last}" "$1" -- "${CHECKED[@]}"
}

status() {
  if running; then echo "running: $(cat "${STATE}/running" 2>/dev/null || echo "(just begun)")"; else echo "running: nothing"; fi
  echo "HEAD:    $(short "$(head_now)")$(passed_already "$(head_now)" && echo " (passed)" || echo " (not checked, or not passed)")"
  echo "last runs:"
  if [[ -f "${STATE}/results" ]]; then tail -n 5 "${STATE}/results" | sed 's/^/  /'; else echo "  none yet"; fi
}

# One run, on one commit. Sets `outcome` to "passed" or "FAILED", and writes the run's line.
run_one() {
  local commit=$1 name log unit page server waited=0 tests checks
  name=$(short "${commit}")
  log="${STATE}/${name}.txt"
  echo "${name} since $(date '+%H:%M')" > "${STATE}/running"
  : > "${log}"

  if [[ -e "${TREE}/.git" ]]; then
    git -C "${TREE}" checkout -f --detach -q "${commit}" >> "${log}" 2>&1
  else
    git -C "${ROOT}" worktree add --detach "${TREE}" "${commit}" >> "${log}" 2>&1
  fi
  if [[ "$(git -C "${TREE}" rev-parse HEAD 2>> "${log}")" != "${commit}" ]]; then
    outcome="FAILED"
    echo "$(date '+%m-%d %H:%M') ${name} FAILED the worktree could not be put at the commit (${log})" >> "${STATE}/results"
    return
  fi

  echo "== unit tests" >> "${log}"
  (cd "${TREE}/${PACKAGE}" && "${BIN}/vitest" run) >> "${log}" 2>&1 9>&-
  unit=$?

  echo "== page check (${WORKERS} at once)" >> "${log}"
  (cd "${TREE}/${PACKAGE}" && exec "${BIN}/vite" --port "${PORT}" --strictPort) > "${STATE}/server.log" 2>&1 9>&- &
  server=$!
  SERVER_PID=${server}
  until grep -q "Local:" "${STATE}/server.log" || ! kill -0 "${server}" 2>/dev/null || ((waited++ >= SERVER_TENTHS)); do sleep 0.1; done
  if grep -q "Local:" "${STATE}/server.log"; then
    (cd "${TREE}/${PACKAGE}" && MANOR_URL="http://127.0.0.1:${PORT}/" CHECK_WORKERS="${WORKERS}" "${BIN}/tsx" bin/check3d.ts) >> "${log}" 2>&1 9>&-
    page=$?
  else
    echo "the dev server did not come up on port ${PORT}:" >> "${log}"
    cat "${STATE}/server.log" >> "${log}"
    page=1
  fi
  kill "${server}" 2>/dev/null
  wait "${server}" 2>/dev/null
  SERVER_PID=""

  tests=$(grep -E "^ +Tests " "${log}" | tail -n 1 | sed -E 's/\x1b\[[0-9;]*m//g; s/^ +Tests +//')
  checks=$(grep -E "checks passed$" "${log}" | tail -n 1)
  if ((unit == 0 && page == 0)); then outcome="passed"; else outcome="FAILED"; fi
  echo "$(date '+%m-%d %H:%M') ${name} ${outcome} unit: ${tests:-did not finish}; page: ${checks:-did not finish} (${log})" >> "${STATE}/results"
}

loop() {
  exec 9> "${STATE}/lock"
  flock -n 9 || exit 0
  SERVER_PID=""
  trap '[[ -n "${SERVER_PID}" ]] && kill "${SERVER_PID}" 2>/dev/null; rm -f "${STATE}/running"' EXIT
  local commit
  while :; do
    commit=$(head_now)
    run_one "${commit}"
    [[ "${outcome}" == "passed" ]] || break
    passed_already "$(head_now)" && break
  done
}

begin() {
  local waited=0
  if running; then echo "already running: $(cat "${STATE}/running" 2>/dev/null)"; return; fi
  if [[ "$1" != "again" ]] && passed_already "$(head_now)"; then echo "HEAD has already passed: $(last_line)"; return; fi
  cp "$0" "${STATE}/running.sh"
  setsid nohup bash "${STATE}/running.sh" loop > "${STATE}/loop.log" 2>&1 < /dev/null &
  until running || ((waited++ >= BEGIN_TENTHS)); do sleep 0.1; done
  if running; then echo "begun on $(short "$(head_now)")"; else echo "it did not begin: see ${STATE}/loop.log"; return 1; fi
}

case "${1:-status}" in
  start | again) begin "$1" ;;
  status) status ;;
  wait)
    flock "${STATE}/lock" true
    status
    [[ "$(last_outcome)" == "passed" ]]
    ;;
  loop) loop ;;
  *)
    echo "usage: $0 start | again | status | wait" >&2
    exit 2
    ;;
esac
