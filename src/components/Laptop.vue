<template>
    <div class="p-4 max-w-4xl mx-auto">
        <h2 class="text-2xl font-bold mb-4">
            Panel de canciones - {{ mesa === 'ALL' ? 'Todas las mesas' : `Mesa ${mesa}` }}
        </h2>

        <!-- Mantener el contenedor del reproductor SIEMPRE en el DOM -->
        <div class="mb-4">
            <div id="player"></div>
            <div v-if="actual" class="mt-2">
                <h3 class="text-lg font-semibold">
                    Reproduciendo ahora: {{ actual.nombre }} (Mesa: {{ actual.mesa }})
                </h3>
                <!-- Controles de sonido -->
                <div class="flex items-center gap-3 mt-2">
                    <div class="flex items-center gap-2">
                        <label class="text-sm">Volumen</label>
                        <input type="range" min="0" max="100" step="1" v-model.number="volumen" @input="aplicarVolumen" />
                        <span class="text-sm">{{ volumen }}%</span>
                    </div>
                    <button v-if="!sonidoDesbloqueado" @click="desbloquearSonido" class="bg-blue-600 text-white p-2 rounded">
                        Activar sonido
                    </button>
                </div>
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
import { ref, onMounted, nextTick, watch } from "vue";
import { db } from "../firebase";
import { ref as dbRef, get, onChildAdded, onChildRemoved, remove, set } from "firebase/database";

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
const volumen = ref(100);
const sonidoDesbloqueado = ref(false);
const mesasSuscritas = ref<Set<string>>(new Set());
const panelActualRef = dbRef(db, 'panel/actual');

function cargarPreferenciasAudio() {
    try {
        const rawVol = localStorage.getItem('audioVolume');
        const rawUnlocked = localStorage.getItem('audioUnlocked');
        if (rawVol == null) {
            volumen.value = 80; // default
            localStorage.setItem('audioVolume', String(volumen.value));
        } else {
            const vol = Number(rawVol);
            if (!Number.isNaN(vol)) volumen.value = Math.min(100, Math.max(0, vol));
        }
        if (rawUnlocked == null) {
            sonidoDesbloqueado.value = true; // default to unlocked once on first run
            localStorage.setItem('audioUnlocked', 'true');
        } else {
            sonidoDesbloqueado.value = rawUnlocked === 'true';
        }
    } catch {}
}

function guardarPreferenciasAudio() {
    try {
        localStorage.setItem('audioVolume', String(volumen.value));
        localStorage.setItem('audioUnlocked', sonidoDesbloqueado.value ? 'true' : 'false');
    } catch {}
}

function aplicarVolumen() {
    try {
        if (player && typeof player.unMute === 'function') player.unMute();
        if (player && typeof player.setVolume === 'function') player.setVolume(volumen.value);
        guardarPreferenciasAudio();
    } catch {}
}

// (Función de habilitar sonido eliminada: el audio está siempre activo)
function desbloquearSonido() {
    try {
        sonidoDesbloqueado.value = true;
        guardarPreferenciasAudio();
        if (player?.unMute) player.unMute();
        if (player?.setVolume) player.setVolume(volumen.value);
        if (player?.playVideo) player.playVideo();
    } catch {}
}

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
        // Limpiar estado del panel si no hay más canciones
        try { await set(panelActualRef, null); } catch {}
        return;
    }

    const siguiente = cola.value.shift()!;
    actual.value = siguiente;
    // Guardar estado actual en backend con timestamp de inicio
    try { await set(panelActualRef, { ...siguiente, startedAt: Date.now() }); } catch {}

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
                mute: sonidoDesbloqueado.value ? 0 : 1,
                origin: window.location.origin
            },
            events: { onReady: onPlayerReady, onStateChange: onPlayerStateChange, onError: onPlayerError }
        });
    } else {
        player.loadVideoById(siguiente.videoId);
        if (sonidoDesbloqueado.value) {
            if (player.unMute) player.unMute();
            if (player.setVolume) player.setVolume(volumen.value);
        } else {
            if (player.mute) player.mute();
        }
        // Solo intentar play si el reproductor ya estuvo listo
        if (playerReady.value && player.playVideo) player.playVideo();
    }

    // Eliminar del backend usando la mesa del elemento
    remove(dbRef(db, `mesas/${siguiente.mesa}/cola/${siguiente.key}`));
}
// Detectar fin de video
function onPlayerStateChange(event: any) {
    const YT = (window as any).YT;
    if (event.data === YT.PlayerState.ENDED) {
        try { set(panelActualRef, null); } catch {}
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
        // Asegurar volumen activo al iniciar reproducción si está desbloqueado
        try {
            if (sonidoDesbloqueado.value) {
                if (player?.unMute) player.unMute();
                if (player?.setVolume) player.setVolume(volumen.value);
            }
        } catch {}
    }
}

// Preparar autoplay al estar listo el reproductor
function onPlayerReady(event: any) {
    try {
        playerReady.value = true;
        // Autoplay: si está desbloqueado, activar sonido; si no, mantener mute
        if (sonidoDesbloqueado.value) {
            if (event?.target?.unMute) event.target.unMute();
            if (event?.target?.setVolume) event.target.setVolume(volumen.value);
        } else {
            if (event?.target?.mute) event.target.mute();
        }
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
            try { set(panelActualRef, null); } catch {}
            reproducirSiguiente();
        }, 0);
        return;
    }
    mostrarBotonPlay.value = true;
}

// Eliminar canción de la cola desde la lista
function eliminar(key: string) {
    const c = cola.value.find(x => x.key === key);
    if (c) {
        remove(dbRef(db, `mesas/${c.mesa}/cola/${key}`));
        cola.value = cola.value.filter(x => x.key !== key);
    }
}

// Eliminar la que se está reproduciendo
function eliminarActual() {
    if (actual.value) {
        remove(dbRef(db, `mesas/${actual.value.mesa}/cola/${actual.value.key}`));
        try { set(panelActualRef, null); } catch {}
        actual.value = null;
        reproducirSiguiente();
    }
}

// Deduplicar por dispositivo: conservar la primera (menor timestamp) y eliminar el resto
function deduplicarPorDispositivo() {
    const porDispositivo: Record<string, Cancion[]> = {};
    for (const c of cola.value) {
        (porDispositivo[c.deviceId] ||= []).push(c);
    }
    for (const deviceId in porDispositivo) {
        const list = porDispositivo[deviceId];
        if (!list || list.length === 0) continue;
        const arr = [...list].sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
        const keep = arr[0]!;
        if (arr.length > 1) {
            for (let i = 1; i < arr.length; i++) {
                const drop = arr[i]!;
                remove(dbRef(db, `mesas/${drop.mesa}/cola/${drop.key}`));
                cola.value = cola.value.filter(c => c.key !== drop.key);
            }
        }
        // Asegurar que el keep esté en la cola (por si fue removido accidentalmente)
        if (!cola.value.find(c => c.key === keep.key)) {
            cola.value.push(keep);
        }
    }
    cola.value.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
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
    cargarPreferenciasAudio();

    async function suscribirMesa(mesaId: string) {
        if (!mesaId || mesasSuscritas.value.has(mesaId)) return;
        mesasSuscritas.value.add(mesaId);
        const colaRef = dbRef(db, `mesas/${mesaId}/cola`);

        // Cargar existentes
        const snapshot = await get(colaRef);
        if (snapshot.exists()) {
            const datos = snapshot.val();
            const items = Object.keys(datos).map(key => ({ key, ...datos[key] })) as Cancion[];
            for (const it of items) {
                if (!cola.value.find(c => c.key === it.key)) cola.value.push(it);
            }
            cola.value.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
        }

        // Altas en tiempo real
        onChildAdded(colaRef, (snapshot) => {
            const data = snapshot.val();
            const nuevo: Cancion = { key: snapshot.key!, ...data };
            const existente = cola.value.find(c => c.deviceId === nuevo.deviceId);
            if (existente) {
                const keep = (existente.timestamp ?? 0) <= (nuevo.timestamp ?? 0) ? existente : nuevo;
                const drop = keep === existente ? nuevo : existente;
                if (!cola.value.find(c => c.key === keep.key)) cola.value.push(keep);
                remove(dbRef(db, `mesas/${drop.mesa}/cola/${drop.key}`));
                cola.value = cola.value.filter(c => c.key !== drop.key);
            } else {
                if (!cola.value.find(c => c.key === nuevo.key)) cola.value.push(nuevo);
            }
            cola.value.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
            if (!actual.value) reproducirSiguiente();
        });

        // Bajas en tiempo real
        onChildRemoved(colaRef, (snapshot) => {
            const removedKey = snapshot.key;
            if (!removedKey) return;
            const beforeLen = cola.value.length;
            cola.value = cola.value.filter(c => c.key !== removedKey);
            if (beforeLen !== cola.value.length && !actual.value && cola.value.length) {
                reproducirSiguiente();
            }
        });
    }

    if (props.mesa === 'ALL') {
        // Suscribirse a todas las mesas existentes y futuras
        const mesasRef = dbRef(db, 'mesas');
        const mesasSnap = await get(mesasRef);
        if (mesasSnap.exists()) {
            const mesasObj = mesasSnap.val() as Record<string, any>;
            for (const mesaId of Object.keys(mesasObj)) {
                await suscribirMesa(mesaId);
            }
        }
        onChildAdded(mesasRef, (snap) => {
            const mesaId = snap.key!;
            suscribirMesa(mesaId);
        });
    } else {
        // Modo mesa única
        await suscribirMesa(props.mesa);
    }

    // Deduplicar existentes y luego iniciar si corresponde
    deduplicarPorDispositivo();
    // Intentar reanudar desde panel/actual
    try {
        const snap = await get(panelActualRef);
        if (snap.exists()) {
            const act = snap.val();
            if (act && act.videoId) {
                actual.value = act;
                await nextTick();
                playerReady.value = false;
                const elapsed = Math.max(0, Math.floor((Date.now() - (act.startedAt ?? Date.now())) / 1000));
                player = new (window as any).YT.Player("player", {
                    height: "315",
                    width: "560",
                    videoId: act.videoId,
                    playerVars: {
                        autoplay: 1,
                        playsinline: 1,
                        mute: sonidoDesbloqueado.value ? 0 : 1,
                        start: elapsed,
                        origin: window.location.origin
                    },
                    events: { onReady: onPlayerReady, onStateChange: onPlayerStateChange, onError: onPlayerError }
                });
            }
        }
    } catch {}
    // Si no había estado previo, arrancar normalmente
    if (!actual.value && cola.value.length) reproducirSiguiente();
});

watch(volumen, () => {
    aplicarVolumen();
});
</script>

<style scoped>
#player {
    max-width: 100%;
}
</style>