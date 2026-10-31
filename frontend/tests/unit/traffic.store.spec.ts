import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    { now: new Date(2026, 10, 5), start: "2026-11-01", end: "2026-11-05" },
    { now: new Date(2026, 10, 15), start: "2026-11-01", end: "2026-11-15" },
    { now: new Date(2027, 0, 5), start: "2027-01-01", end: "2027-01-05" },
    { now: new Date(2028, 1, 29), start: "2028-02-01", end: "2028-02-29" },
    { now: new Date(2026, 11, 1), start: "2026-12-01", end: "2026-12-01" }
  ])("loads month-to-date totals bounded by $start and $end independently of chart range", async ({ now, start, end }) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    vi.mocked(service.listDevices).mockResolvedValue([]);
    vi.mocked(service.listTraffic).mockResolvedValue([row("fw01", "em0", end)]);
    vi.mocked(service.listTrafficSummary).mockImplementation(async (from, to) => [{
      hostname: "fw01", interface: "em0", days: 1,
      rx_bytes: from === start && to === end ? 150 : 10,
      tx_bytes: from === start && to === end ? 300 : 20,
      total_bytes: from === start && to === end ? 450 : 30
    }]);
    const store = useTrafficStore();
    for (const range of [7, 30, 90, 0]) {
      store.rangeDays = range;
      await store.load();
      expect(service.listTrafficSummary).toHaveBeenLastCalledWith(start, end);
      expect(store.groups[0]?.monthToDateTotals).toEqual({ rx_bytes: 150, tx_bytes: 300 });
      expect(store.groups[0]?.totals).toEqual({ rx_bytes: 10, tx_bytes: 20 });
      expect(store.groups[0]?.days).toHaveLength(1);
      expect(store.error).toBeNull();
    }
  });

  it("keeps month-to-date totals on favorite placeholders and uses zero for interfaces without monthly reports", async () => {
    vi.mocked(service.listDevices).mockResolvedValue([]);
    vi.mocked(service.listTraffic).mockResolvedValue([]);
    vi.mocked(favoritesService.listFavorites).mockResolvedValue([
      { hostname: "fw01", interface: "em0" },
      { hostname: "fw01", interface: "em1" }
    ]);
    vi.mocked(service.listTrafficSummary).mockImplementation(async (_start, end) => end ? [{
      hostname: "fw01", interface: "em0", days: 5, rx_bytes: 15, tx_bytes: 30, total_bytes: 45
    }] : []);
    const store = useTrafficStore();
    await store.load();
    expect(store.favoriteGroups[0]?.days).toEqual([]);
    expect(store.favoriteGroups[0]?.monthToDateTotals).toEqual({ rx_bytes: 15, tx_bytes: 30 });
    expect(store.favoriteGroups[1]?.monthToDateTotals).toEqual({ rx_bytes: 0, tx_bytes: 0 });
  });

  it("surfaces failures to load month-to-date totals", async () => {
    vi.mocked(service.listDevices).mockResolvedValue([]);
    vi.mocked(service.listTraffic).mockResolvedValue([]);
    vi.mocked(service.listTrafficSummary).mockImplementation(async (_start, end) => {
      if (end) throw new Error("Monthly summary unavailable");
      return [];
    });
    const store = useTrafficStore();
    await store.load();
    expect(store.error).toBe("Monthly summary unavailable");
    expect(store.loading).toBe(false);
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

  it("reports invalid device receipt timestamps instead of silently skipping the stale filter", async () => {
    vi.mocked(service.listDevices).mockResolvedValue([{
      hostname: "fw01", interface: "em0", source_ip: "10.0.0.1", days: 1,
      first_day: "2026-10-12", last_day: "2026-10-12", last_seen: "invalid"
    }]);
    vi.mocked(service.listTraffic).mockResolvedValue([]);
    const store = useTrafficStore();
    await store.load();
    expect(store.error).toBe("Invalid last report time for fw01 / em0.");
    expect(store.loading).toBe(false);
    expect(store.devices).toEqual([]);
  });
});
