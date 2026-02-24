#!/usr/bin/env python3
import os
import subprocess
import logging
from datetime import datetime

# --- Configuration ---
LOG_DIR = "/tmp/openclaw"
DOCTOR_LOG = "/root/.openclaw/workspace/scripts/survival/doctor.log"

logging.basicConfig(
    filename=DOCTOR_LOG,
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def get_last_logs(lines=100):
    today = datetime.now().strftime('%Y-%m-%d')
    log_file = os.path.join(LOG_DIR, f"openclaw-{today}.log")
    if not os.path.exists(log_file):
        return ""
    try:
        return subprocess.check_output(['tail', '-n', str(lines), log_file]).decode('utf-8')
    except:
        return ""

def diagnose():
    logs = get_last_logs()
    if not logs:
        return "NO_LOGS", "Could not read logs."

    if "MODULE_NOT_FOUND" in logs:
        return "MODULE_NOT_FOUND", "Missing npm dependencies."
    if "ENOSPC" in logs or "No space left on device" in logs:
        return "DISK_FULL", "No space left on device."
    if "SyntaxError" in logs and "openclaw.json" in logs:
        return "CORRUPTED_CONFIG", "openclaw.json is malformed."
    
    return "UNKNOWN", "Generic failure detected."

def apply_fix(issue_code):
    logging.info(f"Applying fix for: {issue_code}")
    
    if issue_code == "DISK_FULL":
        # Cleanup old logs
        subprocess.run("find /tmp/openclaw -name '*.log' -mtime +1 -delete", shell=True)
        return True
    
    if issue_code == "MODULE_NOT_FOUND":
        # Attempt npm install
        logging.warning("Attempting npm install...")
        # Note: This might be dangerous if paths are not correct
        # But we assume standard location
        return False # For now, just log it
        
    return False

def main():
    logging.info("AI Doctor called.")
    issue, desc = diagnose()
    logging.info(f"Diagnosis: {issue} - {desc}")
    
    if apply_fix(issue):
        logging.info("Fix applied successfully. Restarting gateway...")
        subprocess.run(["systemctl", "--user", "restart", "openclaw-gateway.service"])
    else:
        logging.error("Could not automatically fix the issue.")

if __name__ == "__main__":
    main()
