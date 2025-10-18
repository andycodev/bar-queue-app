import { createRouter, createWebHistory, type RouteLocationNormalizedLoaded, type RouteRecordRaw } from 'vue-router'

import Cliente from '../components/Cliente.vue'
import Laptop from '../components/Laptop.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/cliente/MESA1'
  },
  {
    path: '/cliente/:mesa?',
    name: 'cliente',
    component: Cliente,
    props: (route: RouteLocationNormalizedLoaded) => ({ mesa: (route.params.mesa as string) || 'MESA1' })
  },
  {
    path: '/laptop/:mesa?',
    name: 'laptop',
    component: Laptop,
    props: (route: RouteLocationNormalizedLoaded) => ({ mesa: (route.params.mesa as string) || 'ALL' })
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
