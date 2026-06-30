#!/bin/sh
# Local compose Redis must stay writable (rate limits, BullMQ). AOF can replay an old
# REPLICAOF from a misconfigured replica — always demote to master on startup.
set -e

redis-server --appendonly yes &
pid=$!
trap 'kill -TERM "$pid" 2>/dev/null; wait "$pid"' TERM INT

until redis-cli ping 2>/dev/null | grep -q PONG; do
  if ! kill -0 "$pid" 2>/dev/null; then
    wait "$pid"
    exit 1
  fi
  sleep 0.2
done

redis-cli REPLICAOF NO ONE >/dev/null

wait "$pid"
