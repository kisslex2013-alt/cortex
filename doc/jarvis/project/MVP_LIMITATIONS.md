/**
 * MVP Limitations & Known Mocks
 *
 * Это ЧЕСТНЫЙ список того, что сейчас является заглушкой (mock),
 * а не реальной реализацией. Не удаляй этот файл — он важнее красивых статусов.
 *
 * Правило: если что-то в этом списке удаляется — оно должно быть заменено
 * реальной реализацией + тест + обновлен ROADMAP.
 */

# MVP Limitations (v1.5)

## Моки в API Gateway

### `/api/auth` — Реально ✅
- Тип: JWT Auth
- Интегрировано в Gateway и Dashboard

### `/api/policy/pending` & `/approve` — Реально ✅
- Связано с `ApprovalQueue` модуля `sandbox-policy` и асинхронным `policyGuard` Координатора.

## Моки в WebSocket

### WebSocket Logs — Реально ✅
- Реальные логи эмиттятся через `kernel.on('log', ...)`
- Интервальная симуляция удалена

### WebSocket Metrics — Реально ✅
- `process.memoryUsage().heapUsed` — реальные данные процесса
- Отправляются каждые 2 секунды

## Общие ограничения

| Компонент       | Статус      | Комментарий                          |
|-----------------|-------------|--------------------------------------|
| Auth            | Real        | JWT Authentication          |
| Policy Pending  | Real        | globalApprovalQueue         |
| Policy Approve  | Real        | Async PolicyGuard integrate |
| WS Logs         | Real        | Kernel event emitter logs   |
| WS Metrics      | Real        | Real process.memoryUsage()           |
| /api/status     | Real        | kernel.getStatus() ✅                |
| /api/health     | Real        | HealthDashboard.getFullReport() ✅   |
| /api/swarm      | Real        | coordinator.stats() ✅               |
| /api/memory/*   | Real        | LongMemory.search/stats() ✅         |
| /api/doctor     | Partial     | SelfCheck.runAll() — checks are stubs|

## Следующие шаги (v1.7 / v2.0 Target)

- [ ] Интеграция LLM провайдеров
- [ ] Запуск реальных Агентов в Docker
- [ ] Очистка UI от legacy mock stats
