# Mise — memoria del proyecto

Mise es un planificador de interiores en el navegador: rooms, muebles, puertas y
ventanas sobre un lienzo infinito con zoom, snap, medidas y persistencia local.
No hay build step ni dependencias de runtime: se abre `index.html` con un
servidor estático.

## Arquitectura

```
index.html          Estructura del lienzo, dock inferior y sidebar.
css/
  layout.css        Tokens de diseño (color, spacing, radius, tipografía) y layout.
  sidebar.css       Panel lateral: rooms, propiedades y capas.
  popup.css         Modales, alertas y popup de creación de formas.
  objects.css       Objetos, aperturas, handles y cotas en el lienzo.
js/
  main.js           Punto de entrada: importa módulos y llama a hidratar().
  core/
    dom.js          Referencias cacheadas al DOM (una sola fuente de ids).
    state.js        Constantes de dominio, estado mutable compartido y paleta.
    model.js        Helpers de items: rooms, aperturas, tamaño, nombres, offsets.
    units.js        Conversión de unidades, rotación y geometría básica.
  features/
    creation.js     Crear rooms/muebles/capas y popup de creación.
    draft.js        Borrador de creación (existe en escena, aún no se guarda).
    l-shape.js      Forma L: brazos, clip-path, color y medidas propias.
    size-manager.js Panel de propiedades: nombre, medidas, radio, rotación.
    rotation.js     Handle de rotación y rotación por clic/teclado.
    drag.js         Arrastre, autoscroll, pan, pinch-zoom y menú contextual.
    snapping.js     Snap a grid, paredes y otros objetos; guías visuales.
    view.js         Zoom, scroll virtual y transformaciones scene/parent.
    measure.js      Herramienta de medición de distancias y áreas.
    openings.js     Colocación de puertas/ventanas sobre paredes.
    door.js         Propiedades de puertas, edges, tolerancias y overlay.
    rooms.js        Switcher de rooms, duplicado y clonado de contenido.
    layers.js       Selección, visibilidad, renombrar y eliminar capas.
    popups.js       Alertas y menús contextuales.
    persistence.js  localStorage, snapshots de items y rebuild de escena.
    history.js      Undo/redo por snapshots con debounce.
    shortcuts.js    Atajos globales y herramientas activas.
    nudge.js        Movimiento fino del objeto seleccionado con flechas.
    sidebar-layout.js Resizers, alturas persistidas y paneles colapsables.
    tooltips.js     Tooltips flotantes basados en `data-tooltip`.
    export-plan.js  Exportación del plano a JSON/texto.
```

La app no usa framework: cada feature exporta funciones y se comunica con las
demás por imports. El estado mutable pequeño vive en `core/state.js`; el DOM se
consulta por id/clase o mediante `core/dom.js`.

## Tecnologías y ejecución

- HTML, CSS y JavaScript moderno (ES modules). Sin bundler, sin TypeScript.
- Tipografía Inter (Google Fonts).
- Persistencia en `localStorage` (`mise`, `mise-active`, `mise-sidebar-sizes`,
  `mise-sidebar-collapsed`, `mise-unit-system`).
- Para desarrollo: `python3 -m http.server` y abrir `http://localhost:8000`.
  Abrir con `file://` puede fallar por la carga de módulos ES.

## Modelo y decisiones técnicas

- **Unidad interna:** todo el plano se mide en píxeles de escena con
  `metro = 150` px. Las unidades visibles se convierten en `core/units.js`
  (`m`, `cm`, `in`, `ft`).
- **Posicionamiento:** cada item es `position:absolute` con `left/top` en el
  centro y `transform: translate(-50%, -50%)`; la rotación se acumula en el
  `transform`. Los hijos se posicionan en coordenadas locales del padre, no de
  pantalla.
- **Rooms:** usan `box-sizing: content-box` para que el interior mida
  exactamente ancho × alto; los muebles usan `border-box`.
- **Aperturas:** viven sobre una pared con `dataset.edge` y `dataset.offset`
  (distancia al inicio de la pared). `placeOpening()` es la única función que
  debe recalcular su geometría.
- **Forma L:** la caja total sigue siendo ancho × alto; los brazos se guardan en
  `dataset.armX`/`dataset.armY` (px de escena) y el contorno se dibuja con un
  `clip-path` sobre el hijo `.l-shape-fill`. La selección, el handle de rotación,
  el nombre y las cotas viven en la caja exterior. El radio no aplica a la L.
- **Borrador:** un objeto creado desde el popup existe en la escena con
  `dataset.draft="true"` pero no se guarda ni entra al historial hasta fijar
  alto, ancho y nombre (o hacer clic afuera).
- **Historial:** snapshots completos con debounce (`HISTORY_COMMIT_DELAY`);
  la vista (zoom/scroll) no entra al historial.
- **Snap:** X e Y se resuelven por separado. Paredes/bordes/centros mandan
  sobre la grid; `Shift` durante el arrastre desactiva el imán.
- **Rotación del padre:** los desplazamientos de pantalla se convierten a
  coordenadas locales con `sceneDeltaToLocal()` para que el arrastre siga
  funcionando con rooms rotadas.
- **Sidebar:** tres paneles redimensionables (Rooms, Propiedades, Objetos).
  Las alturas se guardan como proporciones en `localStorage`. Los paneles se
  pueden colapsar y el estado se recuerda.

## Convenciones

- Comentarios y textos de UI en español; identificadores de código en inglés o
  español consistente con el módulo.
- Preferir exports con nombre; evitar estado global nuevo si puede vivir en el
  módulo.
- Los ids del sidebar usan prefijo `sm-`; los de creación/popup usan `popup-`.
- Los atributos de dominio van en `dataset` (`type`, `roomId`, `rotation`,
  `edge`, `offset`, `openingWidth`, `edges`, `tolerance`, `draft`, `shape`,
  `armX`, `armY`).
- Toda modificación persistente termina en `guardarCambios(item)`.
- No tocar la geometría de aperturas fuera de `placeOpening()`.
- Los inputs numéricos del sidebar actualizan el objeto en vivo, no al blur.
- Para nuevas acciones destructivas o de creación, actualizar también el
  historial y la persistencia.

## Estado actual

Implementado y estable:

- Creación de rooms y objetos (cuadrado/círculo/forma L), borrador con medidas.
- Rooms: switcher, duplicado, contenido clonado, capas y visibilidad.
- Muebles: arrastre con snap, rotación libre/90°, medidas, radio, nombre,
  edges, tolerancia y duplicado.
- Forma L: brazos editables (grosor izq./inf.), unidades, persistencia,
  duplicado, rotación y exportación.
- Puertas/ventanas: colocación en paredes, dirección, eje y ancho.
- Medición de distancia/área, zoom, pan, pinch y espacio virtual infinito.
- Undo/redo, persistencia y rebuild de escena.
- Sidebar redimensionable, colapsable, con sliders, unidades m/cm/in/ft,
  sistema métrico/imperial y renombrado desde el panel.
- Movimiento fino con flechas (1 px de escena; `Shift` = 10 px).

Pendiente / backlog (no implementado todavía):

- Selección múltiple con `Ctrl/Cmd` en escena y capas, y objeto de grupo
  imaginario con rotación propia.
- Ajuste editable de distancias de un mueble a las cuatro paredes desde el
  sidebar (más allá de la tolerancia visual actual).
- Panel/overlay de atajos estilo Linear y flujo 100 % teclado.
- Adaptación específica a macOS (menús, gestos) y a Android/touch (targets,
  layout tipo bottom sheet).
- Renombrar capas sin popup nativo del navegador (ya se hace desde el sidebar;
  revisar cualquier flujo antiguo restante).
- Exportación/importación de plan más allá del export actual.

## Problemas conocidos

- `localStorage` es la única fuente de verdad; no hay migraciones de esquema.
- Los ids de rooms/muebles se generan con contadores en memoria (`roomSeq`,
  `Fcounter`, `openingCounter`) y se reconstruyen al hidratar; no deben
  asumirse entre sesiones.
- En rooms rotadas, algunas guías y overlays dependen de conversiones
  scene/local; cambios en `view.js` pueden afectar snap, drag y medidas.
- El sidebar y el lienzo comparten muchos ids/clases; renombrar un id exige
  revisar `core/dom.js`, `size-manager.js` y `door.js`.
- El modo imperial es decimal (`ft`), no pies+pulgadas combinados.
- No hay tests automatizados; validar manualmente creación, arrastre,
  rotación, undo/redo y recarga.

## Cómo trabajar en este repo

1. Mantener este archivo como memoria estable, no como diario de cambios.
2. Al agregar una feature: crear/editar su módulo en `features/`, importarlo en
   `main.js` y documentar aquí solo si cambia la arquitectura o una decisión.
3. Probar con `python3 -m http.server` en escritorio y, si aplica, con
   emulación táctil (DevTools) para no romper pointer events.
