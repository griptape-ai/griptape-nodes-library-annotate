// _popup_utils.js — Shared helpers for Position and Style popup panels.
//
// All functions here are pure UI builders with no knowledge of annotation state.

import { mkIcon } from './_icons.js';

const CHEVRON_SVG =
  `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" ` +
  `style="display:block;pointer-events:none;">` +
  `<path d="m6 9 6 6 6-6"/></svg>`;

// Creates a pill trigger button (ais-popup-btn) and appends it to container.
// Returns the button element. The caller wires up the click handler.
export function buildPopupTrigger(container, label, iconId, isEnabled) {
  const btn = document.createElement("button");
  btn.className = "ais-popup-btn" + (isEnabled ? "" : " disabled");

  const iconWrap = document.createElement("span");
  iconWrap.style.cssText = "display:flex;align-items:center;opacity:0.75;flex-shrink:0;";
  iconWrap.appendChild(mkIcon(iconId, 13));
  btn.appendChild(iconWrap);

  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  btn.appendChild(labelEl);

  const chevron = document.createElement("span");
  chevron.style.cssText = "display:flex;align-items:center;opacity:0.45;flex-shrink:0;margin-left:1px;";
  chevron.innerHTML = CHEVRON_SVG;
  btn.appendChild(chevron);

  container.appendChild(btn);
  return btn;
}

// Creates and positions a popup container in document.body below triggerEl.
// Returns { popup, dismiss }.  The caller populates popup before or after calling this.
export function openPopup(triggerEl, { onDismiss } = {}) {
  const popup = document.createElement("div");
  popup.style.cssText = [
    "position:fixed", "background:var(--popover,#1e1e1e)",
    "border:1px solid var(--border,#444)", "border-radius:8px",
    "box-shadow:0 4px 16px rgba(0,0,0,0.5)", "z-index:10000",
    "padding:10px", "display:flex", "flex-direction:column", "gap:5px",
    "min-width:200px", "box-sizing:border-box",
    "font-size:12px", "font-family:inherit",
  ].join(";");

  document.body.appendChild(popup);

  // Position below trigger, flip up if near bottom of viewport.
  const bRect = triggerEl.getBoundingClientRect();
  popup.style.top = `${bRect.bottom + 4}px`;
  requestAnimationFrame(() => {
    if (!popup.isConnected) return;
    const pw = popup.offsetWidth;
    const ph = popup.offsetHeight;
    let left = bRect.left;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    popup.style.left = `${Math.max(4, left)}px`;
    if (bRect.bottom + 4 + ph > window.innerHeight - 8) {
      popup.style.top = `${Math.max(4, bRect.top - ph - 4)}px`;
    }
  });

  function dismiss() {
    if (!popup.isConnected) return;
    popup.remove();
    document.removeEventListener("pointerdown", _outside, true);
    document.removeEventListener("keydown", _keydown, true);
    if (onDismiss) onDismiss();
  }
  function _outside(e) {
    if (!popup.contains(e.target) && !triggerEl.contains(e.target)) dismiss();
  }
  function _keydown(e) {
    if (e.key === "Escape") { e.stopPropagation(); dismiss(); }
  }
  setTimeout(() => {
    document.addEventListener("pointerdown", _outside, true);
    document.addEventListener("keydown", _keydown, true);
  }, 0);

  return { popup, dismiss };
}

// Adds a small section header label to popup.
export function mkSectionLabel(popup, text) {
  const el = document.createElement("div");
  el.style.cssText =
    "font-size:10px;font-weight:600;color:var(--muted-foreground);" +
    "text-transform:uppercase;letter-spacing:0.06em;margin-top:2px;";
  el.textContent = text;
  popup.appendChild(el);
}

// Adds a 1px horizontal divider to popup.
export function mkDivider(popup) {
  const el = document.createElement("div");
  el.style.cssText = "height:1px;background:var(--border,#444);flex-shrink:0;margin:2px 0;";
  popup.appendChild(el);
}

// Adds a label + number input row to popup.
// onChange(value, doEmit) — doEmit=false on input event, true on change event.
// Returns the input element.
export function mkNumRow(popup, label, value, { min, max, step = 1, unit = "", onChange } = {}) {
  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;gap:6px;";

  const lbl = document.createElement("span");
  lbl.style.cssText = "font-size:11px;color:var(--muted-foreground);width:52px;flex-shrink:0;";
  lbl.textContent = label;
  row.appendChild(lbl);

  const input = document.createElement("input");
  input.type = "number";
  const rounded = typeof value === "number" ? (Math.round(value * 10) / 10) : value;
  input.value = rounded;
  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;
  input.step = step;
  input.style.cssText = [
    "flex:1", "min-width:0",
    "background:var(--input,#2a2a2a)",
    "border:1px solid var(--border,#444)", "border-radius:4px",
    "color:var(--foreground,#eee)", "font-size:12px", "font-family:monospace",
    "padding:3px 6px", "height:28px", "box-sizing:border-box", "outline:none",
    "appearance:textfield", "-moz-appearance:textfield",
    "caret-color:var(--foreground,#eee)",
  ].join(";");

  input.addEventListener("input", () => { if (onChange) onChange(Number(input.value), false); });
  input.addEventListener("change", () => { if (onChange) onChange(Number(input.value), true); });
  input.addEventListener("keydown", (e) => e.stopPropagation());
  input.addEventListener("focus", () => input.select());
  row.appendChild(input);

  if (unit) {
    const unitEl = document.createElement("span");
    unitEl.style.cssText = "font-size:11px;color:var(--muted-foreground);flex-shrink:0;width:14px;";
    unitEl.textContent = unit;
    row.appendChild(unitEl);
  }

  popup.appendChild(row);
  return input;
}

// Adds two label + number input fields side-by-side to popup.
// Returns [input1, input2].
export function mkNumRowPair(popup,
  label1, value1, opts1 = {},
  label2, value2, opts2 = {}
) {
  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;gap:6px;";

  function _mkField(label, value, { min, max, step = 1, unit = "", onChange } = {}) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:4px;flex:1;min-width:0;";

    const lbl = document.createElement("span");
    lbl.style.cssText = "font-size:11px;color:var(--muted-foreground);flex-shrink:0;";
    lbl.textContent = label;
    wrap.appendChild(lbl);

    const input = document.createElement("input");
    input.type = "number";
    input.value = typeof value === "number" ? (Math.round(value * 10) / 10) : value;
    if (min !== undefined) input.min = min;
    if (max !== undefined) input.max = max;
    input.step = step;
    input.style.cssText = [
      "flex:1", "min-width:0",
      "background:var(--input,#2a2a2a)",
      "border:1px solid var(--border,#444)", "border-radius:4px",
      "color:var(--foreground,#eee)", "font-size:12px", "font-family:monospace",
      "padding:3px 4px", "height:28px", "box-sizing:border-box", "outline:none",
      "appearance:textfield", "-moz-appearance:textfield",
      "caret-color:var(--foreground,#eee)",
    ].join(";");
    input.addEventListener("input", () => { if (onChange) onChange(Number(input.value), false); });
    input.addEventListener("change", () => { if (onChange) onChange(Number(input.value), true); });
    input.addEventListener("keydown", (e) => e.stopPropagation());
    input.addEventListener("focus", () => input.select());
    wrap.appendChild(input);

    if (unit) {
      const unitEl = document.createElement("span");
      unitEl.style.cssText = "font-size:11px;color:var(--muted-foreground);flex-shrink:0;";
      unitEl.textContent = unit;
      wrap.appendChild(unitEl);
    }
    return { wrap, input };
  }

  const f1 = _mkField(label1, value1, opts1);
  const f2 = _mkField(label2, value2, opts2);
  row.appendChild(f1.wrap);
  row.appendChild(f2.wrap);
  popup.appendChild(row);
  return [f1.input, f2.input];
}

// 2D drag pad for X/Y coordinate pairs. Appends to popup.
// Drag the square to translate in 2D; number inputs stay in sync.
// opts: { unit, step, onXY(newX, newY, doEmit) }
// step is also used as drag sensitivity (1px screen = step value-units).
export function mkXYPad(popup, xVal, yVal, { unit = "", step = 1, onXY } = {}) {
  const PAD = 44;

  const outer = document.createElement("div");
  outer.style.cssText = "display:flex;align-items:flex-start;gap:8px;";

  // ── Pad ──
  const pad = document.createElement("div");
  pad.style.cssText = [
    `width:${PAD}px`, `height:${PAD}px`, "flex-shrink:0",
    "background:var(--input,#2a2a2a)",
    "border:1px solid var(--border,#444)", "border-radius:6px",
    "position:relative", "cursor:crosshair",
    "touch-action:none", "user-select:none",
  ].join(";");

  const crossSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  crossSvg.setAttribute("width", PAD);
  crossSvg.setAttribute("height", PAD);
  crossSvg.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;";
  const half = PAD / 2;
  crossSvg.innerHTML =
    `<line x1="${half}" y1="7" x2="${half}" y2="${PAD - 7}" stroke="var(--border,#555)" stroke-width="1"/>` +
    `<line x1="7" y1="${half}" x2="${PAD - 7}" y2="${half}" stroke="var(--border,#555)" stroke-width="1"/>` +
    `<circle cx="${half}" cy="${half}" r="2.5" fill="var(--muted-foreground,#888)"/>`;
  pad.appendChild(crossSvg);

  // ── X/Y input stack ──
  const inputStack = document.createElement("div");
  inputStack.style.cssText = "display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;";

  const INPUT_CSS = [
    "flex:1", "min-width:0",
    "background:var(--input,#2a2a2a)",
    "border:1px solid var(--border,#444)", "border-radius:4px",
    "color:var(--foreground,#eee)", "font-size:12px", "font-family:monospace",
    "padding:3px 4px", "height:26px", "box-sizing:border-box", "outline:none",
    "appearance:textfield", "-moz-appearance:textfield",
    "caret-color:var(--foreground,#eee)",
  ].join(";");

  function _mkInputRow(label, value) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:4px;";

    const lbl = document.createElement("span");
    lbl.style.cssText =
      "font-size:11px;color:var(--muted-foreground);flex-shrink:0;width:10px;text-align:center;";
    lbl.textContent = label;

    const input = document.createElement("input");
    input.type  = "number";
    input.value = Math.round(value * 10) / 10;
    input.step  = step;
    input.style.cssText = INPUT_CSS;
    input.addEventListener("keydown", (e) => e.stopPropagation());
    input.addEventListener("focus",   () => input.select());

    row.appendChild(lbl);
    row.appendChild(input);
    if (unit) {
      const unitEl = document.createElement("span");
      unitEl.style.cssText = "font-size:11px;color:var(--muted-foreground);flex-shrink:0;";
      unitEl.textContent = unit;
      row.appendChild(unitEl);
    }
    inputStack.appendChild(row);
    return input;
  }

  const xInput = _mkInputRow("X", xVal);
  const yInput = _mkInputRow("Y", yVal);

  // ── Shared state ──
  let curX = xVal, curY = yVal;

  xInput.addEventListener("input",  () => { curX = Number(xInput.value); if (onXY) onXY(curX, curY, false); });
  xInput.addEventListener("change", () => { curX = Number(xInput.value); if (onXY) onXY(curX, curY, true);  });
  yInput.addEventListener("input",  () => { curY = Number(yInput.value); if (onXY) onXY(curX, curY, false); });
  yInput.addEventListener("change", () => { curY = Number(yInput.value); if (onXY) onXY(curX, curY, true);  });

  // ── Drag ──
  let dragging = false, lastCX = 0, lastCY = 0;

  pad.addEventListener("pointerdown", (e) => {
    e.stopPropagation(); e.preventDefault();
    pad.setPointerCapture(e.pointerId);
    pad.style.cursor = "grabbing";
    dragging = true;
    lastCX = e.clientX; lastCY = e.clientY;
    curX = Number(xInput.value);
    curY = Number(yInput.value);
  });
  pad.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    curX += (e.clientX - lastCX) * step;
    curY += (e.clientY - lastCY) * step;
    lastCX = e.clientX; lastCY = e.clientY;
    xInput.value = Math.round(curX * 10) / 10;
    yInput.value = Math.round(curY * 10) / 10;
    if (onXY) onXY(curX, curY, false);
  });
  pad.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    pad.style.cursor = "crosshair";
    pad.releasePointerCapture(e.pointerId);
    if (onXY) onXY(curX, curY, true);
  });

  outer.appendChild(pad);
  outer.appendChild(inputStack);
  popup.appendChild(outer);
}

// Single-axis scrubby label + number input row. Appends to popup.
// The label text is draggable (cursor:ew-resize); dragging 1px = step value-units.
// Same opts as mkNumRow: { min, max, step, unit, onChange(v, doEmit) }
// Returns the input element.
export function mkScrubNumRow(popup, label, value, { min, max, step = 1, unit = "", onChange } = {}) {
  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;gap:6px;";

  const lbl = document.createElement("span");
  lbl.style.cssText = [
    "font-size:11px", "color:var(--muted-foreground)",
    "width:52px", "flex-shrink:0",
    "cursor:ew-resize", "user-select:none", "touch-action:none",
  ].join(";");
  lbl.textContent = label;

  const input = document.createElement("input");
  input.type  = "number";
  input.value = typeof value === "number" ? (Math.round(value * 10) / 10) : value;
  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;
  input.step  = step;
  input.style.cssText = [
    "flex:1", "min-width:0",
    "background:var(--input,#2a2a2a)",
    "border:1px solid var(--border,#444)", "border-radius:4px",
    "color:var(--foreground,#eee)", "font-size:12px", "font-family:monospace",
    "padding:3px 6px", "height:28px", "box-sizing:border-box", "outline:none",
    "appearance:textfield", "-moz-appearance:textfield",
    "caret-color:var(--foreground,#eee)",
  ].join(";");
  input.addEventListener("input",   () => { if (onChange) onChange(Number(input.value), false); });
  input.addEventListener("change",  () => { if (onChange) onChange(Number(input.value), true);  });
  input.addEventListener("keydown", (e) => e.stopPropagation());
  input.addEventListener("focus",   () => input.select());

  // ── Label scrub drag ──
  let dragging = false, startCX = 0, startVal = 0, lastVal = 0;

  function _clamp(v) {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  }

  lbl.addEventListener("pointerdown", (e) => {
    e.stopPropagation(); e.preventDefault();
    lbl.setPointerCapture(e.pointerId);
    dragging = true;
    startCX  = e.clientX;
    startVal = Number(input.value);
    lastVal  = startVal;
  });
  lbl.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    lastVal = _clamp(startVal + (e.clientX - startCX) * step);
    input.value = Math.round(lastVal * 10) / 10;
    if (onChange) onChange(lastVal, false);
  });
  lbl.addEventListener("pointerup", (e) => {
    if (!dragging) return;
    dragging = false;
    lbl.releasePointerCapture(e.pointerId);
    if (onChange) onChange(lastVal, true);
  });

  row.appendChild(lbl);
  row.appendChild(input);
  if (unit) {
    const unitEl = document.createElement("span");
    unitEl.style.cssText = "font-size:11px;color:var(--muted-foreground);flex-shrink:0;width:14px;";
    unitEl.textContent = unit;
    row.appendChild(unitEl);
  }
  popup.appendChild(row);
  return input;
}

// Wires a toggle-open/close pattern to a pill trigger button.
// buildContent(popup, dismiss) — dismiss closes the popup from inside content handlers.
// Returns a dismiss() function so callers can close the popup programmatically.
export function wirePopupToggle(btn, buildContent) {
  let _dismiss = null;

  btn.addEventListener("pointerdown", (e) => {
    e.stopPropagation(); e.preventDefault(); btn.blur();
    if (_dismiss) { _dismiss(); return; }

    const { popup, dismiss } = openPopup(btn, {
      onDismiss: () => { btn.classList.remove("active"); _dismiss = null; },
    });
    btn.classList.add("active");
    _dismiss = dismiss;
    buildContent(popup, dismiss);
  });

  return () => { if (_dismiss) _dismiss(); };
}
