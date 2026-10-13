import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { isoDaysAgo } from "@/composables/useFormat";
import { describeError } from "@/services/errors";
import { listDevices, listTraffic } from "@/services/traffic";
import type { Device, DeviceGroup, TrafficDay } from "@/types/domain";

export const useTrafficStore = defineStore("traffic", () => {
  const devices = ref<Device[]>([]);
  const traffic = ref<TrafficDay[]>([]);
  // 0 means "all history".
  const rangeDays = ref(30);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const groups = computed<DeviceGroup[]>(() => {
    const byKey = new Map<string, DeviceGroup>();
    for (const row of traffic.value) {
      const key = `${row.hostname}|${row.interface}`;
      let group = byKey.get(key);
      if (!group) {
        group = {
          key,
          hostname: row.hostname,
          interface: row.interface,
          sourceIp: row.source_ip,
          lastSeen: row.received_at,
          days: []
        };
        byKey.set(key, group);
      }
      group.days.push(row);
    }
    for (const device of devices.value) {
      const group = byKey.get(`${device.hostname}|${device.interface}`);
      if (group) {
        group.sourceIp = device.source_ip;
        group.lastSeen = device.last_seen;
      }
    }
    for (const group of byKey.values()) {
      group.days.sort((a, b) => a.day.localeCompare(b.day));
    }
    return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  });

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const start = rangeDays.value > 0 ? isoDaysAgo(rangeDays.value) : undefined;
      const [deviceRows, trafficRows] = await Promise.all([listDevices(), listTraffic(start)]);
      devices.value = deviceRows;
      traffic.value = trafficRows;
    } catch (e) {
      error.value = describeError(e, "Failed to load traffic");
    } finally {
      loading.value = false;
    }
  }

  return { devices, traffic, rangeDays, groups, loading, error, load };
});
