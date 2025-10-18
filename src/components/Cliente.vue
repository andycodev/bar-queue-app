<template>
    <div class="p-4 max-w-md mx-auto">
        <h2 class="text-xl font-bold mb-4">Buscar Canción - Mesa {{ mesa }}</h2>

        <input v-model="query" placeholder="Nombre de la canción" class="border p-2 rounded w-full"
            :disabled="yaAgrego" />
        <button @click="buscar" class="bg-blue-500 text-white p-2 rounded mt-2 w-full" :disabled="yaAgrego">
            Buscar
        </button>

        <div v-if="miCancion" class="p-2 border rounded my-2 bg-green-100 flex justify-between items-center">
            <div>
                <strong>Tu canción agregada:</strong> {{ miCancion.snippet.title }}
            </div>
            <button @click="cambiarCancion" class="bg-red-500 text-white p-1 rounded">Cambiar</button>
        </div>

        <p v-if="yaAgrego" class="text-sm text-blue-700 bg-blue-50 border border-blue-200 p-2 rounded">
            Tienes una canción por escuchar. Si deseas cambiarla, primero elimínala con el botón
            <strong>"Cambiar"</strong> y luego podrás agregar una nueva y esperar tu turno.
        </p>

        <div v-if="mensaje" class="text-sm text-green-700 bg-green-50 border border-green-200 p-2 rounded mt-2">
            {{ mensaje }}
        </div>

        <div v-for="item in resultados" :key="item.id.videoId"
            class="p-2 border rounded my-2 flex justify-between items-center">
            <div class="flex items-center">
                <img :src="item.snippet.thumbnails.default.url" class="mr-2" />
                <span>{{ item.snippet.title }}</span>
            </div>
            <button @click="agregar(item)" :disabled="yaAgrego"
                class="bg-green-500 text-white p-1 rounded disabled:bg-gray-400">
                Agregar
            </button>
        </div>

        <p v-if="error" class="text-red-500 mt-2">{{ error }}</p>

        <div class="mt-6">
            <h3 class="text-lg font-semibold mb-2">Próximas canciones (Mesa {{ mesa }}):</h3>
            <ul v-if="cola.length > 0" class="space-y-2">
                <li v-for="(c, index) in cola" :key="c.key" class="border p-2 rounded flex justify-between items-center">
                    <span>{{ index + 1 }}. {{ c.nombre }} (Mesa: {{ c.mesa }})</span>
                </li>
            </ul>
            <p v-else class="text-sm text-gray-600">No hay canciones en la cola.</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { db } from "../firebase";
import { push, ref as dbRef, get, remove, onChildAdded, onChildRemoved } from "firebase/database";

interface YoutubeItem {
    id: { videoId: string };
    snippet: { title: string; thumbnails: { default: { url: string } } };
}

// Estructura de los elementos guardados en Firebase
interface ColaItem {
    nombre: string;
    videoId: string;
    deviceId: string;
    mesa: string;
    estado: string;
    timestamp: number;
}
interface ColaItemWithKey extends ColaItem { key: string }

const props = defineProps<{ mesa: string }>();
const query = ref<string>("");
const resultados = ref<YoutubeItem[]>([]);
const yaAgrego = ref(false);
const miCancion = ref<YoutubeItem | null>(null);
const error = ref<string>("");
const mensaje = ref<string>("");
const cola = ref<ColaItemWithKey[]>([]);

let deviceId = "";

onMounted(async () => {
    deviceId = localStorage.getItem("deviceId") || Math.random().toString(36).substring(2, 9);
    localStorage.setItem("deviceId", deviceId);

    await cargarCancionExistente();

    // Cargar y escuchar la cola de esta mesa
    try {
        const colaRef = dbRef(db, `mesas/${props.mesa}/cola`);
        const snapshot = await get(colaRef);
        if (snapshot.exists()) {
            const raw = snapshot.val() as Record<string, ColaItem>;
            cola.value = Object.entries(raw)
                .map(([key, val]) => ({ key, ...val }))
                .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
        }
        onChildAdded(colaRef, (snap) => {
            const data = snap.val() as ColaItem;
            const nuevo: ColaItemWithKey = { key: snap.key!, ...data };
            if (!cola.value.find(c => c.key === nuevo.key)) cola.value.push(nuevo);
            cola.value.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
            // Recalcular estado del dispositivo en tiempo real
            const mias = cola.value.filter(c => c.deviceId === deviceId);
            yaAgrego.value = mias.length >= 1;
            if (mias.length > 0) {
                const ultima = mias[mias.length - 1]!;
                miCancion.value = {
                    id: { videoId: ultima.videoId },
                    snippet: { title: ultima.nombre, thumbnails: { default: { url: "" } } },
                };
            }
        });
        onChildRemoved(colaRef, (snap) => {
            cola.value = cola.value.filter(c => c.key !== snap.key);
            // Recalcular estado del dispositivo en tiempo real (p.ej. cuando empieza a reproducirse se remueve de cola)
            const mias = cola.value.filter(c => c.deviceId === deviceId);
            yaAgrego.value = mias.length >= 1;
            if (mias.length > 0) {
                const ultima = mias[mias.length - 1]!;
                miCancion.value = {
                    id: { videoId: ultima.videoId },
                    snippet: { title: ultima.nombre, thumbnails: { default: { url: "" } } },
                };
            } else {
                miCancion.value = null;
            }
        });
    } catch (e) {
        console.error(e);
    }
});

async function cargarCancionExistente() {
    try {
        const colaRef = dbRef(db, `mesas/${props.mesa}/cola`);
        const snapshot = await get(colaRef);
        if (snapshot.exists()) {
            const raw = snapshot.val() as Record<string, ColaItem>;
            const mias = Object.values(raw).filter((c) => c.deviceId === deviceId);
            // Deshabilitar agregar si ya hay 1 o más (solo una canción por dispositivo)
            yaAgrego.value = mias.length >= 1;
            if (mias.length > 0) {
                const ultima = mias[mias.length - 1];
                if (ultima) {
                    miCancion.value = {
                        id: { videoId: ultima.videoId },
                        snippet: { title: ultima.nombre, thumbnails: { default: { url: "" } } },
                    };
                }
            }
        }
    } catch (e) {
        console.error(e);
        error.value = "Error al leer la cola";
    }
}
async function buscar() {
    if (!query.value) return;
    error.value = "";
    try {
        const res = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(
                query.value
            )}&videoEmbeddable=true&videoSyndicated=true&key=${import.meta.env.VITE_YOUTUBE_API_KEY}`
        );
        const data = await res.json();
        if (data.error) {
            error.value = data.error.message || "Error al buscar en YouTube";
            return;
        }
        const items = (data.items || []) as YoutubeItem[];
        if (!items.length) {
            resultados.value = [];
            return;
        }

        // Validar embebibilidad con Videos API (status.embeddable)
        const ids = items.map(i => i.id.videoId).join(",");
        const resVideos = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=status&id=${ids}&key=${import.meta.env.VITE_YOUTUBE_API_KEY}`
        );
        const dataVideos = await resVideos.json();
        const embeddableSet = new Set<string>();
        for (const v of dataVideos.items || []) {
            if (v?.status?.embeddable) embeddableSet.add(v.id);
        }
        resultados.value = items.filter(i => embeddableSet.has(i.id.videoId));
    } catch (e: any) {
        console.error(e);
        error.value = "Error al conectar con YouTube API";
    }
}

async function agregar(item: YoutubeItem) {
    if (yaAgrego.value) return;

    try {
        // Limitar a máximo 1 por dispositivo
        const colaRef = dbRef(db, `mesas/${props.mesa}/cola`);
        const snapshot = await get(colaRef);
        let count = 0;
        if (snapshot.exists()) {
            const canciones = snapshot.val() as Record<string, ColaItem>;
            count = Object.values(canciones).reduce((acc, c) => acc + (c && c.deviceId === deviceId ? 1 : 0), 0);
        }
        if (count >= 1) {
            error.value = "Tu canción ya está en la cola. Si deseas cambiarla, presiona 'Cambiar' para eliminarla y luego agrega otra.";
            yaAgrego.value = true;
            return;
        }

        await push(colaRef, {
            nombre: item.snippet.title,
            videoId: item.id.videoId,
            deviceId: deviceId,
            mesa: props.mesa,
            estado: "pendiente",
            timestamp: Date.now(),
        });
        // Recalcular si ya llegó al tope (1 por dispositivo)
        yaAgrego.value = count + 1 >= 1;
        miCancion.value = item;
    } catch (e) {
        console.error(e);
        error.value = "No se pudo agregar la canción";
    }
}

async function cambiarCancion() {
    try {
        // Confirmación previa
        const ok = window.confirm("¿Eliminar tu canción actual de la cola?");
        if (!ok) return;

        const colaRef = dbRef(db, `mesas/${props.mesa}/cola`);
        const snapshot = await get(colaRef);
        if (snapshot.exists()) {
            const canciones = snapshot.val() as Record<string, ColaItem>;
            for (const key in canciones) {
                const item = canciones[key];
                if (item && item.deviceId === deviceId) {
                    await remove(dbRef(db, `mesas/${props.mesa}/cola/${key}`));
                }
            }
        }
        yaAgrego.value = false;
        miCancion.value = null;
        resultados.value = [];
        error.value = "";
        mensaje.value = "Tu canción fue eliminada. Ya puedes agregar una nueva.";
    } catch (e) {
        console.error(e);
        error.value = "No se pudo cambiar la canción";
        mensaje.value = "";
    }
}
</script>