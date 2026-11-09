#!/bin/bash
SERVER_URL="${SERVER_URL:-https://localhost:6000/api/report}"
SECRET_TOKEN="${SECRET_TOKEN:-YOUR_AGENT_SECRET_TOKEN}"
NODE_ID="${NODE_ID:-vps-1}"
NODE_NAME="${NODE_NAME:-Default Node}"
INTERFACE="${INTERFACE:-eth0}"
CACHE_TTL="${IP_CACHE_TTL:-300}" # 默认 300 秒，支持从环境变量读取

CACHE_FILE="/tmp/agent_ip_cache.env"
CURRENT_TIME=$(date +%s)
NEEDS_REFRESH=false

if [ -f "$CACHE_FILE" ]; then
    source "$CACHE_FILE"
    if [ $((CURRENT_TIME - LAST_CHECK_TIME)) -gt $CACHE_TTL ]; then
        NEEDS_REFRESH=true
    fi
else
    NEEDS_REFRESH=true
fi

if [ "$NEEDS_REFRESH" = true ]; then
    NEW_IPV4=$(curl -s4 --max-time 3 https://api.ipify.org || hostname -I | awk '{print $1}')
    NEW_IPV6=$(curl -s6 --max-time 3 https://api6.ipify.org || echo "")
    
    if [ -n "$NEW_IPV4" ]; then
        echo "CACHED_IPV4=\"$NEW_IPV4\"" > "$CACHE_FILE"
        echo "CACHED_IPV6=\"$NEW_IPV6\"" >> "$CACHE_FILE"
        echo "LAST_CHECK_TIME=$CURRENT_TIME" >> "$CACHE_FILE"
    fi
fi

if [ -f "$CACHE_FILE" ]; then
    source "$CACHE_FILE"
fi

IPV4="${CACHED_IPV4:-N/A}"
IPV6="${CACHED_IPV6:-}"

# --- 后续的 CPU、内存、网速采集与上报代码保持原样 ---
CPU_CORES=$(nproc)

PREV_TOTAL=0
PREV_IDLE=0
if [ -f /tmp/cpu_stat ]; then
    read PREV_TOTAL PREV_IDLE < /tmp/cpu_stat
fi
CPU_LINE=$(grep '^cpu ' /proc/stat)
USER=$(echo $CPU_LINE | awk '{print $2}')
NICE=$(echo $CPU_LINE | awk '{print $3}')
SYSTEM=$(echo $CPU_LINE | awk '{print $4}')
IDLE=$(echo $CPU_LINE | awk '{print $5}')
TOTAL=$((USER + NICE + SYSTEM + IDLE))
DIFF_IDLE=$((IDLE - PREV_IDLE))
DIFF_TOTAL=$((TOTAL - PREV_TOTAL))
if [ $DIFF_TOTAL -gt 0 ]; then
    CPU_USAGE=$(awk "BEGIN {print 100 * ($DIFF_TOTAL - $DIFF_IDLE) / $DIFF_TOTAL}")
else
    CPU_USAGE=0
fi
echo "$TOTAL $IDLE" > /tmp/cpu_stat

RAM_TOTAL=$(awk '/MemTotal:/ {printf "%.2f", $2/1024/1024}' /proc/meminfo)
RAM_FREE=$(awk '/MemAvailable:/ {printf "%.2f", $2/1024/1024}' /proc/meminfo)
RAM_USED=$(awk "BEGIN {print $RAM_TOTAL - $RAM_FREE}")

DISK_TOTAL=$(df /host_root | awk 'NR==2 {printf "%.2f", $2/1024/1024}')
DISK_USED=$(df /host_root | awk 'NR==2 {printf "%.2f", $3/1024/1024}')
LOAD_1=$(awk '{print $1}' /proc/loadavg)
LOAD_5=$(awk '{print $2}' /proc/loadavg)
LOAD_15=$(awk '{print $3}' /proc/loadavg)

UPTIME_SEC=$(awk '{print int($1)}' /proc/uptime)
DAYS=$((UPTIME_SEC / 86400))
HOURS=$(((UPTIME_SEC % 86400) / 3600))
MINS=$(((UPTIME_SEC % 3600) / 60))

if [ $DAYS -gt 0 ]; then
    UPTIME="${DAYS}d ${HOURS}h ${MINS}m"
elif [ $HOURS -gt 0 ]; then
    UPTIME="${HOURS}h ${MINS}m"
else
    UPTIME="${MINS}m"
fi

read RX1 TX1 < <(awk -v iface="$INTERFACE" '$1 ~ iface":" {print $2, $10}' /proc/net/dev)
sleep 1
read RX2 TX2 < <(awk -v iface="$INTERFACE" '$1 ~ iface":" {print $2, $10}' /proc/net/dev)

NET_DOWN_SPEED=$(awk "BEGIN {print ($RX2 - $RX1)/1024/1024}")
NET_UP_SPEED=$(awk "BEGIN {print ($TX2 - $TX1)/1024/1024}")
TOTAL_RECV=$(awk "BEGIN {print $RX2/1024/1024/1024}")
TOTAL_SENT=$(awk "BEGIN {print $TX2/1024/1024/1024}")

payload=$(cat <<EOF
{
  "id": "$NODE_ID",
  "name": "$NODE_NAME",
  "ipv4": "$IPV4",
  "ipv6": "$IPV6",
  "v4Status": true,
  "v6Status": $([ -n "$IPV6" ] && echo "true" || echo "null"),
  "cpuCores": $CPU_CORES,
  "cpuUsage": ${CPU_USAGE:-0},
  "ramUsed": ${RAM_USED:-0},
  "ramTotal": ${RAM_TOTAL:-1},
  "diskUsed": ${DISK_USED:-0},
  "diskTotal": ${DISK_TOTAL:-1},
  "uptime": "$UPTIME",
  "load": [$LOAD_1, $LOAD_5, $LOAD_15],
  "netUpSpeed": ${NET_UP_SPEED:-0},
  "netDownSpeed": ${NET_DOWN_SPEED:-0},
  "totalSent": ${TOTAL_SENT:-0},
  "totalRecv": ${TOTAL_RECV:-0}
}
EOF
)

curl -s -X POST "$SERVER_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SECRET_TOKEN" \
  -d "$payload" > /dev/null