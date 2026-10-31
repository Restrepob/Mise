// Arrastre de objetos y autoscroll
import { canvas, scene } from '../core/dom.js';
import { clearOpeningOverlay, syncOpeningOverlay } from './door.js';
import { openLayerMenuForItem, selectVisibleObject } from './layers.js';
import { handleMeasurePointerDown, stopMeasureDrag, updateMeasureCursor, updateMeasureDrag } from './measure.js';
import { getSelectedObject, isOpening } from '../core/model.js';
import { dragOpeningAlongWall } from './openings.js';
import { flushActiveView, guardarCambios } from './persistence.js';
import { ROTATE_DRAG_THRESHOLD, applyRotation, syncRotationHandle } from './rotation.js';
import { syncSizeManager } from './size-manager.js';
import { clearSnapGuides, snapObject } from './snapping.js';
import { AUTO_SCROLL_EDGE, AUTO_SCROLL_IDLE, AUTO_SCROLL_SPEED, state, toolState, viewState } from '../core/state.js';
import { getRotation, snapRotation } from '../core/units.js';
import { pointerToScene, setViewScroll, zoomAtPoint, zoomAtScreenPoint } from './view.js';

export let autoscrollRaf = null;

export function positionDraggedObject(clientX, clientY) {
    const { item, startPointer, startCenter, shiftKey } = toolState.dragObject;
    const pointer = pointerToScene({ clientX, clientY });
    const deltaX = pointer.x - startPointer.x;
    const deltaY = pointer.y - startPointer.y;
    const parent = item.offsetParent || scene;
    const parentRect = parent.getBoundingClientRect();
    const sceneRect = scene.getBoundingClientRect();

    const center = {
        x: startCenter.x + deltaX,
        y: startCenter.y + deltaY,
    };

    // offsetLeft/Top se miden desde el padding-box del padre; getBoundingClientRect
    // devuelve el borde externo, así que sumamos el borde para no acumular 1px.
    const parentOriginX = (parentRect.left - sceneRect.left) / viewState.scale + parent.clientLeft;
    const parentOriginY = (parentRect.top - sceneRect.top) / viewState.scale + parent.clientTop;
    const localX = center.x - parentOriginX;
    const localY = center.y - parentOriginY;

    if (isOpening(item)) {
        // Shift libera la apertura del paso de la grid, pero la mantiene
        // apoyada sobre la pared.
        dragOpeningAlongWall(item, localX, localY, shiftKey);
        syncOpeningOverlay(item);
    } else if (item.classList.contains('room')) {
        item.style.left = `${localX}px`;
        item.style.top = `${localY}px`;
        const selected = getSelectedObject();
        if (isOpening(selected)) syncOpeningOverlay(selected);
    } else if (shiftKey) {
        // Shift desactiva por completo el imán: grid, paredes y otros objetos.
        clearSnapGuides();
        item.style.left = `${localX}px`;
        item.style.top = `${localY}px`;
    } else {
        const snapped = snapObject(item, localX, localY, parent);
        item.style.left = `${snapped.left}px`;
        item.style.top = `${snapped.top}px`;
    }
}

export function scrollForEdges(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const edgeRight = rect.width - x;
    const edgeBottom = rect.height - y;

    let factorX = 0;
    if (x < AUTO_SCROLL_EDGE) {
        factorX = -(1 - x / AUTO_SCROLL_EDGE);
    } else if (edgeRight < AUTO_SCROLL_EDGE) {
        factorX = 1 - edgeRight / AUTO_SCROLL_EDGE;
    }

    let factorY = 0;
    if (y < AUTO_SCROLL_EDGE) {
        factorY = -(1 - y / AUTO_SCROLL_EDGE);
    } else if (edgeBottom < AUTO_SCROLL_EDGE) {
        factorY = 1 - edgeBottom / AUTO_SCROLL_EDGE;
    }

    factorX = Math.max(-1, Math.min(1, factorX));
    factorY = Math.max(-1, Math.min(1, factorY));

    setViewScroll(
        viewState.scrollX + factorX * AUTO_SCROLL_SPEED,
        viewState.scrollY + factorY * AUTO_SCROLL_SPEED,
    );
}

export function tickAutoScroll() {
    if (!toolState.dragObject) {
        autoscrollRaf = null;
        return;
    }

    const { lastX, lastY, lastMoveAt } = toolState.dragObject;
    const pointerMoving = performance.now() - (lastMoveAt || 0) < AUTO_SCROLL_IDLE;
    if (Number.isFinite(lastX) && Number.isFinite(lastY)) {
        if (pointerMoving) scrollForEdges(lastX, lastY);
        positionDraggedObject(lastX, lastY);
    }
    autoscrollRaf = requestAnimationFrame(tickAutoScroll);
}

canvas.addEventListener('wheel', (event) => {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
        const deltaFactor = event.deltaY > 0 ? 0.9 : 1.1;
        zoomAtPoint(event, viewState.scale * deltaFactor);
        return;
    }

    // Rueda normal: desplazamiento libre por el espacio virtual.
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    const deltaX = event.shiftKey ? event.deltaY : event.deltaX;
    const deltaY = event.shiftKey ? 0 : event.deltaY;
    setViewScroll(
        viewState.scrollX + deltaX * unit,
        viewState.scrollY + deltaY * unit,
    );
}, { passive: false });

canvas.addEventListener('pointerdown', (event) => {
    viewState.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (viewState.activePointers.size === 2) {
        const [first, second] = [...viewState.activePointers.values()];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        viewState.pinchDistance = Math.hypot(dx, dy);
    }

    if (toolState.active === 'measure') {
        if (viewState.activePointers.size === 1) handleMeasurePointerDown(event);
        return;
    }

    if (toolState.active === 'move') {
        toolState.pan = {
            x: event.clientX,
            y: event.clientY,
            scrollX: viewState.scrollX,
            scrollY: viewState.scrollY,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
    }

    const targetItem = event.target.closest('.object');
    if (event.button !== 0) return;
    if (!targetItem) {
        document.querySelectorAll('.object').forEach((item) => item.classList.remove('selected'));
        document.querySelectorAll('.layer-div').forEach((item) => item.classList.remove('selected-layer'));
        state.selectedLayerId = null;
        clearSnapGuides();
        clearOpeningOverlay();
        syncSizeManager();
        syncRotationHandle(null);
        return;
    }

    clearSnapGuides();
    selectVisibleObject(targetItem);

    const rect = targetItem.getBoundingClientRect();
    const sceneRect = scene.getBoundingClientRect();
    const startPointer = pointerToScene(event);
    const startCenter = {
        x: ((rect.left - sceneRect.left) + rect.width / 2) / viewState.scale,
        y: ((rect.top - sceneRect.top) + rect.height / 2) / viewState.scale,
    };

    toolState.dragObject = {
        item: targetItem,
        startPointer,
        startCenter,
        lastX: event.clientX,
        lastY: event.clientY,
        lastMoveAt: 0,
        shiftKey: event.shiftKey,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    if (autoscrollRaf) cancelAnimationFrame(autoscrollRaf);
    autoscrollRaf = requestAnimationFrame(tickAutoScroll);
    event.preventDefault();
});

canvas.addEventListener('pointermove', (event) => {
    if (viewState.activePointers.has(event.pointerId)) {
        viewState.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (toolState.rotateDrag) {
        const drag = toolState.rotateDrag;
        const angle = Math.atan2(event.clientY - drag.center.y, event.clientX - drag.center.x);

        // Solo empezamos a rotar cuando el puntero se aleja lo suficiente del
        // punto de inicio, para que un clic con temblor no rote por accidente.
        if (!drag.dragging) {
            const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
            if (distance < ROTATE_DRAG_THRESHOLD) return;
            drag.dragging = true;
            drag.startAngle = angle;
            drag.base = getRotation(drag.item);
        }

        const degrees = (angle - drag.startAngle) * 180 / Math.PI;
        applyRotation(drag.item, snapRotation(drag.base + degrees));
        return;
    }

    if (viewState.activePointers.size >= 2 && viewState.pinchDistance) {
        const [first, second] = [...viewState.activePointers.values()];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const pinchDistance = Math.hypot(dx, dy);
        const scaleDelta = pinchDistance / viewState.pinchDistance;
        const rect = canvas.getBoundingClientRect();
        const midX = (first.x + second.x) / 2 - rect.left;
        const midY = (first.y + second.y) / 2 - rect.top;
        zoomAtScreenPoint(midX, midY, viewState.scale * scaleDelta);
        viewState.pinchDistance = pinchDistance;
    }

    if (toolState.active === 'measure') {
        if (viewState.activePointers.size < 2) {
            if (!updateMeasureDrag(event)) updateMeasureCursor(event);
        }
        return;
    }

    if (toolState.dragObject) {
        toolState.dragObject.lastX = event.clientX;
        toolState.dragObject.lastY = event.clientY;
        toolState.dragObject.lastMoveAt = performance.now();
        toolState.dragObject.shiftKey = event.shiftKey;
        positionDraggedObject(event.clientX, event.clientY);
        return;
    }

    if (toolState.pan) {
        const dx = event.clientX - toolState.pan.x;
        const dy = event.clientY - toolState.pan.y;
        setViewScroll(toolState.pan.scrollX - dx, toolState.pan.scrollY - dy);
        return;
    }
});

canvas.addEventListener('pointerleave', () => {
    canvas.classList.remove('measure-point-hover');
});

canvas.addEventListener('pointerup', (event) => {
    viewState.activePointers.delete(event.pointerId);
    if (viewState.activePointers.size < 2) {
        viewState.pinchDistance = null;
    }
    if (toolState.active === 'measure') stopMeasureDrag();
    const item = toolState.dragObject?.item;
    const rotatedItem = toolState.rotateDrag?.item;
    toolState.pan = null;
    toolState.dragObject = null;
    toolState.rotateDrag = null;
    if (autoscrollRaf) {
        cancelAnimationFrame(autoscrollRaf);
        autoscrollRaf = null;
    }
    if (item) guardarCambios(item);
    if (rotatedItem) {
        guardarCambios(rotatedItem);
        syncOpeningOverlay(getSelectedObject());
    }
    clearSnapGuides();
    flushActiveView();
});

canvas.addEventListener('pointercancel', (event) => {
    viewState.activePointers.delete(event.pointerId);
    if (viewState.activePointers.size < 2) {
        viewState.pinchDistance = null;
    }
    if (toolState.active === 'measure') stopMeasureDrag();
    const item = toolState.dragObject?.item;
    const rotatedItem = toolState.rotateDrag?.item;
    toolState.pan = null;
    toolState.dragObject = null;
    toolState.rotateDrag = null;
    if (autoscrollRaf) {
        cancelAnimationFrame(autoscrollRaf);
        autoscrollRaf = null;
    }
    if (item) guardarCambios(item);
    if (rotatedItem) guardarCambios(rotatedItem);
    clearSnapGuides();
});

// Shift se puede pulsar o soltar sin mover el puntero: refrescamos la
// posición del objeto en el momento para que el cambio de imán sea inmediato.
export function setDragShift(shiftKey) {
    const drag = toolState.dragObject;
    if (!drag || drag.shiftKey === shiftKey) return;

    if (shiftKey) {
        // Al desactivar el imán no teletransportamos el objeto a su posición
        // "cruda": conservamos la posición actual y desde ahí sigue al puntero.
        const pointer = pointerToScene({ clientX: drag.lastX, clientY: drag.lastY });
        const rect = drag.item.getBoundingClientRect();
        const sceneRect = scene.getBoundingClientRect();
        const centerX = ((rect.left - sceneRect.left) + rect.width / 2) / viewState.scale;
        const centerY = ((rect.top - sceneRect.top) + rect.height / 2) / viewState.scale;
        drag.startPointer = {
            x: pointer.x - (centerX - drag.startCenter.x),
            y: pointer.y - (centerY - drag.startCenter.y),
        };
    }

    drag.shiftKey = shiftKey;
    // Un cambio de Shift no debe dejar corriendo el autoscroll: congela la
    // vista hasta que el puntero vuelva a moverse.
    drag.lastMoveAt = 0;
    const { lastX, lastY } = drag;
    if (Number.isFinite(lastX) && Number.isFinite(lastY)) {
        positionDraggedObject(lastX, lastY);
    }
}

canvas.addEventListener('contextmenu', (event) => {
    if (toolState.active === 'measure') return;

    if (event.target.closest('.rotate-handle')) {
        document.querySelector('.popup-menu-box')?.remove();
        return;
    }

    const item = event.target.closest('.object');
    if (!item) {
        document.querySelector('.popup-menu-box')?.remove();
        return;
    }

    event.preventDefault();
    selectVisibleObject(item);
    openLayerMenuForItem(item, { x: event.clientX, y: event.clientY });
});
