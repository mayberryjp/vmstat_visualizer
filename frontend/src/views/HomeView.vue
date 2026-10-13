<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onMounted, ref } from "vue";
import TrafficChart from "@/components/feature/TrafficChart.vue";
import { formatBytes } from "@/composables/useFormat";
import { useTrafficStore } from "@/stores/traffic";
import type { DeviceGroup } from "@/types/domain";

const FAVORITES_TAB = "favorites";

const store = useTrafficStore();
const { groups, favorites, hosts, loading, error, rangeDays } = storeToRefs(store);

const tab = ref(FAVORITES_TAB);

const activeGroups = computed<DeviceGroup[]>(() =>
  tab.value === FAVORITES_TAB
    ? favorites.value
    : groups.value.filter((g) => hostTab(g.hostname) === tab.value)
);

const emptyMessage = computed(() =>
  tab.value === FAVORITES_TAB
    ? "No favorites yet. List charts in the charts config file to pin them here."
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

function totalBytes(group: DeviceGroup, field: "rx_bytes" | "tx_bytes"): string {
  return formatBytes(group.days.reduce((sum, d) => sum + d[field], 0));
}

function heading(group: DeviceGroup): string {
  return group.title ?? `${group.hostname} · ${group.interface}`;
}

function subtitle(group: DeviceGroup): string {
  const parts = [group.title ? `${group.hostname} · ${group.interface}` : "", group.sourceIp];
  parts.push(`${group.days.length} days`);
  return parts.filter(Boolean).join(" · ");
}

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
        v-if="activeGroups.length === 0"
        type="info"
        variant="tonal"
      >
        {{ emptyMessage }}
      </v-alert>

      <v-row v-else>
        <v-col
          v-for="group in activeGroups"
          :key="group.key"
          cols="12"
        >
          <v-card class="overflow-hidden">
            <v-card-title class="d-flex align-center px-4 py-3">
              <span class="text-h6">{{ heading(group) }}</span>
              <v-spacer />
              <span class="text-caption text-medium-emphasis">{{ subtitle(group) }}</span>
            </v-card-title>
            <div
              v-if="group.days.length > 0"
              class="d-flex flex-wrap align-center ga-2 px-4 pb-3"
            >
              <v-chip
                size="small"
                variant="tonal"
                color="primary"
                prepend-icon="mdi-arrow-down"
              >
                Received: {{ totalBytes(group, "rx_bytes") }}
              </v-chip>
              <v-chip
                size="small"
                variant="tonal"
                color="success"
                prepend-icon="mdi-arrow-up"
              >
                Sent: {{ totalBytes(group, "tx_bytes") }}
              </v-chip>
            </div>
            <v-divider />
            <div
              v-if="group.days.length === 0"
              class="pa-6 text-center text-medium-emphasis"
            >
              No data in this range.
            </div>
            <div
              v-else
              class="pa-3"
            >
              <TrafficChart :group="group" />
            </div>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </v-container>
</template>
