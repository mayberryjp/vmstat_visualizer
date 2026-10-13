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
  { name: "Received", type: "line", data: props.group.days.map((d) => d.rx_bytes) },
  { name: "Sent", type: "line", data: props.group.days.map((d) => d.tx_bytes) }
]);

const options = computed<ApexOptions>(() => {
  const colors = theme.current.value.colors;
  const dark = theme.current.value.dark;
  const axisText = colors["on-surface"];
  const gridLine = dark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)";

  return {
    chart: {
      type: "line",
      background: "transparent",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, easing: "easeinout", speed: 800 }
    },
    theme: { mode: dark ? "dark" : "light" },
    colors: [colors.primary, colors.success],
    stroke: { curve: "smooth", width: 3, lineCap: "round" },
    markers: { size: 4, strokeWidth: 0, hover: { size: 6 } },
    dataLabels: { enabled: false },
    grid: { borderColor: gridLine, strokeDashArray: 4 },
    legend: {
      position: "top",
      horizontalAlign: "right",
      labels: { colors: axisText },
      markers: { size: 6 }
    },
    xaxis: {
      categories: props.group.days.map((d) => d.day),
      type: "category",
      tickPlacement: "on",
      labels: { rotate: -45, hideOverlappingLabels: true, style: { colors: axisText } },
      axisBorder: { color: gridLine },
      axisTicks: { color: gridLine }
    },
    yaxis: {
      min: 0,
      labels: { style: { colors: axisText }, formatter: (v: number) => formatBytes(v) }
    },
    tooltip: { theme: dark ? "dark" : "light", shared: true, y: { formatter: formatBytes } },
    responsive: [
      {
        breakpoint: 600,
        options: {
          chart: { height: 260 },
          legend: { position: "bottom", horizontalAlign: "center" },
          xaxis: { labels: { show: false } }
        }
      }
    ]
  };
});
</script>

<template>
  <VueApexCharts
    type="line"
    height="320"
    :options="options"
    :series="series"
  />
</template>

<style scoped>
:deep(.apexcharts-tooltip) {
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.4) !important;
  border: none !important;
}

:deep(.apexcharts-tooltip-title) {
  border-bottom: 1px solid rgba(128, 128, 128, 0.3) !important;
}
</style>
