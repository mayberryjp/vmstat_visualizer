import { describe, expect, it } from "vitest";
import { formatBytes, isoDaysAgo } from "@/composables/useFormat";

describe("formatBytes", () => {
  it("formats using binary units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.00 KiB");
    expect(formatBytes(35113779)).toBe("33.5 MiB");
  });
});

describe("isoDaysAgo", () => {
  it("returns a local YYYY-MM-DD date", () => {
    expect(isoDaysAgo(30, new Date(2026, 9, 12))).toBe("2026-09-12");
  });
});
