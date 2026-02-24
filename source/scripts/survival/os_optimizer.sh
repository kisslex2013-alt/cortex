#!/bin/bash
# scripts/survival/os_optimizer.sh v2.0 (Audit Fix)
# Uses JARVIS_ROOT env variable instead of hardcoded paths
# v2.0: Added actual optimization recommendations and safety checks

JARVIS_ROOT="${JARVIS_ROOT:-/root/.openclaw/workspace}"
LOG_FILE="${JARVIS_ROOT}/memory/os_optimization.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$DATE] 🔧 OS Optimization Audit v2.0 Starting..." >> $LOG_FILE

# === 1. Memory Analysis ===
echo "--- Memory Usage ---" >> $LOG_FILE
free -h >> $LOG_FILE

# === 2. Top memory consumers (non-Jarvis) ===
echo "--- Top 10 Non-Jarvis Memory Consumers ---" >> $LOG_FILE
ps aux --sort=-%mem | grep -v "openclaw" | grep -v "node" | grep -v "redis" | head -n 10 >> $LOG_FILE

# === 3. Systemd services that can be disabled ===
echo "--- Unnecessary Systemd Services (Candidates for Disable) ---" >> $LOG_FILE
BLOAT_SERVICES="snapd cups packagekit whoopsie avahi fwupd ModemManager bluetooth"
for svc in $BLOAT_SERVICES; do
    STATUS=$(systemctl is-active "$svc" 2>/dev/null)
    if [ "$STATUS" = "active" ]; then
        echo "  ⚠️ $svc is ACTIVE (can be disabled to save RAM)" >> $LOG_FILE
    fi
done

# === 4. Disk usage ===
echo "--- Disk Usage ---" >> $LOG_FILE
df -h / >> $LOG_FILE

# === 5. Node processes count ===
echo "--- Node Processes ---" >> $LOG_FILE
NODE_COUNT=$(ps aux | grep '[n]ode' | wc -l)
echo "  Active Node processes: $NODE_COUNT" >> $LOG_FILE

# === 6. Stale tmp files ===
echo "--- Stale /tmp Files (>7 days) ---" >> $LOG_FILE
STALE_COUNT=$(find /tmp -type f -mtime +7 2>/dev/null | wc -l)
echo "  Files: $STALE_COUNT" >> $LOG_FILE

# === 7. Journal disk usage ===
echo "--- Systemd Journal Size ---" >> $LOG_FILE
journalctl --disk-usage 2>/dev/null >> $LOG_FILE

echo "[$DATE] ✅ Audit Complete. Review log before applying optimizations." >> $LOG_FILE
echo "" >> $LOG_FILE
