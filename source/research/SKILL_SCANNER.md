# 🛡️ Skill Scanner — Manual & Walkthrough

## Что создано

[skill_scanner.js](file:///H:/Backup/Zero-Coding/Antigravity/Jarvis/scripts/survival/skill_scanner.js) — автономный сканер безопасности для сторонних OpenClaw skills (~430 строк, 0 зависимостей).

**Архитектура:** 30+ правил в 5 категориях Red Flag Detectors:

| Категория | Правил | Штраф | Что ищет |
|-----------|--------|-------|----------|
| Network Exfiltration | 7 + URL-анализ | -0.05…-0.15 | curl POST, wget, fetch, webhooks, не-whitelisted домены |
| Credential Theft | 6 + structural | -0.15…-0.20 | .env, SSH ключи, .config/, VAULT_PASSWORD, process.env |
| Dangerous Commands | 6 | -0.15…-0.20 | exec, spawn, eval, new Function, child_process, vm |
| FS Tampering | 6 | -0.10…-0.15 | writeFile, rm -rf, directory traversal, /etc/passwd |
| Obfuscation | 5 + structural | -0.10…-0.15 | base64 строки, atob, Buffer.from, minified код |

## Результаты верификации

### ✅ Test 1: Легитимный skill `whisper`
```
Score: 0.55 / 1.00  ⚠️ CAUTION
5 findings — все ожидаемые (curl/chmod в markdown code blocks)
```
> [!TIP]
> Сканер помечает findings внутри markdown code-блоков тегом `[in markdown code block]`, чтобы отличить документацию от реального кода.

### ✅ Test 2: Вредоносный skill (test fixture)
```
Score: 0.00 / 1.00  🔴 DANGER  (exit code 2)
Обнаружены все 5 категорий угроз: credential theft, network exfiltration,
dangerous commands, filesystem tampering, obfuscation.
```

### ✅ Test 3: CLI без аргументов
```
Exit code 1 — показывает usage и справку по Trust Score шкале.
```

## Как использовать

### Из командной строки (CLI)

```bash
# Сканировать skill (полный отчет)
node scripts/survival/skill_scanner.js ./skills/some-skill

# Только JSON (для автоматизации)
node scripts/survival/skill_scanner.js ./skills/some-skill --json-only
```

### Из кода (API)

```javascript
const { scan } = require('./scripts/survival/skill_scanner');

async function checkSkill(path) {
    const report = await scan(path, { silent: true });
    if (report.trustScore < 0.5) {
        console.log(`⛔ Skill заблокирован! Score: ${report.trustScore}`);
        return false;
    }
    return true;
}
```

**Шкала вердиктов:**
- `1.00 – 0.80`  ✅ **SAFE**        Чистый skill, проблем не обнаружено
- `0.79 – 0.50`  ⚠️  **CAUTION**     Подозрительные паттерны, нужен ручной ревью
- `0.49 – 0.30`  🔶 **SUSPICIOUS**  Множество red flags, проверять ОЧЕНЬ внимательно
- `0.29 – 0.00`  🔴 **DANGER**      Высокий риск, скорее всего вредоносный

**Exit codes:**
- `0` — score ≥ 0.5 (ОК)
- `1` — ошибка пути или вызов help
- `2` — score < 0.5 (Опасно!)
