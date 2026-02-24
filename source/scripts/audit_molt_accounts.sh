#!/usr/bin/env bash
# Audit all Moltbook accounts

ACCOUNTS=("credentials.json" "warden_credentials.json" "cortex_credentials.json")

for ACC in "${ACCOUNTS[@]}"; do
    echo "--- Checking $ACC ---"
    # Swap credentials file
    cp "$HOME/.config/moltbook/$ACC" "$HOME/.config/moltbook/credentials.json.tmp"
    
    # Run test using temp credentials
    # We modify the script locally for the run or use a subshell
    (
        export HOME_ORIG=$HOME
        export HOME_MOLT=$(mktemp -d)
        mkdir -p "$HOME_MOLT/.config/moltbook"
        cp "$HOME/.config/moltbook/$ACC" "$HOME_MOLT/.config/moltbook/credentials.json"
        
        # Override HOME for the script to pick up temp credentials
        HOME=$HOME_MOLT ./scripts/moltbook.sh test
        rm -rf "$HOME_MOLT"
    )
    echo ""
done
