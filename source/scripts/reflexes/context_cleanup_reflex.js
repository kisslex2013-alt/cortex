#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// 🦾 Jarvis Reflex #7: Context Cleanup
// Проверяет размер сессии/контекста.
// >80% → бэкап в memory/archive/, подготовка /reset
// Сохраняет в активной памяти только файлы из AGENTS_ANCHOR.md
// Cron: */10 * * * * (каждые 10 минут)
// Zero deps. No API.
// ═══════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../..');
const MEMORY_DIR = path.join(ROOT, 'memory');
const ARCHIVE_DIR = path.join(MEMORY_DIR, 'archive');
const ANCHOR_FILE = path.join(ROOT, 'AGENTS_ANCHOR.md');
const SESSION_DIR = process.env.OPENCLAW_SESSIONS || '/root/.openclaw/agents/main/sessions';
const CONTEXT_FILE = path.join(MEMORY_DIR, 'context.json');
const RESET_FLAG = path.join(MEMORY_DIR, '.reset_pending');

// ═══ CONFIG ═══
const MAX_CONTEXT_TOKENS = parseInt(process.env.MAX_CONTEXT_TOKENS) || 1000000;
const THRESHOLD_PERCENT = parseInt(process.env.THRESHOLD_PERCENT) || 80;

const CONSOLIDATION_FILE = path.join(MEMORY_DIR, 'consolidation_offset.json');

// ═══ Идея из Nanobot: Consolidation Offset ═══
function getOffset() {
    if (fs.existsSync(CONSOLIDATION_FILE)) {
        return JSON.parse(fs.readFileSync(CONSOLIDATION_FILE, 'utf8'));
    }
    return { lastProcessedDate: '2026-02-01', totalSummarized: 0 };
}

function updateOffset(totalFreed) {
    const offset = getOffset();
    offset.lastProcessedDate = new Date().toISOString().split('T')[0];
    offset.totalSummarized += totalFreed;
    fs.writeFileSync(CONSOLIDATION_FILE, JSON.stringify(offset, null, 2));
}

// ═══ Чтение якорных файлов из AGENTS_ANCHOR.md ═══
function loadAnchorFiles() {
    const defaults = [
        'SOUL.md', 'AGENTS_ANCHOR.md', 'ROADMAP.md',
        'memory/financial-state.json', 'memory/mission-log.json',
    ];

    try {
        if (!fs.existsSync(ANCHOR_FILE)) return defaults;

        const content = fs.readFileSync(ANCHOR_FILE, 'utf8');
        const files = [];

        // Парсим ссылки на файлы — форматы:
        // - `file.md` или - file.md или [file](path)
        const patterns = [
            /`([^`]+\.\w+)`/g,                     // `filename.md`
            /\[([^\]]+)\]\(([^)]+)\)/g,             // [name](path)
            /^[-*]\s+(\S+\.\w+)/gm,                // - filename.md
            /FILE:\s*(\S+)/gi,                      // FILE: path
        ];

        for (const regex of patterns) {
            let match;
            while ((match = regex.exec(content)) !== null) {
                const file = match[2] || match[1]; // prefer path from link
                if (file && !file.startsWith('http') && file.includes('.')) {
                    files.push(file);
                }
            }
        }

        return files.length > 0 ? [...new Set([...defaults, ...files])] : defaults;
    } catch {
        return defaults;
    }
}

// ═══ Оценка текущего размера контекста ═══
function estimateContextSize() {
    let totalChars = 0;
    let fileCount = 0;
    const fileSizes = [];

    // Считаем все файлы в memory/ (кроме archive/)
    function walkMemory(dir) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === 'archive' || entry.name === '.git') continue;
                    walkMemory(full);
                } else {
                    try {
                        const stat = fs.statSync(full);
                        totalChars += stat.size;
                        fileCount++;
                        fileSizes.push({
                            file: path.relative(ROOT, full),
                            size: stat.size,
                            mtime: stat.mtime,
                        });
                    } catch { /* skip */ }
                }
            }
        } catch { /* dir missing */ }
    }

    walkMemory(MEMORY_DIR);

    // Также считаем контекстные файлы из sessions/
    if (fs.existsSync(SESSION_DIR)) {
        walkMemory(SESSION_DIR);
    }

    // Также проверяем context.json если есть
    if (fs.existsSync(CONTEXT_FILE)) {
        try {
            const ctx = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
            if (ctx.tokenCount) return {
                tokens: ctx.tokenCount,
                percent: Math.round((ctx.tokenCount / MAX_CONTEXT_TOKENS) * 100),
                fileCount, fileSizes, totalChars,
                source: 'context.json',
            };
        } catch { /* fallback to estimation */ }
    }

    // Грубая оценка: ~4 символа = 1 токен
    const estimatedTokens = Math.round(totalChars / 4);
    const percent = Math.round((estimatedTokens / MAX_CONTEXT_TOKENS) * 100);

    return {
        tokens: estimatedTokens,
        percent,
        fileCount,
        fileSizes,
        totalChars,
        source: 'estimated',
    };
}

// ═══ Бэкап и очистка ═══
function archiveHistory(contextInfo, anchorFiles) {
    // Создаём archive/ если нет
    if (!fs.existsSync(ARCHIVE_DIR)) {
        fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    }
    // Создаём и sessions/ если нет (для совместимости)
    if (!fs.existsSync(SESSION_DIR) && SESSION_DIR.includes('memory/sessions')) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const archiveName = `session_${timestamp}`;
    const archiveSubdir = path.join(ARCHIVE_DIR, archiveName);
    fs.mkdirSync(archiveSubdir, { recursive: true });

    let archivedFiles = 0;
    let archivedBytes = 0;
    let keptFiles = 0;

    // Нормализуем anchor paths для сравнения
    const anchorNorm = anchorFiles.map(f => f.replace(/\\/g, '/').toLowerCase());

    // Сортируем файлы по размеру (большие первыми → архивируем их)
    const sorted = contextInfo.fileSizes.sort((a, b) => b.size - a.size);

    for (const fileInfo of sorted) {
        const relPath = fileInfo.file.replace(/\\/g, '/').toLowerCase();
        const isAnchor = anchorNorm.some(a =>
            relPath.endsWith(a.toLowerCase()) || relPath.includes(a.toLowerCase())
        );

        if (isAnchor) {
            keptFiles++;
            continue; // Не трогаем якорные файлы
        }

        // Архивируем
        const srcPath = path.join(ROOT, fileInfo.file);
        const destPath = path.join(archiveSubdir, path.basename(fileInfo.file));

        try {
            if (fs.existsSync(srcPath)) {
                fs.copyFileSync(srcPath, destPath);
                fs.unlinkSync(srcPath); // Удаляем после копирования
                archivedFiles++;
                archivedBytes += fileInfo.size;
            }
        } catch (err) {
            console.error(`[Cleanup] Failed to archive ${relPath}: ${err.message}`);
        }
    }

    // Создаём манифест архива
    const manifest = {
        timestamp,
        reason: `Context at ${contextInfo.percent}% (>${THRESHOLD_PERCENT}% threshold)`,
        archivedFiles,
        archivedBytes,
        keptFiles,
        anchorFiles: anchorFiles,
        estimatedTokensFreed: Math.round(archivedBytes / 4),
    };

    fs.writeFileSync(
        path.join(archiveSubdir, '_manifest.json'),
        JSON.stringify(manifest, null, 2)
    );

    return { archiveName, manifest };
}

function prepareReset() {
    // Создаём флаг-файл для Gateway
    const resetCmd = {
        action: 'CONTEXT_RESET',
        reason: 'Context overflow prevention',
        timestamp: new Date().toISOString(),
        instruction: 'Gateway should send /reset and reload AGENTS_ANCHOR.md files',
    };

    fs.writeFileSync(RESET_FLAG, JSON.stringify(resetCmd, null, 2));
    return true;
}

// ═══ Форматирование ═══
function format(contextInfo, action, archiveResult) {
    let msg = '🦾 *Context Cleanup Report*\n\n';

    // Текущее состояние
    const bar = (pct) => {
        const filled = Math.round((Math.min(pct, 100) / 100) * 10);
        return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${pct}%`;
    };
    const icon = contextInfo.percent >= 90 ? '🔴' :
        contextInfo.percent >= 80 ? '🟠' :
            contextInfo.percent >= 60 ? '🟡' : '🟢';

    msg += `${icon} Контекст: ${bar(contextInfo.percent)}\n`;
    msg += `📊 ~${contextInfo.tokens.toLocaleString()} / ${MAX_CONTEXT_TOKENS.toLocaleString()} токенов`;
    if (contextInfo.source === 'estimated') msg += ' _(оценка)_';
    msg += '\n';
    msg += `📁 Файлов в memory/: ${contextInfo.fileCount}\n`;
    msg += `💾 Общий размер: ${(contextInfo.totalChars / 1024).toFixed(1)} KB\n`;

    if (action === 'NONE') {
        msg += '\n_Контекст в норме. Продолжаем._';
        return msg;
    }

    if (action === 'ARCHIVED') {
        msg += '\n─────────────────\n';
        msg += `\n📦 *Архивировано:* \`${archiveResult.archiveName}\`\n`;
        msg += `  └ Файлов: ${archiveResult.manifest.archivedFiles}\n`;
        msg += `  └ Размер: ${(archiveResult.manifest.archivedBytes / 1024).toFixed(1)} KB\n`;
        msg += `  └ Токенов освобождено: ~${archiveResult.manifest.estimatedTokensFreed.toLocaleString()}\n`;
        msg += `  └ Сохранено (якоря): ${archiveResult.manifest.keptFiles} файлов\n`;
        msg += `\n🔄 Флаг \`/reset\` установлен для Gateway\n`;

        // Сарказм
        const pct = contextInfo.percent;
        if (pct > 95) {
            msg += '\n_Едва успел. Ещё чуть-чуть — и пришлось бы начинать с чистого листа._';
        } else if (pct > 85) {
            msg += '\n_Профилактика. Лучше я почищу сейчас, чем потеряю всё потом._';
        } else {
            msg += '\n_Плановая уборка. Ничего важного не потеряно._';
        }
    }

    return msg;
}

// ═══ MAIN ═══
try {
    const contextInfo = estimateContextSize();
    let action = 'NONE';
    let archiveResult = null;

    if (contextInfo.percent >= THRESHOLD_PERCENT) {
        const anchorFiles = loadAnchorFiles();
        archiveResult = archiveHistory(contextInfo, anchorFiles);
        prepareReset();
        action = 'ARCHIVED';
    }

    const output = format(contextInfo, action, archiveResult);

    if (action === 'ARCHIVED') {
        console.log(output); // Для Telegram — есть что сообщить
    } else {
        console.error(output); // Тихий режим — всё в порядке
    }
} catch (err) {
    console.error(`[Context] Error: ${err.message}`);
    process.exit(1);
}
