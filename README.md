# 🤖 Jarvis — Modular AI Assistant

> Автономный AI-ассистент с роем агентов, многоуровневой памятью и Policy Engine.

## Архитектура

**8 пакетов** в pnpm-monorepo:

| Пакет | Назначение |
|-------|-----------|
| `@jarvis/core` | Event Loop, Plugin Loader, Config Manager |
| `@jarvis/brain` | LLM Router (7+ провайдеров) + LLM Gateway |
| `@jarvis/memory` | Fast/Long/Vector Memory + CodebaseMapper |
| `@jarvis/swarm` | Agent Swarm Runtime (20 ролей, DAG, Contracts) |
| `@jarvis/watchdog` | Self-Healing, SelfCheck, Context Health Monitor |
| `@jarvis/sandbox-policy` | Risk Engine, Approval Table, Clarification Module |
| `@jarvis/skills` | SKILL.md, SkillLifecycle (DO Framework), StructuredTask |
| `@jarvis/connector-telegram` | Telegram connector (grammY) |

## Data Flow

```
User → Connector → Core(Event) → Policy(risk?) → Brain(LLM+RAG) → Sandbox(exec) → Audit(log) → User
```

## Quick Start

```bash
pnpm install    # установка зависимостей
pnpm build      # компиляция TypeScript
pnpm test       # 113 тестов (8/8 файлов)
pnpm lint       # ESLint проверка
```

## Swarm Runtime

20 ролей агентов работают как **рой** (не N независимых LLM-сессий):

- **5 LLM:** Planner, Architect, Researcher, Reviewer, Refactor Advisor
- **8 Hybrid:** Coder, Debugger, Optimizer, Frontend, Backend, Mobile, QA, Debug
- **7 Tool-only:** Tester, Linter, Static Analyzer, Security Scanner, Dep Checker, Formatter, Diff Generator

**Ключевые фичи:** Wave Isolation, Context Compressor, ContractChecker (3 built-in), Verifiable Artifacts, Auto-Fix Patterns (14), TaskContext.

## Документация

- [ARCHITECTURE.md](doc/jarvis/project/ARCHITECTURE.md) — структура компонентов
- [ROADMAP.md](doc/jarvis/project/ROADMAP.md) — дорожная карта
- [SECURITY.md](doc/jarvis/project/SECURITY.md) — модель угроз и защита
- [POLICY.md](doc/jarvis/project/POLICY.md) — правила и режимы работы
- [SOUL.md](doc/jarvis/project/SOUL.md) — память и цифровая личность
- [SKILLS_SPEC.md](doc/jarvis/project/SKILLS_SPEC.md) — формат навыков

## Лицензия

MIT
