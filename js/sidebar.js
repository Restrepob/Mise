
const main = document.querySelector('.main');
const objectLayers = document.getElementById('object-layer-box');
const roomLayers = document.getElementById('room-layer-box');

const metro=150;
const SCENE_PADDING = 1000;
const GRID_STEP = metro / 10;
const SNAP_SENS = 8;
const AUTO_SCROLL_EDGE = 48;
const AUTO_SCROLL_SPEED = 12;
const OPENING_DEPTH = 10;
const OPENING_MIN = metro / 10;
const MARGEN_ESQUINA = metro / 10;
const OPENING_DEFAULT = {
    window: 0.96 * metro,
    door: 0.76 * metro,
};
const EDGE_SIDES = ['top', 'right', 'bottom', 'left'];
const TOLERANCE_SIDES = ['top', 'right', 'bottom', 'left'];
const TOLERANCE_MAX_M = 5;
const popup =document.getElementById('popupGetSize');
const canvas = document.getElementById('canvas');
const scene=document.getElementById('scene');
const guidesLayer = document.getElementById('snap-guides');
const openingLayer = document.getElementById('opening-measure');

const nombre = document.getElementById('nombre');
const alto = document.getElementById('altura');
const ancho = document.getElementById('ancho');
const smNombre = document.getElementById('sm-nombre');
const smAlto = document.getElementById('sm-alto');
const smAncho = document.getElementById('sm-ancho');
const smRadius = document.getElementById('sm-radius');
const smRotation = document.getElementById('sm-rotation');
const smRotate90 = document.getElementById('sm-rotate-90');

let btnAlMetric = 'm';
let btnAnMetric = 'm';
let smAlMetric = 'm';
let smAnMetric = 'm';
let objectName='';
let currentBtnId='';
let roomSelected='';


let Fcounter =0;
let openingCounter = 0;
let roomSeq = 0;
let activeRoomId = '';
const roomViews = {};
let selectedLayerId = null;
let autoscrollRaf = null;
const toolState = {
    active: 'select',
    pan: null,
    dragObject: null,
    rotateDrag: null,
};

const viewState = {
    scale: 1,
    minScale: 0.5,
    baseMinScale: 0.5,
    maxScale: 2.5,
    activePointers: new Map(),
    pinchDistance: null,
};

const colorPalette = [
    '#FF3939', 
    '#FF7C39', 
    '#00FF66', 
    '#62DBFF', 
    '#FFA834', 
    '#E54C96', 

    //'#FFF000', 
    '#00FFD1', 
    '#C7B2FF'  
];

let colorIndex = 0;

function getNextColor() {
    const color = colorPalette[colorIndex % colorPalette.length];
    colorIndex += 1;
    return color;
}

const objectMenuOptions=[
    {label:'Renombrar', action:'rename'},
    {label:'Ocultar', action:'hide'},
    {label:'Eliminar', action:'delete'}
];

const roomMenuOptions=[
    ...objectMenuOptions,
    {label:'Añadir ventana', action:'add-window'},
    {label:'Añadir puerta', action:'add-door'},
];




const alBotones = document.querySelectorAll('.al-popup-btn');
const anBotones=document.querySelectorAll('.an-popup-btn');



alBotones.forEach((boton) => {
    boton.addEventListener('click', () => {
        alBotones.forEach((boton) => {
            boton.classList.remove('selected');
        });

        boton.classList.add('selected');
        alto.focus();

        if (boton.classList.contains('selected')) {
        btnAlMetric = boton.dataset.unit;
    }
    });
});


anBotones.forEach((boton) => {
    boton.addEventListener('click', () => {
        anBotones.forEach((boton) => {
            boton.classList.remove('selected');
        });

        boton.classList.add('selected');
        ancho.focus();

        if(boton.classList.contains('selected')) {
        btnAnMetric =boton.dataset.unit;
        
    }
    });
});

function configureSizeUnitButtons(buttonIds, input, metricState) {
    buttonIds.forEach((buttonId) => {
        document.getElementById(buttonId).addEventListener('click', () => {
            const item = getSelectedObject();
            const currentPixels = item
                ? getItemLayout(item)[input === smAlto ? 'height' : 'width']
                : null;
            const nextUnit = document.getElementById(buttonId).dataset.unit;

            metricState.value = nextUnit;
            buttonIds.forEach((id) => {
                document.getElementById(id).classList.toggle(
                    'selected',
                    document.getElementById(id).dataset.unit === nextUnit,
                );
            });

            if (Number.isFinite(currentPixels)) {
                input.value = smFromPx(currentPixels, nextUnit).toFixed(2);
            }
        });
    });
}

function smToPx(value, unit) {
    return value * (unit === 'cm' ? metro / 100 : metro);
}

function smFromPx(px, unit) {
    return px / (unit === 'cm' ? metro / 100 : metro);
}

function getSelectedObject() {
    return selectedLayerId ? document.getElementById(selectedLayerId) : null;
}

function setItemName(item, value) {
    if (!item) return;
    item.dataset.name = value;
    if (isOpening(item)) return;

    let nameEl = item.querySelector(':scope > .balance-name');
    if (!nameEl) {
        nameEl = document.createElement('div');
        nameEl.className = 'balance-name';
        [...item.childNodes].forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) node.remove();
        });
        item.appendChild(nameEl);
        nameEl.style.transform = `rotate(${snapNameRotation(getRotation(item))}deg)`;
    }
    let textEl = nameEl.querySelector('.balance-text');
    if (!textEl) {
        textEl = document.createElement('span');
        textEl.className = 'balance-text';
        nameEl.replaceChildren(textEl);
    }
    textEl.textContent = value;
}

function getRooms() {
    return [...scene.children].filter((el) => el.classList.contains('room'));
}

function getActiveRoom() {
    return activeRoomId ? document.getElementById(activeRoomId) : null;
}

function flushActiveView() {
    const room = getActiveRoom();
    if (!room) return;
    roomViews[room.id] = {
        scale: viewState.scale,
        scrollX: canvas.scrollLeft,
        scrollY: canvas.scrollTop,
    };
    guardarCambios(room);
}

function syncRoomLayerActive() {
    document.querySelectorAll('#room-layer-box .layer-div').forEach((row) => {
        const isActive = row.dataset.targetId === activeRoomId;
        row.classList.toggle('active-room', isActive);
        if (row.dataset.type === 'room') {
            const eye = row.querySelector('.eye-div');
            if (eye) {
                eye.innerHTML = isActive ? row.dataset.eyeVisibleSvg : row.dataset.eyeHiddenSvg;
            }
        }
    });
}

function syncRoomSwitcher() {
    const nameEl = document.getElementById('room-switcher-name');
    const prev = document.getElementById('room-prev');
    const next = document.getElementById('room-next');
    if (!nameEl || !prev || !next) return;

    const rooms = getRooms();
    const active = getActiveRoom();
    prev.disabled = next.disabled = rooms.length === 0;
    nameEl.textContent = active?.dataset.name || active?.textContent.trim() || '—';
}

function setActiveRoom(room, options = {}) {
    clearOpeningOverlay();
    clearSnapGuides();
    selectedLayerId = null;
    syncRotationHandle(null);

    const prev = getActiveRoom();
    if (prev) flushActiveView();

    if (!room) {
        activeRoomId = '';
        getRooms().forEach((r) => { r.style.display = 'none'; });
        localStorage.removeItem('mise-active');
        syncRoomLayerActive();
        syncRoomSwitcher();
        syncSizeManager();
        return;
    }

    activeRoomId = room.id;
    localStorage.setItem('mise-active', room.id);
    getRooms().forEach((r) => {
        r.style.display = r === room ? '' : 'none';
    });

    updateSceneSize(room);
    updateMinScaleForRoom(room);

    const view = roomViews[room.id] || {
        scale: 1,
        scrollX: Math.max(0, (scene.scrollWidth - canvas.clientWidth) / 2),
        scrollY: Math.max(0, (scene.scrollHeight - canvas.clientHeight) / 2),
    };
    viewState.scale = clampScale(view.scale || 1);
    applySceneScale();

    requestAnimationFrame(() => {
        canvas.scrollLeft = view.scrollX || 0;
        canvas.scrollTop = view.scrollY || 0;
        roomViews[room.id] = {
            scale: viewState.scale,
            scrollX: canvas.scrollLeft,
            scrollY: canvas.scrollTop,
        };
        guardarCambios(room);
    });

    syncRoomLayerActive();
    syncRoomSwitcher();
    syncSizeManager();

    if (options.select) {
        const row = document.querySelector(`#room-layer-box .layer-div[data-target-id="${room.id}"]`);
        if (row) selectLayer(row);
    }
}

function switchActiveRoom(delta) {
    const rooms = getRooms();
    if (!rooms.length) return;
    const currentIndex = rooms.findIndex((r) => r.id === activeRoomId);
    const targetIndex = currentIndex < 0 ? 0 : (currentIndex + delta + rooms.length) % rooms.length;
    setActiveRoom(rooms[targetIndex], { select: true });
}

function focusLayerRow(div) {
    const targetItem = document.getElementById(div.dataset.targetId);
    if (!targetItem) return;
    const room = targetItem.closest('.room');
    if (room && room.id !== activeRoomId) {
        setActiveRoom(room);
        selectLayer(div);
        return;
    }
    selectLayer(div);
}

function cloneRoomContents(sourceRoom, targetRoom) {
    if (!sourceRoom || !targetRoom) return;
    [...sourceRoom.children].forEach((sourceItem) => {
        const type = sourceItem.dataset.type;
        const name = sourceItem.dataset.name || '';

        if (type === 'furniture') {
            const item = document.createElement('div');
            item.classList.add('object', 'furniture');
            item.id = `furniture${++Fcounter}`;
            item.dataset.type = 'furniture';
            item.dataset.name = name;
            item.dataset.roomId = targetRoom.id;
            item.dataset.rotation = sourceItem.dataset.rotation || '0';
            if (sourceItem.dataset.edges) item.dataset.edges = sourceItem.dataset.edges;
            if (sourceItem.dataset.tolerance) item.dataset.tolerance = sourceItem.dataset.tolerance;
            item.style.width = sourceItem.style.width;
            item.style.height = sourceItem.style.height;
            item.style.left = sourceItem.style.left;
            item.style.top = sourceItem.style.top;
            item.style.backgroundColor = sourceItem.style.backgroundColor || 'transparent';
            item.style.borderColor = sourceItem.style.borderColor || 'transparent';
            item.style.borderRadius = sourceItem.style.borderRadius || '';
            setItemName(item, name);
            targetRoom.appendChild(item);
            if (item.dataset.edges) renderEdges(item);
            if (item.dataset.tolerance) renderTolerance(item);
            applyRotation(item, Number(item.dataset.rotation) || 0);
            createLayer(
                (parseFloat(item.style.width) || 0) / metro,
                (parseFloat(item.style.height) || 0) / metro,
                'm', 'm', name, 'add-object-btn', item.id, targetRoom.id, objectMenuOptions, 'furniture',
            );
            guardarCambios(item);
            return;
        }

        if (type === 'window' || type === 'door') {
            const item = document.createElement('div');
            item.classList.add('object', 'opening', type);
            item.id = `${type}${++openingCounter}`;
            item.dataset.type = type;
            item.dataset.name = name;
            item.dataset.roomId = targetRoom.id;
            item.dataset.edge = sourceItem.dataset.edge || 'top';
            item.dataset.direction = sourceItem.dataset.direction || 'in';
            item.dataset.axis = sourceItem.dataset.axis || 'sup';
            item.dataset.offset = sourceItem.dataset.offset || '0';
            item.dataset.openingWidth = sourceItem.dataset.openingWidth;
            targetRoom.appendChild(item);
            placeOpening(item);
            createLayer(
                getOpeningWidth(item), OPENING_DEPTH,
                'm', 'm', name, 'add-object-btn', item.id, targetRoom.id, objectMenuOptions, type,
            );
            guardarCambios(item);
        }
    });
}

function getRotation(item) {
    return Number(item?.dataset.rotation) || 0;
}

function normalizeDeg(deg) {
    return ((Number(deg) % 360) + 360) % 360;
}

const ROT_SWAP_TOL = 3;

function isAxesSwapped(item) {
    if (!item || isOpening(item)) return false;
    const quarter = normalizeDeg(getRotation(item)) % 180;
    return Math.abs(quarter - 90) <= ROT_SWAP_TOL;
}

function getItemLayout(item) {
    if (isOpening(item)) {
        return { width: getOpeningWidth(item), height: OPENING_DEPTH };
    }
    const rawWidth = parseFloat(item.style.width) || item.offsetWidth;
    const rawHeight = parseFloat(item.style.height) || item.offsetHeight;
    return isAxesSwapped(item)
        ? { width: rawHeight, height: rawWidth }
        : { width: rawWidth, height: rawHeight };
}

function snapNameRotation(rotation) {
    const R = normalizeDeg(rotation);
    return R >= 90 && R < 270 ? 180 : 0;
}

function applyRotation(item, deg) {
    if (!item || isOpening(item)) return;
    const rotation = normalizeDeg(deg);
    item.dataset.rotation = String(rotation);
    item.style.transform = `translate(-50%, -50%) rotate(${rotation}deg)`;
    item.querySelectorAll(':scope > .rotate-handle, :scope > .rotate-handle-90').forEach((handle) => {
        handle.style.transform = `translate(-50%, -50%) rotate(${-rotation}deg)`;
    });
    const nameEl = item.querySelector(':scope > .balance-name');
    if (nameEl) nameEl.style.transform = `rotate(${snapNameRotation(rotation)}deg)`;
    if (getSelectedObject() === item) {
        syncEdgeTogglerRotation(rotation);
        syncToleranceTogglerRotation(rotation);
        syncSizeManagerReadout();
    }
}

function snapRotation(deg) {
    const normalized = normalizeDeg(deg);
    const nearest = Math.round(normalized / 90) * 90;
    return Math.abs(normalized - nearest) <= 6 ? normalizeDeg(nearest) : normalized;
}

const ROTATE_HANDLE_SVG_FREE = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
        <path d="M204-318q-22-38-33-78t-11-82q0-134 93-228t227-94h7l-64-64 56-56 160 160-160 160-56-56 64-64h-7q-100 0-170 70.5T240-478q0 26 6 51t18 49l-60 60ZM481-40 321-200l160-160 56 56-64 64h7q100 0 170-70.5T720-482q0-26-6-51t-18-49l60-60q22 38 33 78t11 82q0 134-93 228t-227 94h-7l64 64-56 56Z"/>
    </svg>
`;
const ROTATE_HANDLE_SVG_QUARTER = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true">
        <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 129.5 27T716-696v-104h80v240H556v-80h104q-43-43-80.5-61.5T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-47t81-123h84q-20 111-105 180.5T480-160Z"/>
    </svg>
`;

function syncRotationHandle(item) {
    document.querySelectorAll('.rotate-handle, .rotate-handle-90').forEach((handle) => {
        if (!item || handle.parentElement !== item) handle.remove();
    });

    if (!item || isOpening(item)) return;

    let handle = item.querySelector(':scope > .rotate-handle');
    if (!handle) {
        handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'rotate-handle';
        handle.setAttribute('aria-label', 'Girar objeto');
        handle.innerHTML = ROTATE_HANDLE_SVG_FREE;
        handle.addEventListener('pointerdown', startRotationDrag);
        item.appendChild(handle);
    }

    let quarterHandle = item.querySelector(':scope > .rotate-handle-90');
    if (!quarterHandle) {
        quarterHandle = document.createElement('button');
        quarterHandle.type = 'button';
        quarterHandle.className = 'rotate-handle-90';
        quarterHandle.setAttribute('aria-label', 'Girar 90 grados');
        quarterHandle.innerHTML = ROTATE_HANDLE_SVG_QUARTER;
        quarterHandle.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
            event.preventDefault();
        });
        quarterHandle.addEventListener('click', (event) => {
            event.stopPropagation();
            const item = event.currentTarget.parentElement;
            applyRotation(item, getRotation(item) + 90);
            guardarCambios(item);
        });
        item.appendChild(quarterHandle);
    }

    const counterRotation = `translate(-50%, -50%) rotate(${-getRotation(item)}deg)`;
    handle.style.transform = counterRotation;
    quarterHandle.style.transform = counterRotation;
}

function startRotationDrag(event) {
    event.stopPropagation();
    event.preventDefault();
    const item = event.currentTarget.parentElement;
    const rect = item.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    toolState.rotateDrag = {
        item,
        center,
        startAngle: Math.atan2(event.clientY - center.y, event.clientX - center.x),
        base: getRotation(item),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
}

function setSizeManagerDisabled(disabled, item = null) {
    document.querySelectorAll('.size-manager input, .size-manager button').forEach((control) => {
        control.disabled = disabled;
    });

    if (!disabled && isOpening(item)) {
        smAlto.disabled = true;
        document.getElementById('sm-alto-m').disabled = true;
        document.getElementById('sm-alto-cm').disabled = true;
        smRadius.disabled = true;
    }
}

function setOpeningPanelFields(item) {
    const opening = isOpening(item);
    ['sm-alto-caption', 'sm-alto-box', 'sm-radius-caption', 'sm-radius', 'sm-rotation-caption', 'sm-rotation-box'].forEach((id) => {
        document.getElementById(id).style.display = opening ? 'none' : '';
    });
}

function syncSizeManager() {
    const item = getSelectedObject();
    setSizeManagerDisabled(!item, item);
    setOpeningPanelFields(item);
    syncDoorPanel(item);
    syncEdgePanel(item);
    syncTolerancePanel(item);
    syncSizeManagerReadout();
}

function syncSizeManagerReadout() {
    const item = getSelectedObject();
    if (!item) {
        smNombre.value = '';
        smAlto.value = '';
        smAncho.value = '';
        smRadius.value = '';
        smRotation.value = '';
        return;
    }

    const { width, height } = getItemLayout(item);
    const layer = document.querySelector(`.layer-div[data-target-id="${item.id}"]`);
    smNombre.value = item.dataset.name || layer?.querySelector('.layer-content')?.textContent.trim() || '';
    smAlto.value = smFromPx(height, smAlMetric).toFixed(2);
    smAncho.value = smFromPx(width, smAnMetric).toFixed(2);
    smRadius.value = parseFloat(item.style.borderRadius) || 0;
    smRotation.value = isOpening(item) ? '' : Math.round(getRotation(item));
}

function updateSceneSize(item) {
    if (!item.classList.contains('room')) return;

    const height = parseFloat(item.style.height) || item.offsetHeight;
    const width = parseFloat(item.style.width) || item.offsetWidth;
    scene.style.width = `${width + SCENE_PADDING}px`;
    scene.style.height = `${height + SCENE_PADDING}px`;
}

function updateMinScaleForRoom(room) {
    if (!room || !room.classList.contains('room')) return;

    const width = parseFloat(room.style.width) || room.offsetWidth;
    const height = parseFloat(room.style.height) || room.offsetHeight;
    const fit = Math.min(
        canvas.clientWidth / (width + SCENE_PADDING),
        canvas.clientHeight / (height + SCENE_PADDING),
    );
    viewState.minScale = Math.min(viewState.baseMinScale, Math.max(0.05, fit));
}

function applySizeDimension(input, unit, dimension) {
    const item = getSelectedObject();
    const value = Number(input.value);
    if (!item || !Number.isFinite(value) || value <= 0) return;

    if (isOpening(item)) {
        if (dimension !== 'width') return;
        const maxWidth = Math.max(OPENING_MIN, getOpeningWallLength(item) - MARGEN_ESQUINA * 2);
        item.dataset.openingWidth = String(Math.min(Math.max(OPENING_MIN, smToPx(value, unit)), maxWidth));
        placeOpening(item);
        syncOpeningOverlay(item);
        guardarCambios(item);
        return;
    }

    const swapped = isAxesSwapped(item);
    const localDimension = swapped
        ? (dimension === 'width' ? 'height' : 'width')
        : dimension;
    item.style[localDimension] = `${smToPx(value, unit)}px`;
    updateSceneSize(item);
    if (item === getActiveRoom()) {
        updateMinScaleForRoom(item);
        viewState.scale = clampScale(viewState.scale);
        applySceneScale();
    }
    guardarCambios(item);
}

smNombre.addEventListener('change', () => {
    const item = getSelectedObject();
    if (!item) return;

    const value = smNombre.value.trim();
    setItemName(item, value);

    const layerContent = document.querySelector(`.layer-div[data-target-id="${item.id}"] .layer-content`);
    if (layerContent) layerContent.textContent = value;
    guardarCambios(item);
    syncRoomSwitcher();
});

smAlto.addEventListener('input', () => applySizeDimension(smAlto, smAlMetric, 'height'));
smAncho.addEventListener('input', () => applySizeDimension(smAncho, smAnMetric, 'width'));
smAncho.addEventListener('change', () => {
    const item = getSelectedObject();
    if (!item) return;
    smAncho.value = smFromPx(getItemLayout(item).width, smAnMetric).toFixed(2);
});
smRadius.addEventListener('input', () => {
    const item = getSelectedObject();
    const value = Number(smRadius.value);
    if (!item || isOpening(item) || !Number.isFinite(value) || value < 0) return;

    item.style.borderRadius = value > 0 ? `${value}px` : '';
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
    guardarCambios(item);
});

const smAlMetricState = { get value() { return smAlMetric; }, set value(value) { smAlMetric = value; } };
const smAnMetricState = { get value() { return smAnMetric; }, set value(value) { smAnMetric = value; } };
configureSizeUnitButtons(['sm-alto-m', 'sm-alto-cm'], smAlto, smAlMetricState);
configureSizeUnitButtons(['sm-ancho-m', 'sm-ancho-cm'], smAncho, smAnMetricState);

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


const cancelar = document.querySelector('.popup-btn-cancelar');
cancelar.addEventListener('click', togglePopup);
const aceptar = document.querySelector('.popup-btn-aceptar');
aceptar.addEventListener('click', () => {
    getSize();
    
});

const alertapopup =document.getElementById('popupAlerta');
const cerrarAlerta =document.getElementById('cerrarAlerta').addEventListener('click', () => {
    alertapopup.classList.add('hidden');
})

alertapopup.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) {
        alertapopup.classList.add('hidden');
    }
})

popup.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) {
        popup.classList.add('hidden');
    }
})

document.body.addEventListener('click', () => {
        document.querySelector('.popup-menu-box')?.remove();
        document.querySelector('.tol-input-popup')?.remove();
    });

document.getElementById('add-object-btn').addEventListener('click', () => {
    if (!getRooms().length) {
        alerta('Debe haber una habitación primero');
        return;
    }
    togglePopup();
    nombre.value='';
    alto.value='';
    ancho.value='';
    nombre.focus();
    currentBtnId='add-object-btn';
    
});

document.addEventListener('keydown', (evento) => {
    if (evento.ctrlKey && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        document.getElementById('add-object-btn').click();
        return;
    }

    const editingField = evento.target.closest('input, textarea, [contenteditable="true"]');
    if (evento.key === 'Delete' && !editingField) {
        const selectedObject = getSelectedObject();
        const selectedLayer = selectedObject
            ? document.querySelector(`.layer-div[data-target-id="${selectedObject.id}"]`)
            : null;

        if (selectedObject?.dataset.type === 'furniture' && selectedLayer) {
            evento.preventDefault();
            deleteLayer(selectedLayer);
            return;
        }
    }

    if (evento.key === 'Escape' && !popup.classList.contains('hidden')) {
        evento.preventDefault();
        popup.classList.add('hidden');
    }

    if (evento.key === 'Escape') {
        document.querySelector('.tol-input-popup')?.remove();
    }
});

const toolButtons = document.querySelectorAll('.tool-btn');
function setActiveTool(tool) {
    toolState.active = tool || 'select';
    toolButtons.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.tool === (tool || 'select'));
    });
}
toolButtons.forEach((button) => {
    button.addEventListener('click', () => {
        setActiveTool(button.dataset.tool);
    });
});
document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select, [contenteditable]')) return;
    const shortcut = event.key.toLowerCase();
    const button = [...toolButtons].find((btn) => (btn.dataset.shortcut || '').toLowerCase() === shortcut);
    if (!button) return;
    setActiveTool(button.dataset.tool);
});

document.getElementById('room-prev').addEventListener('click', () => switchActiveRoom(-1));
document.getElementById('room-next').addEventListener('click', () => switchActiveRoom(1));

document.addEventListener('keydown', (event) => {
    if (event.target.matches('input, textarea, select, [contenteditable]')) return;
    if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        switchActiveRoom(event.key === 'ArrowRight' ? 1 : -1);
    }
});

function clampScale(scale) {
    return Math.min(Math.max(scale, viewState.minScale), viewState.maxScale);
}

function applySceneScale() {
    scene.style.transform = `scale(${viewState.scale})`;
}

function pointerToScene(event) {
    const sceneRect = scene.getBoundingClientRect();
    return {
        x: (event.clientX - sceneRect.left) / viewState.scale,
        y: (event.clientY - sceneRect.top) / viewState.scale,
    };
}

function collectTargets(parent, item) {
    const parentWidth = parseFloat(parent.style.width) || parent.offsetWidth;
    const parentHeight = parseFloat(parent.style.height) || parent.offsetHeight;
    const xs = [0, parentWidth];
    const ys = [0, parentHeight];

    parent.querySelectorAll(':scope > .object').forEach((sibling) => {
        if (sibling === item || sibling.getClientRects().length === 0) return;

        const width = parseFloat(sibling.style.width) || sibling.offsetWidth;
        const height = parseFloat(sibling.style.height) || sibling.offsetHeight;
        xs.push(sibling.offsetLeft - width / 2, sibling.offsetLeft + width / 2);
        ys.push(sibling.offsetTop - height / 2, sibling.offsetTop + height / 2);
    });

    for (let position = 0; position <= parentWidth; position += GRID_STEP) {
        xs.push(position);
    }
    for (let position = 0; position <= parentHeight; position += GRID_STEP) {
        ys.push(position);
    }

    return {
        xs: [...new Set(xs)],
        ys: [...new Set(ys)],
    };
}

function pickSnap(center, size, candidates, threshold) {
    const edges = [center - size / 2, center + size / 2];
    let winner = null;

    candidates.forEach((candidate) => {
        edges.forEach((edge) => {
            const delta = candidate - edge;
            if (Math.abs(delta) > threshold) return;
            if (!winner || Math.abs(delta) < Math.abs(winner.delta)) {
                winner = { delta, pos: candidate };
            }
        });
    });

    return winner;
}

function ensureGuidesLayer() {
    return guidesLayer;
}

function drawSnapGuide(axis, pos, parent) {
    const guide = document.createElement('div');
    const parentRect = parent.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const screenPos = (axis === 'x' ? parentRect.left - canvasRect.left : parentRect.top - canvasRect.top)
        + pos * viewState.scale;

    guide.className = `snap-guide ${axis}`;
    if (axis === 'x') {
        guide.style.left = `${screenPos}px`;
    } else {
        guide.style.top = `${screenPos}px`;
    }
    ensureGuidesLayer().appendChild(guide);
}

function clearSnapGuides() {
    ensureGuidesLayer().replaceChildren();
}

function snapObject(item, left, top, parent) {
    const threshold = SNAP_SENS / viewState.scale;
    const targets = collectTargets(parent, item);
    const width = parseFloat(item.style.width) || item.offsetWidth;
    const height = parseFloat(item.style.height) || item.offsetHeight;
    const xSnap = pickSnap(left, width, targets.xs, threshold);
    const ySnap = pickSnap(top, height, targets.ys, threshold);

    clearSnapGuides();
    if (xSnap) drawSnapGuide('x', xSnap.pos, parent);
    if (ySnap) drawSnapGuide('y', ySnap.pos, parent);

    return {
        left: left + (xSnap?.delta || 0),
        top: top + (ySnap?.delta || 0),
    };
}

function isOpening(item) {
    return item?.dataset.type === 'window' || item?.dataset.type === 'door';
}

function getOpeningWidth(item) {
    return parseFloat(item.dataset.openingWidth) || OPENING_MIN;
}

function getOpeningWallLength(item) {
    const room = item.parentElement;
    return item.dataset.edge === 'right' || item.dataset.edge === 'left'
        ? parseFloat(room.style.height) || room.offsetHeight
        : parseFloat(room.style.width) || room.offsetWidth;
}

function clampOpeningOffset(item, offset, width = getOpeningWidth(item)) {
    const maxOffset = Math.max(MARGEN_ESQUINA, getOpeningWallLength(item) - width - MARGEN_ESQUINA);
    return Math.min(Math.max(offset, MARGEN_ESQUINA), maxOffset);
}

function snapOpeningOffset(offset) {
    return Math.round(offset / GRID_STEP) * GRID_STEP;
}

function placeOpening(item) {
    const room = item.parentElement;
    const roomWidth = parseFloat(room.style.width) || room.offsetWidth;
    const roomHeight = parseFloat(room.style.height) || room.offsetHeight;
    const maxWidth = Math.max(OPENING_MIN, getOpeningWallLength(item) - MARGEN_ESQUINA * 2);
    const width = Math.min(getOpeningWidth(item), maxWidth);
    const offset = clampOpeningOffset(item, Number(item.dataset.offset) || 0, width);
    const edge = item.dataset.edge || 'top';

    item.dataset.openingWidth = String(width);
    item.dataset.offset = String(offset);
    if (edge === 'right') {
        item.style.width = `${OPENING_DEPTH}px`;
        item.style.height = `${width}px`;
        item.style.left = `${roomWidth + OPENING_DEPTH / 2}px`;
        item.style.top = `${offset + width / 2}px`;
    } else if (edge === 'bottom') {
        item.style.width = `${width}px`;
        item.style.height = `${OPENING_DEPTH}px`;
        item.style.left = `${offset + width / 2}px`;
        item.style.top = `${roomHeight + OPENING_DEPTH / 2}px`;
    } else if (edge === 'left') {
        item.style.width = `${OPENING_DEPTH}px`;
        item.style.height = `${width}px`;
        item.style.left = `${-OPENING_DEPTH / 2}px`;
        item.style.top = `${offset + width / 2}px`;
    } else {
        item.style.width = `${width}px`;
        item.style.height = `${OPENING_DEPTH}px`;
        item.style.left = `${offset + width / 2}px`;
        item.style.top = `${-OPENING_DEPTH / 2}px`;
    }
    drawDoorArc(item);
}

function drawDoorArc(item) {
    item.querySelector('.door-arc')?.remove();
    if (!item || item.dataset.type !== 'door' || !item.isConnected) return;

    const room = item.parentElement;
    const roomWidth = parseFloat(room.style.width) || room.offsetWidth;
    const roomHeight = parseFloat(room.style.height) || room.offsetHeight;
    const width = getOpeningWidth(item);
    const edge = item.dataset.edge || 'top';
    const dirIn = (item.dataset.direction || 'in') === 'in';
    const axisSup = (item.dataset.axis || 'sup') === 'sup';

    const left = parseFloat(item.style.left);
    const top = parseFloat(item.style.top);
    const boxW = parseFloat(item.style.width) || item.offsetWidth;
    const boxH = parseFloat(item.style.height) || item.offsetHeight;
    const anchorX = left - boxW / 2;
    const anchorY = top - boxH / 2;
    const u = edge === 'top' || edge === 'bottom' ? [1, 0] : [0, 1];
    const n = edge === 'top' ? [0, 1] : edge === 'bottom' ? [0, -1] : edge === 'left' ? [1, 0] : [-1, 0];

    const offset = parseFloat(item.dataset.offset) || 0;
    const centerU = edge === 'top' || edge === 'bottom' ? left : top;
    const centerN = edge === 'top' ? top : edge === 'bottom' ? roomHeight - top : edge === 'left' ? left : roomWidth - left;
    const hingeU = axisSup ? offset : offset + width;

    const hingeX = left - centerN * n[0] + (hingeU - centerU) * u[0];
    const hingeY = top - centerN * n[1] + (hingeU - centerU) * u[1];

    const step = 24;
    const pts = [];
    for (let k = 0; k <= step; k += 1) {
        const t = Math.PI * k / step;
        const du = (axisSup ? 1 : -1) * width * Math.cos(t);
        const dn = (dirIn ? 1 : -1) * width * Math.sin(t);
        pts.push([hingeX + du * u[0] + dn * n[0], hingeY + du * u[1] + dn * n[1]]);
    }

    const xs = [hingeX, ...pts.map((p) => p[0])];
    const ys = [hingeY, ...pts.map((p) => p[1])];
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'door-arc');
    svg.setAttribute('viewBox', `0 0 ${Math.max(...xs) - minX} ${Math.max(...ys) - minY}`);
    svg.style.position = 'absolute';
    svg.style.left = `${minX - anchorX}px`;
    svg.style.top = `${minY - anchorY}px`;
    svg.style.width = `${Math.max(...xs) - minX}px`;
    svg.style.height = `${Math.max(...ys) - minY}px`;
    svg.style.overflow = 'visible';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dPts = pts.map((p) => `${p[0] - minX},${p[1] - minY}`);
    path.setAttribute('d', `M${hingeX - minX},${hingeY - minY} L${dPts.join(' L')} Z`);
    path.setAttribute('fill', 'rgba(212, 164, 119, 0.22)');
    path.setAttribute('stroke', 'rgba(212, 164, 119, 0.9)');
    path.setAttribute('stroke-width', '1.5');

    svg.appendChild(path);

    const pivot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pivot.setAttribute('cx', `${hingeX - minX}`);
    pivot.setAttribute('cy', `${hingeY - minY}`);
    pivot.setAttribute('r', '3.5');
    pivot.setAttribute('fill', '#d4a477');
    pivot.setAttribute('stroke', 'rgba(111, 74, 50, 0.85)');
    pivot.setAttribute('stroke-width', '1');
    svg.appendChild(pivot);

    const drawOpeningArrow = (t) => {
        const c = Math.cos(t);
        const s = Math.sin(t);
        const ax = hingeX + (axisSup ? 1 : -1) * width * c * u[0] + (dirIn ? 1 : -1) * width * s * n[0];
        const ay = hingeY + (axisSup ? 1 : -1) * width * c * u[1] + (dirIn ? 1 : -1) * width * s * n[1];
        const dx = -(axisSup ? 1 : -1) * width * s * u[0] + (dirIn ? 1 : -1) * width * c * n[0];
        const dy = -(axisSup ? 1 : -1) * width * s * u[1] + (dirIn ? 1 : -1) * width * c * n[1];
        const mLen = Math.hypot(dx, dy) || 1;
        const tailAngle = Math.atan2(dy / mLen, dx / mLen);
        const tailLen = 9;
        const head = 4;
        const back = Math.PI * 5 / 6;
        const tailX = ax - Math.cos(tailAngle) * tailLen;
        const tailY = ay - Math.sin(tailAngle) * tailLen;
        const w1x = ax + head * Math.cos(tailAngle + back);
        const w1y = ay + head * Math.sin(tailAngle + back);
        const w2x = ax + head * Math.cos(tailAngle - back);
        const w2y = ay + head * Math.sin(tailAngle - back);

        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrow.setAttribute('d',
            `M${tailX - minX},${tailY - minY} L${ax - minX},${ay - minY} ` +
            `M${ax - minX},${ay - minY} L${w1x - minX},${w1y - minY} ` +
            `M${ax - minX},${ay - minY} L${w2x - minX},${w2y - minY}`);
        arrow.setAttribute('fill', 'none');
        arrow.setAttribute('stroke', 'rgba(212, 164, 119, 0.95)');
        arrow.setAttribute('stroke-width', '1.5');
        arrow.setAttribute('stroke-linecap', 'round');
        arrow.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(arrow);
    };
    [Math.PI / 6, Math.PI / 3, Math.PI / 2, 2 * Math.PI / 3, 5 * Math.PI / 6].forEach(drawOpeningArrow);

    item.appendChild(svg);
}

function syncDoorPanel(item) {
    const isDoor = item?.dataset.type === 'door';
    document.getElementById('door-props').style.display = isDoor ? '' : 'none';
    if (!isDoor) return;

    const dir = item.dataset.direction || 'in';
    const axis = item.dataset.axis || 'sup';
    document.getElementById('door-dir-in').classList.toggle('selected', dir === 'in');
    document.getElementById('door-dir-out').classList.toggle('selected', dir === 'out');
    document.getElementById('door-axis-sup').classList.toggle('selected', axis === 'sup');
    document.getElementById('door-axis-inf').classList.toggle('selected', axis === 'inf');
}

function bindDoorToggle(ids, key, values) {
    ids.forEach((id, index) => {
        document.getElementById(id).addEventListener('click', () => {
            const item = getSelectedObject();
            if (!item || item.dataset.type !== 'door') return;
            item.dataset[key] = values[index];
            placeOpening(item);
            syncOpeningOverlay(item);
            syncDoorPanel(item);
            guardarCambios(item);
        });
    });
}

bindDoorToggle(['door-dir-in', 'door-dir-out'], 'direction', ['in', 'out']);
bindDoorToggle(['door-axis-sup', 'door-axis-inf'], 'axis', ['sup', 'inf']);

function hasEdge(item, side) {
    return (item?.dataset.edges || '').split(' ').includes(side);
}

function setObjectEdge(item, side, on) {
    if (!item || isOpening(item)) return;
    let list = (item.dataset.edges || '').split(' ').filter(Boolean);
    if (on && !list.includes(side)) list.push(side);
    if (!on) list = list.filter((item) => item !== side);
    item.dataset.edges = list.filter((item) => EDGE_SIDES.includes(item)).join(' ');
    renderEdges(item);
}

function renderEdges(item) {
    item.querySelector('.edges-layer')?.remove();
    if (!item || !item.classList.contains('furniture')) return;
    const sides = (item.dataset.edges || '').split(' ').filter((side) => EDGE_SIDES.includes(side));
    if (!sides.length) return;

    const layer = document.createElement('div');
    layer.className = 'edges-layer';
    sides.forEach((side) => {
        const strip = document.createElement('div');
        strip.className = `edge-strip edge-strip--${side}`;
        layer.appendChild(strip);
    });
    item.appendChild(layer);
}

function syncEdgeTogglerRotation(rotation) {
    const toggler = document.getElementById('edge-toggler');
    if (!toggler) return;
    toggler.style.transform = rotation > 0 ? `rotate(${rotation}deg)` : '';
}

function getToleranceSide(item, side) {
    if (!item) return 0;
    const list = (item.dataset.tolerance || '').split(' ').map(Number);
    const index = TOLERANCE_SIDES.indexOf(side);
    return Number.isFinite(list[index]) ? Math.max(0, list[index] || 0) : 0;
}

function setToleranceSide(item, side, metros) {
    if (!item || isOpening(item)) return;
    const list = TOLERANCE_SIDES.map((s) => getToleranceSide(item, s));
    const value = Math.min(Math.max(0, Number(metros) || 0), TOLERANCE_MAX_M);
    list[TOLERANCE_SIDES.indexOf(side)] = Number(value.toFixed(2));
    item.dataset.tolerance = list.map((v) => v || 0).join(' ');
    renderTolerance(item);
}

function renderTolerance(item) {
    item.querySelector('.tolerance-layer')?.remove();
    if (!item || !item.classList.contains('furniture')) return;

    const layer = document.createElement('div');
    layer.className = 'tolerance-layer';
    const fill = getComputedStyle(item).backgroundColor;
    if (/^rgb|^hsl|^#/.test(fill) && fill !== 'rgba(0, 0, 0, 0)') {
        layer.style.setProperty('--color-el', fill);
    }
    TOLERANCE_SIDES.forEach((side) => {
        const depth = getToleranceSide(item, side) * metro;
        const tab = document.createElement('div');
        tab.className = `tol-tab tol-tab--${side}`;
        if (depth > 0) {
            tab.classList.add('has-depth');
            tab.style.setProperty('--tol-depth', `${depth}px`);
        }
        layer.appendChild(tab);
    });
    item.appendChild(layer);
}

function syncToleranceTogglerRotation(rotation) {
    const toggler = document.getElementById('tolerance-toggler');
    if (!toggler) return;
    toggler.style.transform = rotation > 0 ? `rotate(${rotation}deg)` : '';
    const sideDeg = { top: -90, right: 0, bottom: 90, left: 180 };
    toggler.querySelectorAll('.tol-label').forEach((label) => {
        const angle = sideDeg[label.dataset.tolSide] + rotation;
        const onBottom = Math.sin((angle * Math.PI) / 180) > 0;
        label.style.setProperty('--tol-label-rotate', `${onBottom ? -rotation : 0}deg`);
    });
}

function syncTolerancePanel(item) {
    const editable = !!item && !isOpening(item) && item.classList.contains('furniture');
    document.getElementById('tolerance-manager').style.display = editable ? 'flex' : 'none';
    if (!editable) return;

    syncToleranceTogglerRotation(getRotation(item));
    TOLERANCE_SIDES.forEach((side) => {
        const label = document.querySelector(`.tol-label[data-tol-side="${side}"]`);
        if (label) label.textContent = getToleranceSide(item, side);
    });
}

TOLERANCE_SIDES.forEach((side) => {
    document.querySelector(`.tol-label[data-tol-side="${side}"]`).addEventListener('click', (event) => {
        event.stopPropagation();
        const item = getSelectedObject();
        if (!item || !item.classList.contains('furniture')) return;
        openToleranceInput(item, side, event.currentTarget);
    });
});

function openToleranceInput(item, side, labelEl) {
    document.querySelector('.tol-input-popup')?.remove();

    const box = document.createElement('div');
    box.classList.add('tol-input-popup');

    const caption = document.createElement('span');
    caption.className = 'tol-input-caption';
    caption.textContent = `Tolerancia ${side} (m)`;

    const row = document.createElement('div');
    row.className = 'tol-input-row';

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.05';
    input.value = String(getToleranceSide(item, side));
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => e.stopPropagation());

    const unit = document.createElement('span');
    unit.className = 'sm-unit-btn selected';
    unit.textContent = 'm';

    const aceptar = document.createElement('button');
    aceptar.type = 'button';
    aceptar.className = 'tol-input-aceptar';
    aceptar.textContent = 'Aceptar';
    aceptar.addEventListener('click', (e) => e.stopPropagation());

    const commit = () => {
        setToleranceSide(item, side, input.value);
        syncTolerancePanel(item);
        guardarCambios(item);
        box.remove();
    };
    aceptar.addEventListener('click', commit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            commit();
        }
    });

    row.append(input, unit);
    box.append(caption, row, aceptar);
    document.body.appendChild(box);

    const rect = labelEl.getBoundingClientRect();
    const margen = 8;
    box.style.left = `${Math.min(rect.right + margen, window.innerWidth - box.offsetWidth - margen)}px`;
    const espacioAbajo = window.innerHeight - rect.bottom;
    const espacioArriba = rect.top;
    const top = espacioAbajo >= box.offsetHeight || espacioAbajo >= espacioArriba
        ? rect.bottom + margen
        : rect.top - box.offsetHeight - margen;
    box.style.top = `${Math.max(margen, top)}px`;

    input.focus();
    input.select();
}

function syncEdgePanel(item) {
    const isEditable = !!item && !isOpening(item) && item.classList.contains('furniture');
    document.getElementById('edge-manager').style.display = isEditable ? 'flex' : 'none';
    if (!isEditable) return;

    const toggler = document.getElementById('edge-toggler');
    syncEdgeTogglerRotation(getRotation(item));
    EDGE_SIDES.forEach((side) => {
        const on = hasEdge(item, side);
        toggler.classList.toggle(`on-${side}`, on);
    });
    document.querySelectorAll('.edge-switch').forEach((switchEl) => {
        switchEl.classList.toggle('on', hasEdge(item, switchEl.dataset.edge));
    });
}

EDGE_SIDES.forEach((side) => {
    document.querySelector(`.edge-switch[data-edge="${side}"]`).addEventListener('click', () => {
        const item = getSelectedObject();
        if (!item || isOpening(item)) return;
        setObjectEdge(item, side, !hasEdge(item, side));
        syncEdgePanel(item);
        guardarCambios(item);
    });
});

function dragOpeningAlongWall(item, localX, localY) {
    const room = item.parentElement;
    const roomWidth = parseFloat(room.style.width) || room.offsetWidth;
    const roomHeight = parseFloat(room.style.height) || room.offsetHeight;
    const width = getOpeningWidth(item);
    const threshold = Math.max(SNAP_SENS * 2 / viewState.scale, OPENING_DEPTH);

    const walls = [
        { edge: 'top', distance: Math.abs(localY) },
        { edge: 'bottom', distance: Math.abs(localY - roomHeight) },
        { edge: 'left', distance: Math.abs(localX) },
        { edge: 'right', distance: Math.abs(localX - roomWidth) },
    ];
    const nearest = walls.reduce((best, wall) => (wall.distance < best.distance ? wall : best));

    if (nearest.distance <= threshold) {
        item.dataset.edge = nearest.edge;
    }

    const rawOffset = item.dataset.edge === 'right' || item.dataset.edge === 'left'
        ? localY - width / 2
        : localX - width / 2;
    item.dataset.offset = String(clampOpeningOffset(item, snapOpeningOffset(rawOffset), width));
    placeOpening(item);
}

function clearOpeningOverlay() {
    openingLayer.replaceChildren();
}

function createOpeningMeasureInput(item, side) {
    const wrapper = document.createElement('div');
    wrapper.className = 'opening-label opening-measure-input';
    wrapper.dataset.targetId = item.id;
    wrapper.dataset.side = side;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0.1';
    input.step = '0.1';
    input.dataset.side = side;
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('pointerdown', (event) => event.stopPropagation());
    input.addEventListener('change', () => commitOpeningMargin(item, side, input.value));

    const unit = document.createElement('span');
    unit.textContent = 'm';

    wrapper.append(input, unit);
    openingLayer.appendChild(wrapper);
    return wrapper;
}

function commitOpeningMargin(item, side, rawValue) {
    const value = Number(rawValue);
    if (!item.isConnected || !Number.isFinite(value) || value <= 0) return;

    const marginPx = value * metro;
    const wallLength = getOpeningWallLength(item);

    if (side === 'left') {
        item.dataset.offset = String(clampOpeningOffset(item, snapOpeningOffset(marginPx)));
    } else {
        const width = getOpeningWidth(item);
        item.dataset.offset = String(clampOpeningOffset(item, snapOpeningOffset(wallLength - width - marginPx)));
    }

    placeOpening(item);
    syncOpeningOverlay(item);
    syncSizeManager();
    guardarCambios(item);
}

function syncOpeningOverlay(item) {
    clearOpeningOverlay();
    if (!isOpening(item) || !item.isConnected) return;

    const room = item.parentElement;
    const roomRect = room.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const roomWidth = parseFloat(room.style.width) || room.offsetWidth;
    const roomHeight = parseFloat(room.style.height) || room.offsetHeight;
    const width = getOpeningWidth(item);
    const offset = parseFloat(item.dataset.offset) || 0;
    const edge = item.dataset.edge || 'top';
    const scale = viewState.scale;
    const horizontal = edge === 'top' || edge === 'bottom';
    const wallBaseX = roomRect.left - canvasRect.left;
    const wallBaseY = roomRect.top - canvasRect.top;
    const wallPosition = horizontal
        ? (edge === 'bottom' ? wallBaseY + roomHeight * scale : wallBaseY)
        : (edge === 'right' ? wallBaseX + roomWidth * scale : wallBaseX);
    const first = horizontal
        ? wallBaseX + offset * scale
        : wallBaseY + offset * scale;
    const second = horizontal
        ? wallBaseX + (offset + width) * scale
        : wallBaseY + (offset + width) * scale;
    const leftDistance = (offset / metro).toFixed(1);
    const rightDistance = ((horizontal ? roomWidth : roomHeight) - offset - width) / metro;
    const rightLabel = Number(rightDistance).toFixed(1);
    const outside = edge === 'top' ? -16 : edge === 'bottom' ? 16 : edge === 'left' ? -16 : 16;

    const firstLabel = createOpeningMeasureInput(item, 'left');
    const secondLabel = createOpeningMeasureInput(item, 'right');
    firstLabel.querySelector('input').value = leftDistance;
    secondLabel.querySelector('input').value = rightLabel;

    if (horizontal) {
        firstLabel.style.left = `${(first + wallBaseX) / 2}px`;
        secondLabel.style.left = `${(second + wallBaseX + roomWidth * scale) / 2}px`;
        firstLabel.style.top = `${wallPosition + outside}px`;
        secondLabel.style.top = `${wallPosition + outside}px`;
    } else {
        firstLabel.style.left = `${wallPosition + outside}px`;
        secondLabel.style.left = `${wallPosition + outside}px`;
        firstLabel.style.top = `${(first + wallBaseY) / 2}px`;
        secondLabel.style.top = `${(second + wallBaseY + roomHeight * scale) / 2}px`;
    }
}

function positionDraggedObject(clientX, clientY) {
    const { item, startPointer, startCenter } = toolState.dragObject;
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

    const parentOriginX = (parentRect.left - sceneRect.left) / viewState.scale;
    const parentOriginY = (parentRect.top - sceneRect.top) / viewState.scale;
    const localX = center.x - parentOriginX;
    const localY = center.y - parentOriginY;

    if (isOpening(item)) {
        dragOpeningAlongWall(item, localX, localY);
        syncOpeningOverlay(item);
    } else if (item.classList.contains('room')) {
        item.style.left = `${localX}px`;
        item.style.top = `${localY}px`;
        const selected = getSelectedObject();
        if (isOpening(selected)) syncOpeningOverlay(selected);
    } else {
        const snapped = snapObject(item, localX, localY, parent);
        item.style.left = `${snapped.left}px`;
        item.style.top = `${snapped.top}px`;
    }
}

function scrollForEdges(clientX, clientY) {
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

    canvas.scrollLeft += factorX * AUTO_SCROLL_SPEED;
    canvas.scrollTop += factorY * AUTO_SCROLL_SPEED;
}

function tickAutoScroll() {
    if (!toolState.dragObject) {
        autoscrollRaf = null;
        return;
    }

    const { lastX, lastY } = toolState.dragObject;
    if (Number.isFinite(lastX) && Number.isFinite(lastY)) {
        scrollForEdges(lastX, lastY);
        positionDraggedObject(lastX, lastY);
    }
    autoscrollRaf = requestAnimationFrame(tickAutoScroll);
}

function zoomAtPoint(event, nextScale) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const scaleRatio = nextScale / viewState.scale;
    const currentScrollLeft = canvas.scrollLeft;
    const currentScrollTop = canvas.scrollTop;

    const anchorX = currentScrollLeft + mouseX;
    const anchorY = currentScrollTop + mouseY;

    const nextScrollLeft = anchorX * scaleRatio - mouseX;
    const nextScrollTop = anchorY * scaleRatio - mouseY;

    viewState.scale = clampScale(nextScale);
    applySceneScale();
    canvas.scrollLeft = nextScrollLeft;
    canvas.scrollTop = nextScrollTop;
    syncOpeningOverlay(getSelectedObject());
}

canvas.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return;

    event.preventDefault();
    const deltaFactor = event.deltaY > 0 ? 0.9 : 1.1;
    const nextScale = clampScale(viewState.scale * deltaFactor);
    zoomAtPoint(event, nextScale);
}, { passive: false });

canvas.addEventListener('pointerdown', (event) => {
    viewState.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (viewState.activePointers.size === 2) {
        const [first, second] = [...viewState.activePointers.values()];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        viewState.pinchDistance = Math.hypot(dx, dy);
    }

    if (toolState.active === 'move') {
        toolState.pan = {
            x: event.clientX,
            y: event.clientY,
            scrollLeft: canvas.scrollLeft,
            scrollTop: canvas.scrollTop,
        };
        event.preventDefault();
        return;
    }

    const targetItem = event.target.closest('.object');
    if (!targetItem) {
        document.querySelectorAll('.object').forEach((item) => item.classList.remove('selected'));
        document.querySelectorAll('.layer-div').forEach((item) => item.classList.remove('selected-layer'));
        selectedLayerId = null;
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
        const { item, center, startAngle, base } = toolState.rotateDrag;
        const angle = Math.atan2(event.clientY - center.y, event.clientX - center.x);
        const degrees = (angle - startAngle) * 180 / Math.PI;
        applyRotation(item, snapRotation(base + degrees));
        return;
    }

    if (viewState.activePointers.size >= 2 && viewState.pinchDistance) {
        const [first, second] = [...viewState.activePointers.values()];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const pinchDistance = Math.hypot(dx, dy);
        const scaleDelta = pinchDistance / viewState.pinchDistance;
        viewState.scale = clampScale(viewState.scale * scaleDelta);
        applySceneScale();
        viewState.pinchDistance = pinchDistance;
        syncOpeningOverlay(getSelectedObject());
    }

    if (toolState.dragObject) {
        toolState.dragObject.lastX = event.clientX;
        toolState.dragObject.lastY = event.clientY;
        positionDraggedObject(event.clientX, event.clientY);
        return;
    }

    if (toolState.pan) {
        const dx = event.clientX - toolState.pan.x;
        const dy = event.clientY - toolState.pan.y;
        canvas.scrollLeft = toolState.pan.scrollLeft - dx;
        canvas.scrollTop = toolState.pan.scrollTop - dy;
        return;
    }
});

canvas.addEventListener('pointerup', (event) => {
    viewState.activePointers.delete(event.pointerId);
    if (viewState.activePointers.size < 2) {
        viewState.pinchDistance = null;
    }
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

window.addEventListener('resize', () => {
    const room = getActiveRoom();
    if (!room) return;
    updateMinScaleForRoom(room);
    viewState.scale = clampScale(viewState.scale);
    applySceneScale();
});

applySceneScale();
    
document.getElementById('create-room-btn').addEventListener('click', () => {
    const rooms = getRooms();
    const lastRoom = rooms[rooms.length - 1];
    togglePopup();
    nombre.value = '';
    alto.value = lastRoom ? smFromPx(parseFloat(lastRoom.style.height) || 0, 'm').toFixed(2) : '';
    ancho.value = lastRoom ? smFromPx(parseFloat(lastRoom.style.width) || 0, 'm').toFixed(2) : '';
    alto.focus();
    nombre.focus();
    currentBtnId = 'create-room-btn';
});


nombre.addEventListener('keydown', (evento) => {
    if(evento.key==='Enter') {
        evento.preventDefault();
        alto.focus();
    }
});

alto.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
        evento.preventDefault();
        ancho.focus();
    }
});

ancho.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') {
        evento.preventDefault();
        getSize();
        
    }
});

document.addEventListener('DOMContentLoaded', () => {
    hidratar();
})







function applyItemStateDetails(rebuilt, elemento) {
    if (!rebuilt) return;
    if (elemento.borderRadius) rebuilt.style.borderRadius = `${elemento.borderRadius}px`;
    const opening = isOpening(rebuilt);
    if (!opening) {
        if (Number.isFinite(elemento.left) && Number.isFinite(elemento.top)) {
            rebuilt.style.left = `${elemento.left}px`;
            rebuilt.style.top = `${elemento.top}px`;
        }
        applyRotation(rebuilt, Number.isFinite(elemento.rotacion) ? elemento.rotacion : 0);
        if (elemento.edges && rebuilt.classList.contains('furniture')) {
            rebuilt.dataset.edges = elemento.edges;
            renderEdges(rebuilt);
        }
        if (elemento.tolerance) {
            rebuilt.dataset.tolerance = elemento.tolerance;
            renderTolerance(rebuilt);
        }
    }
}

function hidratar() {
    const datosGuardados = JSON.parse(localStorage.getItem('mise')) || [];

    const validos = datosGuardados.filter((elemento) => elemento && elemento.id);
    if (!Array.isArray(datosGuardados) || datosGuardados.length !== validos.length) {
        localStorage.setItem('mise', JSON.stringify(validos));
    }

    if (validos.length === 0) {
        localStorage.removeItem('mise-active');
        syncSizeManager();
        return;
    }

    const roomIdMap = {};
    const rebuiltRooms = [];

    validos
        .filter((elemento) => elemento.type === 'room')
        .forEach((elemento) => {
            const rebuilt = createRoom(
                elemento.ancho,
                elemento.alto,
                elemento.unidadAlto,
                elemento.unidadAncho,
                elemento.nombre,
                elemento.currentBtnId,
                undefined,
                false,
            );
            if (!rebuilt) return;
            roomIdMap[elemento.id] = rebuilt.id;
            rebuiltRooms.push(rebuilt);
            applyItemStateDetails(rebuilt, elemento);
        });

    validos
        .filter((elemento) => elemento.type !== 'room')
        .forEach((elemento) => {
            const roomId = roomIdMap[elemento.roomId] || rebuiltRooms[0]?.id;
            const roomEl = document.getElementById(roomId);
            if (!roomEl) return;

            const rebuilt = isOpening({ dataset: { type: elemento.type } })
                ? rebuildOpening(elemento, roomEl)
                : createRoom(
                    elemento.ancho,
                    elemento.alto,
                    'm',
                    'm',
                    elemento.nombre || '',
                    'add-object-btn',
                    roomEl,
                );
            applyItemStateDetails(rebuilt, elemento);
        });

    rebuiltRooms.forEach((room) => {
        const st = validos.find((elemento) => roomIdMap[elemento.id] === room.id);
        if (st && Number.isFinite(st.viewScale)) {
            roomViews[room.id] = {
                scale: st.viewScale,
                scrollX: Number(st.viewScrollX) || 0,
                scrollY: Number(st.viewScrollY) || 0,
            };
        }
    });

    localStorage.removeItem('mise');
    rebuiltRooms.forEach((room) => guardarCambios(room));
    document.querySelectorAll('.object').forEach((item) => {
        if (item.dataset.type !== 'room') guardarCambios(item);
    });

    const activeId = localStorage.getItem('mise-active');
    const active = rebuiltRooms.find((room) => room.id === activeId) || rebuiltRooms[rebuiltRooms.length - 1] || null;
    setActiveRoom(active);
    syncSizeManager();
}


function guardar(estadoActual) {
    const datosGuardados=JSON.parse(localStorage.getItem('mise'));
    const estadosGuardados=Array.isArray(datosGuardados) 
        ? datosGuardados
        : [];

    const index = estadosGuardados.findIndex((estado) => estado.id === estadoActual.id);
    if (index >= 0) {
        estadosGuardados[index] = estadoActual;
    } else {
        estadosGuardados.push(estadoActual);
    }
    localStorage.setItem('mise', JSON.stringify(estadosGuardados));
}

function getItemState(item) {
    const opening = isOpening(item);
    const width = opening ? getOpeningWidth(item) : parseFloat(item.style.width) || item.offsetWidth;
    const height = opening ? OPENING_DEPTH : parseFloat(item.style.height) || item.offsetHeight;
    const isRoom = item.dataset.type === 'room';
    return {
        id: item.id,
        nombre: item.dataset.name || item.textContent.trim(),
        ancho: width / metro,
        alto: height / metro,
        unidadAncho: 'm',
        unidadAlto: 'm',
        borderRadius: parseFloat(item.style.borderRadius) || 0,
        rotacion: getRotation(item),
        edges: item.classList.contains('furniture') ? item.dataset.edges || '' : '',
        tolerance: item.classList.contains('furniture') ? item.dataset.tolerance || '' : '',
        left: item.offsetLeft,
        top: item.offsetTop,
        type: item.dataset.type,
        roomId: item.dataset.roomId || item.parentElement?.id,
        edge: item.dataset.edge,
        direction: item.dataset.direction,
        axis: item.dataset.axis,
        offset: Number.isFinite(Number(item.dataset.offset)) ? Number(item.dataset.offset) : undefined,
        viewScale: isRoom && roomViews[item.id] ? roomViews[item.id].scale : undefined,
        viewScrollX: isRoom && roomViews[item.id] ? roomViews[item.id].scrollX : undefined,
        viewScrollY: isRoom && roomViews[item.id] ? roomViews[item.id].scrollY : undefined,
        currentBtnId: item.dataset.type === 'room' ? 'create-room-btn' : 'add-object-btn',
    };
}

function guardarCambios(item) {
    guardar(getItemState(item));
}

function eliminarGuardado(ids) {
    const datosGuardados = JSON.parse(localStorage.getItem('mise')) || [];
    const estadosGuardados = Array.isArray(datosGuardados)
        ? datosGuardados.filter((estado) => !ids.includes(estado.id))
        : [];
    localStorage.setItem('mise', JSON.stringify(estadosGuardados));
}

function togglePopup() {
    popup.classList.toggle('hidden');
}

function createRoom(ancho, alto, almedida, anmedida, name, currentBtnId, parentRoom, inheritContents = true) {
    if (almedida === 'cm') {
        alto=alto/100;
    }
    if (anmedida === 'cm') {
        ancho=ancho/100;
    }
// const metro = pixeles por metro
    ancho*=metro;
    alto*=metro;

    const room = document.createElement('div');
    const nextColor = getNextColor();
    room.style.width=`${ancho}px`;
    room.style.height=`${alto}px`;
    room.style.borderColor = nextColor;
    room.dataset.edges = '';
    room.dataset.name = name;
    room.dataset.rotation = '0';

    let targetId = '';
    let roomOwnerId = '';

    if (currentBtnId ==='create-room-btn') {
        const lastRoom = getRooms()[getRooms().length - 1];
        roomSeq += 1;
        room.id=`room${roomSeq}`;
        targetId = room.id;
        roomOwnerId = room.id;
        room.dataset.roomId = room.id;
        room.dataset.type = 'room';
        room.classList.add('room', 'object');
        room.style.backgroundColor = 'var(--color-room)';
        scene.appendChild(room);

        if (inheritContents && lastRoom) {
            if (lastRoom.style.borderRadius) room.style.borderRadius = lastRoom.style.borderRadius;
            applyRotation(room, getRotation(lastRoom));
            cloneRoomContents(lastRoom, room);
        }
    } else if (currentBtnId ==='add-object-btn') {
        Fcounter+=1;
        room.id=`furniture${Fcounter}`;
        targetId = room.id;
        room.classList.add('furniture', 'object');
        room.style.backgroundColor = nextColor;
        const createdRoom = parentRoom || getActiveRoom() || scene.querySelector('.room');
        if (!createdRoom) return null;
        roomOwnerId = createdRoom.id;
        room.dataset.roomId = createdRoom.id;
        room.dataset.type = 'furniture';
        createdRoom.appendChild(room);
    }

    setItemName(room, name);
    createLayer(
        ancho,
        alto,
        almedida,
        anmedida,
        name,
        currentBtnId,
        targetId,
        roomOwnerId,
        currentBtnId === 'create-room-btn' ? roomMenuOptions : objectMenuOptions,
        room.dataset.type,
    );
    return room;
}

function addOpeningFromRoom(type, targetElement) {
    const context = getLayerContext(targetElement);
    if (!context || context.sceneTarget?.dataset.type !== 'room') return;

    const room = context.sceneTarget;
    if (room.id !== activeRoomId) setActiveRoom(room);
    const width = OPENING_DEFAULT[type];
    const item = document.createElement('div');
    const roomWidth = parseFloat(room.style.width) || room.offsetWidth;
    const name = type === 'window' ? 'Ventana' : 'Puerta';

    item.id = `${type}${++openingCounter}`;
    item.classList.add('opening', type, 'object');
    item.dataset.type = type;
    item.dataset.name = name;
    item.dataset.roomId = room.id;
    item.dataset.edge = 'top';
    item.dataset.direction = 'in';
    item.dataset.axis = 'sup';
    item.dataset.offset = String(snapOpeningOffset((roomWidth - width) / 2));
    item.dataset.openingWidth = String(width);
    room.appendChild(item);
    item.dataset.offset = String(clampOpeningOffset(item, Number(item.dataset.offset), width));
    placeOpening(item);
    createLayer(width, OPENING_DEPTH, 'm', 'm', name, 'add-object-btn', item.id, room.id, objectMenuOptions, type);
    guardarCambios(item);
    const layer = document.querySelector(`.layer-div[data-target-id="${item.id}"]`);
    if (layer) selectLayer(layer);
}

function rebuildOpening(elemento, parentRoom) {
    const room = parentRoom || document.getElementById(elemento.roomId) || scene.querySelector('.room');
    if (!room) return null;

    const item = document.createElement('div');
    const type = elemento.type;
    const width = Number.isFinite(elemento.ancho) ? elemento.ancho * metro : OPENING_DEFAULT[type];
    const numericId = Number.parseInt(String(elemento.id).replace(/\D/g, ''), 10);
    if (Number.isFinite(numericId)) openingCounter = Math.max(openingCounter, numericId);

    item.id = elemento.id;
    item.classList.add('opening', type, 'object');
    item.dataset.type = type;
    item.dataset.name = elemento.nombre || (type === 'window' ? 'Ventana' : 'Puerta');
    item.dataset.roomId = room.id;
    item.dataset.edge = elemento.edge || 'top';
    item.dataset.direction = elemento.direction || 'in';
    item.dataset.axis = elemento.axis || 'sup';
    item.dataset.offset = String(Number.isFinite(elemento.offset) ? elemento.offset : 0);
    item.dataset.openingWidth = String(Math.max(OPENING_MIN, width));
    room.appendChild(item);
    placeOpening(item);
    createLayer(
        width,
        OPENING_DEPTH,
        'm',
        'm',
        item.dataset.name,
        'add-object-btn',
        item.id,
        room.id,
        objectMenuOptions,
        type,
    );
    if (elemento.borderRadius) item.style.borderRadius = `${elemento.borderRadius}px`;
    return item;
}

function createLayer(
    ancho,
    alto,
    almedida,
    anmedida,
    name,
    currentBtnId,
    targetId,
    roomOwnerId,
    menuOptions = objectMenuOptions,
    layerType = currentBtnId === 'create-room-btn' ? 'room' : 'furniture',
) {

    const div =document.createElement('div');
    const eyeDiv =document.createElement('div');
    const layerDiv =document.createElement('div');
    const options =document.createElement('div');

    div.classList.add('layer-div');
    div.dataset.targetId = targetId;
    div.dataset.roomId = roomOwnerId;
    div.dataset.type = layerType;
    div.dataset.visible = 'true';
    if (layerType === 'window' || layerType === 'door') {
        div.classList.add('layer-opening');
    }
    eyeDiv.classList.add('eye-div');
    layerDiv.classList.add('layer-content');
    options.classList.add('options-layer');

    layerDiv.textContent=name;
    const eyeVisibleSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="#8a8a8a">
            <path d="M607.5-372.5Q660-425 660-500t-52.5-127.5Q555-680 480-680t-127.5 52.5Q300-575 300-500t52.5 127.5Q405-320 480-320t127.5-52.5Zm-204-51Q372-455 372-500t31.5-76.5Q435-608 480-608t76.5 31.5Q588-545 588-500t-31.5 76.5Q525-392 480-392t-76.5-31.5ZM214-281.5Q94-363 40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200q-146 0-266-81.5ZM480-500Zm207.5 160.5Q782-399 832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280q113 0 207.5-59.5Z"/>
        </svg>
    `;
    const eyeHiddenSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" height="16px" viewBox="0 -960 960 960" width="16px" fill="#8a8a8a">
            <path d="m644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T660-500q0 20-4 37.5T644-428Zm128 126-58-56q38-29 67.5-63.5T832-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z"/>
        </svg>
    `;
    eyeDiv.innerHTML = eyeVisibleSvg;
    options.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="var(--color-text)">
            <path d="M480-160q-33 0-56.5-23.5T400-240q0-33 23.5-56.5T480-320q33 0 56.5 23.5T560-240q0 33-23.5 56.5T480-160Zm0-240q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm0-240q-33 0-56.5-23.5T400-720q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720q0 33-23.5 56.5T480-640Z"/>
        </svg>
    `;
    div.dataset.eyeVisibleSvg = eyeVisibleSvg;
    div.dataset.eyeHiddenSvg = eyeHiddenSvg;

    eyeDiv.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleLayerVisibility(div);
    });

    div.addEventListener('click', () => {
        if (div.dataset.type === 'room') {
            const room = document.getElementById(div.dataset.targetId);
            if (room && room.id !== activeRoomId) {
                setActiveRoom(room, { select: true });
                return;
            }
        }
        focusLayerRow(div);
    });

    options.addEventListener('click', (event) => {
        event.stopPropagation();
        popupMenu(menuOptions, options);
    });

    div.append(eyeDiv, layerDiv, options);

    if (currentBtnId ==='create-room-btn') {
        roomLayers.appendChild(div);
    } else if (currentBtnId ==='add-object-btn') {
        const firstOpening = [...objectLayers.querySelectorAll('.layer-div')]
            .findIndex((layer) => layer.classList.contains('layer-opening'));

        if (div.classList.contains('layer-opening')) {
            objectLayers.appendChild(div);
        } else {
            if (firstOpening === -1) {
                objectLayers.appendChild(div);
            } else {
                objectLayers.insertBefore(div, objectLayers.children[firstOpening]);
            }
        }
    }

    return div;
}


function getSize() {
    const alturaTexto = alto.value.trim();
    const anchuraTexto = ancho.value.trim();
    const nombreTexto = nombre.value.trim();

    if (nombreTexto ==='' || anchuraTexto === '' || alturaTexto==='') {
        alerta('Debes rellenar todos los campos');
        return;
    }


    const altura = Number(alto.value);
    const anchura = Number(ancho.value);
    objectName = nombre.value;

    if (
        !Number.isFinite(altura) ||
        !Number.isFinite(anchura) ||
        altura < 0 ||
        anchura < 0 ||
        altura > 1000 ||
        anchura > 1000
    ) {
        alerta('Debes ingresar números válidos de entre 0 y 1000');
        return;
    }
    
    const createdItem = createRoom(
        anchura,
        altura,
        btnAlMetric,
        btnAnMetric,
        objectName,
        currentBtnId,
    );
    guardarCambios(createdItem);
    if (createdItem?.dataset.type === 'room') {
        setActiveRoom(createdItem, { select: true });
    } else {
        const layer = document.querySelector(`.layer-div[data-target-id="${createdItem?.id}"]`);
        if (layer) selectLayer(layer);
    }
    alto.value='';
    ancho.value='';
    nombre.value='';
    togglePopup();
}

function alerta(text) {
    const campo=document.getElementById('message');
    campo.textContent = text;
    alertapopup.classList.remove('hidden');
}


function popupMenu(array, targetElement) {
    document.querySelector('.popup-menu-box')?.remove();
    
    const rect = targetElement.getBoundingClientRect();

    const box = document.createElement('div');
    box.classList.add('popup-menu-box');
    box.style.position='fixed';
    box.style.left=`${rect.left - 120}px`;
    box.style.top=`${rect.bottom + 4}px`;

        array.forEach((option, index) => {
        const op = document.createElement('button');
        op.classList.add('menu-popup-option-box');
        op.textContent=option.label;
        op.id=(`menu-popup-${index}`);
        op.dataset.action=option.action;

            op.addEventListener('click', ()=> {
            handleMenuAction(option.action, targetElement);
            box.remove();
        });
        box.appendChild(op);
    })

    document.body.appendChild(box);

    const menuRect = box.getBoundingClientRect();
    const margen =8;

    const left=Math.min(
        rect.right + margen,
        window.innerWidth - menuRect.width - margen
    );

    const espacioAbajo = window.innerHeight - rect.bottom;
    const espacioArriba =rect.top;

    const top = espacioAbajo >= menuRect.height || espacioAbajo >= espacioArriba
        ? rect.bottom + margen
        : rect.top - menuRect.height - margen;

    box.style.left =`${Math.max(margen, left)}px`;
    box.style.top=`${Math.max(margen, top)}px`;
}

function getLayerContext(targetElement) {
    const layerDiv = targetElement.closest('.layer-div');
    if (!layerDiv) return null;

    const sceneTarget = document.getElementById(layerDiv.dataset.targetId);
    return { layerDiv, sceneTarget };
}

function toggleLayerVisibility(targetElement) {
    const context = getLayerContext(targetElement);
    if (!context || !context.sceneTarget) return;

    if (context.sceneTarget.dataset.type === 'room') {
        if (context.sceneTarget.id !== activeRoomId) {
            setActiveRoom(context.sceneTarget, { select: true });
        }
        return;
    }

    const isVisible = context.layerDiv.dataset.visible !== 'false';
    const nextVisible = !isVisible;

    context.sceneTarget.style.display = nextVisible ? '' : 'none';
    context.layerDiv.classList.toggle('is-hidden', !nextVisible);
    context.layerDiv.dataset.visible = String(nextVisible);

    const eyeButton = context.layerDiv.querySelector('.eye-div');
    if (eyeButton) {
        eyeButton.innerHTML = nextVisible
            ? context.layerDiv.dataset.eyeVisibleSvg
            : context.layerDiv.dataset.eyeHiddenSvg;
    }
}

function renameLayer(targetElement) {
    const context = getLayerContext(targetElement);
    if (!context) return;

    const layerContent = context.layerDiv.querySelector('.layer-content');
    const currentName = layerContent.textContent.trim();
    const newName = window.prompt('Nuevo nombre de la capa', currentName);

    if (newName === null) return;

    const cleanName = newName.trim();
    if (!cleanName) return;

    layerContent.textContent = cleanName;
    if (context.sceneTarget) {
        const item = context.sceneTarget;
        setItemName(item, cleanName);
        guardarCambios(item);
        syncSizeManager();
        syncRoomSwitcher();
    }
}

function deleteLayer(targetElement) {
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
        if (selectedLayerId === sceneTarget.id) selectedLayerId = null;

        const wasActive = activeRoomId === sceneTarget.id;
        if (wasActive) activeRoomId = '';

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
    if (selectedLayerId === sceneTarget.id) selectedLayerId = null;
    clearOpeningOverlay();
    syncSizeManager();
    syncRotationHandle(getSelectedObject());
}

function selectVisibleObject(targetItem) {
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

    selectedLayerId = targetItem.id;
    syncRotationHandle(targetItem);
    syncSizeManager();
    if (isOpening(targetItem)) syncOpeningOverlay(targetItem);
    else clearOpeningOverlay();
}

function selectLayer(layerElement) {
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
    selectedLayerId = layerElement.dataset.targetId;
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

function scrollLayerIntoView(layerElement) {
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

function handleMenuAction(action, targetElement) {
    if (action === 'rename') {
        renameLayer(targetElement);
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
