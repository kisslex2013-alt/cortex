#!/usr/bin/env python3
import sqlite3
import sys
import os

DB_PATH = "/root/.openclaw/workspace/scripts/survival/outbox.db"

def send_safe(chat_id, text):
    if not os.path.exists(DB_PATH):
        print(f"Error: Outbox database not found at {DB_PATH}")
        sys.exit(1)
        
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("INSERT INTO outbox (chat_id, text) VALUES (?, ?)", (chat_id, text))
    conn.commit()
    conn.close()
    print("Message successfully queued in Outbox.")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: send_safe.py <chat_id> <text>")
        sys.exit(1)
    
    chat_id = sys.argv[1]
    text = " ".join(sys.argv[2:])
    send_safe(chat_id, text)
