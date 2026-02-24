#!/bin/bash
# Phase 1: Event Ledger Append
# Usage: ./scripts/ledger_append.sh "EVENT_TYPE" "PAYLOAD_JSON"

EVENT_DIR="/root/.openclaw/workspace/.jarvis/events"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EVENT_ID=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 8 | head -n 1)
FILENAME="${TIMESTAMP}_${1}_${EVENT_ID}.json"

cat << EOF > "$EVENT_DIR/$FILENAME"
{
  "eventId": "$EVENT_ID",
  "timestamp": "$TIMESTAMP",
  "eventType": "$1",
  "payload": $2
}
EOF

echo "Event $EVENT_ID logged: $FILENAME"
