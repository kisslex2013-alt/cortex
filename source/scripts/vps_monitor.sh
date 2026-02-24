#!/usr/bin/env bash
# VPS Health Monitor for Jarvis 2.0

echo "--- VPS STATUS REPORT ---"
echo "Timestamp: $(date)"
echo ""

echo "1. CPU & LOAD"
uptime | awk -F'load average:' '{ print "Load: " $2 }'
echo ""

echo "2. MEMORY USAGE"
free -h | awk 'NR==2{printf "Used: %s / Total: %s (%.2f%%)\n", $3, $2, $3*100/$2 }'
echo ""

echo "3. DISK SPACE"
df -h / | awk 'NR==2{printf "Used: %s / Free: %s (%s used)\n", $3, $4, $5}'
echo ""

echo "4. ACTIVE PROCESSES"
ps aux --sort=-%mem | head -n 5 | awk '{print $11 " - " $4 "% MEM"}'
echo ""

echo "5. NETWORK CONNECTIONS"
ss -tun | grep ESTAB | wc -l | awk '{print "Active Connections: " $1}'
