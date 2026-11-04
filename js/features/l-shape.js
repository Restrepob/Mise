// Forma L: una caja rectangular con dos brazos (izquierdo e inferior).
// El alto y ancho siguen siendo la caja total; los brazos solo recortan el
// relleno interior, por eso la seleccion, el handle de rotacion y las cotas
// siguen viviendo en el elemento exterior.
import { metro } from '../core/state.js';

const MIN_ARM = 1;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export function isLShape(item) {
    return item?.dataset.shape === 'l';
}

export function ensureLShapeFill(item) {
    if (!item) return null;

    let fill = item.querySelector(':scope > .l-shape-fill');
    if (!fill) {
        fill = document.createElement('div');
        fill.className = 'l-shape-fill';
        item.prepend(fill);
    }
    return fill;
}

export function getLShapeFillColor(item) {
    return item?.querySelector(':scope > .l-shape-fill')?.style.backgroundColor || '';
}

// Medidas en pixeles de escena. Los brazos se limitan a la caja total para
// que el poligono de la L nunca se cruce.
export function getLShapeMetrics(item) {
    if (!item) return { width: 0, height: 0, armX: 0, armY: 0 };

    const width = parseFloat(item.style.width) || item.offsetWidth || 0;
    const height = parseFloat(item.style.height) || item.offsetHeight || 0;
    const fallback = Math.max(MIN_ARM, Math.min(width, height) * 0.4);
    const rawArmX = Number.parseFloat(item.dataset.armX);
    const rawArmY = Number.parseFloat(item.dataset.armY);

    return {
        width,
        height,
        armX: clamp(Number.isFinite(rawArmX) ? rawArmX : fallback, MIN_ARM, Math.max(MIN_ARM, width)),
        armY: clamp(Number.isFinite(rawArmY) ? rawArmY : fallback, MIN_ARM, Math.max(MIN_ARM, height)),
    };
}

// Se recalcula cada vez que cambia el tamano de la caja o un brazo. El
// clip-path usa porcentajes para que el navegador lo escale sin recalcular
// nada durante el zoom.
export function syncLShape(item) {
    if (!isLShape(item)) return null;

    const metrics = getLShapeMetrics(item);
    const { width, height, armX, armY } = metrics;
    if (width <= 0 || height <= 0) return metrics;

    const x = (armX / width) * 100;
    const notchY = ((height - armY) / height) * 100;

    item.dataset.armX = String(armX);
    item.dataset.armY = String(armY);
    item.style.backgroundColor = '';
    item.style.setProperty('--l-name-y', `${height - armY / 2}px`);

    const fill = ensureLShapeFill(item);
    if (fill) {
        fill.style.clipPath = `polygon(0 0, ${x}% 0, ${x}% ${notchY}%, 100% ${notchY}%, 100% 100%, 0 100%)`;
    }

    return metrics;
}

export function setupLShape(item, options = {}) {
    if (!item) return null;

    item.dataset.shape = 'l';
    item.classList.add('l-shape');

    if (Number.isFinite(options.armX)) item.dataset.armX = String(options.armX);
    if (Number.isFinite(options.armY)) item.dataset.armY = String(options.armY);

    const fill = ensureLShapeFill(item);
    const color = options.color || item.style.backgroundColor;
    if (fill && color && color !== 'transparent') fill.style.backgroundColor = color;

    item.style.borderRadius = '';
    syncLShape(item);

    const nameEl = item.querySelector(':scope > .balance-name');
    if (nameEl) nameEl.style.transform = 'translate(-50%, -50%) rotate(0deg)';

    return item;
}

export function setLShapeArm(item, axis, pixels) {
    if (!isLShape(item)) return null;

    const metrics = getLShapeMetrics(item);
    const max = Math.max(MIN_ARM, axis === 'armX' ? metrics.width : metrics.height);
    const value = clamp(Number(pixels) || 0, MIN_ARM, max);
    item.dataset[axis] = String(value);
    return syncLShape(item);
}

// Ayuda para persistencia: los brazos se guardan en metros, como el resto
// de medidas del plano.
export function getLShapeArmsInMeters(item) {
    const { armX, armY } = getLShapeMetrics(item);
    return { armX: armX / metro, armY: armY / metro };
}
