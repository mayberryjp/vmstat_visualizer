import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { isoDaysAgo } from "@/composables/useFormat";
import { describeError } from "@/services/errors";
import { listFavorites, removeFavorite, addFavorite, saveFavoriteOrder } from "@/services/favorites";
import { listDevices, listTraffic, listTrafficSummary } from "@/services/traffic";
import type { Device, DeviceGroup, Favorite, TrafficDay, TrafficSummary } from "@/types/domain";

function keyOf(item: Favorite): string {
  return `${item.hostname}|${item.interface}`;
}

// Favorites with no data in the range still get a placeholder so they can be unstarred.
function resolveFavorites(all: DeviceGroup[], favorites: Favorite[]): DeviceGroup[] {
  const byKey = new Map(all.map((g) => [g.key, g]));
  return favorites.map(
    (f) =>
      byKey.get(keyOf(f)) ?? {
        key: keyOf(f),
        hostname: f.hostname,
        interface: f.interface,
        sourceIp: "",
        lastSeen: "",
        days: [],
        totals: { rx_bytes: 0, tx_bytes: 0 }
      }
  );
}

export const useTrafficStore = defineStore("traffic", () => {
  const devices = ref<Device[]>([]);
  const traffic = ref<TrafficDay[]>([]);
  const summaries = ref<TrafficSummary[]>([]);
  const favorites = ref<Favorite[]>([]);
  // 0 means "all history".
  const rangeDays = ref(30);
  const loading = ref(false);
  const error = ref<string | null>(null);
  // Failures of star/reorder actions; the page stays usable, so this is separate from `error`.
  const actionError = ref<string | null>(null);

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
          days: [],
          totals: { rx_bytes: 0, tx_bytes: 0 }
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
    for (const s of summaries.value) {
      const group = byKey.get(`${s.hostname}|${s.interface}`);
      if (group) group.totals = { rx_bytes: s.rx_bytes, tx_bytes: s.tx_bytes };
    }
    for (const group of byKey.values()) {
      group.days.sort((a, b) => a.day.localeCompare(b.day));
    }
    return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  });

  const favoriteGroups = computed(() => resolveFavorites(groups.value, favorites.value));
  const favoriteKeys = computed(() => new Set(favorites.value.map(keyOf)));

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
      const [deviceRows, trafficRows, summaryRows, favoriteRows] = await Promise.all([
        listDevices(),
        listTraffic(start),
        listTrafficSummary(start),
        listFavorites()
      ]);
      devices.value = deviceRows;
      traffic.value = trafficRows;
      summaries.value = summaryRows;
      favorites.value = favoriteRows;
    } catch (e) {
      error.value = describeError(e, "Failed to load traffic");
    } finally {
      loading.value = false;
    }
  }

  async function toggleFavorite(group: DeviceGroup): Promise<void> {
    const previous = favorites.value;
    const starred = favoriteKeys.value.has(group.key);
    const target: Favorite = { hostname: group.hostname, interface: group.interface };
    favorites.value = starred
      ? previous.filter((f) => keyOf(f) !== group.key)
      : [...previous, target];
    actionError.value = null;
    try {
      favorites.value = starred
        ? await removeFavorite(target.hostname, target.interface)
        : await addFavorite(target.hostname, target.interface);
    } catch (e) {
      favorites.value = previous;
      actionError.value = describeError(e, "Failed to update favorite");
    }
  }

  async function reorderFavorites(keys: string[]): Promise<void> {
    const previous = favorites.value;
    const byKey = new Map(previous.map((f) => [keyOf(f), f]));
    favorites.value = keys.flatMap((k) => byKey.get(k) ?? []);
    actionError.value = null;
    try {
      favorites.value = await saveFavoriteOrder(favorites.value);
    } catch (e) {
      favorites.value = previous;
      actionError.value = describeError(e, "Failed to save favorite order");
    }
  }

  return {
    devices,
    traffic,
    rangeDays,
    groups,
    favoriteGroups,
    favoriteKeys,
    hosts,
    loading,
    error,
    actionError,
    load,
    toggleFavorite,
    reorderFavorites
  };
});
