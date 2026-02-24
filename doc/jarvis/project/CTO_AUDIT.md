# 🔍 CTO Audit — Jarvis Architecture Review

## Дата: 2026-02-24 | Статус: 8 пакетов, 113 тестов, 0 lint ошибок

---

## 1. Избыточность и дублирование

| # | Что | Где | Проблема | Решение |
|---|-----|-----|----------|---------|
| 1 | `CodebaseMapEntry` | `swarm/contracts.ts` + `memory/index.ts` | Два одинаковых интерфейса | Экспортировать из `memory`, импортировать в `swarm` |
| 2 | Risk assessment | `sandbox-policy/assess()` + `contracts/checkAll()` | Перекрытие: оба проверяют `.env` доступ | `contracts` → pre-commit only; `assess` → runtime only |
| 3 | Health monitoring | `watchdog/SelfCheck` + `watchdog/ContextHealthMonitor` | Два мониторинга без единого dashboard | Объединить в `HealthDashboard` с `getFullReport()` |
| 4 | Token tracking | `brain/BrainRouter.tokensUsedToday` + `swarm/SwarmBudget` | Два трекера токенов без синхронизации | `SwarmBudget` → использовать `brain.getTokensUsedToday()` как source of truth |

**Вердикт:** Дублирование минимальное и контролируемое. Рефакторинг #1 (CodebaseMapEntry) — приоритетный.

---

## 2. Связки между компонентами

### Текущие связки (✅ работают)
```
swarm/roles ←→ swarm/shared-context (агентам назначаются роли, результаты в SharedContext)
swarm/dag   ←→ swarm/scheduler      (DAG определяет порядок, Scheduler запускает)
swarm/agent ←→ swarm/budget          (агент проверяет бюджет перед LLM-call)
```

### Недостающие связки (❌ нужно доделать)

| # | Связка | Статус | Что нужно |
|---|--------|--------|-----------|
| 1 | `policy.assess()` → `swarm.Coordinator` | ❌ | Coordinator должен вызывать `assess()` перед spawn агента |
| 2 | `contracts.checkAll()` → `skills.SkillLifecycle` | ❌ | SkillLifecycle.output() должен проверять контракты |
| 3 | `watchdog.ContextHealthMonitor` → `swarm.compressContext()` | ❌ | Monitor `critical` → автоматический вызов `compressContext()` |
| 4 | `memory.CodebaseMapper` → `swarm.SharedContext` | ❌ | Coordinator inject `mapper.toSummary()` в SharedContext при создании |
| 5 | `skills.parseStructuredTask()` → `swarm.TaskDAG.addNode()` | ❌ | Автоматическая трансформация StructuredTask → TaskNode |

---

## 3. Пять улучшений 🚀

| # | Улучшение | Impact | Effort |
|---|-----------|--------|--------|
| 1 | **Единый Pipeline:** `StructuredTask → TaskDAG → Swarm → ContractCheck → Commit` | 🔴 Высокий | Средний |
| 2 | **Health-aware Scheduler:** Scheduler учитывает `ContextHealthMonitor` при планировании | 🟡 Средний | Низкий |
| 3 | **LLMGateway в BrainRouter:** Router использует Gateway для dynamic provider discovery | 🟡 Средний | Низкий |
| 4 | **Metric bus:** Единная шина метрик (tokens, latency, errors) для Dashboard | 🔴 Высокий | Средний |
| 5 | **Skill auto-discovery:** CodebaseMapper сканирует файлы и предлагает навыки | 🟡 Средний | Средний |

## 4. Пять ловушек ⚠️

| # | Ловушка | Почему опасна | Как избежать |
|---|---------|---------------|-------------|
| 1 | **God-object SharedContext** | Всё проходит через один объект → bottleneck | Разделить на `TaskContext` + `MemoryContext` + `ArtifactContext` |
| 2 | **Implicit dependencies** | contracts.ts & memory знают о CodebaseMapEntry, но без explicit import | Объявить shared-types пакет |
| 3 | **Test fragility** | Тесты проверяют `.length === 20`, при добавлении роли — ломаются | Тестировать `includes()`, не `.length` |
| 4 | **Silent contract failure** | ContractChecker.checkAll() возвращает результат, но не блокирует | Добавить `strictMode: true` → throw при нарушении |
| 5 | **Unbounded wave creation** | `createWaveContext()` без лимита → memory leak при глубокой рекурсии | Добавить `maxWaves` параметр (default: 5) |

## 5. Три самые дорогие ошибки 💀

| # | Ошибка | Цена | Предотвращение |
|---|--------|------|---------------|
| 1 | **Token budget bypass** — субагент обходит бюджет через прямой вызов Brain | Неконтролируемый расход ($$$) | `Brain.think()` проверяет caller через Policy → ЗАПРЕТ без SwarmBudget |
| 2 | **ContractChecker отключён** — deploy без проверки контрактов | Breaking changes в production | MANDATORY check in CI pipeline + Soul Guard для contracts.ts |
| 3 | **Memory poison** — LLM записывает ложный факт с `confidence: 'high'` | Все будущие решения на основе ложных данных | Фильтр: `confidence` > medium только от верифицированных источников (tool/API/file), никогда от LLM directly |

---

## 6. Web Dashboard — Проработка

**Принцип:** тонкий UI над core API, без дублирования логики.

### Архитектура

```
┌──────────────────────┐
│   React SPA (Vite)   │  ← Dashboard UI
│   WebSocket + REST   │
└──────────┬───────────┘
           │
┌──────────▼───────────┐
│   API Gateway        │  ← Express/Fastify (тонкий)
│   /api/swarm/*       │
│   /api/memory/*      │
│   /api/watchdog/*    │
│   /api/policy/*      │
└──────────┬───────────┘
           │
┌──────────▼───────────┐
│   @jarvis/core       │  ← Существующие пакеты (никакого дублирования)
└──────────────────────┘
```

### Страницы Dashboard

| Страница | Core API | Отображение |
|----------|----------|-------------|
| **Swarm** | `Coordinator.getDAG()` | DAG-граф агентов (D3.js), статусы, токены |
| **Memory** | `LongMemory.search()`, `stats()` | Таблица фактов + поиск + категории |
| **Health** | `SelfCheck.getHistory()`, `ContextHealthMonitor.assess()` | Traffic light (🟢🟡🔴) + recommendations |
| **Policy** | `getApproval()`, `assess()` | Approval log + pending requests |
| **Logs** | Audit stream | Live tail с фильтрами |

---

## 7. CLI — Проработка

**Принцип:** все команды → вызовы core API, CLI не содержит бизнес-логику.

```bash
# Управление
jarvis start              # запуск kernel
jarvis stop               # остановка
jarvis reload             # hot-reload config
jarvis status             # текущее состояние (mode, uptime, tokens)
jarvis doctor             # полный health check (SelfCheck 4 уровня)

# Swarm
jarvis swarm status       # DAG визуализация (ASCII)
jarvis swarm agents       # список активных агентов
jarvis swarm budget       # оставшийся бюджет

# Memory
jarvis memory search <q>  # поиск фактов
jarvis memory stats       # статистика
jarvis memory gc          # ручной garbage collection

# Policy
jarvis mode [auto|minimal|standard|free_time]
jarvis approve <id>       # одобрить pending request
jarvis contracts check    # проверить контракты

# Logs
jarvis logs [--level=warn] [--follow]
```

**Реализация:** `packages/cli/` → thin wrapper над core exports.

---

## 8. Branding — 3 концепции

### Концепция 1: «Neural Core»
- Стиль: техно-минимализм
- Цвета: `#0A0F1E` (deep navy) + `#00D4FF` (cyan) + `#FF6B35` (accent orange)
- Логотип: нейронная сетка, образующая букву J

### Концепция 2: «Iron Butler»
- Стиль: retro-tech elegance
- Цвета: `#1A1A2E` (midnight) + `#E94560` (red accent) + `#F5F5DC` (cream)
- Логотип: щит + шестерёнка + буква J

### Концепция 3: «Cortex Flow»
- Стиль: organic-tech
- Цвета: `#0D1117` (GitHub dark) + `#58A6FF` (link blue) + `#7EE787` (green)
- Логотип: поток данных, образующий мозг

### ASCII для CLI

```
     ╦╔═╗╦═╗╦  ╦╦╔═╗
     ║╠═╣╠╦╝╚╗╔╝║╚═╗
    ╚╝╩ ╩╩╚═ ╚╝ ╩╚═╝
    Cortex v0.1.0 | 🟢 OK
```
