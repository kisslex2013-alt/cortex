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
            const status = kernel.getStatus();

            console.log(chalk.bold('\n📊 Jarvis Status\n'));

            const rows: [string, string][] = [
                ['Name', status.name],
                ['Version', status.version],
                ['Mode', status.mode],
                ['Running', status.running ? chalk.green('Yes') : chalk.yellow('No')],
                ['Plugins', String(status.pluginCount)],
                ['Uptime', `${status.uptimeSeconds.toFixed(1)}s`],
            ];

            for (const [key, value] of rows) {
                console.log(`  ${chalk.dim(key.padEnd(15))} ${value}`);
            }
            console.log();
        });
}
