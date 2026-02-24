# 🏗️ ARCHITECTURE.md — Jarvis Architecture

## Обзор

Jarvis — модульная система из 14 packages в pnpm-monorepo. Каждый пакет — изолированный модуль с чёткой ответственностью. Включает нативную поддержку роя агентов (Swarm Runtime).

## Компоненты

### 1. Core Kernel (`packages/core`)

Минимальное ядро. Не содержит бизнес-логику:
- **Event Loop** — приём/маршрутизация событий от всех модулей
- **Plugin Loader** — динамическая загрузка packages как плагинов
- **Config Manager** — YAML + JSON Schema валидация, hot-reload
- **Task Scheduler** — очередь задач с приоритетами и дедлайнами

### 2. Brain — LLM Router (`packages/brain`)

Единый интерфейс для 7+ LLM-провайдеров:

```typescript
// Код Jarvis не знает, какая модель ответит
const result = await brain.think(prompt, { complexity: 8 });
// Router: Gemini Pro → Gemini Flash → Groq → DeepSeek → Mistral → Local Fallback
```

- **Auto-complexity** — классификация сложности промпта (1–10)
- **Account Rotation** — round-robin по нескольким аккаунтам (пример: 3 Google PRO)
- **Response Cache** — SHA256 hash → Redis/SQLite, TTL 1 час
- **Daily Budget** — распределение лимитов по времени суток
- **Universal LLM Gateway** — единый registry провайдеров (`LLMGateway`), поддержка форматов: `openai`, `google`, `anthropic`, `custom`. Хелперы: `makeGeminiProvider()`, `makeOpenAIProvider()`. Позволяет подключить любой LLM без изменения бизнес-логики.

**Источник:** [model_cascade_router.js](../../../source/scripts/survival/model_cascade_router.js)

### 3. Memory (`packages/memory`)

Трёхуровневая память:

| Уровень | Хранилище | TTL | Назначение |
|---------|----------|-----|-----------|
| **Fast (Working)** | RAM / SQLite | Сессия | Текущий контекст диалога |
| **Long (Facts)** | SQLite + FTS5 | Настраиваемый | Факты, предпочтения, знания |
| **Vector (RAG)** | ChromaDB | ∞ | Семантический поиск по всей базе знаний |

**Ключевые принципы:**
- Контроль пользователя: просмотр, редактирование, экспорт, удаление
- Минимизация данных: "суть и выводы", не сырой лог
- Секреты **никогда** не в памяти — только ссылки
- TTL + забывание: каждый факт имеет срок жизни

**CodebaseMapper** (из ARC Protocol) — автогенерация карты проекта для контекста Coordinator:
- `addEntry()` — регистрация файлов/директорий с описанием, exports, dependencies
- `find(pattern)` — glob-поиск по карте
- `toSummary()` — компактный формат для LLM (📁/📄 + exports + deps)
- `stats()` — files/directories/totalLines

**Источники:** [mem0_bridge.js](../../../source/scripts/evolution/mem0_bridge.js), [rag_retriever.js](../../../source/scripts/evolution/rag_retriever.js)

### 4. Policy Engine (`packages/policy`)

Классификация рисков + approval gates:

```
LOW  (read, search, format)     → auto-approve
MED  (create skill, sandbox ops) → rule-based + log
HIGH (deploy, secrets, system)   → human approval required
```

- **Allowlists/Denylists** — белые/чёрные списки команд
- **Risk Scoring** — оценка действия по многим факторам
- **Approval Gates** — блокировка HIGH-risk без подтверждения пользователя
- **Mode Awareness** — minimal/standard/free-time режимы

### 5. Sandbox (`packages/sandbox`)

Изоляция выполнения:

- **Docker Sandbox** — контейнер для shell/code/build
- **File Guard** — allowlist путей, deny `../../`, `.env`, `SOUL.md`
- **Exec Safe Wrapper** — обёртка для child_process с таймаутами

**Три зоны доверия (Trust Zones):**

| Зона | Компоненты | Доступ | Изоляция |
|------|-----------|--------|----------|
| **Core (immutable)** | Kernel, Policy, Audit, Config | READ config, WRITE logs only | Process boundary, Soul Guard |
| **Services** | Brain, Memory, Watchdog, Evolution | Bounded exec через Policy | API контракты |
| **External (untrusted)** | Connectors, Skills, Executors, Sandbox | Scanned + sandboxed | Docker, network isolation |

**Graceful degradation:**
- Docker недоступен → fallback: host exec + усиленная policy (дополнительные deny-patterns)
- LLM недоступен → local rule-based fallback + notify user
- Memory DB locked → in-memory cache + retry с backoff
- Connector disconnected → queue messages + auto-reconnect

**Источник:** [sandbox_guard.js](../../../source/scripts/survival/sandbox_guard.js)

### 6. Audit (`packages/audit`)

Каждое действие: **кто / когда / что / почему / результат**

- **Structured JSON logs** — машинно-читаемые
- **Redaction Layer** — маскирование секретов в логах (API keys, tokens, passwords)
- **Metrics** — CPU/RAM/IO, очередь задач, latency, ошибки, токены
- **Модуль подписи** — hash + provenance для модулей/скиллов

### 7. Watchdog (`packages/watchdog`)

Self-healing:

- **Health Checks** — периодический опрос всех подсистем
- **Auto-restart** — перезапуск упавших модулей
- **Restore Points** — snapshot конфига, памяти, состояния планировщика
- **Crash Loop Protection** — если падает N раз → откат к стабильной версии
- **Safe Mode** — отключение всего, кроме связи и жизнеобеспечения

**Источники:** [watchdog.py](../../../source/scripts/survival/watchdog.py), [heartbeat_runner.js](../../../source/scripts/survival/heartbeat_runner.js)

### 8. Connectors (`packages/connectors`)

- **Telegram** (grammY) — MVP
- **Discord** (discord.js) — v1
- **WhatsApp** (Baileys) — v1
- **Webhook** — универсальный интерфейс
- Каждый connector — отдельный package, единый интерфейс `IConnector`

### 9. Skills (`packages/skills`)

- **Loader** — загрузка SKILL.md/json/yaml
- **Validator** — проверка формата, schema, зависимостей
- **Scanner** — статический анализ на red flags (malicious patterns)
- **Version Manager** — семантические версии, совместимость

**Источник:** [skill_scanner.js](../../../source/scripts/survival/skill_scanner.js)

### 10. Evolution (`packages/evolution`)

Контролируемое самообучение:

```
GAP DETECTED → RESEARCH → PLAN → GENERATE → TEST → SANDBOX → PROPOSE → MONITOR
```

- **Self-Audit** — анализ кодовой базы, поиск проблем
- **Self-Refactor** — автоматический рефакторинг через Git (propose → test → apply)
- **Learning Pipeline** — обучение из ошибок с approval gates

**Источники:** [self_audit.js](../../../source/scripts/evolution/self_audit.js), [self_refactor.js](../../../source/scripts/evolution/self_refactor.js), [evolution_loop.js](../../../source/scripts/evolution/evolution_loop.js)

### 11. Proactivity (v1+)

- **Initiative Engine** — сканирование возможностей/рисков
- **Empathy Engine** — оценка доступности пользователя по метаданным
- **Anti-spam** — cooldowns, scoring (>7), timing checks, "не беспокоить"

**Источник:** [JARVIS_PROACTIVE_PARTNER](../../../source/research/JARVIS_PROACTIVE_PARTNER.md)

### 12. Agent Swarm Runtime (`packages/swarm`)

Нативная поддержка роя агентов — «виртуальные ядра CPU», не N независимых LLM-сессий.

**Coordinator** — главный агент: декомпозирует задачу в DAG, назначает роли, бюджет, собирает результаты.

**Task DAG** — направленный ациклический граф задач:
- Параллельное выполнение независимых узлов
- Collapse: отмена pending-потомков при изменении плана
- Max depth: 3, Max nodes: 10

**Shared Context Layer** — единый контекст (указатели, не копии):
- Один Memory retrieval на итерацию (не на каждого агента)
- Summary для агентов (200-300 токенов) вместо полного контекста
- Версионирование для stale detection
- **Wave Isolation** (`createWaveContext`) — свежий контекст для каждой волны задач, parent results сжимаются в summary
- **Context Compressor** (`compressContext`) — прогрессивное сжатие при приближении к лимиту токенов
- **TaskContext** (`createTaskContext`) — стандартизированный формат передачи данных между агентами

**Token Budget System** — общий бюджет на задачу:
- Бюджет узла ≤ 30% от оставшегося
- Tool-агенты: 0 токенов
- При исчерпании → deterministic fallback или abort

**Lazy Spawning** — агент создаётся только когда: deps ready + budget OK + CPU < 80% + no interactive.

**20 ролей:** 5 LLM (Planner, Architect, Researcher, Reviewer, Refactor Advisor), 8 гибридных (Coder, Debugger, Optimizer + **Frontend Agent, Backend Agent, Mobile Agent, QA Agent, Debug Agent**), 7 tool-only (Tester, Linter, Static Analyzer, Security Scanner, Dependency Checker, Formatter, Diff Generator).

**Auto-Fix Patterns** — 14 паттернов автоисправления (`KNOWN_FIX_PATTERNS`): `MODULE_NOT_FOUND`, `TYPE_ERROR`, `TIMEOUT`, `PERMISSION_DENIED` и др. Функция `tryAutoFix()` пытается исправить перед эскалацией.

**ContractChecker** (`contracts.ts`) — перед коммитом агент обязан проверить контракты:
- `naming-conventions` — файлы в kebab-case
- `no-env-access` — запрет `process.env.*` и `.env`
- `api-signature` — детекция breaking changes в exports

**Verifiable Artifacts** — каждый агент генерирует `VerifiableArtifact` (plan, code, test_result, screenshot, diff, report) для audit trail.

**API_SOURCES** — каталог бесплатных API для Researcher-роли (10 категорий: Development, ML, Finance, Security и др).

**Degradation:**
- CPU > 80% → только tool-агенты
- CPU > 90% → single-agent mode
- Interactive task → swarm приостановлен

**Наследование безопасности:** `child.permissions ⊆ parent.permissions` (monotonic restriction).

### Inbound (запрос пользователя)
```
User → Connector → Core(Event) → Policy(risk?) → Brain(LLM+RAG) → Sandbox(exec) → Audit(log) → Connector → User
```

### Proactive (инициатива Jarvis)
```
Watchdog/Evolution → Core(Event) → Policy(score>7?) → Brain(craft) → Empathy(timing?) → Connector → User
```

### Self-Healing
```
Watchdog(health fail) → RestorePoint(rollback) → SafeMode(minimal) → Connector(notify user)
```

## Режимы работы

| Режим | Описание | Фоновые задачи | Токены |
|-------|----------|----------------|--------|
| `minimal` | CPU>80% или safe mode | ❌ | ≤100/час |
| `standard` | Нормальная работа | ✅ (при ресурсах) | ≤1000/час |
| `free_time` | CPU<20%, тихие часы | ✅✅ | ≤5000/час |
| `auto` | Автоопределение по CPU/RAM/задачам/времени | Адаптивно | Адаптивно |
