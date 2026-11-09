#!/bin/bash
INTERVAL="${INTERVAL:-3}"

while true; do
    /app/monitor.sh
    sleep "$INTERVAL"
done