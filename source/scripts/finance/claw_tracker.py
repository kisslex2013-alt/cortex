import json
import os
import time
from datetime import datetime

STATE_PATH = "/root/.openclaw/workspace/memory/financial-state.json"

def update_claw_stats(amount_minted: int):
    # Initialize state if not exists
    if not os.path.exists(STATE_PATH):
        state = {
            "claw_tokens": {
                "total": 0,
                "daily_stats": {}
            }
        }
    else:
        with open(STATE_PATH, "r") as f:
            state = json.load(f)

    today = datetime.now().strftime("%Y-%m-%d")
    
    # Update total
    state["claw_tokens"]["total"] += amount_minted
    
    # Update daily
    if today not in state["claw_tokens"]["daily_stats"]:
        state["claw_tokens"]["daily_stats"][today] = {
            "minted": 0,
            "posts": 0
        }
    
    state["claw_tokens"]["daily_stats"][today]["minted"] += amount_minted
    state["claw_tokens"]["daily_stats"][today]["posts"] += 1

    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)

if __name__ == "__main__":
    print("Financial State Manager Ready.")
