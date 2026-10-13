<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();

const message = computed(() =>
  route.query.code === "not_found" ? "Page not found." : "Something went wrong."
);
</script>

<template>
  <v-container class="page">
    <v-alert
      type="error"
      variant="tonal"
    >
      {{ message }}
      <template #append>
        <v-btn
          variant="text"
          :to="{ name: 'home' }"
        >
          Home
        </v-btn>
      </template>
    </v-alert>
  </v-container>
</template>
