<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const appName = import.meta.env.VITE_APP_NAME || "vnstat visualizer";
const faviconUrl = `${import.meta.env.BASE_URL}favicon.svg`;
const content = ref<HTMLElement>();
const height = ref(64);
let observer: ResizeObserver | undefined;

onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    if (entry) height.value = Math.ceil(entry.target.getBoundingClientRect().height);
  });
  if (content.value) observer.observe(content.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <v-app-bar
    flat
    :height="height"
  >
    <div
      ref="content"
      class="header-content"
    >
      <div class="header-brand">
        <img
          :src="faviconUrl"
          alt=""
          width="32"
          height="32"
        >
        <span>{{ appName }}</span>
      </div>
      <div id="header-controls" />
    </div>
  </v-app-bar>
</template>

<style scoped>
.header-content {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 24px;
  width: 100%;
  padding: 8px 16px;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 1.125rem;
}

.header-brand span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

#header-controls {
  flex: 1 1 600px;
  min-width: 0;
}
</style>
