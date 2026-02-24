/**
 * jarvis swarm — подкоманды для Swarm Runtime
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { createSwarm, getAllRoles, SwarmBudget } from '@jarvis/swarm';

export function registerSwarmCommand(program: Command): void {
    const swarm = program
        .command('swarm')
        .description('Agent Swarm Runtime');

    // jarvis swarm status
    swarm.command('status')
        .description('Show swarm status')
        .action(() => {
            const coordinator = createSwarm('status-check', { totalBudget: 10000 });
            const stats = coordinator.stats();

            console.log(chalk.bold('\n🐝 Swarm Status\n'));
            console.log(`  ${chalk.dim('DAG Nodes')}     ${stats.dag.total}`);
            console.log(`  ${chalk.dim('Pending')}       ${stats.dag.pending}`);
            console.log(`  ${chalk.dim('Running')}       ${stats.dag.running}`);
            console.log(`  ${chalk.dim('Done')}          ${stats.dag.done}`);
            console.log(`  ${chalk.dim('Failed')}        ${stats.dag.failed}`);
            console.log(`  ${chalk.dim('Budget')}`);
            console.log(`    ${chalk.dim('Total')}       ${stats.budget.total}`);
            console.log(`    ${chalk.dim('Spent')}       ${stats.budget.spent}`);
            console.log(`    ${chalk.dim('Remaining')}   ${stats.budget.remaining}`);
            console.log(`    ${chalk.dim('Utilization')} ${stats.budget.utilization}%`);
            console.log();
        });

    // jarvis swarm agents
    swarm.command('agents')
        .description('List all agent roles')
        .action(() => {
            const roles = getAllRoles();

            console.log(chalk.bold('\n👥 Agent Roles\n'));
            console.log(`  ${chalk.dim('Role'.padEnd(20))} ${chalk.dim('Type'.padEnd(10))} ${chalk.dim('Category')}`);
            console.log(`  ${'─'.repeat(50)}`);

            for (const role of roles) {
                const typeColor = role.type === 'llm' ? chalk.blue : role.type === 'tool' ? chalk.green : chalk.yellow;
                console.log(`  ${role.name.padEnd(20)} ${typeColor(role.type.padEnd(10))} ${chalk.dim(role.category)}`);
            }
            console.log(`\n  ${chalk.dim(`Total: ${roles.length} roles`)}\n`);
        });

    // jarvis swarm budget
    swarm.command('budget')
        .description('Show token budget')
        .option('-t, --total <tokens>', 'Total budget', '10000')
        .action((opts: { total: string }) => {
            const budget = new SwarmBudget(parseInt(opts.total));
            const stats = budget.stats();

            console.log(chalk.bold('\n💰 Token Budget\n'));
            console.log(`  ${chalk.dim('Total')}         ${stats.total}`);
            console.log(`  ${chalk.dim('Spent')}         ${stats.spent}`);
            console.log(`  ${chalk.dim('Reserved')}      ${stats.reserved}`);
            console.log(`  ${chalk.dim('Remaining')}     ${chalk.green(String(stats.remaining))}`);
            console.log(`  ${chalk.dim('Utilization')}   ${stats.utilization}%`);
            console.log();
        });
}
