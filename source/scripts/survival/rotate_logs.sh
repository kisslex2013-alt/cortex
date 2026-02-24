#!/bin/bash
# scripts/survival/rotate_logs.sh — Ротация логов и старых файлов
# Cron: 0 4 * * * (ежедневно в 4:00 UTC)
# Использование: bash rotate_logs.sh [--dry-run]

ROOT="/root/.openclaw/workspace"
DRY_RUN=false
[[ "$1" == "--dry-run" ]] && DRY_RUN=true

log() { echo "[$(date '+%Y-%m-%d %H:%M')] $1"; }

# 1. Удалить daily memory файлы старше 30 дней
log "Cleaning memory/ files older than 30 days..."
if $DRY_RUN; then
    find "$ROOT/memory" -name "????-??-??.md" -mtime +30 -print 2>/dev/null
else
    find "$ROOT/memory" -name "????-??-??.md" -mtime +30 -delete 2>/dev/null
fi

# 2. Ротировать .log файлы > 10MB
log "Rotating .log files > 10MB..."
find "$ROOT" -name "*.log" -size +10M -not -path "*/node_modules/*" | while read logfile; do
    log "  Rotating: $logfile ($(du -h "$logfile" | cut -f1))"
    if ! $DRY_RUN; then
        gzip -f "$logfile"
    fi
done

# 3. Очистить сжатые логи старше 7 дней
log "Removing .gz files older than 7 days..."
if $DRY_RUN; then
    find "$ROOT" -name "*.log.gz" -mtime +7 -print 2>/dev/null
else
    find "$ROOT" -name "*.log.gz" -mtime +7 -delete 2>/dev/null
fi

# 4. Очистить tmp файлы
log "Cleaning tmp/ files older than 7 days..."
if $DRY_RUN; then
    find "$ROOT/tmp" -type f -mtime +7 -print 2>/dev/null
else
    find "$ROOT/tmp" -type f -mtime +7 -delete 2>/dev/null
fi

# 5. Показать итоговые размеры
log "Disk usage summary:"
du -sh "$ROOT/memory" "$ROOT/scripts/survival"/*.log "$ROOT/data" 2>/dev/null

log "Log rotation complete."
