#!/bin/sh
set -e
# Docker creates a missing bind-mount folder (e.g. ./data) as root. When started as root, make the
# data dir writable for the unprivileged `node` user (uid 1000), then drop privileges.
# If the container is started with `user:`, this is skipped and the folder must already be writable.
DATA_DIR="${DATA_DIR:-/data}"
if [ "$(id -u)" = "0" ]; then
	mkdir -p "$DATA_DIR"
	if [ "$(stat -c %u "$DATA_DIR")" != "$(id -u node)" ]; then
		echo "[cronspiracy] fixing ownership of $DATA_DIR for uid $(id -u node)"
		chown -R node:node "$DATA_DIR"
	fi
	exec su-exec node "$@"
fi
exec "$@"
