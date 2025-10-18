<template>
  <div>
    <Cliente v-if="pagina === 'cliente'" :mesa="mesa" />
    <Laptop v-else :mesa="mesa" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import Cliente from "./components/Cliente.vue";
import Laptop from "./components/Laptop.vue";

const pagina = ref<'cliente' | 'laptop'>('cliente'); // Default cliente
const mesa = ref('MESA1'); // Default

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  pagina.value = (params.get('pagina') as 'cliente' | 'laptop') || 'cliente';
  mesa.value = params.get('mesa') || 'MESA1';
});
</script>
