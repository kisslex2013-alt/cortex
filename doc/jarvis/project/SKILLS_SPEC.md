# 📦 SKILLS_SPEC.md — Jarvis Skill Format

## Формат навыка

Skill = директория с `SKILL.md` (или `skill.json` / `skill.yaml`):

```
skills/
  my-skill/
    SKILL.md          # Декларация навыка
    handler.ts        # (опционально) код обработчика
    tests/            # (опционально) тесты
      test.yaml
```

## SKILL.md — структура

```yaml
---
name: file-analyzer
version: 1.2.0
description: Анализирует файлы по содержимому и структуре
author: user
license: MIT

# Входы/выходы
inputs:
  - name: file_path
    type: string
    required: true
    description: Путь к файлу для анализа
  - name: depth
    type: number
    required: false
    default: 3

outputs:
  - name: report
    type: object
    description: Отчёт анализа

# Требования
requirements:
  resources:
    min_ram_mb: 256
    needs_docker: false
  permissions:
    - file:read
  channels:
    - telegram
    - discord

# Безопасность
security:
  risk_level: LOW        # LOW | MEDIUM | HIGH
  sandbox: true          # Выполнять в Docker sandbox
  allowed_paths:         # Разрешённые пути
    - workspace/
  denied_commands:       # Запрещённые команды
    - rm -rf
    - sudo

# Тест-кейсы
tests:
  - name: basic_analysis
    input: { file_path: "test.txt" }
    expect:
      output.report: { type: object }
      exit_code: 0
  - name: missing_file
    input: { file_path: "nonexistent.txt" }
    expect:
      error: "File not found"

# Совместимость
compatibility:
  jarvis: ">=0.1.0"
  node: ">=22"
---

# File Analyzer

Инструкции для LLM по использованию этого навыка...
```

## Версионирование

- Семантические версии: `MAJOR.MINOR.PATCH`
- `MAJOR` — breaking changes
- `MINOR` — новые функции, обратно совместимые
- `PATCH` — bugfixes

## Жизненный цикл

```
INSTALL → SCAN (security) → VALIDATE (schema) → TEST (sandbox) → ACTIVATE
                                                                      │
UPDATE → SCAN → VALIDATE → TEST → SWAP ── old version → ARCHIVE
```

### SkillLifecycle (DO Framework)

Каждый навык выполняется через 3 стадии:

```
directive → execution → output
```

| Стадия | Описание | API |
|--------|----------|-----|
| `directive` | Загрузка и валидация SKILL.md | `lc.setDirective(skill)` |
| `execution` | Выполнение в sandbox | `lc.beginExecution()` |
| `output` | Генерация отчёта | `lc.completeOutput(result)` |

Результат: `SkillExecutionReport` с полями `skillName`, `status` (success/error), `output`, `durationMs`, `tokensUsed`.

## Structured Task Format

Формат для описания задач с встроенной верификацией (вдохновлено GSD):

```
[TASK: Create login endpoint]
type: auto
files: src/api/auth.ts
action: Create REST endpoint for login
verify: curl -X POST localhost:3000/api/auth returns 200
done: Credentials validated, JWT returned
wave: 1
```

| Поле | Обязательное | Описание |
|------|-------------|----------|
| `name` | ✅ | Название задачи |
| `type` | ❌ (default: auto) | `auto` / `manual` / `review` |
| `files` | ✅ | Файлы для изменения (через запятую) |
| `action` | ✅ | Что нужно сделать |
| `verify` | ✅ | Команда/условие проверки |
| `done` | ✅ | Критерий завершения |
| `wave` | ❌ | Номер волны (для wave-based execution) |

API: `parseStructuredTask(text)` → `StructuredTask | null`, `validateStructuredTask(task)` → `{ valid, missing }`.

## Сканирование безопасности

Skill Scanner проверяет перед активацией:

| Проверка | Критичность | Пример |
|----------|-------------|--------|
| `eval()` / `Function()` | 🔴 CRITICAL | Динамическое выполнение кода |
| `child_process` без sandbox | 🔴 CRITICAL | Прямой доступ к shell |
| `process.env` чтение | 🟡 MEDIUM | Возможная утечка секретов |
| `fs.write` вне workspace | 🟡 MEDIUM | Запись за пределы sandbox |
| `fetch` / `http` | 🟡 MEDIUM | Внешние запросы (data exfiltration) |
| Нет тестов | 🟠 LOW | Непротестированный навык |

**Источник:** [skill_scanner.js](file:///h:/Backup/Zero-Coding/Antigravity/Cortex/source/scripts/survival/skill_scanner.js)

