#!/usr/bin/env python3
import requests
import psutil
import os
import time
import subprocess
import logging
from datetime import datetime

# --- JARVIS-WAL ASSH: Watchdog Sentinel v3.2.0 ---
# Hardened after the "150% CPU Signature Gap" incident.

GATEWAY_URL = "http://127.0.0.1:18789/status"
SERVICE_NAME = "openclaw-gateway.service"
LOG_DIR = "/tmp/openclaw"
MAX_LOG_SILENCE = 36000  # 5 minutes
MAX_PROCESS_MEMORY_MB = 1536   # 1.5 GB
MAX_SYSTEM_CPU_PERCENT = 95.0 # Max total system load
MIN_SYSTEM_FREE_RAM_MB = 100   # Emergency threshold
CHECK_INTERVAL = 60    # 1 minute

# AUDIT-FIX-2026-02-18: Restart throttling to prevent restart storms
MIN_RESTART_INTERVAL = 300   # 5 minutes between restarts
_last_restart_time = 0       # Timestamp of last restart

# Known dangerous processes that should never run indefinitely in background
ROGUE_PROCESS_NAMES = ["grep", "find", "python3", "node"]
MAX_ROGUE_RUNTIME_SEC = 3600 # 1 hour max for any single task process

# Setup Logging
LOG_PATH = '/root/.openclaw/workspace/scripts/survival/watchdog.log'
os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
logging.basicConfig(
    filename=LOG_PATH,
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

def get_gateway_pid():
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            cmdline = ' '.join(proc.info['cmdline'] or [])
            if 'openclaw-gateway' in cmdline or 'openclaw' in cmdline:
                if 'gateway' in cmdline:
                    return proc.info['pid']
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return None

def check_http_health():
    try:
        response = requests.get(GATEWAY_URL, timeout=10)
        return response.status_code == 200
    except Exception as e:
        logging.warning(f"HTTP health check failed: {e}")
    return False

def check_system_resources():
    cpu_load = psutil.cpu_percent(interval=1)
    ram_available = psutil.virtual_memory().available / (1024 * 1024)
    
    if cpu_load > MAX_SYSTEM_CPU_PERCENT:
        logging.critical(f"SYSTEM CPU CRITICAL: {cpu_load}%")
        return False, f"System CPU overload: {cpu_load}%"
    
    if ram_available < MIN_SYSTEM_FREE_RAM_MB:
        logging.critical(f"SYSTEM RAM CRITICAL: {ram_available}MB free")
        return False, f"System Out-Of-Memory risk: {ram_available}MB free"
        
    return True, None

def audit_rogue_processes():
    """Find and kill processes that exceed runtime or resource limits outside gateway."""
    for proc in psutil.process_iter(['pid', 'name', 'create_time', 'cpu_percent']):
        try:
            if proc.info['name'] in ROGUE_PROCESS_NAMES:
                runtime = time.time() - proc.info['create_time']
                # If a grep/find/python process is running > 1h and eating CPU, it's likely a zombie/stuck task
                if runtime > MAX_ROGUE_RUNTIME_SEC and proc.cpu_percent() > 50:
                    logging.warning(f"KILLING ROGUE PROCESS: {proc.info['name']} (PID {proc.info['pid']}) runtime: {runtime}s")
                    proc.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

def restart_service(reason):
    # AUDIT-FIX-2026-02-18: Throttle restarts to prevent restart storms
    global _last_restart_time
    now = time.time()
    if now - _last_restart_time < MIN_RESTART_INTERVAL:
        elapsed = int(now - _last_restart_time)
        logging.warning(f"RESTART THROTTLED ({elapsed}s < {MIN_RESTART_INTERVAL}s): {reason}")
        return
    
    _last_restart_time = now
    logging.critical(f"RESTARTING GATEWAY: {reason}")
    # Kill rogue processes before restarting to clear the path
    audit_rogue_processes()
    subprocess.run(["systemctl", "--user", "restart", SERVICE_NAME])
    lock_file = "/root/.openclaw/openclaw.lock"
    if os.path.exists(lock_file):
        os.remove(lock_file)

def main():
    logging.info("Watchdog Sentinel v3.2.0 active.")
    while True:
        # 1. Check System Level
        sys_ok, sys_reason = check_system_resources()
        if not sys_ok:
            restart_service(sys_reason)
            time.sleep(CHECK_INTERVAL * 2)
            continue

        # 2. Check Gateway Presence
        pid = get_gateway_pid()
        if not pid:
            logging.error("Gateway process not found.")
            restart_service("Process missing")
        else:
            # 3. Check Gateway Memory
            try:
                p = psutil.Process(pid)
                mem = p.memory_info().rss / (1024 * 1024)
                if mem > MAX_PROCESS_MEMORY_MB:
                    restart_service(f"Memory threshold exceeded: {mem:.2f} MB")
                
                # 4. Check HTTP Connectivity
                elif not check_http_health():
                    restart_service("API unresponsive")
            except psutil.NoSuchProcess:
                logging.error("Gateway vanished during check.")
                restart_service("Process vanished")
        
        # 5. Clean up background ghosts
        audit_rogue_processes()
        
        time.sleep(CHECK_INTERVAL)

if __name__ == "__main__":
    main()
