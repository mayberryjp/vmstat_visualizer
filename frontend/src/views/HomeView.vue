<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import TrafficCard from "@/components/feature/TrafficCard.vue";
import { useTrafficStore } from "@/stores/traffic";
import type { DeviceGroup } from "@/types/domain";

const FAVORITES_TAB = "favorites";

const store = useTrafficStore();
const { groups, favoriteGroups, favoriteKeys, hosts, loading, error, actionError, rangeDays } =
  storeToRefs(store);

const tab = ref(FAVORITES_TAB);

// Local copy that the drag library reorders; persisted once it differs from the store.
const ordered = ref<DeviceGroup[]>([]);
watch(favoriteGroups, (value) => (ordered.value = [...value]), { immediate: true });
watch(ordered, (list) => {
  const keys = list.map((g) => g.key);
  const current = favoriteGroups.value.map((g) => g.key);
  if (keys.length === current.length && keys.some((k, i) => k !== current[i])) {
    void store.reorderFavorites(keys);
  }
});

const hostGroups = computed<DeviceGroup[]>(() =>
  groups.value.filter((g) => hostTab(g.hostname) === tab.value)
);

const snackbar = computed({
  get: () => actionError.value !== null,
  set: (open: boolean) => {
    if (!open) actionError.value = null;
  }
});

const emptyMessage = computed(() =>
  tab.value === FAVORITES_TAB
    ? "No favorites yet. Click the star on a chart in any host tab to pin it here."
    : "No traffic snapshots for this host in this range."
);

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
  void store.load();
});
</script>

<template>
  <v-container
    fluid
    class="page"
  >
    <v-row
      align="center"
      class="mb-2"
    >
      <v-col
        cols="12"
        sm="4"
        md="3"
      >
        <v-select
          v-model="rangeDays"
          :items="rangeOptions"
          label="Range"
          density="comfortable"
          hide-details
          @update:model-value="store.load()"
        />
      </v-col>
      <v-col cols="auto">
        <v-btn
          icon="mdi-refresh"
          variant="text"
          aria-label="Refresh"
          :loading="loading"
          @click="store.load()"
        />
      </v-col>
    </v-row>

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
      <v-tabs
        v-model="tab"
        color="primary"
        show-arrows
        class="mb-4"
      >
        <v-tab
          :value="FAVORITES_TAB"
          prepend-icon="mdi-star"
        >
          Favorites
        </v-tab>
        <v-tab
          v-for="host in hosts"
          :key="host"
          :value="hostTab(host)"
          prepend-icon="mdi-server"
        >
          {{ host }}
        </v-tab>
      </v-tabs>

      <v-alert
        v-if="tab === FAVORITES_TAB ? ordered.length === 0 : hostGroups.length === 0"
        type="info"
        variant="tonal"
      >
        {{ emptyMessage }}
      </v-alert>

      <VueDraggable
        v-else-if="tab === FAVORITES_TAB"
        v-model="ordered"
        class="d-flex flex-column ga-4"
        handle=".drag-handle"
        :animation="150"
      >
        <TrafficCard
          v-for="group in ordered"
          :key="group.key"
          :group="group"
          favorite
          sortable
          @toggle-favorite="store.toggleFavorite(group)"
        />
      </VueDraggable>

      <div
        v-else
        class="d-flex flex-column ga-4"
      >
        <TrafficCard
          v-for="group in hostGroups"
          :key="group.key"
          :group="group"
          :favorite="favoriteKeys.has(group.key)"
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
  </v-container>
</template>
