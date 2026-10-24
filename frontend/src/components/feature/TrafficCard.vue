<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import TrafficChart from "@/components/feature/TrafficChart.vue";
import { formatBytes } from "@/composables/useFormat";
import { describeError } from "@/services/errors";
import { deleteTraffic } from "@/services/traffic";
import type { DeviceGroup } from "@/types/domain";

const props = defineProps<{ group: DeviceGroup; favorite: boolean; sortable?: boolean; fit?: boolean }>();

const emit = defineEmits<{ "toggle-favorite": []; deleted: [] }>();
const deleting = ref(false);
const saving = ref(false);
const deleteError = ref<string | null>(null);
const router = useRouter();
const route = useRoute();
const editorPath = computed(() => router.resolve({
  name: "traffic-editor",
  params: { hostname: props.group.hostname, interface: props.group.interface },
  query: { ...route.query, from: route.fullPath }
}).href);

function openEditor(event: Event): void {
  if (event.target instanceof Element && event.target.closest("button")) return;
  void router.push(editorPath.value);
}

async function removeInterface(): Promise<void> {
  saving.value = true;
  deleteError.value = null;
  try {
    await deleteTraffic(props.group.hostname, props.group.interface);
    deleting.value = false;
    emit("deleted");
  } catch (error) {
    deleteError.value = describeError(error, "Failed to delete interface history");
  } finally {
    saving.value = false;
  }
}

function totalBytes(field: "rx_bytes" | "tx_bytes"): string {
  return formatBytes(props.group.totals[field]);
}

function subtitle(): string {
  return [props.group.sourceIp, `${props.group.days.length} days`].filter(Boolean).join(" · ");
}
</script>

<template>
  <v-card
    class="overflow-hidden traffic-card"
    :class="{ 'traffic-card--fit': fit }"
  >
    <v-card-title class="card-heading d-flex align-center px-4 py-3">
      <v-icon
        v-if="sortable"
        icon="mdi-drag"
        class="drag-handle mr-2"
        aria-label="Drag to reorder"
      />
      <a
        class="card-name text-h6"
        :href="editorPath"
        :title="`${group.hostname} · ${group.interface}`"
        @click.prevent="openEditor"
      >{{ group.hostname }} &middot; {{ group.interface }}</a>
      <v-spacer />
      <span
        v-if="!fit"
        class="text-caption text-medium-emphasis mr-2"
      >{{ subtitle() }}</span>
      <v-btn
        :icon="favorite ? 'mdi-star' : 'mdi-star-outline'"
        :color="favorite ? 'warning' : undefined"
        :aria-label="favorite ? 'Remove from favorites' : 'Add to favorites'"
        variant="text"
        size="small"
        @click="$emit('toggle-favorite')"
      />
      <v-tooltip text="Delete interface history">
        <template #activator="{ props: tooltipProps }">
          <v-btn
            v-bind="tooltipProps"
            icon="mdi-delete"
            color="error"
            :aria-label="`Delete history for ${group.hostname} / ${group.interface}`"
            variant="text"
            size="small"
            @click="deleteError = null; deleting = true"
          />
        </template>
      </v-tooltip>
    </v-card-title>
    <div
      v-if="group.days.length > 0"
      class="card-totals d-flex flex-wrap align-center ga-2 px-4 pb-3"
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
      class="chart-body pa-3"
      role="link"
      tabindex="0"
      :aria-label="`Edit traffic for ${group.hostname} / ${group.interface}`"
      @click="openEditor"
      @keydown.enter.self="openEditor"
      @keydown.space.prevent.self="openEditor"
    >
      <TrafficChart
        :group="group"
        :fit="fit"
      />
    </div>
  </v-card>
  <v-dialog v-model="deleting" max-width="480" :persistent="saving">
    <v-card title="Delete interface history?">
      <v-card-text>
        <p class="delete-target mb-3">{{ group.hostname }} / {{ group.interface }}</p>
        <p>All daily records and the favorite entry will be deleted. This cannot be undone. Future reports may recreate deleted data.</p>
        <v-alert v-if="deleteError" type="error" variant="tonal" class="mt-4">{{ deleteError }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn :disabled="saving" @click="deleting = false">Cancel</v-btn>
        <v-btn color="error" :loading="saving" @click="removeInterface">Delete all history</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.delete-target {
  overflow-wrap: anywhere;
}

.chart-body {
  cursor: pointer;
}

.card-name {
  color: inherit;
  text-decoration: none;
}

.card-name:hover {
  text-decoration: underline;
}

.drag-handle {
  cursor: grab;
}

.traffic-card--fit {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.card-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.traffic-card--fit .card-heading {
  flex-shrink: 0;
  padding: 2px 8px !important;
}

.traffic-card--fit .card-name {
  font-size: 0.875rem !important;
}

.traffic-card--fit .card-totals {
  flex-shrink: 0;
  flex-wrap: nowrap !important;
  overflow: hidden;
  padding: 0 8px 2px !important;
}

.traffic-card--fit .card-totals :deep(.v-chip) {
  min-width: 0;
  font-size: 0.65rem;
  height: 20px;
}

.traffic-card--fit .chart-body {
  flex: 1;
  min-height: 0;
  position: relative;
  padding: 0 !important;
}

.traffic-card--fit .chart-body > :deep(div) {
  position: absolute;
  inset: 0;
}
</style>
