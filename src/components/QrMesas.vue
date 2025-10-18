<template>
  <div class="p-6">
    <h1 class="text-2xl font-bold mb-4">QR por mesa (Cliente)</h1>

    <div class="mb-4 flex items-center gap-2">
      <label class="font-medium">Prefijo URL:</label>
      <input
        v-model="base"
        class="border p-2 rounded w-full max-w-xl"
        placeholder="https://tu-dominio"
      />
      <button class="px-3 py-2 bg-gray-200 rounded" @click="resetBase">Usar actual</button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 print:grid-cols-3">
      <div
        v-for="mesaId in mesas"
        :key="mesaId"
        class="border rounded p-4 flex flex-col items-center gap-3 print:break-inside-avoid"
      >
        <div class="text-lg font-semibold">{{ mesaId }}</div>
        <QrcodeVue :value="qrUrl(mesaId)" :size="200" level="M"/>
        <div class="text-xs break-all text-center">{{ qrUrl(mesaId) }}</div>
      </div>
    </div>

    <div class="mt-6 flex gap-3">
      <button class="bg-blue-600 text-white px-4 py-2 rounded" @click="handlePrint">Imprimir</button>
      <button class="bg-gray-600 text-white px-4 py-2 rounded" @click="toggleTipo">Tipo: {{ tipo.toUpperCase() }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import QrcodeVue from 'qrcode.vue'

// Ajusta esta lista según tus mesas
const mesas = ref<string[]>([
  'MESA1', 'MESA2', 'MESA3', 'MESA4', 'MESA5', 'MESA6', 'MESA7', 'MESA8'
])

// Tipo de QR: clientes por mesa o panel principal (laptop único)
const tipo = ref<'cliente' | 'laptop'>('cliente')

const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : ''
const base = ref<string>(defaultOrigin)

function resetBase() {
  base.value = defaultOrigin
}

function qrUrl(mesaId: string) {
  // Construir rutas del router en lugar de query params
  if (tipo.value === 'laptop') {
    return new URL('/laptop', base.value).toString()
  }
  return new URL(`/cliente/${encodeURIComponent(mesaId)}`, base.value).toString()
}

function toggleTipo() {
  tipo.value = tipo.value === 'cliente' ? 'laptop' : 'cliente'
}

function handlePrint() {
  if (typeof window !== 'undefined') {
    window.print()
  }
}
</script>

<style>
@media print {
  .print\:grid-cols-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .print\:break-inside-avoid {
    break-inside: avoid;
  }
}
</style>
