import json
import os
import glob
from typing import List, Dict

SHARED_STATE_DIR = "shared_states"
CONTEXT_LIMIT_CHARS = 5000  # Safe slice for sub-agent injection

class ContextInjector:
    """Injects findings from other swarm members into the current agent's context."""
    
    def __init__(self, task_id: str):
        self.task_id = task_id
        self.state_file = os.path.join(SHARED_STATE_DIR, f"{task_id}_state.json")

    def get_collective_context(self) -> str:
        """Reads all subtasks results and formats them as a context block."""
        if not os.path.exists(self.state_file):
            return "No collective context found for this task."

        with open(self.state_file, 'r') as f:
            state = json.load(f)

        context_blocks = []
        for subtask in state.get("subtasks", []):
            if subtask.get("status") == "completed" and subtask.get("result"):
                block = f"--- SUBTASK: {subtask['desc']} ---\nRESULT: {subtask['result']}\n"
                context_blocks.append(block)

        full_context = "\n".join(context_blocks)
        # Slicing to prevent context overflow in small models
        return full_context[-CONTEXT_LIMIT_CHARS:]

    def inject_to_prompt(self, base_prompt: str) -> str:
        """Wraps the base prompt with the collective knowledge."""
        collective_data = self.get_collective_context()
        injected_prompt = (
            "### COLLECTIVE KNOWLEDGE FROM SWARM ###\n"
            f"{collective_data}\n"
            "### END OF COLLECTIVE KNOWLEDGE ###\n\n"
            "Now, based on the knowledge above and your specific task, proceed:\n"
            f"{base_prompt}"
        )
        return injected_prompt

if __name__ == "__main__":
    # Internal Test
    injector = ContextInjector("test_task")
    print("Context Injector Ready. Mode: Hybrid Slicing.")
