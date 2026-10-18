<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { useDisplay } from "vuetify";
import TrafficCard from "@/components/feature/TrafficCard.vue";
import { useTrafficStore } from "@/stores/traffic";
import type { DeviceGroup } from "@/types/domain";

const FAVORITES_TAB = "favorites";
const ALL_INTERFACES = "__all__";

const store = useTrafficStore();
const {
  groups,
  devices,
  favoriteGroups,
  favoriteKeys,
  hosts,
  loading,
  error,
  actionError,
  rangeDays
} = storeToRefs(store);

const tab = ref(FAVORITES_TAB);
const selectedInterface = ref(ALL_INTERFACES);
const showBridgeInterfaces = ref(false);
function isInterfaceVisible(name: string): boolean {
  return showBridgeInterfaces.value ||
    !/^(?:br(?:\d+|-.+)|(?:bridge|docker|virbr|cni|lxcbr|vmbr)\d+)$/.test(name);
}

const zeroByteKeys = computed(() => new Set(
  groups.value
    .filter((group) => group.days.some((day) => day.rx_bytes === 0 || day.tx_bytes === 0))
    .map((group) => group.key)
));

function isGroupVisible(group: DeviceGroup): boolean {
  return isInterfaceVisible(group.interface) && !zeroByteKeys.value.has(group.key);
}
const { mdAndUp } = useDisplay();
const preferredLayout = ref<"fit" | "rows">("fit");
const layout = computed(() => mdAndUp.value ? preferredLayout.value : "rows");
const layoutOptions = [
  { title: "Fit all graphs on one page", value: "fit" },
  { title: "One graph per row", value: "rows" }
];
const page = ref<HTMLElement>();
const pageWidth = ref(1200);
const pageHeight = ref(700);
let observer: ResizeObserver | undefined;
watch(preferredLayout, (value) => {
  try {
    localStorage.setItem("vnstat-chart-layout", value);
  } catch {
    actionError.value = "Unable to save the chart layout in this browser.";
  }
});
watch(tab, () => (selectedInterface.value = ALL_INTERFACES));

// Local copy that the drag library reorders; persisted once it differs from the store.
const visibleFavoriteGroups = computed(() =>
  favoriteGroups.value.filter(isGroupVisible)
);
const ordered = ref<DeviceGroup[]>([]);
watch(visibleFavoriteGroups, (value) => (ordered.value = [...value]), { immediate: true });
watch(ordered, (list) => {
  const keys = list.map((g) => g.key);
  const current = visibleFavoriteGroups.value.map((g) => g.key);
  if (keys.length === current.length && keys.some((k, i) => k !== current[i])) {
    // Keep hidden favorites in their saved slots while reordering visible cards.
    const visibleKeys = new Set(current);
    let index = 0;
    const allKeys = favoriteGroups.value.map((group) =>
      visibleKeys.has(group.key) ? keys[index++]! : group.key
    );
    void store.reorderFavorites(allKeys);
  }
});

const currentHost = computed(() =>
  tab.value === FAVORITES_TAB ? null : tab.value.slice("host:".length)
);

const hostGroups = computed<DeviceGroup[]>(() =>
  groups.value.filter((g) => g.hostname === currentHost.value && isGroupVisible(g))
);

const interfaceOptions = computed(() => {
  const names = new Set<string>(hostGroups.value.map((g) => g.interface));
  for (const d of devices.value) {
    if (
      d.hostname === currentHost.value &&
      isInterfaceVisible(d.interface) &&
      !zeroByteKeys.value.has(`${d.hostname}|${d.interface}`)
    ) names.add(d.interface);
  }
  return [
    { title: "All interfaces", value: ALL_INTERFACES },
    ...[...names].sort((a, b) => a.localeCompare(b)).map((n) => ({ title: n, value: n }))
  ];
});

watch(interfaceOptions, (options) => {
  if (!options.some((option) => option.value === selectedInterface.value)) {
    selectedInterface.value = ALL_INTERFACES;
  }
});

const visibleHostGroups = computed<DeviceGroup[]>(() =>
  selectedInterface.value === ALL_INTERFACES
    ? hostGroups.value
    : hostGroups.value.filter((g) => g.interface === selectedInterface.value)
);

const gridStyle = computed(() => {
  const count = tab.value === FAVORITES_TAB ? ordered.value.length : visibleHostGroups.value.length;
  let columns = 1;
  let bestScore = Infinity;
  for (let candidate = 1; candidate <= count; candidate++) {
    const rows = Math.ceil(count / candidate);
    const width = Math.max(1, (pageWidth.value - (candidate - 1) * 12) / candidate);
    const height = Math.max(1, (pageHeight.value - (rows - 1) * 12) / rows);
    const score = Math.abs(Math.log(width / height / 1.8));
    if (score < bestScore) {
      bestScore = score;
      columns = candidate;
    }
  }
  return {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${Math.max(1, Math.ceil(count / columns))}, minmax(0, 1fr))`
  };
});

const snackbar = computed({
  get: () => actionError.value !== null,
  set: (open: boolean) => {
    if (!open) actionError.value = null;
  }
});

const viewOptions = computed(() => [
  { title: "Favorites", value: FAVORITES_TAB, props: { prependIcon: "mdi-star" } },
  ...hosts.value.map((host) => ({
    title: host,
    value: hostTab(host),
    props: { prependIcon: "mdi-server" }
  }))
]);

const emptyMessage = computed(() => {
  const unfiltered = tab.value === FAVORITES_TAB
    ? favoriteGroups.value
    : groups.value.filter((group) => group.hostname === currentHost.value);
  if (unfiltered.some((group) => zeroByteKeys.value.has(group.key))) {
    return "No interfaces match the current filters. Interfaces with 0 received or 0 sent bytes on any day in the selected range are hidden.";
  }
  if (!showBridgeInterfaces.value && unfiltered.some((group) => !isInterfaceVisible(group.interface))) {
    return "Bridge interfaces are hidden. Enable Show bridge interfaces in the header to display them.";
  }
  return tab.value === FAVORITES_TAB
    ? "No favorites yet. Click the star on a chart in any host tab to pin it here."
    : "No traffic snapshots for this host in this range.";
});

function hostTab(host: string): string {
  return `host:${host}`;
}

const rangeOptions = [
  { title: "Last 7 days", value: 7 },
  { title: "Last 30 days", value: 30 },
  { title: "Last 90 days", value: 90 },
  { title: "All history", value: 0 }
];

onMounted(() => {
  try {
    const saved = localStorage.getItem("vnstat-chart-layout");
    if (saved === "fit" || saved === "rows") preferredLayout.value = saved;
  } catch {
    actionError.value = "Unable to read the saved chart layout in this browser.";
  }
  observer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    pageWidth.value = entry.contentRect.width;
    pageHeight.value = entry.contentRect.height;
  });
  if (page.value) observer.observe(page.value);
  void store.load();
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <Teleport
    to="#header-controls"
    defer
  >
    <div class="dashboard-controls">
      <v-autocomplete
        :model-value="tab"
        :items="viewOptions"
        label="Host / Favorites"
        class="host-control"
        density="compact"
        hide-details
        hide-no-data
        @update:model-value="tab = $event ?? FAVORITES_TAB"
      />
      <v-select
        v-if="currentHost"
        v-model="selectedInterface"
        :items="interfaceOptions"
        label="Interface"
        density="compact"
        hide-details
      />
      <v-select
        v-model="rangeDays"
        :items="rangeOptions"
        label="Range"
        density="compact"
        hide-details
        @update:model-value="store.load()"
      />
      <v-select
        v-if="mdAndUp"
        v-model="preferredLayout"
        :items="layoutOptions"
        label="Chart layout"
        class="layout-control"
        density="compact"
        hide-details
      />
      <v-btn
        class="bridge-toggle"
        :aria-pressed="showBridgeInterfaces"
        :prepend-icon="showBridgeInterfaces ? 'mdi-eye' : 'mdi-eye-off'"
        :variant="showBridgeInterfaces ? 'tonal' : 'text'"
        @click="showBridgeInterfaces = !showBridgeInterfaces"
      >
        Show bridge interfaces
      </v-btn>
      <v-btn
        icon="mdi-refresh"
        variant="text"
        aria-label="Refresh"
        :loading="loading"
        @click="store.load()"
      />
    </div>
  </Teleport>
  <div
    ref="page"
    class="page dashboard-page"
    :class="{ 'dashboard-page--fit': layout === 'fit' }"
  >
    <v-progress-linear
      v-if="loading && groups.length === 0"
      indeterminate
    />

    <v-alert
      v-else-if="error"
      type="error"
      variant="tonal"
    >
      {{ error }}
      <template #append>
        <v-btn
          variant="text"
          @click="store.load()"
        >
          Retry
        </v-btn>
      </template>
    </v-alert>

    <template v-else>
      <v-alert
        v-if="tab === FAVORITES_TAB ? ordered.length === 0 : visibleHostGroups.length === 0"
        type="info"
        variant="tonal"
      >
        {{ emptyMessage }}
      </v-alert>

      <VueDraggable
        v-else-if="tab === FAVORITES_TAB"
        v-model="ordered"
        class="chart-grid"
        :class="{ 'chart-grid--fit': layout === 'fit' }"
        :style="layout === 'fit' ? gridStyle : undefined"
        handle=".drag-handle"
        :animation="150"
      >
        <TrafficCard
          v-for="group in ordered"
          :key="group.key"
          :group="group"
          favorite
          sortable
          :fit="layout === 'fit'"
          @toggle-favorite="store.toggleFavorite(group)"
        />
      </VueDraggable>

      <div
        v-else
        class="chart-grid"
        :class="{ 'chart-grid--fit': layout === 'fit' }"
        :style="layout === 'fit' ? gridStyle : undefined"
      >
        <TrafficCard
          v-for="group in visibleHostGroups"
          :key="group.key"
          :group="group"
          :favorite="favoriteKeys.has(group.key)"
          :fit="layout === 'fit'"
          @toggle-favorite="store.toggleFavorite(group)"
        />
      </div>
    </template>

    <v-snackbar
      v-model="snackbar"
      color="error"
      :timeout="5000"
    >
      {{ actionError }}
    </v-snackbar>
  </div>
</template>

<style scoped>
:global(html:has(.dashboard-page--fit)) {
  overflow-y: auto;
}

:global(.v-main:has(.dashboard-page--fit)) {
  transition: none;
}

.dashboard-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.dashboard-controls :deep(.v-input) {
  flex: 1 1 130px;
  min-width: 0;
}

.dashboard-controls :deep(.host-control),
.dashboard-controls :deep(.layout-control) {
  flex-basis: 200px;
}

.dashboard-page {
  padding: 12px;
}

.dashboard-page--fit {
  height: calc(100dvh - var(--v-layout-top, 64px) - var(--v-layout-bottom, 0px));
  max-width: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.chart-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chart-grid--fit {
  display: grid;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
</style>
