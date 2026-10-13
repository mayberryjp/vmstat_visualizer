<script setup lang="ts">
import TrafficChart from "@/components/feature/TrafficChart.vue";
import { formatBytes } from "@/composables/useFormat";
import type { DeviceGroup } from "@/types/domain";

const props = defineProps<{ group: DeviceGroup; favorite: boolean; sortable?: boolean }>();

defineEmits<{ "toggle-favorite": [] }>();

function totalBytes(field: "rx_bytes" | "tx_bytes"): string {
  return formatBytes(props.group.days.reduce((sum, d) => sum + d[field], 0));
}

function subtitle(): string {
  return [props.group.sourceIp, `${props.group.days.length} days`].filter(Boolean).join(" · ");
}
</script>

<template>
  <v-card class="overflow-hidden">
    <v-card-title class="d-flex align-center px-4 py-3">
      <v-icon
        v-if="sortable"
        icon="mdi-drag"
        class="drag-handle mr-2"
        aria-label="Drag to reorder"
      />
      <span class="text-h6">{{ group.hostname }} &middot; {{ group.interface }}</span>
      <v-spacer />
      <span class="text-caption text-medium-emphasis mr-2">{{ subtitle() }}</span>
      <v-btn
        :icon="favorite ? 'mdi-star' : 'mdi-star-outline'"
        :color="favorite ? 'warning' : undefined"
        :aria-label="favorite ? 'Remove from favorites' : 'Add to favorites'"
        variant="text"
        size="small"
        @click="$emit('toggle-favorite')"
      />
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
        Received: {{ totalBytes("rx_bytes") }}
      </v-chip>
      <v-chip
        size="small"
        variant="tonal"
        color="success"
        prepend-icon="mdi-arrow-up"
      >
        Sent: {{ totalBytes("tx_bytes") }}
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
</template>

<style scoped>
.drag-handle {
  cursor: grab;
}
</style>
