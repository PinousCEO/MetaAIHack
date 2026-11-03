'use strict';
// One vector vocabulary across navigation, module bodies and inspector.
(() => {
 const paths={
 graph:'M12 5v5m0 0-7 7m7-7 7 7M9 3a3 3 0 1 0 6 0 3 3 0 1 0-6 0M2 20a3 3 0 1 0 6 0 3 3 0 1 0-6 0m14 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
 bulb:'M8 17c0-4-4-4-4-9a8 8 0 0 1 16 0c0 5-4 5-4 9H8m1 4h6M9 5a4 4 0 0 1 6 2',
 split:'M5 3v5c0 4 14 4 14 8v5M19 3v5c0 4-14 4-14 8v5M2 3h6m8 0h6M2 21h6m8 0h6',
 layers:'m12 2 10 6-10 6L2 8 12 2M2 12l10 6 10-6M2 17l10 6 10-6',
 image:'M3 3h18v18H3V3m0 14 5-5 4 4 3-3 6 6M8 7h.01',
 check:'M3 3h18v18H3V3m4 9 3 3 7-7',
 folder:'M2 6V3h7l3 3h10v15H2V6Zm0 3h20',
 file:'M5 2h9l5 5v15H5V2m9 0v6h5M8 12h8M8 16h8',
 search:'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16m6 14 6 6',
 chevron:'m6 9 6 6 6-6',
 refresh:'M20 8a9 9 0 1 0 0 8M20 2v6h-6',
 state:'M3 5c0-5 18-5 18 0s-18 5-18 0v14c0 5 18 5 18 0V5M3 12c0 5 18 5 18 0',
 logic:'m10 2-1 3-3 1-3-1-2 4 2 3-1 3-2 2 3 4 3-1 3 1 1 3h5l1-3 3-1 3 1 2-4-2-3 1-3 2-2-3-4-3 1-3-1-1-3h-5M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
 view:'M2 3h20v14H2V3m10 14v5m-5 0h10',
 fit:'M3 9V3h6m6 0h6v6m0 6v6h-6m-6 0H3v-6',
 panel:'M2 3h20v18H2V3m14 0v18',
 code:'m8 5-7 7 7 7m8-14 7 7-7 7M14 2l-4 20',
 motion:'M3 6h14M1 12h9M3 18h14M17 8l5 4-5 4',
 arrow:'M3 12h18m-6-6 6 6-6 6'
 };
 // All paths, including strokes, fit inside this padded coordinate space.
 paths.logic='M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3M8 12a4 4 0 1 0 8 0 4 4 0 1 0-8 0';
 paths.sun='M12 7a5 5 0 1 0 0 10 5 5 0 1 0 0-10M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2';
 paths.moon='M20 16A9 9 0 0 1 8 4a9 9 0 1 0 12 12Z';
 const icon=name=>'<svg class="icon-svg" viewBox="-2 -2 28 28" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(paths[name]||paths.file)+'"/></svg>';
 window.DepthIcons={icon,hydrate:(root=document)=>root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon))};
 window.DepthIcons.hydrate();
})();
