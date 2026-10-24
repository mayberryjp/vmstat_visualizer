<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import TrafficChart from "@/components/feature/TrafficChart.vue";
import { formatBytes } from "@/composables/useFormat";
import { findTrafficAnomalies, isZeroTraffic, zeroTrafficColor } from "@/composables/useTrafficAnomalies";
import { describeError } from "@/services/errors";
import { deleteTraffic, deleteZeroTraffic, listTraffic, updateTrafficDay, type TrafficValues } from "@/services/traffic";
import type { DeviceGroup, TrafficDay } from "@/types/domain";

const route = useRoute();
const router = useRouter();
const hostname = computed(() => String(route.params.hostname));
const iface = computed(() => String(route.params.interface));
const returnTo = computed(() => {
  const from = route.query.from;
  if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//")) {
    const target = router.resolve(from);
    if (["home", "host", "interface"].includes(String(target.name))) return from;
  }
  const query = { ...route.query };
  delete query.from;
  return router.resolve({
    name: "interface", params: { hostname: hostname.value, interface: iface.value }, query
  }).href;
});
const rows = ref<TrafficDay[]>([]);
const anomalies = computed(() => findTrafficAnomalies(rows.value));
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const editing = ref<string | null>(null);
const draft = ref({ rx_bytes: "", tx_bytes: "", avg_rate_bps: "" });
const deleting = ref<string | null>(null);
const deleteAll = "__all__";
const deleteZeros = "__zeros__";
const zeroCount = computed(() => rows.value.filter(isZeroTraffic).length);
const fields = ["rx_bytes", "tx_bytes", "avg_rate_bps"] as const;
const totals = computed(() => rows.value.reduce((sum, row) => ({
  rx: sum.rx + row.rx_bytes, tx: sum.tx + row.tx_bytes
}), { rx: 0, tx: 0 }));
const chartGroup = computed<DeviceGroup>(() => ({
  key: `${hostname.value}|${iface.value}`,
  hostname: hostname.value,
  interface: iface.value,
  sourceIp: rows.value[0]?.source_ip ?? "",
  lastSeen: rows.value[0]?.received_at ?? "",
  days: [...rows.value].reverse(),
  totals: { rx_bytes: totals.value.rx, tx_bytes: totals.value.tx }
}));
const valid = computed(() => fields.every((field) => /^\d+$/.test(draft.value[field]) &&
  Number.isSafeInteger(Number(draft.value[field]))) &&
  Number.isSafeInteger(Number(draft.value.rx_bytes) + Number(draft.value.tx_bytes)));
const dirty = computed(() => {
  const row = rows.value.find((item) => item.day === editing.value);
  return row !== undefined && fields.some((field) => draft.value[field] !== String(row[field]));
});

onBeforeRouteLeave(() => !saving.value && (!dirty.value || confirm("Discard unsaved traffic changes?")));

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    rows.value = (await listTraffic(undefined, hostname.value, iface.value))
      .sort((first, second) => second.day.localeCompare(first.day));
  } catch (cause) {
    error.value = describeError(cause, "Failed to load traffic");
  } finally {
    loading.value = false;
  }
}

function edit(row: TrafficDay): void {
  if (dirty.value && !confirm("Discard unsaved traffic changes?")) return;
  editing.value = row.day;
  draft.value = {
    rx_bytes: String(row.rx_bytes), tx_bytes: String(row.tx_bytes), avg_rate_bps: String(row.avg_rate_bps)
  };
  error.value = null;
}

async function save(): Promise<void> {
  if (!valid.value || !editing.value) return;
  saving.value = true;
  error.value = null;
  try {
    const values: TrafficValues = {
      rx_bytes: Number(draft.value.rx_bytes), tx_bytes: Number(draft.value.tx_bytes),
      avg_rate_bps: Number(draft.value.avg_rate_bps)
    };
    await updateTrafficDay(hostname.value, iface.value, editing.value, values);
    const row = rows.value.find((item) => item.day === editing.value)!;
    Object.assign(row, values, { total_bytes: values.rx_bytes + values.tx_bytes, is_manual: true, is_estimated: false });
    editing.value = null;
  } catch (cause) {
    error.value = describeError(cause, "Failed to save traffic");
  } finally {
    saving.value = false;
  }
}

async function remove(): Promise<void> {
  if (!deleting.value) return;
  saving.value = true;
  error.value = null;
  const target = deleting.value;
  try {
    if (target === deleteZeros) {
      await deleteZeroTraffic(hostname.value, iface.value);
      await load();
    } else {
      await deleteTraffic(hostname.value, iface.value, target === deleteAll ? undefined : target);
      rows.value = target === deleteAll ? [] : rows.value.filter((row) => row.day !== target);
    }
    if (!rows.value.some((row) => row.day === editing.value)) editing.value = null;
    deleting.value = null;
  } catch (cause) {
    error.value = describeError(cause, "Failed to delete traffic");
  } finally {
    saving.value = false;
  }
}

watch(() => [hostname.value, iface.value], () => { editing.value = null; void load(); }, { immediate: true });
</script>

<template>
  <section class="page traffic-editor">
    <div class="editor-heading">
      <v-btn icon="mdi-arrow-left" aria-label="Back to dashboard" variant="text" :disabled="saving" @click="router.push(returnTo)" />
      <h1>{{ hostname }} / {{ iface }}</h1>
      <v-btn color="error" variant="text" prepend-icon="mdi-delete-sweep" :disabled="loading || saving || zeroCount === 0" @click="deleting = deleteZeros">Delete all zero values</v-btn>
      <v-btn color="error" variant="text" prepend-icon="mdi-delete" :disabled="loading || saving || rows.length === 0" @click="deleting = deleteAll">Delete interface</v-btn>
    </div>
    <div class="editor-totals">
      <span>{{ rows.length }} days</span>
      <span>Received: {{ formatBytes(totals.rx) }}</span>
      <span>Sent: {{ formatBytes(totals.tx) }}</span>
    </div>
    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>
    <v-progress-linear v-if="loading" indeterminate />
    <v-btn v-if="error && rows.length === 0" variant="text" prepend-icon="mdi-refresh" @click="load">Retry</v-btn>
    <TrafficChart
      v-if="rows.length"
      :group="chartGroup"
      class="editor-chart"
      role="img"
      :aria-label="`Daily received and sent traffic for ${hostname} / ${iface}`"
    />
    <v-table v-if="rows.length" density="compact" class="traffic-table">
      <thead><tr><th>Day</th><th>Received</th><th>Sent</th><th>Total</th><th>Average rate (bit/s)</th><th>Actions</th></tr></thead>
      <tbody>
        <template v-for="row in rows" :key="row.day">
          <tr>
            <td class="date-column">
              {{ row.day }}
              <v-icon v-if="isZeroTraffic(row)" icon="mdi-alert-circle" :color="zeroTrafficColor" size="small" role="img" :aria-hidden="false" :aria-label="`Zero received and sent traffic on ${row.day}`" title="Both received and sent bytes are zero" />
            </td>
            <td :title="`${row.rx_bytes} bytes`" :class="{ 'anomalous-value': anomalies.get(row.day)?.has('rx_bytes'), 'zero-value': isZeroTraffic(row) }">
              {{ formatBytes(row.rx_bytes) }}
              <v-icon v-if="anomalies.get(row.day)?.has('rx_bytes')" icon="mdi-alert-circle" color="error" size="small" role="img" :aria-hidden="false" :aria-label="`Suspicious received traffic on ${row.day}`" title="Received traffic is at least 10x the other days' average" />
            </td>
            <td :title="`${row.tx_bytes} bytes`" :class="{ 'anomalous-value': anomalies.get(row.day)?.has('tx_bytes'), 'zero-value': isZeroTraffic(row) }">
              {{ formatBytes(row.tx_bytes) }}
              <v-icon v-if="anomalies.get(row.day)?.has('tx_bytes')" icon="mdi-alert-circle" color="error" size="small" role="img" :aria-hidden="false" :aria-label="`Suspicious sent traffic on ${row.day}`" title="Sent traffic is at least 10x the other days' average" />
            </td>
            <td>{{ formatBytes(row.total_bytes) }}</td><td>{{ row.avg_rate_bps.toLocaleString() }}</td>
            <td class="row-actions">
              <v-btn icon="mdi-pencil" :aria-label="`Edit ${row.day}`" :title="`Edit ${row.day}`" size="small" variant="text" :disabled="saving" @click="edit(row)" />
              <v-btn icon="mdi-delete" :aria-label="`Delete ${row.day}`" :title="`Delete ${row.day}`" size="small" variant="text" color="error" :disabled="saving" @click="deleting = row.day" />
            </td>
          </tr>
          <tr v-if="editing === row.day">
            <td colspan="6">
              <form class="daily-editor" @submit.prevent="save">
                <v-text-field v-model="draft.rx_bytes" label="Received (bytes)" inputmode="numeric" :disabled="saving" hide-details />
                <v-text-field v-model="draft.tx_bytes" label="Sent (bytes)" inputmode="numeric" :disabled="saving" hide-details />
                <v-text-field v-model="draft.avg_rate_bps" label="Average rate (bit/s)" inputmode="numeric" :disabled="saving" hide-details />
                <span>Total: {{ valid ? formatBytes(Number(draft.rx_bytes) + Number(draft.tx_bytes)) : '-' }}</span>
                <v-btn type="submit" icon="mdi-content-save" aria-label="Save changes" title="Save changes" color="primary" :loading="saving" :disabled="!valid || !dirty" />
                <v-btn icon="mdi-close" aria-label="Cancel editing" title="Cancel editing" variant="text" :disabled="saving" @click="editing = null" />
              </form>
            </td>
          </tr>
        </template>
      </tbody>
    </v-table>
    <p v-else-if="!loading && !error">No traffic records for this interface.</p>
    <v-dialog :model-value="deleting !== null" max-width="480" :persistent="saving" @update:model-value="!$event && (deleting = null)">
      <v-card :title="deleting === deleteAll ? 'Delete interface history?' : deleting === deleteZeros ? 'Delete all zero values?' : 'Delete daily record?'">
        <v-card-text>
          <p class="delete-target">{{ hostname }} / {{ iface }}{{ deleting !== deleteAll && deleting !== deleteZeros ? ` / ${deleting}` : '' }}</p>
          <p>{{ deleting === deleteAll ? 'All daily records and the favorite entry will be deleted.' : deleting === deleteZeros ? `${zeroCount} ${zeroCount === 1 ? 'record' : 'records'} with both 0 received and 0 sent bytes will be deleted. Other records and the favorite entry will be kept.` : 'This daily record will be deleted.' }} This cannot be undone. Future reports may recreate deleted data.</p>
          <v-alert v-if="error" type="error" variant="tonal" class="mt-4">{{ error }}</v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn :disabled="saving" @click="deleting = null">Cancel</v-btn>
          <v-btn color="error" :loading="saving" @click="remove">{{ deleting === deleteAll ? 'Delete all history' : deleting === deleteZeros ? 'Delete zero records' : 'Delete record' }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.traffic-editor {
  box-sizing: border-box;
  width: 100%;
  max-width: 1440px;
  margin-inline: auto;
  padding: 24px;
  min-width: 0;
}
.editor-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
h1 { font-size: 1.25rem; font-weight: 500; overflow-wrap: anywhere; flex: 1 1 200px; min-width: 0; }
.editor-totals { display: flex; flex-wrap: wrap; gap: 12px 24px; margin: 16px 0; }
.editor-chart { width: 100%; min-width: 0; margin-bottom: 16px; }
.traffic-table {
  width: fit-content;
  max-width: 100%;
  margin-inline: auto;
  background: transparent;
  font-size: 0.875rem;
  font-family: BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
}
.traffic-table.v-table :deep(.v-table__wrapper > table > tbody > tr > td) { border: 0; }
.traffic-table td, .traffic-table th { white-space: nowrap; }
.date-column { color: #b1b8c0; font-weight: 500; }
.row-actions { min-width: 96px; }
.anomalous-value { color: rgb(var(--v-theme-error)); }
.zero-value { color: v-bind(zeroTrafficColor); }
.daily-editor { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 16px 0; white-space: normal; }
.daily-editor :deep(.v-input) { flex: 1 1 180px; min-width: 0; }
.delete-target { overflow-wrap: anywhere; margin-bottom: 12px; }
@media (max-width: 600px) {
  .traffic-editor { padding: 16px; }
  .daily-editor { max-width: calc(100vw - 64px); }
}
</style>