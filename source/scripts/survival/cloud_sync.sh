#!/bin/bash
# scripts/survival/cloud_sync.sh
LOG_FILE="/root/.openclaw/workspace/memory/cloud_sync.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$DATE] Starting Cloud Sync to Yandex.Disk..." >> $LOG_FILE

# Encrypted backup of all SQLite databases
DB_BACKUP="/tmp/jarvis_db_backup_$(date +%Y%m%d_%H%M).tar.gz.enc"
echo "[$DATE] Backing up databases (encrypted)..." >> $LOG_FILE
find /root/.openclaw/workspace -name "*.db" -not -path "*/node_modules/*" -print0 2>/dev/null | \
  tar czf - --null -T - 2>/dev/null | \
  openssl enc -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASS \
  -out "$DB_BACKUP" 2>> $LOG_FILE

if [ -f "$DB_BACKUP" ]; then
  rclone copy "$DB_BACKUP" yandex:jarvis_backup/db_daily/ >> $LOG_FILE 2>&1
  # Удалить бэкапы старше 7 дней на Яндекс.Диске
  rclone delete yandex:jarvis_backup/db_daily/ --min-age 7d >> $LOG_FILE 2>&1
  rm -f "$DB_BACKUP"
  echo "[$DATE] DB backup uploaded and local copy removed." >> $LOG_FILE
else
  echo "[$DATE] WARNING: DB backup failed (BACKUP_PASS set?)" >> $LOG_FILE
fi

# Sync core workspace files (excluding node_modules and big backups)
# Removed --vfs-cache-mode as it's for 'mount', not 'sync'
rclone sync /root/.openclaw/workspace yandex:jarvis_backup/workspace \
    --exclude "node_modules/**" \
    --exclude ".git/**" \
    --exclude "research_backup.tar.gz" \
    --exclude "backups/**" >> $LOG_FILE 2>&1

# Backup the encrypted vault separately
rclone copy /root/.openclaw/vault/secrets.enc yandex:jarvis_backup/vault/ >> $LOG_FILE 2>&1

echo "[$DATE] Cloud Sync Complete." >> $LOG_FILE
