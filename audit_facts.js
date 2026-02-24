const fs = require('fs');
const dirs = fs.readdirSync('packages');
console.log('| Package | Exists | Purpose (description) | Public API (exports/main/bin) | Tests? | Lint? | Notes |');
console.log('|---|---|---|---|---|---|---|');
for (const d of dirs) {
    const p = 'packages/' + d + '/package.json';
    if (fs.existsSync(p)) {
        const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
        const exists = 'Yes';
        const purpose = pkg.description || '-';
        let api = [];
        if (pkg.exports) api.push('exports');
        if (pkg.main) api.push('main');
        if (pkg.types) api.push('types');
        if (pkg.bin) {
            for (const b in pkg.bin) api.push('bin:' + b);
            api.push('CLI');
        }
        const apiStr = api.join(', ') || '-';
        const hasTest = pkg.scripts && pkg.scripts.test ? 'Yes' : 'No';
        const hasLint = pkg.scripts && pkg.scripts.lint ? 'Yes' : 'No';
        let notes = [];
        if (d === 'dashboard') notes.push('Vite app (TSX)');
        if (d === 'cli') notes.push('Jarvis CLI');
        const notesStr = notes.join(', ') || '-';
        console.log(`| ${d} | ${exists} | ${purpose} | ${apiStr} | ${hasTest} | ${hasLint} | ${notesStr} |`);
    } else {
        console.log(`| ${d} | No | - | - | - | - | - |`);
    }
}
