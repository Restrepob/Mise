// Consejo fijo y compacto en la sidebar; al pasar el cursor rota otros gestos.
import { selectionGestureHint, selectionGestureHintText } from '../core/dom.js';

const defaultHint = 'Alt + clic izq./der.: gira 90°';
let startTimer = null;
let carouselTimer = null;
let hintIndex = 0;
let activeHint = '';
let gestureHints = [];
let isHovered = false;

function clearCarouselTimers() {
    if (startTimer) clearTimeout(startTimer);
    if (carouselTimer) clearInterval(carouselTimer);
    startTimer = null;
    carouselTimer = null;
    hintIndex = 0;
}

function startCarousel() {
    clearCarouselTimers();
    selectionGestureHintText.textContent = activeHint;
    if (!isHovered || !gestureHints.length) return;

    startTimer = setTimeout(() => {
        startTimer = null;
        hintIndex = 0;
        selectionGestureHintText.textContent = gestureHints[hintIndex];
        carouselTimer = setInterval(() => {
            hintIndex = (hintIndex + 1) % gestureHints.length;
            selectionGestureHintText.textContent = gestureHints[hintIndex];
        }, 2200);
    }, 550);
}

export function syncGestureHint(item, groupSelected = false) {
    gestureHints = [];
    if (!item) {
        activeHint = '';
    } else if (item.classList.contains('opening')) {
        activeHint = 'Arrastra para mover sobre la pared';
        gestureHints = ['Arrastra el icono numérico para cambiar el ancho'];
    } else if (groupSelected) {
        activeHint = 'Alt + clic: gira el grupo 90°';
        gestureHints = [
            'Ctrl/Cmd + clic: añade o quita objetos',
            'Alt + clic dentro del cuadro: gira el grupo',
            'Shift + R: gira el grupo 90°',
            'Arrastra el control: giro libre',
            'Shift al arrastrar: mover sin snap',
            'Arrastra el icono numérico: cambia la medida',
        ];
    } else {
        activeHint = defaultHint;
        gestureHints = [
            ...(item.classList.contains('furniture') ? ['Ctrl/Cmd + clic: selecciona varios objetos'] : []),
            'Arrastra el control: giro libre',
            ...(item.classList.contains('furniture') ? ['Shift al arrastrar: mover sin snap'] : []),
            'Arrastra el icono numérico: cambia la medida',
        ];
    }
    startCarousel();
}

selectionGestureHint.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'touch') return;
    isHovered = true;
    startCarousel();
});

selectionGestureHint.addEventListener('pointerleave', () => {
    isHovered = false;
    startCarousel();
});
