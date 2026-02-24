#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// 🦾 Jarvis Reflex: Code Audit
// Быстрый поиск TODO/FIXME/HACK в src/ + проверка аномальных файлов
// Zero deps. Milliseconds. No API.
// ═══════════════════════════════════════════════════════════════
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../../..');
const SRC_DIR = path.join(ROOT, 'src');

// Маркеры для поиска
const MARKERS = [
    { tag: 'TODO', icon: '📝', severity: 'low' },
    { tag: 'FIXME', icon: '🔧', severity: 'medium' },
    { tag: 'HACK', icon: '⚠️', severity: 'high' },
    { tag: 'XXX', icon: '💀', severity: 'high' },
    { tag: 'BUG', icon: '🐛', severity: 'high' },
    { tag: 'TEMP', icon: '⏳', severity: 'medium' },
    { tag: 'WARN', icon: '🟡', severity: 'low' },
];

// Пороги аномальности файлов
const ANOMALY_THRESHOLDS = {
    maxSizeKb: 100,         // Файл > 100KB — подозрительно
    maxLines: 2000,         // Файл > 2000 строк — требует рефакторинга
    minSizeBytes: 0,        // Пустые файлы — зачем?
    extensions: ['.js', '.ts', '.mjs', '.cjs', '.json', '.sh', '.py'],
};

function walkDir(dir, fileList = []) {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
                walkDir(fullPath, fileList);
            } else {
                const ext = path.extname(entry.name).toLowerCase();
                if (ANOMALY_THRESHOLDS.extensions.includes(ext)) {
                    fileList.push(fullPath);
                }
            }
        }
    } catch { /* dir missing or no perms */ }
    return fileList;
}

function scanMarkers(files) {
    const findings = [];

    for (const filePath of files) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const relPath = path.relative(ROOT, filePath);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                for (const marker of MARKERS) {
                    // Ищем маркер как слово (не часть другого слова)
                    const regex = new RegExp(`\\b${marker.tag}\\b`, 'i');
                    if (regex.test(line)) {
                        // Извлекаем контекст: текст после маркера
                        const contextMatch = line.match(new RegExp(`${marker.tag}[:\\s]*(.*)`, 'i'));
                        const context = contextMatch
                            ? contextMatch[1].replace(/\*\/|-->|#|\/\//g, '').trim().substring(0, 80)
                            : '';

                        findings.push({
                            file: relPath,
                            line: i + 1,
                            tag: marker.tag,
                            icon: marker.icon,
                            severity: marker.severity,
                            context,
                        });
                    }
                }
            }
        } catch { /* файл заблокирован */ }
    }

    return findings;
}

function checkAnomalies(files) {
    const anomalies = [];

    for (const filePath of files) {
        try {
            const stat = fs.statSync(filePath);
            const relPath = path.relative(ROOT, filePath);
            const sizeKb = Math.round(stat.size / 1024);

            // Пустой файл
            if (stat.size === 0) {
                anomalies.push({
                    file: relPath,
                    type: 'EMPTY',
                    icon: '🕳️',
                    detail: 'Пустой файл — мёртвый код?',
                });
                continue;
            }

            // Слишком большой файл
            if (sizeKb > ANOMALY_THRESHOLDS.maxSizeKb) {
                anomalies.push({
                    file: relPath,
                    type: 'OVERSIZED',
                    icon: '🐘',
                    detail: `${sizeKb}KB — пора разбивать`,
                });
            }

            // Слишком много строк
            if (stat.size < 5 * 1024 * 1024) { // не считаем строки в файлах >5MB
                const content = fs.readFileSync(filePath, 'utf8');
                const lineCount = content.split('\n').length;
                if (lineCount > ANOMALY_THRESHOLDS.maxLines) {
                    anomalies.push({
                        file: relPath,
                        type: 'TOO_LONG',
                        icon: '📏',
                        detail: `${lineCount} строк — God Object?`,
                    });
                }
            }

            // Давно не обновлялся (>90 дней)
            const daysSinceModified = Math.floor((Date.now() - stat.mtime.getTime()) / 86400000);
            if (daysSinceModified > 90) {
                anomalies.push({
                    file: relPath,
                    type: 'STALE',
                    icon: '🧊',
                    detail: `Не трогали ${daysSinceModified} дней`,
                });
            }
        } catch { /* skip */ }
    }

    return anomalies;
}

function format(findings, anomalies, totalFiles) {
    let msg = '🦾 *Audit Reflex — Code Health*\n\n';
    msg += `📂 Просканировано файлов: ${totalFiles}\n`;

    // === МАРКЕРЫ ===
    const bySeverity = { high: [], medium: [], low: [] };
    for (const f of findings) {
        bySeverity[f.severity].push(f);
    }

    const highCount = bySeverity.high.length;
    const medCount = bySeverity.medium.length;
    const lowCount = bySeverity.low.length;
    const totalMarkers = findings.length;

    msg += `🏷️ Найдено маркеров: ${totalMarkers}`;
    if (totalMarkers > 0) {
        msg += ` (💀${highCount} ⚠️${medCount} 📝${lowCount})`;
    }
    msg += '\n';

    // Критичные первыми (max 8)
    if (highCount > 0) {
        msg += '\n🔴 *Критичные (HACK/XXX/BUG):*\n';
        for (const f of bySeverity.high.slice(0, 5)) {
            msg += `  ${f.icon} \`${f.file}:${f.line}\` ${f.tag}`;
            if (f.context) msg += `: ${f.context}`;
            msg += '\n';
        }
        if (highCount > 5) msg += `  _...и ещё ${highCount - 5}_\n`;
    }

    if (medCount > 0) {
        msg += '\n🟡 *Средние (FIXME/TEMP):*\n';
        for (const f of bySeverity.medium.slice(0, 4)) {
            msg += `  ${f.icon} \`${f.file}:${f.line}\` ${f.tag}`;
            if (f.context) msg += `: ${f.context}`;
            msg += '\n';
        }
        if (medCount > 4) msg += `  _...и ещё ${medCount - 4}_\n`;
    }

    if (lowCount > 0) {
        msg += `\n📝 *TODO:* ${lowCount} шт.`;
        if (lowCount <= 3) {
            msg += '\n';
            for (const f of bySeverity.low) {
                msg += `  ${f.icon} \`${f.file}:${f.line}\``;
                if (f.context) msg += `: ${f.context}`;
                msg += '\n';
            }
        } else {
            msg += ` _(покажу по запросу)_\n`;
        }
    }

    // === АНОМАЛИИ ===
    if (anomalies.length > 0) {
        msg += `\n🔎 *Аномалии файлов:* ${anomalies.length}\n`;
        for (const a of anomalies.slice(0, 6)) {
            msg += `  ${a.icon} \`${a.file}\` — ${a.detail}\n`;
        }
        if (anomalies.length > 6) msg += `  _...и ещё ${anomalies.length - 6}_\n`;
    }

    // === ВЕРДИКТ ===
    msg += '\n';
    if (highCount === 0 && anomalies.length === 0) {
        msg += '_Код чист. Почти подозрительно чист._';
    } else if (highCount > 5) {
        msg += '_Тут нужна хирургическая операция. Записываться?_';
    } else if (highCount > 0) {
        msg += '_Есть над чем поработать. Предлагаю начать с красных._';
    } else if (anomalies.length > 3) {
        msg += '_Код живой, но нуждается в уборке. Как и мы все._';
    } else {
        msg += '_Мелочи. Но мелочи имеют привычку расти._';
    }

    return msg;
}

// === MAIN ===
try {
    const srcExists = fs.existsSync(SRC_DIR);
    const scanDir = srcExists ? SRC_DIR : ROOT;

    if (!srcExists) {
        // Fallback: сканируем всю корневую директорию если src/ нет
    }

    const files = walkDir(scanDir);
    const findings = scanMarkers(files);
    const anomalies = checkAnomalies(files);
    console.log(format(findings, anomalies, files.length));
} catch (err) {
    console.log(`🦾 *Audit Reflex*\n\n🔴 Ошибка: ${err.message}\n_Аудит провалился. Ирония._`);
}
