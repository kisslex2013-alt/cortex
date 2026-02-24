# 🛡️ SECURITY.md — Jarvis Security

## Threat Model

| # | Угроза | Вероятность | Влияние | Митигация |
|---|--------|-------------|---------|-----------|
| 1 | **Утечка API-ключей** через логи/промпты | Высокая | Критическое | Vault + Redaction Layer |
| 2 | **Soul-Evil** — подмена identity через config | Средняя | Критическое | Soul Guard (immutable files) |
| 3 | **Prompt Injection** через входящие сообщения | Высокая | Высокое | DM Pairing + input sanitization |
| 4 | **Sandbox escape** — выход из Docker-контейнера | Низкая | Критическое | Docker + gVisor (v2), no privileged |
| 5 | **Malicious skill** — вредоносный навык | Средняя | Высокое | Skill Scanner + sandboxed execution |
| 6 | **Неконтролируемая self-modification** | Средняя | Критическое | Git branch isolation + approval gates |

## Хранение секретов

```
ЗАПРЕЩЕНО:              ОБЯЗАТЕЛЬНО:
─────────────          ────────────────
.env файлы              OS Keychain (keytar)
Переменные окружения    Encrypted SQLite (AES-256-GCM)
Логи / промпты          Short-lived tokens (OAuth + refresh)
Дампы / трейсы          Ротация ключей
MEMORY.md               Audit log доступа к секретам
```

**Принцип:** ядро Jarvis **не имеет доступа** к секретам. Доступ получает только конкретный executor по минимально необходимым правам.

## Зоны доверия

| Зона | Компоненты | Права | Изоляция |
|------|-----------|-------|----------|
| **Core** | Kernel, Policy, Audit | READ config, WRITE logs | Process boundary |
| **Tools** | Executors (shell, browser, git) | Sandbox only | Docker container |
| **Connectors** | Telegram, Discord | Network only | Separate process |
| **Skills** | User/marketplace skills | Scanned + sandboxed | Docker + deny-list |

## Политика вывода (Redaction Layer)

Любое сообщение пользователю проходит redaction:

```
Patterns masked:
  - API keys: AIza*, sk-*, gsk_*, mis_*   → [REDACTED:API_KEY]
  - Tokens: Bearer *, eyJ*                → [REDACTED:TOKEN]
  - Passwords: password=*, pwd=*          → [REDACTED:PASSWORD]
  - Seeds: 12/24 word sequences           → [REDACTED:SEED]
  - IPs: private ranges                   → [REDACTED:IP]
```

## Soul Guard

Критически важные файлы защищены от модификации:

```bash
# Linux: chattr +i (immutable flag)
# + SHA256 хеши для проверки целостности

Protected:
  - SOUL.md           ← identity Jarvis
  - SECURITY.md       ← эти правила
  - config/schema.json ← валидация конфигурации
  - packages/policy/  ← правила безопасности
```

**Источник:** [soul_guard.sh](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/survival/soul_guard.sh)

## Аудит

Каждое действие записывается:

```json
{
  "ts": "2026-02-23T10:00:00Z",
  "actor": "brain.router",
  "action": "llm_call",
  "target": "gemini-pro",
  "risk": "LOW",
  "result": "success",
  "latency_ms": 2340,
  "tokens": 1850,
  "session": "user:telegram:12345"
}
```

Логи **никогда** не содержат: секреты, пароли, seed-фразы, содержимое промптов с PII.

## Rollback Protocol

### Автоматические RestorePoints

| Триггер | Содержимое |
|---------|------------|
| Каждые 4 часа (cron) | config + memory DB + skill registry |
| Перед HIGH-risk операцией | config + memory DB |
| Первый запуск сессии | Полный snapshot |

### Триггеры rollback

| Ситуация | Действие |
|----------|----------|
| Watchdog: 3x health fails | Автоматический rollback |
| Self-mod: тесты failed | Откат patch + notify |
| Deadman: 30 мин без heartbeat | Restart + restore last stable |
| Ручной: `/rollback` | Rollback к выбранной точке |

### Процедура

```
1. Stop non-essential processes
2. Restore config.yaml from snapshot
3. Restore memory.db from snapshot
4. Verify integrity (SHA256 hash)
5. Restart core services
6. Notify user: "Rollback performed. Reason: ..."
```

## Swarm Security

### Изоляция субагентов

- Каждый субагент видит **только** свой input + summary SharedContext
- **Нет cross-read** между параллельными агентами (предотвращена утечка контекста)
- Coordinator видит всё; Agent видит свои deps; Sub-agent видит только input от parent

### Privilege Escalation Prevention

```
child.permissions ⊆ parent.permissions — ALWAYS
```

- Невозможно расширить права через: создание субагента, манипуляцию DAG, изменение роли
- Scheduler.spawn() проверяет: `requestedPermissions ⊆ parent.policy`
- HIGH-risk из субагента → escalation: SubAgent → Agent → Coordinator → User

### Контроль ресурсов

| Ограничение | Значение | Защита от |
|-------------|----------|-----------|
| Max depth | 3 | Recursion bomb |
| Max nodes | 10 | Resource exhaustion |
| Max concurrent | 5 | CPU overload |
| Budget per node | ≤ 30% remaining | Token drain |
| CPU > 90% | Degrade to single | System freeze |

### DAG Rollback

- Каждый узел с side-effect → restore point **перед** выполнением
- Node failure → retry (max 2) → collapse descendants → Coordinator replan
- Coordinator failure → Watchdog restore → SafeMode

## Contract-Level Security

### ContractChecker (`@jarvis/swarm/contracts.ts`)

Перед каждым коммитом агент **обязан** пройти проверку контрактов. Это не code review — это автоматическая проверка инвариантов:

| Контракт | Что проверяет | Severity |
|----------|--------------|----------|
| `naming-conventions` | Файлы .ts в kebab-case, без PascalCase в именах | 🟡 MEDIUM |
| `no-env-access` | Запрет `process.env.*` и прямого обращения к `.env` | 🔴 HIGH |
| `api-signature` | Удалённые `export {}` в index.ts → breaking change | 🔴 HIGH |

```typescript
const checker = new ContractChecker();
const result = checker.checkAll({ changedFiles, diff, projectRoot });
if (!result.allPassed) abort(); // → коммит блокируется
```

Можно добавлять кастомные контракты через `checker.addContract()`.

### Clarification Module (`shouldAskUser()`)

Перед деструктивными действиями система проверяет 5 критериев:

| Критерий | Пример |
|----------|--------|
| Множественные интерпретации | «Удали логи» — какие? за какой период? |
| Деструктивное действие | `rm -rf`, `DROP TABLE`, необратимые операции |
| Внешний сервис | Deploy, API call, отправка сообщения |
| Высокая стоимость ошибки | Production, финансовые данные |
| Недостающие данные | Не указан путь, конфиг, окружение |

Если ≥1 критерий сработал → `shouldAskUser() = true` → запрос подтверждения у пользователя.


