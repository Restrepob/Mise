// Previsualizaciones a escala de la forma real del objeto en el sidebar.
// Un unico motor dibuja el contorno (rectangulo, circulo/elipse o L) y coloca
// los controles alrededor de la caja local del objeto. Las tres previsualizaciones
// (medidas, bordes y tolerancia) comparten la misma figura para que el panel
// hable siempre de la forma real y no de un cuadrado generico.
import { OPENING_DEPTH } from '../core/state.js';
import { getRotation } from '../core/units.js';
import { isOpening } from '../core/model.js';
import { getLShapeMetrics, isLShape } from './l-shape.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const EDGE_SIDES = ['top', 'right', 'bottom', 'left'];
const TOLERANCE_SIDE_DEG = { top: -90, right: 0, bottom: 90, left: 180 };

const PREVIEWS = [
    { key: 'dimensions', rotorId: 'shape-dims-rotor', figureId: 'shape-dims-figure' },
    { key: 'edges', rotorId: 'edge-rotor', figureId: 'edge-figure', maxSize: 66 },
    { key: 'tolerance', rotorId: 'tolerance-rotor', figureId: 'tolerance-figure', maxSize: 66 },
];
let lastPreviewItem = null;
let stageObserver = null;

function observeDimensionStage() {
    const stage = document.getElementById('shape-dims-stage');
    if (!stage || stageObserver || typeof ResizeObserver === 'undefined') return;
    stageObserver = new ResizeObserver(() => {
        if (lastPreviewItem) syncShapePreviews(lastPreviewItem);
    });
    stageObserver.observe(stage);
}

function readItemSize(item) {
    if (!item) return { width: 0, height: 0 };
    if (isOpening(item)) {
        return {
            width: parseFloat(item.dataset.openingWidth) || parseFloat(item.style.width) || item.offsetWidth || 0,
            height: OPENING_DEPTH,
        };
    }
    return {
        width: parseFloat(item.style.width) || item.offsetWidth || 0,
        height: parseFloat(item.style.height) || item.offsetHeight || 0,
    };
}

function parseRadiusValue(value, base) {
    if (!value) return 0;
    const number = parseFloat(value);
    if (!Number.isFinite(number)) return 0;
    return value.includes('%') ? (base * number) / 100 : number;
}

function readBorderRadius(item, width, height) {
    const source = item.style.borderRadius || getComputedStyle(item).borderRadius || '';
    const parts = source.split('/')[0].trim().split(/\s+/).filter(Boolean);
    const rx = Math.max(0, Math.min(parseRadiusValue(parts[0], width), width / 2));
    const ry = Math.max(0, Math.min(parseRadiusValue(parts[1] || parts[0], height), height / 2));
    return {
        rx,
        ry,
        // border-radius: 50% (o mas) sobre una caja rectangular es una elipse.
        ellipse: rx >= width / 2 - 0.01 && ry >= height / 2 - 0.01,
    };
}

export function getShapeSnapshot(item) {
    if (!item) return null;

    const { width, height } = readItemSize(item);
    if (!(width > 0) || !(height > 0)) return null;

    const snapshot = {
        width,
        height,
        rotation: isOpening(item) ? 0 : getRotation(item),
        arms: null,
        rx: 0,
        ry: 0,
        ellipse: false,
    };

    if (isLShape(item)) {
        const metrics = getLShapeMetrics(item);
        snapshot.arms = { x: metrics.armX, y: metrics.armY };
    } else {
        Object.assign(snapshot, readBorderRadius(item, width, height));
    }

    return snapshot;
}

// Icono compacto con el contorno real del objeto para las filas de capas.
export function createLayerShapeIcon(item) {
    const snapshot = getShapeSnapshot(item);
    if (!snapshot) return null;

    const iconSize = 16;
    const padding = 1.25;
    const radians = (snapshot.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const boundsWidth = snapshot.width * cos + snapshot.height * sin;
    const boundsHeight = snapshot.width * sin + snapshot.height * cos;
    const scale = Math.min(
        (iconSize - padding * 2) / boundsWidth,
        (iconSize - padding * 2) / boundsHeight,
    );
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${iconSize} ${iconSize}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('layer-shape-icon');

    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute(
        'transform',
        `translate(${iconSize / 2} ${iconSize / 2}) rotate(${snapshot.rotation}) scale(${scale}) translate(${-snapshot.width / 2} ${-snapshot.height / 2})`,
    );
    let outline;
    if (snapshot.ellipse) {
        outline = document.createElementNS(SVG_NS, 'ellipse');
        outline.setAttribute('cx', String(snapshot.width / 2));
        outline.setAttribute('cy', String(snapshot.height / 2));
        outline.setAttribute('rx', String(snapshot.width / 2));
        outline.setAttribute('ry', String(snapshot.height / 2));
    } else if (snapshot.arms) {
        outline = document.createElementNS(SVG_NS, 'path');
        outline.setAttribute('d', lShapePath(snapshot));
    } else {
        outline = document.createElementNS(SVG_NS, 'rect');
        outline.setAttribute('width', String(snapshot.width));
        outline.setAttribute('height', String(snapshot.height));
        if (snapshot.rx > 0) outline.setAttribute('rx', String(snapshot.rx));
        if (snapshot.ry > 0) outline.setAttribute('ry', String(snapshot.ry));
    }
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', 'currentColor');
    outline.setAttribute('stroke-width', '1');
    outline.setAttribute('vector-effect', 'non-scaling-stroke');
    group.appendChild(outline);
    svg.appendChild(group);
    return svg;
}

export function syncLayerShapeIcon(item) {
    if (!item) return;
    const layer = document.querySelector(`.layer-div[data-target-id="${item.id}"]`);
    if (!layer) return;
    const current = layer.querySelector('.layer-shape-icon');
    const icon = createLayerShapeIcon(item);
    if (current && icon) current.replaceWith(icon);
    else if (icon) layer.insertBefore(icon, layer.firstChild);
    else current?.remove();
}

function lShapePath(snapshot) {
    const { width, height, arms } = snapshot;
    return `M0 0 H${arms.x} V${height - arms.y} H${width} V${height} H0 Z`;
}

function edgeSegment(snapshot, side) {
    const { width, height, arms } = snapshot;
    if (arms) {
        if (side === 'top') return [0, 0, arms.x, 0];
        if (side === 'right') return [width, height - arms.y, width, height];
        if (side === 'bottom') return [0, height, width, height];
        return [0, 0, 0, height];
    }
    if (side === 'top') return [0, 0, width, 0];
    if (side === 'right') return [width, 0, width, height];
    if (side === 'bottom') return [0, height, width, height];
    return [0, 0, 0, height];
}

// Puntos (en coordenadas locales) donde se apoyan los controles de borde y
// tolerancia. En la L se centran sobre los tramos reales de cada lado.
function getSideAnchors(snapshot) {
    const { width, height, arms } = snapshot;
    if (arms) {
        return {
            top: [arms.x / 2, 0],
            right: [width, height - arms.y / 2],
            bottom: [width / 2, height],
            left: [0, height / 2],
        };
    }
    return {
        top: [width / 2, 0],
        right: [width, height / 2],
        bottom: [width / 2, height],
        left: [0, height / 2],
    };
}

function createSvg(snapshot, activeEdges = null) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${snapshot.width} ${snapshot.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('shape-figure-svg');
    svg.setAttribute('aria-hidden', 'true');

    let outline;
    if (snapshot.ellipse) {
        outline = document.createElementNS(SVG_NS, 'ellipse');
        outline.setAttribute('cx', String(snapshot.width / 2));
        outline.setAttribute('cy', String(snapshot.height / 2));
        outline.setAttribute('rx', String(snapshot.width / 2));
        outline.setAttribute('ry', String(snapshot.height / 2));
    } else if (snapshot.arms) {
        outline = document.createElementNS(SVG_NS, 'path');
        outline.setAttribute('d', lShapePath(snapshot));
    } else {
        outline = document.createElementNS(SVG_NS, 'rect');
        outline.setAttribute('x', '0');
        outline.setAttribute('y', '0');
        outline.setAttribute('width', String(snapshot.width));
        outline.setAttribute('height', String(snapshot.height));
        if (snapshot.rx > 0) outline.setAttribute('rx', String(snapshot.rx));
        if (snapshot.ry > 0) outline.setAttribute('ry', String(snapshot.ry));
    }
    outline.classList.add('shape-outline');
    svg.appendChild(outline);

    if (activeEdges) {
        EDGE_SIDES.forEach((side) => {
            const [x1, y1, x2, y2] = edgeSegment(snapshot, side);
            const line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('x1', String(x1));
            line.setAttribute('y1', String(y1));
            line.setAttribute('x2', String(x2));
            line.setAttribute('y2', String(y2));
            line.classList.add('shape-edge', `shape-edge--${side}`);
            if (activeEdges.has(side)) line.classList.add('is-on');
            svg.appendChild(line);
        });
    }

    return svg;
}

// La escala tiene en cuenta la rotacion: el contorno rotado debe caber dentro
// del cuadrado de la previsualizacion, no solo su caja sin rotar.
function fitScale(snapshot, maxWidth, maxHeight) {
    const radians = (snapshot.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const bboxWidth = snapshot.width * cos + snapshot.height * sin;
    const bboxHeight = snapshot.width * sin + snapshot.height * cos;
    if (!(bboxWidth > 0) || !(bboxHeight > 0)) return 1;
    return Math.min(maxWidth / bboxWidth, maxHeight / bboxHeight);
}

function getPreviewScale(preview, rotor, snapshot) {
    const stage = document.getElementById('shape-dims-stage') || rotor.parentElement;
    const widthBadge = document.querySelector('#sm-ancho-field .shape-dim__badge');
    const heightBadge = document.querySelector('#sm-alto-field .shape-dim__badge');
    // El hueco coincide con la separacion de las cotas en css/sidebar.css: si
    // alli crece, aqui debe crecer igual para que el badge no se recorte.
    const gap = 20;
    // Reservamos solo el espacio que realmente necesita la etiqueta exterior;
    // el resto del stage queda disponible para ampliar la forma.
    const sideSpace = Math.max(widthBadge?.offsetWidth || 54, heightBadge?.offsetWidth || 54) + gap;
    const endSpace = Math.max(widthBadge?.offsetHeight || 22, heightBadge?.offsetHeight || 22) + gap;
    const maxWidth = Math.max(24, stage.clientWidth - sideSpace);
    const maxHeight = Math.max(24, stage.clientHeight - endSpace);
    return fitScale(snapshot, maxWidth, maxHeight);
}

function updateAnchors(rotor, snapshot, selector, attribute) {
    const anchors = getSideAnchors(snapshot);
    rotor.querySelectorAll(selector).forEach((element) => {
        const side = element.dataset[attribute];
        const [x, y] = anchors[side] || anchors.top;
        element.style.left = `${(x / snapshot.width) * 100}%`;
        element.style.top = `${(y / snapshot.height) * 100}%`;
    });
}

function updateToleranceLabels(rotor, snapshot) {
    updateAnchors(rotor, snapshot, '.tol-label', 'tolSide');
    rotor.querySelectorAll('.tol-label').forEach((label) => {
        const angle = TOLERANCE_SIDE_DEG[label.dataset.tolSide] + snapshot.rotation;
        const onBottom = Math.sin((angle * Math.PI) / 180) > 0;
        label.style.setProperty('--tol-label-rotate', `${onBottom ? -snapshot.rotation : 0}deg`);
    });
}

export function syncShapePreviews(item) {
    lastPreviewItem = item;
    observeDimensionStage();
    const snapshot = getShapeSnapshot(item);
    syncLayerShapeIcon(item);

    PREVIEWS.forEach((preview) => {
        const rotor = document.getElementById(preview.rotorId);
        const figure = document.getElementById(preview.figureId);
        if (!rotor || !figure) return;

        if (!snapshot) {
            figure.replaceChildren();
            return;
        }

        const scale = getPreviewScale(preview, rotor, snapshot);
        // Caja del rotor en pixeles enteros: con medidas fraccionarias el
        // contorno rotado cae entre dos pixeles y el trazo de 1px se reparte
        // (se ve borroso sobre todo a 90/270 grados y en rotacion libre).
        const rotorWidth = Math.max(1, Math.round(snapshot.width * scale));
        const rotorHeight = Math.max(1, Math.round(snapshot.height * scale));
        rotor.style.width = `${rotorWidth}px`;
        rotor.style.height = `${rotorHeight}px`;
        rotor.style.transform = `translate(-50%, -50%) rotate(${snapshot.rotation}deg)`;
        rotor.style.setProperty('--shape-badge-rotate', `${-snapshot.rotation}deg`);
        rotor.classList.toggle('is-l-shape', Boolean(snapshot.arms));

        if (snapshot.arms) {
            rotor.style.setProperty('--arm-x', `${(snapshot.arms.x / snapshot.width) * 100}%`);
            rotor.style.setProperty('--arm-y', `${(snapshot.arms.y / snapshot.height) * 100}%`);
        } else {
            rotor.style.removeProperty('--arm-x');
            rotor.style.removeProperty('--arm-y');
        }

        if (preview.key === 'edges') {
            const active = new Set((item.dataset.edges || '').split(' ').filter(Boolean));
            figure.replaceChildren(createSvg(snapshot, active));
            updateAnchors(rotor, snapshot, '.edge-switch', 'edge');
            return;
        }

        figure.replaceChildren(createSvg(snapshot));
        if (preview.key === 'tolerance') {
            updateToleranceLabels(rotor, snapshot);
        }
    });
}
