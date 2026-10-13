<script setup lang="ts">
import AppHeader from "@/components/layout/AppHeader.vue";
</script>

<template>
  <v-app>
    <AppHeader />
    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>
