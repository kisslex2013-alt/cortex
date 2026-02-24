#!/bin/bash
# scripts/survival/ground_truth.sh
# Автогенерирует снимок реального состояния системы
# Cron: каждые 2 часа → docs/GROUND_TRUTH.md
# Бот ОБЯЗАН прочитать этот файл перед планированием (см. AGENTS.md)

OUTPUT="/root/.openclaw/workspace/docs/GROUND_TRUTH.md"
ROOT="/root/.openclaw/workspace"

echo "# 🔒 Ground Truth (автогенерация: $(date '+%Y-%m-%d %H:%M'))" > $OUTPUT
echo "> НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ — обновляется автоматически каждые 2ч" >> $OUTPUT
echo "" >> $OUTPUT

echo "## Cron-задачи (system)" >> $OUTPUT
echo '```' >> $OUTPUT
crontab -l 2>/dev/null | grep -v "^#" | grep -v "^$" >> $OUTPUT
echo '```' >> $OUTPUT
echo "" >> $OUTPUT

echo "## Скрипты" >> $OUTPUT
for dir in scripts/evolution scripts/reflexes scripts/ton scripts/finance scripts/swarm scripts/survival; do
    if [ -d "$ROOT/$dir" ]; then
        echo "### $dir/" >> $OUTPUT
        ls -1 "$ROOT/$dir" 2>/dev/null | sed 's/^/- /' >> $OUTPUT
        echo "" >> $OUTPUT
    fi
done

echo "## Git (последние 5 коммитов)" >> $OUTPUT
cd $ROOT && git log -5 --format="- %ci: %s" >> $OUTPUT 2>/dev/null
echo "" >> $OUTPUT

echo "## Redis" >> $OUTPUT
KEYS=$(redis-cli keys "jarvis:*" 2>/dev/null | wc -l)
echo "Активных ключей jarvis:* = $KEYS" >> $OUTPUT
echo "" >> $OUTPUT

echo "## Процессы" >> $OUTPUT
pgrep -a "node\|openclaw" 2>/dev/null | head -5 >> $OUTPUT || echo "Нет процессов" >> $OUTPUT
