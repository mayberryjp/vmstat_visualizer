<script setup lang="ts">
const appName = import.meta.env.VITE_APP_NAME || "vnstat visualizer";
</script>

<template>
  <v-app-bar
    flat
    density="comfortable"
  >
    <v-app-bar-title>
      <v-icon
        icon="mdi-chart-bar"
        class="mr-2"
      />
      {{ appName }}
    </v-app-bar-title>
  </v-app-bar>
</template>
