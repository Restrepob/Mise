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
// Distancia del centro de la linea de cota al borde de la caja y largo de los
// remates. Son enteros para que el trazo de 2px caiga en pixeles completos en
// las rotaciones rectas (0/90/180/270) y no se reparta entre dos columnas.
// 26px reproduce la separacion que tenia la tira de cotas en CSS (20px + 13/2).
const MEASURE_OFFSET = 26;
const MEASURE_CAP = 10;

const PREVIEWS = [
    { key: 'dimensions', rotorId: 'shape-dims-rotor', figureId: 'shape-dims-figure' },
    { key: 'edges', rotorId: 'edge-rotor', figureId: 'edge-figure', maxSize: 66 },
    { key: 'tolerance', rotorId: 'tolerance-rotor', figureId: 'tolerance-figure', maxSize: 66 },
];
let lastPreviewItem = null;
let lastDimsSnapshot = null;
let lastToleranceSnapshot = null;
let stageObserver = null;
let controlObserver = null;

function getVisualRotation(item) {
    let rotation = 0;
    let current = item;
    while (current && current.classList?.contains('object')) {
        rotation += getRotation(current);
        current = current.parentElement;
    }
    return rotation;
}

function observeDimensionStage() {
    const stage = document.getElementById('shape-dims-stage');
    if (!stage || stageObserver || typeof ResizeObserver === 'undefined') return;
    stageObserver = new ResizeObserver(() => {
        if (lastPreviewItem) syncShapePreviews(lastPreviewItem);
    });
    stageObserver.observe(stage);
}

// El texto del badge cambia de ancho al editar o al cargar la tipografia. Si
// solo se centrara al sincronizar, quedaria corrido respecto de la cota; este
// observador lo vuelve a centrar cuando cambia su tamano.
function observeControlSizes() {
    if (controlObserver || typeof ResizeObserver === 'undefined') return;
    controlObserver = new ResizeObserver(() => {
        const dimsRotor = document.getElementById('shape-dims-rotor');
        if (dimsRotor && lastDimsSnapshot) {
            positionDimensionFields(dimsRotor, lastDimsSnapshot);
        }
        const toleranceRotor = document.getElementById('tolerance-rotor');
        if (toleranceRotor && lastToleranceSnapshot) {
            updateToleranceLabels(toleranceRotor, lastToleranceSnapshot);
        }
    });
    document.querySelectorAll('.shape-dim__badge, .tol-label').forEach((element) => {
        controlObserver.observe(element);
    });
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
        rotation: getVisualRotation(item),
        arms: null,
        semicircle: item.dataset.shape === 'semicircle',
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
    if (snapshot.semicircle) {
        outline = document.createElementNS(SVG_NS, 'path');
        outline.setAttribute('d', semicirclePath(snapshot));
    } else if (snapshot.ellipse) {
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

function semicirclePath(snapshot) {
    return `M0 ${snapshot.height} A${snapshot.width / 2} ${snapshot.height} 0 0 1 ${snapshot.width} ${snapshot.height} Z`;
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

function dimensionSegments(snapshot) {
    const { width, height, arms } = snapshot;
    const segments = [];
    // En la L la altura se acota por la izquierda para no chocar con el brazo.
    const heightX = arms ? -MEASURE_OFFSET : width + MEASURE_OFFSET;
    segments.push({ key: 'height', vertical: true, x1: heightX, y1: 0, x2: heightX, y2: height });
    segments.push({ key: 'width', vertical: false, x1: 0, y1: height + MEASURE_OFFSET, x2: width, y2: height + MEASURE_OFFSET });
    if (arms) {
        segments.push({ key: 'arm-x', vertical: false, x1: 0, y1: -MEASURE_OFFSET, x2: arms.x, y2: -MEASURE_OFFSET });
        segments.push({ key: 'arm-y', vertical: true, x1: width + MEASURE_OFFSET, y1: height - arms.y, x2: width + MEASURE_OFFSET, y2: height });
    }
    return segments;
}

function appendDimensionLines(group, snapshot) {
    dimensionSegments(snapshot).forEach((segment) => {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(segment.x1));
        line.setAttribute('y1', String(segment.y1));
        line.setAttribute('x2', String(segment.x2));
        line.setAttribute('y2', String(segment.y2));
        line.classList.add('shape-measure', `shape-measure--${segment.key}`);
        group.appendChild(line);

        // Remates perpendiculares en los dos extremos de la cota.
        [[segment.x1, segment.y1], [segment.x2, segment.y2]].forEach(([x, y]) => {
            const cap = document.createElementNS(SVG_NS, 'line');
            if (segment.vertical) {
                cap.setAttribute('x1', String(x - MEASURE_CAP / 2));
                cap.setAttribute('y1', String(y));
                cap.setAttribute('x2', String(x + MEASURE_CAP / 2));
                cap.setAttribute('y2', String(y));
            } else {
                cap.setAttribute('x1', String(x));
                cap.setAttribute('y1', String(y - MEASURE_CAP / 2));
                cap.setAttribute('x2', String(x));
                cap.setAttribute('y2', String(y + MEASURE_CAP / 2));
            }
            cap.classList.add('shape-measure-cap', `shape-measure-cap--${segment.key}`);
            group.appendChild(cap);
        });
    });
}

function createSvg(snapshot, activeEdges = null, showDimensions = false) {
    // El SVG tiene el tamano justo de la caja del rotor y se centra en el stage
    // con margenes negativos (sin transform CSS sobre el SVG). La rotacion se
    // aplica como transform del grupo interno: Firefox 152-158 rasteriza mal
    // los SVG que reciben una rotacion por CSS y los deja duros o borrosos.
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${snapshot.width} ${snapshot.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('shape-figure-svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.width = `${snapshot.width}px`;
    svg.style.height = `${snapshot.height}px`;
    svg.style.marginLeft = `${-snapshot.width / 2}px`;
    svg.style.marginTop = `${-snapshot.height / 2}px`;

    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('transform', `rotate(${snapshot.rotation} ${snapshot.width / 2} ${snapshot.height / 2})`);

    let outline;
    if (snapshot.semicircle) {
        outline = document.createElementNS(SVG_NS, 'path');
        outline.setAttribute('d', semicirclePath(snapshot));
    } else if (snapshot.ellipse) {
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
    group.appendChild(outline);

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
            group.appendChild(line);
        });
    }

    if (showDimensions) appendDimensionLines(group, snapshot);

    svg.appendChild(group);
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
    // Reservamos el ancho del badge mas un margen extra a cada lado: el badge
    // de alto se centra a MEASURE_OFFSET del contorno y no debe recortarse.
    const gap = 20;
    // Reservamos solo el espacio que realmente necesita la etiqueta exterior;
    // el resto del stage queda disponible para ampliar la forma.
    const sideSpace = Math.max(widthBadge?.offsetWidth || 54, heightBadge?.offsetWidth || 54) + gap;
    const endSpace = Math.max(widthBadge?.offsetHeight || 22, heightBadge?.offsetHeight || 22) + gap;
    const maxWidth = Math.max(24, stage.clientWidth - sideSpace);
    const maxHeight = Math.max(24, stage.clientHeight - endSpace);
    return fitScale(snapshot, maxWidth, maxHeight);
}

// Rotor y figura comparten caja y origen entero dentro del stage. Asi el SVG y
// los controles quedan centrados en el mismo punto y ninguno necesita un
// transform CSS para centrarse.
function placePreviewBox(rotor, figure, width, height) {
    const stage = rotor.parentElement;
    if (!stage) return;
    const left = Math.round((stage.clientWidth - width) / 2);
    const top = Math.round((stage.clientHeight - height) / 2);
    [rotor, figure].forEach((element) => {
        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
        element.style.width = `${width}px`;
        element.style.height = `${height}px`;
    });
}

function rotatePoint(x, y, width, height, rotation) {
    const radians = (rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const dx = x - width / 2;
    const dy = y - height / 2;
    return {
        x: width / 2 + dx * cos - dy * sin,
        y: height / 2 + dx * sin + dy * cos,
    };
}

// El rotor ya no rota ni se traslada por CSS: cada control se coloca en la
// posicion rotada y queda recto en pantalla, de modo que el texto no pasa por
// una capa transformada.
function centerBadge(field) {
    const badge = field?.querySelector('.shape-dim__badge');
    if (!badge) return;
    // Desplazamiento entero: un medio pixel hace que Firefox rasterice el texto
    // en una capa desplazada y los numeros se vean borrosos.
    badge.style.left = `${-Math.round(badge.offsetWidth / 2)}px`;
    badge.style.top = `${-Math.round(badge.offsetHeight / 2)}px`;
}

function placeField(field, x, y, snapshot) {
    if (!field) return;
    const point = rotatePoint(x, y, snapshot.width, snapshot.height, snapshot.rotation);
    field.style.left = `${point.x}px`;
    field.style.top = `${point.y}px`;
    centerBadge(field);
}

function positionDimensionFields(rotor, snapshot) {
    const { width, height, arms } = snapshot;
    const heightX = arms ? -MEASURE_OFFSET : width + MEASURE_OFFSET;
    placeField(rotor.querySelector('#sm-alto-field'), heightX, height / 2, snapshot);
    placeField(rotor.querySelector('#sm-ancho-field'), width / 2, height + MEASURE_OFFSET, snapshot);
    if (arms) {
        placeField(rotor.querySelector('#sm-l-arm-x-field'), arms.x / 2, -MEASURE_OFFSET, snapshot);
        placeField(rotor.querySelector('#sm-l-arm-y-field'), width + MEASURE_OFFSET, height - arms.y / 2, snapshot);
    }
}

function updateAnchors(rotor, snapshot, selector, attribute, rotateElement = false) {
    const anchors = getSideAnchors(snapshot);
    rotor.querySelectorAll(selector).forEach((element) => {
        const side = element.dataset[attribute];
        const [x, y] = anchors[side] || anchors.top;
        const point = rotatePoint(x, y, snapshot.width, snapshot.height, snapshot.rotation);
        element.style.left = `${(point.x / snapshot.width) * 100}%`;
        element.style.top = `${(point.y / snapshot.height) * 100}%`;
        if (rotateElement) {
            element.style.transform = `translate(-50%, -50%) rotate(${snapshot.rotation}deg)`;
        }
    });
}

function updateToleranceLabels(rotor, snapshot) {
    const anchors = getSideAnchors(snapshot);
    const rotorWidth = parseFloat(rotor.style.width) || rotor.clientWidth || 1;
    const rotorHeight = parseFloat(rotor.style.height) || rotor.clientHeight || 1;
    rotor.querySelectorAll('.tol-label').forEach((label) => {
        const [x, y] = anchors[label.dataset.tolSide] || anchors.top;
        const point = rotatePoint(x, y, snapshot.width, snapshot.height, snapshot.rotation);
        const left = (point.x / snapshot.width) * rotorWidth;
        const top = (point.y / snapshot.height) * rotorHeight;
        // Centrado por medida y redondeado, sin transform: mismo motivo que en
        // los badges (evitar capas con desplazamientos fraccionarios).
        label.style.left = `${Math.round(left - label.offsetWidth / 2)}px`;
        label.style.top = `${Math.round(top - label.offsetHeight / 2)}px`;
    });
}

export function syncShapePreviews(item) {
    lastPreviewItem = item;
    observeDimensionStage();
    observeControlSizes();
    const snapshot = getShapeSnapshot(item);
    syncLayerShapeIcon(item);
    if (!snapshot) {
        lastDimsSnapshot = null;
        lastToleranceSnapshot = null;
    }

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
        // contorno rotado cae entre dos pixeles y el trazo de 1.5px se reparte
        // (se ve borroso sobre todo a 90/270 grados y en rotacion libre).
        const rotorWidth = Math.max(1, Math.round(snapshot.width * scale));
        const rotorHeight = Math.max(1, Math.round(snapshot.height * scale));
        placePreviewBox(rotor, figure, rotorWidth, rotorHeight);

        // La figura se dibuja con las medidas ya escaladas a la caja del rotor,
        // en un SVG del mismo tamano. Asi la rotacion puede vivir dentro del
        // SVG y no en un transform CSS del contenedor.
        const scaleX = rotorWidth / (snapshot.width || 1);
        const scaleY = rotorHeight / (snapshot.height || 1);
        const figureSnapshot = {
            ...snapshot,
            width: rotorWidth,
            height: rotorHeight,
            rx: snapshot.rx * scaleX,
            ry: snapshot.ry * scaleY,
            arms: snapshot.arms
                ? { x: snapshot.arms.x * scaleX, y: snapshot.arms.y * scaleY }
                : null,
        };

        if (preview.key === 'edges') {
            const active = new Set((item.dataset.edges || '').split(' ').filter(Boolean));
            figure.replaceChildren(createSvg(figureSnapshot, active));
            updateAnchors(rotor, snapshot, '.edge-switch', 'edge', true);
            return;
        }

        if (preview.key === 'dimensions') {
            figure.replaceChildren(createSvg(figureSnapshot, null, true));
            lastDimsSnapshot = figureSnapshot;
            positionDimensionFields(rotor, figureSnapshot);
            return;
        }

        figure.replaceChildren(createSvg(figureSnapshot));
        if (preview.key === 'tolerance') {
            lastToleranceSnapshot = snapshot;
            updateToleranceLabels(rotor, snapshot);
        }
    });
}
