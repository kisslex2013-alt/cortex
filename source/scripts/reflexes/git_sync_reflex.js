#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// 🦾 Jarvis Reflex #6: Git Auto-Sync
// git status → git add . → git commit (авто-описание) → git push
// Cron: */5 * * * * (каждые 5 минут)
// Zero deps. No API.
// ═══════════════════════════════════════════════════════════════
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../..');
const BRANCH = process.env.GIT_BRANCH || 'main';
const MAX_COMMIT_MSG_LEN = 120;

// Файлы которые НЕ нужно коммитить автоматически
const IGNORE_PATTERNS = [
    '.env', '.secret', 'node_modules', '.DS_Store',
    'ton_price_history.json', // runtime data
];

function exec(cmd) {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', timeout: 30000 }).trim();
}

function execSafe(cmd) {
    try { return exec(cmd); } catch { return ''; }
}

// ═══ Собираем статус ═══
function getChanges() {
    const status = exec('git status --porcelain 2>/dev/null');
    if (!status) return null;

    const lines = status.split('\n').filter(l => l.trim());
    const changes = {
        added: [],      // A  / ??
        modified: [],   // M
        deleted: [],    // D
        renamed: [],    // R
        all: [],
    };

    for (const line of lines) {
        const flag = line.substring(0, 2).trim();
        let file = line.substring(3).trim();

        // Убираем кавычки из path
        if (file.startsWith('"') && file.endsWith('"')) {
            file = file.slice(1, -1);
        }

        // Проверяем игнор-паттерны
        if (IGNORE_PATTERNS.some(p => file.includes(p))) continue;

        const basename = path.basename(file);
        const entry = { flag, file, basename };

        if (flag === '??' || flag === 'A') changes.added.push(entry);
        else if (flag === 'M' || flag === 'MM') changes.modified.push(entry);
        else if (flag === 'D') changes.deleted.push(entry);
        else if (flag.startsWith('R')) changes.renamed.push(entry);

        changes.all.push(entry);
    }

    return changes.all.length > 0 ? changes : null;
}

// ═══ Генерация commit message из имён файлов ═══
function generateCommitMessage(changes) {
    const parts = [];

    // Группируем по действию
    if (changes.added.length > 0) {
        const names = changes.added.map(f => f.basename);
        if (names.length <= 3) {
            parts.push(`Add ${names.join(', ')}`);
        } else {
            parts.push(`Add ${names.slice(0, 2).join(', ')} +${names.length - 2} files`);
        }
    }

    if (changes.modified.length > 0) {
        const names = changes.modified.map(f => f.basename);

        // Пытаемся угадать контекст по имени файла
        const contexts = names.map(name => {
            const lower = name.toLowerCase();
            if (lower.includes('readme') || lower.includes('roadmap')) return `Update ${name}`;
            if (lower.includes('reflex')) return `Fix ${name} logic`;
            if (lower.includes('config')) return `Tweak ${name}`;
            if (lower.includes('scanner') || lower.includes('trading')) return `Fix ${name} logic`;
            if (lower.endsWith('.md')) return `Update ${name}`;
            if (lower.endsWith('.sh')) return `Patch ${name}`;
            return `Update ${name}`;
        });

        if (contexts.length <= 3) {
            parts.push(contexts.join(', '));
        } else {
            parts.push(`Update ${names.slice(0, 2).join(', ')} +${names.length - 2} files`);
        }
    }

    if (changes.deleted.length > 0) {
        const names = changes.deleted.map(f => f.basename);
        parts.push(`Remove ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}`);
    }

    if (changes.renamed.length > 0) {
        parts.push(`Rename ${changes.renamed.length} file(s)`);
    }

    let msg = parts.join('; ');
    if (!msg) msg = `Auto-sync ${changes.all.length} file(s)`;

    // Обрезаем
    if (msg.length > MAX_COMMIT_MSG_LEN) {
        msg = msg.substring(0, MAX_COMMIT_MSG_LEN - 3) + '...';
    }

    // Префикс Jarvis
    return `🦾 ${msg}`;
}

// ═══ Выполнение sync ═══
function doSync(changes, commitMsg) {
    // Stage all
    exec('git add -A');

    // Commit
    // Экранируем кавычки в сообщении
    const safeMsg = commitMsg.replace(/"/g, '\\"');
    exec(`git commit -m "${safeMsg}"`);

    // Push
    try {
        exec(`git push origin ${BRANCH} 2>&1`);
        return { pushed: true, error: null };
    } catch (err) {
        return { pushed: false, error: err.message.substring(0, 100) };
    }
}

// ═══ Форматирование ═══
function format(changes, commitMsg, syncResult) {
    let msg = '🦾 *Git Auto-Sync*\n\n';

    msg += `📝 Commit: \`${commitMsg}\`\n\n`;

    // Детали
    if (changes.added.length > 0)
        msg += `🟢 Добавлено: ${changes.added.length} (${changes.added.slice(0, 3).map(f => f.basename).join(', ')})\n`;
    if (changes.modified.length > 0)
        msg += `🟡 Изменено: ${changes.modified.length} (${changes.modified.slice(0, 3).map(f => f.basename).join(', ')})\n`;
    if (changes.deleted.length > 0)
        msg += `🔴 Удалено: ${changes.deleted.length}\n`;

    msg += `\n📦 Всего файлов: ${changes.all.length}\n`;

    if (syncResult.pushed) {
        msg += `✅ Push: \`origin/${BRANCH}\` — успешно\n`;
        msg += '\n_Код в безопасности. Спасибо, что не спрашиваете._';
    } else {
        msg += `❌ Push failed: ${syncResult.error}\n`;
        msg += '\n_Commit есть, push — нет. Разберёмся._';
    }

    return msg;
}

// ═══ MAIN ═══
try {
    const changes = getChanges();

    if (!changes) {
        // Нет изменений — тишина (для cron)
        console.error('[Git] Clean working tree. Nothing to sync.');
        process.exit(0);
    }

    const commitMsg = generateCommitMessage(changes);
    const syncResult = doSync(changes, commitMsg);
    console.log(format(changes, commitMsg, syncResult));
} catch (err) {
    console.error(`[Git] Error: ${err.message}`);
    process.exit(1);
}
