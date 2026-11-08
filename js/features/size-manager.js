// Panel de tamanio y rotacion
import { smAlto, smAncho, smLArmX, smLArmY, smNombre, smRadius, smRotate90, smRotation } from '../core/dom.js';
import { syncDoorPanel, syncEdgePanel, syncOpeningOverlay, syncTolerancePanel } from './door.js';
import { getLShapeMetrics, isLShape, setLShapeArm, syncLShape } from './l-shape.js';
import { syncShapePreviews } from './shape-preview.js';
import { getActiveRoom, getOpeningWallLength, getSelectedObject, isOpening, setItemName } from '../core/model.js';
import { confirmDraftDimension, confirmDraftName, draftState, getNextDraftInput, isDrafting, markDimensionEdited, markDraftNameEdited, shakeDraftInput } from './draft.js';
import { placeOpening } from './openings.js';
import { guardarCambios } from './persistence.js';
import { syncRoomSwitcher } from './rooms.js';
import { applyRotation, syncRotationHandle } from './rotation.js';
import { MARGEN_ESQUINA, OPENING_DEPTH, OPENING_MIN, viewState } from '../core/state.js';
import { getRotation, smFromPx, smToPx, snapNameRotation } from '../core/units.js';
import { applySceneScale, clampScale, updateMinScaleForRoom, updateSceneSize } from './view.js';

export let smAlMetric = 'm';

export let smAnMetric = 'm';

export let smLArmXMetric = 'm';

export let smLArmYMetric = 'm';

const smRadiusValue = document.getElementById('sm-radius-value');
const smRotationValue = document.getElementById('sm-rotation-value');
const UNIT_SYSTEM_KEY = 'mise-unit-system';
const UNIT_IDS = {
    height: ['sm-alto-m', 'sm-alto-cm', 'sm-alto-in', 'sm-alto-ft'],
    width: ['sm-ancho-m', 'sm-ancho-cm', 'sm-ancho-in', 'sm-ancho-ft'],
    lArmX: ['sm-l-arm-x-m', 'sm-l-arm-x-cm', 'sm-l-arm-x-in', 'sm-l-arm-x-ft'],
    lArmY: ['sm-l-arm-y-m', 'sm-l-arm-y-cm', 'sm-l-arm-y-in', 'sm-l-arm-y-ft'],
};

const DIMENSION_FIELDS = [
    { input: smAlto },
    { input: smAncho },
    { input: smLArmX },
    { input: smLArmY },
];

function syncRadiusControls() {
    const item = getSelectedObject();
    const editable = !!item && !isOpening(item);
    if (!editable) {
        if (smRadiusValue) smRadiusValue.textContent = '0';
        return;
    }

    const value = Number.parseFloat(smRadius.value) || 0;
    if (smRadiusValue) {
        const isRelative = (item.style.borderRadius || '').includes('%');
        smRadiusValue.textContent = value > 0 ? `${Math.round(value)}${isRelative ? '%' : 'px'}` : '0';
    }
}

function syncRotationControls() {
    const item = getSelectedObject();
    const editable = !!item && !isOpening(item);
    if (!editable) {
        if (smRotationValue) smRotationValue.textContent = '—';
        return;
    }

    const value = Number.parseFloat(smRotation.value) || 0;
    if (smRotationValue) smRotationValue.textContent = `${Math.round(value)}°`;
}

function setLengthUnit(buttonIds, input, metricState, nextUnit, unitLabelId, getPixels) {
    const item = getSelectedObject();
    const currentPixels = item ? getPixels(item) : null;

    metricState.value = nextUnit;
    const unitLabel = document.getElementById(unitLabelId);
    if (unitLabel) unitLabel.textContent = nextUnit;
    buttonIds.forEach((id) => {
        const button = document.getElementById(id);
        button?.classList.toggle('selected', button.dataset.unit === nextUnit);
    });

    if (Number.isFinite(currentPixels)) {
        input.value = smFromPx(currentPixels, nextUnit).toFixed(2);
    }
    syncDimensionDisplay(input);
}

function setDimensionUnit(buttonIds, input, metricState, nextUnit) {
    const dimension = input === smAlto ? 'height' : 'width';
    setLengthUnit(
        buttonIds,
        input,
        metricState,
        nextUnit,
        input === smAlto ? 'sm-alto-unit' : 'sm-ancho-unit',
        (item) => getDimensionPixels(item, dimension),
    );
    if (currentDimHighlight) {
        setDimensionHighlight(currentDimHighlight);
    }
}

function setLArmUnit(buttonIds, input, metricState, nextUnit, axis) {
    setLengthUnit(
        buttonIds,
        input,
        metricState,
        nextUnit,
        axis === 'armX' ? 'sm-l-arm-x-unit' : 'sm-l-arm-y-unit',
        (item) => getLShapeMetrics(item)[axis],
    );
    if (currentDimHighlight === axis) setDimensionHighlight(axis);
}

export function configureSizeUnitButtons(buttonIds, input, metricState, onChange = null) {
    buttonIds.forEach((buttonId) => {
        document.getElementById(buttonId).addEventListener('click', () => {
            const nextUnit = document.getElementById(buttonId).dataset.unit;
            if (onChange) onChange(nextUnit);
            else setDimensionUnit(buttonIds, input, metricState, nextUnit);
        });
    });
}

// Menus de unidades: se abren desde el engranaje del campo y se cierran al
// elegir una unidad, al hacer clic fuera o con Escape.
const unitMenus = [];

function setupUnitMenu(configId, menuId) {
    const config = document.getElementById(configId);
    const menu = document.getElementById(menuId);
    if (!config || !menu) return;

    const box = config.closest('.question-box');
    const setOpen = (open) => {
        menu.classList.toggle('is-open', open);
        box?.classList.toggle('is-open', open);
        config.setAttribute('aria-expanded', String(open));
    };

    unitMenus.push({ config, menu, box, setOpen });

    config.addEventListener('click', (event) => {
        event.stopPropagation();
        setOpen(!menu.classList.contains('is-open'));
    });

    menu.addEventListener('click', (event) => {
        if (event.target.closest('.sm-unit-btn')) setOpen(false);
    });

    document.addEventListener('pointerdown', (event) => {
        if (!menu.classList.contains('is-open')) return;
        if (box?.contains(event.target)) return;
        setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !menu.classList.contains('is-open')) return;
        setOpen(false);
        config.focus();
    });
}

function closeUnitMenus() {
    unitMenus.forEach(({ setOpen }) => setOpen(false));
}

setupUnitMenu('sm-alto-config', 'sm-alto-unit-menu');
setupUnitMenu('sm-ancho-config', 'sm-ancho-unit-menu');
setupUnitMenu('sm-l-arm-x-config', 'sm-l-arm-x-unit-menu');
setupUnitMenu('sm-l-arm-y-config', 'sm-l-arm-y-unit-menu');

// Reglas del valor renderizado: como maximo tres digitos enteros (999) o dos
// decimales (9.99), sin ceros finales. Si no cabe, el numero se recorta con
// ellipsis y la unidad se conserva siempre visible.
function formatDimensionDisplayValue(rawValue) {
    const value = Number.parseFloat(rawValue);
    if (!Number.isFinite(value)) return '';

    const fixed = value.toFixed(2);
    const rounded = Number(fixed);
    if (Math.abs(rounded) >= 100) return String(Math.round(rounded));
    return fixed.replace(/\.?0+$/, '') || '0';
}

function syncDimensionDisplay(input) {
    const badge = input.closest('.shape-dim__badge');
    const number = badge?.querySelector('.shape-dim__number');
    if (!badge || !number) return;

    number.textContent = formatDimensionDisplayValue(input.value);
}

function syncAllDimensionDisplays() {
    DIMENSION_FIELDS.forEach(({ input }) => syncDimensionDisplay(input));
}

function setupDimensionDisplay(input) {
    const badge = input.closest('.shape-dim__badge');
    if (!badge) return;

    input.addEventListener('focus', () => badge.classList.add('is-editing'));
    input.addEventListener('blur', () => {
        badge.classList.remove('is-editing');
        syncDimensionDisplay(input);
    });
    input.addEventListener('input', () => syncDimensionDisplay(input));
    input.addEventListener('change', () => syncDimensionDisplay(input));

    // El texto visible es solo la puerta de entrada a la edicion: al hacer
    // clic se enfoca el input real, que ya conserva toda la logica existente.
    badge.addEventListener('click', (event) => {
        if (event.target.closest('.field-config, .unit-menu')) return;
        if (badge.classList.contains('is-editing') || badge.classList.contains('is-open')) return;
        if (input.disabled) return;
        input.focus();
        input.select();
    });
}

DIMENSION_FIELDS.forEach(({ input }) => setupDimensionDisplay(input));

export function setSizeManagerDisabled(disabled, item = null) {
    document.querySelectorAll('.size-manager .panel-body input, .size-manager .panel-body button').forEach((control) => {
        control.disabled = disabled;
    });

    if (!disabled && isOpening(item)) {
        smAlto.disabled = true;
        UNIT_IDS.height.forEach((id) => {
            document.getElementById(id).disabled = true;
        });
        smRadius.disabled = true;
    }
}

export function setOpeningPanelFields(item) {
    const opening = isOpening(item);
    const lShape = !opening && isLShape(item);

    ['sm-alto-field', 'sm-rotation-field'].forEach((id) => {
        document.getElementById(id).style.display = opening ? 'none' : '';
    });
    // La L no admite radio: su contorno lo define el clip-path de los brazos.
    document.getElementById('sm-radius-field').style.display = opening || lShape ? 'none' : '';
    document.getElementById('l-shape-fields').style.display = lShape ? '' : 'none';
}

export let currentDimHighlight = null;

function dimensionInput(dimension) {
    if (dimension === 'height') return smAlto;
    if (dimension === 'width') return smAncho;
    if (dimension === 'armX') return smLArmX;
    return smLArmY;
}

// Medidas locales del objeto (las que dibuja la previsualizacion en el
// sidebar). No se intercambian al rotar: la cota sigue pegada al lado real
// de la figura, y por eso la rotacion no cambia el valor que representa.
function getDimensionPixels(item, dimension) {
    if (!item) return 0;
    if (isOpening(item)) {
        if (dimension === 'width') return getOpeningWidthPx(item);
        return OPENING_DEPTH;
    }
    if (dimension === 'height') {
        return parseFloat(item.style.height) || item.offsetHeight || 0;
    }
    return parseFloat(item.style.width) || item.offsetWidth || 0;
}

function getOpeningWidthPx(item) {
    return parseFloat(item.dataset.openingWidth) || OPENING_MIN;
}

function clearDimensionHighlightOnBlur() {
    setTimeout(() => {
        const inputs = [smAlto, smAncho, smLArmX, smLArmY];
        if (!inputs.includes(document.activeElement)) setDimensionHighlight(null);
    }, 50);
}

function isArmDimension(dimension) {
    return dimension === 'armX' || dimension === 'armY';
}

function buildDimensionHighlight(item, dimension, active) {
    const arm = isArmDimension(dimension);
    let pixels;
    let unit;
    let orientation;
    let extraClass = '';

    if (arm) {
        // Los brazos se miden en coordenadas locales de la L.
        const metrics = getLShapeMetrics(item);
        pixels = dimension === 'armX' ? metrics.armX : metrics.armY;
        unit = dimension === 'armX' ? smLArmXMetric : smLArmYMetric;
        orientation = dimension === 'armX' ? 'dim-i-highlight--h' : 'dim-i-highlight--v';
        extraClass = dimension === 'armX' ? ' dim-i-highlight--arm-x' : ' dim-i-highlight--arm-y';
        if (dimension === 'armY') extraClass += ' dim-i-highlight--l-arm-y';
    } else {
        // La cota vive en el lado local del objeto: alto a la derecha, ancho
        // abajo. Al rotar, la linea gira con la figura y sigue midiendo lo mismo.
        const isHeight = dimension === 'height';
        pixels = getDimensionPixels(item, isHeight ? 'height' : 'width');
        unit = isHeight ? smAlMetric : smAnMetric;
        orientation = isHeight ? 'dim-i-highlight--v' : 'dim-i-highlight--h';
        if (isHeight && isLShape(item)) extraClass = ' dim-i-highlight--l-height';
    }

    // Mientras se escribe, el campo del objeto es un espejo exacto del input
    // del sidebar: mismo texto crudo (sin redondear) e incluso vacio al borrar.
    const input = dimensionInput(dimension);
    const mirrorsInput = active && document.activeElement === input;
    const valueText = mirrorsInput
        ? (input.value ? `${input.value} ${unit}` : '')
        : `${smFromPx(pixels, unit).toFixed(2)} ${unit}`;

    const container = document.createElement('div');
    container.className = `dim-i-highlight ${orientation}${extraClass}`
        + (isDrafting() ? ' dim-i-highlight--draft-active' : '')
        + (active ? ' dim-i-highlight--active' : '');
    if (dimension === 'armX') container.style.width = `${pixels}px`;
    if (dimension === 'armY') container.style.height = `${pixels}px`;

    const capStart = document.createElement('div');
    capStart.className = 'dim-i-cap';

    const lineBefore = document.createElement('div');
    lineBefore.className = 'dim-i-line';

    const badge = document.createElement('div');
    badge.className = 'dim-i-badge';
    // El badge es hijo de un objeto ya rotado. Compensamos esa rotación para
    // dejar el texto legible (0/180° en pantalla), en vez de sumar otra vez
    // la orientación del objeto. También conservamos la escala inversa del UI.
    const rotation = getRotation(item);
    badge.style.transform = `rotate(${snapNameRotation(rotation) - rotation}deg) scale(var(--ui-inv-scale, 1))`;

    if (valueText) {
        const valueSpan = document.createElement('span');
        valueSpan.className = 'dim-i-value';
        valueSpan.textContent = valueText;
        badge.appendChild(valueSpan);
    } else {
        badge.style.display = 'none';
    }

    const lineAfter = document.createElement('div');
    lineAfter.className = 'dim-i-line';

    const capEnd = document.createElement('div');
    capEnd.className = 'dim-i-cap';

    container.append(capStart, lineBefore, badge, lineAfter, capEnd);
    return container;
}

function renderDimensionHighlights(dimensions, active = null) {
    document.querySelectorAll('.dim-i-highlight').forEach((el) => el.remove());

    const item = getSelectedObject();
    if (!item || isOpening(item)) return;

    dimensions
        .filter((dimension) => dimension && (!isArmDimension(dimension) || isLShape(item)))
        .forEach((dimension) => {
            item.appendChild(buildDimensionHighlight(item, dimension, dimension === active));
        });
}

export function setDimensionHighlight(dimension) {
    currentDimHighlight = dimension;

    // Solo se muestra la medida del campo que se esta editando, tambien
    // durante el borrador: nunca las dos cotas al mismo tiempo.
    renderDimensionHighlights(dimension ? [dimension] : [], dimension);
}

export function focusSizeInputForEditing() {
    smAlto.focus();
    smAlto.select();
    setDimensionHighlight('height');
}

export function syncSizeManager() {
    const item = getSelectedObject();
    document.querySelector('.size-manager').classList.toggle('empty', !item);
    setSizeManagerDisabled(!item, item);
    setOpeningPanelFields(item);
    syncDoorPanel(item);
    syncEdgePanel(item);
    syncTolerancePanel(item);
    syncSizeManagerReadout();
    syncShapePreviews(item);
    syncDraftUI();
    if (!item) {
        setDimensionHighlight(null);
    } else if (currentDimHighlight) {
        setDimensionHighlight(currentDimHighlight);
    }
}

export function syncDraftUI() {
    const drafting = isDrafting();
    document.querySelector('.size-manager')?.classList.toggle('is-draft', drafting);

    const item = getSelectedObject();
    const fields = [
        [smAlto.closest('.question-box'), 'height'],
        [smAncho.closest('.question-box'), 'width'],
    ];
    if (isLShape(item)) {
        fields.push(
            [smLArmX.closest('.question-box'), 'armX'],
            [smLArmY.closest('.question-box'), 'armY'],
        );
    }
    fields.forEach(([box, dimension]) => {
        if (!box) return;
        box.classList.toggle('dim-pending', drafting && !draftState.confirmed[dimension]);
    });

    // El nombre permanece resaltado durante todo el borrador, junto con la
    // medida pendiente, para indicar que forma parte de la configuración.
    const nameIsNext = drafting && !draftState.confirmed.name;
    const nameBox = smNombre.closest('.question-box');
    nameBox?.classList.toggle('draft-name-pending', nameIsNext);
}

export function syncSizeManagerReadout() {
    const item = getSelectedObject();
    if (!item) {
        smNombre.value = '';
        smAlto.value = '';
        smAncho.value = '';
        smLArmX.value = '';
        smLArmY.value = '';
        smRadius.value = '';
        smRotation.value = '';
        syncRadiusControls();
        syncRotationControls();
        syncAllDimensionDisplays();
        return;
    }

    const width = getDimensionPixels(item, 'width');
    const height = getDimensionPixels(item, 'height');
    const layer = document.querySelector(`.layer-div[data-target-id="${item.id}"]`);
    smNombre.value = item.dataset.name || layer?.querySelector('.layer-content')?.textContent.trim() || '';
    smAlto.value = smFromPx(height, smAlMetric).toFixed(2);
    smAncho.value = smFromPx(width, smAnMetric).toFixed(2);
    if (isLShape(item)) {
        const arms = getLShapeMetrics(item);
        smLArmX.value = smFromPx(arms.armX, smLArmXMetric).toFixed(2);
        smLArmY.value = smFromPx(arms.armY, smLArmYMetric).toFixed(2);
    } else {
        smLArmX.value = '';
        smLArmY.value = '';
    }
    smRadius.value = parseFloat(item.style.borderRadius) || 0;
    smRotation.value = isOpening(item) ? '' : Math.round(getRotation(item));
    syncRadiusControls();
    syncRotationControls();
    syncAllDimensionDisplays();
}

export function applySizeDimension(input, unit, dimension) {
    const item = getSelectedObject();
    if (!item) return false;

    const value = Number(input.value);
    const valid = Number.isFinite(value) && value > 0;

    // El borrador vuelve a quedar pendiente apenas se toca la medida, incluso
    // si el campo se vacia.
    if (isDrafting()) markDimensionEdited(dimension);

    // Aunque el valor no sea valido hay que refrescar el campo del objeto para
    // que refleje el texto crudo del input (incluido el vacio).
    setDimensionHighlight(dimension);

    if (!valid) return false;
    if (isOpening(item) && dimension !== 'width') return false;

    if (isOpening(item)) {
        const maxWidth = Math.max(OPENING_MIN, getOpeningWallLength(item) - MARGEN_ESQUINA * 2);
        item.dataset.openingWidth = String(Math.min(Math.max(OPENING_MIN, smToPx(value, unit)), maxWidth));
        placeOpening(item);
        syncOpeningOverlay(item);
        syncShapePreviews(item);
        guardarCambios(item);
        return true;
    }

    item.style[dimension] = `${smToPx(value, unit)}px`;
    if (isLShape(item)) {
        const arms = syncLShape(item);
        smLArmX.value = smFromPx(arms.armX, smLArmXMetric).toFixed(2);
        smLArmY.value = smFromPx(arms.armY, smLArmYMetric).toFixed(2);
    }
    updateSceneSize(item);
    if (item === getActiveRoom()) {
        updateMinScaleForRoom(item);
        viewState.scale = clampScale(viewState.scale);
        applySceneScale();
    }
    // En un borrador el tamano se aplica en vivo pero no se guarda: la medida
    // vuelve a quedar pendiente hasta que se confirme con Enter o Tab.
    // El campo de medida del objeto se actualiza al mismo tiempo que el input
    // del sidebar, como si se escribiera sobre el objeto.
    setDimensionHighlight(dimension);
    syncShapePreviews(item);
    if (!isDrafting()) guardarCambios(item);
    return true;
}

function applySizeName() {
    const item = getSelectedObject();
    if (!item) return;

    const value = smNombre.value.trim();
    setItemName(item, value);

    const layerContent = document.querySelector(`.layer-div[data-target-id="${item.id}"] .layer-content`);
    if (layerContent) layerContent.textContent = value;

    // Durante el borrador el nombre se ve en vivo pero no se guarda todavia.
    if (isDrafting()) {
        markDraftNameEdited();
        return;
    }
    guardarCambios(item);
    syncRoomSwitcher();
}

smNombre.addEventListener('input', () => applySizeName());

smNombre.addEventListener('change', () => applySizeName());

// El nombre no es una medida: al enfocarlo se apaga cualquier cota visible sin
// esperar al blur del campo anterior.
smNombre.addEventListener('focus', () => setDimensionHighlight(null));

smNombre.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && event.shiftKey) {
        event.preventDefault();
        const target = isDrafting() && isLShape(getSelectedObject()) ? smLArmY : smAncho;
        target.focus();
        target.select();
        return;
    }

    if (event.key !== 'Enter') return;
    event.preventDefault();

    if (isDrafting()) {
        const result = confirmDraftName();
        if (result === 'invalid') {
            if (document.activeElement === smNombre) shakeDraftInput(smNombre);
            return;
        }
        // Al fijar el borrador con Enter el foco no debe quedarse en el campo
        // del nombre que ya no tiene nada que editar.
        smNombre.blur();
        return;
    }
    smNombre.blur();
});

smAlto.addEventListener('input', () => applySizeDimension(smAlto, smAlMetric, 'height'));

smAlto.addEventListener('change', () => {
    const item = getSelectedObject();
    if (!item) return;
    smAlto.value = smFromPx(getDimensionPixels(item, 'height'), smAlMetric).toFixed(2);
});

smAlto.addEventListener('focus', () => {
    setDimensionHighlight('height');
});

smAlto.addEventListener('blur', clearDimensionHighlightOnBlur);

smAlto.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
        if (event.shiftKey) return;
        event.preventDefault();

        // Tab confirma la medida y avanza al siguiente campo.
        if (isDrafting()) {
            if (!applySizeDimension(smAlto, smAlMetric, 'height')) {
                shakeDraftInput(smAlto);
                return;
            }
            if (confirmDraftDimension('height') === 'invalid') {
                shakeDraftInput(smAlto);
                return;
            }
        }

        smAncho.focus();
        smAncho.select();
        return;
    }

    if (event.key !== 'Enter') return;
    event.preventDefault();

    if (isDrafting()) {
        if (!applySizeDimension(smAlto, smAlMetric, 'height')) {
            shakeDraftInput(smAlto);
            return;
        }
        const result = confirmDraftDimension('height');
        if (result === 'invalid') {
            shakeDraftInput(smAlto);
            return;
        }
        // Enter fija la medida y pasa a Ancho, tanto al crear como al editar.
        smAncho.focus();
        smAncho.select();
        return;
    }

    applySizeDimension(smAlto, smAlMetric, 'height');
    const item = getSelectedObject();
    if (item) {
        smAlto.value = smFromPx(getDimensionPixels(item, 'height'), smAlMetric).toFixed(2);
    }
    // Al editar un objeto ya creado, Enter solo fija la altura: no salta a Ancho.
    smAlto.blur();
});

smAncho.addEventListener('input', () => applySizeDimension(smAncho, smAnMetric, 'width'));

smAncho.addEventListener('change', () => {
    const item = getSelectedObject();
    if (!item) return;
    smAncho.value = smFromPx(getDimensionPixels(item, 'width'), smAnMetric).toFixed(2);
});

smAncho.addEventListener('focus', () => {
    setDimensionHighlight('width');
});

smAncho.addEventListener('blur', clearDimensionHighlightOnBlur);

smAncho.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
        event.preventDefault();

        // Tab confirma la medida y avanza al siguiente campo.
        if (!event.shiftKey && isDrafting()) {
            if (!applySizeDimension(smAncho, smAnMetric, 'width')) {
                shakeDraftInput(smAncho);
                return;
            }
            if (confirmDraftDimension('width') === 'invalid') {
                shakeDraftInput(smAncho);
                return;
            }
        }

        const target = event.shiftKey
            ? smAlto
            : (isDrafting() ? (getNextDraftInput() || smNombre) : smNombre);
        target.focus();
        target.select();
        return;
    }

    if (event.key !== 'Enter') return;
    event.preventDefault();

    if (isDrafting()) {
        if (!applySizeDimension(smAncho, smAnMetric, 'width')) {
            shakeDraftInput(smAncho);
            return;
        }
        const result = confirmDraftDimension('width');
        if (result === 'invalid') {
            shakeDraftInput(smAncho);
            return;
        }
        if (result === 'pending') {
            const next = getNextDraftInput();
            if (next && next !== smAncho) {
                next.focus();
                next.select();
            }
        } else {
            smAncho.blur();
        }
        return;
    }

    applySizeDimension(smAncho, smAnMetric, 'width');
    const item = getSelectedObject();
    if (item) {
        smAncho.value = smFromPx(getDimensionPixels(item, 'width'), smAnMetric).toFixed(2);
    }
    smAncho.blur();
});

function applyLArmDimension(input, unit, axis) {
    const item = getSelectedObject();
    if (!item || !isLShape(item)) return false;

    // Igual que Alto/Ancho: el borrador vuelve a quedar pendiente al tocar el
    // valor y la cota visible es siempre la del campo que se esta editando.
    if (isDrafting()) markDimensionEdited(axis);
    setDimensionHighlight(axis);

    const value = Number(input.value);
    if (!Number.isFinite(value) || value <= 0) return false;

    setLShapeArm(item, axis, smToPx(value, unit));
    syncShapePreviews(item);
    if (!isDrafting()) guardarCambios(item);
    return true;
}

function refreshLArmField(input, unit, axis) {
    const item = getSelectedObject();
    if (!item || !isLShape(item)) return;
    input.value = smFromPx(getLShapeMetrics(item)[axis], unit).toFixed(2);
    syncDimensionDisplay(input);
}

function commitLArmField(input, unit, axis) {
    if (!applyLArmDimension(input, unit, axis)) {
        if (isDrafting()) shakeDraftInput(input);
        return false;
    }
    refreshLArmField(input, unit, axis);

    if (isDrafting() && confirmDraftDimension(axis) === 'invalid') {
        shakeDraftInput(input);
        return false;
    }
    return true;
}

function focusNextFromArm(current) {
    const next = getNextDraftInput();
    if (next && next !== current) {
        next.focus();
        next.select();
        return;
    }
    current.blur();
}

smLArmX.addEventListener('input', () => applyLArmDimension(smLArmX, smLArmXMetric, 'armX'));

smLArmX.addEventListener('change', () => refreshLArmField(smLArmX, smLArmXMetric, 'armX'));

smLArmX.addEventListener('focus', () => setDimensionHighlight('armX'));

smLArmX.addEventListener('blur', clearDimensionHighlightOnBlur);

smLArmX.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        if (!commitLArmField(smLArmX, smLArmXMetric, 'armX')) return;
        if (isDrafting()) focusNextFromArm(smLArmX);
        else smLArmX.blur();
        return;
    }
    if (event.key === 'Tab' && !event.shiftKey) {
        event.preventDefault();
        if (!commitLArmField(smLArmX, smLArmXMetric, 'armX')) return;
        if (isDrafting()) {
            focusNextFromArm(smLArmX);
        } else {
            smLArmY.focus();
            smLArmY.select();
        }
        return;
    }
    if (event.key === 'Tab' && event.shiftKey) {
        event.preventDefault();
        smAncho.focus();
        smAncho.select();
    }
});

smLArmY.addEventListener('input', () => applyLArmDimension(smLArmY, smLArmYMetric, 'armY'));

smLArmY.addEventListener('change', () => refreshLArmField(smLArmY, smLArmYMetric, 'armY'));

smLArmY.addEventListener('focus', () => setDimensionHighlight('armY'));

smLArmY.addEventListener('blur', clearDimensionHighlightOnBlur);

smLArmY.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        if (!commitLArmField(smLArmY, smLArmYMetric, 'armY')) return;
        if (isDrafting()) focusNextFromArm(smLArmY);
        else smLArmY.blur();
        return;
    }
    if (event.key === 'Tab') {
        event.preventDefault();
        if (!event.shiftKey) {
            if (!commitLArmField(smLArmY, smLArmYMetric, 'armY')) return;
            if (isDrafting()) {
                focusNextFromArm(smLArmY);
            } else {
                smRotation.focus();
                smRotation.select();
            }
        } else {
            smLArmX.focus();
            smLArmX.select();
        }
    }
});

smRadius.addEventListener('input', () => {
    const item = getSelectedObject();
    const value = Number(smRadius.value);
    if (!item || isOpening(item) || !Number.isFinite(value) || value < 0) return;

    // Un radio relativo (por ejemplo el 100% del circulo) debe seguir siendo
    // relativo al redimensionar el objeto.
    const isRelative = (item.style.borderRadius || '').includes('%');
    item.style.borderRadius = value > 0 ? `${value}${isRelative ? '%' : 'px'}` : '';
    syncShapePreviews(item);
    guardarCambios(item);
});

smRotation.addEventListener('input', () => {
    const item = getSelectedObject();
    const value = Number(smRotation.value);
    if (!item || isOpening(item) || !Number.isFinite(value)) return;

    applyRotation(item, value);
});

smRotation.addEventListener('change', () => {
    const item = getSelectedObject();
    if (!item || isOpening(item)) return;

    applyRotation(item, Number(smRotation.value));
    smRotation.value = Math.round(getRotation(item));
    guardarCambios(item);
});

smRotate90.addEventListener('click', () => {
    const item = getSelectedObject();
    if (!item || isOpening(item)) return;

    applyRotation(item, getRotation(item) + 90);
    smRotation.value = Math.round(getRotation(item));
    syncRotationControls();
    guardarCambios(item);
});

document.getElementById('sm-rotate--90').addEventListener('click', () => {
    const item = getSelectedObject();
    if (!item || isOpening(item)) return;

    applyRotation(item, getRotation(item) - 90);
    smRotation.value = Math.round(getRotation(item));
    syncRotationControls();
    guardarCambios(item);
});

export const smAlMetricState = { get value() { return smAlMetric; }, set value(value) { smAlMetric = value; } };

export const smAnMetricState = { get value() { return smAnMetric; }, set value(value) { smAnMetric = value; } };

export const smLArmXMetricState = { get value() { return smLArmXMetric; }, set value(value) { smLArmXMetric = value; } };

export const smLArmYMetricState = { get value() { return smLArmYMetric; }, set value(value) { smLArmYMetric = value; } };

configureSizeUnitButtons(UNIT_IDS.height, smAlto, smAlMetricState);

configureSizeUnitButtons(UNIT_IDS.width, smAncho, smAnMetricState);

configureSizeUnitButtons(
    UNIT_IDS.lArmX,
    smLArmX,
    smLArmXMetricState,
    (unit) => setLArmUnit(UNIT_IDS.lArmX, smLArmX, smLArmXMetricState, unit, 'armX'),
);

configureSizeUnitButtons(
    UNIT_IDS.lArmY,
    smLArmY,
    smLArmYMetricState,
    (unit) => setLArmUnit(UNIT_IDS.lArmY, smLArmY, smLArmYMetricState, unit, 'armY'),
);

const unitSystemButtons = [...document.querySelectorAll('.unit-system .segmented-btn')];

function markUnitSystem(system) {
    unitSystemButtons.forEach((button) => {
        button.classList.toggle('selected', button.dataset.system === system);
    });
}

function setUnitSystem(system) {
    const nextSystem = system === 'imperial' ? 'imperial' : 'metric';
    const unit = nextSystem === 'imperial' ? 'ft' : 'm';
    setDimensionUnit(UNIT_IDS.height, smAlto, smAlMetricState, unit);
    setDimensionUnit(UNIT_IDS.width, smAncho, smAnMetricState, unit);
    setLArmUnit(UNIT_IDS.lArmX, smLArmX, smLArmXMetricState, unit, 'armX');
    setLArmUnit(UNIT_IDS.lArmY, smLArmY, smLArmYMetricState, unit, 'armY');
    markUnitSystem(nextSystem);
    localStorage.setItem(UNIT_SYSTEM_KEY, nextSystem);
}

unitSystemButtons.forEach((button) => {
    button.addEventListener('click', () => setUnitSystem(button.dataset.system));
});

const savedUnitSystem = localStorage.getItem(UNIT_SYSTEM_KEY);
if (savedUnitSystem === 'imperial') {
    setUnitSystem('imperial');
} else {
    markUnitSystem('metric');
}

document.querySelectorAll('.size-manager input, #popupGetSize input').forEach((input) => {
    let selectNextMouseUp = false;
    input.addEventListener('focus', () => {
        selectNextMouseUp = true;
        input.select();
    });
    input.addEventListener('mouseup', (event) => {
        if (selectNextMouseUp) {
            selectNextMouseUp = false;
            event.preventDefault();
        }
    });
});

// Tocar cualquier cosa fuera del panel termina la edicion de la medida: el
// campo pierde el foco y la medida resaltada en el objeto se apaga, aunque
// despues se seleccione otro elemento.
document.addEventListener('pointerdown', (event) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    if (!active.closest('.size-manager')) return;
    if (event.target instanceof Element && event.target.closest('.size-manager')) return;

    active.blur();
    setDimensionHighlight(null);
}, true);

document.addEventListener('draft:change', (event) => {
    // En cada tecla solo se refresca el estado de los campos: no hay que
    // reescribir el valor que el usuario esta escribiendo.
    if (event.detail?.phase === 'edit') {
        syncDraftUI();
        return;
    }

    if (!isDrafting()) setDimensionHighlight(null);
    syncRotationHandle(getSelectedObject());
    syncSizeManager();
});
