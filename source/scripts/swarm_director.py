import json
import os
import time
import uuid
from typing import List, Dict

STATE_DIR = "shared_states"
SWARM_DIR = ".jarvis/swarm"

class SwarmDirector:
    def __init__(self, task_id=None):
        self.task_id = task_id or f"task_{uuid.uuid4().hex[:8]}"
        self.state_path = os.path.join(STATE_DIR, f"{self.task_id}_state.json")
        os.makedirs(STATE_DIR, exist_ok=True)

    def initialize_task(self, description: str, subtasks: List[str]):
        state = {
            "task_id": self.task_id,
            "description": description,
            "status": "initializing",
            "created_at": time.time(),
            "subtasks": [
                {"id": f"sub_{i}", "desc": task, "status": "pending", "result": None}
                for i, task in enumerate(subtasks)
            ]
        }
        self.save_state(state)
        return self.task_id

    def save_state(self, state):
        with open(self.state_path, 'w') as f:
            json.dump(state, f, indent=2)
        # Also sync to registry
        with open(os.path.join(SWARM_DIR, "_registry.md"), "a") as f:
            f.write(f"- [{time.strftime('%Y-%m-%d %H:%M')}] Task {self.task_id}: {state['status']}\n")

if __name__ == "__main__":
    # Test initialization
    director = SwarmDirector()
    director.initialize_task("System Self-Audit", ["Check ENV security", "Validate WAL logs", "Scan for disk bloat"])
    print(f"Swarm infrastructure TEST OK. Task ID: {director.task_id}")
