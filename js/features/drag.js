// Arrastre de objetos y autoscroll
import { canvas, scene } from '../core/dom.js';
import { clearOpeningOverlay, syncOpeningOverlay } from './door.js';
import { openLayerMenuForItem, selectVisibleObject, toggleMultiSelection } from './layers.js';
import { getGroupSelection, isPointInsideGroupSelection, rotateSelectionGroupBy, syncGroupSelectionOverlay } from './group-selection.js';
import { handleMeasurePointerDown, stopMeasureDrag, updateMeasureCursor, updateMeasureDrag } from './measure.js';
import { getSelectedObject, isItemLocked, isOpening } from '../core/model.js';
import { dragOpeningAlongWall } from './openings.js';
import { flushActiveView, guardarCambios } from './persistence.js';
import { ROTATE_DRAG_THRESHOLD, applyRotation, rotateByClick, syncRotationHandle } from './rotation.js';
import { syncSizeManager } from './size-manager.js';
import { clearSnapGuides, snapGroup, snapObject } from './snapping.js';
import { AUTO_SCROLL_EDGE, AUTO_SCROLL_IDLE, AUTO_SCROLL_SPEED, state, toolState, viewState } from '../core/state.js';
import { getRotation, snapRotation } from '../core/units.js';
import { pointerToScene, sceneDeltaToLocal, sceneToLocal, setViewScroll, zoomAtPoint, zoomAtScreenPoint } from './view.js';

export let autoscrollRaf = null;
let lastModifierRotateTime = 0;

export function positionDraggedObject(clientX, clientY) {
    const { item, parent, startPointer, startLocal, shiftKey, groupItems, groupStartPositions } = toolState.dragObject;
    const pointer = pointerToScene({ clientX, clientY });

    // El arrastre se calcula en coordenadas locales del padre: el
    // desplazamiento del puntero se gira en sentido inverso a la rotacion de
    // la room. Asi un movimiento de pantalla mueve el objeto en su mismo eje
    // aunque la room este a 90, 180 o 270 grados.
    const localDelta = sceneDeltaToLocal(
        parent,
        pointer.x - startPointer.x,
        pointer.y - startPointer.y,
    );
    if (groupItems?.length > 1) {
        groupItems.forEach((groupItem, index) => {
            groupItem.style.left = `${groupStartPositions[index].x + localDelta.x}px`;
            groupItem.style.top = `${groupStartPositions[index].y + localDelta.y}px`;
        });
        if (shiftKey) {
            clearSnapGuides();
        } else {
            const snapped = snapGroup(groupItems, parent);
            if (snapped.deltaX || snapped.deltaY) {
                groupItems.forEach((groupItem) => {
                    groupItem.style.left = `${(Number.parseFloat(groupItem.style.left) || 0) + snapped.deltaX}px`;
                    groupItem.style.top = `${(Number.parseFloat(groupItem.style.top) || 0) + snapped.deltaY}px`;
                });
            }
        }
        syncGroupSelectionOverlay();
        return;
    }
    const localX = startLocal.x + localDelta.x;
    const localY = startLocal.y + localDelta.y;

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

    const targetItem = event.target.closest('.object');
    // Alt + clic (derecho o izquierdo) sobre el objeto: gira 90 grados sin
    // moverlo. Clic derecho = sentido horario (+90), Clic izquierdo = sentido
    // antihorario (-90). Tiene prioridad sobre el modo mover, sobre el handle
    // de rotacion y sobre el menu contextual: con Alt el objeto gira, no se
    // desplaza ni se abre el popup.
    // Se usa Alt y no Shift porque Firefox/Zen reservan Shift + clic derecho
    // para abrir su propio menu y no permiten cancelarlo desde la web.
    if (event.altKey && (event.button === 0 || event.button === 2)) {
        if (targetItem && isItemLocked(targetItem)) {
            event.preventDefault();
            lastModifierRotateTime = Date.now();
            selectVisibleObject(targetItem);
            return;
        }
        const selectedGroup = getGroupSelection();
        const rotatesGroup = selectedGroup.length > 1
            && isPointInsideGroupSelection(event.clientX, event.clientY);
        if (rotatesGroup) {
            event.preventDefault();
            lastModifierRotateTime = Date.now();
            clearSnapGuides();
            rotateSelectionGroupBy(event.button === 2 ? 90 : -90);
            syncOpeningOverlay(getSelectedObject());
            return;
        }
        if (targetItem) {
            event.preventDefault();
            lastModifierRotateTime = Date.now();
            clearSnapGuides();
            selectVisibleObject(targetItem);
            if (!isOpening(targetItem)) {
                rotateByClick(targetItem, event.button);
                guardarCambios(targetItem);
            }
            syncOpeningOverlay(getSelectedObject());
            return;
        }
    }

    if (event.button === 0 && (event.ctrlKey || event.metaKey) && targetItem && toggleMultiSelection(targetItem)) {
        event.preventDefault();
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

    if (event.button !== 0) return;
    if (!targetItem) {
        document.querySelectorAll('.object').forEach((item) => item.classList.remove('selected'));
        document.querySelectorAll('.layer-div').forEach((item) => item.classList.remove('selected-layer'));
        state.selectedLayerId = null;
        state.selectedObjectIds = [];
        clearSnapGuides();
        clearOpeningOverlay();
        syncSizeManager();
        syncRotationHandle(null);
        return;
    }

    if (isItemLocked(targetItem)) {
        clearSnapGuides();
        selectVisibleObject(targetItem);
        event.preventDefault();
        return;
    }

    clearSnapGuides();
    const selectedGroup = getGroupSelection();
    const groupItems = selectedGroup.length > 1 && selectedGroup.includes(targetItem) ? selectedGroup : null;
    if (!groupItems) selectVisibleObject(targetItem);

    const parent = targetItem.offsetParent || scene;
    const rect = targetItem.getBoundingClientRect();
    const sceneRect = scene.getBoundingClientRect();
    const startPointer = pointerToScene(event);
    const startCenter = {
        x: ((rect.left - sceneRect.left) + rect.width / 2) / viewState.scale,
        y: ((rect.top - sceneRect.top) + rect.height / 2) / viewState.scale,
    };

    // El ancla vive en coordenadas locales del padre. Para los objetos es su
    // centro; para las aperturas es el propio puntero, porque se deslizan
    // sobre la pared. Convertirlo al sistema local permite seguir al puntero
    // aunque la room este rotada.
    const startLocal = isOpening(targetItem)
        ? sceneToLocal(parent, startPointer)
        : sceneToLocal(parent, startCenter);

    toolState.dragObject = {
        item: targetItem,
        parent,
        startPointer,
        startLocal,
        lastX: event.clientX,
        lastY: event.clientY,
        lastMoveAt: 0,
        shiftKey: event.shiftKey,
        ...(groupItems ? {
            groupItems,
            groupStartPositions: groupItems.map((groupItem) => ({
                x: Number.parseFloat(groupItem.style.left) || 0,
                y: Number.parseFloat(groupItem.style.top) || 0,
            })),
        } : {}),
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
    const draggedItems = toolState.dragObject?.groupItems || (toolState.dragObject?.item ? [toolState.dragObject.item] : []);
    const rotatedItem = toolState.rotateDrag?.item;
    toolState.pan = null;
    toolState.dragObject = null;
    toolState.rotateDrag = null;
    if (autoscrollRaf) {
        cancelAnimationFrame(autoscrollRaf);
        autoscrollRaf = null;
    }
    draggedItems.forEach(guardarCambios);
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
    const draggedItems = toolState.dragObject?.groupItems || (toolState.dragObject?.item ? [toolState.dragObject.item] : []);
    const rotatedItem = toolState.rotateDrag?.item;
    toolState.pan = null;
    toolState.dragObject = null;
    toolState.rotateDrag = null;
    if (autoscrollRaf) {
        cancelAnimationFrame(autoscrollRaf);
        autoscrollRaf = null;
    }
    draggedItems.forEach(guardarCambios);
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
        // "cruda": reanclamos el arrastre en la posición actual (en
        // coordenadas locales del padre) y desde ahí sigue al puntero.
        const { item, parent } = drag;
        drag.startPointer = pointerToScene({ clientX: drag.lastX, clientY: drag.lastY });
        if (drag.groupItems?.length > 1) {
            drag.groupStartPositions = drag.groupItems.map((groupItem) => ({
                x: Number.parseFloat(groupItem.style.left) || 0,
                y: Number.parseFloat(groupItem.style.top) || 0,
            }));
        } else if (isOpening(item)) {
            drag.startLocal = sceneToLocal(parent, drag.startPointer);
        } else {
            const rect = item.getBoundingClientRect();
            const sceneRect = scene.getBoundingClientRect();
            drag.startLocal = sceneToLocal(parent, {
                x: ((rect.left - sceneRect.left) + rect.width / 2) / viewState.scale,
                y: ((rect.top - sceneRect.top) + rect.height / 2) / viewState.scale,
            });
        }
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

// El menu nativo no debe aparecer en el area del editor. El contextmenu puede
// terminar sobre la barra de herramientas o fuera del canvas si el objeto gira
// justo debajo del puntero, por eso se bloquea tambien en fase de captura y
// cubriendo todo el content-box, no solo el canvas.
window.addEventListener('contextmenu', (event) => {
    const inEditor = event.target instanceof Element && event.target.closest('.content-box');
    const rotating = event.altKey || Date.now() - lastModifierRotateTime < 500;
    if (inEditor || rotating) event.preventDefault();
}, true);

canvas.addEventListener('contextmenu', (event) => {
    // Dentro del lienzo el menu contextual siempre lo gestiona la app. Evita
    // que el navegador abra su menu nativo, incluso si el objeto se movio o
    // giro entre pointerdown y contextmenu (Alt + clic derecho).
    event.preventDefault();

    if (toolState.active === 'measure') return;

    // Un objeto en borrador todavia no tiene menu de capa: duplicarlo o
    // eliminarlo antes de fijar sus medidas dejaria la creacion a medias.
    if (event.target.closest('.object.draft')) {
        event.preventDefault();
        document.querySelector('.popup-menu-box')?.remove();
        return;
    }

    // Con Alt el clic derecho es un giro de 90 grados: no abrimos el menu, ni
    // siquiera cuando el clic cae sobre el handle de rotacion o si se solto el
    // modificador una fraccion de segundo antes de contextmenu.
    if ((event.altKey || Date.now() - lastModifierRotateTime < 400) && event.target.closest('.object')) {
        event.preventDefault();
        document.querySelector('.popup-menu-box')?.remove();
        return;
    }

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
