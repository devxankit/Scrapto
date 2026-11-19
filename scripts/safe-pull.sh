#!/usr/bin/env bash
# Safe replacement for "git pull": fetches, scans the incoming code for malware
# BEFORE it touches your working tree, and only merges if it is clean.
#
#   bash scripts/safe-pull.sh            # current branch from origin
#   bash scripts/safe-pull.sh main
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2
BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"

git fetch origin "$BRANCH" || exit 2
echo "Scanning origin/$BRANCH before merging..."
if ! bash scripts/scan-malware.sh "origin/$BRANCH"; then
  echo
  echo "Pull STOPPED: origin/$BRANCH is not clean. Nothing was merged into your files."
  echo "Clean it on a separate branch first (see docs/SECURITY-PULL-CHECK.md)."
  exit 1
fi

# Commits you have that origin does not: your unpushed work, OR commits a
# force-push removed from GitHub (that is how the 2026-11-19 attack looked).
LOCAL_ONLY=$(git log --oneline "origin/$BRANCH..HEAD")
if [ -n "$LOCAL_ONLY" ]; then
  echo "Note: these local commits are not on origin/$BRANCH (unpushed work, or removed by a force-push):"
  echo "$LOCAL_ONLY"
fi

git merge --no-edit "origin/$BRANCH"
