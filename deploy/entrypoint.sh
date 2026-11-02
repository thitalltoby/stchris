#!/bin/sh
# A persistent disk mounted over /data at runtime replaces the ownership set at build time,
# so the storage directory is created and handed to the "node" user here before dropping root.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$STORAGE_DIR"
  chown node:node "$STORAGE_DIR"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
