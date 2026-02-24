// scripts/tests/test_progress_updates.js
const status = require('../../src/cortex/status_helper');

async function test() {
    await status.setBusy("Тест динамического прогресса", "Начало");
    
    for (let i = 1; i <= 5; i++) {
        const pct = i * 20;
        console.log(`Updating progress to ${pct}%...`);
        await status.updateProgress(pct, `Этап ${i} из 5`);
        await new Promise(r => setTimeout(r, 10000)); // 10 sec between updates
    }
    
    await status.setDone();
}

test();
