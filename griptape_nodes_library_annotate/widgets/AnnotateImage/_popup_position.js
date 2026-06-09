// _popup_position.js — Position popup for the AnnotateImage widget.
//
// Exports createPositionPopup(settingsArea, deps) → { build(ann) }
//
// build(ann):
//   ann === null  → renders a disabled Position pill (tool mode / multi-select)
//   ann           → renders an enabled pill that opens a popup with:
//                     text:         X, Y (px/%), anchor, rotation, order
//                     rect/ellipse: X, Y, W, H (px/%), anchor, rotation, order
//                     arrow:        X1, Y1, X2, Y2, order
//                     paint:        X, Y, rotation, order

import { mkIcon } from './_icons.js';
import { reorderAnnotations } from './_object_actions.js';
import { buildPopupTrigger, wirePopupToggle, mkSectionLabel, mkDivider, mkNumRow } from './_popup_utils.js';
import {
  DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT,
  SEL_COLOR_RGB, LAYER_HOVER_OPACITY,
} from './_styles.js';

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

export function createPositionPopup(settingsArea, {
  addTooltip,
  getState,
  setCurrentValue,
  applySingleUpdate,
  renderCanvas,
  emit,
  rebuild,
}) {

  // ── anchor grid ──────────────────────────────────────────────────────────────

  const H_OPTIONS = [
    { value: "left",   icon: "align-start-vertical",   title: "Anchor left"   },
    { value: "center", icon: "align-center-vertical",  title: "Anchor center" },
    { value: "right",  icon: "align-end-vertical",     title: "Anchor right"  },
  ];
  const V_OPTIONS = [
    { value: "top",    icon: "align-start-horizontal", title: "Anchor top"    },
    { value: "middle", icon: "align-center-horizontal",title: "Anchor middle" },
    { value: "bottom", icon: "align-end-horizontal",   title: "Anchor bottom" },
  ];

  function _buildAnchorGrid(popup, ann) {
    const isShape = ann.type === "rect" || ann.type === "ellipse";
    let ah = ann.anchor_h || (isShape ? "center" : "left");
    let av = ann.anchor_v || (isShape ? "middle" : "top");

    mkSectionLabel(popup, "Anchor");

    const grid = document.createElement("div");
    grid.style.cssText =
      "display:grid;grid-template-columns:repeat(3,28px);grid-template-rows:repeat(2,28px);gap:2px;";

    function _renderGrid() {
      grid.innerHTML = "";
      for (const opt of H_OPTIONS) {
        const ib = document.createElement("button");
        ib.className = "ais-toggle-btn" + (ah === opt.value ? " active" : "");
        ib.style.cssText = "width:28px;height:28px;";
        addTooltip(ib, opt.title);
        ib.appendChild(mkIcon(opt.icon, 14));
        ib.addEventListener("pointerdown", (e) => {
          e.stopPropagation(); ah = opt.value; _renderGrid();
          applySingleUpdate(ann.id, (a) => ({ ...a, anchor_h: ah, anchor_v: av }));
          if (ann.type === "text") {
            const s = getState();
            s.toolSettings.text.anchor_h = ah;
            setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
          }
          renderCanvas(); emit();
        });
        grid.appendChild(ib);
      }
      for (const opt of V_OPTIONS) {
        const ib = document.createElement("button");
        ib.className = "ais-toggle-btn" + (av === opt.value ? " active" : "");
        ib.style.cssText = "width:28px;height:28px;";
        addTooltip(ib, opt.title);
        ib.appendChild(mkIcon(opt.icon, 14));
        ib.addEventListener("pointerdown", (e) => {
          e.stopPropagation(); av = opt.value; _renderGrid();
          applySingleUpdate(ann.id, (a) => ({ ...a, anchor_h: ah, anchor_v: av }));
          if (ann.type === "text") {
            const s = getState();
            s.toolSettings.text.anchor_v = av;
            setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
          }
          renderCanvas(); emit();
        });
        grid.appendChild(ib);
      }
    }
    _renderGrid();
    popup.appendChild(grid);
  }

  // ── order items ──────────────────────────────────────────────────────────────

  const ORDER_ITEMS = [
    { label: "Bring to Front", action: "front",    icon: "order-front"    },
    { label: "Bring Forward",  action: "forward",  icon: "order-forward"  },
    { label: "Send Backward",  action: "backward", icon: "order-backward" },
    { label: "Send to Back",   action: "back",     icon: "order-back"     },
  ];

  function _buildOrderItems(popup, ann, dismissPopup) {
    mkSectionLabel(popup, "Order");
    for (const { label, action, icon } of ORDER_ITEMS) {
      const item = document.createElement("div");
      item.style.cssText =
        "display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;" +
        "border-radius:4px;color:var(--foreground,#eee);";
      item.appendChild(mkIcon(icon, 14));
      const span = document.createElement("span");
      span.style.cssText = "font-size:12px;white-space:nowrap;";
      span.textContent = label;
      item.appendChild(span);
      item.addEventListener("pointerover", () => {
        item.style.background = `rgba(${SEL_COLOR_RGB},${LAYER_HOVER_OPACITY})`;
      });
      item.addEventListener("pointerout", () => { item.style.background = ""; });
      item.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        dismissPopup();
        const { currentValue } = getState();
        const selIds = currentValue.selected_ids || [ann.id];
        const newAnns = reorderAnnotations(currentValue.annotations || [], selIds, action);
        setCurrentValue({ ...currentValue, annotations: newAnns });
        emit(); rebuild(); renderCanvas();
      });
      popup.appendChild(item);
    }
  }

  // ── px / % toggle inside popup ───────────────────────────────────────────────

  function _buildPxPctToggle(popup, ann) {
    const { currentValue } = getState();
    const cw = currentValue.canvas_width || DEFAULT_CANVAS_WIDTH;
    const ch = currentValue.canvas_height || DEFAULT_CANVAS_HEIGHT;
    const isPct = !!ann.percentage;

    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:4px;";

    const pxBtn = document.createElement("button");
    pxBtn.className = "ais-toggle-btn" + (!isPct ? " active" : "");
    pxBtn.style.cssText = "padding:2px 7px;height:22px;font-size:11px;font-weight:600;border-radius:4px;";
    pxBtn.textContent = "px";

    const pctBtn = document.createElement("button");
    pctBtn.className = "ais-toggle-btn" + (isPct ? " active" : "");
    pctBtn.style.cssText = "padding:2px 7px;height:22px;font-size:11px;font-weight:600;border-radius:4px;";
    pctBtn.textContent = "%";

    pxBtn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (!isPct) return;
      applySingleUpdate(ann.id, (a) => ({
        ...a,
        x: (a.x ?? 0) / 100 * cw,
        y: (a.y ?? 0) / 100 * ch,
        percentage: false,
      }));
      emit(); rebuild(); renderCanvas();
    });
    pctBtn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (isPct) return;
      applySingleUpdate(ann.id, (a) => ({
        ...a,
        x: (a.x ?? 0) / cw * 100,
        y: (a.y ?? 0) / ch * 100,
        percentage: true,
      }));
      emit(); rebuild(); renderCanvas();
    });

    row.appendChild(pxBtn);
    row.appendChild(pctBtn);
    popup.appendChild(row);
  }

  // ── popup content builders per annotation type ───────────────────────────────

  function _buildTextContent(popup, ann, dismiss) {
    _buildPxPctToggle(popup, ann);
    mkSectionLabel(popup, "Position");
    mkNumRow(popup, "X", ann.x ?? 0, {
      step: ann.percentage ? 0.1 : 1,
      unit: ann.percentage ? "%" : "px",
      onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, x: v }));
        renderCanvas(); if (doEmit) emit();
      },
    });
    mkNumRow(popup, "Y", ann.y ?? 0, {
      step: ann.percentage ? 0.1 : 1,
      unit: ann.percentage ? "%" : "px",
      onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, y: v }));
        renderCanvas(); if (doEmit) emit();
      },
    });
    mkDivider(popup);
    _buildAnchorGrid(popup, ann);
    mkDivider(popup);
    mkSectionLabel(popup, "Transform");
    mkNumRow(popup, "Rotation", Math.round((ann.rotation ?? 0) * RAD_TO_DEG * 10) / 10, {
      step: 1, unit: "°",
      onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, rotation: v * DEG_TO_RAD }));
        renderCanvas(); if (doEmit) emit();
      },
    });
    mkDivider(popup);
    _buildOrderItems(popup, ann, dismiss);
  }

  function _buildShapeContent(popup, ann, dismiss) {
    _buildPxPctToggle(popup, ann);
    mkSectionLabel(popup, "Position");
    mkNumRow(popup, "X", ann.x ?? 0, {
      step: ann.percentage ? 0.1 : 1,
      unit: ann.percentage ? "%" : "px",
      onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, x: v }));
        renderCanvas(); if (doEmit) emit();
      },
    });
    mkNumRow(popup, "Y", ann.y ?? 0, {
      step: ann.percentage ? 0.1 : 1,
      unit: ann.percentage ? "%" : "px",
      onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, y: v }));
        renderCanvas(); if (doEmit) emit();
      },
    });
    mkSectionLabel(popup, "Size");
    mkNumRow(popup, "W", ann.w ?? 100, {
      min: 1, step: 1, unit: "px",
      onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, w: Math.max(1, v) }));
        renderCanvas(); if (doEmit) emit();
      },
    });
    mkNumRow(popup, "H", ann.h ?? 100, {
      min: 1, step: 1, unit: "px",
      onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, h: Math.max(1, v) }));
        renderCanvas(); if (doEmit) emit();
      },
    });
    mkDivider(popup);
    _buildAnchorGrid(popup, ann);
    mkDivider(popup);
    mkSectionLabel(popup, "Transform");
    mkNumRow(popup, "Rotation", Math.round((ann.rotation ?? 0) * RAD_TO_DEG * 10) / 10, {
      step: 1, unit: "°",
      onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, rotation: v * DEG_TO_RAD }));
        renderCanvas(); if (doEmit) emit();
      },
    });
    mkDivider(popup);
    _buildOrderItems(popup, ann, dismiss);
  }

  function _buildArrowContent(popup, ann, dismiss) {
    mkSectionLabel(popup, "Start");
    mkNumRow(popup, "X1", Math.round(ann.x1 ?? 0), {
      step: 1, unit: "px",
      onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, x1: v }));
        renderCanvas(); if (doEmit) emit();
      },
    });
    mkNumRow(popup, "Y1", Math.round(ann.y1 ?? 0), {
      step: 1, unit: "px",
      onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, y1: v }));
        renderCanvas(); if (doEmit) emit();
      },
    });
    mkDivider(popup);
    mkSectionLabel(popup, "End");
    mkNumRow(popup, "X2", Math.round(ann.x2 ?? 0), {
      step: 1, unit: "px",
      onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, x2: v }));
        renderCanvas(); if (doEmit) emit();
      },
    });
    mkNumRow(popup, "Y2", Math.round(ann.y2 ?? 0), {
      step: 1, unit: "px",
      onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, y2: v }));
        renderCanvas(); if (doEmit) emit();
      },
    });
    mkDivider(popup);
    _buildOrderItems(popup, ann, dismiss);
  }

  function _buildPaintContent(popup, ann, dismiss) {
    mkSectionLabel(popup, "Position");
    mkNumRow(popup, "X", Math.round(ann.x ?? 0), {
      step: 1, unit: "px",
      onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, x: v }));
        renderCanvas(); if (doEmit) emit();
      },
    });
    mkNumRow(popup, "Y", Math.round(ann.y ?? 0), {
      step: 1, unit: "px",
      onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, y: v }));
        renderCanvas(); if (doEmit) emit();
      },
    });
    mkDivider(popup);
    mkSectionLabel(popup, "Transform");
    mkNumRow(popup, "Rotation", Math.round((ann.rotation ?? 0) * RAD_TO_DEG * 10) / 10, {
      step: 1, unit: "°",
      onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, rotation: v * DEG_TO_RAD }));
        renderCanvas(); if (doEmit) emit();
      },
    });
    mkDivider(popup);
    _buildOrderItems(popup, ann, dismiss);
  }

  // ── public API ───────────────────────────────────────────────────────────────

  function build(ann) {
    const isEnabled = ann !== null;
    const btn = buildPopupTrigger(settingsArea, "Position", "move", isEnabled);
    if (!isEnabled) return;

    wirePopupToggle(btn, (popup, dismiss) => {
      if (ann.type === "text")                              _buildTextContent(popup, ann, dismiss);
      else if (ann.type === "rect" || ann.type === "ellipse") _buildShapeContent(popup, ann, dismiss);
      else if (ann.type === "arrow")                        _buildArrowContent(popup, ann, dismiss);
      else if (ann.type === "paint")                        _buildPaintContent(popup, ann, dismiss);
    });
  }

  return { build };
}
