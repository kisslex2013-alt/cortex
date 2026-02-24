#!/bin/bash
METRICS_FILE="/var/lib/prometheus/node-exporter/jarvis.prom"

# Dummy metrics for testing
ACTIVE_AGENTS=$(ls -1 /tmp/agent_* 2>/dev/null | wc -l)
JARVIS_PROFIT="12.34"
JARVIS_STATUS="1" # 1 for OK, 0 for Error

cat <<EOF > "$METRICS_FILE.$$"
# HELP jarvis_active_agents Number of active sub-agents
# TYPE jarvis_active_agents gauge
jarvis_active_agents $ACTIVE_AGENTS

# HELP jarvis_profit_total Cumulative profit in USD
# TYPE jarvis_profit_total counter
jarvis_profit_total $JARVIS_PROFIT

# HELP jarvis_health_status Status of Jarvis 5.0 Core
# TYPE jarvis_health_status gauge
jarvis_health_status $JARVIS_STATUS
EOF

mv "$METRICS_FILE.$$" "$METRICS_FILE"
