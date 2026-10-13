import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "@/App.vue";
import vuetify from "@/plugins/vuetify";
import router from "@/router";

import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import "@/assets/styles/tokens.css";
import "@/assets/styles/globals.css";

const app = createApp(App);
app.use(router);
app.use(createPinia());
app.use(vuetify);
app.mount("#app");
