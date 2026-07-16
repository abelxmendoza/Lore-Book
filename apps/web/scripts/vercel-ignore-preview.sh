#!/usr/bin/env bash
# Exit 0 => skip this deployment. Exit 1 => build.
# lore-book-web is the production Git project; PR previews come from lore-keeper.
if [ "${VERCEL_ENV:-}" = "production" ]; then
  exit 1
fi
exit 0
