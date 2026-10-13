<script setup lang="ts">
import type { ApexOptions } from "apexcharts";
import { computed } from "vue";
import { useTheme } from "vuetify";
import VueApexCharts from "vue3-apexcharts";
import { formatBytes } from "@/composables/useFormat";
import type { DeviceGroup } from "@/types/domain";

const props = defineProps<{ group: DeviceGroup }>();

const theme = useTheme();

const series = computed(() => [
  { name: "Received", data: props.group.days.map((d) => d.rx_bytes) },
  { name: "Sent", data: props.group.days.map((d) => d.tx_bytes) }
]);

const options = computed<ApexOptions>(() => {
  const colors = theme.current.value.colors;
  return {
    chart: { type: "bar", toolbar: { show: false }, background: "transparent" },
    theme: { mode: theme.current.value.dark ? "dark" : "light" },
    colors: [colors.primary, colors.success],
    plotOptions: { bar: { columnWidth: "60%", borderRadius: 2 } },
    dataLabels: { enabled: false },
    legend: { position: "top" },
    xaxis: { categories: props.group.days.map((d) => d.day), type: "category" },
    yaxis: { labels: { formatter: (v: number) => formatBytes(v) } },
    tooltip: { y: { formatter: (v: number) => formatBytes(v) } }
  };
});
</script>

<template>
  <VueApexCharts
    type="bar"
    height="300"
    :options="options"
    :series="series"
  />
</template>
