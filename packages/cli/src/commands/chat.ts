/**
 * jarvis chat — интерактивный терминальный чат
 */

import type { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline/promises';

export function registerChatCommand(program: Command): void {
    program
        .command('chat')
        .description('Start interactive chat with Jarvis')
        .action(async () => {
            console.log(chalk.cyan('Starting Jarvis Chat Session...'));
            console.log(chalk.dim('(Type "exit" or "quit" to leave)'));
            console.log(chalk.dim('Connecting to API Gateway (http://localhost:4000/api/chat)...'));

            let token = '';
            try {
                const authRes = await fetch('http://localhost:4000/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: 'admin' })
                });
                if (authRes.ok) {
                    const data = await authRes.json() as { token: string };
                    token = data.token;
                } else {
                    console.log(chalk.red('[Warning] Could not authenticate with Gateway.'));
                }
            } catch {
                console.log(chalk.yellow('[Warning] Gateway offline. Chat might not work.'));
            }

            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            // Prompt loop
            while (true) {
                const answer = await rl.question(chalk.green('\nYou: '));
                const text = answer.trim();

                if (!text) continue;
                if (text.toLowerCase() === 'exit' || text.toLowerCase() === 'quit') {
                    console.log(chalk.cyan('Goodbye!'));
                    break;
                }

                try {
                    // Make request to Gateway
                    const response = await fetch('http://localhost:4000/api/chat', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': token ? `Bearer ${token}` : ''
                        },
                        body: JSON.stringify({ message: text })
                    });

                    if (response.status === 401) {
                        console.log(chalk.red('[Error] Unauthorized. Please make sure the gateway has auth configured or log in.'));
                        continue;
                    }

                    if (!response.ok) {
                        console.log(chalk.red(`[Error] Gateway returned ${response.status}`));
                        continue;
                    }

                    const data = await response.json() as { response: string };
                    console.log(chalk.cyan('Jarvis: ') + data.response);
                } catch (e) {
                    // Gateway is likely down
                    console.log(chalk.yellow('[Offline Mode] Jarvis API Gateway not reachable.'));
                    // We could fall back to local direct core brain here, but for MVP just show error:
                    console.log(chalk.red(`Error: ${(e as Error).message}`));
                }
            }
            rl.close();
        });
}
