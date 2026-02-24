#!/bin/bash
# scripts/git_watcher.sh
# Наблюдает за изменениями файлов и делает коммит/пуш
# Настройка: pm2 start scripts/git_watcher.sh --name jarvis-git

ROOT="/root/.openclaw/workspace"
LOG="/var/log/jarvis/git_watcher.log"

mkdir -p /var/log/jarvis

echo "[$(date)] Git Watcher Started" >> $LOG

inotifywait -m -r \
  --exclude '(\.git|node_modules|\.log$|\.tmp$|jarvis_knowledge.db|jarvis_wisdom.db|paper_trades.json|market_history.json)' \
  -e modify,create,delete \
  $ROOT |
while read path action file; do
    # Дебаунс: ждём 60 секунд тишины перед коммитом
    sleep 60
    # Сбрасываем очередь inotify (если были ещё изменения)
    while read -t 1 path action file; do :; done

    echo "[$(date)] Change detected in $file. Syncing..." >> $LOG
    cd $ROOT
    node scripts/reflexes/git_sync_reflex.js >> $LOG 2>&1
done
