// Persistencia en localStorage y rebuild
import { createRoom, rebuildOpening } from './creation.js';
import { renderEdges, renderTolerance } from './door.js';
import { resetHistory, scheduleHistoryCommit } from './history.js';
import { setItemVisibility } from './layers.js';
import { getActiveRoom, getOpeningWidth, isOpening } from '../core/model.js';
import { setActiveRoom } from './rooms.js';
import { applyRotation } from './rotation.js';
import { syncSizeManager } from './size-manager.js';
import { OPENING_DEPTH, metro, roomViews, state, viewState } from '../core/state.js';
import { getRotation } from '../core/units.js';

export function flushActiveView() {
    const room = getActiveRoom();
    if (!room) return;
    roomViews[room.id] = {
        scale: viewState.scale,
        scrollX: viewState.scrollX,
        scrollY: viewState.scrollY,
    };
    // Solo persiste la vista: no debe crear un paso de historial.
    guardar(getItemState(room));
}

// Color de la paleta asignado al item. Se guarda en el estado para que
// reconstruir la escena (undo/redo, recarga) no reparta colores nuevos: el
// color es parte de la identidad del mueble, no del orden en que se dibuja.
function getItemColor(item) {
    if (isOpening(item)) return '';
    if (item.dataset.type === 'room') return item.style.borderColor || '';
    if (item.classList.contains('furniture')) return item.style.backgroundColor || '';
    return '';
}

function applyItemColor(rebuilt, elemento) {
    if (!elemento.color) return;
    if (rebuilt.dataset.type === 'room') {
        rebuilt.style.borderColor = elemento.color;
    } else if (rebuilt.classList.contains('furniture')) {
        rebuilt.style.backgroundColor = elemento.color;
    }
}

export function applyItemStateDetails(rebuilt, elemento) {
    if (!rebuilt) return;
    if (elemento.borderRadius) rebuilt.style.borderRadius = `${elemento.borderRadius}px`;
    applyItemColor(rebuilt, elemento);
    const opening = isOpening(rebuilt);
    if (!opening) {
        if (Number.isFinite(elemento.left) && Number.isFinite(elemento.top)) {
            rebuilt.style.left = `${elemento.left}px`;
            rebuilt.style.top = `${elemento.top}px`;
        }
        applyRotation(rebuilt, Number.isFinite(elemento.rotacion) ? elemento.rotacion : 0);
        if (elemento.edges && rebuilt.classList.contains('furniture')) {
            rebuilt.dataset.edges = elemento.edges;
            renderEdges(rebuilt);
        }
        if (elemento.tolerance) {
            rebuilt.dataset.tolerance = elemento.tolerance;
            renderTolerance(rebuilt);
        }
    }
    if (elemento.visible === false && rebuilt.dataset.type !== 'room') {
        setItemVisibility(rebuilt, false);
    }
}

export function hidratar() {
    state.historySuspended = true;
    try {
        hidratarGuardado();
    } finally {
        state.historySuspended = false;
        resetHistory();
    }
}

export function hidratarGuardado() {
    const datosGuardados = JSON.parse(localStorage.getItem('mise')) || [];

    const validos = datosGuardados.filter((elemento) => elemento && elemento.id);
    if (!Array.isArray(datosGuardados) || datosGuardados.length !== validos.length) {
        localStorage.setItem('mise', JSON.stringify(validos));
    }

    if (validos.length === 0) {
        localStorage.removeItem('mise-active');
        syncSizeManager();
        return;
    }

    rebuildScene(validos);
}

export function rebuildScene(validos, activeRoomIndex = -1) {
    const roomIdMap = {};
    const rebuiltRooms = [];

    validos
        .filter((elemento) => elemento.type === 'room')
        .forEach((elemento) => {
            const rebuilt = createRoom(
                elemento.ancho,
                elemento.alto,
                elemento.unidadAlto,
                elemento.unidadAncho,
                elemento.nombre,
                elemento.currentBtnId,
                undefined,
                false,
            );
            if (!rebuilt) return;
            roomIdMap[elemento.id] = rebuilt.id;
            rebuiltRooms.push(rebuilt);
            applyItemStateDetails(rebuilt, elemento);
        });

    validos
        .filter((elemento) => elemento.type !== 'room')
        .forEach((elemento) => {
            const roomId = roomIdMap[elemento.roomId] || rebuiltRooms[0]?.id;
            const roomEl = document.getElementById(roomId);
            if (!roomEl) return;

            const rebuilt = isOpening({ dataset: { type: elemento.type } })
                ? rebuildOpening(elemento, roomEl)
                : createRoom(
                    elemento.ancho,
                    elemento.alto,
                    'm',
                    'm',
                    elemento.nombre || '',
                    'add-object-btn',
                    roomEl,
                );
            applyItemStateDetails(rebuilt, elemento);
        });

    rebuiltRooms.forEach((room) => {
        const st = validos.find((elemento) => roomIdMap[elemento.id] === room.id);
        if (st && Number.isFinite(st.viewScale)) {
            roomViews[room.id] = {
                scale: st.viewScale,
                scrollX: Number(st.viewScrollX) || 0,
                scrollY: Number(st.viewScrollY) || 0,
            };
        }
    });

    localStorage.removeItem('mise');
    rebuiltRooms.forEach((room) => guardarCambios(room));
    document.querySelectorAll('.object').forEach((item) => {
        if (item.dataset.type !== 'room') guardarCambios(item);
    });

    const activeId = localStorage.getItem('mise-active');
    const active = (activeRoomIndex >= 0 ? rebuiltRooms[activeRoomIndex] : null)
        || rebuiltRooms.find((room) => room.id === (roomIdMap[activeId] || activeId))
        || rebuiltRooms[rebuiltRooms.length - 1]
        || null;
    setActiveRoom(active);
    syncSizeManager();
}

export function guardar(estadoActual) {
    const datosGuardados=JSON.parse(localStorage.getItem('mise'));
    const estadosGuardados=Array.isArray(datosGuardados) 
        ? datosGuardados
        : [];

    const index = estadosGuardados.findIndex((estado) => estado.id === estadoActual.id);
    if (index >= 0) {
        estadosGuardados[index] = estadoActual;
    } else {
        estadosGuardados.push(estadoActual);
    }
    localStorage.setItem('mise', JSON.stringify(estadosGuardados));
}

export function getItemState(item) {
    const opening = isOpening(item);
    const width = opening ? getOpeningWidth(item) : parseFloat(item.style.width) || item.offsetWidth;
    const height = opening ? OPENING_DEPTH : parseFloat(item.style.height) || item.offsetHeight;
    const isRoom = item.dataset.type === 'room';

    // En rooms inactivas (display:none) offsetLeft/offsetTop valen 0. Guardamos
    // la última posición medida y usamos el estilo inline como respaldo para no
    // perder la posición real de los objetos ocultos.
    const rendered = item.getClientRects().length > 0;
    if (rendered) {
        item.dataset.posLeft = String(item.offsetLeft);
        item.dataset.posTop = String(item.offsetTop);
    }
    const inlineLeft = parseFloat(item.style.left);
    const inlineTop = parseFloat(item.style.top);
    const cachedLeft = Number(item.dataset.posLeft);
    const cachedTop = Number(item.dataset.posTop);

    const left = rendered
        ? item.offsetLeft
        : (Number.isFinite(inlineLeft) ? inlineLeft : (Number.isFinite(cachedLeft) ? cachedLeft : item.offsetLeft));
    const top = rendered
        ? item.offsetTop
        : (Number.isFinite(inlineTop) ? inlineTop : (Number.isFinite(cachedTop) ? cachedTop : item.offsetTop));

    return {
        id: item.id,
        nombre: item.dataset.name || item.textContent.trim(),
        ancho: width / metro,
        alto: height / metro,
        unidadAncho: 'm',
        unidadAlto: 'm',
        borderRadius: parseFloat(item.style.borderRadius) || 0,
        color: getItemColor(item),
        rotacion: getRotation(item),
        edges: item.classList.contains('furniture') ? item.dataset.edges || '' : '',
        tolerance: item.classList.contains('furniture') ? item.dataset.tolerance || '' : '',
        left,
        top,
        type: item.dataset.type,
        visible: isRoom ? true : item.style.display !== 'none',
        roomId: item.dataset.roomId || item.parentElement?.id,
        edge: item.dataset.edge,
        direction: item.dataset.direction,
        axis: item.dataset.axis,
        offset: Number.isFinite(Number(item.dataset.offset)) ? Number(item.dataset.offset) : undefined,
        viewScale: isRoom && roomViews[item.id] ? roomViews[item.id].scale : undefined,
        viewScrollX: isRoom && roomViews[item.id] ? roomViews[item.id].scrollX : undefined,
        viewScrollY: isRoom && roomViews[item.id] ? roomViews[item.id].scrollY : undefined,
        currentBtnId: item.dataset.type === 'room' ? 'create-room-btn' : 'add-object-btn',
    };
}

export function guardarCambios(item) {
    if (!item || item.dataset.draft === 'true') return;
    guardar(getItemState(item));
    scheduleHistoryCommit();
}

export function eliminarGuardado(ids) {
    const datosGuardados = JSON.parse(localStorage.getItem('mise')) || [];
    const estadosGuardados = Array.isArray(datosGuardados)
        ? datosGuardados.filter((estado) => !ids.includes(estado.id))
        : [];
    localStorage.setItem('mise', JSON.stringify(estadosGuardados));
    scheduleHistoryCommit();
}
