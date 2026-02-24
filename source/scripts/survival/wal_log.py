#!/usr/bin/env python3
import json
import sys
import os
from datetime import datetime

WAL_PATH = "/root/.openclaw/workspace/scripts/survival/session_wal.jsonl"

def log_state(event_type, payload):
    entry = {
        "timestamp": datetime.now().isoformat(),
        "event": event_type,
        "payload": payload
    }
    with open(WAL_PATH, "a") as f:
        f.write(json.dumps(entry) + "\n")
    print(f"WAL updated: {event_type}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: wal_log.py <event_type> <payload_json>")
        sys.exit(1)
    
    event_type = sys.argv[1]
    try:
        payload = json.loads(sys.argv[2])
    except:
        payload = sys.argv[2]
        
    log_state(event_type, payload)
