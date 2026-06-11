// _popup_position.js — Position popup for the AnnotateImage widget.
//
// Exports createPositionPopup(settingsArea, deps) → { build(ann) }
//
// build(ann):
//   ann === null  → renders a disabled Position pill (tool mode / multi-select)
//   ann           → renders an enabled pill that opens a popup with:
//                     text:         X/Y (px/%), anchor, rotation dial, align grid, order
//                     rect/ellipse: X/Y + W/H (px/%), anchor, rotation dial, align grid, order
//                     arrow:        X1/Y1 start + X2/Y2 end, order
//                     paint:        X/Y, rotation dial, order

import { mkIcon } from './_icons.js';
import { reorderAnnotations } from './_object_actions.js';
import {
  buildPopupTrigger, wirePopupToggle,
  mkSectionLabel, mkDivider, mkScrubNumRow, mkXYPad,
} from './_popup_utils.js';
import {
  DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT,
} from './_styles.js';
import { snapshotAnn, defaultCps } from './_geometry.js';

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const DIAL_SIZE   = 32;

export function createPositionPopup(settingsArea, {
  addTooltip,
  getState,
  setCurrentValue,
  applySingleUpdate,
  applyAnnotationMap,
  effectiveAnnotations,
  getAnnotationBounds,
  renderCanvas,
  emit,
  rebuild,
  rebuildTxFrame,
  forceRebuildTxFrame,
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

  function _buildAnchorGrid(container, ann) {
    const isShape = ann.type === "rect" || ann.type === "ellipse";
    let ah = ann.anchor_h || (isShape ? "center" : "left");
    let av = ann.anchor_v || (isShape ? "middle" : "top");

    mkSectionLabel(container, "Anchor");

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
    container.appendChild(grid);
  }

  // ── compact order row (item 4) ───────────────────────────────────────────────

  const ORDER_ITEMS = [
    { label: "Bring to Front", action: "front",    icon: "order-front"    },
    { label: "Bring Forward",  action: "forward",  icon: "order-forward"  },
    { label: "Send Backward",  action: "backward", icon: "order-backward" },
    { label: "Send to Back",   action: "back",     icon: "order-back"     },
  ];

  function _buildOrderItems(popup, ann, dismissPopup) {
    mkSectionLabel(popup, "Order");
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:4px;";
    for (const { label, action, icon } of ORDER_ITEMS) {
      const btn = document.createElement("button");
      btn.className = "ais-toggle-btn";
      btn.style.cssText = "width:28px;height:28px;";
      addTooltip(btn, label);
      btn.appendChild(mkIcon(icon, 14));
      btn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        dismissPopup();
        const { currentValue } = getState();
        const selIds = currentValue.selected_ids || [ann.id];
        const newAnns = reorderAnnotations(currentValue.annotations || [], selIds, action);
        setCurrentValue({ ...currentValue, annotations: newAnns });
        emit(); rebuild(); renderCanvas();
      });
      row.appendChild(btn);
    }
    popup.appendChild(row);
  }

  // ── rotation dial (item 2) ───────────────────────────────────────────────────

  function _mkRotationDial(popup, valueDeg, onChange) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;";

    const lbl = document.createElement("span");
    lbl.style.cssText = "font-size:11px;color:var(--muted-foreground);flex-shrink:0;";
    lbl.textContent = "Rotation";
    row.appendChild(lbl);

    const dial = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    dial.setAttribute("width", DIAL_SIZE);
    dial.setAttribute("height", DIAL_SIZE);
    dial.style.cssText = "cursor:grab;flex-shrink:0;touch-action:none;user-select:none;";

    let currentDeg = valueDeg;

    function _renderDial() {
      const rad = currentDeg * DEG_TO_RAD;
      const cx  = DIAL_SIZE / 2, cy = DIAL_SIZE / 2;
      const r   = DIAL_SIZE / 2 - 2;
      const lx  = cx + Math.sin(rad) * (r - 4);
      const ly  = cy - Math.cos(rad) * (r - 4);
      dial.innerHTML =
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--input,#2a2a2a)" stroke="var(--border,#444)" stroke-width="1.5"/>` +
        `<circle cx="${cx}" cy="${cy}" r="1.5" fill="var(--muted-foreground,#888)"/>` +
        `<line x1="${cx}" y1="${cy}" x2="${lx}" y2="${ly}" stroke="var(--foreground,#eee)" stroke-width="2" stroke-linecap="round"/>`;
    }
    _renderDial();

    const input = document.createElement("input");
    input.type  = "number";
    input.value = Math.round(currentDeg * 10) / 10;
    input.step  = 1;
    input.style.cssText = [
      "flex:1", "min-width:0",
      "background:var(--input,#2a2a2a)",
      "border:1px solid var(--border,#444)", "border-radius:4px",
      "color:var(--foreground,#eee)", "font-size:12px", "font-family:monospace",
      "padding:3px 6px", "height:28px", "box-sizing:border-box", "outline:none",
      "appearance:textfield", "-moz-appearance:textfield",
      "caret-color:var(--foreground,#eee)",
    ].join(";");

    const unitEl = document.createElement("span");
    unitEl.textContent = "°";
    unitEl.style.cssText = "font-size:11px;color:var(--muted-foreground);flex-shrink:0;";

    let dragging = false, startAngle = 0, startDeg = 0;

    function _getAngle(e) {
      const rect = dial.getBoundingClientRect();
      return Math.atan2(e.clientX - (rect.left + rect.width / 2),
                       -(e.clientY - (rect.top  + rect.height / 2))) * RAD_TO_DEG;
    }

    dial.addEventListener("pointerdown", (e) => {
      e.stopPropagation(); e.preventDefault();
      dial.setPointerCapture(e.pointerId);
      dial.style.cursor = "grabbing";
      dragging = true;
      startAngle = _getAngle(e);
      startDeg   = currentDeg;
    });
    dial.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      let delta = _getAngle(e) - startAngle;
      if (delta >  180) delta -= 360;
      if (delta < -180) delta += 360;
      currentDeg = startDeg + delta;
      input.value = Math.round(currentDeg * 10) / 10;
      _renderDial();
      onChange(currentDeg, false);
    });
    dial.addEventListener("pointerup", (e) => {
      if (!dragging) return;
      dragging = false;
      dial.style.cursor = "grab";
      dial.releasePointerCapture(e.pointerId);
      onChange(currentDeg, true);
    });

    input.addEventListener("input",   () => { currentDeg = Number(input.value); _renderDial(); onChange(currentDeg, false); });
    input.addEventListener("change",  () => { currentDeg = Number(input.value); _renderDial(); onChange(currentDeg, true);  });
    input.addEventListener("keydown", (e) => e.stopPropagation());
    input.addEventListener("focus",   () => input.select());

    row.appendChild(dial);
    row.appendChild(input);
    row.appendChild(unitEl);
    popup.appendChild(row);
  }

  // ── px / % toggle ────────────────────────────────────────────────────────────
  // refreshPopup(popup, dismiss) — called on toggle to rebuild popup content in-place.

  function _buildPxPctToggle(popup, ann, dismiss, refreshPopup) {
    const { currentValue } = getState();
    const cw    = currentValue.canvas_width  || DEFAULT_CANVAS_WIDTH;
    const ch    = currentValue.canvas_height || DEFAULT_CANVAS_HEIGHT;
    const isPct = !!ann.percentage;

    const row   = document.createElement("div");
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
        ...a, x: (a.x ?? 0) / 100 * cw, y: (a.y ?? 0) / 100 * ch, percentage: false,
      }));
      emit(); renderCanvas();
      popup.innerHTML = "";
      refreshPopup(popup, dismiss);
    });
    pctBtn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      if (isPct) return;
      applySingleUpdate(ann.id, (a) => ({
        ...a, x: (a.x ?? 0) / cw * 100, y: (a.y ?? 0) / ch * 100, percentage: true,
      }));
      emit(); renderCanvas();
      popup.innerHTML = "";
      refreshPopup(popup, dismiss);
    });

    row.appendChild(pxBtn);
    row.appendChild(pctBtn);
    popup.appendChild(row);
  }

  // ── 9-point align-to-canvas grid (item 5) ────────────────────────────────────

  function _mkAlignDot(row, col) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.style.cssText = "display:block;pointer-events:none;";

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", "1"); rect.setAttribute("y", "1");
    rect.setAttribute("width", "14"); rect.setAttribute("height", "14");
    rect.setAttribute("rx", "1");
    rect.setAttribute("fill", "none");
    rect.setAttribute("stroke", "currentColor");
    rect.setAttribute("stroke-width", "1.5");
    rect.setAttribute("opacity", "0.4");
    svg.appendChild(rect);

    const xs = [3, 8, 13];
    const ys = [3, 8, 13];
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", xs[col]);
    circle.setAttribute("cy", ys[row]);
    circle.setAttribute("r", "2");
    circle.setAttribute("fill", "currentColor");
    svg.appendChild(circle);

    return svg;
  }

  const ALIGN_LABELS = [
    ["Top Left", "Top Center", "Top Right"],
    ["Middle Left", "Center", "Middle Right"],
    ["Bottom Left", "Bottom Center", "Bottom Right"],
  ];

  // _buildAlignGrid: getBounds() is called fresh on every click so bounds are never stale.
  // onTranslate(dx, dy) receives the pixel delta to apply.
  function _buildAlignGrid(container, cw, ch, getBounds, onTranslate, label = "Align to Canvas") {
    mkSectionLabel(container, label);

    const grid = document.createElement("div");
    grid.style.cssText =
      "display:grid;grid-template-columns:repeat(3,28px);grid-template-rows:repeat(3,28px);gap:2px;";

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const btn = document.createElement("button");
        btn.className = "ais-toggle-btn";
        btn.style.cssText = "width:28px;height:28px;padding:0;";
        addTooltip(btn, ALIGN_LABELS[r][c]);
        btn.appendChild(_mkAlignDot(r, c));

        const xFrac = c / 2, yFrac = r / 2;
        btn.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          const b = getBounds();
          if (!b) return;
          const bw = b.maxX - b.minX, bh = b.maxY - b.minY;
          onTranslate(xFrac * (cw - bw) - b.minX, yFrac * (ch - bh) - b.minY);
        });
        grid.appendChild(btn);
      }
    }
    container.appendChild(grid);
  }

  // Shared helper: align grid for any single annotation (all types, px or %).
  function _annAlignGrid(container, annId, cw, ch, label = "Align to Canvas") {
    _buildAlignGrid(container, cw, ch,
      () => {
        if (!getAnnotationBounds) return null;
        const a = effectiveAnnotations().find((x) => x.id === annId);
        return a ? getAnnotationBounds(a) : null;
      },
      (dx, dy) => {
        applySingleUpdate(annId, (a) => _translateAnn(
          a,
          a.percentage ? dx / cw * 100 : dx,
          a.percentage ? dy / ch * 100 : dy,
        ));
        rebuildTxFrame(); renderCanvas(); emit();
      },
      label,
    );
  }

  function _buildAnchorAlignRow(popup, ann) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:12px;align-items:flex-start;";
    const anchorCol = document.createElement("div");
    const alignCol  = document.createElement("div");
    row.appendChild(anchorCol);
    row.appendChild(alignCol);
    popup.appendChild(row);
    _buildAnchorGrid(anchorCol, ann);
    const { currentValue } = getState();
    const cw = currentValue.canvas_width  || DEFAULT_CANVAS_WIDTH;
    const ch = currentValue.canvas_height || DEFAULT_CANVAS_HEIGHT;
    _annAlignGrid(alignCol, ann.id, cw, ch, "Align");
  }

  // ── popup content builders per annotation type ───────────────────────────────

  function _buildTextContent(popup, ann, dismiss) {
    _buildPxPctToggle(popup, ann, dismiss, (p, d) => {
      const fresh = effectiveAnnotations().find((a) => a.id === ann.id) ?? ann;
      _buildTextContent(p, fresh, d);
    });
    mkDivider(popup);
    mkSectionLabel(popup, "Position");
    const unit = ann.percentage ? "%" : "px";
    const step = ann.percentage ? 0.1 : 1;
    mkXYPad(popup, ann.x ?? 0, ann.y ?? 0, {
      unit, step,
      onXY: (nx, ny, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, x: nx, y: ny }));
        rebuildTxFrame(); renderCanvas(); if (doEmit) emit();
      },
    });
    mkDivider(popup);
    mkSectionLabel(popup, "Transform");
    _mkRotationDial(popup, Math.round((ann.rotation ?? 0) * RAD_TO_DEG * 10) / 10, (v, doEmit) => {
      applySingleUpdate(ann.id, (a) => ({ ...a, rotation: v * DEG_TO_RAD }));
      rebuildTxFrame(); renderCanvas(); if (doEmit) emit();
    });
    mkDivider(popup);
    _buildAnchorAlignRow(popup, ann);
    mkDivider(popup);
    _buildOrderItems(popup, ann, dismiss);
  }

  function _buildShapeContent(popup, ann, dismiss) {
    _buildPxPctToggle(popup, ann, dismiss, (p, d) => {
      const fresh = effectiveAnnotations().find((a) => a.id === ann.id) ?? ann;
      _buildShapeContent(p, fresh, d);
    });
    mkDivider(popup);
    mkSectionLabel(popup, "Position");
    const unit = ann.percentage ? "%" : "px";
    const step = ann.percentage ? 0.1 : 1;
    mkXYPad(popup, ann.x ?? 0, ann.y ?? 0, {
      unit, step,
      onXY: (nx, ny, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, x: nx, y: ny }));
        rebuildTxFrame(); renderCanvas(); if (doEmit) emit();
      },
    });
    mkSectionLabel(popup, "Size");
    mkScrubNumRow(popup, "Width", ann.w ?? 100,
      { min: 1, step: 1, unit: "px", onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, w: Math.max(1, v) }));
        rebuildTxFrame(); renderCanvas(); if (doEmit) emit();
      } });
    mkScrubNumRow(popup, "Height", ann.h ?? 100,
      { min: 1, step: 1, unit: "px", onChange: (v, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, h: Math.max(1, v) }));
        rebuildTxFrame(); renderCanvas(); if (doEmit) emit();
      } });
    mkDivider(popup);
    mkSectionLabel(popup, "Transform");
    _mkRotationDial(popup, Math.round((ann.rotation ?? 0) * RAD_TO_DEG * 10) / 10, (v, doEmit) => {
      applySingleUpdate(ann.id, (a) => ({ ...a, rotation: v * DEG_TO_RAD }));
      rebuildTxFrame(); renderCanvas(); if (doEmit) emit();
    });
    mkDivider(popup);
    _buildAnchorAlignRow(popup, ann);
    mkDivider(popup);
    _buildOrderItems(popup, ann, dismiss);
  }

  function _buildArrowContent(popup, ann, dismiss) {
    const { currentValue: cv0 } = getState();
    const cw = cv0.canvas_width  || DEFAULT_CANVAS_WIDTH;
    const ch = cv0.canvas_height || DEFAULT_CANVAS_HEIGHT;
    // "Position" moves both endpoints together; reference is the midpoint.
    let refX = Math.round(((ann.x1 ?? 0) + (ann.x2 ?? 0)) / 2);
    let refY = Math.round(((ann.y1 ?? 0) + (ann.y2 ?? 0)) / 2);
    mkSectionLabel(popup, "Position");
    mkXYPad(popup, refX, refY, {
      unit: "px", step: 1,
      onXY: (nx, ny, doEmit) => {
        const dx = nx - refX, dy = ny - refY;
        refX = nx; refY = ny;
        applySingleUpdate(ann.id, (a) => ({
          ...a,
          x1: (a.x1 ?? 0) + dx, y1: (a.y1 ?? 0) + dy,
          x2: (a.x2 ?? 0) + dx, y2: (a.y2 ?? 0) + dy,
          cp1x: a.cp1x != null ? a.cp1x + dx : null,
          cp1y: a.cp1y != null ? a.cp1y + dy : null,
          cp2x: a.cp2x != null ? a.cp2x + dx : null,
          cp2y: a.cp2y != null ? a.cp2y + dy : null,
        }));
        rebuildTxFrame(); renderCanvas(); if (doEmit) emit();
      },
    });
    mkDivider(popup);
    mkSectionLabel(popup, "Start");
    mkXYPad(popup, Math.round(ann.x1 ?? 0), Math.round(ann.y1 ?? 0), {
      unit: "px", step: 1,
      onXY: (nx, ny, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, x1: nx, y1: ny }));
        rebuildTxFrame(); renderCanvas(); if (doEmit) emit();
      },
    });
    mkDivider(popup);
    mkSectionLabel(popup, "End");
    mkXYPad(popup, Math.round(ann.x2 ?? 0), Math.round(ann.y2 ?? 0), {
      unit: "px", step: 1,
      onXY: (nx, ny, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, x2: nx, y2: ny }));
        rebuildTxFrame(); renderCanvas(); if (doEmit) emit();
      },
    });
    mkDivider(popup);
    _annAlignGrid(popup, ann.id, cw, ch);
    mkDivider(popup);
    _buildOrderItems(popup, ann, dismiss);
  }

  function _buildPaintContent(popup, ann, dismiss) {
    const { currentValue } = getState();
    const cw = currentValue.canvas_width  || DEFAULT_CANVAS_WIDTH;
    const ch = currentValue.canvas_height || DEFAULT_CANVAS_HEIGHT;
    mkSectionLabel(popup, "Position");
    mkXYPad(popup, Math.round(ann.x ?? 0), Math.round(ann.y ?? 0), {
      unit: "px", step: 1,
      onXY: (nx, ny, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, x: nx, y: ny }));
        rebuildTxFrame(); renderCanvas(); if (doEmit) emit();
      },
    });
    mkDivider(popup);
    mkSectionLabel(popup, "Transform");
    _mkRotationDial(popup, Math.round((ann.rotation ?? 0) * RAD_TO_DEG * 10) / 10, (v, doEmit) => {
      applySingleUpdate(ann.id, (a) => ({ ...a, rotation: v * DEG_TO_RAD }));
      rebuildTxFrame(); renderCanvas(); if (doEmit) emit();
    });
    mkDivider(popup);
    _annAlignGrid(popup, ann.id, cw, ch);
    mkDivider(popup);
    _buildOrderItems(popup, ann, dismiss);
  }

  function _buildStampContent(popup, ann, dismiss) {
    const { currentValue } = getState();
    const cw = currentValue.canvas_width  || DEFAULT_CANVAS_WIDTH;
    const ch = currentValue.canvas_height || DEFAULT_CANVAS_HEIGHT;
    _buildPxPctToggle(popup, ann, dismiss, (p, d) => {
      const fresh = effectiveAnnotations().find((a) => a.id === ann.id) ?? ann;
      _buildStampContent(p, fresh, d);
    });
    mkDivider(popup);
    mkSectionLabel(popup, "Position");
    const unit = ann.percentage ? "%" : "px";
    const step = ann.percentage ? 0.1 : 1;
    mkXYPad(popup, ann.x ?? 0, ann.y ?? 0, {
      unit, step,
      onXY: (nx, ny, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, x: nx, y: ny }));
        rebuildTxFrame(); renderCanvas(); if (doEmit) emit();
      },
    });
    mkDivider(popup);
    mkSectionLabel(popup, "Transform");
    _mkRotationDial(popup, Math.round((ann.rotation ?? 0) * RAD_TO_DEG * 10) / 10, (v, doEmit) => {
      applySingleUpdate(ann.id, (a) => ({ ...a, rotation: v * DEG_TO_RAD }));
      rebuildTxFrame(); renderCanvas(); if (doEmit) emit();
    });
    mkDivider(popup);
    _annAlignGrid(popup, ann.id, cw, ch);
    mkDivider(popup);
    _buildOrderItems(popup, ann, dismiss);
  }

  // Translate a single annotation object by (dx, dy) — pure, no side effects.
  function _translateAnn(a, dx, dy) {
    if (a.type === "arrow") return {
      ...a,
      x1: (a.x1 ?? 0) + dx, y1: (a.y1 ?? 0) + dy,
      x2: (a.x2 ?? 0) + dx, y2: (a.y2 ?? 0) + dy,
      cp1x: a.cp1x != null ? a.cp1x + dx : null,
      cp1y: a.cp1y != null ? a.cp1y + dy : null,
      cp2x: a.cp2x != null ? a.cp2x + dx : null,
      cp2y: a.cp2y != null ? a.cp2y + dy : null,
    };
    return { ...a, x: (a.x ?? 0) + dx, y: (a.y ?? 0) + dy };
  }

  function _buildGroupContent(popup, groupAnns) {
    const cv0 = getState().currentValue;
    const cw0 = cv0.canvas_width  || DEFAULT_CANVAS_WIDTH;
    const ch0 = cv0.canvas_height || DEFAULT_CANVAS_HEIGHT;

    // Convert an annotation's position to pixels for display purposes.
    function _toPx(a) {
      if (a.type === "arrow") {
        return {
          x: ((a.x1 ?? 0) + (a.x2 ?? 0)) / 2,
          y: ((a.y1 ?? 0) + (a.y2 ?? 0)) / 2,
        };
      }
      return {
        x: a.percentage ? (a.x ?? 0) / 100 * cw0 : (a.x ?? 0),
        y: a.percentage ? (a.y ?? 0) / 100 * ch0 : (a.y ?? 0),
      };
    }

    // Bounding box and centroid (all in pixels, computed once at open time).
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const a of groupAnns) {
      const { x, y } = _toPx(a);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const centroidX = ((minX + maxX) / 2) || 0;
    const centroidY = ((minY + maxY) / 2) || 0;
    let refX = Math.round(minX === Infinity ? 0 : minX);
    let refY = Math.round(minY === Infinity ? 0 : minY);

    // Apply mapFn(ann, cv) to all group members via two-pass local/imported
    // approach, so an ID that exists in both arrays is never transformed twice.
    function _applyGroupFn(mapFn, doEmit) {
      const cv = getState().currentValue;
      const moveIds = new Set(groupAnns.map((a) => a.id));

      const newAnnotations = (cv.annotations || []).map((a) =>
        moveIds.has(a.id) ? mapFn(a, cv) : a
      );

      const handledLocal = new Set(
        (cv.annotations || []).filter((a) => moveIds.has(a.id)).map((a) => a.id)
      );
      const newOverrides = { ...(cv.overrides || {}) };
      for (const imp of (cv.imported_annotations || [])) {
        if (!moveIds.has(imp.id) || handledLocal.has(imp.id)) continue;
        const existing = newOverrides[imp.id] || {};
        const merged   = { ...imp, ...existing };
        const moved    = mapFn(merged, cv);
        const newOvr   = { ...existing };
        for (const k of ["x","y","x1","y1","x2","y2","cp1x","cp1y","cp2x","cp2y","rotation"]) {
          if (moved[k] !== undefined) newOvr[k] = moved[k];
        }
        newOverrides[imp.id] = newOvr;
      }

      setCurrentValue({ ...cv, annotations: newAnnotations, overrides: newOverrides });
      (forceRebuildTxFrame || rebuildTxFrame)(); renderCanvas(); if (doEmit) emit();
    }

    // ── Position ─────────────────────────────────────────────────────────────
    mkSectionLabel(popup, "Position");
    mkXYPad(popup, refX, refY, {
      unit: "px", step: 1,
      onXY: (nx, ny, doEmit) => {
        const dxPx = nx - refX, dyPx = ny - refY;
        refX = nx; refY = ny;
        _applyGroupFn((a, cv) => {
          const cw = cv.canvas_width  || DEFAULT_CANVAS_WIDTH;
          const ch = cv.canvas_height || DEFAULT_CANVAS_HEIGHT;
          const dx = a.percentage ? dxPx / cw * 100 : dxPx;
          const dy = a.percentage ? dyPx / ch * 100 : dyPx;
          return _translateAnn(a, dx, dy);
        }, doEmit);
      },
    });

    // ── Rotation (orbits each member around the group centroid) ───────────────
    // Snapshot originals at popup-open time so every dial move rotates from the
    // initial state — same approach as the drag handle, avoids delta accumulation.
    const origSnapshots = {};
    for (const a of groupAnns) {
      const snap = snapshotAnn(a);
      snap._was_percentage = !!a.percentage;
      const centerAnchor = a.type === "rect" || a.type === "ellipse";
      snap._anchor_h = a.anchor_h || (centerAnchor ? "center" : "left");
      snap._anchor_v = a.anchor_v || (centerAnchor ? "middle" : "top");
      origSnapshots[a.id] = snap;
    }

    mkDivider(popup);
    mkSectionLabel(popup, "Transform");
    _mkRotationDial(popup, 0, (newDeg, doEmit) => {
      const totalRad = newDeg * DEG_TO_RAD;
      const cos = Math.cos(totalRad), sin = Math.sin(totalRad);

      function _rotPt(x, y) {
        const rx = x - centroidX, ry = y - centroidY;
        return { x: centroidX + rx * cos - ry * sin,
                 y: centroidY + rx * sin + ry * cos };
      }

      _applyGroupFn((a, cv) => {
        const snap = origSnapshots[a.id];
        if (!snap) return a;
        const cw = cv.canvas_width  || DEFAULT_CANVAS_WIDTH;
        const ch = cv.canvas_height || DEFAULT_CANVAS_HEIGHT;

        if (a.type === "arrow") {
          // snap already has resolved CPs via snapshotAnn → defaultCps
          const p1 = _rotPt(snap.x1, snap.y1), p2 = _rotPt(snap.x2, snap.y2);
          const c1 = _rotPt(snap.cp1x, snap.cp1y), c2 = _rotPt(snap.cp2x, snap.cp2y);
          return { ...a, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
                   cp1x: c1.x, cp1y: c1.y, cp2x: c2.x, cp2y: c2.y };
        }
        if (a.type === "paint") {
          const ax = snap.cx + snap.x - centroidX, ay = snap.cy + snap.y - centroidY;
          return { ...a,
            x: ax * cos - ay * sin + centroidX - snap.cx,
            y: ax * sin + ay * cos + centroidY - snap.cy,
            rotation: snap.rotation + totalRad };
        }
        if (a.type === "rect" || a.type === "ellipse") {
          const ah = snap._anchor_h, av = snap._anchor_v;
          const hw = (snap.w || 10) / 2, hh = (snap.h || 10) / 2;
          const xOff = ah === "left" ? hw : ah === "right" ? -hw : 0;
          const yOff = av === "top" ? hh : av === "bottom" ? -hh : 0;
          const np = _rotPt(snap.x + xOff, snap.y + yOff);
          const nx = np.x - xOff, ny = np.y - yOff;
          if (snap._was_percentage) return { ...a, x: nx / cw * 100, y: ny / ch * 100, rotation: snap.rotation + totalRad };
          return { ...a, x: nx, y: ny, rotation: snap.rotation + totalRad };
        }
        if (a.type === "stamp") {
          const np = _rotPt(snap.x, snap.y);
          if (snap._was_percentage) return { ...a, x: np.x / cw * 100, y: np.y / ch * 100, rotation: snap.rotation + totalRad };
          return { ...a, x: np.x, y: np.y, rotation: snap.rotation + totalRad };
        }
        // text: orbit anchor point, update rotation
        const xPx = snap._was_percentage ? snap.x / 100 * cw : snap.x;
        const yPx = snap._was_percentage ? snap.y / 100 * ch : snap.y;
        const np = _rotPt(xPx, yPx);
        if (snap._was_percentage) return { ...a, rotation: snap.rotation + totalRad, x: np.x / cw * 100, y: np.y / ch * 100 };
        return { ...a, rotation: snap.rotation + totalRad, x: np.x, y: np.y };
      }, doEmit);
    });

    // ── Align to Canvas ───────────────────────────────────────────────────────
    mkDivider(popup);
    const groupIds = new Set(groupAnns.map((a) => a.id));
    _buildAlignGrid(popup, cw0, ch0,
      () => {
        if (!getAnnotationBounds) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const a of effectiveAnnotations()) {
          if (!groupIds.has(a.id)) continue;
          const b = getAnnotationBounds(a);
          if (!b) continue;
          minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
          maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
        }
        return minX === Infinity ? null : { minX, minY, maxX, maxY };
      },
      (dx, dy) => {
        _applyGroupFn((a, cv) => {
          const cw = cv.canvas_width  || DEFAULT_CANVAS_WIDTH;
          const ch = cv.canvas_height || DEFAULT_CANVAS_HEIGHT;
          return _translateAnn(a, a.percentage ? dx / cw * 100 : dx, a.percentage ? dy / ch * 100 : dy);
        }, true);
      },
    );
  }

  // ── public API ───────────────────────────────────────────────────────────────

  function build(ann) {
    const isEnabled = ann !== null;
    const btn = buildPopupTrigger(settingsArea, "Position", "move", isEnabled);
    if (!isEnabled) return;

    wirePopupToggle(btn, (popup, dismiss) => {
      if (ann.type === "group")
        _buildGroupContent(popup, ann.groupAnns);
      else if (ann.type === "text")
        _buildTextContent(popup, ann, dismiss);
      else if (ann.type === "rect" || ann.type === "ellipse")
        _buildShapeContent(popup, ann, dismiss);
      else if (ann.type === "arrow")
        _buildArrowContent(popup, ann, dismiss);
      else if (ann.type === "paint")
        _buildPaintContent(popup, ann, dismiss);
      else if (ann.type === "stamp")
        _buildStampContent(popup, ann, dismiss);
    });
  }

  return { build };
}
