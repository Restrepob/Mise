// Redimensionado del sidebar
export const SIDEBAR_SIZE_KEY = 'mise-sidebar-sizes';

export const sidebarBox = document.querySelector('.sidebar-box');

export const sidebarResizers = document.querySelectorAll('.sidebar-resizer');

export const sidebarSizes = { rooms: 0.14, size: 0.588, objects: 0.272 };

export let sidebarResizeDrag = null;

export function loadSidebarSizes() {
    try {
        const saved = JSON.parse(localStorage.getItem(SIDEBAR_SIZE_KEY));
        if (!saved) return;
        const values = ['rooms', 'size', 'objects'].map((key) => Number(saved[key]));
        if (values.every((value) => Number.isFinite(value) && value > 0.05 && value < 0.95)) {
            sidebarSizes.rooms = values[0];
            sidebarSizes.size = values[1];
            sidebarSizes.objects = values[2];
        }
    } catch {
        // Datos inválidos: se conservan los tamaños por defecto.
    }
}

export function applySidebarSizes() {
    if (!sidebarBox) return;
    const total = sidebarSizes.rooms + sidebarSizes.size + sidebarSizes.objects;
    if (!(total > 0)) return;
    sidebarBox.style.setProperty('--rooms-size', String(sidebarSizes.rooms / total));
    sidebarBox.style.setProperty('--size-size', String(sidebarSizes.size / total));
    sidebarBox.style.setProperty('--objects-size', String(sidebarSizes.objects / total));
}

export function saveSidebarSizes() {
    localStorage.setItem(SIDEBAR_SIZE_KEY, JSON.stringify(sidebarSizes));
}

export function getSidebarChromeHeight(element) {
    const style = getComputedStyle(element);
    return ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
        .reduce((total, property) => total + (parseFloat(style[property]) || 0), 0);
}

export function getSidebarResizeTarget(resizer) {
    if (!sidebarBox) return null;
    const before = sidebarBox.querySelector(`.${resizer.dataset.before}`);
    const after = sidebarBox.querySelector(`.${resizer.dataset.after}`);
    if (!before || !after) return null;

    const resizerTotal = [...sidebarResizers].reduce((total, item) => total + item.getBoundingClientRect().height, 0);
    const available = sidebarBox.clientHeight - resizerTotal;
    const startBefore = before.getBoundingClientRect().height;
    const startAfter = after.getBoundingClientRect().height;

    // Con flex-basis:0 y box-sizing:border-box cada sección conserva su padding y
    // borde como tamaño base; solo el resto se reparte según el factor de crecimiento.
    const chromeTotal = [...sidebarBox.children]
        .filter((item) => !item.classList.contains('sidebar-resizer') && parseFloat(getComputedStyle(item).flexGrow) > 0)
        .reduce((total, item) => total + getSidebarChromeHeight(item), 0);
    const usable = available - chromeTotal;

    const baseBefore = getSidebarChromeHeight(before);
    const baseAfter = getSidebarChromeHeight(after);
    if (available <= 0 || usable <= 0 || !startBefore || !startAfter) return null;

    return {
        resizer,
        beforeKey: resizer.dataset.beforeSize,
        afterKey: resizer.dataset.afterSize,
        usable,
        baseBefore,
        baseAfter,
        startBefore,
        startAfter,
        minBefore: parseFloat(getComputedStyle(before).minHeight) || 0,
        minAfter: parseFloat(getComputedStyle(after).minHeight) || 0,
    };
}

export function applySidebarResize(target, delta) {
    const total = target.startBefore + target.startAfter;
    const maxBefore = Math.max(target.minBefore, total - target.minAfter);
    const before = Math.min(Math.max(target.startBefore + delta, target.minBefore), maxBefore);
    const after = total - before;

    sidebarSizes[target.beforeKey] = (before - target.baseBefore) / target.usable;
    sidebarSizes[target.afterKey] = (after - target.baseAfter) / target.usable;
    applySidebarSizes();
}

export function startSidebarResize(event) {
    if (event.button !== 0) return;
    const target = getSidebarResizeTarget(event.currentTarget);
    if (!target) return;

    event.preventDefault();
    sidebarResizeDrag = { ...target, startY: event.clientY, pointerId: event.pointerId };
    target.resizer.classList.add('is-dragging');
    target.resizer.setPointerCapture(event.pointerId);
    document.body.classList.add('sidebar-resizing');
}

export function moveSidebarResize(event) {
    if (!sidebarResizeDrag || event.pointerId !== sidebarResizeDrag.pointerId) return;
    applySidebarResize(sidebarResizeDrag, event.clientY - sidebarResizeDrag.startY);
}

export function endSidebarResize(event) {
    if (!sidebarResizeDrag) return;
    if (event && event.pointerId !== sidebarResizeDrag.pointerId) return;
    sidebarResizeDrag.resizer.classList.remove('is-dragging');
    sidebarResizeDrag = null;
    document.body.classList.remove('sidebar-resizing');
    saveSidebarSizes();
}

export function nudgeSidebarResize(resizer, delta) {
    const target = getSidebarResizeTarget(resizer);
    if (!target) return;
    applySidebarResize(target, delta);
    saveSidebarSizes();
}

loadSidebarSizes();

applySidebarSizes();

sidebarResizers.forEach((resizer) => {
    resizer.addEventListener('pointerdown', startSidebarResize);
    resizer.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        nudgeSidebarResize(resizer, event.key === 'ArrowDown' ? 16 : -16);
    });
});

window.addEventListener('pointermove', moveSidebarResize);

window.addEventListener('pointerup', endSidebarResize);

window.addEventListener('pointercancel', endSidebarResize);
