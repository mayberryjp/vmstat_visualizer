import { createRouter, createWebHistory } from "vue-router";
import errorRoutes from "@/router/routes/errorRoutes";
import privateRoutes from "@/router/routes/privateRoutes";
import publicRoutes from "@/router/routes/publicRoutes";

const router = createRouter({
  history: createWebHistory(),
  routes: [...publicRoutes, ...privateRoutes, ...errorRoutes]
});

router.onError((err) => {
  console.error("router error", err);
  void router.push({ name: "error", query: { code: "navigation" } });
});

export default router;
