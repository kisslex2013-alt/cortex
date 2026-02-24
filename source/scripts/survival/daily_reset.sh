#!/bin/bash
# scripts/survival/daily_reset.sh
echo "[$(date)] Running daily metrics reset..." >> /root/.openclaw/workspace/memory/system.log
# Logic to trigger reset in PaperTrader via a trigger file or direct call
touch /root/.openclaw/workspace/tmp/trigger_daily_reset
