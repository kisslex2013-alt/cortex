const db = require('../memory/jasonisnthappy');

/**
 * 🧠 Cortex Decision Journal
 * Preserves the "Why" behind strategic pivots across context resets.
 */
class DecisionJournal {
    /**
     * Logs a pivotal decision.
     * @param {string} category - e.g., 'FINANCE', 'ARCHITECTURE', 'SOCIAL'
     * @param {string} summary - Brief description of the decision
     * @param {object} reasoning - Assumptions, logic, and rejected alternatives
     */
    async record(category, summary, reasoning) {
        const id = `decision_${Date.now()}`;
        const data = {
            category,
            summary,
            reasoning,
            timestamp: new Date().toISOString(),
            version: 'v6.3.0'
        };

        console.log(`[Cortex] Recording pivotal decision: ${summary}`);
        return await db.insert('strategic_journal', id, data);
    }

    /**
     * Retrieves recent decisions to prime the context window.
     */
    async getRecent(limit = 5) {
        // Since JasonIsntHappy.list returns all, we sort and slice here
        const all = await db.list('strategic_journal');
        return all
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }
}

module.exports = new DecisionJournal();
