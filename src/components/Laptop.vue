<template>
    <div class="p-4 max-w-4xl mx-auto">
        <h2 class="text-2xl font-bold mb-4">Panel de canciones - Mesa {{ mesa }}</h2>

        <!-- Mantener el contenedor del reproductor SIEMPRE en el DOM -->
        <div class="mb-4">
            <div id="player"></div>
            <div v-if="actual" class="mt-2">
                <h3 class="text-lg font-semibold">
                    Reproduciendo ahora: {{ actual.nombre }} (Mesa: {{ actual.mesa }})
                </h3>
                <button v-if="mostrarBotonPlay" @click="forzarPlay" class="bg-green-600 text-white p-2 rounded mt-2">
                    Reproducir
                </button>
                <button @click="eliminarActual" class="bg-red-500 text-white p-2 rounded mt-2">Eliminar canción</button>
            </div>
        </div>

        <h3 class="text-lg font-semibold mt-6 mb-2">Próximas canciones:</h3>
        <ul>
            <li v-for="(c, index) in cola" :key="c.key"
                class="mb-2 flex justify-between items-center border p-2 rounded">
                {{ index + 1 }}. {{ c.nombre }} (Mesa: {{ c.mesa }})
                <button @click="eliminar(c.key)" class="bg-red-500 text-white p-1 rounded">Eliminar</button>
            </li>
        </ul>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";
import { db } from "../firebase";
import { ref as dbRef, get, onChildAdded, remove } from "firebase/database";

interface Cancion {
    key: string;
    nombre: string;
    videoId: string;
    deviceId: string;
    mesa: string;
    timestamp: number;
}

const props = defineProps<{ mesa: string }>();
const cola = ref<Cancion[]>([]);
const actual = ref<Cancion | null>(null);
const mostrarBotonPlay = ref(false);
let player: any = null;
const playerReady = ref(false);

// Cargar API de YouTube
function cargarYouTubeAPI() {
    return new Promise<void>((resolve) => {
        if ((window as any).YT) return resolve();
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        // Insertar el script en el head
        document.head.appendChild(tag);
        (window as any).onYouTubeIframeAPIReady = () => resolve();
    });
}

// Reproducir siguiente canción
async function reproducirSiguiente() {
    if (!cola.value.length) {
        actual.value = null;
        return;
    }

    const siguiente = cola.value.shift()!;
    actual.value = siguiente;

    // Esperar a que el DOM pinte el contenedor #player
    await nextTick();

    if (!player) {
        // Nuevo reproductor: aún no está listo
        playerReady.value = false;
        player = new (window as any).YT.Player("player", {
            height: "315",
            width: "560",
            videoId: siguiente.videoId,
            playerVars: {
                autoplay: 1,
                playsinline: 1,
                mute: 1,
                origin: window.location.origin
            },
            events: { onReady: onPlayerReady, onStateChange: onPlayerStateChange, onError: onPlayerError }
        });
    } else {
        player.loadVideoById(siguiente.videoId);
        if (player.mute) player.mute();
        // Solo intentar play si el reproductor ya estuvo listo
        if (playerReady.value && player.playVideo) player.playVideo();
    }

    remove(dbRef(db, `mesas/${props.mesa}/cola/${siguiente.key}`));
}
// Detectar fin de video
function onPlayerStateChange(event: any) {
    const YT = (window as any).YT;
    if (event.data === YT.PlayerState.ENDED) {
        reproducirSiguiente();
    }
    // Si el autoplay fue bloqueado, mostrar botón para reproducir con gesto del usuario
    if (event.data === YT.PlayerState.UNSTARTED || event.data === YT.PlayerState.PAUSED) {
        // No intentar reproducir hasta que onReady haya ocurrido
        if (!playerReady.value) return;
        // Solo mostrar si hay una canción y el tiempo es 0 (no ha empezado)
        try {
            if (player && typeof player.getCurrentTime === 'function' && player.getCurrentTime() === 0) {
                // Reintentar iniciar tras pequeño delay
                if (player.mute) player.mute();
                setTimeout(() => {
                    try {
                        if (player && typeof player.getPlayerState === 'function') {
                            const st = player.getPlayerState();
                            if (st !== YT.PlayerState.PLAYING) {
                                mostrarBotonPlay.value = true;
                            }
                        }
                    } catch {}
                }, 500);
                mostrarBotonPlay.value = true;
            }
        } catch {}
    } else if (event.data === YT.PlayerState.PLAYING) {
        mostrarBotonPlay.value = false;
    }
}

// Preparar autoplay al estar listo el reproductor
function onPlayerReady(event: any) {
    try {
        playerReady.value = true;
        // Silenciar para cumplir políticas de autoplay en navegadores
        if (event?.target?.mute) event.target.mute();
        if (event?.target?.playVideo) event.target.playVideo();
        // Asegurar que el iframe permite autoplay
        try {
            const iframe = event?.target?.getIframe?.();
            if (iframe && iframe.setAttribute) {
                const current = iframe.getAttribute('allow') || '';
                if (!current.includes('autoplay')) {
                    iframe.setAttribute('allow', (current + '; autoplay; encrypted-media').trim());
                }
            }
        } catch {}
        // Verificar tras un breve tiempo si está reproduciendo
        setTimeout(() => {
            try {
                const YT = (window as any).YT;
                if (player && player.getPlayerState && player.getPlayerState() !== YT.PlayerState.PLAYING) {
                    if (player.playVideo) player.playVideo();
                }
            } catch {}
        }, 300);
    } catch (e) {
        // No bloquear si falla
        console.error('onPlayerReady error', e);
    }
}

// Log de errores del reproductor
function onPlayerError(event: any) {
    console.error('YouTube Player error:', event?.data, event);
    // 2: INVALID_PARAMETER, 5: HTML5 error, 100/101/150: restricciones del video
    if (event?.data === 101 || event?.data === 150) {
        // El propietario no permite reproducción embebida: pasar a la siguiente
        mostrarBotonPlay.value = false;
        // Dar un pequeño margen para que el DOM y la cola se estabilicen
        setTimeout(() => {
            reproducirSiguiente();
        }, 0);
        return;
    }
    mostrarBotonPlay.value = true;
}

// Eliminar canción de la cola desde la lista
function eliminar(key: string) {
    remove(dbRef(db, `mesas/${props.mesa}/cola/${key}`));
    cola.value = cola.value.filter(c => c.key !== key);
}

// Eliminar la que se está reproduciendo
function eliminarActual() {
    if (actual.value) {
        remove(dbRef(db, `mesas/${props.mesa}/cola/${actual.value.key}`));
        actual.value = null;
        reproducirSiguiente();
    }
}

// Forzar play cuando el navegador bloquea autoplay
function forzarPlay() {
    try {
        if (player?.playVideo) player.playVideo();
        mostrarBotonPlay.value = false;
    } catch (e) {
        console.error('forzarPlay error', e);
    }
}

onMounted(async () => {
    await cargarYouTubeAPI();

    const colaRef = dbRef(db, `mesas/${props.mesa}/cola`);

    // Cargar todas las canciones existentes
    const snapshot = await get(colaRef);
    if (snapshot.exists()) {
        const datos = snapshot.val();
        cola.value = Object.keys(datos)
            .map(key => ({ key, ...datos[key] }))
            .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    }

    // Escuchar nuevas canciones en tiempo real
    onChildAdded(colaRef, (snapshot) => {
        const data = snapshot.val();
        if (!cola.value.find(c => c.key === snapshot.key)) {
            cola.value.push({ key: snapshot.key!, ...data });
            // Mantener orden por timestamp
            cola.value.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
        }
        // Si no hay canción reproduciéndose, empezar
        if (!actual.value) reproducirSiguiente();
    });

    // Si ya hay canciones al iniciar y no hay actual, reproducir
    if (!actual.value && cola.value.length) reproducirSiguiente();
});
</script>

<style scoped>
#player {
    max-width: 100%;
}
</style>