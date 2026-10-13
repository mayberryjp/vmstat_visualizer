import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as service from "@/services/traffic";
import { useTrafficStore } from "@/stores/traffic";
import type { Device, TrafficDay } from "@/types/domain";

vi.mock("@/services/traffic");

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
    setActivePinia(createPinia());
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

    const store = useTrafficStore();
    await store.load();

    expect(store.groups.map((g) => g.key)).toEqual(["fw01|vtnet0", "fw02|em0"]);
    expect(store.groups[0]?.days.map((d) => d.day)).toEqual(["2026-10-11", "2026-10-12"]);
    expect(store.groups[0]?.sourceIp).toBe("10.9.9.9");
    expect(store.error).toBeNull();
  });

  it("builds favorites from the charts config order, titles and empty placeholders", async () => {
    vi.mocked(service.listDevices).mockResolvedValue([]);
    vi.mocked(service.listTraffic).mockResolvedValue([
      row("fw01", "vtnet0", "2026-10-12"),
      row("fw01", "vtnet1", "2026-10-12"),
      row("fw02", "em0", "2026-10-12"),
      row("fw03", "em1", "2026-10-12")
    ]);
    vi.mocked(service.listChartConfig).mockResolvedValue([
      { hostname: "fw02", interface: "em0", title: "Lab WAN" },
      { hostname: "fw01" },
      { hostname: "fw09", interface: "em9" }
    ]);

    const store = useTrafficStore();
    await store.load();

    expect(store.favorites.map((g) => g.key)).toEqual([
      "fw02|em0",
      "fw01|vtnet0",
      "fw01|vtnet1",
      "fw09|em9"
    ]);
    expect(store.favorites[0]?.title).toBe("Lab WAN");
    expect(store.favorites[3]?.days).toEqual([]);
    expect(store.hosts).toEqual(["fw01", "fw02", "fw03"]);
    expect(store.groups).toHaveLength(4);
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
