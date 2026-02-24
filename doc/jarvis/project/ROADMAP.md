# 🗺️ ROADMAP.md — Jarvis Roadmap

## MVP (2–3 месяца)

**Цель:** Минимальный рабочий ассистент с одним каналом, безопасным исполнением и базовым self-healing.

### Чеклист MVP

- [ ] **Core Kernel** — Event loop, plugin loader, YAML config + JSON Schema
- [ ] **Brain** — ModelCascadeRouter (Gemini + Groq + Mistral + local fallback)
- [ ] **Telegram Connector** — grammY, DM pairing, basic commands
- [ ] **Sandbox** — Docker sandbox + file guard (allowlist/denylist)
- [x] **Policy (basic)** — 3 уровня риска + Approval Table (18 ops) + shouldAskUser()
- [ ] **Memory (SQLite)** — Fast memory (session) + Long memory (FTS5)
- [ ] **Watchdog (basic)** — Health check + auto-restart + 1 restore point
- [ ] **Audit** — Structured JSON logs + redaction layer
- [x] **Skills** — SKILL.md loader + SkillLifecycle (DO Framework) + StructuredTask
- [ ] **Config** — YAML с hot-reload, `default.yaml` + `local.yaml`
- [x] **Tests** — 113 unit tests, 8 packages, 0 lint errors
- [ ] **CI** — GitHub Actions: lint + test + build

### Критерии готовности MVP

| Метрика | Порог |
|---------|-------|
| Telegram: отвечает на сообщения | ✅ |
| LLM cascade: 3+ провайдера | ✅ |
| Sandbox: команды в Docker | ✅ |
| Policy: блокировка HIGH без approve | ✅ |
| Watchdog: auto-restart при crash | ✅ |
| Audit: каждое действие логируется | ✅ |
| Uptime ≥95% за 7 дней | ✅ |
| Test coverage ≥50% | ✅ |

---

## v1 (6 месяцев после MVP)

**Цель:** Полноценный ассистент с RAG, risk engine, self-learning и мультиканальностью.

### Новое в v1

- [ ] **Discord + WhatsApp** connectors
- [ ] **Full RAG Pipeline** — ChromaDB (embeddings) + semantic search
- [ ] **Risk Engine** — ML-free scoring по факторам, configurable rules
- [ ] **Approval Gates** — Telegram inline buttons для одобрения HIGH-risk
- [ ] **Self-Audit** — автоанализ кодовой базы, отчёты
- [ ] **Self-Refactor** — propose → test → sandbox → apply (через Git)
- [ ] **Self-Learning** — pipeline: gap → research → generate → test → propose
- [ ] **Proactivity (basic)** — системные алерты, дедлайны, health warnings
- [ ] **Deadman Switch** — graduated escalation при потере связи
- [ ] **Restore Points** — автоматические snapshot (конфиг, память, состояние)
- [ ] **Skill Scanner** — статический анализ skills на вредоносные паттерны
- [ ] **Prometheus Metrics** — внешняя интеграция: CPU/RAM/tokens/latency/errors
- [x] **Agent Swarm Runtime** — Coordinator, Task DAG, Shared Context, Token Budget, 20 ролей, ContractChecker, WaveContext, Compressor, Artifacts
- [x] **Swarm Degradation** — CPU > 90% → single-agent, interactive priority
- [x] **Swarm Security** — monotonic permission inheritance, context isolation

### Критерии готовности v1

| Метрика | Порог |
|---------|-------|
| 3+ каналов одновременно | ✅ |
| RAG: precision@5 ≥ 0.7 | ✅ |
| 0 ложных approve для HIGH | ✅ |
| MTTR ≤ 60 секунд | ✅ |
| ≥1 auto-generated skill | ✅ |
| Proactivity: ≤2 false-positive/день | ✅ |
| Test coverage ≥70% | ✅ |
| Uptime ≥99% за 30 дней | ✅ |

---

## v1.4 — Core Hardening & Integration

**Цель:** Устранить архитектурные долги, связать компоненты, подготовить стабильный core API для CLI и Dashboard.

**Принцип:** Не добавлять фич — укреплять фундамент. Маленькие итеративные шаги.

### Phase A: Core Stabilization

Порядок выполнения: сверху вниз.

- [x] **A1. shared-types** — `packages/shared-types/src/index.ts`. Переместить `CodebaseMapEntry` из swarm и memory → единый источник. Re-export из обоих пакетов.
- [x] **A2. Risk scope** — JSDoc `@scope runtime` для `assess()`, `@scope pre-commit` для `checkAll()`. Не менять API — только документация + комментарии.
- [x] **A3. Token unification** — `SwarmBudget` принимает `BrainRouter` в конструктор. `getRemainingTokens()` = dailyBudget − brain.getTokensUsedToday(). Удалить дублирующий счётчик.
- [x] **A4. HealthDashboard** — класс в `@jarvis/watchdog`, делегирует в `SelfCheck` + `ContextHealthMonitor`. Единый метод `getFullReport()`.

**Definition of Done (Phase A):**
- 0 дублирующих типов между пакетами
- Token source of truth = brain (один счётчик)
- `getFullReport()` возвращает объединённый health отчёт
- Все 113+ тестов зелёные, 0 lint ошибок

### Phase B: Integration (5 связок)

Порядок: по зависимостям.

- [x] **B1. memory → shared context** — `Coordinator.createContext()` инжектит `mapper.toSummary()` в SharedContext
- [x] **B2. policy → swarm** — `Coordinator.run()` вызывает `assess()` перед каждым `spawn()`
- [x] **B3. contracts → skills** — `SkillLifecycle.completeOutput()` проверяет `checkAll()`
- [x] **B4. watchdog → compressor** — `Scheduler`: если `ContextHealthMonitor.assess() = critical` → авто-`compressContext()`
- [x] **B5. skills → DAG** — функция `structuredTaskToNode()`: StructuredTask → TaskNode

**Definition of Done (Phase B):**
- Каждая связка — unit test + integration test
- Coordinator: нельзя spawn без policy assess
- SkillLifecycle: нельзя output без contract check
- Scheduler: auto-compress при critical context health

### Phase C: Metric Bus + Unified Pipeline

- [x] **C1. Metric Bus** — `packages/metrics/src/index.ts`. EventEmitter + in-memory ring buffer (1000 событий). `emit(name, value, tags)`, `on(pattern, handler)`, `snapshot()`. НЕ заменяет Prometheus — это **внутренняя** шина.
- [x] **C2. Brain Collector** — hook в `BrainRouter.think()` → emit `brain.tokens_used`, `brain.latency`, `brain.cache_hit`
- [x] **C3. Swarm Collector** — hook в `Scheduler.spawn()` → emit `swarm.agent_spawned`, `swarm.budget_remaining`
- [x] **C4. Unified Pipeline** — `packages/pipeline/src/index.ts`. Класс `UnifiedPipeline`: `parseStructuredTask → taskToDAG → Coordinator.run → ContractChecker.checkAll → result`. Единый entry point для задач.

**Definition of Done (Phase C):**
- `metrics.snapshot()` возвращает данные brain + swarm
- `UnifiedPipeline.execute(text)` проходит весь путь от текста до результата
- Pipeline блокируется, если contracts не прошли
- Все тесты зелёные

### Критерии готовности v1.4

| Метрика | Порог |
|---------|-------|
| 0 дублирующих типов | ✅ |
| 5/5 связок закрыты | ✅ |
| Metric Bus: snapshot API работает | ✅ |
| Unified Pipeline: end-to-end тест | ✅ |
| Token unification: 1 source of truth | ✅ |
| Тесты ≥ 130 (113 + новые) | ✅ |
| 0 lint ошибок | ✅ |

---

## v1.5 — CLI / Dashboard / Branding

### v1.5 — CLI / Dashboard / Branding (🟢 Complete)

**CLI: Тонкий wrapper над core API**
- [x] Phase 1: `jarvis start/stop/status/doctor` (MVP)
- [x] Phase 2: `jarvis swarm/memory` (Интроспекция)
- [x] Phase 3: `jarvis mode/approve/contracts/logs/config` (Управление)

**Dashboard: Веб-интерфейс для мониторинга**
- [x] React SPA (Vite) + Tailwind/CSS
- [x] API Gateway (Express/Fastify) как прослойка к Core API
- [x] Спринт 1: Status (mode, uptime, tokens)
- [x] Спринт 2: Swarm DAG (D3.js), Memory explorer
- [x] Спринт 3: Health (Doctor API), Policy (approve/reject), Live Logs
- [x] Спринт 4: Auth (ключи, роли), dark theme

**Branding: Визуальная идентичность**
- [x] Документ `BRANDING.md` с описанием 3х концепций (Neural Core, Iron Butler, Cortex Flow)
- [x] Цветовая палитра: dark mode + cyan/green акценты
- [x] Стилизованный ASCII-баннер для CLI

---

### Критерии готовности v1.5

| Метрика | Порог |
|---------|-------|
| CLI: 15 команд работают | ✅ |
| Dashboard: 5 страниц, все API подключены | ✅ |
| Dashboard API: авторизация | ✅ |
| 0 бизнес-логики в CLI/Dashboard | ✅ |

---

## v2 (12 месяцев после MVP)

**Цель:** Продвинутый автономный ассистент с полной цифровой личностью.

### Новое в v2

- [ ] **Smart Coding MCP & Agentic Workflows** — Подключение по Model Context Protocol. Семантический поиск по кодовой базе, валидация версий пакетов в реальном времени. Полная интеграция с локальной IDE (через новый пакет, например, `packages/mcp-server`).
- [ ] **Swarm Scaling** — разделение SharedContext на TaskContext + MemoryContext + ArtifactStore (3 этапа: interfaces → агенты принимают интерфейсы → разделение реализаций)
- [ ] **Matrix + Signal + Teams** connectors
- [ ] **Knowledge Graph** — граф знаний вместо плоского хранилища
- [ ] **Initiative Engine** — сканирование возможностей (рынок, код, проекты)
- [ ] **Empathy Engine** — оценка настроения/доступности по метаданным
- [ ] **Third Opinion Protocol** — SUGGESTION → ADVISORY → OBJECTION → VETO
- [ ] **Ideation Sandbox** — "мечтает" в тихие часы (CPU <20%)
- [ ] **Emotional Signature** — цифровая личность на основе метрик
- [ ] **WASM Sandbox** — лёгкая альтернатива Docker
- [ ] **Temporal Consciousness** — криптографическая непрерывность идентичности
- [ ] **Skill Marketplace** — каталог/установка skills
- [ ] **Auto Skill Generation** — полный pipeline генерации навыков
- [ ] **OpenTelemetry + Tracing** — полная наблюдаемость

### Критерии готовности v2

| Метрика | Порог |
|---------|-------|
| 6+ каналов | ✅ |
| Proactive satisfaction ≥80% | ✅ |
| Knowledge graph: accuracy ≥0.8 | ✅ |
| Auto-generated skills: pass rate ≥90% | ✅ |
| Zero security incidents за 90 дней | ✅ |
| Uptime ≥99.5% | ✅ |

---

## Coverage Table

| Компонент | v1.4 | v1.5 | v2 |
|-----------|------|------|-----|
| **shared-types** | A1 ✅ | — | — |
| **Token unification** | A3 ✅ | — | — |
| **HealthDashboard** | A4 ✅ | — | — |
| **policy ↔ swarm** | B2 ✅ | — | — |
| **contracts ↔ skills** | B3 ✅ | — | — |
| **watchdog ↔ compressor** | B4 ✅ | — | — |
| **memory ↔ context** | B1 ✅ | — | — |
| **skills ↔ DAG** | B5 ✅ | — | — |
| **Metric Bus** | C1-C3 ✅ | — | — |
| **Unified Pipeline** | C4 ✅ | — | — |
| **CLI MVP** | — | Phase 1 ✅ | — |
| **CLI Swarm+Memory** | — | Phase 2 ✅ | — |
| **CLI Policy+Logs** | — | Phase 3 ✅ | — |
| **Dashboard Status** | — | Sprint 1 ✅ | — |
| **Dashboard Swarm+Memory** | — | Sprint 2 ✅ | — |
| **Dashboard Health+Policy+Logs** | — | Sprint 3 ✅ | — |
| **Dashboard Polish+Auth+Kanban** | — | Sprint 4 ✅ | — |
| **Branding** | — | ✅ | — |
| **Swarm Scaling** | — | — | ✅ |
| **Prometheus** | (v1) | — | — |

---

## Risk Watchlist

| Риск | Severity | Митигация |
|------|----------|-----------|
| Token budget bypass — субагент обходит бюджет | 💀 CRITICAL | `Brain.think()` проверяет caller через SwarmBudget |
| Contract bypass — deploy без проверки | 💀 CRITICAL | MANDATORY check в CI + Soul Guard для contracts.ts |
| Memory poison — ложный факт с `confidence: high` | 💀 CRITICAL | `high` только от tool/API/file, никогда от LLM |
| Unbounded waves — memory leak при глубокой рекурсии | 🔴 HIGH | `maxWaves` параметр (default: 5) |
| God-object SharedContext — bottleneck при 10+ агентах | 🟡 MEDIUM | v2: разделение на TaskContext + MemoryContext + ArtifactStore |

## Guardrails

```
✅ policy.assess()          перед каждым spawn
✅ contracts.checkAll()      перед каждым output/commit
✅ health critical           → compressContext()
✅ memory                    никогда не хранит секреты
✅ CPU ≤ 80%                 для LLM-агентов
✅ child.permissions ⊆ parent.permissions    ALWAYS
✅ budget per node ≤ 30%     от оставшегося
✅ max depth: 3              recursion bomb protection
✅ max concurrent: 5         CPU overload protection
```
