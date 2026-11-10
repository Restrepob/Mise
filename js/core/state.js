// Constantes y estado compartido
export const metro=150;

export const SCENE_PADDING = 1000;

// Paso de referencia de la grid: 10 cm. Cada habitación lo ajusta para que
// las líneas coincidan exactamente con sus dos paredes (ver getGridStep).
export const GRID_STEP = metro / 10;

// Tolerancia del imán en píxeles de pantalla. Al convertirla a escena, el snap
// conserva la misma distancia visual con cualquier zoom o tamaño de room.
export const SNAP_SENS = 12;

// La grid es más fina que las paredes/objetos: solo atrapa cuando el borde
// está realmente cerca de una línea. Así una habitación grande no se siente
// como si todo estuviera pegado a una cuadrícula invisible.
export const SNAP_GRID_SENS = 6;

export const AUTO_SCROLL_EDGE = 48;

export const AUTO_SCROLL_SPEED = 12;

// Si el puntero deja de moverse, el autoscroll se detiene. Si no, un clic
// cerca del borde hacía que el plano siguiera desplazándose solo.
export const AUTO_SCROLL_IDLE = 150;

export const OPENING_DEPTH = 10;

export const OPENING_MIN = metro / 10;

export const OPENING_DEFAULT = {
    window: 0.96 * metro,
    door: 0.76 * metro,
};

export const EDGE_SIDES = ['top', 'right', 'bottom', 'left'];

export const TOLERANCE_SIDES = ['top', 'right', 'bottom', 'left'];

export const TOLERANCE_MAX_M = 5;

export const MEASURE_NS = 'http://www.w3.org/2000/svg';

export const MEASURE_CLOSE_RADIUS = 12;

export const MEASURE_POINT_HIT_RADIUS = 10;

export const MEASURE_MIN_STEP = 4;

export const roomViews = {};

export const toolState = {
    active: 'select',
    pan: null,
    dragObject: null,
    rotateDrag: null,
};

export const measureState = {
    points: [],
    closed: false,
    drag: null,
};

export const viewState = {
    scale: 1,
    // Desplazamiento en píxeles de pantalla. No está limitado por el tamaño
    // del navegador: define un espacio virtual infinito.
    scrollX: 0,
    scrollY: 0,
    minScale: 0.5,
    baseMinScale: 0.5,
    maxScale: 2.5,
    activePointers: new Map(),
    pinchDistance: null,
};

export const colorPalette = [
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

export let colorIndex = 0;

export function getNextColor() {
    const color = colorPalette[colorIndex % colorPalette.length];
    colorIndex += 1;
    return color;
}

export const objectMenuOptions=[
    {label:'Renombrar', action:'rename', shortcut:'F2'},
    {label:'Duplicar', action:'duplicate', shortcut:'Ctrl/⌘ + D'},
    {label:'Girar a la derecha', action:'rotate-right', shortcut:'Alt + clic der.'},
    {label:'Girar a la izquierda', action:'rotate-left', shortcut:'Alt + clic izq.'},
    {label:'Ocultar', action:'hide', shortcut:'Ctrl/⌘ + Shift + H'},
    {label:'Bloquear', action:'lock', shortcut:'Ctrl/⌘ + Shift + L'},
    {label:'Eliminar', action:'delete', shortcut:'Del'}
];

export const roomMenuOptions=[
    ...objectMenuOptions
        .filter((option) => !['lock', 'rotate-right', 'rotate-left'].includes(option.action))
        .map(({ shortcut, ...option }) => option),
    {label:'Añadir ventana', action:'add-window'},
    {label:'Añadir puerta', action:'add-door'},
];

export const HISTORY_LIMIT = 50;

export const HISTORY_COMMIT_DELAY = 350;

// Valores mutables que se comparten entre modulos.
export const state = {
    roomSelected: '',
    Fcounter: 0,
    openingCounter: 0,
    activeRoomId: '',
    selectedLayerId: null,
    selectedObjectIds: [],
    historySuspended: false,
};
