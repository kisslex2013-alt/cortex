/**
 * jarvis stop — остановка ядра
 */

import type { Command } from 'commander';
import chalk from 'chalk';

export function registerStopCommand(program: Command): void {
    program
        .command('stop')
        .description('Stop Jarvis kernel')
        .action(() => {
            console.log(chalk.red('🔴 Jarvis stopped'));
            console.log(chalk.dim('   (In production: sends SIGTERM to running process)'));
        });
}
