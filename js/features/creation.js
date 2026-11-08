// Creacion de rooms, objetos y capas
import { alto, ancho, canvas, nombre, objectLayers, popup, roomLayers, scene } from '../core/dom.js';
import { getLayerContext, selectLayer, setLayerHoverPreview, toggleLayerVisibility } from './layers.js';
import { clampOpeningOffset, getActiveRoom, getParentInnerSize, getRooms, setItemName, snapOpeningOffset } from '../core/model.js';
import { placeOpening } from './openings.js';
import { applyBorderRadius, guardarCambios } from './persistence.js';
import { alerta, popupMenu } from './popups.js';
import { cloneRoomContents, focusLayerRow, setActiveRoom, syncObjectLayers } from './rooms.js';
import { applyRotation } from './rotation.js';
import { beginDraft, cancelDraft, isDrafting } from './draft.js';
import { setupLShape } from './l-shape.js';
import { setupSemicircle } from './semicircle.js';
import { createLayerShapeIcon, syncLayerShapeIcon } from './shape-preview.js';
import { focusSizeInputForEditing } from './size-manager.js';
import { OPENING_DEFAULT, OPENING_DEPTH, OPENING_MIN, getNextColor, metro, objectMenuOptions, roomMenuOptions, state, viewState } from '../core/state.js';
import { getRotation, smFromPx } from '../core/units.js';
import { sceneToLocal } from './view.js';

export let btnAlMetric = 'm';

export let btnAnMetric = 'm';

export let objectName='';

export let currentBtnId='';

export let roomSeq = 0;

// Contenido de la proxima room: 'copy' clona la room activa (muebles y
// aperturas), 'new' crea una room vacia con las mismas medidas sugeridas.
export let roomCreateMode = 'copy';

const roomModeButtons = document.querySelectorAll('#room-create-mode .segmented-btn');

roomModeButtons.forEach((button) => {
    button.addEventListener('click', () => {
        roomCreateMode = button.dataset.mode === 'new' ? 'new' : 'copy';
        roomModeButtons.forEach((item) => {
            item.classList.toggle('selected', item.dataset.mode === roomCreateMode);
        });
    });
});

export const alBotones = document.querySelectorAll('.al-popup-btn');

export const anBotones=document.querySelectorAll('.an-popup-btn');

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

// Menus de unidades del popup: el engranaje despliega m/cm y el badge del
// label muestra la unidad activa. Se cierran al elegir, al hacer clic fuera
// o con Escape, igual que en el panel de propiedades.
const popupUnitMenus = [];

function setupPopupUnitMenu(configId, menuId, unitLabelId, buttons, getMetric) {
    const config = document.getElementById(configId);
    const menu = document.getElementById(menuId);
    if (!config || !menu) return;

    const box = config.closest('.question-box');
    const label = document.getElementById(unitLabelId);
    const setOpen = (open) => {
        menu.classList.toggle('is-open', open);
        box?.classList.toggle('is-open', open);
        config.setAttribute('aria-expanded', String(open));
    };

    popupUnitMenus.push({ setOpen });

    config.addEventListener('click', (event) => {
        event.stopPropagation();
        setOpen(!menu.classList.contains('is-open'));
    });

    menu.addEventListener('click', (event) => {
        const button = event.target.closest('.sm-unit-btn');
        if (!button) return;
        setOpen(false);
        if (label) label.textContent = button.dataset.unit;
        buttons.forEach((item) => {
            item.classList.toggle('selected', item.dataset.unit === getMetric());
        });
    });

    document.addEventListener('pointerdown', (event) => {
        if (!menu.classList.contains('is-open')) return;
        if (box?.contains(event.target)) return;
        setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !menu.classList.contains('is-open')) return;
        // Escape cierra primero el menu; un segundo Escape cierra el popup.
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
        config.focus();
    });
}

function closePopupUnitMenus() {
    popupUnitMenus.forEach(({ setOpen }) => setOpen(false));
}

function syncPopupUnits() {
    const sync = (buttons, metric, labelId) => {
        buttons.forEach((button) => {
            button.classList.toggle('selected', button.dataset.unit === metric);
        });
        const label = document.getElementById(labelId);
        if (label) label.textContent = metric;
    };
    sync(alBotones, btnAlMetric, 'popup-altura-unit');
    sync(anBotones, btnAnMetric, 'popup-ancho-unit');
}

setupPopupUnitMenu('popup-altura-config', 'popup-altura-unit-menu', 'popup-altura-unit', alBotones, () => btnAlMetric);
setupPopupUnitMenu('popup-ancho-config', 'popup-ancho-unit-menu', 'popup-ancho-unit', anBotones, () => btnAnMetric);

export const cancelar = document.querySelector('.popup-btn-cancelar');

cancelar.addEventListener('click', togglePopup);

export const aceptar = document.querySelector('.popup-btn-aceptar');

aceptar.addEventListener('click', () => {
    getSize();
    
});

popup.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) {
        closePopupUnitMenus();
        popup.classList.add('hidden');
    }
})

export function openAddObjectPopup() {
    if (!getRooms().length) {
        alerta('Debe haber una habitación primero');
        return;
    }
    if (isDrafting()) cancelDraft();
    const popupAdd = document.getElementById('popupAddObject');
    if (!popupAdd) return;
    popupAdd.classList.remove('hidden');
    popupAdd.querySelector('.popup-add-object-window')?.focus({ preventScroll: true });
}

export function closeAddObjectPopup() {
    const popupAdd = document.getElementById('popupAddObject');
    if (!popupAdd) return;
    popupAdd.classList.add('hidden');
}

function createSelectedShape(key) {
    closeAddObjectPopup();
    if (key === '2') createCircleObject();
    else if (key === '3') createSemicircleObject();
    else if (key === '4') createLShapeObject();
    else createSquareObject();
}

function createShapeObject(options = {}) {
    const activeRoom = getActiveRoom() || getRooms()[0];
    if (!activeRoom) {
        alerta('Debe haber una habitación primero');
        return null;
    }

    const defaultSize = 1;
    const name = 'Objeto';
    currentBtnId = 'add-object-btn';
    const createdItem = createRoom(
        options.width ?? defaultSize,
        options.height ?? defaultSize,
        'm',
        'm',
        name,
        'add-object-btn',
        activeRoom,
    );
    if (!createdItem) return null;

    // El circulo es un cuadrado con radio relativo: al redimensionarlo sigue
    // siendo una elipse/circulo sin tener que recalcular pixeles.
    if (options.shape === 'l') {
        // Los brazos iniciales ocupan el 40% de la caja de 1m x 1m. Despues
        // se ajustan con los campos Grosor izq./inf. del sidebar.
        setupLShape(createdItem, { armX: metro * 0.4, armY: metro * 0.4 });
    } else if (options.shape === 'semicircle') {
        setupSemicircle(createdItem);
    } else if (options.borderRadius) {
        createdItem.style.borderRadius = options.borderRadius;
    }
    setItemName(createdItem, createdItem.dataset.name || name);
    syncLayerShapeIcon(createdItem);

    beginDraft(createdItem);
    const layer = document.querySelector(`.layer-div[data-target-id="${createdItem.id}"]`);
    if (layer) selectLayer(layer);

    focusSizeInputForEditing();

    return createdItem;
}

export function createSquareObject() {
    return createShapeObject();
}

export function createCircleObject() {
    // El rojo es solo del preview del modal: el objeto creado usa la paleta
    // como cualquier otro mueble.
    return createShapeObject({ borderRadius: '100%' });
}

export function createSemicircleObject() {
    return createShapeObject({ shape: 'semicircle', width: 1, height: 0.5 });
}

export function createLShapeObject() {
    return createShapeObject({ shape: 'l' });
}

document.getElementById('add-object-btn').addEventListener('click', () => {
    openAddObjectPopup();
});

const popupAdd = document.getElementById('popupAddObject');

popupAdd?.querySelectorAll('.popup-add-object-item').forEach((button) => {
    button.addEventListener('click', () => createSelectedShape(button.dataset.key));
});

popupAdd?.addEventListener('click', (event) => {
    if (event.target === popupAdd) {
        closeAddObjectPopup();
    }
});

document.addEventListener('keydown', (event) => {
    if (!popupAdd || popupAdd.classList.contains('hidden')) return;

    if (event.key === 'Escape') {
        event.preventDefault();
        closeAddObjectPopup();
        return;
    }

    if (event.key === 'Enter' && !event.repeat) {
        event.preventDefault();
        return;
    }

    if ((event.key === '1' || event.key === '2' || event.key === '3') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        createSelectedShape(event.key);
    }
});

document.getElementById('create-room-btn').addEventListener('click', () => {
    // La nueva room hereda de la room activa (en la que se está trabajando),
    // no de la última que se haya creado.
    if (isDrafting()) cancelDraft();
    const baseRoom = getActiveRoom();
    togglePopup();
    nombre.value = '';
    alto.value = baseRoom ? smFromPx(parseFloat(baseRoom.style.height) || 0, 'm').toFixed(2) : '';
    ancho.value = baseRoom ? smFromPx(parseFloat(baseRoom.style.width) || 0, 'm').toFixed(2) : '';
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

export function togglePopup() {
    const willOpen = popup.classList.contains('hidden');
    closePopupUnitMenus();
    popup.classList.toggle('hidden');
    if (willOpen) syncPopupUnits();
}

export function createRoom(ancho, alto, almedida, anmedida, name, currentBtnId, parentRoom, inheritContents = true) {
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
    room.dataset.edges = '';
    room.dataset.name = name;
    room.dataset.rotation = '0';

    let targetId = '';
    let roomOwnerId = '';

    if (currentBtnId ==='create-room-btn') {
        const baseRoom = getActiveRoom();
        roomSeq += 1;
        room.id=`room${roomSeq}`;
        targetId = room.id;
        roomOwnerId = room.id;
        room.dataset.roomId = room.id;
        room.dataset.type = 'room';
        room.classList.add('room', 'object');
        room.style.backgroundColor = 'var(--color-room)';
        room.style.borderColor = nextColor;
        scene.appendChild(room);

        if (inheritContents && baseRoom) {
            if (baseRoom.style.borderRadius) room.style.borderRadius = baseRoom.style.borderRadius;
            applyRotation(room, getRotation(baseRoom));
            cloneRoomContents(baseRoom, room);
        }
    } else if (currentBtnId ==='add-object-btn') {
        state.Fcounter+=1;
        room.id=`furniture${state.Fcounter}`;
        targetId = room.id;
        room.classList.add('furniture', 'object');
        room.style.backgroundColor = nextColor;
        const createdRoom = parentRoom || getActiveRoom() || scene.querySelector('.room');
        if (!createdRoom) return null;
        roomOwnerId = createdRoom.id;
        room.dataset.roomId = createdRoom.id;
        room.dataset.type = 'furniture';
        // Centrar en el viewport: convertir el centro visible del canvas a
        // coordenadas de escena y luego a coordenadas locales de la room (respeta
        // la rotación/posición de la room). Se compensa la rotación heredada para
        // que el mueble nuevo quede orientado como la pantalla.
        const scale = viewState.scale || 1;
        const viewportCenterScene = {
            x: (viewState.scrollX + (canvas.clientWidth || 0) / 2) / scale,
            y: (viewState.scrollY + (canvas.clientHeight || 0) / 2) / scale,
        };
        const localCenter = sceneToLocal(createdRoom, viewportCenterScene);
        room.style.left = `${localCenter.x}px`;
        room.style.top = `${localCenter.y}px`;
        createdRoom.appendChild(room);
        applyRotation(room, -getRotation(createdRoom));
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

export function addOpeningFromRoom(type, targetElement) {
    const context = getLayerContext(targetElement);
    if (!context || context.sceneTarget?.dataset.type !== 'room') return;

    const room = context.sceneTarget;
    if (room.id !== state.activeRoomId) setActiveRoom(room);
    const width = OPENING_DEFAULT[type];
    const item = document.createElement('div');
    const roomWidth = getParentInnerSize(room).width;
    const name = type === 'window' ? 'Ventana' : 'Puerta';

    item.id = `${type}${++state.openingCounter}`;
    item.classList.add('opening', type, 'object');
    item.dataset.type = type;
    item.dataset.name = name;
    item.dataset.roomId = room.id;
    item.dataset.edge = 'top';
    item.dataset.direction = 'in';
    item.dataset.axis = 'sup';
    item.dataset.offset = String(snapOpeningOffset((roomWidth - width) / 2, roomWidth));
    item.dataset.openingWidth = String(width);
    room.appendChild(item);
    item.dataset.offset = String(clampOpeningOffset(item, Number(item.dataset.offset), width));
    placeOpening(item);
    createLayer(width, OPENING_DEPTH, 'm', 'm', name, 'add-object-btn', item.id, room.id, objectMenuOptions, type);
    guardarCambios(item);
    const layer = document.querySelector(`.layer-div[data-target-id="${item.id}"]`);
    if (layer) selectLayer(layer);
}

export function rebuildOpening(elemento, parentRoom) {
    const room = parentRoom || document.getElementById(elemento.roomId) || scene.querySelector('.room');
    if (!room) return null;

    const item = document.createElement('div');
    const type = elemento.type;
    const width = Number.isFinite(elemento.ancho) ? elemento.ancho * metro : OPENING_DEFAULT[type];
    const numericId = Number.parseInt(String(elemento.id).replace(/\D/g, ''), 10);
    if (Number.isFinite(numericId)) state.openingCounter = Math.max(state.openingCounter, numericId);

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
    applyBorderRadius(item, elemento.borderRadius);
    return item;
}

export function createLayer(
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
    const shapeIcon = createLayerShapeIcon(document.getElementById(targetId));
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

    const isRoomLayer = layerType === 'room';

    layerDiv.textContent=name;
    if (shapeIcon) div.appendChild(shapeIcon);
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

    div.addEventListener('pointerenter', () => setLayerHoverPreview(div, true));
    div.addEventListener('pointerleave', () => setLayerHoverPreview(div, false));

    div.addEventListener('click', () => {
        if (div.dataset.type === 'room') {
            const room = document.getElementById(div.dataset.targetId);
            if (room && room.id !== state.activeRoomId) {
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

    if (isRoomLayer) {
        // Las rooms no tienen ojo: solo los objetos se pueden ocultar.
        div.append(layerDiv, options);
    } else {
        div.append(eyeDiv, layerDiv, options);
    }

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

    syncObjectLayers();

    return div;
}

export function getSize() {
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
        undefined,
        currentBtnId === 'create-room-btn' ? roomCreateMode === 'copy' : true,
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
