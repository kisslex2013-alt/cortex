#!/usr/bin/env python3
import sqlite3
import requests
import time
import os
import logging
import json
from datetime import datetime

# --- Configuration ---
DB_PATH = "/root/.openclaw/workspace/scripts/survival/outbox.db"
CONFIG_PATH = "/root/.openclaw/openclaw.json"

def get_token():
    try:
        with open(CONFIG_PATH, "r") as f:
            return json.load(f)["channels"]["telegram"]["botToken"]
    except Exception as e:
        logging.error(f"Error reading token from config: {e}")
        return None

CHECK_INTERVAL = 5 # Check every 5 seconds for new messages
MAX_RETRIES = 10
MAX_MESSAGE_LENGTH = 4000 # Telegram limit is 4096, keeping safety margin

logging.basicConfig(
    filename='/root/.openclaw/workspace/scripts/survival/outbox.log',
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS outbox
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  chat_id TEXT NOT NULL,
                  text TEXT NOT NULL,
                  status TEXT DEFAULT 'pending',
                  attempts INTEGER DEFAULT 0,
                  last_attempt TIMESTAMP,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    conn.commit()
    conn.close()

def split_message(text):
    """Splits a message into chunks of MAX_MESSAGE_LENGTH."""
    if len(text) <= MAX_MESSAGE_LENGTH:
        return [text]
    
    chunks = []
    while text:
        if len(text) <= MAX_MESSAGE_LENGTH:
            chunks.append(text)
            break
        
        # Try to split at the last newline to keep structure
        split_at = text.rfind('\n', 0, MAX_MESSAGE_LENGTH)
        if split_at == -1:
            split_at = MAX_MESSAGE_LENGTH
            
        chunks.append(text[:split_at])
        text = text[split_at:].lstrip()
    return chunks

def send_message_chunk(chat_id, text, token):
    if not token:
        return False, "No bot token available"
        
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML"
    }
    try:
        response = requests.post(url, json=payload, timeout=20)
        if response.status_code == 200:
            return True, None
        if response.status_code == 429: # Rate limit
            retry_after = response.json().get('parameters', {}).get('retry_after', 5)
            return False, f"RATE_LIMIT:{retry_after}"
        return False, f"HTTP {response.status_code}: {response.text}"
    except Exception as e:
        return False, str(e)

def process_queue():
    # Always get the freshest token from config
    token = get_token()
    if not token:
        return

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""SELECT id, chat_id, text, attempts FROM outbox 
                 WHERE status='pending' AND attempts < ? 
                 ORDER BY created_at ASC""", (MAX_RETRIES,))
    rows = c.fetchall()
    
    for row in rows:
        msg_id, chat_id, text, attempts = row
        
        chunks = split_message(text)
        all_chunks_sent = True
        
        for i, chunk in enumerate(chunks):
            success, error = send_message_chunk(chat_id, chunk, token)
            if not success:
                all_chunks_sent = False
                if error and "RATE_LIMIT" in error:
                    wait_time = int(error.split(':')[1])
                    logging.warning(f"Telegram Rate Limit. Waiting {wait_time}s")
                    time.sleep(wait_time)
                else:
                    logging.warning(f"Failed to send chunk {i} of message {msg_id}: {error}")
                break # Stop processing this message, try later
            time.sleep(0.5) # Anti-flood delay between chunks
            
        if all_chunks_sent:
            c.execute("DELETE FROM outbox WHERE id=?", (msg_id,))
            logging.info(f"Message {msg_id} (full) sent successfully.")
        else:
            new_attempts = attempts + 1
            c.execute("UPDATE outbox SET attempts=?, last_attempt=CURRENT_TIMESTAMP WHERE id=?", (new_attempts, msg_id))
            if new_attempts >= MAX_RETRIES:
                c.execute("UPDATE outbox SET status='failed' WHERE id=?", (msg_id,))
        
        conn.commit()
    
    conn.close()

if __name__ == "__main__":
    init_db()
    logging.info("Telegram Outbox Courier v2.1 (Dynamic Token) started.")
    while True:
        try:
            process_queue()
        except Exception as e:
            logging.error(f"Queue error: {e}")
        time.sleep(CHECK_INTERVAL)
