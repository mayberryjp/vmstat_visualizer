#!/bin/sh
# Run daily at 23:59. Sends one datagram per interface: HOST|<vnstat --oneline output>

TARGET_IP="192.168.4.4"
TARGET_PORT="9999"
HOST=$(hostname)

# Bound every external call so a stuck vnstat/nc can never hang the job.
if command -v timeout >/dev/null 2>&1; then T="timeout 10"; else T=""; fi

if [ -d /sys/class/net ]; then
    INTERFACES=$(ls /sys/class/net | grep -Ev '^(lo|sit|tunl)')
else
    INTERFACES=$(ifconfig -l | tr ' ' '\n' | grep -Ev '^(lo|enc|pfsync|pflog)')
fi

for IFACE in $INTERFACES; do
    DATA=$($T vnstat --oneline -i "$IFACE" 2>/dev/null </dev/null) || continue
    case "$DATA" in
        1\;*) ;;
        *) continue ;;
    esac
    echo "$HOST|$DATA" | $T nc -u -w1 "$TARGET_IP" "$TARGET_PORT"
done
