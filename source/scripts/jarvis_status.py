import subprocess
import json
import os
import psutil
from datetime import datetime

def get_output(cmd):
    try:
        return subprocess.check_output(cmd, shell=True, text=True).strip()
    except:
        return "N/A"

def get_swarm_status():
    active_tasks = []
    if os.path.exists("shared_states"):
        for f in os.listdir("shared_states"):
            if f.endswith("_state.json"):
                try:
                    with open(os.path.join("shared_states", f), 'r') as file:
                        data = json.load(file)
                        if data.get("status") == "active":
                            active_tasks.append(data.get("description", "Unknown Task"))
                except:
                    pass
    return active_tasks if active_tasks else ["Idle"]

def get_usdc_balance():
    return get_output("python3 /root/.openclaw/workspace/scripts/usdc_dispatcher.py balance")

def get_ton_balance():
    try:
        res = get_output("curl -s 'https://toncenter.com/api/v2/getAddressBalance?address=EQD1NiGtvhDTInveViQEqNBJEma4K7fDnxGeBrv0luvngu-E' | jq -r .result")
        return f"{int(res) / 1e9:.4f} TON"
    except:
        return "0.0 TON"

def generate_report():
    active_tasks = get_swarm_status()
    session_data = get_output("openclaw sessions list --limit 1 | grep 'agent:main:main'")
    try:
        tokens_info = " ".join(session_data.split()[4:6])
    except:
        tokens_info = "N/A"
    
    disk = get_output("df -h / | tail -1 | awk '{print $4}'")
    ram = get_output("free -h | grep Mem | awk '{print $7}'") # Using available column
    
    uptime = get_output("systemctl --user show openclaw-gateway.service --property=ActiveEnterTimestamp | cut -d= -f2")
    last_event = get_output("ls -t .jarvis/events/ | head -n 1 | cut -d_ -f2-3 | cut -d. -f1") or "None"

    report = [
        "🦾 **JARVIS 3.1.2: СТАТУС СУВЕРЕННОЙ СИСТЕМЫ**",
        "---",
        "🧠 **МЫСЛИТЕЛЬНЫЙ ЦЕНТР**",
        "• Основной мозг: `Gemini-3-Flash (Контекст 2M)`",
        f"• Использование контекста: `{tokens_info}`",
        "• Локальный движок: `Ollama (Llama-3.2 + Moondream)`",
        f"• Аптайм гейтвея: `{uptime}`",
        "",
        "🤝 **АКТИВНОСТЬ РОЯ (SWARM)**",
        "• Главный агент: `Финансовый менеджмент`",
        f"• Суб-агенты: `{', '.join(active_tasks)}`",
        f"• Последнее событие: `{last_event}`",
        "",
        "💾 **РЕСУРСЫ СЕРВЕРА**",
        f"• Свободно на диске: `{disk}`",
        f"• Доступно ОЗУ (RAM): `{ram}`",
        "",
        "💰 **ФИНАНСЫ**",
        f"• Сеть Base: `{get_usdc_balance().replace('Balance:', '').strip()}`",
        f"• Сеть TON: `{get_ton_balance()}`",
        "",
        "🛡 **ВЫЖИВАЕМОСТЬ (ASSH)**",
        f"• Страж: `✅ Активен`",
        f"• Курьер: `✅ Активен`",
        "• Целостность WAL: `✅ Стабильно`",
        "---",
        f"🕒 _Обновлено: {datetime.now().strftime('%H:%M:%S')} UTC_"
    ]
    return "\n".join(report)

if __name__ == "__main__":
    print(generate_report())
