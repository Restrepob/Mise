// El contenedor conserva la caja completa para que el selector y el handle de
// giro puedan sobresalir; solo el relleno interior adopta la silueta circular.
export function ensureSemicircleFill(item) {
    if (!item) return null;
    let fill = item.querySelector(':scope > .semicircle-fill');
    if (!fill) {
        fill = document.createElement('div');
        fill.className = 'semicircle-fill';
        item.prepend(fill);
    }
    return fill;
}

export function getSemicircleFillColor(item) {
    return item?.querySelector(':scope > .semicircle-fill')?.style.backgroundColor || '';
}

export function setupSemicircle(item, color = '') {
    if (!item) return null;
    item.dataset.shape = 'semicircle';
    item.classList.add('semicircle');
    const fill = ensureSemicircleFill(item);
    const fillColor = color || item.style.backgroundColor;
    if (fillColor && fillColor !== 'transparent') fill.style.backgroundColor = fillColor;
    item.style.backgroundColor = 'transparent';
    item.style.borderRadius = '';
    return item;
}
