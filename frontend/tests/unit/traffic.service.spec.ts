import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/services/api";
import { listTrafficSummary } from "@/services/traffic";

vi.mock("@/services/api", () => ({ default: { get: vi.fn() } }));

describe("traffic summary service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends both inclusive month-to-date bounds and returns the summary rows", async () => {
    const items = [{ hostname: "router", interface: "eth0", days: 5, rx_bytes: 15, tx_bytes: 30, total_bytes: 45 }];
    vi.mocked(api.get).mockResolvedValue({ data: { status: "ok", items, total: 1 } });
    expect(await listTrafficSummary("2026-11-01", "2026-11-05")).toEqual(items);
    expect(api.get).toHaveBeenCalledWith("/traffic/summary", {
      params: { start: "2026-11-01", end: "2026-11-05" }
    });
  });

  it("preserves start-only and all-history requests", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { status: "ok", items: [], total: 0 } });
    await listTrafficSummary("2026-10-01");
    expect(api.get).toHaveBeenLastCalledWith("/traffic/summary", { params: { start: "2026-10-01" } });
    await listTrafficSummary();
    expect(api.get).toHaveBeenLastCalledWith("/traffic/summary", { params: {} });
  });
});
