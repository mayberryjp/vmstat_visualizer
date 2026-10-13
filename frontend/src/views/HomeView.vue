<script setup lang="ts">
import { storeToRefs } from "pinia";
import { onMounted } from "vue";
import TrafficChart from "@/components/feature/TrafficChart.vue";
import { useTrafficStore } from "@/stores/traffic";

const store = useTrafficStore();
const { groups, loading, error, rangeDays } = storeToRefs(store);

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

    <v-alert
      v-else-if="groups.length === 0"
      type="info"
      variant="tonal"
    >
      No traffic snapshots in this range yet.
    </v-alert>

    <v-row v-else>
      <v-col
        v-for="group in groups"
        :key="group.key"
        cols="12"
        lg="6"
      >
        <v-card>
          <v-card-title>{{ group.hostname }} &middot; {{ group.interface }}</v-card-title>
          <v-card-subtitle>
            {{ group.sourceIp }} &middot; {{ group.days.length }} days
          </v-card-subtitle>
          <v-card-text>
            <TrafficChart :group="group" />
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
