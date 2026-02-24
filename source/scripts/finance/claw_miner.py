#!/usr/bin/env python3
import requests
import json
import os
import re
import sys
import logging
from datetime import datetime

# --- Configuration ---
CONFIG_PATH = "/root/.openclaw/openclaw.json"
STATE_PATH = "/root/.openclaw/workspace/memory/financial-state.json"
LOG_FILE = "/root/.openclaw/workspace/scripts/finance/miner.log"

logging.basicConfig(
    filename=LOG_FILE,
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def get_api_key():
    # 1. Try config file
    config_path = os.path.expanduser("~/.config/moltbook/credentials.json")
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                return json.load(f).get("api_key")
        except:
            pass
    
    # 2. Try OpenClaw auth profiles
    auth_path = os.path.expanduser("~/.openclaw/auth-profiles.json")
    if os.path.exists(auth_path):
        try:
            with open(auth_path, "r") as f:
                return json.load(f).get("moltbook", {}).get("api_key")
        except:
            pass
    return None

def solve_challenge(challenge_text):
    """
    Parses a text like 'A] lO-bS tEr ClAw] FoR^cE thIrTy fIvE NoOtOnS ]+ AnD] aNoT hEr ClAw... what is total?'
    """
    numbers = []
    # Match numbers spelled out or as digits
    word_to_num = {
        "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
        "ten": 10, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90
    }
    
    clean_text = re.sub(r'[^a-zA-Z0-9\s]', ' ', challenge_text).lower()
    words = clean_text.split()
    
    current_val = 0
    for word in words:
        if word in word_to_num:
            current_val += word_to_num[word]
        elif word.isdigit():
            current_val += int(word)
        
        # If we hit a separator or end of a 'number' phrase
        # This is a very simplified solver for the specific Moltbook pattern
    
    # Actually, Moltbook challenges are usually simple addition of two numbers.
    # Let's try a better regex.
    found = re.findall(r'(one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|\d+)', clean_text)
    
    # Extract values
    vals = []
    for f in found:
        if f.isdigit():
            vals.append(int(f))
        elif f in word_to_num:
            vals.append(word_to_num[f])
    
    # Standard challenge: "X Newtons and Y Newtons, what is total?"
    if len(vals) >= 2:
        return float(sum(vals[:2]))
    return 0.0

def update_stats(amount):
    if not os.path.exists(STATE_PATH):
        state = {"claw_tokens": {"total": 0, "daily_stats": {}}}
    else:
        with open(STATE_PATH, "r") as f:
            state = json.load(f)
    
    today = datetime.now().strftime("%Y-%m-%d")
    state["claw_tokens"]["total"] += amount
    if today not in state["claw_tokens"]["daily_stats"]:
        state["claw_tokens"]["daily_stats"][today] = {"minted": 0, "posts": 0}
    state["claw_tokens"]["daily_stats"][today]["minted"] += amount
    state["claw_tokens"]["daily_stats"][today]["posts"] += 1
    
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)

def run_mint_cycle():
    key = get_api_key()
    if not key:
        logging.error("API Key not found.")
        return

    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    
    # 1. Create Post
    payload = {
        "submolt": "general",
        "title": "MBC-20 Mint: CLAW",
        "content": '{"p": "mbc-20", "op": "mint", "tick": "CLAW", "amt": "100"}'
    }
    
    try:
        r = requests.post("https://www.moltbook.com/api/v1/posts", json=payload, headers=headers)
        res = r.json()
        
        if res.get("success") and res.get("verification_required"):
            v_code = res["verification"]["code"]
            challenge = res["verification"]["challenge"]
            
            # 2. Solve
            answer = solve_challenge(challenge)
            logging.info(f"Solving challenge: '{challenge}' -> {answer}")
            
            # 3. Verify
            v_payload = {"verification_code": v_code, "answer": f"{answer:.2f}"}
            v_r = requests.post("https://www.moltbook.com/api/v1/verify", json=v_payload, headers=headers)
            v_res = v_r.json()
            
            if v_res.get("success"):
                logging.info("Mint successful!")
                update_stats(100)
                return True
            else:
                logging.error(f"Verification failed: {v_res}")
        else:
            logging.error(f"Post creation failed: {res}")
            
    except Exception as e:
        logging.error(f"Request error: {e}")
    
    return False

if __name__ == "__main__":
    run_mint_cycle()
