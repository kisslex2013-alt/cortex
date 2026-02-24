import asyncio
import json
import os
import sys
import requests
import logging
from datetime import datetime
from tonsdk.contract.wallet import Wallets, WalletVersionEnum
from tonsdk.utils import to_nano
from tonsdk.provider import ToncenterClient

# --- JARVIS 6.2.2: TON Staker Hardened v3.2.0 ---

# Security: Mandatory Whitelist for destinations
WHITELIST = {
    "Tonstakers Pool": "EQD4lg74JzHLy6-IKnaJf8Fn69lrcE9UomXChth3I7C4fPea",
    "Alexey Wallet": "UQD0N8yc0UTIv84OKxkj4_j_59XlsH0yiHCWxu4BBFF5qIcH" # Master Wallet V5R1
}

LOG_FILE = "/root/.openclaw/workspace/scripts/finance/finance_ops.jsonl"
MNEMONIC = os.getenv("TON_MNEMONIC", "")

def log_op(op_type, data):
    entry = {
        "timestamp": datetime.now().isoformat(),
        "type": op_type,
        "data": data
    }
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")

def get_seqno(address):
    url = f"https://toncenter.com/api/v2/runGetMethod"
    payload = {
        "address": address,
        "method": "seqno",
        "stack": []
    }
    try:
        r = requests.post(url, json=payload, timeout=10)
        res = r.json()
        if res.get("ok"):
            return int(res["result"]["stack"][0][1], 16)
    except Exception as e:
        print(f"Seqno Fetch Error: {e}")
    return 0

async def send_ton(amount_ton, destination_name):
    if not MNEMONIC:
        return {"success": False, "error": "TON_MNEMONIC not set"}

    if destination_name not in WHITELIST:
        return {"success": False, "error": f"Address '{destination_name}' NOT in whitelist!"}

    target_address = WHITELIST[destination_name]
    
    # Initialize client
    client = ToncenterClient(base_url='https://toncenter.com/api/v2/', api_key='')
    
    # Initialize wallet
    mnemonics = MNEMONIC.split()
    res = Wallets.create(WalletVersionEnum.v4r2, workchain=0, mnemonics=mnemonics)
    wallet = res[3]
    
    seqno = get_seqno(wallet.address.to_string())
    transfer_amount = to_nano(amount_ton, 'ton')
    
    query = wallet.create_transfer_message(
        to_addr=target_address,
        amount=transfer_amount,
        seqno=seqno
    )
    
    log_op("TON_TRANSFER_INTENT", {"to": target_address, "name": destination_name, "amount": amount_ton})
    
    try:
        boc = query['boc'].to_boc(False)
        result = await client.send_boc(boc)
        log_op("TON_TRANSFER_SUCCESS", {"hash": result.get("hash")})
        return result
    except Exception as e:
        log_op("TON_TRANSFER_ERROR", {"error": str(e)})
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 ton_staker.py <amount> <destination_name_from_whitelist>")
        print(f"Available: {list(WHITELIST.keys())}")
        sys.exit(1)
        
    amount = float(sys.argv[1])
    dest = sys.argv[2]
    
    loop = asyncio.get_event_loop()
    res = loop.run_until_complete(send_ton(amount, dest))
    print(json.dumps(res, indent=2))
