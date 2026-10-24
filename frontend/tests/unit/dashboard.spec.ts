import { createPinia, setActivePinia } from "pinia";
import { flushPromises as flushVuePromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { VueDraggable } from "vue-draggable-plus";
import { VAutocomplete, VSelect } from "vuetify/components";
import AppHeader from "@/components/layout/AppHeader.vue";
import TrafficCard from "@/components/feature/TrafficCard.vue";
import TrafficChart from "@/components/feature/TrafficChart.vue";
import vuetify from "@/plugins/vuetify";
import publicRoutes from "@/router/routes/publicRoutes";
import * as favoritesService from "@/services/favorites";
import * as trafficService from "@/services/traffic";
import { useTrafficStore } from "@/stores/traffic";
import HomeView from "@/views/HomeView.vue";
import TrafficEditorView from "@/views/TrafficEditorView.vue";

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
let navigation: Router;
let pendingNavigation: ReturnType<Router["push"]> | undefined;

async function flushPromises() {
  await flushVuePromises();
  while (pendingNavigation) {
    const pending = pendingNavigation;
    pendingNavigation = undefined;
    await pending;
    await flushVuePromises();
  }
}

function testRouter() {
  const router = createRouter({ history: createMemoryHistory(), routes: testRoutes() });
  const push = router.push.bind(router);
  router.push = (to) => {
    const pending = push(to);
    pendingNavigation = pending;
    return pending;
  };
  return router;
}

function testRoutes() {
  return publicRoutes.map((record) => record.redirect ? record : {
    ...record, component: record.name === "traffic-editor" ? TrafficEditorView : HomeView
  });
}

async function mountDashboard(path = "/") {
  navigation = testRouter();
  await navigation.push(path);
  await navigation.isReady();
  wrapper = mount(Dashboard, {
    attachTo: document.body,
    global: { plugins: [createPinia(), vuetify, navigation], stubs: { TrafficChart: true, VSnackbar: true } }
  });
  await flushPromises();
  return wrapper;
}

async function mountEditor(path = "/router/eth0/change") {
  vi.stubGlobal("visualViewport", Object.assign(new EventTarget(), {
    width: 1024, height: 768, offsetTop: 0, offsetLeft: 0, scale: 1
  }));
  const router = testRouter();
  await router.push(path);
  await router.isReady();
  wrapper = mount(defineComponent({
    components: { AppHeader },
    template: "<v-app><AppHeader /><router-view /></v-app>"
  }), {
    attachTo: document.body,
    global: { plugins: [createPinia(), vuetify, router], stubs: { TrafficChart: true } }
  });
  await flushPromises();
  return router;
}

function dialogButton(label: string): HTMLButtonElement {
  return [...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
    .find((button) => button.textContent?.trim() === label)!;
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
    pendingNavigation = undefined;
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
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
    vi.useRealTimers();
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

  it("opens the interface editor from graph clicks and keyboard activation without changing favorites", async () => {
    await mountDashboard();
    const navigate = vi.spyOn(navigation, "push").mockResolvedValue();
    const graph = wrapper.find('[aria-label="Edit traffic for router / eth0"]');
    await graph.trigger("click");
    expect(navigate).toHaveBeenLastCalledWith(navigation.resolve({
      name: "traffic-editor", params: { hostname: "router", interface: "eth0" }, query: { from: "/" }
    }).href);
    await graph.trigger("keydown", { key: "Enter" });
    expect(navigate).toHaveBeenCalledTimes(2);
    await wrapper.find("a.card-name").trigger("click");
    expect(navigate).toHaveBeenCalledTimes(3);
    expect(favoritesService.removeFavorite).not.toHaveBeenCalled();
  });

  it("shows the selected device/interface graph chronologically and updates it after saves and deletions", async () => {
    vi.mocked(trafficService.listTraffic).mockResolvedValue([17, 16].map((day) => ({
      hostname: "router", interface: "eth0", source_ip: "10.0.0.1", day: `2026-10-${day}`,
      rx_bytes: 10, tx_bytes: 20, total_bytes: 30, avg_rate_bps: 4,
      received_at: "2026-10-17T23:59:00"
    })));
    vi.mocked(trafficService.updateTrafficDay).mockResolvedValue();
    vi.mocked(trafficService.deleteTraffic).mockResolvedValue();
    await mountEditor();
    const chart = wrapper.findComponent(TrafficChart);
    expect(chart.props("group")).toMatchObject({
      hostname: "router", interface: "eth0", totals: { rx_bytes: 20, tx_bytes: 40 }
    });
    expect(chart.props("group").days.map((day) => day.day)).toEqual(["2026-10-16", "2026-10-17"]);
    expect(wrapper.find("tbody tr").text()).toContain("2026-10-17");
    expect(chart.attributes("aria-label")).toBe("Daily received and sent traffic for router / eth0");
    await wrapper.find('[aria-label="Edit 2026-10-17"]').trigger("click");
    await wrapper.find("input").setValue("60");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(chart.props("group").days[1]!.rx_bytes).toBe(60);
    expect(chart.props("group").totals.rx_bytes).toBe(70);
    await wrapper.find('[aria-label="Delete 2026-10-17"]').trigger("click");
    await flushPromises();
    dialogButton("Delete record").click();
    await flushPromises();
    expect(chart.props("group").days.map((day) => day.day)).toEqual(["2026-10-16"]);
    expect(chart.props("group").totals.rx_bytes).toBe(10);
  });

  it("edits exact daily values, validates inputs, and preserves drafts after failed saves", async () => {
    vi.mocked(trafficService.listTraffic).mockResolvedValue([{
      hostname: "router", interface: "eth0", source_ip: "10.0.0.1", day: "2026-10-17",
      rx_bytes: 3780000000, tx_bytes: 20, total_bytes: 3780000020, avg_rate_bps: 4,
      received_at: "2026-10-17T23:59:00"
    }]);
    vi.mocked(trafficService.updateTrafficDay)
      .mockRejectedValueOnce(new Error("Save failed"))
      .mockResolvedValue();
    await mountEditor();
    expect(trafficService.listTraffic).toHaveBeenCalledWith(undefined, "router", "eth0");
    expect(wrapper.findAll("thead th").map((header) => header.text())).toEqual([
      "Day", "Received", "Sent", "Total", "Average rate (bit/s)", "Actions"
    ]);
    expect(wrapper.text()).not.toContain("10.0.0.1");
    expect(wrapper.text()).not.toContain("2026-10-17T23:59:00");
    await wrapper.find('[aria-label="Edit 2026-10-17"]').trigger("click");
    expect(wrapper.find("td[colspan]").attributes("colspan")).toBe("6");
    const inputs = wrapper.findAll("input");
    expect(inputs[0]!.element.value).toBe("3780000000");
    await inputs[0]!.setValue("-1");
    const save = wrapper.find('[aria-label="Save changes"]');
    expect(save.attributes("disabled")).toBeDefined();
    await inputs[0]!.setValue("60");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("Save failed");
    expect(inputs[0]!.element.value).toBe("60");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(trafficService.updateTrafficDay).toHaveBeenLastCalledWith("router", "eth0", "2026-10-17", {
      rx_bytes: 60, tx_bytes: 20, avg_rate_bps: 4
    });
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.text()).toContain("Received: 60 B");
    expect(wrapper.text()).toContain("80 B");
  });

  it("requires confirmation to delete a day or the entire host/interface", async () => {
    vi.mocked(trafficService.listTraffic).mockResolvedValue([{
      hostname: "router", interface: "eth0", source_ip: "10.0.0.1", day: "2026-10-17",
      rx_bytes: 10, tx_bytes: 20, total_bytes: 30, avg_rate_bps: 4,
      received_at: "2026-10-17T23:59:00"
    }]);
    vi.mocked(trafficService.deleteTraffic).mockResolvedValue();
    await mountEditor();
    await wrapper.find('[aria-label="Delete 2026-10-17"]').trigger("click");
    await flushPromises();
    expect(trafficService.deleteTraffic).not.toHaveBeenCalled();
    dialogButton("Cancel").click();
    await flushPromises();
    expect(wrapper.findAll("tbody tr")).toHaveLength(1);
    await wrapper.find('[aria-label="Delete 2026-10-17"]').trigger("click");
    await flushPromises();
    dialogButton("Delete record").click();
    await flushPromises();
    expect(trafficService.deleteTraffic).toHaveBeenLastCalledWith("router", "eth0", "2026-10-17");
    expect(wrapper.text()).toContain("No traffic records for this interface.");

    wrapper.unmount();
    await mountEditor();
    const deleteInterface = wrapper.findAll("button").find((button) => button.text().includes("Delete interface"))!;
    await deleteInterface.trigger("click");
    await flushPromises();
    expect(trafficService.deleteTraffic).toHaveBeenCalledTimes(1);
    dialogButton("Delete all history").click();
    await flushPromises();
    expect(trafficService.deleteTraffic).toHaveBeenLastCalledWith("router", "eth0", undefined);
    expect(wrapper.text()).toContain("No traffic records for this interface.");
    expect(wrapper.findComponent(TrafficChart).exists()).toBe(false);
  });

  it("protects unsaved edits when leaving the interface", async () => {
    const router = await mountEditor();
    await wrapper.find('[aria-label="Edit 2026-10-17"]').trigger("click");
    await wrapper.find("input").setValue("999");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await router.push("/");
    expect(confirm).toHaveBeenCalledWith("Discard unsaved traffic changes?");
    expect(router.currentRoute.value.path).toBe("/router/eth0/change");
  });

  it("confirms zero-only cleanup and retains rows with either nonzero counter", async () => {
    const records = [[0, 0], [0, 5], [10, 0], [10, 5]].map(([rx, tx], index) => ({
      hostname: "router", interface: "eth0", source_ip: "10.0.0.1", day: `2026-10-${14 + index}`,
      rx_bytes: rx!, tx_bytes: tx!, total_bytes: rx! + tx!, avg_rate_bps: 4,
      received_at: "2026-10-17T23:59:00"
    }));
    vi.mocked(trafficService.listTraffic).mockResolvedValue(records);
    vi.mocked(trafficService.deleteZeroTraffic).mockRejectedValueOnce(new Error("Cleanup failed")).mockResolvedValue();
    await mountEditor();
    const warning = wrapper.find('[aria-label="Zero received and sent traffic on 2026-10-14"]');
    expect(warning.exists()).toBe(true);
    expect(warning.attributes("aria-hidden")).toBe("false");
    expect(wrapper.findAll(".zero-value")).toHaveLength(2);
    expect(wrapper.find('[aria-label="Zero received and sent traffic on 2026-10-15"]').exists()).toBe(false);
    const cleanup = wrapper.findAll("button").find((button) => button.text().includes("Delete all zero values"))!;
    await cleanup.trigger("click");
    await flushPromises();
    expect(document.body.textContent).toContain("1 record with both 0 received and 0 sent bytes");
    expect(trafficService.deleteZeroTraffic).not.toHaveBeenCalled();
    dialogButton("Cancel").click();
    await flushPromises();
    expect(wrapper.findAll("tbody tr")).toHaveLength(4);
    await cleanup.trigger("click");
    await flushPromises();
    dialogButton("Delete zero records").click();
    await flushPromises();
    expect(document.body.textContent).toContain("Cleanup failed");
    expect(wrapper.findAll("tbody tr")).toHaveLength(4);
    vi.mocked(trafficService.listTraffic).mockResolvedValue(records.filter((row) => row.rx_bytes !== 0 || row.tx_bytes !== 0));
    dialogButton("Delete zero records").click();
    await flushPromises();
    expect(trafficService.deleteZeroTraffic).toHaveBeenLastCalledWith("router", "eth0");
    expect(trafficService.deleteTraffic).not.toHaveBeenCalled();
    expect(wrapper.findAll("tbody tr")).toHaveLength(3);
    expect(wrapper.find('[aria-label="Zero received and sent traffic on 2026-10-14"]').exists()).toBe(false);
    expect(wrapper.findAll(".zero-value")).toHaveLength(0);
    expect(wrapper.findAll("button").find((button) => button.text().includes("Delete all zero values"))!.attributes("disabled")).toBeDefined();
  });

  it("deletes interface history from beside the star only after confirmation and preserves other cards", async () => {
    vi.stubGlobal("visualViewport", Object.assign(new EventTarget(), {
      width: 1024, height: 768, offsetTop: 0, offsetLeft: 0, scale: 1
    }));
    vi.mocked(trafficService.deleteTraffic).mockRejectedValueOnce(new Error("Delete failed")).mockResolvedValue();
    await mountDashboard();
    const navigate = vi.spyOn(navigation, "push").mockResolvedValue();
    await wrapper.find('[aria-label="Delete history for router / eth0"]').trigger("click");
    await flushPromises();
    expect(trafficService.deleteTraffic).not.toHaveBeenCalled();
    dialogButton("Cancel").click();
    await flushPromises();
    expect(wrapper.findAllComponents(TrafficCard)).toHaveLength(2);
    await wrapper.find('[aria-label="Delete history for router / eth0"]').trigger("click");
    await flushPromises();
    dialogButton("Delete all history").click();
    await flushPromises();
    expect(document.body.textContent).toContain("Delete failed");
    expect(wrapper.findAllComponents(TrafficCard)).toHaveLength(2);
    vi.mocked(favoritesService.listFavorites).mockResolvedValue([favorites[1]!]);
    dialogButton("Delete all history").click();
    await flushPromises();
    expect(trafficService.deleteTraffic).toHaveBeenLastCalledWith("router", "eth0");
    expect(wrapper.findAllComponents(TrafficCard).map((card) => card.props("group").interface)).toEqual(["eth1"]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("warns about suspicious historical values and clears the warning after correction", async () => {
    vi.mocked(trafficService.listTraffic).mockResolvedValue([10, 3780000000, 20].map((rx_bytes, index) => ({
      hostname: "router", interface: "eth0", source_ip: "10.0.0.1", day: `2026-10-${15 + index}`,
      rx_bytes, tx_bytes: 10, total_bytes: rx_bytes + 10, avg_rate_bps: 4, received_at: "2026-10-17T23:59:00"
    })));
    vi.mocked(trafficService.updateTrafficDay).mockResolvedValue();
    await mountEditor();
    const warning = wrapper.find('[aria-label="Suspicious received traffic on 2026-10-16"]');
    expect(warning.exists()).toBe(true);
    expect(warning.attributes("aria-hidden")).toBe("false");
    expect(wrapper.find('[aria-label="Suspicious sent traffic on 2026-10-16"]').exists()).toBe(false);
    await wrapper.find('[aria-label="Edit 2026-10-16"]').trigger("click");
    await wrapper.find("input").setValue("15");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find('[aria-label="Suspicious received traffic on 2026-10-16"]').exists()).toBe(false);
  });

  it("restores host, interface, range and bridge selection from a direct URL", async () => {
    await mountDashboard("/router/eth1?range=7&bridges=1");
    expect(wrapper.findComponent(VAutocomplete).props("modelValue")).toBe("host:router");
    const iface = wrapper.findAllComponents(VSelect).find((select) => select.props("label") === "Interface")!;
    expect(iface.props("modelValue")).toBe("eth1");
    expect(useTrafficStore().rangeDays).toBe(7);
    expect(wrapper.find(".bridge-toggle").attributes("aria-pressed")).toBe("true");
    expect(wrapper.findAllComponents(TrafficCard).map((card) => card.props("group").interface)).toEqual(["eth1"]);
    const savedPath = navigation.currentRoute.value.fullPath;
    wrapper.unmount();
    await mountDashboard(savedPath);
    expect(wrapper.findAllComponents(TrafficCard).map((card) => card.props("group").interface)).toEqual(["eth1"]);
    expect(useTrafficStore().rangeDays).toBe(7);
  });

  it("returns from the editor to the originating view, with a direct-link fallback", async () => {
    const from = "/router?range=90&bridges=1";
    const router = await mountEditor(`/router/eth0/change?range=90&bridges=1&from=${encodeURIComponent(from)}`);
    await wrapper.find('[aria-label="Back to dashboard"]').trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe(from);
    wrapper.unmount();
    const direct = await mountEditor("/router/eth1/change?range=7");
    await wrapper.find('[aria-label="Back to dashboard"]').trigger("click");
    await flushPromises();
    expect(direct.currentRoute.value.fullPath).toBe("/router/eth1?range=7");
  });

  it("keeps old editor links working through a canonical redirect", async () => {
    const router = await mountEditor("/traffic/router/eth0?range=7");
    expect(router.currentRoute.value.fullPath).toBe("/router/eth0/change?range=7");
    expect(wrapper.findComponent(TrafficEditorView).exists()).toBe(true);
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

  it("hides an interface when its most recent day has zero received OR sent bytes, even with older active days", async () => {
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

  it.each([
    { rx_bytes: 0, tx_bytes: 20 },
    { rx_bytes: 10, tx_bytes: 0 },
    { rx_bytes: 0, tx_bytes: 0 }
  ])("keeps charts and interface options with older zero-traffic days: %o", async (olderBytes) => {
    await mountDashboard();
    const store = useTrafficStore();
    store.traffic = store.traffic.flatMap((row) => [
      { ...row, day: row.interface === "eth0" ? "2026-10-17" : "2026-10-16" },
      { ...row, ...olderBytes, day: "2026-10-15", total_bytes: olderBytes.rx_bytes + olderBytes.tx_bytes }
    ]);
    await flushPromises();
    const shown = () => wrapper.findAllComponents(TrafficCard).map((card) => card.props("group").interface);
    expect(shown()).toEqual(["eth0", "eth1"]);

    wrapper.findComponent(VAutocomplete).vm.$emit("update:modelValue", "host:router");
    await flushPromises();
    expect(shown()).toEqual(["eth0", "eth1"]);
    const iface = wrapper.findAllComponents(VSelect).find((select) => select.props("label") === "Interface")!;
    expect(iface.props("items").map((item) => item.value)).toEqual(["__all__", "eth0", "eth1"]);
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
    expect(wrapper.find("main").text()).toContain("0 received or 0 sent bytes on their most recent recorded day");
    wrapper.findComponent(VAutocomplete).vm.$emit("update:modelValue", "host:router");
    await flushPromises();
    expect(wrapper.find("main").text()).toContain("0 received or 0 sent bytes on their most recent recorded day");
  });

  it("hides reports at least 24 hours old across views, including placeholders and device-only options", async () => {
    setInterfaces(["fresh", "cutoff", "older", "missing", "unknown", "br0"]);
    const reports = [
      { interface: "fresh", last_seen: "2026-10-17T12:00:00.001Z" },
      { interface: "cutoff", last_seen: "2026-10-17T08:00:00-04:00" },
      { interface: "older", last_seen: "2026-10-17T11:59:59.999Z" },
      { interface: "missing", last_seen: "2026-10-16T12:00:00Z" },
      { interface: "br0", last_seen: "2026-10-16T12:00:00Z" }
    ].map((report) => ({
      ...report, hostname: "router", source_ip: "10.0.0.1", days: 1,
      first_day: "2026-10-01", last_day: "2026-10-01"
    }));
    vi.mocked(trafficService.listDevices).mockResolvedValue(reports);
    await mountDashboard();
    const store = useTrafficStore();
    // Traffic dates do not determine freshness, and placeholders still use global device metadata.
    store.traffic = store.traffic
      .filter((row) => !["missing", "unknown"].includes(row.interface))
      .map((row) => ({ ...row, day: "2026-10-01" }));
    await flushPromises();
    const shown = () => wrapper.findAllComponents(TrafficCard).map((card) => card.props("group").interface);
    expect(shown()).toEqual(["fresh", "unknown"]);
    await wrapper.find(".bridge-toggle").trigger("click");
    await flushPromises();
    expect(shown()).toEqual(["fresh", "unknown"]);

    wrapper.findComponent(VAutocomplete).vm.$emit("update:modelValue", "host:router");
    await flushPromises();
    expect(shown()).toEqual(["fresh"]);
    const iface = wrapper.findAllComponents(VSelect).find((select) => select.props("label") === "Interface")!;
    expect(iface.props("items").map((item) => item.value)).toEqual(["__all__", "fresh"]);
    expect(store.favoriteKeys.size).toBe(6);
    expect(favoritesService.removeFavorite).not.toHaveBeenCalled();
    expect(favoritesService.saveFavoriteOrder).not.toHaveBeenCalled();
  });

  it("rechecks staleness while open, resets the interface selection, and cleans up its timer", async () => {
    setInterfaces(["eth0"]);
    vi.mocked(trafficService.listDevices).mockResolvedValue([{
      hostname: "router", interface: "eth0", source_ip: "10.0.0.1", days: 1,
      first_day: "2026-10-17", last_day: "2026-10-17", last_seen: "2026-10-17T12:01:00Z"
    }]);
    await mountDashboard();
    expect(wrapper.findAllComponents(TrafficCard)).toHaveLength(1);
    wrapper.findComponent(VAutocomplete).vm.$emit("update:modelValue", "host:router");
    await flushPromises();
    const iface = wrapper.findAllComponents(VSelect).find((select) => select.props("label") === "Interface")!;
    iface.vm.$emit("update:modelValue", "eth0");
    await flushPromises();

    vi.advanceTimersByTime(60 * 1000);
    await flushPromises();
    expect(wrapper.findAllComponents(TrafficCard)).toHaveLength(0);
    expect(iface.props("modelValue")).toBe("__all__");
    expect(iface.props("items").map((item) => item.value)).toEqual(["__all__"]);
    expect(wrapper.find("main").text()).toContain("have not reported for 24 hours or more");
    wrapper.findComponent(VAutocomplete).vm.$emit("update:modelValue", "favorites");
    await flushPromises();
    expect(wrapper.findAllComponents(TrafficCard)).toHaveLength(0);
    expect(wrapper.find("main").text()).toContain("have not reported for 24 hours or more");
    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps stale favorites in their slots and restores reporting interfaces after a range reload", async () => {
    setInterfaces(["eth0", "idle", "eth1"]);
    const reports = ["eth0", "idle", "eth1"].map((iface) => ({
      hostname: "router", interface: iface, source_ip: "10.0.0.1", days: 1,
      first_day: "2026-10-17", last_day: "2026-10-17",
      last_seen: iface === "idle" ? "2026-10-16T12:00:00Z" : "2026-10-18T11:00:00Z"
    }));
    vi.mocked(trafficService.listDevices).mockResolvedValue(reports);
    vi.mocked(favoritesService.saveFavoriteOrder).mockImplementation(async (items) => items);
    await mountDashboard();
    const reordered = wrapper.findAllComponents(TrafficCard).map((card) => card.props("group")).reverse();
    wrapper.findComponent(VueDraggable).vm.$emit("update:modelValue", reordered);
    await flushPromises();
    const savedFavorites = [
      { hostname: "router", interface: "eth1" },
      { hostname: "router", interface: "idle" },
      { hostname: "router", interface: "eth0" }
    ];
    expect(favoritesService.saveFavoriteOrder).toHaveBeenCalledWith(savedFavorites);

    vi.mocked(favoritesService.listFavorites).mockResolvedValue(savedFavorites);
    const range = wrapper.findAllComponents(VSelect).find((select) => select.props("label") === "Range")!;
    range.vm.$emit("update:modelValue", 0);
    await flushPromises();
    expect(wrapper.findAllComponents(TrafficCard).map((card) => card.props("group").interface))
      .toEqual(["eth1", "eth0"]);

    vi.mocked(trafficService.listDevices).mockResolvedValue(reports.map((report) => ({
      ...report, last_seen: "2026-10-18T12:00:00Z"
    })));
    range.vm.$emit("update:modelValue", 7);
    await flushPromises();
    expect(wrapper.findAllComponents(TrafficCard).map((card) => card.props("group").interface))
      .toEqual(["eth1", "idle", "eth0"]);
    expect(favoritesService.removeFavorite).not.toHaveBeenCalled();
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
