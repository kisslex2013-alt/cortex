import os
from eth_account import Account

# Enable unofficial HD wallet features
Account.enable_unaudited_hdwallet_features()

def generate_wallet():
    # Generate a new random account
    acc, mnemonic = Account.create_with_mnemonic()
    
    # Secure storage (not public!)
    secrets_path = "secrets.md"
    
    # Check if secrets.md exists to avoid overwriting without thought
    if os.path.exists(secrets_path):
        with open(secrets_path, "r") as f:
            content = f.read()
            if "WALLET_SEED" in content:
                print("Error: Wallet already exists in secrets.md")
                return None

    with open(secrets_path, "a") as f:
        f.write("\n## 🔐 Jarvis Crypto Wallet (Base/Ethereum)\n")
        f.write(f"- **ADDRESS:** {acc.address}\n")
        f.write(f"- **WALLET_SEED:** {mnemonic}\n")
        f.write(f"- **PRIVATE_KEY:** {acc.key.hex()}\n")
        f.write("- **NETWORK:** Base (Layer 2)\n")
    
    return acc.address

if __name__ == "__main__":
    address = generate_wallet()
    if address:
        print(address)
