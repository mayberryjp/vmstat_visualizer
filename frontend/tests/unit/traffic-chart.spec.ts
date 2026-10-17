import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import TrafficChart from "@/components/feature/TrafficChart.vue";
import vuetify from "@/plugins/vuetify";
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
});
