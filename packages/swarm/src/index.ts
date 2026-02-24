/**
 * @jarvis/swarm — Public API
 */

export { TaskDAG, type TaskNode, type TaskStatus, type AgentType } from './dag.js';
export { SwarmBudget, type DailyTokenSource } from './budget.js';
export {
    SharedContext, compressContext, createWaveContext, API_SOURCES,
    type AgentResult, type TaskContext, type VerifiableArtifact, type ArtifactType,
} from './shared-context.js';
export { Agent, type AgentStatus, type AgentConfig, type AgentExecuteResult } from './agent.js';
export { ROLES, getRole, getRolesByCategory, getAllRoles, KNOWN_FIX_PATTERNS, tryAutoFix, type RoleDefinition, type AutoFixPattern } from './roles.js';
export { Scheduler, type SchedulerConfig } from './scheduler.js';
export { Coordinator, createSwarm, type CoordinatorConfig, type SwarmResult } from './coordinator.js';
export {
    ContractChecker, BUILT_IN_CONTRACTS,
    type Contract, type ContractContext, type ContractResult, type CodebaseMapEntry,
} from './contracts.js';

