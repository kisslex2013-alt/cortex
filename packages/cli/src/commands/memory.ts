/**
 * jarvis memory — подкоманды для Memory
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import { LongMemory } from '@jarvis/memory';

export function registerMemoryCommand(program: Command): void {
    const memory = program
        .command('memory')
        .description('Memory management');

    // jarvis memory search <query>
    memory.command('search <query>')
        .description('Search long-term memory')
        .action((query: string) => {
            const mem = new LongMemory();

            console.log(chalk.bold(`\n🔍 Memory Search: "${query}"\n`));

            const results = mem.search(query);
            if (results.length === 0) {
                console.log(chalk.dim('  No results found.\n'));
                return;
            }

            for (const entry of results) {
                console.log(`  ${chalk.cyan(entry.fact.id)}`);
                console.log(`    ${chalk.dim(entry.fact.content.slice(0, 80))}`);
                console.log(`    ${chalk.dim(`confidence: ${entry.fact.confidence}  source: ${entry.fact.source}  relevance: ${entry.relevance.toFixed(2)}`)}`);
                console.log();
            }
        });

    // jarvis memory stats
    memory.command('stats')
        .description('Show memory statistics')
        .action(() => {
            const mem = new LongMemory();
            const stats = mem.stats();

            console.log(chalk.bold('\n🧠 Memory Stats\n'));
            console.log(`  ${chalk.dim('Total Facts')}   ${stats.totalFacts}`);
            console.log(`  ${chalk.dim('DB Size')}       ${stats.dbSizeBytes} bytes`);
            console.log(`  ${chalk.dim('Categories')}    ${Object.keys(stats.byCategory).join(', ') || 'none'}`);
            console.log();
        });

    // jarvis memory gc
    memory.command('gc')
        .description('Run memory garbage collection')
        .action(() => {
            const mem = new LongMemory();
            const before = mem.stats().totalFacts;
            mem.gc();
            const after = mem.stats().totalFacts;

            console.log(chalk.bold('\n🗑️  Memory GC\n'));
            console.log(`  ${chalk.dim('Before')}  ${before} entries`);
            console.log(`  ${chalk.dim('After')}   ${after} entries`);
            console.log(`  ${chalk.dim('Freed')}   ${chalk.green(String(before - after))} entries`);
            console.log();
        });
}
