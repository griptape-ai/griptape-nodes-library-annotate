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
import { createRectShapePicker, createStampPicker } from './_picker.js';

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
  { id: "stamp",   title: "Stamp  [M]"  },
];

export function createToolbar({ addTooltip, activeTool, onToolChange, onResetView, onToggleModal, getToolSettings }) {

  // ── Sidebar ────────────────────────────────────────────────────────────────

  const sidebar = document.createElement("div");
  sidebar.style.cssText =
    "display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px 5px;" +
    "background:var(--card);border-right:1px solid var(--border);flex-shrink:0;";

  const toolBtns = {};
  let rectPicker  = null;
  let stampPicker = null;

  function _mkToolBtn(t) {
    const btn = document.createElement("button");
    btn.className = "ais-tool-btn" + (t.id === activeTool ? " active" : "");
    addTooltip(btn, t.title);
    btn.appendChild(mkIcon(t.id));
    btn.addEventListener("pointerdown", (e) => { e.stopPropagation(); onToolChange(t.id); btn.blur(); });
    sidebar.appendChild(btn);
    toolBtns[t.id] = btn;
  }

  // Stamp buttons use a dynamic icon and long-press to open picker.
  function _mkPickerBtn(t, iconPrefix, getActiveId, pickerFactory, onPick) {
    const btn = document.createElement("button");
    btn.className = "ais-tool-btn" + (t.id === activeTool ? " active" : "");
    btn.style.cssText += "position:relative;";
    addTooltip(btn, t.title + " — long-press to change");

    function _refreshIcon() {
      btn.innerHTML = "";
      const iconId = iconPrefix + getActiveId();
      btn.appendChild(mkIcon(iconId, 15));
      // Small chevron indicator in bottom-right corner
      const chev = document.createElement("span");
      chev.style.cssText =
        "position:absolute;bottom:2px;right:2px;line-height:1;opacity:0.5;pointer-events:none;font-size:6px;";
      chev.textContent = "▾";
      btn.appendChild(chev);
    }
    _refreshIcon();

    let longPressTimer = null;
    let didLongPress = false;

    btn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      didLongPress = false;
      longPressTimer = setTimeout(() => {
        didLongPress = true;
        const picker = pickerFactory(btn, {
          onSelect: (id) => {
            onPick(id);
            _refreshIcon();
          },
          getActive: getActiveId,
        });
        if (t.id === "rect") { rectPicker?.destroy(); rectPicker = picker; }
        else                 { stampPicker?.destroy(); stampPicker = picker; }
        picker.open();
      }, 400);
    });

    btn.addEventListener("pointerup", (e) => {
      clearTimeout(longPressTimer);
      if (!didLongPress) { onToolChange(t.id); btn.blur(); }
    });

    btn.addEventListener("pointerleave", () => { clearTimeout(longPressTimer); });

    sidebar.appendChild(btn);
    toolBtns[t.id] = btn;

    return { refreshIcon: _refreshIcon };
  }

  for (const t of NAV_TOOLS) _mkToolBtn(t);

  const sideDiv = document.createElement("div");
  sideDiv.style.cssText = "width:20px;height:1px;background:var(--border);margin:2px 0;flex-shrink:0;";
  sidebar.appendChild(sideDiv);

  const pickerBtns = {};
  for (const t of DRAW_TOOLS) {
    if (t.id === "rect") {
      pickerBtns.rect = _mkPickerBtn(
        t,
        "rect-",
        () => (getToolSettings?.()?.rect?.activeShape ?? "plain"),
        createRectShapePicker,
        (shape) => onToolChange("rect", { activeShape: shape }),
      );
    } else if (t.id === "stamp") {
      pickerBtns.stamp = _mkPickerBtn(
        t,
        "stamp-",
        () => (getToolSettings?.()?.stamp?.activeStamp ?? "checkmark"),
        createStampPicker,
        (stampType) => onToolChange("stamp", { activeStamp: stampType }),
      );
    } else {
      _mkToolBtn(t);
    }
  }

  // ── Header bar ─────────────────────────────────────────────────────────────

  const headerBar = document.createElement("div");
  headerBar.style.cssText =
    "display:flex;align-items:center;" +
    "padding:4px 8px;background:var(--card);" +
    "border-bottom:1px solid var(--border);flex-shrink:0;min-height:38px;";

  // Left section: tool / annotation settings — content managed by _settings.js
  const settingsArea = document.createElement("div");
  settingsArea.style.cssText =
    "display:flex;align-items:center;gap:2px;flex:1;min-width:0;overflow:visible;";
  headerBar.appendChild(settingsArea);

  // Right section (inner-left): object actions (group, layers, delete, reset)
  // — content managed by _object_actions.js; hidden when nothing is selected
  const objectActionsEl = document.createElement("div");
  objectActionsEl.className = "ais-hud";
  objectActionsEl.style.cssText = "display:none;align-items:center;gap:2px;flex-shrink:0;margin-right:4px;";
  headerBar.appendChild(objectActionsEl);

  // Layers button — always visible, opens the layers panel.
  // Styled as a status pill so it's clearly a "you are drawing on this layer" indicator,
  // not just another tool button.
  const layersDivider = document.createElement("div");
  layersDivider.style.cssText = "width:1px;height:20px;background:var(--border);margin:0 6px;flex-shrink:0;";
  headerBar.appendChild(layersDivider);

  const layersBtn = document.createElement("button");
  layersBtn.style.cssText =
    "display:flex;align-items:center;gap:5px;padding:3px 9px 3px 7px;height:28px;border:none;cursor:pointer;" +
    "border-radius:6px;background:var(--muted);color:var(--foreground);" +
    "transition:background 0.15s;flex-shrink:0;max-width:160px;min-width:0;" +
    "font-family:inherit;";
  layersBtn.addEventListener("pointerover", () => { layersBtn.style.background = "var(--accent,rgba(122,157,184,0.2))"; });
  layersBtn.addEventListener("pointerout",  () => { layersBtn.style.background = "var(--muted)"; });

  const layersIconWrap = document.createElement("span");
  layersIconWrap.style.cssText = "flex-shrink:0;display:flex;align-items:center;opacity:0.7;";
  layersIconWrap.appendChild(mkIcon("layers", 13));
  layersBtn.appendChild(layersIconWrap);

  const layersLabelEl = document.createElement("span");
  layersLabelEl.style.cssText =
    "font-size:11px;font-weight:600;color:var(--foreground);" +
    "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px;";
  layersLabelEl.textContent = "Layer 1";
  layersBtn.appendChild(layersLabelEl);

  // Chevron ▾
  const layersChevron = document.createElement("span");
  layersChevron.style.cssText = "flex-shrink:0;display:flex;align-items:center;opacity:0.45;margin-left:1px;";
  layersChevron.innerHTML =
    `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;pointer-events:none;">` +
    `<path d="m6 9 6 6 6-6"/></svg>`;
  layersBtn.appendChild(layersChevron);

  addTooltip(layersBtn, "Layers — click to open layer panel");
  headerBar.appendChild(layersBtn);

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

  function refreshPickerIcons() {
    pickerBtns.rect?.refreshIcon();
    pickerBtns.stamp?.refreshIcon();
  }

  return { sidebar, headerBar, settingsArea, objectActionsEl, layersBtn, layersLabelEl, layersIconWrap, toolBtns, setActiveTool, setResetViewEnabled, updateExpandIcon, refreshPickerIcons };
}
