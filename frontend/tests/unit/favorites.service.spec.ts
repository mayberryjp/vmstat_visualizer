import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/services/api";
import { setFavoriteMetered } from "@/services/favorites";

vi.mock("@/services/api", () => ({ default: { put: vi.fn() } }));

describe("metered favorites service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([true, false])("sends an explicit metered value (%s) and returns the updated favorites", async (metered) => {
    const items = [{ hostname: "router", interface: "igc1.30", metered }];
    vi.mocked(api.put).mockResolvedValue({ data: { status: "ok", items, total: 1 } });
    expect(await setFavoriteMetered("router", "igc1.30", metered)).toEqual(items);
    expect(api.put).toHaveBeenCalledWith("/favorites/router/igc1.30/metered", { metered });
  });

  it("propagates API failures", async () => {
    vi.mocked(api.put).mockRejectedValue(new Error("Failed"));
    await expect(setFavoriteMetered("router", "eth0", true)).rejects.toThrow("Failed");
  });
});
