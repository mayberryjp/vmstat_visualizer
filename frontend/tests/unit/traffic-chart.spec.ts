import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import TrafficChart from "@/components/feature/TrafficChart.vue";
import vuetify from "@/plugins/vuetify";
import { findTrafficAnomalies } from "@/composables/useTrafficAnomalies";
import type { DeviceGroup } from "@/types/domain";

vi.mock("vue3-apexcharts", () => ({
  default: {
    name: "VueApexCharts",
    props: ["options", "width", "height", "series"],
    template: "<div />"
  }
}));

const group: DeviceGroup = {
  key: "router|eth0",
  hostname: "router",
  interface: "eth0",
  sourceIp: "10.0.0.1",
  lastSeen: "",
  totals: { rx_bytes: 1, tx_bytes: 2 },
  days: []
};

let observer: ChartResizeObserver;
let wrapper: VueWrapper;
class ChartResizeObserver implements ResizeObserver {
  target?: Element;
  disconnected = false;
  constructor(private callback: ResizeObserverCallback) {
    observer = this;
  }
  observe(target: Element) { this.target = target; }
  unobserve() {}
  disconnect() { this.disconnected = true; }
  resize(width: number, height: number) {
    if (!this.target) throw new Error("Chart container is not observed");
    this.callback([{
      target: this.target,
      contentRect: new DOMRect(0, 0, width, height),
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: []
    }], this);
  }
}

describe("chart sizing", () => {
  beforeEach(() => vi.stubGlobal("ResizeObserver", ChartResizeObserver));
  afterEach(() => {
    wrapper?.unmount();
    vi.unstubAllGlobals();
  });

  it("waits for the cell size, then updates exact chart dimensions as it resizes", async () => {
    wrapper = mount(TrafficChart, { props: { group, fit: true }, global: { plugins: [vuetify] } });
    expect(wrapper.findComponent({ name: "VueApexCharts" }).exists()).toBe(false);
    observer.resize(500.8, 240.5);
    await nextTick();
    let chart = wrapper.findComponent({ name: "VueApexCharts" });
    expect(chart.props("width")).toBe(500);
    expect(chart.props("height")).toBe(240);
    expect(chart.props("options").chart.sparkline.enabled).toBe(false);

    observer.resize(190.8, 75.5);
    await nextTick();
    chart = wrapper.findComponent({ name: "VueApexCharts" });
    expect(chart.props("width")).toBe(190);
    expect(chart.props("height")).toBe(75);
    expect(chart.props("options").chart.sparkline.enabled).toBe(true);
    expect(chart.props("options").responsive).toEqual([]);
    wrapper.unmount();
    expect(observer.disconnected).toBe(true);
  });

  it("preserves full-width, fixed-height charts in row layout", () => {
    wrapper = mount(TrafficChart, { props: { group }, global: { plugins: [vuetify] } });
    const chart = wrapper.findComponent({ name: "VueApexCharts" });
    expect(chart.props("width")).toBe("100%");
    expect(chart.props("height")).toBe(320);
    expect(chart.props("options").chart.sparkline.enabled).toBe(false);
    expect(chart.props("options").responsive).toHaveLength(1);
  });

  it("marks near-4 GB spikes in red with warnings independently for received and sent", async () => {
    const days = [10_000_000, 3_780_000_000, 20_000_000].map((rx_bytes, index) => ({
      hostname: "router", interface: "eth0", source_ip: "10.0.0.1", day: `2026-10-${20 + index}`,
      rx_bytes, tx_bytes: 10_000_000, total_bytes: rx_bytes + 10_000_000,
      avg_rate_bps: 1000, received_at: "2026-10-24T12:00:00"
    }));
    wrapper = mount(TrafficChart, { props: { group: { ...group, days } }, global: { plugins: [vuetify] } });
    const options = wrapper.findComponent({ name: "VueApexCharts" }).props("options");
    expect(options.markers.discrete).toEqual([
      expect.objectContaining({ seriesIndex: 0, dataPointIndex: 1, size: 7, fillColor: vuetify.theme.current.value.colors.error })
    ]);
    expect(options.annotations.points).toEqual([
      expect.objectContaining({ x: "2026-10-21", label: expect.objectContaining({ text: "!" }) })
    ]);
    expect(options.tooltip.y.formatter(3_780_000_000, { seriesIndex: 0, dataPointIndex: 1 })).toContain("Warning");
    expect(options.tooltip.y.formatter(10_000_000, { seriesIndex: 1, dataPointIndex: 1 })).not.toContain("Warning");
    await wrapper.setProps({ group: { ...group, days: days.map((day) => ({ ...day, rx_bytes: 10_000_000 })) } });
    expect(wrapper.findComponent({ name: "VueApexCharts" }).props("options").markers.discrete).toEqual([]);
  });

  it("handles threshold boundaries, zero baselines, and insufficient history", () => {
    const day = { hostname: "router", interface: "eth0", source_ip: "", received_at: "", avg_rate_bps: 0, total_bytes: 0 };
    const days = [10, 100, 10].map((rx_bytes, index) => ({ ...day, day: String(index), rx_bytes, tx_bytes: 0 }));
    expect([...findTrafficAnomalies(days).keys()]).toEqual(["1"]);
    expect(findTrafficAnomalies(days.map((row) => ({ ...row, rx_bytes: row.rx_bytes === 100 ? 99 : row.rx_bytes }))).size).toBe(0);
    expect(findTrafficAnomalies([days[1]!]).size).toBe(0);
    expect(findTrafficAnomalies(days.map((row) => ({ ...row, rx_bytes: 0 }))).size).toBe(0);
    expect([...findTrafficAnomalies(days.map((row, index) => ({ ...row, rx_bytes: 0, tx_bytes: index === 1 ? 10 : 0 }))).get("1")!]).toEqual(["tx_bytes"]);
  });
});
