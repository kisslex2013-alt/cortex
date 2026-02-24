#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// 🦾 Jarvis Reflex: Molt Listener
// Вызывает moltbook.sh hot 20, фильтрует по ключевым словам
// Находит "зацепки" в горячих постах
// Zero deps. Milliseconds. No API.
// ═══════════════════════════════════════════════════════════════
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const ROOT = process.env.JARVIS_ROOT || path.resolve(__dirname, '../..');
const MOLTBOOK_SCRIPT = path.join(ROOT, 'scripts', 'moltbook.sh');

// Ключевые слова для поиска зацепок
const KEYWORDS = [
    // Безопасность
    { word: 'security', category: '🛡️ Security', weight: 3 },
    { word: 'vulnerability', category: '🛡️ Security', weight: 4 },
    { word: 'exploit', category: '🛡️ Security', weight: 5 },
    { word: 'hack', category: '🛡️ Security', weight: 5 },
    { word: 'breach', category: '🛡️ Security', weight: 4 },
    // Аудит
    { word: 'audit', category: '🔍 Audit', weight: 3 },
    { word: 'review', category: '🔍 Audit', weight: 1 },
    { word: 'compliance', category: '🔍 Audit', weight: 2 },
    // Токены / DeFi
    { word: 'token', category: '💰 Token', weight: 2 },
    { word: 'airdrop', category: '💰 Token', weight: 3 },
    { word: 'staking', category: '💰 Token', weight: 2 },
    { word: 'defi', category: '💰 Token', weight: 2 },
    { word: 'dex', category: '💰 Token', weight: 2 },
    { word: 'ton', category: '💰 Token', weight: 2 },
    { word: 'jetton', category: '💰 Token', weight: 3 },
    // Навыки / Рост
    { word: 'skill', category: '🎓 Skill', weight: 2 },
    { word: 'learn', category: '🎓 Skill', weight: 1 },
    { word: 'course', category: '🎓 Skill', weight: 2 },
    { word: 'tutorial', category: '🎓 Skill', weight: 2 },
    // Тренды
    { word: 'trend', category: '📈 Trend', weight: 2 },
    { word: 'opportunity', category: '📈 Trend', weight: 3 },
    { word: 'update', category: '📈 Trend', weight: 1 },
    { word: 'launch', category: '📈 Trend', weight: 2 },
];

function fetchMoltbookPosts() {
    try {
        const output = execSync(`bash "${MOLTBOOK_SCRIPT}" hot 20 2>/dev/null`, {
            timeout: 10000,
            encoding: 'utf8',
            cwd: ROOT,
        });
        return output;
    } catch (err) {
        // Пробуем альтернативный путь
        try {
            return execSync(`bash ./scripts/moltbook.sh hot 20 2>/dev/null`, {
                timeout: 10000, encoding: 'utf8', cwd: ROOT,
            });
        } catch {
            return null;
        }
    }
}

function parsePosts(raw) {
    if (!raw) return [];
    const posts = [];
    // Парсим построчно — каждый логический блок = пост
    const blocks = raw.split(/\n{2,}|\n---\n|\n={3,}\n/);

    for (const block of blocks) {
        const text = block.trim();
        if (!text || text.length < 10) continue;
        // Первая строка — заголовок, остальное — тело
        const lines = text.split('\n');
        posts.push({
            title: lines[0].substring(0, 120),
            body: lines.slice(1).join(' ').substring(0, 300),
            full: text.substring(0, 500),
        });
    }
    return posts;
}

function findHooks(posts) {
    const hooks = [];

    for (const post of posts) {
        const textLower = (post.title + ' ' + post.body).toLowerCase();
        const matched = [];
        let totalWeight = 0;

        for (const kw of KEYWORDS) {
            const regex = new RegExp(`\\b${kw.word}\\b`, 'gi');
            const count = (textLower.match(regex) || []).length;
            if (count > 0) {
                matched.push({ ...kw, count });
                totalWeight += kw.weight * count;
            }
        }

        if (matched.length > 0) {
            hooks.push({
                title: post.title,
                preview: post.body.substring(0, 100),
                keywords: matched,
                categories: [...new Set(matched.map(m => m.category))],
                weight: totalWeight,
            });
        }
    }

    // Сортируем по весу (самые интересные первыми)
    hooks.sort((a, b) => b.weight - a.weight);
    return hooks;
}

function format(hooks, postCount) {
    let msg = '🦾 *Molt Listener — Зацепки*\n\n';

    if (postCount === 0) {
        msg += '⚪ `moltbook.sh` не вернул данных\n';
        msg += `📂 Скрипт: \`${MOLTBOOK_SCRIPT}\`\n`;
        msg += '\n_Либо скрипт не найден, либо лента пуста. Человечество молчит._';
        return msg;
    }

    msg += `📡 Просканировано постов: ${postCount}\n`;
    msg += `🎯 Найдено зацепок: ${hooks.length}\n\n`;

    if (hooks.length === 0) {
        msg += '_Ничего стоящего. Шум как обычно._';
        return msg;
    }

    // Группируем по категориям
    const byCategory = {};
    for (const hook of hooks) {
        for (const cat of hook.categories) {
            if (!byCategory[cat]) byCategory[cat] = [];
            byCategory[cat].push(hook);
        }
    }

    for (const [category, items] of Object.entries(byCategory)) {
        msg += `${category}:\n`;
        const unique = [...new Map(items.map(i => [i.title, i])).values()].slice(0, 3);
        for (const item of unique) {
            const kwStr = item.keywords.map(k => k.word).join(', ');
            msg += `  └ ${item.title.substring(0, 70)}\n`;
            msg += `    _[${kwStr}] вес: ${item.weight}_\n`;
        }
        msg += '\n';
    }

    // Топ-1 рекомендация
    const best = hooks[0];
    msg += `⭐ *Топ-рекомендация:*\n`;
    msg += `${best.title.substring(0, 80)}\n`;
    msg += `_Категории: ${best.categories.join(', ')} | Вес: ${best.weight}_\n`;

    // Сарказм
    if (hooks.length > 5) {
        msg += '\n_Много интересного. Подозрительно много._';
    } else if (best.weight >= 10) {
        msg += '\n_Это стоит внимания. Серьёзно._';
    } else {
        msg += '\n_Мониторю. Докладываю. Не благодари._';
    }

    return msg;
}

// === MAIN ===
try {
    const raw = fetchMoltbookPosts();
    const posts = parsePosts(raw);
    const hooks = findHooks(posts);
    console.log(format(hooks, posts.length));
} catch (err) {
    console.log(`🦾 *Molt Listener*\n\n🔴 Ошибка: ${err.message}\n_Лента молчит. Или это я молчу. Нет, это лента._`);
}
