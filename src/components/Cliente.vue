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
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { db } from "../firebase";
import { push, ref as dbRef, get, remove } from "firebase/database";

interface YoutubeItem {
    id: { videoId: string };
    snippet: { title: string; thumbnails: { default: { url: string } } };
}

const props = defineProps<{ mesa: string }>();
const query = ref<string>("");
const resultados = ref<YoutubeItem[]>([]);
const yaAgrego = ref(false);
const miCancion = ref<YoutubeItem | null>(null);
const error = ref<string>("");

let deviceId = "";

onMounted(async () => {
    deviceId = localStorage.getItem("deviceId") || Math.random().toString(36).substring(2, 9);
    localStorage.setItem("deviceId", deviceId);

    await cargarCancionExistente();
});

async function cargarCancionExistente() {
    try {
        const colaRef = dbRef(db, `mesas/${props.mesa}/cola`);
        const snapshot = await get(colaRef);
        if (snapshot.exists()) {
            const datos = Object.values(snapshot.val()).find((c: any) => c.deviceId === deviceId);
            if (datos) {
                yaAgrego.value = true;
                miCancion.value = {
                    id: { videoId: datos.videoId },
                    snippet: { title: datos.nombre, thumbnails: { default: { url: "" } } },
                };
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
        await push(dbRef(db, `mesas/${props.mesa}/cola`), {
            nombre: item.snippet.title,
            videoId: item.id.videoId,
            deviceId: deviceId,
            mesa: props.mesa,
            estado: "pendiente",
            timestamp: Date.now(),
        });
        yaAgrego.value = true;
        miCancion.value = item;
    } catch (e) {
        console.error(e);
        error.value = "No se pudo agregar la canción";
    }
}

async function cambiarCancion() {
    try {
        const colaRef = dbRef(db, `mesas/${props.mesa}/cola`);
        const snapshot = await get(colaRef);
        if (snapshot.exists()) {
            const canciones = snapshot.val();
            for (const key in canciones) {
                if (canciones[key].deviceId === deviceId) {
                    await remove(dbRef(db, `mesas/${props.mesa}/cola/${key}`));
                }
            }
        }
        yaAgrego.value = false;
        miCancion.value = null;
        resultados.value = [];
    } catch (e) {
        console.error(e);
        error.value = "No se pudo cambiar la canción";
    }
}
</script>