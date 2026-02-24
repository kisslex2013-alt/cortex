# 🤖 Project JARVIS

> Intelligent AI Assistant-Orchestrator with Security by Design, Self-Healing and Controlled Evolution

---

## Mission

JARVIS — локально/на сервере управляемый ассистент-оркестратор, который:
- **Безопасно** выполняет задачи пользователя (sandbox, secrets vault, audit)
- **Сам себя лечит** при сбоях (watchdog, restore points, safe mode)
- **Эволюционирует** через контролируемое обучение и расширение модулей

**Три столпа:** Security → Self-Healing → Controlled Learning

## Принципы

| Принцип | Что значит |
|---------|-----------|
| **Security by Design** | Секреты — только в Vault. Sandbox для любого исполнения. Audit на каждое действие |
| **Self-Healing** | Watchdog + auto-restart + restore points + safe mode при нестабильности |
| **Minimal Core** | Ядро делает минимум: event loop, plugins, config. Остальное — модули |
| **Honest by Default** | Не врёт, не выдумывает. "Не знаю" + план проверки |
| **Proactive, not Spammy** | Пишет первым только при реальной ценности + anti-spam + "не беспокоить" |

## Quick Start

```bash
# Клонировать
git clone https://github.com/YOUR_ORG/jarvis.git && cd jarvis

# Установить зависимости
pnpm install

# Настроить
cp config/default.yaml config/local.yaml
# Отредактировать config/local.yaml: добавить Telegram token, API keys

# Запустить
pnpm dev
```

## Архитектура (кратко)

```
Telegram / Discord / WhatsApp / Webhook / CLI
         │
    ┌────▼─────┐
    │  CORE    │  ← Event Loop + Plugin Loader + Task Scheduler
    │  KERNEL  │
    └─┬──┬──┬──┘
      │  │  │
  ┌───▼┐ │ ┌▼──────┐
  │BRAIN│ │ │MEMORY │  ← LLM Router (7 providers) │ Fast + Long + RAG
  └──┬──┘ │ └───┬───┘
     │  ┌─▼──┐  │
     │  │POLICY│ │  ← Risk Engine + Approval Gates
     │  └──┬──┘  │
  ┌──▼──┐  │  ┌──▼─────┐
  │SANDBOX│ │ │WATCHDOG│  ← Docker Isolation │ Health + Restore + Safe Mode
  └──────┘ │ └────────┘
        ┌──▼──┐
        │AUDIT│  ← Structured Logs + Redaction + Metrics
        └─────┘
```

## Пример

```typescript
// Jarvis автоматически выбирает LLM по сложности запроса
const response = await jarvis.brain.think(
  "Проанализируй безопасность нового skill",
  { complexity: 8 }  // → Gemini Pro (premium)
);

// Policy Engine оценивает риск перед выполнением
const risk = await jarvis.policy.assess({
  action: 'deploy',
  target: 'production',
  // → HIGH risk → requires approval
});
```

## Документация

| Документ | Содержание |
|----------|-----------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Компоненты, потоки данных, sandbox, policy |
| [ROADMAP.md](docs/ROADMAP.md) | MVP → v1 → v2 с критериями |
| [SOUL.md](docs/SOUL.md) | Memory & Soul: память, RAG, обучение |
| [SECURITY.md](docs/SECURITY.md) | Threat model, секреты, изоляция, аудит |
| [SKILLS_SPEC.md](docs/SKILLS_SPEC.md) | Формат навыков, версии, тесты |
| [POLICY.md](docs/POLICY.md) | Risk engine, approval gates, режимы |

## Стек

- **Runtime:** TypeScript + Node.js ≥22
- **Storage:** SQLite (lightweight) / Redis (high-load)
- **Vector DB:** ChromaDB (embedded)
- **Sandbox:** Docker
- **Monorepo:** pnpm workspaces
- **Tests:** Vitest

## Лицензия

MIT
