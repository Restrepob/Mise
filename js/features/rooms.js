// Rooms: capas, switcher y duplicado
import { createLayer, createRoom } from './creation.js';
import { objectLayers } from '../core/dom.js';
import { clearOpeningOverlay, renderEdges, renderTolerance } from './door.js';
import { getLayerContext, selectLayer } from './layers.js';
import { endMeasurement } from './measure.js';
import { clampOpeningOffset, getActiveRoom, getItemBoxSize, getOpeningWidth, getParentInnerSize, getRooms, isOpening, setItemName } from '../core/model.js';
import { placeOpening } from './openings.js';
import { flushActiveView, getItemState, guardar, guardarCambios } from './persistence.js';
import { applyRotation, syncRotationHandle } from './rotation.js';
import { syncSizeManager } from './size-manager.js';
import { clearSnapGuides } from './snapping.js';
import { GRID_STEP, OPENING_DEPTH, metro, objectMenuOptions, roomViews, state, viewState } from '../core/state.js';
import { getRotation } from '../core/units.js';
import { applySceneScale, clampScale, getCenteredViewScroll, updateMinScaleForRoom, updateSceneSize } from './view.js';

export function syncRoomLayerActive() {
    document.querySelectorAll('#room-layer-box .layer-div').forEach((row) => {
        const isActive = row.dataset.targetId === state.activeRoomId;
        row.classList.toggle('active-room', isActive);
    });
}

export function syncObjectLayers() {
    objectLayers.querySelectorAll('.layer-div').forEach((row) => {
        const belongsToActiveRoom = !!state.activeRoomId && row.dataset.roomId === state.activeRoomId;
        row.classList.toggle('is-out-of-room', !belongsToActiveRoom);
        row.setAttribute('aria-hidden', String(!belongsToActiveRoom));
    });
}

export function syncRoomSwitcher() {
    const nameEl = document.getElementById('room-switcher-name');
    const prev = document.getElementById('room-prev');
    const next = document.getElementById('room-next');
    if (!nameEl || !prev || !next) return;

    const rooms = getRooms();
    const active = getActiveRoom();
    prev.disabled = next.disabled = rooms.length === 0;
    nameEl.textContent = active?.dataset.name || active?.textContent.trim() || '—';
}

export function setActiveRoom(room, options = {}) {
    clearOpeningOverlay();
    clearSnapGuides();
    endMeasurement();
    state.selectedLayerId = null;
    syncRotationHandle(null);

    const prev = getActiveRoom();
    if (prev) flushActiveView();

    if (!room) {
        state.activeRoomId = '';
        getRooms().forEach((r) => { r.style.display = 'none'; });
        localStorage.removeItem('mise-active');
        syncRoomLayerActive();
        syncObjectLayers();
        syncRoomSwitcher();
        syncSizeManager();
        return;
    }

    state.activeRoomId = room.id;
    localStorage.setItem('mise-active', room.id);
    getRooms().forEach((r) => {
        r.style.display = r === room ? '' : 'none';
    });

    updateSceneSize(room);
    updateMinScaleForRoom(room);

    const savedView = roomViews[room.id];
    viewState.scale = clampScale(savedView?.scale || 1);
    if (savedView) {
        viewState.scrollX = Number(savedView.scrollX) || 0;
        viewState.scrollY = Number(savedView.scrollY) || 0;
    } else {
        const centered = getCenteredViewScroll();
        viewState.scrollX = centered.x;
        viewState.scrollY = centered.y;
    }
    applySceneScale();

    roomViews[room.id] = {
        scale: viewState.scale,
        scrollX: viewState.scrollX,
        scrollY: viewState.scrollY,
    };
    // Solo persiste la vista: no debe crear un paso de historial.
    guardar(getItemState(room));

    syncRoomLayerActive();
    syncObjectLayers();
    syncRoomSwitcher();
    syncSizeManager();

    if (options.select) {
        const row = document.querySelector(`#room-layer-box .layer-div[data-target-id="${room.id}"]`);
        if (row) selectLayer(row);
    }
}

export function switchActiveRoom(delta) {
    const rooms = getRooms();
    if (!rooms.length) return;
    const currentIndex = rooms.findIndex((r) => r.id === state.activeRoomId);
    const targetIndex = currentIndex < 0 ? 0 : (currentIndex + delta + rooms.length) % rooms.length;
    setActiveRoom(rooms[targetIndex], { select: true });
}

export function focusLayerRow(div) {
    const targetItem = document.getElementById(div.dataset.targetId);
    if (!targetItem) return;
    const room = targetItem.closest('.room');
    if (room && room.id !== state.activeRoomId) {
        setActiveRoom(room);
        selectLayer(div);
        return;
    }
    selectLayer(div);
}

export function getDuplicateName(name) {
    const base = String(name || '').trim() || 'Objeto';
    return `${base} copia`;
}

export function cloneFurnitureItem(sourceItem, targetRoom, options = {}) {
    if (!sourceItem || !targetRoom) return null;

    const name = options.name ?? sourceItem.dataset.name ?? '';
    const item = document.createElement('div');
    item.classList.add('object', 'furniture');
    item.id = `furniture${++state.Fcounter}`;
    item.dataset.type = 'furniture';
    item.dataset.name = name;
    item.dataset.roomId = targetRoom.id;
    item.dataset.rotation = sourceItem.dataset.rotation || '0';
    if (sourceItem.dataset.edges) item.dataset.edges = sourceItem.dataset.edges;
    if (sourceItem.dataset.tolerance) item.dataset.tolerance = sourceItem.dataset.tolerance;
    item.style.width = sourceItem.style.width;
    item.style.height = sourceItem.style.height;
    item.style.left = options.left ?? sourceItem.style.left;
    item.style.top = options.top ?? sourceItem.style.top;
    item.style.backgroundColor = sourceItem.style.backgroundColor || 'transparent';
    item.style.borderColor = sourceItem.style.borderColor || 'transparent';
    item.style.borderRadius = sourceItem.style.borderRadius || '';
    setItemName(item, name);
    targetRoom.appendChild(item);
    if (item.dataset.edges) renderEdges(item);
    if (item.dataset.tolerance) renderTolerance(item);
    applyRotation(item, Number(item.dataset.rotation) || 0);
    createLayer(
        (parseFloat(item.style.width) || 0) / metro,
        (parseFloat(item.style.height) || 0) / metro,
        'm', 'm', name, 'add-object-btn', item.id, targetRoom.id, objectMenuOptions, 'furniture',
    );
    guardarCambios(item);
    return item;
}

export function cloneOpeningItem(sourceItem, targetRoom, options = {}) {
    if (!sourceItem || !targetRoom) return null;

    const type = sourceItem.dataset.type;
    const name = options.name ?? sourceItem.dataset.name ?? '';
    const item = document.createElement('div');
    item.classList.add('object', 'opening', type);
    item.id = `${type}${++state.openingCounter}`;
    item.dataset.type = type;
    item.dataset.name = name;
    item.dataset.roomId = targetRoom.id;
    item.dataset.edge = sourceItem.dataset.edge || 'top';
    item.dataset.direction = sourceItem.dataset.direction || 'in';
    item.dataset.axis = sourceItem.dataset.axis || 'sup';
    item.dataset.offset = options.offset != null ? String(options.offset) : (sourceItem.dataset.offset || '0');
    item.dataset.openingWidth = String(getOpeningWidth(sourceItem));
    targetRoom.appendChild(item);
    placeOpening(item);
    createLayer(
        getOpeningWidth(item), OPENING_DEPTH,
        'm', 'm', name, 'add-object-btn', item.id, targetRoom.id, objectMenuOptions, type,
    );
    guardarCambios(item);
    return item;
}

export function cloneRoomContents(sourceRoom, targetRoom) {
    if (!sourceRoom || !targetRoom) return;
    [...sourceRoom.children].forEach((sourceItem) => {
        if (sourceItem.dataset.type === 'furniture') {
            cloneFurnitureItem(sourceItem, targetRoom);
        } else if (isOpening(sourceItem)) {
            cloneOpeningItem(sourceItem, targetRoom);
        }
    });
}

export function getDuplicatedFurniturePosition(item) {
    const room = item.parentElement;
    const original = { left: item.offsetLeft, top: item.offsetTop };
    if (!room) return original;

    const roomSize = getParentInnerSize(room);
    const { width, height } = getItemBoxSize(item);
    const clamp = (value, size, max) => Math.min(
        Math.max(value, size / 2),
        Math.max(size / 2, max - size / 2),
    );
    const candidates = [
        [original.left + GRID_STEP, original.top + GRID_STEP],
        [original.left - GRID_STEP, original.top - GRID_STEP],
        [original.left + GRID_STEP, original.top - GRID_STEP],
        [original.left - GRID_STEP, original.top + GRID_STEP],
    ];

    for (const [candidateLeft, candidateTop] of candidates) {
        const left = clamp(candidateLeft, width, roomSize.width);
        const top = clamp(candidateTop, height, roomSize.height);
        if (Math.abs(left - original.left) > 0.01 || Math.abs(top - original.top) > 0.01) {
            return { left, top };
        }
    }

    return original;
}

export function getDuplicatedOpeningOffset(item) {
    const width = getOpeningWidth(item);
    const original = Number(item.dataset.offset) || 0;
    const fitsWithoutOverlap = (offset) => offset >= original + width - 0.01
        || offset + width <= original + 0.01;
    const candidates = [
        original + width,
        original - width,
        original + GRID_STEP,
        original - GRID_STEP,
    ];

    for (const candidate of candidates) {
        const offset = clampOpeningOffset(item, candidate, width);
        if (fitsWithoutOverlap(offset)) return offset;
    }

    // Si no cabe una apertura completa a ningún lado, elegimos la posición
    // que más se aleje de la original para que la copia siga siendo visible.
    return [original + width, original - width]
        .map((candidate) => clampOpeningOffset(item, candidate, width))
        .reduce((best, offset) => (
            Math.abs(offset - original) > Math.abs(best - original) ? offset : best
        ));
}

export function selectDuplicate(item) {
    const room = item.closest('.room');
    if (room && room.id !== state.activeRoomId) setActiveRoom(room);

    const layer = document.querySelector(`.layer-div[data-target-id="${item.id}"]`);
    if (layer) selectLayer(layer);
}

export function duplicateRoom(sourceRoom) {
    if (!sourceRoom) return null;

    const width = (parseFloat(sourceRoom.style.width) || sourceRoom.offsetWidth) / metro;
    const height = (parseFloat(sourceRoom.style.height) || sourceRoom.offsetHeight) / metro;
    const copy = createRoom(
        width,
        height,
        'm',
        'm',
        getDuplicateName(sourceRoom.dataset.name),
        'create-room-btn',
        undefined,
        false,
    );
    if (!copy) return null;

    copy.style.borderRadius = sourceRoom.style.borderRadius || '';
    copy.style.left = sourceRoom.style.left;
    copy.style.top = sourceRoom.style.top;
    applyRotation(copy, getRotation(sourceRoom));
    cloneRoomContents(sourceRoom, copy);

    const sourceView = roomViews[sourceRoom.id];
    if (sourceView) roomViews[copy.id] = { ...sourceView };

    guardarCambios(copy);
    setActiveRoom(copy, { select: true });
    return copy;
}

export function duplicateFurniture(sourceItem) {
    const room = sourceItem.parentElement;
    if (!room) return null;

    const position = getDuplicatedFurniturePosition(sourceItem);
    const copy = cloneFurnitureItem(sourceItem, room, {
        name: getDuplicateName(sourceItem.dataset.name),
        left: `${position.left}px`,
        top: `${position.top}px`,
    });
    if (!copy) return null;

    selectDuplicate(copy);
    return copy;
}

export function duplicateOpening(sourceItem) {
    const room = sourceItem.parentElement;
    if (!room) return null;

    const copy = cloneOpeningItem(sourceItem, room, {
        name: getDuplicateName(sourceItem.dataset.name),
        offset: getDuplicatedOpeningOffset(sourceItem),
    });
    if (!copy) return null;

    selectDuplicate(copy);
    return copy;
}

export function duplicateLayer(targetElement) {
    const context = getLayerContext(targetElement);
    if (!context || !context.sceneTarget) return;

    const source = context.sceneTarget;
    if (source.dataset.type === 'room') {
        duplicateRoom(source);
    } else if (isOpening(source)) {
        duplicateOpening(source);
    } else {
        duplicateFurniture(source);
    }
}

document.getElementById('room-prev').addEventListener('click', () => switchActiveRoom(-1));

document.getElementById('room-next').addEventListener('click', () => switchActiveRoom(1));
