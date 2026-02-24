# 🦾 Jarvis Reflexes — Локальные скрипты-рефлексы

> Быстрые Node.js скрипты, заменяющие дорогие LLM-вызовы.
> 0 зависимостей · ~20-80мс · Готовый Telegram-формат · Русский язык

---

## Описание скриптов

| # | Скрипт | Назначение |
|---|--------|------------|
| 1 | `vps_reflex.js` | RAM, CPU, Swap, Disk — с progress-bars и сарказмом |
| 2 | `claw_reflex.js` | Баланс, ROI 24ч, упоминания CLAW в логах |
| 3 | `molt_listen_reflex.js` | Фильтр ленты moltbook по 24 ключевым словам (5 категорий) |
| 4 | `audit_reflex.js` | TODO/FIXME/HACK в src/ + аномалии файлов |
| 5 | `market_alert_reflex.js` | Цена TON, алерт при >3% за 10 мин |
| 6 | `git_sync_reflex.js` | Auto-commit + push с умным описанием |
| 7 | `context_cleanup_reflex.js` | Бэкап при >80% контекста, сохранение якорей |

---

## Использование на VPS

```bash
# Прямой запуск (из корня проекта)
node scripts/reflexes/vps_reflex.js
node scripts/reflexes/claw_reflex.js
node scripts/reflexes/molt_listen_reflex.js
node scripts/reflexes/audit_reflex.js
node scripts/reflexes/market_alert_reflex.js
node scripts/reflexes/git_sync_reflex.js
node scripts/reflexes/context_cleanup_reflex.js

# Если корень проекта нестандартный:
JARVIS_ROOT=/home/jarvis/openclaw node scripts/reflexes/vps_reflex.js

# Переменные окружения (опционально):
# JARVIS_ROOT       — корень проекта (default: ../../.. от скрипта)
# ALERT_THRESHOLD   — порог алерта цены в % (default: 3)
# ALERT_WINDOW      — окно анализа мин (default: 10)
# MAX_CONTEXT       — лимит токенов контекста (default: 128000)
# CLEANUP_THRESHOLD — порог очистки в % (default: 80)
# GIT_BRANCH        — ветка для push (default: main)
```

---

## Cron-расписание

> ⚠️ **DEPRECATED:** Crontab из этого файла **устарел** и содержал опасную частоту
> (market_alert каждые 60 секунд = 1440 вызовов/день).
>
> **Единственный актуальный crontab** находится в:
> 📄 `research/JARVIS_CRON_OPTIMIZATION.md`
>
> Используй ТОЛЬКО его при настройке VPS.

---

## Подготовка на VPS

```bash
# Создать директорию для логов
sudo mkdir -p /var/log/jarvis
sudo chown $(whoami) /var/log/jarvis

# Сделать скрипты исполняемыми
chmod +x scripts/reflexes/*.js

# Создать memory/ если не существует
mkdir -p memory/archive

# Проверить что всё работает
node scripts/reflexes/vps_reflex.js
```
