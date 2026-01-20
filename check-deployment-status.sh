#!/bin/bash

echo "=== Git Status ==="
git status

echo ""
echo "=== Current Branch ==="
git branch --show-current

echo ""
echo "=== Recent Commits ==="
git log --oneline -5

echo ""
echo "=== Remote Status ==="
git remote -v

echo ""
echo "=== Uncommitted Changes ==="
git diff --name-only

echo ""
echo "=== Unpushed Commits ==="
git log origin/$(git branch --show-current)..HEAD --oneline 2>/dev/null || echo "Could not check unpushed commits"
