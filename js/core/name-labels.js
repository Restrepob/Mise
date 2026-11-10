import { viewState } from './state.js';
import { getRotation } from './units.js';

const BASE_FONT_SIZE = 14;
const MIN_FONT_SIZE = 0;
const INNER_MARGIN = 8;
const FONT_WEIGHT = 400;
const measureCanvas = document.createElement('canvas');
const measureContext = measureCanvas.getContext('2d');
const labelLayoutCache = new WeakMap();

export function syncItemNameLabel(item) {
    const label = item?.querySelector(':scope > .balance-name');
    if (!label) return;

    const parentRotation = item.parentElement?.classList.contains('room')
        ? getRotation(item.parentElement)
        : 0;
    const totalRotation = getRotation(item) + parentRotation;
    let itemWidth = Number.parseFloat(item.style.width) || item.offsetWidth || 0;
    let itemHeight = Number.parseFloat(item.style.height) || item.offsetHeight || 0;
    const vertical = itemHeight > itemWidth;
    let regionWidth = itemWidth;
    let regionHeight = itemHeight;
    let centerX = itemWidth / 2;
    let centerY = itemHeight / 2;

    if (item.dataset.shape === 'l') {
        const armX = Number.parseFloat(item.dataset.armX) || itemWidth * 0.4;
        const armY = Number.parseFloat(item.dataset.armY) || itemHeight * 0.4;
        if (vertical) {
            regionWidth = armX;
            centerX = armX / 2;
        } else {
            regionHeight = armY;
            centerY = itemHeight - armY / 2;
        }
    } else if (item.dataset.shape === 'semicircle') {
        regionWidth *= 0.82;
    }

    const labelAngle = allowedTextDirection(totalRotation + (vertical ? 90 : 0));
    label.style.left = `${(centerX / itemWidth) * 100}%`;
    label.style.top = `${(centerY / itemHeight) * 100}%`;
    label.style.transform = `translate(-50%, -50%) rotate(${labelAngle - totalRotation}deg) scale(var(--inv-scene-scale, 1))`;
    label.style.fontWeight = String(FONT_WEIGHT);

    const text = label.querySelector('.balance-text');
    if (!text || !measureContext) return;

    const fullName = String(item.dataset.name ?? text.textContent ?? '');
    const characters = Array.from(fullName);
    label.title = fullName;

    const scale = viewState.scale || 1;
    const availableWidth = Math.max(0, regionWidth * scale - INNER_MARGIN);
    const availableHeight = Math.max(0, regionHeight * scale - INNER_MARGIN);
    // El texto sigue el eje largo del objeto. Se ajusta contra el espacio local
    // real del objeto, que no cambia por la rotación de la room.
    const radians = (labelAngle - totalRotation) * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const style = getComputedStyle(label);
    const family = style.fontFamily || 'sans-serif';

    function fits(content, fontSize) {
        measureContext.font = `${FONT_WEIGHT} ${fontSize}px ${family}`;
        const textWidth = measureContext.measureText(content).width;
        const textHeight = fontSize * 1.2;
        return cos * textWidth + sin * textHeight <= availableWidth
            && sin * textWidth + cos * textHeight <= availableHeight;
    }

    // Muestra el nombre completo cuando cabe. Si no, busca el prefijo más
    // largo que quepa a tamaño base y añade la elipsis solo al texto restante.
    let displayName = fullName;
    if (!fits(fullName, BASE_FONT_SIZE) && fullName) {
        if (fits('…', BASE_FONT_SIZE)) {
            let low = 0;
            let high = characters.length - 1;
            let best = '…';
            while (low <= high) {
                const count = Math.floor((low + high) / 2);
                const candidate = `${characters.slice(0, count).join('')}…`;
                if (fits(candidate, BASE_FONT_SIZE)) {
                    best = candidate;
                    low = count + 1;
                } else {
                    high = count - 1;
                }
            }
            displayName = best;
        }
    }
    if (text.textContent !== displayName) text.textContent = displayName;
    const content = displayName;

    let low = MIN_FONT_SIZE;
    let high = BASE_FONT_SIZE;
    for (let attempt = 0; attempt < 18; attempt += 1) {
        const candidate = (low + high) / 2;
        if (fits(content, candidate)) low = candidate;
        else high = candidate;
    }

    // La fuente tiene un tope legible en pantalla y se reduce solo cuando el
    // nombre o la forma no dejan suficiente espacio.
    let fontSize = fits(content, BASE_FONT_SIZE) ? BASE_FONT_SIZE : low;
    const geometryKey = [
        itemWidth, itemHeight, regionWidth, regionHeight, centerX, centerY,
        labelAngle, displayName, item.dataset.shape, item.dataset.armX, item.dataset.armY,
    ].join('|');
    const previous = labelLayoutCache.get(label);
    if (previous?.geometryKey === geometryKey && scale > previous.scale) {
        // Al acercar hay más espacio disponible: conserva como mínimo el
        // tamaño que ya cabía, evitando cualquier reducción perceptible.
        fontSize = Math.max(fontSize, previous.fontSize);
    }
    labelLayoutCache.set(label, { geometryKey, scale, fontSize });

    measureContext.font = `${FONT_WEIGHT} ${fontSize}px ${family}`;
    const textWidth = measureContext.measureText(content).width;
    const textHeight = fontSize * 1.2;
    const fitWidth = Math.max(0, Math.min(
        cos > 0.0001 ? (availableWidth - sin * textHeight) / cos : Infinity,
        sin > 0.0001 ? (availableHeight - cos * textHeight) / sin : Infinity,
    ));

    label.style.fontSize = `${fontSize}px`;
    label.style.width = `${Math.min(textWidth, fitWidth)}px`;
}

function uprightAngle(angle) {
    let normalized = ((angle + 180) % 360 + 360) % 360 - 180;
    if (normalized > 90) normalized -= 180;
    if (normalized < -90) normalized += 180;
    return normalized;
}

function allowedTextDirection(angle) {
    const readableAngle = uprightAngle(angle);
    return Math.abs(readableAngle) <= 45 ? 0 : -90;
}

document.fonts?.ready.then(() => {
    document.querySelectorAll('.balance-name').forEach((label) => {
        syncItemNameLabel(label.parentElement);
    });
});
