<script setup lang="ts">
import type { ApexOptions } from "apexcharts";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useTheme } from "vuetify";
import VueApexCharts from "vue3-apexcharts";
import { formatBytes } from "@/composables/useFormat";
import { findTrafficAnomalies, trafficFields } from "@/composables/useTrafficAnomalies";
import type { DeviceGroup } from "@/types/domain";

const props = defineProps<{ group: DeviceGroup; fit?: boolean }>();
const anomalies = computed(() => findTrafficAnomalies(props.group.days));

const theme = useTheme();
const container = ref<HTMLElement>();
const size = ref({ width: 0, height: 0 });
let observer: ResizeObserver | undefined;

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (entry) {
      size.value = {
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height)
      };
    }
  });
  if (container.value) observer.observe(container.value);
});
onBeforeUnmount(() => observer?.disconnect());

const series = computed(() => [
  { name: "Received", type: "line", data: props.group.days.map((d) => d.rx_bytes) },
  { name: "Sent", type: "line", data: props.group.days.map((d) => d.tx_bytes) }
]);

const options = computed<ApexOptions>(() => {
  const colors = theme.current.value.colors;
  const dark = theme.current.value.dark;
  const axisText = colors["on-surface"];
  const gridLine = dark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)";
  const warningColor = colors.error || "#d32f2f";

  return {
    chart: {
      type: "line",
      background: "transparent",
      parentHeightOffset: 0,
      redrawOnParentResize: true,
      sparkline: { enabled: props.fit && (size.value.height < 120 || size.value.width < 200) },
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: !props.fit, easing: "easeinout", speed: 800 }
    },
    theme: { mode: dark ? "dark" : "light" },
    colors: [colors.primary, colors.success],
    stroke: { curve: "smooth", width: 3, lineCap: "round" },
    markers: {
      size: 4, strokeWidth: 0, hover: { size: 6 },
      discrete: props.group.days.flatMap((day, dataPointIndex) =>
        trafficFields.flatMap((field, seriesIndex) => anomalies.value.get(day.day)?.has(field)
          ? [{ seriesIndex, dataPointIndex, fillColor: warningColor, strokeColor: warningColor, size: 7 }]
          : [])
      )
    },
    annotations: {
      points: props.group.days.filter((day) => anomalies.value.has(day.day)).map((day) => ({
        x: day.day,
        y: Math.max(...trafficFields.filter((field) => anomalies.value.get(day.day)!.has(field)).map((field) => day[field])),
        marker: { size: 0 },
        label: { text: "!", borderColor: warningColor, offsetY: -12, style: { background: warningColor, color: "#ffffff" } }
      }))
    },
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
    tooltip: {
      theme: dark ? "dark" : "light", shared: true,
      y: { formatter: (value: number, context?: { seriesIndex: number; dataPointIndex: number }) => {
        const day = context ? props.group.days[context.dataPointIndex] : undefined;
        const field = context ? trafficFields[context.seriesIndex] : undefined;
        return `${formatBytes(value)}${day && field && anomalies.value.get(day.day)?.has(field) ? " - Warning: 10x or more than other days' average" : ""}`;
      } }
    },
    responsive: props.fit ? [] : [
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
  <div ref="container">
    <!-- The chart wrapper cannot safely update width and height together; remount atomically. -->
    <VueApexCharts
      v-if="!fit || (size.width > 0 && size.height > 0)"
      :key="fit ? `${size.width}x${size.height}` : 'rows'"
      type="line"
      :width="fit ? size.width : '100%'"
      :height="fit ? size.height : 320"
      :options="options"
      :series="series"
    />
  </div>
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
