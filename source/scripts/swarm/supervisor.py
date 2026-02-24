import json
import os
from typing import List, Dict

SHARED_STATE_DIR = "shared_states"

class SwarmSupervisor:
    """Supervises and validates results from swarm workers."""
    
    def __init__(self, task_id: str):
        self.task_id = task_id
        self.state_file = os.path.join(SHARED_STATE_DIR, f"{task_id}_state.json")

    def get_pending_validations(self) -> List[Dict]:
        """Identifies subtasks that are completed but not yet validated."""
        if not os.path.exists(self.state_file):
            return []

        with open(self.state_file, 'r') as f:
            state = json.load(f)

        return [t for t in state.get("subtasks", []) if t.get("status") == "completed" and not t.get("validated")]

    def generate_audit_prompt(self, subtask: Dict) -> str:
        """Creates a prompt for the Auditor agent to verify a specific result."""
        return (
            "### AUDIT TASK ###\n"
            f"Subtask Description: {subtask['desc']}\n"
            f"Worker Result: {subtask['result']}\n\n"
            "Your job is to act as an Auditor. Check the result for:\n"
            "1. Technical accuracy.\n"
            "2. Completeness.\n"
            "3. Hallucinations or errors.\n\n"
            "Reply with 'APPROVED' and a brief summary if OK, or 'REJECTED' with reasons if fix is needed."
        )

    def apply_validation(self, subtask_id: str, audit_result: str):
        """Updates the task state with the audit verdict."""
        with open(self.state_file, 'r') as f:
            state = json.load(f)

        for subtask in state["subtasks"]:
            if subtask["id"] == subtask_id:
                subtask["validated"] = True
                subtask["audit_verdict"] = audit_result
                if "APPROVED" in audit_result.upper():
                    subtask["status"] = "verified"
                else:
                    subtask["status"] = "rejected"
                break

        with open(self.state_file, 'w') as f:
            json.dump(state, f, indent=2)

if __name__ == "__main__":
    print("Swarm Supervisor Logic Ready.")
