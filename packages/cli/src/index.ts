#!/usr/bin/env node
/**
 * @jarvis/cli — Command Line Interface
 *
 * Тонкий wrapper над core API. 0 бизнес-логики.
 */

import { Command } from 'commander';
import { registerStartCommand } from './commands/start.js';
import { registerStopCommand } from './commands/stop.js';
import { registerStatusCommand } from './commands/status.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerSwarmCommand } from './commands/swarm.js';
import { registerMemoryCommand } from './commands/memory.js';
import { registerPolicyCommand } from './commands/policy.js';
import { registerContractsCommand } from './commands/contracts.js';
import { registerConfigCommand } from './commands/config.js';
import { registerChatCommand } from './commands/chat.js';

import chalk from 'chalk';

export const JARVIS_BANNER = [
  "     ██████╗   █████╗ ██████╗ ██╗   ██╗██╗███████╗",
  "         ██╔╝ ██╔══██╗██╔══██╗██║   ██║██║██╔════╝",
  "         ██║  ███████║██████╔╝██║   ██║██║███████╗",
  "    ██   ██║  ██╔══██║██╔══██╗╚██╗ ██╔╝██║╚════██║",
  "    ╚█████╔╝  ██║  ██║██║  ██║ ╚████╔╝ ██║███████║",
  "     ╚════╝   ╚═╝  ╚═╝╚═╝  ╚═╝  ╚═══╝  ╚═╝╚══════╝"
];

const BANNER = `
${JARVIS_BANNER.map(line => chalk.cyan(line)).join('\n')}
${chalk.green('──────────────────────────────────────────────────────')}
${chalk.dim('     Cortex Flow / Neural Core / Iron Butler')}
  ${chalk.dim('v0.1.0')}
`;

const program = new Command();

program
  .name('jarvis')
  .description('Jarvis AI Assistant CLI')
  .version('0.1.0')
  .addHelpText('beforeAll', BANNER);

// Phase 1: MVP commands
registerStartCommand(program);
registerStopCommand(program);
registerStatusCommand(program);
registerDoctorCommand(program);

// Phase 2: Swarm + Memory
registerSwarmCommand(program);
registerMemoryCommand(program);

// Phase 3: Policy + Contracts + Logs
registerPolicyCommand(program);
registerContractsCommand(program);
registerConfigCommand(program);
registerChatCommand(program);

program.parse();
