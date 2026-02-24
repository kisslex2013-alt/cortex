// scripts/survival/battle_duty_once.js
const trader = require('../../src/dispatcher/paper_trading');
const Throttler = require('../../src/cortex/throttler');

const throttler = new Throttler();

async function runOnce() {
    try {
        const load = throttler.getLoad();
        if (load.level === 'CRITICAL') {
            console.log(`[Throttle] CPU Load too high (${load.avgCpu}%). Skipping tick.`);
            return;
        }

        await trader.autoEvaluate();
        /*
        // await truth.logEvent('System', 'BattleDutyTick', { 
            status: 'success', 
            cpu: load.avgCpu,
            level: load.level 
        });
        */
    } catch (e) {
        console.error("[BattleDuty] Tick Error:", e.message);
        process.exit(1);
    }
}

runOnce().then(() => {
    process.exit(0);
});
