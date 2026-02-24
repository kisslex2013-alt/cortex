# ⚖️ POLICY.md — Jarvis Policy Engine

## Risk Engine

Каждое действие оценивается и классифицируется:

### Уровни риска

| Уровень | Примеры действий | Реакция |
|---------|-----------------|---------|
| **LOW** | Ответ на вопрос, поиск, format, чтение документации | Auto-approve, запись в лог |
| **MEDIUM** | Создание skill, правки в репо (sandbox), отправка сообщения | Rule-based approve, запись в лог |
| **HIGH** | Деплой, доступ к секретам, системные команды, сообщение "первым" | **Human approval required** |

### Факторы оценки

```
risk_score = weighted_sum(
  action_type     × 0.30,   # deploy=HIGH, read=LOW
  target_scope    × 0.25,   # production=HIGH, sandbox=LOW
  reversibility   × 0.20,   # irreversible=HIGH
  data_sensitivity × 0.15,  # secrets=HIGH, public=LOW
  time_sensitivity × 0.10   # urgent=HIGH, scheduled=LOW
)
```

## Approval Gates

### Для MEDIUM risk

```yaml
rules:
  - action: create_skill
    auto_approve: true
    conditions:
      - sandbox: true
      - tests_passed: true
      - skill_scan_clean: true
  
  - action: git_commit
    auto_approve: true
    conditions:
      - branch: "!main"         # Только в feature branches
      - diff_size: "<500 lines"
```

### Для HIGH risk

```
User notification via Telegram:
  ┌─────────────────────────────┐
  │ ⚠️ Approval Required        │
  │                             │
  │ Action: Deploy to prod      │
  │ Risk: HIGH (score: 8.2)     │
  │ Reason: Irreversible op     │
  │                             │
  │ [✅ Approve] [❌ Deny]      │
  └─────────────────────────────┘
  
  Timeout: 30 минут → auto-deny
```

## Политика проактивности

| Настройка | Варианты | Default |
|-----------|---------|---------|
| Уровень уведомлений | `quiet` / `normal` / `proactive` | `normal` |
| "Не беспокоить" | `22:00–08:00` (настраиваемо) | Off |
| Тематики | security, ideas, learning, projects, health | All on |
| Anti-spam | Score ≥ 7 для отправки | Enabled |
| Cooldown | По типу: 1 мин (critical) – 4 часа (idea) | Enabled |

## Режимы работы

| Режим | Триггер | Фоновые задачи | Лимит токенов/час |
|-------|---------|----------------|-------------------|
| `minimal` | CPU >90% или safe mode | ❌ Все остановлены | 100 |
| `standard` | Нормальная работа | ✅ При наличии ресурсов | 1000 |
| `free_time` | CPU <20%, 02:00-06:00, нет задач | ✅✅ Максимум | 5000 |
| `auto` | Default | Адаптивно | Адаптивно |

**auto** решает по:
- Загрузка CPU/RAM (>80% → minimal)
- Размер очереди задач (>10 → standard)
- Бюджет токенов (исчерпан → minimal)
- Время суток + "не беспокоить"
- Критичность системы (safe mode → minimal)

## Политика обучения

```
ОБЯЗАТЕЛЬНО:
  ✅ Обучение только из разрешённых источников (allowlist)
  ✅ Проверка лицензий
  ✅ Sandbox для тестирования
  ✅ Approval gate для HIGH-risk changes
  ✅ Auto-rollback при проблемах

ЗАПРЕЩЕНО:
  ❌ Обучение из непроверенных источников
  ❌ Прямая модификация production без sandbox
  ❌ Изменение Policy/Security файлов
  ❌ Неконтролируемое исполнение сгенерированного кода
```

## Swarm Permission Inheritance

В режиме Agent Swarm Runtime права наследуются по цепочке:

```
Kernel.policy
  └→ Coordinator.policy = inherit(Kernel) + task restrictions
       └→ Agent.policy = inherit(Coordinator) + role restrictions
            └→ Sub-agent.policy = inherit(Agent)
```

**Правило:** `child.permissions ⊆ parent.permissions` (monotonic restriction — всегда)

| Агент | Пример ограничений |
|-------|--------------------|
| **Coordinator** | Все права Kernel минус self-modify |
| **Coder (hybrid)** | Только sandbox exec, read workspace |
| **Tester (tool)** | Только exec `vitest`, read-only workspace |
| **Reviewer (LLM)** | Read-only, no exec |

**Escalation chain:** Subagent HIGH-risk → Agent → Coordinator → User. Невозможно пропустить уровень.

**Budget inheritance:** TaskBudget ≤ DailyBudget. NodeBudget ≤ 30% remaining TaskBudget.

## Approval Table

Гранулярная таблица одобрения — 18 операций × 4 уровня:

| Операция | Уровень | Описание |
|----------|---------|----------|
| `read_file`, `search`, `format` | `none` | Автоматически |
| `write_workspace`, `git_add` | `notify` | Логирование + уведомление |
| `create_skill`, `install_dep` | `required` | Подтверждение пользователя |
| `deploy`, `delete_data`, `exec_system` | `mandatory` | Двойное подтверждение + timeout |

Программный доступ:
```typescript
const level = getApproval('deploy'); // → 'mandatory'
```

## Clarification Module

`shouldAskUser()` — определяет, когда нужно уточнение:

| # | Критерий | Пример триггера |
|---|----------|-----------------|
| 1 | Множественные интерпретации | «Удали логи» (системные? приложения? за какой период?) |
| 2 | Деструктивное действие | `rm`, `DROP`, `force push` |
| 3 | Внешний сервис | Deploy, API call, Telegram message |
| 4 | Высокая стоимость ошибки | Production env, финансовые данные |
| 5 | Недостающие данные | Не указан путь, env, конфиг |

**Правило:** если ≥1 критерий = true → запросить подтверждение **перед** выполнением.

## Context Health Policy

`ContextHealthMonitor` из `@jarvis/watchdog` влияет на Policy Engine:

| Здоровье | Реакция Policy |
|----------|---------------|
| `healthy` | Стандартные правила |
| `warning` | Блокировка новых LLM-агентов, рекомендация `compressContext()` |
| `critical` | Принудительное переключение в `minimal` mode |


