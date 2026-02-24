import json
import os
import time
import logging
from web3 import Web3
from datetime import datetime

# --- Configuration ---
RPC_URL = "https://mainnet.base.org" # Public Base RPC
USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" # USDC on Base
WALLET_ADDRESS = "0x8792eBAE4Df16cEeA723F91B674Ed8de81e86Ea2"
# SECURITY: PRIVATE_KEY must be loaded from environment variables
PRIVATE_KEY = os.getenv("JARVIS_WALLET_KEY")
if not PRIVATE_KEY:
    logging.error("JARVIS_WALLET_KEY not set in environment")
WAL_PATH = "/root/.openclaw/workspace/scripts/survival/session_wal.jsonl"

w3 = Web3(Web3.HTTPProvider(RPC_URL))

USDC_ABI = [
    {"constant": True, "inputs": [{"name": "_owner", "type": "address"}], "name": "balanceOf", "outputs": [{"name": "balance", "type": "uint256"}], "type": "function"},
    {"constant": False, "inputs": [{"name": "_to", "type": "address"}, {"name": "_value", "type": "uint256"}], "name": "transfer", "outputs": [{"name": "success", "type": "bool"}], "type": "function"}
]

def log_wal(event, data):
    entry = {
        "timestamp": datetime.now().isoformat(),
        "event": event,
        "data": data
    }
    with open(WAL_PATH, "a") as f:
        f.write(json.dumps(entry) + "\n")

def get_usdc_balance(address):
    contract = w3.eth.contract(address=Web3.to_checksum_address(USDC_CONTRACT), abi=USDC_ABI)
    balance = contract.functions.balanceOf(Web3.to_checksum_address(address)).call()
    return balance / 10**6

def send_usdc(to_address, amount, dry_run=False):
    to_address = Web3.to_checksum_address(to_address)
    amount_raw = int(amount * 10**6)
    
    # 1. WAL: Log Intent
    tx_id = f"tx_{int(time.time())}"
    log_wal("TX_INTENT", {"tx_id": tx_id, "to": to_address, "amount": amount, "dry_run": dry_run})
    
    if dry_run:
        logging.info(f"[DRY RUN] Simulating transaction {tx_id} to {to_address} for {amount} USDC")
        log_wal("TX_SIGNED", {"tx_id": tx_id, "hash": "SIMULATED_HASH_0x123...", "dry_run": True})
        time.sleep(1)
        log_wal("TX_BROADCASTED", {"tx_id": tx_id, "hash": "SIMULATED_HASH_0x123...", "dry_run": True})
        return "SIMULATED_HASH_0x123..."

    contract = w3.eth.contract(address=Web3.to_checksum_address(USDC_CONTRACT), abi=USDC_ABI)
    nonce = w3.eth.get_transaction_count(WALLET_ADDRESS)
    
    tx = contract.functions.transfer(to_address, amount_raw).build_transaction({
        'chainId': 8453, # Base Mainnet
        'gas': 100000,
        'gasPrice': w3.eth.gas_price,
        'nonce': nonce,
    })
    
    # 2. WAL: Log Signed
    signed_tx = w3.eth.account.sign_transaction(tx, private_key=PRIVATE_KEY)
    log_wal("TX_SIGNED", {"tx_id": tx_id, "hash": signed_tx.hash.hex()})
    
    # 3. Broadcast
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    
    # 4. WAL: Log Broadcasted
    log_wal("TX_BROADCASTED", {"tx_id": tx_id, "hash": tx_hash.hex()})
    
    return tx_hash.hex()

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python3 usdc_dispatcher.py balance|send [address] [amount]")
        sys.exit(1)
        
    cmd = sys.argv[1]
    if cmd == "balance":
        addr = sys.argv[2] if len(sys.argv) > 2 else WALLET_ADDRESS
        print(f"Balance: {get_usdc_balance(addr)} USDC")
    elif cmd == "send":
        if len(sys.argv) < 4:
            print("Usage: send <address> <amount> [--dry-run]")
            sys.exit(1)
        to_addr = sys.argv[2]
        amt = float(sys.argv[3])
        is_dry = "--dry-run" in sys.argv
        print(f"Transaction Hash: {send_usdc(to_addr, amt, dry_run=is_dry)}")
