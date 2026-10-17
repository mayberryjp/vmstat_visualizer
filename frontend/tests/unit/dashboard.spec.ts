import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { VAutocomplete, VSelect } from "vuetify/components";
import AppHeader from "@/components/layout/AppHeader.vue";
import TrafficCard from "@/components/feature/TrafficCard.vue";
import vuetify from "@/plugins/vuetify";
import * as favoritesService from "@/services/favorites";
import * as trafficService from "@/services/traffic";
import { useTrafficStore } from "@/stores/traffic";
import HomeView from "@/views/HomeView.vue";

vi.mock("@/services/traffic");
vi.mock("@/services/favorites");

const favorites = [
  { hostname: "router", interface: "eth0" },
  { hostname: "router", interface: "eth1" }
];
const Dashboard = defineComponent({
  components: { AppHeader, HomeView },
  template: "<v-app><AppHeader /><v-main><HomeView /></v-main></v-app>"
});
let wrapper: VueWrapper;

async function mountDashboard() {
  wrapper = mount(Dashboard, {
    attachTo: document.body,
    global: { plugins: [createPinia(), vuetify], stubs: { TrafficChart: true, VSnackbar: true } }
  });
  await flushPromises();
  return wrapper;
}

function layoutSelect() {
  return wrapper.findAllComponents(VSelect).find((select) => select.props("label") === "Chart layout")!;
}

async function resize(width: number) {
  vi.stubGlobal("innerWidth", width);
  window.dispatchEvent(new Event("resize"));
  await flushPromises();
}

describe("dashboard layout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    setActivePinia(createPinia());
    vi.mocked(favoritesService.listFavorites).mockResolvedValue([...favorites]);
    vi.mocked(trafficService.listDevices).mockResolvedValue([]);
    vi.mocked(trafficService.listTrafficSummary).mockResolvedValue([]);
    vi.mocked(trafficService.listTraffic).mockResolvedValue(favorites.map((group) => ({
      ...group,
      source_ip: "10.0.0.1",
      day: "2026-10-17",
      rx_bytes: 1,
      tx_bytes: 2,
      total_bytes: 3,
      avg_rate_bps: 4,
      received_at: "2026-10-17T23:59:00"
    })));
  });

  afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.dispatchEvent(new Event("resize"));
  });

  it("defaults to fitting every favorite, with all controls in the header", async () => {
    await mountDashboard();

    expect(wrapper.find(".dashboard-page--fit").exists()).toBe(true);
    expect(wrapper.findAllComponents(TrafficCard).map((card) => card.props("fit"))).toEqual([true, true]);
    expect(wrapper.find(".chart-grid--fit").attributes("style")).toContain("grid-template-rows:");
    const header = wrapper.find("header");
    expect(header.findAll("input")).toHaveLength(3);
    for (const label of ["Host / Favorites", "Range", "Chart layout"]) {
      expect(header.text()).toContain(label);
    }
    expect(wrapper.find("main").findAll("input")).toHaveLength(0);
  });

  it("switches to rows and persists the selection across mounts", async () => {
    await mountDashboard();
    layoutSelect().vm.$emit("update:modelValue", "rows");
    await flushPromises();

    expect(wrapper.find(".dashboard-page--fit").exists()).toBe(false);
    expect(wrapper.find(".chart-grid--fit").exists()).toBe(false);
    expect(wrapper.findAllComponents(TrafficCard).every((card) => !card.props("fit"))).toBe(true);
    expect(localStorage.getItem("vnstat-chart-layout")).toBe("rows");

    wrapper.unmount();
    await mountDashboard();
    expect(layoutSelect().props("modelValue")).toBe("rows");
    layoutSelect().vm.$emit("update:modelValue", "fit");
    await flushPromises();
    expect(localStorage.getItem("vnstat-chart-layout")).toBe("fit");
  });

  it("uses rows on mobile and does not offer fit-to-page", async () => {
    await resize(390);
    await mountDashboard();

    expect(wrapper.find(".dashboard-page--fit").exists()).toBe(false);
    expect(wrapper.findAllComponents(TrafficCard).every((card) => !card.props("fit"))).toBe(true);
    expect(layoutSelect()).toBeUndefined();
    expect(localStorage.getItem("vnstat-chart-layout")).toBeNull();
  });

  it("only enables fit-to-page from 960px and preserves the desktop preference", async () => {
    localStorage.setItem("vnstat-chart-layout", "fit");
    await resize(959);
    await mountDashboard();
    expect(wrapper.find(".dashboard-page--fit").exists()).toBe(false);
    expect(layoutSelect()).toBeUndefined();
    expect(localStorage.getItem("vnstat-chart-layout")).toBe("fit");

    await resize(960);
    expect(wrapper.find(".dashboard-page--fit").exists()).toBe(true);
    expect(layoutSelect().props("modelValue")).toBe("fit");

    layoutSelect().vm.$emit("update:modelValue", "rows");
    await flushPromises();
    await resize(390);
    await resize(1440);
    expect(layoutSelect().props("modelValue")).toBe("rows");
    expect(wrapper.find(".dashboard-page--fit").exists()).toBe(false);
    expect(localStorage.getItem("vnstat-chart-layout")).toBe("rows");
  });

  it("keeps host filtering and range loading working in the header", async () => {
    await mountDashboard();
    const host = wrapper.findComponent(VAutocomplete);
    host.vm.$emit("update:modelValue", "host:router");
    await flushPromises();
    const iface = wrapper.findAllComponents(VSelect).find((select) => select.props("label") === "Interface")!;
    expect(wrapper.find("header").text()).toContain("Interface");
    iface.vm.$emit("update:modelValue", "eth1");
    await flushPromises();
    expect(wrapper.findAllComponents(TrafficCard).map((card) => card.props("group").interface)).toEqual(["eth1"]);

    const range = wrapper.findAllComponents(VSelect).find((select) => select.props("label") === "Range")!;
    range.vm.$emit("update:modelValue", 7);
    await flushPromises();
    expect(useTrafficStore().rangeDays).toBe(7);
    expect(trafficService.listTraffic).toHaveBeenCalledTimes(2);

    host.vm.$emit("update:modelValue", null);
    await flushPromises();
    expect(wrapper.findAllComponents(TrafficCard)).toHaveLength(2);
  });

  it("reports preference storage failures without blocking layout changes", async () => {
    await mountDashboard();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage disabled");
    });
    layoutSelect().vm.$emit("update:modelValue", "rows");
    await flushPromises();
    expect(wrapper.find(".dashboard-page--fit").exists()).toBe(false);
    expect(useTrafficStore().actionError).toBe("Unable to save the chart layout in this browser.");
  });
});
