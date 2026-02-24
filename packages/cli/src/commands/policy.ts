/**
 * jarvis policy — управление политиками (Phase 3)
 */

import type { Command } from 'commander';
import chalk from 'chalk';

export function registerPolicyCommand(program: Command): void {
    const policy = program
        .command('policy')
        .description('Manage sandbox policies');

    // jarvis policy approve <id>
    policy.command('approve <id>')
        .description('Approve a pending action')
        .action((id: string) => {
            console.log(chalk.bold(`\n🛡️  Policy Engine\n`));
            // В MVP: просто имитация успешного аппрува
            console.log(`  ${chalk.dim('Action ID:')}   ${id}`);
            console.log(`  ${chalk.dim('Status:')}      ${chalk.green('Approved')}`);
            console.log(`  ${chalk.dim('Note:')}        Manual approval granted via CLI.`);
            console.log();
        });
}
