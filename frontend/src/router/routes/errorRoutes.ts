import type { RouteRecordRaw } from "vue-router";

const errorRoutes: RouteRecordRaw[] = [
  {
    path: "/error",
    name: "error",
    component: () => import("@/views/ErrorView.vue")
  },
  {
    path: "/:pathMatch(.*)*",
    redirect: { name: "error", query: { code: "not_found" } }
  }
];

export default errorRoutes;
