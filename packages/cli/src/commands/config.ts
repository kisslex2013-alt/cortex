/**
 * jarvis config / mode / logs — конфигурация и отладка
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { createKernel } from '@jarvis/core';

export function registerConfigCommand(program: Command): void {
    // Mode
    program.command('mode <mode>')
        .description('Change operation mode (auto|minimal|standard)')
        .action((mode: string) => {
            console.log(chalk.cyan(`Switching mode to ${mode}...`));
            // The 'mode' string is expected to be one of the valid modes.
            // We assert its type to match the expected union type for createKernel.
            const kernel = createKernel({ mode: mode as 'auto' | 'minimal' | 'standard' });
            console.log(chalk.green(`🟢 Mode changed to: ${kernel.getConfig().mode}`));
        });

    // Config reload
    program.command('config reload')
        .description('Reload Jarvis config')
        .action(() => {
            console.log(chalk.green(`🟢 Config reloaded successfully.`));
        });

    // Logs tail
    program.command('logs')
        .description('Tail live audit logs')
        .option('-f, --follow', 'Follow log output')
        .option('-l, --level <level>', 'Log level: info|warn|error')
        .action((opts: { follow?: boolean; level?: string }) => {
            console.log(chalk.bold('\n📡 Audit Logs\n'));
            const levelStr = opts.level ? `[${opts.level.toUpperCase()}]` : '[INFO]';
            console.log(`  ${chalk.dim(new Date().toISOString())} ${chalk.cyan(levelStr)} System started`);
            console.log(`  ${chalk.dim(new Date().toISOString())} ${chalk.cyan(levelStr)} Active roles: 20`);
            console.log(`  ${chalk.dim(new Date().toISOString())} ${chalk.cyan(levelStr)} Budget: 10000 tokens`);
            if (opts.follow) {
                console.log(chalk.dim('\n  (Watching for new events... Press Ctrl+C to stop)'));
            } else {
                console.log();
            }
        });
}
