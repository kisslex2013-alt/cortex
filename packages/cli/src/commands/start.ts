/**
 * jarvis start — запуск ядра
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { createKernel } from '@jarvis/core';

export function registerStartCommand(program: Command): void {
    program
        .command('start')
        .description('Start Jarvis kernel')
        .option('-m, --mode <mode>', 'Operation mode (auto|minimal|standard|free_time)', 'auto')
        .action(async (opts: { mode: string }) => {
            const mode = opts.mode as 'auto' | 'minimal' | 'standard' | 'free_time';

            console.log(chalk.cyan('Starting Jarvis...'));

            const kernel = createKernel({ mode });
            await kernel.start();

            console.log(chalk.green('🟢 Jarvis started'));
            console.log(chalk.dim(`   Mode: ${mode}`));
            console.log(chalk.dim(`   Version: ${kernel.getConfig().version}`));
        });
}
