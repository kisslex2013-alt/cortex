#!/bin/bash
# ═══════════════════════════════════════════════════════
# 🛡️ Soul Guard v1.0 — Immutable Identity Protection
# ═══════════════════════════════════════════════════════
# Prevents "Soul-Evil" attacks by making critical files immutable.
# Uses Linux chattr +i to prevent modification even by root.
#
# Usage:
#   ./soul_guard.sh --lock     Lock critical files (set immutable)
#   ./soul_guard.sh --unlock   Unlock for editing
#   ./soul_guard.sh --verify   Verify integrity via SHA256 hashes
#   ./soul_guard.sh --status   Show current lock status
#
# Recommended: Run --lock after each deployment
# ═══════════════════════════════════════════════════════

set -e

JARVIS_ROOT="${JARVIS_ROOT:-/root/.openclaw/workspace}"
HASH_FILE="${JARVIS_ROOT}/memory/.soul_hashes.sha256"
LOG_FILE="${JARVIS_ROOT}/memory/soul_guard.log"

# Critical files that must never be modified at runtime
# AUDIT-FIX-2026-02-18: Added SOUL.md and ROADMAP.md (VULN-SEC-001)
PROTECTED_FILES=(
    "${JARVIS_ROOT}/AGENTS_ANCHOR.md"
    "${JARVIS_ROOT}/SECURITY_DIRECTIVES.md"
    "${JARVIS_ROOT}/IDENTITY-FINGERPRINT.json"
    "${JARVIS_ROOT}/MEMORY.md"
    "${JARVIS_ROOT}/SOUL.md"
    "${JARVIS_ROOT}/ROADMAP.md"
)

DATE=$(date '+%Y-%m-%d %H:%M:%S')

log() {
    echo "[$DATE] $1" | tee -a "$LOG_FILE"
}

# ─── LOCK ────────────────────────────────────────────
cmd_lock() {
    log "🔒 Locking critical files..."
    
    local locked=0
    for file in "${PROTECTED_FILES[@]}"; do
        if [ -f "$file" ]; then
            chattr +i "$file" 2>/dev/null && {
                log "  ✅ Locked: $(basename $file)"
                locked=$((locked + 1))
            } || {
                log "  ⚠️ Cannot lock: $(basename $file) (need root?)"
            }
        else
            log "  ❌ Not found: $(basename $file)"
        fi
    done
    
    # Generate integrity hashes
    cmd_hash
    
    log "🔒 Soul Guard: $locked files locked"
}

# ─── UNLOCK ──────────────────────────────────────────
cmd_unlock() {
    log "🔓 Unlocking critical files for editing..."
    
    for file in "${PROTECTED_FILES[@]}"; do
        if [ -f "$file" ]; then
            chattr -i "$file" 2>/dev/null && {
                log "  🔓 Unlocked: $(basename $file)"
            } || {
                log "  ⚠️ Cannot unlock: $(basename $file)"
            }
        fi
    done
    
    log "⚠️ Files are now editable. Run --lock when done!"
}

# ─── GENERATE HASHES ─────────────────────────────────
cmd_hash() {
    log "🔐 Generating SHA256 integrity hashes..."
    
    > "$HASH_FILE"  # Clear previous hashes
    
    for file in "${PROTECTED_FILES[@]}"; do
        if [ -f "$file" ]; then
            sha256sum "$file" >> "$HASH_FILE"
        fi
    done
    
    # Protect the hash file itself
    chmod 400 "$HASH_FILE" 2>/dev/null
    log "  📝 Hashes saved to: $HASH_FILE"
}

# ─── VERIFY INTEGRITY ────────────────────────────────
cmd_verify() {
    log "🔍 Verifying file integrity..."
    
    if [ ! -f "$HASH_FILE" ]; then
        log "❌ No hash file found! Run --lock first."
        exit 1
    fi
    
    local tampered=0
    
    while IFS= read -r line; do
        expected_hash=$(echo "$line" | awk '{print $1}')
        file_path=$(echo "$line" | awk '{print $2}')
        
        if [ ! -f "$file_path" ]; then
            log "  ❌ MISSING: $file_path"
            tampered=$((tampered + 1))
            continue
        fi
        
        actual_hash=$(sha256sum "$file_path" | awk '{print $1}')
        
        if [ "$expected_hash" = "$actual_hash" ]; then
            log "  ✅ OK: $(basename $file_path)"
        else
            log "  🚨 TAMPERED: $(basename $file_path)"
            log "     Expected: $expected_hash"
            log "     Actual:   $actual_hash"
            tampered=$((tampered + 1))
        fi
    done < "$HASH_FILE"
    
    if [ $tampered -eq 0 ]; then
        log "🏆 INTEGRITY CHECK PASSED: All files intact."
    else
        log "🚨 INTEGRITY BREACH: $tampered file(s) tampered!"
        exit 2
    fi
}

# ─── STATUS ──────────────────────────────────────────
cmd_status() {
    log "📊 Soul Guard Status:"
    
    for file in "${PROTECTED_FILES[@]}"; do
        if [ -f "$file" ]; then
            attrs=$(lsattr "$file" 2>/dev/null | awk '{print $1}')
            name=$(basename "$file")
            
            if echo "$attrs" | grep -q 'i'; then
                log "  🔒 $name [IMMUTABLE]"
            else
                log "  🔓 $name [MUTABLE — VULNERABLE]"
            fi
        else
            log "  ❌ $name [NOT FOUND]"
        fi
    done
}

# ─── MAIN ────────────────────────────────────────────
case "${1:-}" in
    --lock)
        cmd_lock
        ;;
    --unlock)
        cmd_unlock
        ;;
    --verify)
        cmd_verify
        ;;
    --status)
        cmd_status
        ;;
    --hash)
        cmd_hash
        ;;
    *)
        echo "🛡️ Soul Guard v1.0 — Immutable Identity Protection"
        echo ""
        echo "Usage:"
        echo "  $0 --lock      Lock critical files (immutable)"
        echo "  $0 --unlock    Unlock for editing"
        echo "  $0 --verify    Verify integrity (SHA256)"
        echo "  $0 --status    Show lock status"
        echo ""
        echo "Protected files:"
        for f in "${PROTECTED_FILES[@]}"; do
            echo "  - $(basename $f)"
        done
        ;;
esac
