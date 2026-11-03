// Punto de entrada: carga los modulos y arranca la app
import './core/dom.js';
import './core/state.js';
import './core/units.js';
import './core/model.js';
import './features/snapping.js';
import './features/popups.js';
import './features/creation.js';
import './features/draft.js';
import './features/size-manager.js';
import './features/shortcuts.js';
import './features/nudge.js';
import './features/tooltips.js';
import './features/rooms.js';
import './features/view.js';
import './features/sidebar-layout.js';
import './features/drag.js';
import './features/measure.js';
import './features/rotation.js';
import './features/door.js';
import './features/openings.js';
import './features/layers.js';
import './features/export-plan.js';
import './features/history.js';
import { hidratar } from './features/persistence.js';

document.addEventListener('DOMContentLoaded', () => {
    hidratar();
})
