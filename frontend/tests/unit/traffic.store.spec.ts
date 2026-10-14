import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as favoritesService from "@/services/favorites";
import * as service from "@/services/traffic";
import { useTrafficStore } from "@/stores/traffic";
import type { Device, TrafficDay } from "@/types/domain";

vi.mock("@/services/traffic");
vi.mock("@/services/favorites");

function row(hostname: string, iface: string, day: string): TrafficDay {
  return {
    hostname,
    source_ip: "10.0.0.1",
    interface: iface,
    day,
    rx_bytes: 1,
    tx_bytes: 2,
    total_bytes: 3,
    avg_rate_bps: 4,
    received_at: `${day}T23:59:00`
  };
}

describe("traffic store", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setActivePinia(createPinia());
    vi.mocked(favoritesService.listFavorites).mockResolvedValue([]);
    vi.mocked(service.listTrafficSummary).mockResolvedValue([]);
  });

  it("groups rows per device and interface in day order", async () => {
    const device: Device = {
      hostname: "fw01",
      interface: "vtnet0",
      source_ip: "10.9.9.9",
      days: 2,
      first_day: "2026-10-11",
      last_day: "2026-10-12",
      last_seen: "2026-10-12T23:59:00"
    };
    vi.mocked(service.listDevices).mockResolvedValue([device]);
    vi.mocked(service.listTraffic).mockResolvedValue([
      row("fw01", "vtnet0", "2026-10-12"),
      row("fw01", "vtnet0", "2026-10-11"),
      row("fw02", "em0", "2026-10-12")
    ]);
    vi.mocked(service.listTrafficSummary).mockResolvedValue([
      { hostname: "fw01", interface: "vtnet0", days: 2, rx_bytes: 2, tx_bytes: 4, total_bytes: 6 }
    ]);

    const store = useTrafficStore();
    await store.load();

    expect(store.groups.map((g) => g.key)).toEqual(["fw01|vtnet0", "fw02|em0"]);
    expect(store.groups[0]?.totals).toEqual({ rx_bytes: 2, tx_bytes: 4 });
    expect(store.groups[0]?.days.map((d) => d.day)).toEqual(["2026-10-11", "2026-10-12"]);
    expect(store.groups[0]?.sourceIp).toBe("10.9.9.9");
    expect(store.error).toBeNull();
  });

  it("resolves favorites in saved order, with placeholders for ones without data", async () => {
    vi.mocked(service.listDevices).mockResolvedValue([]);
    vi.mocked(service.listTraffic).mockResolvedValue([
      row("fw01", "vtnet0", "2026-10-12"),
      row("fw02", "em0", "2026-10-12"),
      row("fw03", "em1", "2026-10-12")
    ]);
    vi.mocked(favoritesService.listFavorites).mockResolvedValue([
      { hostname: "fw02", interface: "em0" },
      { hostname: "fw09", interface: "em9" },
      { hostname: "fw01", interface: "vtnet0" }
    ]);

    const store = useTrafficStore();
    await store.load();

    expect(store.favoriteGroups.map((g) => g.key)).toEqual(["fw02|em0", "fw09|em9", "fw01|vtnet0"]);
    expect(store.favoriteGroups[1]?.days).toEqual([]);
    expect(store.hosts).toEqual(["fw01", "fw02", "fw03"]);
    expect(store.favoriteKeys.has("fw01|vtnet0")).toBe(true);
  });

  it("stars and unstars optimistically, rolling back when the API fails", async () => {
    vi.mocked(service.listDevices).mockResolvedValue([]);
    vi.mocked(service.listTraffic).mockResolvedValue([row("fw01", "vtnet0", "2026-10-12")]);
    const store = useTrafficStore();
    await store.load();
    const group = store.groups[0]!;

    vi.mocked(favoritesService.addFavorite).mockResolvedValue([
      { hostname: "fw01", interface: "vtnet0" }
    ]);
    await store.toggleFavorite(group);
    expect(store.favoriteKeys.has("fw01|vtnet0")).toBe(true);

    vi.mocked(favoritesService.removeFavorite).mockRejectedValue(new Error("nope"));
    await store.toggleFavorite(group);
    expect(store.favoriteKeys.has("fw01|vtnet0")).toBe(true);
    expect(store.actionError).toBe("nope");
  });

  it("reorders favorites and persists the new order", async () => {
    vi.mocked(service.listDevices).mockResolvedValue([]);
    vi.mocked(service.listTraffic).mockResolvedValue([]);
    vi.mocked(favoritesService.listFavorites).mockResolvedValue([
      { hostname: "a", interface: "x" },
      { hostname: "b", interface: "y" }
    ]);
    vi.mocked(favoritesService.saveFavoriteOrder).mockImplementation(async (items) => items);
    const store = useTrafficStore();
    await store.load();

    await store.reorderFavorites(["b|y", "a|x"]);

    expect(store.favoriteGroups.map((g) => g.key)).toEqual(["b|y", "a|x"]);
    expect(favoritesService.saveFavoriteOrder).toHaveBeenCalledWith([
      { hostname: "b", interface: "y" },
      { hostname: "a", interface: "x" }
    ]);
  });

  it("exposes an error message when loading fails", async () => {
    vi.mocked(service.listDevices).mockRejectedValue(new Error("boom"));
    vi.mocked(service.listTraffic).mockResolvedValue([]);

    const store = useTrafficStore();
    await store.load();

    expect(store.error).toBe("boom");
    expect(store.loading).toBe(false);
  });
});
