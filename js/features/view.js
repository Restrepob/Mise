// Zoom, scroll y transformacion del scene
import { canvas, scene } from '../core/dom.js';
import { syncOpeningOverlay } from './door.js';
import { getActiveRoom, getSelectedObject } from '../core/model.js';
import { flushActiveView } from './persistence.js';
import { SCENE_PADDING, viewState } from '../core/state.js';
import { getRotation, normalizeDeg } from '../core/units.js';

export function updateSceneSize(item) {
    if (!item.classList.contains('room')) return;

    const height = parseFloat(item.style.height) || item.offsetHeight;
    const width = parseFloat(item.style.width) || item.offsetWidth;
    scene.style.width = `${width + SCENE_PADDING}px`;
    scene.style.height = `${height + SCENE_PADDING}px`;
}

export function updateMinScaleForRoom(room) {
    if (!room || !room.classList.contains('room')) return;

    const width = parseFloat(room.style.width) || room.offsetWidth;
    const height = parseFloat(room.style.height) || room.offsetHeight;
    const fit = Math.min(
        canvas.clientWidth / (width + SCENE_PADDING),
        canvas.clientHeight / (height + SCENE_PADDING),
    );
    viewState.minScale = Math.min(viewState.baseMinScale, Math.max(0.05, fit));
}

export function clampScale(scale) {
    return Math.min(Math.max(scale, viewState.minScale), viewState.maxScale);
}

export function getCenteredViewScroll() {
    const sceneWidth = scene.offsetWidth || 0;
    const sceneHeight = scene.offsetHeight || 0;
    return {
        x: (sceneWidth * viewState.scale - canvas.clientWidth) / 2,
        y: (sceneHeight * viewState.scale - canvas.clientHeight) / 2,
    };
}

export function applySceneScale() {
    // translate + scale: el origen del scene puede quedar en cualquier punto,
    // incluso fuera de los límites del canvas. Ese es el espacio virtual.
    scene.style.transform =
        `translate(${-viewState.scrollX}px, ${-viewState.scrollY}px) scale(${viewState.scale})`;
    // Variables para UI del lienzo (selector, handle de giro, nombres): permiten
    // contrarrestar el zoom y mantener un tamaño visual constante en pantalla.
    scene.style.setProperty('--scene-scale', String(viewState.scale));
    scene.style.setProperty('--inv-scene-scale', String(1 / viewState.scale));
}

export let viewPersistTimer = null;

export function setViewScroll(x, y) {
    viewState.scrollX = x;
    viewState.scrollY = y;
    applySceneScale();
    scheduleViewPersist();
}

export function scheduleViewPersist() {
    if (viewPersistTimer) clearTimeout(viewPersistTimer);
    viewPersistTimer = setTimeout(() => {
        viewPersistTimer = null;
        flushActiveView();
    }, 400);
}

export function pointerToScene(event) {
    const sceneRect = scene.getBoundingClientRect();
    return {
        x: (event.clientX - sceneRect.left) / viewState.scale,
        y: (event.clientY - sceneRect.top) / viewState.scale,
    };
}

// Rotacion del padre en grados (0 cuando el padre es el propio scene).
export function getParentRotation(parent) {
    return parent && parent !== scene ? normalizeDeg(getRotation(parent)) : 0;
}

// Centro del border-box del padre medido desde su padding-box, que es el
// origen en el que viven style.left/top de los hijos y offsetLeft/offsetTop.
function getParentCenterLocal(parent) {
    return {
        x: parent.offsetWidth / 2 - parent.clientLeft,
        y: parent.offsetHeight / 2 - parent.clientTop,
    };
}

// Centro del padre en coordenadas del scene (sin escalar). El centro del
// rectangulo envolvente coincide con el centro real aunque el padre este
// rotado, porque la rotacion es alrededor de ese mismo centro.
function getParentCenterScene(parent) {
    const parentRect = parent.getBoundingClientRect();
    const sceneRect = scene.getBoundingClientRect();
    return {
        x: (parentRect.left + parentRect.width / 2 - sceneRect.left) / viewState.scale,
        y: (parentRect.top + parentRect.height / 2 - sceneRect.top) / viewState.scale,
    };
}

// Deshace la rotacion del padre sobre un desplazamiento medido en el scene.
export function sceneDeltaToLocal(parent, dx, dy) {
    const rotation = getParentRotation(parent);
    if (!rotation) return { x: dx, y: dy };

    const radians = rotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    // R(-rotacion) aplicada al desplazamiento del scene.
    return {
        x: dx * cos + dy * sin,
        y: -dx * sin + dy * cos,
    };
}

// Pasa un punto del scene a coordenadas locales del padre. Es el camino
// inverso: restar el centro del padre y deshacer su rotacion.
export function sceneToLocal(parent, point) {
    if (!parent || parent === scene) return { x: point.x, y: point.y };

    const centerScene = getParentCenterScene(parent);
    const centerLocal = getParentCenterLocal(parent);
    const delta = sceneDeltaToLocal(parent, point.x - centerScene.x, point.y - centerScene.y);
    return {
        x: centerLocal.x + delta.x,
        y: centerLocal.y + delta.y,
    };
}

// Pasa un punto local del padre a coordenadas del canvas (pantalla), ya con
// la rotacion del padre y el zoom aplicados. Lo usan las guias de snap.
export function localToCanvas(parent, localX, localY) {
    const canvasRect = canvas.getBoundingClientRect();
    const sceneRect = scene.getBoundingClientRect();
    let sceneX = localX;
    let sceneY = localY;

    if (parent && parent !== scene) {
        const centerScene = getParentCenterScene(parent);
        const centerLocal = getParentCenterLocal(parent);
        const radians = getParentRotation(parent) * Math.PI / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const dx = localX - centerLocal.x;
        const dy = localY - centerLocal.y;
        sceneX = centerScene.x + dx * cos - dy * sin;
        sceneY = centerScene.y + dx * sin + dy * cos;
    }

    return {
        x: sceneRect.left - canvasRect.left + sceneX * viewState.scale,
        y: sceneRect.top - canvasRect.top + sceneY * viewState.scale,
    };
}

export function zoomAtScreenPoint(screenX, screenY, nextScale) {
    const clamped = clampScale(nextScale);
    const scaleRatio = clamped / viewState.scale;

    const nextScrollX = (viewState.scrollX + screenX) * scaleRatio - screenX;
    const nextScrollY = (viewState.scrollY + screenY) * scaleRatio - screenY;

    viewState.scale = clamped;
    setViewScroll(nextScrollX, nextScrollY);
    syncOpeningOverlay(getSelectedObject());
}

export function zoomAtPoint(event, nextScale) {
    const rect = canvas.getBoundingClientRect();
    zoomAtScreenPoint(event.clientX - rect.left, event.clientY - rect.top, nextScale);
}

window.addEventListener('resize', () => {
    const room = getActiveRoom();
    if (!room) return;
    updateMinScaleForRoom(room);
    viewState.scale = clampScale(viewState.scale);
    applySceneScale();
});

applySceneScale();
