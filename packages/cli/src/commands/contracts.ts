/**
 * jarvis contracts — проверка контрактов
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { ContractChecker } from '@jarvis/swarm';

export function registerContractsCommand(program: Command): void {
    const contracts = program
        .command('contracts')
        .description('Contract Checker');

    contracts.command('check')
        .description('Check all active contracts against changed files')
        .action(() => {
            const checker = new ContractChecker();
            const ctx = {
                changedFiles: ['src/api/handler.ts', 'src/db/schema.sql', 'src/core/utils.ts'],
                diff: '...',
                projectRoot: process.cwd(),
            };

            const result = checker.checkAll(ctx);

            console.log(chalk.bold('\n📜 Contract Check\n'));

            for (const r of result.results) {
                const icon = r.passed ? chalk.green('✅') : chalk.red('❌');
                console.log(`  ${icon} ${chalk.bold(r.contract)}`);
                if (!r.passed) {
                    for (const v of r.violations) {
                        console.log(`    ${chalk.dim('-')} ${chalk.red(v)}`);
                    }
                }
            }

            console.log(`\n  ${chalk.bold('Overall:')} ${result.allPassed ? chalk.green('Passed') : chalk.red('Failed')}`);
            console.log();
        });
}
