<script setup lang="ts">
const appName = import.meta.env.VITE_APP_NAME || "vnstat visualizer";
const faviconUrl = `${import.meta.env.BASE_URL}favicon.svg`;
</script>

<template>
  <v-app-bar
    flat
    density="comfortable"
  >
    <v-app-bar-title>
      <img
        :src="faviconUrl"
        alt=""
        width="32"
        height="32"
        class="mr-2"
        style="vertical-align: middle"
      >
      {{ appName }}
    </v-app-bar-title>
  </v-app-bar>
</template>
