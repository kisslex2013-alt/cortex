# Текущее состояние системы v6.3
Последнее обновление: 2026-02-20

## ✅ Работает (в cron или постоянно)
- `cloud_sync.sh` — каждые 6 часов → Яндекс.Диск
- `ground_truth.sh` — каждые 2 часа, автогенерация снимка системы
- `semantic_distiller.js` — 04:00 ежедневно
- `platform_health.js` — 08:00 ежедневно (Platform Health)
- `security_council.js` — каждое воскресенье 06:00 (Security Council)
- `verify.js` — внешний верификатор, --telegram
- **Reputation Engine** — `/rep`
- `paper_trading.js` — бумажные сделки

## ✅ Готово, вызывается по необходимости
- `dex_spread_reflex.js` — спред STON.fi/DeDust
- `volatility_scanner.js` — цена TON multi-oracle
- `CrossChainIngestor.js` — ChangeNOW кросс-чейн

## ❌ Удалено (НЕ восстанавливать)
- **10 openclaw cron задач** — дубликаты и ошибки (удалены 2026-02-20)
- **Файлы:** `BOOTSTRAP`, `GUARDRAILS`, `IDENTITY`, `VISION`, `HEARTBEAT`, `TOOLS`, `TASKS` — содержимое влито в `AGENTS.md` и `SOUL.md`
- `dna_ledger.js`, `truth_layer.js`, `hashline_core.js`
- `daydreamer`, `emotions`, `empathy`, `field`, `goals`, `initiative`
- `observer`, `opinions`, `symbiosis`, `temporal`
- `execute_test`, `StealthDispatcher`, `molt_influencers`
- `vercel_monitor`, `runner`, `verify_vault`, `test_proxies`

## ❌ Не планируется
- WhatsApp Fallback — отменено

## 📁 Архивация
- **100+ legacy docs** перемещены в `archive/docs_legacy/`

---
*Примечание: Обновлять этот файл после каждого задания. Перед предложением "новых задач" — ПРОЧИТАТЬ этот файл.*
