// Acciones sobre las filas de capas
import { smNombre } from '../core/dom.js';
import { addOpeningFromRoom } from './creation.js';
import { clearOpeningOverlay, syncOpeningOverlay } from './door.js';
import { getRooms, getSelectedObject, isOpening } from '../core/model.js';
import { eliminarGuardado, guardarCambios } from './persistence.js';
import { popupMenu } from './popups.js';
import { duplicateLayer, setActiveRoom, syncRoomLayerActive, syncRoomSwitcher } from './rooms.js';
import { syncRotationHandle } from './rotation.js';
import { syncSizeManager } from './size-manager.js';
import { objectMenuOptions, roomMenuOptions, roomViews, state } from '../core/state.js';

export function getLayerElementForItem(item) {
    return document.querySelector(`.layer-div[data-target-id="${item.id}"]`);
}

export function setLayerHoverPreview(layerElement, active) {
    const item = document.getElementById(layerElement?.dataset.targetId);
    if (!item) return;
    item.classList.toggle('layer-hover-preview', active);
}

export function openLayerMenuForItem(item, point) {
    const layerDiv = getLayerElementForItem(item);
    if (!layerDiv) return;
    const menuOptions = layerDiv.dataset.type === 'room' ? roomMenuOptions : objectMenuOptions;
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
    if (state.selectedLayerId === sceneTarget.id) state.selectedLayerId = null;
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
