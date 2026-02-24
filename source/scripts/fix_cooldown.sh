#!/bin/bash
# scripts/fix_cooldown.sh
# Сбрасывает cooldown всех провайдеров OpenClaw
# Использование: bash scripts/fix_cooldown.sh

PROFILES="/root/.openclaw/agents/main/agent/auth-profiles.json"

if [ ! -f "$PROFILES" ]; then
    echo "❌ Файл $PROFILES не найден"
    exit 1
fi

# Сбросить usageStats
python3 -c "
import json
with open('$PROFILES','r') as f: d=json.load(f)
d['usageStats'] = {}
with open('$PROFILES','w') as f: json.dump(d,f,indent=2)
print('✅ Cooldown всех провайдеров сброшен')
"

# Перезапустить OpenClaw
pm2 restart all 2>/dev/null && echo "✅ OpenClaw перезапущен" || echo "⚠️ pm2 не найден, перезапусти вручную"
