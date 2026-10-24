import type { RouteRecordRaw } from "vue-router";

const publicRoutes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: () => import("@/views/HomeView.vue")
  },
  {
    path: "/traffic/:hostname/:interface",
    redirect: (to) => ({ name: "traffic-editor", params: to.params, query: to.query })
  },
  {
    path: "/:hostname/:interface/change",
    name: "traffic-editor",
    component: () => import("@/views/TrafficEditorView.vue")
  },
  {
    path: "/:hostname/:interface",
    name: "interface",
    component: () => import("@/views/HomeView.vue")
  },
  {
    path: "/:hostname",
    name: "host",
    component: () => import("@/views/HomeView.vue")
  }
];

export default publicRoutes;
