// _toolbar.js — Sidebar tool picker + header bar for the AnnotateImage widget.
//
// Layout:
//
//   sidebar (vertical, left column)
//     NAV group:  select | hand | zoom
//     ── divider ──
//     DRAW group: paint | text | arrow | rect | ellipse
//
//   headerBar (horizontal bar above the canvas)
//     ┌─────────────────────────────────────────────────────────────┐
//     │ [settingsArea · · · left]  [objectActionsEl]  [viewControls ▶] │
//     └──────────────────────────────────────────────────────────────────┘
//     settingsArea    — per-tool / per-annotation settings, populated by _settings.js
//     objectActionsEl — object editing actions (group, layers, delete, …), populated by _object_actions.js
//     viewControls    — fit-to-canvas button + expand-to-modal button (owned here)
//
// createToolbar(deps) →
//   { sidebar, headerBar, settingsArea, objectActionsEl, toolBtns,
//     setActiveTool, setResetViewEnabled, updateExpandIcon }

import { mkIcon } from './_icons.js';

export const NAV_TOOLS = [
  { id: "select",  title: "Select & Move  [V]" },
  { id: "hand",    title: "Pan  [H]" },
  { id: "zoom",    title: "Zoom  [Z]" },
];

export const DRAW_TOOLS = [
  { id: "paint",   title: "Draw  [D]" },
  { id: "text",    title: "Text  [T]" },
  { id: "arrow",   title: "Arrow  [L]" },
  { id: "rect",    title: "Rectangle  [R]" },
  { id: "ellipse", title: "Ellipse  [O]" },
];

export function createToolbar({ addTooltip, activeTool, onToolChange, onResetView, onToggleModal }) {

  // ── Sidebar ────────────────────────────────────────────────────────────────

  const sidebar = document.createElement("div");
  sidebar.style.cssText =
    "display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 5px;" +
    "background:var(--card);border-right:1px solid var(--border);flex-shrink:0;";

  const toolBtns = {};

  function _mkToolBtn(t) {
    const btn = document.createElement("button");
    btn.className = "ais-tool-btn" + (t.id === activeTool ? " active" : "");
    addTooltip(btn, t.title);
    btn.appendChild(mkIcon(t.id));
    btn.addEventListener("pointerdown", (e) => { e.stopPropagation(); onToolChange(t.id); btn.blur(); });
    sidebar.appendChild(btn);
    toolBtns[t.id] = btn;
  }

  for (const t of NAV_TOOLS) _mkToolBtn(t);

  const sideDiv = document.createElement("div");
  sideDiv.style.cssText = "width:20px;height:1px;background:var(--border);margin:2px 0;flex-shrink:0;";
  sidebar.appendChild(sideDiv);

  for (const t of DRAW_TOOLS) _mkToolBtn(t);

  // ── Header bar ─────────────────────────────────────────────────────────────

  const headerBar = document.createElement("div");
  headerBar.style.cssText =
    "display:flex;align-items:center;" +
    "padding:4px 8px;background:var(--card);" +
    "border-bottom:1px solid var(--border);flex-shrink:0;min-height:38px;";

  // Left section: tool / annotation settings — content managed by _settings.js
  const settingsArea = document.createElement("div");
  settingsArea.style.cssText =
    "display:flex;align-items:center;gap:6px;flex:1;min-width:0;overflow:hidden;";
  headerBar.appendChild(settingsArea);

  // Right section (inner-left): object actions (group, layers, delete, reset)
  // — content managed by _object_actions.js; hidden when nothing is selected
  const objectActionsEl = document.createElement("div");
  objectActionsEl.className = "ais-hud";
  objectActionsEl.style.cssText = "display:none;align-items:center;gap:2px;flex-shrink:0;margin-right:4px;";
  headerBar.appendChild(objectActionsEl);

  // Right section (inner-right): view controls (fit-to-canvas, expand to modal)
  const viewControls = document.createElement("div");
  viewControls.style.cssText = "display:flex;align-items:center;gap:2px;flex-shrink:0;";

  const resetViewBtn = document.createElement("button");
  resetViewBtn.className = "ais-tool-btn";
  addTooltip(resetViewBtn, "Fit canvas to window  [F]");
  resetViewBtn.style.opacity = "0.4";
  resetViewBtn.style.pointerEvents = "none";
  resetViewBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3"/>
    <path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
    <path d="M3 16v3a2 2 0 0 0 2 2h3"/>
    <path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
  </svg>`;
  resetViewBtn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    onResetView();
    resetViewBtn.blur();
  });
  viewControls.appendChild(resetViewBtn);

  const fsDivider = document.createElement("div");
  fsDivider.style.cssText = "width:1px;height:20px;background:var(--border);margin:0 4px;flex-shrink:0;";
  viewControls.appendChild(fsDivider);

  const expandBtn = document.createElement("button");
  expandBtn.className = "ais-tool-btn";
  addTooltip(expandBtn, "Expand to modal");
  expandBtn.appendChild(mkIcon("expand", 15));
  expandBtn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    onToggleModal();
    expandBtn.blur();
  });
  viewControls.appendChild(expandBtn);

  headerBar.appendChild(viewControls);

  // ── Toolbar API ────────────────────────────────────────────────────────────

  function setActiveTool(id) {
    for (const [tid, btn] of Object.entries(toolBtns)) {
      btn.className = "ais-tool-btn" + (tid === id ? " active" : "");
    }
  }

  function setResetViewEnabled(enabled) {
    resetViewBtn.style.opacity = enabled ? "1" : "0.4";
    resetViewBtn.style.pointerEvents = enabled ? "auto" : "none";
  }

  function updateExpandIcon(isExpanded) {
    expandBtn.innerHTML = "";
    expandBtn.appendChild(mkIcon(isExpanded ? "contract" : "expand", 15));
  }

  return { sidebar, headerBar, settingsArea, objectActionsEl, toolBtns, setActiveTool, setResetViewEnabled, updateExpandIcon };
}
