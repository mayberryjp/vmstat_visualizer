import type { RouteRecordRaw } from "vue-router";

const publicRoutes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: () => import("@/views/HomeView.vue")
  },
  {
    path: "/traffic/:hostname/:interface",
    name: "traffic-editor",
    component: () => import("@/views/TrafficEditorView.vue")
  }
];

export default publicRoutes;
