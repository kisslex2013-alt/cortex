
import window_art as wa
import time

def run_dashboard():
    with wa.run():
        # Main Container
        bg = wa.window(50, 50, 300, 400, color="#1a1a1a", text="JARVIS DASHBOARD v6.1.1")
        
        # Status Window
        status = wa.window(60, 100, 280, 50, color="#2ecc71", text="STATUS: ACTIVE")
        
        # Balance Window
        balance = wa.window(60, 160, 280, 100, color="#3498db", text=f"TON: 681.03")
        
        wa.wait(3600) # Keep alive for 1 hour

if __name__ == "__main__":
    run_dashboard()
