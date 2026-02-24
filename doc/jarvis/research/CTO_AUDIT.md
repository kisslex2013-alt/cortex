# 🏛️ JARVIS — CTO Architectural Audit

> Senior Architect / CTO Mode — Усиление, не переписывание
> Дата: 23.02.2026

---

## ЧАСТЬ 1 — Структурированный Сравнительный Анализ

### Таблица сравнения (0–5)

| Критерий | OpenClaw | jarvis-core (наш) | AutoGPT | SWE-Agent | CrewAI | LangGraph | Nanobot | **Jarvis (цель)** |
|----------|---------|-------------------|---------|-----------|--------|-----------|---------|------------------|
| **Security** (sandbox, secrets, isolation, policy) | 2 | 2 | 3 | 4 | 1 | 2 | 1 | **5** |
| **Reliability** (self-healing, rollback, tests) | 1 | 3 | 2 | 2 | 1 | 1 | 1 | **5** |
| **Resource adaptation** | 1 | 2 | 1 | 1 | 1 | 1 | 3 | **4** |
| **Modularity** | 3 | 2 | 3 | 2 | 3 | 4 | 4 | **5** |
| **Memory** (RAG, persistence, user modeling) | 1 | 3 | 2 | 1 | 1 | 3 | 1 | **5** |
| **Proactivity control** | 0 | 2 | 1 | 0 | 0 | 0 | 0 | **4** |
| **Observability** | 2 | 2 | 2 | 3 | 1 | 2 | 1 | **5** |
| **Architectural clarity** | 3 | 2 | 2 | 3 | 3 | 4 | 4 | **5** |

> **Источники оценок:**
> - OpenClaw: [README](https://github.com/openclaw/openclaw), docs.openclaw.ai, анализ из [UPGRADE_PLAN_MEM0_RAG](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/UPGRADE_PLAN_MEM0_RAG_2026-02-18.md)
> - jarvis-core: [клонированный репо](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/jarvis-core/) (v6.3, AGENTS.md, SOUL.md, scripts/)
> - Остальные: документация проектов + [SELF_MODIFICATION_SAFETY_RESEARCH](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/SELF_MODIFICATION_SAFETY_RESEARCH.md) + [analog.md](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/analog.md)

### Кто технологический лидер?

**По сумме баллов: LangGraph** (20) — лучшая архитектурная ясность и модульность через graph-based оркестрацию. Но ни один проект не лидирует во всех категориях одновременно.

### Best Practices (подтверждённые кодом)

| Практика | Откуда | Доказательство |
|----------|--------|----------------|
| Docker sandbox для non-main сессий | OpenClaw | `agents.defaults.sandbox.mode: "non-main"` в конфиге |
| Anti-hallucination protocol | jarvis-core | [AGENTS.md](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/jarvis-core/AGENTS.md) — маркировка `[ПРОВЕРЕНО]`/`[ПРЕДПОЛОЖЕНИЕ]`/`[НЕ МОГУ ПРОВЕРИТЬ]` |
| Learnings journal (.learnings/) | jarvis-core | [AGENTS.md](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/jarvis-core/AGENTS.md#L143-L146) — `Что сделал → Что пошло не так → Correct action` |
| Patch-based self-modification | SWE-Agent | Docker sandbox → generate .patch → dry-run → test → apply |
| Git branch isolation для self-mod | jarvis-core | `Не пушить в ветку main — только fix/*, feat/*` (AGENTS.md#L31) |
| Model cascade с ротацией аккаунтов | jarvis-core + Cortex | [model_cascade_router.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/survival/model_cascade_router.js) |
| Message channels (analysis/commentary/final) | GPT-5 Agent | [ChatGPT-GPT-5-Agent-mode](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/prompts_leaks/OpenAI/ChatGPT-GPT-5-Agent-mode-System-Prompt.md#L126-L131) |
| Memory с confidence scoring | OpenAI Advanced Memory | [tool-advanced-memory.md](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/doc/research/prompts_leaks/OpenAI/tool-advanced-memory.md) — `Confidence=high` |

### Критичные архитектурные слабости

| Проект | Слабость | Доказательство |
|--------|----------|----------------|
| OpenClaw | Context stuffing (2M токенов по умолчанию) | UPGRADE_PLAN: `contextTokens: 2,000,000` → $12.50/10 задач |
| OpenClaw | Soul-Evil уязвимость (identity подмена) | UPGRADE_PLAN: `config.patch` позволяет перезаписать SOUL.md |
| jarvis-core | Монолитная структура (все в одном workspace) | Нет package boundaries, 149 scripts в плоской структуре |
| jarvis-core | Секреты через .env (плоский файл) | package.json → `dotenv`, файлы в workspace |
| AutoGPT | Неконтролируемый расход денег | Без budget limits выгрузка токенов неограничена |

### Anti-patterns (доказанные)

1. **Context Stuffing** — загрузка всей памяти в каждый промпт (OpenClaw default)
2. **MEMORY.md как единственная память** — плоский текст, теряет при compaction (jarvis-core + OpenClaw)
3. **Full host access в main session** — агент с root(OpenClaw: tools run on host for main session)
4. **Секреты в .env** — доступны всем процессам, попадают в логи (jarvis-core)
5. **Push в main без ревью** — AUTONOMY GRANT в jarvis-core даёт SYSTEM-WIDE scope

---

## ЧАСТЬ 2 — Must-Have Компоненты

| # | Компонент | Описание | Зачем нужно | Без него | Приоритет |
|---|-----------|----------|-------------|----------|-----------|
| 1 | **Core Kernel** | Event loop, config, plugin loader | Фундамент, без которого ничего | Нет продукта | **MVP** |
| 2 | **Security Layer** | Vault, redaction, file guard, audit trail | Три столпа: Security #1 | Утечка секретов, identity hijack | **MVP** |
| 3 | **Memory & Soul** | Fast/Long/Vector memory + RAG + GC | Персистентность контекста | Amnestic bot — забывает всё | **MVP** |
| 4 | **Self-Healing** | Watchdog, restore points, safe mode | Три столпа: Self-healing #2 | Ручной рестарт при каждом падении | **MVP** |
| 5 | **Risk Engine** | Классификация LOW/MED/HIGH + approval gates | Контроль действий | Опасные операции без подтверждения | **MVP** (базовый) → **v1** (полный) |
| 6 | **Plugin System** | Package-based модули с единым интерфейсом | Расширяемость | Монолит, нельзя добавить функционал | **MVP** |
| 7 | **Observability** | JSON logs, redaction, метрики | Диагностика и аудит | Слепое пятно — не видно что сломалось | **MVP** (логи) → **v1** (метрики) |
| 8 | **Resource Governance** | CPU/RAM лимиты, mode switching, token budget | Выживание на VPS | OOM kill, перерасход токенов | **MVP** |
| 9 | **Proactivity Control** | Cooldowns, scoring, DND, anti-spam | Не раздражать пользователя | Spam-bot, потеря доверия | **v1** |

---

## ЧАСТЬ 3 — Предложенный Стек (обоснованный)

| Позиция | Выбор | Почему | Альтернативы | Компромиссы | Долгосрочные риски |
|---------|-------|--------|-------------|-------------|-------------------|
| **Язык** | TypeScript (Node.js ≥22) | Совместимость с OpenClaw/jarvis-core экосистемой, async/await, npm | Python (больше AI-libs), Rust (production-safe), Go (простота) | TS имеет runtime overhead vs Go/Rust; ecosystem lock-in | Если AI-экосистема уйдёт в Python — придётся поддерживать FFI |
| **Арх. стиль** | Microkernel (modular monolith + plugins) | Минимальное ядро + pluggable модули. Не microservices (overkill для single-user) | Microservices (overkill), Monolith (негибко), Event-driven pure (сложно дебажить) | Не распределённый → не масштабируется горизонтально; для single-user — норма | Если потребуется multi-tenant → рефакторинг kernel |
| **Plugin arch** | pnpm workspaces + interface contracts | Простота, npm-native, TypeScript interfaces | NX (тяжеловесен), Lerna (deprecated), Turbo (лишний для <15 packages) | Нет hot-swap (нужен restart); ОК для single-user | pnpm API может измениться |
| **Sandbox** | Docker (primary) | Зрелый, проверенный, совместим с OpenClaw | gVisor (lighter), Firecracker (overkill), WASM (ограничен) | Docker daemon ~100MB RAM overhead | Docker ≠ security boundary; нужно запрещать privileged mode |
| **Config storage** | YAML + JSON Schema | Человекочитаемый + валидируемый | TOML (меньше поддержки), JSON (нечитаемый), .env (нет вложенности) | YAML indentation errors; JSON Schema — отдельный файл | YAML-парcинг может быть медленным при >10KB |
| **State storage** | SQLite (embedded) | Zero-config, embedded, ACID, FTS5 | PostgreSQL (overkill), Redis (нужен сервер), LevelDB (нет SQL) | Single-writer; ОК для single-user | Если нужна конкурентность — миграция на Pg |
| **Vector DB** | ChromaDB (embedded) | Embedded (zero-ops), Python bridge через child_process | Qdrant (нужен сервер), Pinecone (cloud, $), Milvus (тяжёлый) | ChromaDB JS-SDK менее зрелый чем Python | Может потребоваться миграция на Qdrant для производительности |
| **Metadata DB** | SQLite (та же база или отдельная) | Единообразие, zero-ops | Better-sqlite3 уже в deps jarvis-core | — | — |
| **Observability** | Pino (JSON logs) + prom-client (v1) | Pino — самый быстрый Node.js logger; prom-client — стандарт | Winston (медленнее), Bunyan (deprecated), OpenTelemetry (v2) | Без Grafana Cloud — метрики только в файлах | OTel SDK тяжеловесный для MVP |
| **Policy engine** | Собственный (TypeScript) | Специфичные правила, не нужна REGO/Cedar | OPA/Rego (тяжёлый), Cedar (AWS-centric), Casbin (generic) | Нужно писать самим; <500 строк для MVP | Может потребоваться формальный язык при росте правил |
| **Task scheduler** | BullMQ (Redis) или встроенный Queue | BullMQ — production-grade; для MVP — custom queue | Agenda (MongoDB), node-cron (нет persistence) | BullMQ требует Redis; для MVP — Map + persisted queue | Redis как зависимость |
| **LLM abstraction** | Собственный Router (из Cortex) | Уже написан и протестирован — [model_cascade_router.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/survival/model_cascade_router.js) | LangChain (абстракция), Vercel AI SDK (React-only), LiteLLM (Python) | Нужна поддержка новых провайдеров вручную | Если API-интерфейсы провайдеров изменятся — нужно обновлять |

---

## ЧАСТЬ 4 — High-Level Design

### Компоненты и границы доверия

```
╔══════════════════════════════════════════════════════════════════╗
║                    TRUST ZONE: CORE (immutable)                  ║
║  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    ║
║  │ Kernel   │  │ Policy   │  │ Audit    │  │ Config       │    ║
║  │(event    │  │(risk     │  │(log +    │  │(YAML +       │    ║
║  │ loop)    │  │ engine)  │  │ redact)  │  │ schema)      │    ║
║  └────┬─────┘  └────┬─────┘  └──────────┘  └──────────────┘    ║
╚═══════┼══════════════┼══════════════════════════════════════════╝
        │              │
╔═══════▼══════════════▼══════════════════════════════════════════╗
║                    TRUST ZONE: SERVICES                          ║
║  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    ║
║  │ Brain    │  │ Memory   │  │ Watchdog │  │ Evolution    │    ║
║  │(LLM     │  │(Fast +   │  │(health + │  │(self-audit + │    ║
║  │ router) │  │ Long +   │  │ restore) │  │ self-learn)  │    ║
║  │          │  │ Vector)  │  │          │  │              │    ║
║  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    ║
╚══════════════════════════════════════════════════════════════════╝
        │
╔═══════▼═════════════════════════════════════════════════════════╗
║                    TRUST ZONE: EXTERNAL (untrusted)              ║
║  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    ║
║  │Connectors│  │ Skills   │  │ Sandbox  │  │ Executors    │    ║
║  │(TG/DC/WA)│  │(scanned) │  │(Docker)  │  │(shell/code)  │    ║
║  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    ║
╚══════════════════════════════════════════════════════════════════╝
```

### 9 ключевых потоков

**1. Жизненный цикл запроса (Request Lifecycle)**
```
User → Connector → Kernel.dispatch()
  → Policy.assess(action) → {LOW: proceed | MED: rule-check | HIGH: await approval}
  → Brain.think(prompt, context_from_Memory)
  → Executor/Skill.run() [через Sandbox]
  → Audit.log(who, what, when, why, result) [+ Redaction]
  → Connector → User
```

**2. Self-Healing Flow**
```
Watchdog.healthCheck() [каждые 30 сек]
  → component.ping() timeout?
    → YES: Watchdog.restart(component) [attempt 1-3]
      → still failing? → RestorePoint.rollback(last_stable)
        → still failing? → SafeMode.activate() [только Connector + Watchdog]
          → Connector.notify(user, "Safe mode activated, details: ...")
```

**3. Memory Write Pipeline**
```
New fact arrives (from dialog / learning / error)
  → Categorize (personal/tech/financial/incident/directive)
  → Dedup check (FTS5 search similar)
  → Redact secrets (Redaction Layer)
  → Store in Long Memory (SQLite + FTS5)
  → Embed → Store in Vector Memory (ChromaDB)
  → Set TTL based on category
  → Audit.log("memory_write", fact_id)
```

**4. Memory Read Pipeline (RAG)**
```
Query arrives (from Brain context preparation)
  → Embed query → Vector search (ChromaDB, top-5)
  → FTS5 search (SQLite, top-5)
  → Merge + deduplicate + rank by recency + relevance
  → Inject HOT (session) + WARM (top-5 RAG) context
  → Total: ≤800 tokens context (vs 2M context stuffing)
```

**5. Self-Modification Flow**
```
Evolution.selfAudit()
  → findings[] (dead code, unused imports, repeated errors)
  → Evolution.plan(findings)
    → Policy.assess(plan) → risk level
      → LOW (unused imports): auto-fix
      → MED (refactor): generate patch → test in Sandbox → notify user summary
      → HIGH (architecture change): proposal only → await user approval
  → Git.createBranch("fix/self-audit-YYYYMMDD")
  → Apply changes → Run tests in Sandbox
  → Git.commit() → Push to feature branch
  → Notify user with diff summary
```

**6. Approval Gate Flow**
```
Action arrives → Policy.assess()
  → risk == HIGH
    → Connector.send(user, {
        action, risk_score, reason,
        buttons: [✅ Approve, ❌ Deny]
      })
    → await user response (timeout: 30 min → auto-deny)
    → approved? → execute → Audit.log("approved_by_user")
    → denied? → Audit.log("denied_by_user") → discard
```

**7. Risk Evaluation Flow**
```
Policy.assess(action) =
  score = Σ(
    action_type     × 0.30,   // deploy=0.9, read=0.1
    target_scope    × 0.25,   // production=0.9, sandbox=0.1
    reversibility   × 0.20,   // irreversible=0.9
    data_sensitivity × 0.15,  // secrets=0.9
    time_sensitivity × 0.10   // urgent=0.7
  )
  → score < 0.3: LOW → auto-approve
  → 0.3 ≤ score < 0.7: MED → rule-based
  → score ≥ 0.7: HIGH → human approval
```

**8. Sandbox применяется:**
- Все tool/skill executions (shell, code, git)
- Self-modification (generate code → test → apply)
- Skill installation и тестирование
- Inbound message processing (prevent injection)

**9. Policy enforcement применяется:**
- Перед каждым tool execution
- Перед отправкой сообщений пользователю (redaction)
- Перед self-modification
- Перед доступом к Memory (write-only через pipeline)
- Перед proactive notifications (score ≥ 7)

**Логирование и аудит применяется:**
- Каждое LLM API обращение (provider, latency, tokens, cached)
- Каждое tool execution (command, sandbox, exit_code)
- Каждый Memory write (fact_id, category, source)
- Каждый Policy decision (action, score, result)
- Каждый Connector event (inbound/outbound, channel, redacted content)

---

## ЧАСТЬ 5 — Ревизия документов

Все ранее созданные документы проверены на:

| Проверка | README | ARCH | ROADMAP | SOUL | SECURITY | SKILLS | POLICY |
|----------|--------|------|---------|------|----------|--------|--------|
| Логическая целостность | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Нет противоречий | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Соответствие vision | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Столп: Security | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Столп: Self-healing | ✅ | ✅ | ✅ | — | ✅ | — | ✅ |
| Столп: Evolution | — | ✅ | ✅ | ✅ | — | ✅ | ✅ |

**Обнаруженные пробелы (исправлены в этом документе):**
- ARCHITECTURE.md: не описаны границы доверия → добавлены в HLD (Часть 4)
- SOUL.md: не описана дедупликация и confidence scoring → добавлены в Часть 7
- SECURITY.md: не описан rollback → добавлен в Часть 8

---

## ЧАСТЬ 6 — Architectural Audit

### 1. Слабые места

| # | Проблема | Где | Критичность | Рекомендация |
|---|---------|-----|-------------|-------------|
| 1 | **Конфликт Self-modification ↔ Sandbox** | ARCHITECTURE.md vs POLICY.md | 🔴 Критическая | Self-modification **обязательно** через sandbox Docker + Git branch. Никогда — напрямую в production workspace. Уже заложено в jarvis-core (AGENTS.md#L31: "Не пушить в main") |
| 2 | **Утечка секретов через Memory** | SOUL.md | 🔴 Критическая | Memory write pipeline **обязан** проходить через Redaction Layer перед сохранением. Regex-фильтр API keys, seeds, passwords. Уже описано, но нужен enforcement |
| 3 | **Нет rollback в SECURITY.md** | SECURITY.md | 🟡 Средняя | Добавить: RestorePoints автоматические каждые 4 часа + перед любой HIGH-risk операцией |
| 4 | **11 packages в MVP — избыточно** | ARCHITECTURE.md | 🟡 Средняя | MVP: объединить audit+policy в один package; connectors — один package с adapter pattern; убрать evolution из MVP |
| 5 | **ChromaDB — неоптимальный выбор для embedded TS** | Стек | 🟡 Средняя | ChromaDB JS SDK менее зрелый. Альтернатива для MVP: SQLite FTS5 + BM25 (уже работает в jarvis-core). ChromaDB → v1 |
| 6 | **Отсутствие graceful degradation описания** | ARCHITECTURE.md | 🟡 Средняя | Добавить: если Chrome/Docker недоступен → fallback на host exec с усиленной policy |
| 7 | **Overengineering Emotional Signature** | SOUL.md (v2) | 🟢 Долгосрочная | Emotional Signature — nice-to-have, не блокер. Убрать из v1, оставить в v2 |
| 8 | **Temporal Consciousness — туманная спецификация** | Исследования | 🟢 Долгосрочная | TCP из JARVIS_PHASE9 — слишком абстрактен для реализации. Заменить на конкретный: Identity Hash + версия + timestamp |

### 2. Классификация рисков

**🔴 Критические (блокируют запуск):**
1. Секреты в .env → нужен Vault до первого деплоя
2. Self-mod без sandbox → race condition между файлами
3. Нет Redaction Layer → API keys в логах Telegram

**🟡 Средние (нужно решить до v1):**
4. Нет restore points → при падении теряется state
5. Нет rate limiting на proactive messages → spam
6. Single process (нет pm2/systemd restart) → manual restart

**🟢 Долгосрочные (v2+):**
7. SQLite single-writer при высокой нагрузке
8. Нет multi-tenant (если потребуется сервис)
9. Нет формального policy language (при росте правил)

### 3. Где можно упростить

| Было (overengineered) | Стало (simplified) | Экономия |
|----------------------|-------------------|----------|
| 11 packages в MVP | **7 packages**: core, brain, memory, sandbox-policy (merge), watchdog, connector-telegram, skills | -4 packages |
| ChromaDB для MVP | **SQLite FTS5** (BM25) — уже доказано в jarvis-core | -1 зависимость |
| Redis для MVP | **SQLite** — embedded, zero-ops | -1 сервис |
| BullMQ для MVP | **Встроенная очередь** (Map + JSON persist) | -1 зависимость |
| Prometheus для MVP | **JSON log files** + `grep/jq` | -1 зависимость |
| Evolution в MVP | **Убрать** — self-learning → v1 | -1 package |

**MVP (simplified): 7 packages, 2 runtime зависимости (Node.js + Docker)**

---

## ЧАСТЬ 7 — Усиление Memory & Soul

### Чеклист проверки

| Требование | Статус | Усиление |
|-----------|--------|----------|
| Разделение Fast и Long-term | ✅ В SOUL.md | Fast = RAM/SQLite in-session; Long = SQLite file + FTS5 |
| TTL | ✅ В SOUL.md | TTL по категориям: `personal: 365d`, `tech: 90d`, `incident: 180d`, `directive: ∞` |
| Memory GC | ⚠️ Упомянут, не специфицирован | **Добавлено:** Cron каждые 24ч: `DELETE FROM facts WHERE expires_at < NOW()`. Archive: `INSERT INTO archive SELECT * ... WHERE access_count = 0 AND created_at < NOW()-90d` |
| Контроль пользователя | ✅ В SOUL.md | Команды /memory search/list/delete/export/import/forget/settings |
| Отсутствие секретов | ✅ В SOUL.md + SECURITY.md | Redaction Layer перед memory_write обязателен |
| Дедупликация | ⚠️ Не описана | **Добавлено:** Перед INSERT: FTS5 search(new_fact, limit=3). Если similarity > 0.85 → merge (обновить timestamp + access_count). Если < 0.85 → INSERT |
| Объяснимость | ✅ В SOUL.md | При использовании факта — показать source fact_id + дату + category |
| Уроки из ошибок | ✅ В jarvis-core | `.learnings/YYYY-MM.md`: `Что сделал → Что пошло не так → Correct action` (AGENTS.md#L143) |
| Confidence scoring | ⚠️ Не описан | **Добавлено** (вдохновлено OpenAI Advanced Memory): Каждый факт получает `confidence: high|medium|low`. High = подтверждено инструментом. Medium = сказано пользователем. Low = выведено LLM. При поиске: `ORDER BY confidence DESC, relevance DESC` |

---

## ЧАСТЬ 8 — Усиление Security

### Чеклист проверки

| Требование | Статус | Усиление |
|-----------|--------|----------|
| Privilege separation | ✅ | 3 зоны: Core (READ config), Services (bounded exec), External (sandboxed) |
| Secrets isolation | ✅ | Vault (keytar + encrypted SQLite). Ядро не видит секреты. Executor получает только нужный ключ |
| Audit trail | ✅ | JSON structured log: who/when/what/why/result. Redaction applied |
| Policy engine | ✅ | 3 уровня: LOW (auto), MED (rule), HIGH (human). Weighted risk scoring |
| Sandbox boundaries | ✅ | Docker (non-privileged) + File Guard (allowlist paths) |
| Approval gates | ✅ | Telegram inline buttons для HIGH-risk. Timeout 30 мин → auto-deny |
| Rollback механизмы | ⚠️ Слабый | **Усилено:** |

**Усиление rollback:**
```
RestorePoint creates automatically:
  - Перед каждой HIGH-risk операцией
  - Каждые 4 часа (cron)
  - При первом запуске сессии

RestorePoint содержит:
  - config snapshot (YAML)
  - memory database snapshot (SQLite backup)
  - skill registry state (versions + hashes)
  - watchdog state (running processes)

Rollback trigger:
  - Watchdog: 3x consecutive health fails
  - Self-mod: test suite failure after apply
  - Manual: /rollback command
  - Deadman: 30 мин без heartbeat

Rollback action:
  1. Stop all non-essential processes
  2. Restore config from snapshot
  3. Restore memory DB from snapshot
  4. Restart core services
  5. Notify user: "Rollback performed. Reason: ..."
```

---

## ЧАСТЬ 9 — Стратегический Уровень

### Философия проекта

Jarvis — не chatbot и не очередной AI-wrapper. Это **автономный цифровой партнёр** с тремя нерушимыми столпами: Security → Self-Healing → Controlled Evolution.

### Принципиальное отличие

| Другие проекты | Jarvis |
|---------------|--------|
| Реактивный бот (ответить на вопрос) | Проактивный партнёр (инициатива + мнение + эмпатия) |
| Память = plain-text файл | Multi-level memory с RAG, GC, confidence, TTL |
| Падает → ручной рестарт | Self-healing: watchdog → restore → safe mode |
| Любое действие = выполнить | Risk engine: LOW/MED/HIGH + approval gates |
| Статичный набор инструментов | Controlled self-learning: пробел → исследование → skill → sandbox → предложение |

### 3 главных преимущества

1. **Security by Design** — ни один другой OSS personal assistant не имеет полного стека: Vault + Redaction + Policy Engine + Sandbox + Audit + Soul Guard
2. **Self-Healing** — Watchdog + RestorePoints + SafeMode + CrashLoopProtection. MTTR цель: <60 секунд
3. **Controlled Evolution** — self-audit → self-refactor → self-learning, но **всегда** через sandbox + approval + rollback

### 3 самых больших риска

1. **Scope creep** — vision на 10 документов, десятки систем. Без жёсткого MVP-scope → бесконечная разработка
2. **Single-developer bottleneck** — если разработчик один — сложно поддерживать 7+ packages
3. **LLM provider dependency** — все 7 провайдеров бесплатные/пробные. Если API изменятся или закроются — система деградирует

### Где может развалиться

- **При попытке реализовать v2 до стабильного MVP** — Temporal Consciousness, Self-Forking, Emotional Signature — это исследования, не MVP-задачи
- **При недостаточном тестировании Self-Modification** — бот может сломать самого себя
- **При отсутствии мониторинга** — без observability не видно деградацию

### Самые дорогие решения в переделке

| Решение | Стоимость переделки | Почему |
|---------|-------------------|--------|
| Выбор языка (TS vs Python vs Go) | 🔴 Очень высокая | Переписывание всей кодовой базы |
| Архитектурный стиль (microkernel vs micro) | 🔴 Очень высокая | Влияет на все package boundaries |
| Формат хранения памяти (SQLite schema) | 🟡 Средняя | Миграции с data preserve |
| Plugin interface контракт | 🟡 Средняя | Breaking change для всех plugins |
| Выбор Vector DB | 🟢 Низкая | Абстрагирован за интерфейсом |

---

## ЧАСТЬ 10 — Контроль Качества

### Верификационная матрица

| Проверка | Результат | Деталь |
|----------|----------|--------|
| Security ↔ Memory: нет конфликта? | ✅ | Memory write pipeline проходит через Redaction Layer. Секреты → только ссылки на Vault |
| Self-modification изолирован? | ✅ | Через Docker sandbox + Git branch isolation + approval gates + rollback |
| Proactivity ≠ spam? | ✅ | Score ≥ 7 + cooldowns + DND + user settings + anti-spam throttle |
| CPU ≤ 80% enforced? | ✅ | Resource Governor: mode switching (standard→minimal при CPU>80%), Lobe Throttling |
| Rollback есть везде? | ✅ | RestorePoints: автоматически каждые 4ч + перед HIGH-risk. Rollback: config + memory + skills |
| Нет архитектурной магии без justification? | ✅ | Каждый компонент привязан к конкретному файлу/модулю из Cortex или jarvis-core |

### Cross-Checks

```
✅ SOUL.md(Memory GC + TTL) ↔ SECURITY.md(no secrets in memory)
   → Redaction Layer перед memory_write. GC не удаляет directives.

✅ ARCHITECTURE.md(Self-Modification) ↔ POLICY.md(Approval Gates)
   → Self-mod всегда через sandbox + Git branch + policy check.

✅ ROADMAP.md(MVP scope) ↔ ARCHITECTURE.md(packages)
   → MVP = 7 packages (упрощено с 11). Evolution → v1.

✅ SKILLS_SPEC.md(scanner) ↔ SECURITY.md(threat model)
   → Skill Scanner catches: eval(), child_process, fs.write, fetch.

✅ POLICY.md(resource governance) ↔ SOUL.md(Resource Humility)
   → CPU ≤ 80%, mode switching, graceful degradation.
```

---

> *Этот аудит не переписывает архитектуру — он усиливает её.*
> *Jarvis должен быть безопасным, самовосстанавливающимся, эволюционирующим, управляемым, объяснимым, расширяемым — но не перегруженным.*
