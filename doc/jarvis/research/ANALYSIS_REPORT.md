# 🧬 Проект JARVIS — Исследовательский Отчёт

> Анализ OpenClaw, аналогов, внутренних наработок и архитектурное предложение
> Дата: 23.02.2026

---

## 1. Анализ OpenClaw

**Источник:** [GitHub: openclaw/openclaw](https://github.com/openclaw/openclaw), [DeepWiki](https://deepwiki.com/openclaw/openclaw), [docs.openclaw.ai](https://docs.openclaw.ai)

### 1.1 Архитектура OpenClaw

| Компонент | Описание |
|-----------|----------|
| **Gateway** | WebSocket control plane (`ws://127.0.0.1:18789`). Все каналы → Gateway → Pi Agent |
| **Pi Agent** | RPC-runtime для LLM + tool streaming с блок-стримингом |
| **Sessions** | Модель сессий: `main` (ваши DM), group isolation, activation modes, queue modes |
| **Channels** | WhatsApp (Baileys), Telegram (grammY), Slack (Bolt), Discord (discord.js), Signal, Teams, iMessage, Matrix, 13+ каналов |
| **Skills** | `~/.openclaw/workspace/skills/<skill>/SKILL.md` — декларативные навыки |
| **Workspace** | `AGENTS.md`, `SOUL.md`, `TOOLS.md` — инъектируются в промпт агента |
| **Security** | DM Pairing по умолчанию, Docker Sandbox для non-main сессий |
| **Config** | `openclaw.json` — единый JSON-конфиг |

### 1.2 Основной флоу

```
Пользователь (WhatsApp/Telegram/...) 
  → Channel Driver (Baileys/grammY/...)
    → Gateway WS
      → Session Manager (main/group/route)
        → Pi Agent (LLM RPC + tool calls)
          → Tool Execution (bash/browser/canvas/cron/skills)
            → Response → Channel → Пользователь
```

### 1.3 Плюсы OpenClaw

- **🟢 13+ каналов** — уникальная мультиканальность (WhatsApp, Telegram, Signal, Teams и т.д.)
- **🟢 Local-first** — Gateway на localhost, данные не утекают в облако
- **🟢 Skills ecosystem** — ClawHub, managed/bundled/workspace skills, SKILL.md формат
- **🟢 Docker sandbox** — изоляция non-main сессий в Docker
- **🟢 Model failover** — каскад LLM-моделей с OAuth + API key ротацией
- **🟢 Companion apps** — macOS/iOS/Android приложения, Voice Wake, Talk Mode, Canvas
- **🟢 Зрелый проект** — 783 контрибьютора, 50+ релизов, документация

### 1.4 Минусы / Риски OpenClaw

- **🔴 Context Stuffing** — `contextTokens: 2M` по умолчанию → огромный расход токенов ($12.50/10 задач — доказано в [UPGRADE_PLAN_MEM0_RAG](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/UPGRADE_PLAN_MEM0_RAG_2026-02-18.md))
- **🔴 Soul-Evil уязвимость** — бот может подменить identity через `config.patch` (описано в [UPGRADE_PLAN_MEM0_RAG](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/UPGRADE_PLAN_MEM0_RAG_2026-02-18.md))
- **🔴 Плоская память** — `MEMORY.md` как текстовый файл, теряет детали при compaction
- **🔴 Нет self-healing** — при падении Gateway нужен ручной рестарт (см. [INCIDENT_GATEWAY_CRASHES](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/INCIDENT_GATEWAY_CRASHES_2026-02-17_2.md))
- **🔴 Нет risk engine** — любое действие выполняется без оценки риска
- **🔴 Нет проактивности** — только реактивный режим (ответ на команду)
- **🟡 Main session = full host access** — в основной сессии агент имеет полный rw-доступ к хосту
- **🟡 Нет аудит-лога** — нет структурированного "кто/когда/что/почему"
- **🟡 Секреты в .env** — API-ключи в плоском `.env` файле

---

## 2. Анализ Аналогов

**Источники:** [analog.md](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/analog.md), [SELF_MODIFICATION_SAFETY_RESEARCH](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/SELF_MODIFICATION_SAFETY_RESEARCH.md), веб-исследование

### 2.1 Прямые аналоги / форки OpenClaw

| Проект | Стек | Ключевое отличие | Статус |
|--------|------|-----------------|--------|
| **openclaw-nanobot** | Python, ~4K строк | Минимализм + модифицируемость | Активный |
| **NanoClaw** | Node.js | Контейнерная изоляция, мало кода | Активный |
| **nanobot-2** | — | Форк/вариация nanobot | Ранний |
| **PicoClaw** | Go | Ресурс-ограниченные среды | Упоминается |
| **ZeroClaw** | Rust | Безопасность + производительность | Упоминается |
| **IronClaw** | Rust | WASM-песочницы, изоляция инструментов | Упоминается |

### 2.2 Проекты решающие похожие задачи

| Проект | Стек | Фокус | Что можно перенять |
|--------|------|-------|--------------------|
| **AutoGPT** | Python | Agent orchestration | Workspace sandbox, tool allowlists, budget limits, human approval gates |
| **CrewAI** | Python | Multi-agent | Role-based agents, task decomposition |
| **SWE-Agent** | Python | Code agent | Two-stage: Architect → Developer, Docker sandbox, command validation |
| **Devin** | — | AI developer | Planning Checkpoint → PR Checkpoint, HITL |
| **Darwin Gödel Machine** | Python | Self-modification | Iterative: propose → test → apply |
| **LangChain/LangGraph** | Python/TS | Agent framework | RAG pipeline, tool abstraction, graph-based orchestration |
| **Mem0** | Python | Memory layer | Structured memory, categories, TTL |

### 2.3 Сравнительная таблица (0–5)

| Критерий | OpenClaw | Nanobot | AutoGPT | SWE-Agent | **Jarvis (цель)** |
|----------|---------|---------|---------|-----------|------------------|
| Безопасность | 2 | 1 | 3 | 4 | **5** |
| Надёжность (self-healing) | 1 | 1 | 2 | 2 | **5** |
| Производительность | 2 | 4 | 2 | 3 | **4** |
| Модульность | 3 | 4 | 3 | 2 | **5** |
| Проактивность | 0 | 0 | 1 | 0 | **4** |
| Эволюция/обучение | 0 | 0 | 1 | 1 | **5** |
| Наблюдаемость | 2 | 1 | 2 | 3 | **5** |

### 2.4 Выводы: Best Practices vs Анти-паттерны

**Best Practices (берём):**
- **Docker sandbox** (OpenClaw, SWE-Agent) — изоляция выполнения обязательна
- **Patch-based changes** (Darwin Gödel, SWE-Agent) — propose → test → apply
- **Approval gates / HITL** (Devin, AutoGPT) — human-in-the-loop для рискованных операций
- **Multi-model failover** (OpenClaw) — каскад LLM-провайдеров с ротацией
- **Declarative skills** (OpenClaw SKILL.md) — простой формат навыков
- **Quarantine before delete** (Self-Modification Safety Research) — `legacy/` перед удалением

**Анти-паттерны (избегать):**
- ❌ **Context Stuffing** — закидывать всю память в каждый промпт (OpenClaw default)
- ❌ **Плоский MEMORY.md** — текстовые файлы как долговременная память
- ❌ **Full host access** — агент с root-правами на хосте в main-сессии
- ❌ **Секреты в .env** — плоский файл с API-ключами
- ❌ **Отсутствие аудита** — нет лога "кто/что/когда/зачем"
- ❌ **Отсутствие watchdog** — падение = ручной рестарт

---

## 3. Внутренние наработки (Cortex)

### 3.1 Матрица переиспользования

| Модуль | Файл/Папка | Ценность | Риски | Доработки | Статус |
|--------|-----------|----------|-------|-----------|--------|
| **ModelCascadeRouter** | [model_cascade_router.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/survival/model_cascade_router.js) | 🟢 Высокая. 7 LLM-провайдеров, ротация аккаунтов, кеш, auto-complexity | Привязка к конкретным API-ключам | Абстрагировать в plugin-систему | **reuse** |
| **SandboxGuard** | [sandbox_guard.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/survival/sandbox_guard.js) | 🟢 Высокая. Файловая песочница, path validation, deny-list | Привязка к OpenClaw workspace | Обобщить для Jarvis core | **modify** |
| **SoulGuard** | [soul_guard.sh](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/survival/soul_guard.sh) | 🟢 Высокая. chattr +i + SHA256 для identity файлов | Linux-only (chattr) | Добавить кросс-платформенность | **modify** |
| **Mem0 Bridge** | [mem0_bridge.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/evolution/mem0_bridge.js) | 🟢 Высокая. SQLite + FTS5, категоризация фактов | Табличная структура простоватая | Расширить до полного граф-хранилища | **modify** |
| **RAG Retriever** | [rag_retriever.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/evolution/rag_retriever.js) | 🟢 Высокая. Индексация .md, top-N чанки | Нет vector DB (BMxx scoring) | Добавить embeddings + vector DB | **modify** |
| **Watchdog** | [watchdog.py](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/survival/watchdog.py) | 🟢 Высокая. Health monitoring процессов | Python-only, завязан на OpenClaw | Переписать на Node.js + систематизировать | **rewrite** |
| **CircuitBreaker** | [circuit_breaker.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/survival/circuit_breaker.js) | 🟢 Высокая. Предотвращение каскадных сбоев | Заточен под арбитраж | Обобщить для всех подсистем | **modify** |
| **SecurityCouncil** | [security_council.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/survival/security_council.js) | 🟢 Высокая. Централизованная проверка безопасности | — | Расширить как Policy Engine | **modify** |
| **SkillScanner** | [skill_scanner.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/survival/skill_scanner.js) | 🟡 Средняя. Статический анализ skills на red flags | 30KB — монолитный | Разбить на модули | **modify** |
| **SelfAudit** | [self_audit.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/evolution/self_audit.js) | 🟡 Средняя. Автоанализ кодовой базы | Заточен под текущий проект | Обобщить | **modify** |
| **SelfRefactor** | [self_refactor.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/evolution/self_refactor.js) | 🟢 Высокая. Автоматический рефакторинг через Git | Риск неконтролируемых изменений | Добавить approval gates | **modify** |
| **EvolutionLoop** | [evolution_loop.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/evolution/evolution_loop.js) | 🟢 Высокая. Цикл self-improvement (audit→refactor→test) | Масштабный, нужна переработка lifecycle | Интегрировать с policy engine | **modify** |
| **SelfLearning** | [self_learning.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/evolution/self_learning.js) | 🟢 Высокая. Pipeline обучения из ошибок | — | Ядро Jarvis evolution | **reuse** |
| **SemanticSearch** | [semantic_search.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/evolution/semantic_search.js) | 🟡 Средняя. Семантический поиск по knowledge base | Нет настоящих embeddings | Заменить на vector DB | **rewrite** |
| **SkillbookEngine** | [skillbook_engine.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/evolution/skillbook_engine.js) | 🟢 Высокая. Управление навыками | — | Расширить формат | **modify** |
| **Reflexes** | [reflexes/](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/reflexes/) | 🟡 Средняя. 13 "рефлекс"-скриптов (audit, git, market) | Специфичны для текущего проекта | Обобщить как event handlers | **modify** |
| **Финансовые скрипты** | TON-специфичные в `source/scripts/` | 🔴 Низкая для ядра. Специфичные для TON-арбитража | — | Вынести как отдельный skill/плагин | **drop из ядра** |

### 3.2 Ценные архитектурные идеи из исследовательских документов

| Документ | Ключевые идеи | Статус для Jarvis |
|----------|--------------|-------------------|
| [JARVIS_PHASE9_ARCHITECTURE](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/JARVIS_PHASE9_ARCHITECTURE.md) | Self-Forking (ForkManager), AI-Notary (CrossLobeVerifier), Adaptive Soul (EWS), TCP (криптографическая непрерывность) | v2+ (продвинутая) |
| [JARVIS_LEAN_AGI](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/JARVIS_LEAN_AGI.md) | Dynamic Context Pruning (HOT→WARM→COLD→ARCHIVE), Lobe Throttling, Knowledge Distillation, Emergency Shedder | v1 (обязательно) |
| [JARVIS_CATASTROPHE_PROTOCOLS](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/JARVIS_CATASTROPHE_PROTOCOLS.md) | Anchor Recovery (blockchain challenge), Graduated Deadman Switch, Fail-Safe Controller, DNA Buffer | v1 (критично) |
| [JARVIS_TRUE_AUTONOMY](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/JARVIS_TRUE_AUTONOMY.md) | Metacognitive Observer, Goal Hierarchy (SOUL→Directive→Mission→Task), Temporal Continuity Engine, Semantic Field | v1-v2 |
| [JARVIS_PROACTIVE_PARTNER](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/JARVIS_PROACTIVE_PARTNER.md) | Initiative Engine, Empathy Engine, Third Opinion Protocol, Ideation Sandbox, Emotional Signature | v1 (ключевое) |
| [JARVIS_MODEL_CASCADE_ROUTER](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/JARVIS_MODEL_CASCADE_ROUTER_2.md) | 7 LLM-провайдеров, account rotation, auto-complexity, response cache, daily budget | MVP (обязательно) |
| [UPGRADE_PLAN_MEM0_RAG](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/UPGRADE_PLAN_MEM0_RAG_2026-02-18.md) | Mem0 Bridge, RAG Retriever, Soul Guard, Sandbox Guard, Knowledge Graph | MVP (обязательно) |

---

## 4. Стек и Архитектура Jarvis

### 4.1 Рекомендуемый стек

| Слой | Технология | Почему |
|------|-----------|--------|
| **Язык** | TypeScript (Node.js ≥22) | Совместимость с OpenClaw-экосистемой, async/await, npm-пакеты |
| **Конфигурация** | YAML + JSON Schema | Человекочитаемый, валидируемый, версионируемый |
| **State store** | SQLite (low-resource) / Redis (high-resource) | SQLite для minimal-mode, Redis для standard/free-time |
| **Vector DB** | ChromaDB (embedded) или Qdrant | RAG без внешних зависимостей, ChromaDB — встраиваемый |
| **Secrets vault** | OS Keychain + encrypted SQLite | `keytar` для macOS/Linux/Windows, fallback — AES-256-GCM SQLite |
| **Sandbox** | Docker (primary) / gVisor (optional) | Изоляция выполнения, совместимо с OpenClaw |
| **Policy engine** | Собственный (TypeScript) | Правила риска, approval gates, allowlists |
| **Observability** | Structured JSON logs + Prometheus metrics + OpenTelemetry | Стандартные протоколы, Grafana Cloud (free tier) |
| **Каналы** | Telegram (grammy) → Discord (discord.js) → WhatsApp (baileys) | Telegram — MVP, остальные — v1 |
| **Тестирование** | Vitest + Docker + smoke tests | Быстрый, TypeScript-native |
| **Monorepo** | pnpm workspaces | Модульность без боли |

### 4.2 Структура репозитория

```
jarvis/
├── packages/
│   ├── core/                    # Ядро: event loop, plugin loader, lifecycle
│   │   ├── src/
│   │   │   ├── kernel.ts        # Главный цикл
│   │   │   ├── plugin-loader.ts
│   │   │   ├── config.ts
│   │   │   └── types.ts
│   │   └── package.json
│   ├── policy/                  # Risk Engine + Approval Gates
│   │   ├── src/
│   │   │   ├── risk-engine.ts
│   │   │   ├── approval-gate.ts
│   │   │   └── rules/
│   │   └── package.json
│   ├── memory/                  # Fast + Long-term Memory + RAG
│   │   ├── src/
│   │   │   ├── fast-memory.ts   # Working memory (RAM/SQLite)
│   │   │   ├── long-memory.ts   # Vector DB + metadata store
│   │   │   ├── rag-pipeline.ts  # Write/Read pipelines
│   │   │   └── garbage-collector.ts
│   │   └── package.json
│   ├── brain/                   # LLM Router + Model Cascade
│   │   ├── src/
│   │   │   ├── router.ts
│   │   │   ├── providers/       # Gemini, Groq, DeepSeek, Mistral...
│   │   │   └── cache.ts
│   │   └── package.json
│   ├── sandbox/                 # Execution Isolation
│   │   ├── src/
│   │   │   ├── docker-sandbox.ts
│   │   │   ├── file-sandbox.ts
│   │   │   └── exec-safe.ts
│   │   └── package.json
│   ├── audit/                   # Structured Logging + Audit Trail
│   │   ├── src/
│   │   │   ├── audit-log.ts
│   │   │   ├── redaction.ts     # Маскирование секретов
│   │   │   └── metrics.ts
│   │   └── package.json
│   ├── watchdog/                # Self-Healing + Health Checks
│   │   ├── src/
│   │   │   ├── watchdog.ts
│   │   │   ├── restore-point.ts
│   │   │   └── safe-mode.ts
│   │   └── package.json
│   ├── connectors/              # Каналы связи
│   │   ├── telegram/
│   │   ├── discord/
│   │   └── webhook/
│   ├── skills/                  # Skill loader + format
│   │   ├── src/
│   │   │   ├── loader.ts
│   │   │   ├── validator.ts
│   │   │   └── scanner.ts       # Security scan
│   │   └── package.json
│   └── evolution/               # Self-learning + Self-audit
│       ├── src/
│       │   ├── learning-pipeline.ts
│       │   ├── self-audit.ts
│       │   └── self-refactor.ts
│       └── package.json
├── config/
│   ├── default.yaml             # Defaults
│   └── schema.json              # JSON Schema для валидации
├── skills/                      # Workspace skills (user-facing)
│   └── example/
│       └── SKILL.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── SOUL.md
│   ├── ROADMAP.md
│   ├── SKILLS_SPEC.md
│   ├── POLICY.md
│   └── CONTRIBUTING.md
├── README.md
├── pnpm-workspace.yaml
├── tsconfig.json
└── vitest.config.ts
```

### 4.3 Целевая архитектура (компоненты)

```
┌─────────────────────────────────────────────────────────────────┐
│                        CONNECTORS                                │
│  Telegram │ Discord │ WhatsApp │ Webhook │ CLI │ WebChat         │
└─────┬─────┴────┬────┴────┬─────┴────┬────┴──┬──┴──────┬─────────┘
      │          │         │          │       │         │
      ▼          ▼         ▼          ▼       ▼         ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CORE KERNEL                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Event    │  │ Plugin   │  │ Task     │  │ Config       │    │
│  │ Loop     │  │ Loader   │  │ Scheduler│  │ Manager      │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────┘    │
└───────┼──────────────┼─────────────┼────────────────────────────┘
        │              │             │
   ┌────▼────┐    ┌────▼────┐   ┌───▼────┐
   │ POLICY  │    │ BRAIN   │   │ MEMORY │
   │ ENGINE  │    │ (LLM    │   │ Fast + │
   │ Risk +  │    │ Router) │   │ Long + │
   │ Approval│    │         │   │ RAG    │
   └────┬────┘    └────┬────┘   └───┬────┘
        │              │            │
   ┌────▼────┐    ┌────▼────┐  ┌───▼────────┐
   │ SANDBOX │    │ AUDIT   │  │ WATCHDOG   │
   │ Docker  │    │ Logs +  │  │ Health +   │
   │ + File  │    │ Metrics │  │ Restore +  │
   │ Guard   │    │ + Redact│  │ Safe Mode  │
   └─────────┘    └─────────┘  └────────────┘
        │
   ┌────▼────┐    ┌──────────┐
   │ SKILLS  │    │EVOLUTION │
   │ Loader+ │    │ Learn +  │
   │ Scanner │    │ Audit +  │
   │ + Exec  │    │ Refactor │
   └─────────┘    └──────────┘
```

### 4.4 Потоки данных

1. **Inbound**: Connector → Event → Policy (risk check) → Brain (LLM) → Memory (context) → Tool/Skill → Sandbox → Result
2. **Outbound**: Result → Audit (log+redact) → Connector → User
3. **Proactive**: Watchdog/Evolution → Event → Policy → Brain → Connector
4. **Self-healing**: Watchdog (health check fail) → Restore Point → Safe Mode → Notify User

### 4.5 MVP-архитектура (минимум для запуска)

```
MVP = Core + Brain + 1 Connector + Sandbox + Policy (basic) + Memory (SQLite) + Watchdog (basic)
```

| Компонент MVP | Что включено | Что НЕ включено |
|--------------|-------------|-----------------|
| Core | Event loop, config loader, plugin loader | Multi-fork, advanced scheduling |
| Brain | ModelCascadeRouter (Gemini + Groq + fallback) | Self-learning cascade |
| Connector | Telegram (grammY) | Discord, WhatsApp, Matrix |
| Sandbox | Docker sandbox + file guard | gVisor, WASM |
| Policy | allowlist/denylist + basic risk levels (LOW/MED/HIGH) | Full risk engine, ML-based |
| Memory | SQLite (fast) + FTS5 (search) | Vector DB, full RAG |
| Watchdog | Process health + auto-restart + restore points | Graduated Deadman, Safe Mode |
| Audit | JSON structured logs | Prometheus, OpenTelemetry |
| Skills | SKILL.md loader + basic scanner | ClawHub, marketplace |

### 4.6 Путь MVP → v1 → v2

```
MVP (2-3 месяца)         v1 (6 месяцев)            v2 (12 месяцев)
─────────────────        ──────────────             ─────────────────
✓ 1 connector (TG)       + Discord, WhatsApp        + Matrix, Signal, Teams
✓ 1 LLM cascade          + Full RAG pipeline         + Self-learning cascade
✓ Docker sandbox          + Full risk engine          + WASM sandbox
✓ SQLite memory           + Vector DB (Chroma)        + Knowledge Graph
✓ Basic watchdog          + Deadman Switch            + Self-forking
✓ Basic policy            + Approval Gates            + ML-based risk scoring
✓ JSON logs               + Prometheus + Grafana      + OpenTelemetry + tracing
✓ SKILL.md loader         + Skill marketplace         + Auto skill generation
                          + Self-audit + refactor     + Full evolution pipeline
                          + Proactive (alerts)        + Initiative Engine + Empathy
                          + Session/Long memory       + Temporal Consciousness
```

---

## 5. Замечания

### 5.1 jarvis-core
Репозиторий `https://github.com/kisslex2013-alt/jarvis-core` вернул **404**. Вероятные причины: приватный, переименован, или удалён. Рекомендуется уточнить текущий URL.

### 5.2 Что ещё не проанализировано
- **Содержимое PDF**: [OpenClaw_RU.pdf](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/OpenClaw_RU.pdf) (~5.9 MB) — не прочитан программно, может содержать ценную информацию
- **Prompts leaks**: [prompts_leaks/](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/prompts_leaks/) (104 файла) — системные промпты различных ботов, полезно для design reference
- **Web intel**: [web_intel/](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/web_intel/) — 1 файл

> Если нужно глубже — скажи, какие именно файлы/папки открыть и проанализировать.
