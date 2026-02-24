/**
 * jarvis status — текущее состояние ядра
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { createKernel } from '@jarvis/core';

export function registerStatusCommand(program: Command): void {
    program
        .command('status')
        .description('Show Jarvis status')
        .action(() => {
            const kernel = createKernel();
            const config = kernel.getConfig();

            console.log(chalk.bold('\n📊 Jarvis Status\n'));

            const rows = [
                ['Name', config.name],
                ['Version', config.version],
                ['Mode', config.mode],
                ['Running', kernel.isRunning() ? chalk.green('Yes') : chalk.yellow('No')],
                ['Plugins', String(kernel.getPluginNames().length)],
                ['Token Budget', `${config.tokenBudget.maxPerHour}/hr`],
            ];

            for (const [key, value] of rows) {
                console.log(`  ${chalk.dim(key.padEnd(15))} ${value}`);
            }
            console.log();
        });
}
