import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { isoDaysAgo } from "@/composables/useFormat";
import { describeError } from "@/services/errors";
import { listChartConfig, listDevices, listTraffic } from "@/services/traffic";
import type { ChartConfig, Device, DeviceGroup, TrafficDay } from "@/types/domain";

// Resolves the favorites list from the server's charts file; listed charts with no data stay visible.
function resolveFavorites(all: DeviceGroup[], charts: ChartConfig[] | null): DeviceGroup[] {
  if (!charts) return [];
  const out: DeviceGroup[] = [];
  const seen = new Set<string>();
  for (const chart of charts) {
    const matches = all.filter(
      (g) => g.hostname === chart.hostname && (!chart.interface || g.interface === chart.interface)
    );
    if (matches.length === 0 && chart.interface) {
      matches.push({
        key: `${chart.hostname}|${chart.interface}`,
        hostname: chart.hostname,
        interface: chart.interface,
        sourceIp: "",
        lastSeen: "",
        days: []
      });
    }
    for (const group of matches) {
      if (seen.has(group.key)) continue;
      seen.add(group.key);
      out.push(chart.interface && chart.title ? { ...group, title: chart.title } : group);
    }
  }
  return out;
}

export const useTrafficStore = defineStore("traffic", () => {
  const devices = ref<Device[]>([]);
  const traffic = ref<TrafficDay[]>([]);
  const chartConfig = ref<ChartConfig[] | null>(null);
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

  const favorites = computed(() => resolveFavorites(groups.value, chartConfig.value));

  const hosts = computed<string[]>(() => {
    const names = new Set<string>();
    for (const d of devices.value) names.add(d.hostname);
    for (const g of groups.value) names.add(g.hostname);
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const start = rangeDays.value > 0 ? isoDaysAgo(rangeDays.value) : undefined;
      const [deviceRows, trafficRows, charts] = await Promise.all([
        listDevices(),
        listTraffic(start),
        listChartConfig()
      ]);
      devices.value = deviceRows;
      traffic.value = trafficRows;
      chartConfig.value = charts;
    } catch (e) {
      error.value = describeError(e, "Failed to load traffic");
    } finally {
      loading.value = false;
    }
  }

  return { devices, traffic, rangeDays, groups, favorites, hosts, loading, error, load };
});
