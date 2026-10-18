import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { VueDraggable } from "vue-draggable-plus";
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

function setInterfaces(names: string[]) {
  const items = names.map((name) => ({ hostname: "router", interface: name }));
  vi.mocked(favoritesService.listFavorites).mockResolvedValue(items);
  vi.mocked(trafficService.listTraffic).mockResolvedValue(items.map((group) => ({
    ...group,
    source_ip: "10.0.0.1",
    day: "2026-10-17",
    rx_bytes: 1,
    tx_bytes: 2,
    total_bytes: 3,
    avg_rate_bps: 4,
    received_at: "2026-10-17T23:59:00"
  })));
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

  it("hides common bridge names by default without hiding veth or unrelated names", async () => {
    const normal = ["eth0", "vethabc", "broadband0", "bravo0"];
    const bridges = ["br0", "br12", "br-abc", "br-lan", "bridge0", "docker0", "virbr1", "cni0", "lxcbr0", "vmbr3"];
    setInterfaces([...normal, ...bridges]);
    await mountDashboard();
    const shown = () => wrapper.findAllComponents(TrafficCard).map((card) => card.props("group").interface);
    const toggle = wrapper.find("header .bridge-toggle");
    expect(toggle.text()).toBe("Show bridge interfaces");
    expect(toggle.attributes("aria-pressed")).toBe("false");
    expect(shown()).toEqual(normal);

    await toggle.trigger("click");
    await flushPromises();
    expect(toggle.attributes("aria-pressed")).toBe("true");
    expect(shown()).toEqual([...normal, ...bridges]);
    await toggle.trigger("click");
    await flushPromises();
    expect(shown()).toEqual(normal);
    expect(favoritesService.saveFavoriteOrder).not.toHaveBeenCalled();
    expect(favoritesService.removeFavorite).not.toHaveBeenCalled();
  });

  it("filters host charts and interface options, resetting a bridge selection when hidden", async () => {
    setInterfaces(["eth0", "br0"]);
    vi.mocked(trafficService.listDevices).mockResolvedValue([{
      hostname: "router", interface: "bridge7", source_ip: "10.0.0.1", days: 1,
      first_day: "2026-10-17", last_day: "2026-10-17", last_seen: "2026-10-17T23:59:00"
    }]);
    await mountDashboard();
    wrapper.findComponent(VAutocomplete).vm.$emit("update:modelValue", "host:router");
    await flushPromises();
    const iface = wrapper.findAllComponents(VSelect).find((select) => select.props("label") === "Interface")!;
    expect(iface.props("items")).toEqual([
      { title: "All interfaces", value: "__all__" }, { title: "eth0", value: "eth0" }
    ]);
    expect(wrapper.findAllComponents(TrafficCard)).toHaveLength(1);

    await wrapper.find(".bridge-toggle").trigger("click");
    await flushPromises();
    expect(iface.props("items").map((item) => item.value)).toEqual(["__all__", "br0", "bridge7", "eth0"]);
    iface.vm.$emit("update:modelValue", "br0");
    await flushPromises();
    expect(wrapper.findAllComponents(TrafficCard)[0]!.props("group").interface).toBe("br0");
    await wrapper.find(".bridge-toggle").trigger("click");
    await flushPromises();
    expect(iface.props("modelValue")).toBe("__all__");
    expect(wrapper.findAllComponents(TrafficCard)[0]!.props("group").interface).toBe("eth0");
  });

  it("explains bridge-only empty views and exposes the toggle on mobile", async () => {
    await resize(390);
    setInterfaces(["br0"]);
    await mountDashboard();
    expect(wrapper.findAllComponents(TrafficCard)).toHaveLength(0);
    expect(wrapper.find("main").text()).toContain("Bridge interfaces are hidden.");
    await wrapper.find("header .bridge-toggle").trigger("click");
    await flushPromises();
    expect(wrapper.findAllComponents(TrafficCard)).toHaveLength(1);
    wrapper.findComponent(VAutocomplete).vm.$emit("update:modelValue", "host:router");
    await flushPromises();
    await wrapper.find(".bridge-toggle").trigger("click");
    await flushPromises();
    expect(wrapper.find("main").text()).toContain("Bridge interfaces are hidden.");
  });

  it("reorders visible favorites without losing hidden bridge favorites or their slots", async () => {
    setInterfaces(["eth0", "br0", "eth1"]);
    vi.mocked(favoritesService.saveFavoriteOrder).mockImplementation(async (items) => items);
    await mountDashboard();
    const reordered = wrapper.findAllComponents(TrafficCard).map((card) => card.props("group")).reverse();
    wrapper.findComponent(VueDraggable).vm.$emit("update:modelValue", reordered);
    await flushPromises();
    expect(favoritesService.saveFavoriteOrder).toHaveBeenCalledWith([
      { hostname: "router", interface: "eth1" },
      { hostname: "router", interface: "br0" },
      { hostname: "router", interface: "eth0" }
    ]);
    await wrapper.find(".bridge-toggle").trigger("click");
    await flushPromises();
    expect(wrapper.findAllComponents(TrafficCard).map((card) => card.props("group").interface))
      .toEqual(["eth1", "br0", "eth0"]);
  });

  it("hides an interface when any day has zero received OR sent bytes, even with other active days", async () => {
    setInterfaces(["good", "rx-zero", "tx-zero", "both-zero", "br0", "no-data"]);
    await mountDashboard();
    const store = useTrafficStore();
    store.traffic = store.traffic
      .filter((row) => row.interface !== "no-data")
      .flatMap((row) => [
        { ...row, day: "2026-10-16", rx_bytes: 100, tx_bytes: 200, total_bytes: 300 },
        {
          ...row,
          rx_bytes: ["rx-zero", "both-zero", "br0"].includes(row.interface) ? 0 : 10,
          tx_bytes: ["tx-zero", "both-zero"].includes(row.interface) ? 0 : 20,
          total_bytes: 30
        }
      ]);
    await flushPromises();
    const shown = () => wrapper.findAllComponents(TrafficCard).map((card) => card.props("group").interface);
    expect(shown()).toEqual(["good", "no-data"]);
    expect(wrapper.findAllComponents(TrafficCard)[1]!.props("group").days).toEqual([]);
    await wrapper.find(".bridge-toggle").trigger("click");
    await flushPromises();
    expect(shown()).toEqual(["good", "no-data"]);
    expect(favoritesService.removeFavorite).not.toHaveBeenCalled();
    expect(favoritesService.saveFavoriteOrder).not.toHaveBeenCalled();
  });

  it("reevaluates zero-byte filtering on range changes and removes device options without affecting other hosts", async () => {
    vi.mocked(trafficService.listDevices).mockResolvedValue(favorites.map((item) => ({
      ...item, source_ip: "10.0.0.1", days: 1,
      first_day: "2026-10-17", last_day: "2026-10-17", last_seen: "2026-10-17T23:59:00"
    })));
    await mountDashboard();
    wrapper.findComponent(VAutocomplete).vm.$emit("update:modelValue", "host:router");
    await flushPromises();
    const iface = wrapper.findAllComponents(VSelect).find((select) => select.props("label") === "Interface")!;
    iface.vm.$emit("update:modelValue", "eth1");
    await flushPromises();
    const originalRows = [...useTrafficStore().traffic];
    vi.mocked(trafficService.listTraffic).mockResolvedValue([
      ...originalRows.map((row) => ({ ...row, rx_bytes: row.interface === "eth1" ? 0 : row.rx_bytes })),
      { ...originalRows[1]!, hostname: "other" }
    ]);
    const range = wrapper.findAllComponents(VSelect).find((select) => select.props("label") === "Range")!;
    range.vm.$emit("update:modelValue", 7);
    await flushPromises();
    expect(iface.props("modelValue")).toBe("__all__");
    expect(iface.props("items").map((item) => item.value)).toEqual(["__all__", "eth0"]);
    expect(wrapper.findAllComponents(TrafficCard).map((card) => card.props("group").interface)).toEqual(["eth0"]);

    wrapper.findComponent(VAutocomplete).vm.$emit("update:modelValue", "host:other");
    await flushPromises();
    expect(wrapper.findAllComponents(TrafficCard).map((card) => card.props("group").interface)).toEqual(["eth1"]);

    vi.mocked(trafficService.listTraffic).mockResolvedValue(originalRows);
    range.vm.$emit("update:modelValue", 30);
    await flushPromises();
    wrapper.findComponent(VAutocomplete).vm.$emit("update:modelValue", "favorites");
    await flushPromises();
    expect(wrapper.findAllComponents(TrafficCard)).toHaveLength(2);
  });

  it("explains an empty zero-byte-filtered view and preserves hidden favorites during reordering", async () => {
    setInterfaces(["eth0", "idle", "eth1"]);
    vi.mocked(favoritesService.saveFavoriteOrder).mockImplementation(async (items) => items);
    await mountDashboard();
    const store = useTrafficStore();
    store.traffic = store.traffic.map((row) => ({ ...row, tx_bytes: row.interface === "idle" ? 0 : row.tx_bytes }));
    await flushPromises();
    const reordered = wrapper.findAllComponents(TrafficCard).map((card) => card.props("group")).reverse();
    wrapper.findComponent(VueDraggable).vm.$emit("update:modelValue", reordered);
    await flushPromises();
    expect(favoritesService.saveFavoriteOrder).toHaveBeenCalledWith([
      { hostname: "router", interface: "eth1" },
      { hostname: "router", interface: "idle" },
      { hostname: "router", interface: "eth0" }
    ]);
    store.traffic = store.traffic.map((row) => ({ ...row, rx_bytes: 0 }));
    await flushPromises();
    expect(wrapper.findAllComponents(TrafficCard)).toHaveLength(0);
    expect(wrapper.find("main").text()).toContain("0 received or 0 sent bytes on any day");
    wrapper.findComponent(VAutocomplete).vm.$emit("update:modelValue", "host:router");
    await flushPromises();
    expect(wrapper.find("main").text()).toContain("0 received or 0 sent bytes on any day");
  });

  it("sorts host charts by received plus sent totals, updates with the range, and leaves favorites unchanged", async () => {
    const savedOrder = ["eth3", "eth2", "eth0", "eth1"];
    setInterfaces(savedOrder);
    const summaries = [
      { hostname: "router", interface: "eth0", days: 1, rx_bytes: 100, tx_bytes: 10, total_bytes: 110 },
      { hostname: "router", interface: "eth1", days: 1, rx_bytes: 10, tx_bytes: 200, total_bytes: 210 },
      { hostname: "router", interface: "eth2", days: 1, rx_bytes: 150, tx_bytes: 60, total_bytes: 210 },
      { hostname: "router", interface: "eth3", days: 1, rx_bytes: 1, tx_bytes: 1, total_bytes: 2 }
    ];
    vi.mocked(trafficService.listTrafficSummary).mockResolvedValue(summaries);
    await mountDashboard();
    const shown = () => wrapper.findAllComponents(TrafficCard).map((card) => card.props("group").interface);
    expect(shown()).toEqual(savedOrder);
    const host = wrapper.findComponent(VAutocomplete);
    host.vm.$emit("update:modelValue", "host:router");
    await flushPromises();
    expect(shown()).toEqual(["eth1", "eth2", "eth0", "eth3"]);
    expect(useTrafficStore().groups.map((group) => group.interface)).toEqual(["eth0", "eth1", "eth2", "eth3"]);

    const iface = wrapper.findAllComponents(VSelect).find((select) => select.props("label") === "Interface")!;
    iface.vm.$emit("update:modelValue", "eth0");
    await flushPromises();
    expect(shown()).toEqual(["eth0"]);
    iface.vm.$emit("update:modelValue", "__all__");
    await resize(390);
    expect(shown()).toEqual(["eth1", "eth2", "eth0", "eth3"]);

    vi.mocked(trafficService.listTrafficSummary).mockResolvedValue(summaries.map((summary) =>
      summary.interface === "eth3" ? { ...summary, rx_bytes: 500, total_bytes: 501 } : summary
    ));
    const range = wrapper.findAllComponents(VSelect).find((select) => select.props("label") === "Range")!;
    range.vm.$emit("update:modelValue", 7);
    await flushPromises();
    expect(shown()).toEqual(["eth3", "eth1", "eth2", "eth0"]);

    host.vm.$emit("update:modelValue", "favorites");
    await flushPromises();
    expect(shown()).toEqual(savedOrder);
    expect(favoritesService.saveFavoriteOrder).not.toHaveBeenCalled();
  });
});
