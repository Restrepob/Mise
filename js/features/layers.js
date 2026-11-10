// Acciones sobre las filas de capas
import { objectLayers, roomLayers, smNombre } from '../core/dom.js';
import { addOpeningFromRoom } from './creation.js';
import { clearOpeningOverlay, syncOpeningOverlay } from './door.js';
import { getRooms, getSelectedObject, isItemLocked, isOpening } from '../core/model.js';
import { eliminarGuardado, guardarCambios } from './persistence.js';
import { popupMenu } from './popups.js';
import { duplicateLayer, setActiveRoom, syncRoomLayerActive, syncRoomSwitcher } from './rooms.js';
import { syncRotationHandle } from './rotation.js';
import { clearGroupSelectionOverlay, syncGroupSelectionOverlay } from './group-selection.js';
import { syncSizeManager } from './size-manager.js';
import { objectMenuOptions, roomMenuOptions, roomViews, state } from '../core/state.js';

const LOCKED_LAYER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M240-160q-33 0-56.5-23.5T160-240v-320q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v320q0 33-23.5 56.5T720-160H240Zm0-80h480v-320H240v320Zm240-80q33 0 56.5-23.5T560-400q0-33-23.5-56.5T480-480q-33 0-56.5 23.5T400-400q0 33 23.5 56.5T480-320ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Zm-120 400v-320 320Z"/></svg>';
const UNLOCKED_LAYER_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M240-160q-33 0-56.5-23.5T160-240v-320q0-33 23.5-56.5T240-640h360v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85h-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v320q0 33-23.5 56.5T720-160H240Zm0-80h480v-320H240v320Zm240-80q33 0 56.5-23.5T560-400q0-33-23.5-56.5T480-480q-33 0-56.5 23.5T400-400q0 33 23.5 56.5T480-320ZM240-240v-320 320Z"/></svg>';

export function getLayerElementForItem(item) {
    return document.querySelector(`.layer-div[data-target-id="${item.id}"]`);
}

export function syncLayerLockControl(item) {
    const layer = item && getLayerElementForItem(item);
    const button = layer?.querySelector('.lock-div');
    if (!layer || !button) return;

    const locked = isItemLocked(item);
    layer.classList.toggle('is-locked', locked);
    button.classList.toggle('is-locked', locked);
    button.setAttribute('aria-pressed', String(locked));
    button.setAttribute('aria-label', locked ? 'Desbloquear objeto' : 'Bloquear objeto');
    button.dataset.tooltip = locked ? 'Desbloquear objeto' : 'Bloquear objeto';
    button.innerHTML = locked ? LOCKED_LAYER_SVG : UNLOCKED_LAYER_SVG;
}

export function toggleLayerLock(layerElement) {
    const item = document.getElementById(layerElement?.dataset.targetId);
    if (!item || item.dataset.type === 'room') return false;

    const locked = !isItemLocked(item);
    item.dataset.locked = String(locked);
    syncLayerLockControl(item);

    if (locked && state.selectedObjectIds?.length > 1 && state.selectedObjectIds.includes(item.id)) {
        state.selectedObjectIds = state.selectedObjectIds.filter((id) => id !== item.id);
        if (state.selectedLayerId === item.id) {
            state.selectedLayerId = state.selectedObjectIds.at(-1) || null;
        }
    }

    const selectedIds = new Set(state.selectedObjectIds || []);
    document.querySelectorAll('.object').forEach((object) => {
        object.classList.toggle('selected', selectedIds.has(object.id));
    });
    document.querySelectorAll('.layer-div').forEach((layer) => {
        layer.classList.toggle('selected-layer', selectedIds.has(layer.dataset.targetId));
    });

    if ((state.selectedObjectIds || []).length > 1) {
        syncRotationHandle(null);
        syncGroupSelectionOverlay();
    } else {
        clearGroupSelectionOverlay();
        syncRotationHandle(getSelectedObject());
    }
    syncSizeManager();
    syncOpeningOverlay(getSelectedObject());
    guardarCambios(item);
    return true;
}

function layerItemsForParent(layerBox, parent) {
    return [...layerBox.children]
        .filter((row) => document.getElementById(row.dataset.targetId)?.parentElement === parent)
        .map((row) => document.getElementById(row.dataset.targetId))
        .filter(Boolean);
}

export function syncLayerPriorities(layerBox, persist = false) {
    if (!layerBox) return;
    const groups = new Map();
    [...layerBox.children].forEach((row) => {
        const item = document.getElementById(row.dataset.targetId);
        if (!item?.parentElement) return;
        if (!groups.has(item.parentElement)) groups.set(item.parentElement, []);
        groups.get(item.parentElement).push(item);
    });

    groups.forEach((items) => {
        items.forEach((item, index) => {
            const priority = items.length - index;
            item.dataset.layerPriority = String(priority);
            item.style.zIndex = String(priority);
            if (persist && !state.historySuspended && item.dataset.draft !== 'true') guardarCambios(item);
        });
    });
}

export function syncCreatedLayerPriority(layerBox, newRow) {
    const item = document.getElementById(newRow.dataset.targetId);
    if (!item?.parentElement) return;
    const siblings = layerItemsForParent(layerBox, item.parentElement);
    const otherSiblings = siblings.filter((sibling) => sibling !== item);
    const existing = otherSiblings.map((sibling) => Number(sibling.dataset.layerPriority));
    if (existing.every(Number.isFinite)) {
        const priority = Math.max(0, ...existing) + 1;
        item.dataset.layerPriority = String(priority);
        item.style.zIndex = String(priority);
        siblings.forEach((sibling) => {
            sibling.style.zIndex = sibling.dataset.layerPriority;
        });
        return;
    }

    // Datos previos a la prioridad persistida: la fila superior establece el
    // orden inicial y la siguiente escritura lo conserva en el snapshot.
    syncLayerPriorities(layerBox);
}

function canDropLayer(source, target) {
    if (!source || !target || source === target || source.parentElement !== target.parentElement) return false;
    if (source.classList.contains('layer-draft') || target.classList.contains('layer-draft')) return false;
    const sourceIsRoom = source.dataset.type === 'room';
    if (sourceIsRoom !== (target.dataset.type === 'room')) return false;
    return sourceIsRoom || source.dataset.roomId === target.dataset.roomId;
}

let draggedLayer = null;

function clearLayerDropState() {
    document.querySelectorAll('.layer-div.is-layer-dragging, .layer-div.layer-drop-before, .layer-div.layer-drop-after')
        .forEach((row) => row.classList.remove('is-layer-dragging', 'layer-drop-before', 'layer-drop-after'));
}

export function enableLayerReordering(layer) {
    layer.draggable = true;
    layer.addEventListener('dragstart', (event) => {
        if (event.target.closest('.eye-div, .lock-div, .options-layer') || layer.classList.contains('layer-draft')) {
            event.preventDefault();
            return;
        }
        draggedLayer = layer;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', layer.dataset.targetId);
        requestAnimationFrame(() => layer.classList.add('is-layer-dragging'));
    });
    layer.addEventListener('dragover', (event) => {
        if (!canDropLayer(draggedLayer, layer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const before = event.clientY < layer.getBoundingClientRect().top + layer.offsetHeight / 2;
        layer.classList.toggle('layer-drop-before', before);
        layer.classList.toggle('layer-drop-after', !before);
    });
    layer.addEventListener('dragleave', (event) => {
        if (event.relatedTarget instanceof Node && layer.contains(event.relatedTarget)) return;
        layer.classList.remove('layer-drop-before', 'layer-drop-after');
    });
    layer.addEventListener('drop', (event) => {
        if (!canDropLayer(draggedLayer, layer)) return;
        event.preventDefault();
        event.stopPropagation();
        const before = event.clientY < layer.getBoundingClientRect().top + layer.offsetHeight / 2;
        const container = layer.parentElement;
        container.insertBefore(draggedLayer, before ? layer : layer.nextSibling);
        clearLayerDropState();
        draggedLayer = null;
        syncLayerPriorities(container, true);
    });
    layer.addEventListener('dragend', () => {
        clearLayerDropState();
        draggedLayer = null;
    });
}

function sortLayerBoxByPriority(layerBox) {
    const rows = [...layerBox.children];
    const groups = new Map();
    rows.forEach((row, index) => {
        const item = document.getElementById(row.dataset.targetId);
        const parent = item?.parentElement;
        if (!parent) return;
        if (!groups.has(parent)) groups.set(parent, []);
        groups.get(parent).push({ row, index, priority: Number(item.dataset.layerPriority) });
    });

    const ordered = [];
    groups.forEach((entries) => {
        entries.sort((a, b) => {
            const aValid = Number.isFinite(a.priority);
            const bValid = Number.isFinite(b.priority);
            if (aValid && bValid && a.priority !== b.priority) return b.priority - a.priority;
            if (aValid !== bValid) return aValid ? -1 : 1;
            return a.index - b.index;
        });
        ordered.push(...entries.map((entry) => entry.row));
    });
    layerBox.replaceChildren(...ordered);
}

export function restoreLayerPriorities() {
    [roomLayers, objectLayers].forEach((layerBox) => {
        sortLayerBoxByPriority(layerBox);
        syncLayerPriorities(layerBox);
    });
}

export function toggleMultiSelection(targetItem) {
    if (!targetItem?.classList.contains('furniture') || targetItem.dataset.draft === 'true' || isItemLocked(targetItem)) return false;

    let items = (state.selectedObjectIds || [])
        .map((id) => document.getElementById(id))
        .filter((item) => item?.isConnected && item.classList.contains('furniture'));
    if (!items.length && state.selectedLayerId) {
        const current = document.getElementById(state.selectedLayerId);
        if (current?.classList.contains('furniture')) items = [current];
    }
    if (items.some((item) => item.parentElement !== targetItem.parentElement)) items = [];

    const selected = new Set(items.map((item) => item.id));
    if (selected.has(targetItem.id)) selected.delete(targetItem.id);
    else selected.add(targetItem.id);
    const nextItems = [...selected].map((id) => document.getElementById(id)).filter(Boolean);

    state.selectedObjectIds = nextItems.map((item) => item.id);
    const primary = nextItems.includes(targetItem) ? targetItem : nextItems.at(-1) || null;
    state.selectedLayerId = primary?.id || null;
    document.querySelectorAll('.object').forEach((item) => item.classList.toggle('selected', selected.has(item.id)));
    document.querySelectorAll('.layer-div').forEach((layer) => {
        layer.classList.toggle('selected-layer', selected.has(layer.dataset.targetId));
    });
    clearOpeningOverlay();

    if (nextItems.length > 1) {
        syncRotationHandle(null);
        syncGroupSelectionOverlay();
    } else {
        clearGroupSelectionOverlay();
        syncRotationHandle(primary);
    }
    syncSizeManager();
    return true;
}

export function setLayerHoverPreview(layerElement, active) {
    const item = document.getElementById(layerElement?.dataset.targetId);
    if (!item) return;
    item.classList.toggle('layer-hover-preview', active);
}

export function openLayerMenuForItem(item, point) {
    const layerDiv = getLayerElementForItem(item);
    if (!layerDiv) return;
    const isRoom = layerDiv.dataset.type === 'room';
    const menuOptions = (isRoom ? roomMenuOptions : objectMenuOptions).map((option) => {
        if (option.action === 'hide') {
            return {
                ...option,
                label: layerDiv.dataset.visible === 'false' ? 'Mostrar' : 'Ocultar',
            };
        }
        if (option.action === 'lock') {
            return { ...option, label: isItemLocked(item) ? 'Desbloquear' : 'Bloquear' };
        }
        return option;
    });
    popupMenu(menuOptions, layerDiv, point);
}

export function getLayerContext(targetElement) {
    const layerDiv = targetElement.closest('.layer-div');
    if (!layerDiv) return null;

    const sceneTarget = document.getElementById(layerDiv.dataset.targetId);
    return { layerDiv, sceneTarget };
}

export function setItemVisibility(item, visible) {
    if (!item) return;

    item.style.display = visible ? '' : 'none';

    const layerDiv = document.querySelector(`.layer-div[data-target-id="${item.id}"]`);
    if (!layerDiv) return;

    layerDiv.classList.toggle('is-hidden', !visible);
    layerDiv.dataset.visible = String(visible);

    const eyeButton = layerDiv.querySelector('.eye-div');
    if (eyeButton) {
        eyeButton.innerHTML = visible
            ? layerDiv.dataset.eyeVisibleSvg
            : layerDiv.dataset.eyeHiddenSvg;
    }
}

export function toggleLayerVisibility(targetElement) {
    const context = getLayerContext(targetElement);
    if (!context || !context.sceneTarget) return;

    if (context.sceneTarget.dataset.type === 'room') {
        if (context.sceneTarget.id !== state.activeRoomId) {
            setActiveRoom(context.sceneTarget, { select: true });
        }
        return;
    }

    const isVisible = context.layerDiv.dataset.visible !== 'false';
    setItemVisibility(context.sceneTarget, !isVisible);
    guardarCambios(context.sceneTarget);
}

// Renombrar no abre el prompt nativo del navegador: selecciona el item y
// lleva el foco al campo Nombre del sidebar, donde el cambio se ve en vivo.
export function renameLayer(targetElement) {
    const context = getLayerContext(targetElement);
    if (!context || !context.sceneTarget) return;

    selectLayer(context.layerDiv);
    requestAnimationFrame(() => {
        smNombre.focus();
        smNombre.select();
    });
}

export function deleteLayer(targetElement) {
    const context = getLayerContext(targetElement);
    if (!context) return;

    const sceneTarget = context.sceneTarget;
    const roomId = sceneTarget.dataset.roomId || sceneTarget.id;

    if (sceneTarget.dataset.type === 'room') {
        const relatedObjects = [...document.querySelectorAll('.object')]
            .filter((item) => item.dataset.roomId === roomId);
        const deletedIds = [sceneTarget.id, ...relatedObjects.map((item) => item.id)];

        relatedObjects.forEach((item) => item.remove());
        sceneTarget.remove();

        const relatedLayers = [...document.querySelectorAll('.layer-div')]
            .filter((item) => item.dataset.roomId === roomId);

        relatedLayers.forEach((item) => item.remove());

        eliminarGuardado(deletedIds);
        syncLayerPriorities(roomLayers, true);
        syncLayerPriorities(objectLayers, true);
        state.selectedObjectIds = (state.selectedObjectIds || []).filter((id) => !deletedIds.includes(id));
        if (!state.selectedObjectIds.includes(state.selectedLayerId)) {
            state.selectedLayerId = state.selectedObjectIds.at(-1) || null;
        }
        syncGroupSelectionOverlay();
        delete roomViews[sceneTarget.id];
        if (state.selectedLayerId === sceneTarget.id) state.selectedLayerId = null;

        const wasActive = state.activeRoomId === sceneTarget.id;
        if (wasActive) state.activeRoomId = '';

        if (wasActive) {
            const remaining = getRooms();
            setActiveRoom(remaining[remaining.length - 1] || null, { select: !!remaining.length });
        } else {
            syncRoomLayerActive();
            syncRoomSwitcher();
        }

        clearOpeningOverlay();
        syncSizeManager();
        syncRotationHandle(getSelectedObject());

        return;
    }

    sceneTarget?.remove();
    context.layerDiv.remove();
    eliminarGuardado([sceneTarget.id]);
    syncLayerPriorities(objectLayers, true);
    state.selectedObjectIds = (state.selectedObjectIds || []).filter((id) => id !== sceneTarget.id);
    if (state.selectedLayerId === sceneTarget.id) state.selectedLayerId = state.selectedObjectIds.at(-1) || null;
    syncGroupSelectionOverlay();
    clearOpeningOverlay();
    syncSizeManager();
    syncRotationHandle(getSelectedObject());
}

export function selectVisibleObject(targetItem) {
    const matchingLayer = document.querySelector(`.layer-div[data-target-id="${targetItem.id}"]`);

    if (matchingLayer) {
        selectLayer(matchingLayer);
        return;
    }

    state.selectedObjectIds = [targetItem.id];
    clearGroupSelectionOverlay();

    document.querySelectorAll('.object').forEach((item) => {
        item.classList.toggle('selected', item === targetItem);
    });

    document.querySelectorAll('.layer-div').forEach((item) => {
        item.classList.toggle('selected-layer', item.dataset.targetId === targetItem.id);
    });

    state.selectedLayerId = targetItem.id;
    syncRotationHandle(targetItem);
    syncSizeManager();
    if (isOpening(targetItem)) syncOpeningOverlay(targetItem);
    else clearOpeningOverlay();
}

export function selectLayer(layerElement) {
    const targetId = layerElement.dataset.targetId;
    const targetItem = document.getElementById(targetId);

    if (!targetItem) return;

    state.selectedObjectIds = [targetItem.id];
    clearGroupSelectionOverlay();

    document.querySelectorAll('.object').forEach((item) => {
        item.classList.remove('selected');
    });

    document.querySelectorAll('.layer-div').forEach((item) => {
        item.classList.remove('selected-layer');
    });

    targetItem.classList.add('selected');
    layerElement.classList.add('selected-layer');
    state.selectedLayerId = layerElement.dataset.targetId;
    syncRotationHandle(targetItem);

    if (layerElement.dataset.type === 'room') {
        document.querySelectorAll('.room').forEach((room) => {
            if (room.id !== targetId) {
                room.classList.remove('selected');
            }
        });
    }

    if (isOpening(targetItem)) syncOpeningOverlay(targetItem);
    else clearOpeningOverlay();
    syncSizeManager();
    scrollLayerIntoView(layerElement);
}

export function scrollLayerIntoView(layerElement) {
    const container = layerElement.closest('.layer-box');
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const rRect = layerElement.getBoundingClientRect();
    if (rRect.top < cRect.top) {
        container.scrollTo({ top: container.scrollTop + (rRect.top - cRect.top), behavior: 'smooth' });
    } else if (rRect.bottom > cRect.bottom) {
        container.scrollTo({ top: container.scrollTop + (rRect.bottom - cRect.bottom), behavior: 'smooth' });
    }
}

export function handleMenuAction(action, targetElement) {
    if (action === 'rename') {
        renameLayer(targetElement);
    }

    if (action === 'duplicate') {
        duplicateLayer(targetElement);
    }

    if (action === 'hide') {
        toggleLayerVisibility(targetElement);
    }

    if (action === 'lock') {
        toggleLayerLock(targetElement);
    }

    if (action === 'delete') {
        deleteLayer(targetElement);
    }

    if (action === 'add-window') {
        addOpeningFromRoom('window', targetElement);
    }

    if (action === 'add-door') {
        addOpeningFromRoom('door', targetElement);
    }
}
