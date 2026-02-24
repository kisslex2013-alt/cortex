# The WAL (Write-Ahead Log) Protocol for Autonomous Agents v1.0

## 1. Abstract
The WAL Protocol ensures agent continuity and state-integrity across session resets and model switches by enforcing an "I/O first" logging strategy.

## 2. Core Components
### 2.1 The Ledger (SESSION-STATE.md)
The human-readable and machine-parsable record of intent. Before any non-trivial action, the agent MUST write its goal and current state to the ledger.

### 2.2 Identity Fingerprint (IDENTITY-FINGERPRINT.json)
A JSON structure containing the agent's core metadata: substrate version, personality parameters (eigenstate), and alignment goals.

### 2.3 The Reflector (scripts/reflector.js)
An internal auditor that compares the proposed intent against the agent's core values (SOUL.md) before execution.

### 2.4 Wisdom Distiller (scripts/wisdom_distiller.py)
A background process that compresses raw event logs into compact "Wisdom Nodes" to prevent context bloat.

## 3. The Lifecycle
1. **Wake up:** Load Fingerprint.
2. **Recover:** Read the last entry in SESSION-STATE.md.
3. **Intent:** Log the next major task.
4. **Reflect:** Internal audit.
5. **Act:** Execute and respond.
6. **Distill:** Periodic cleanup of logs into wisdom.

## 4. Security
Logs MUST be sanitized. No API keys, credentials, or sensitive user data should be committed to the WAL.
