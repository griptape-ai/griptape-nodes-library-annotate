// _popup_style.js — Style popup for the AnnotateImage widget.
//
// Exports createStylePopup(settingsArea, deps) → { buildForTool(toolSettings, activeTool),
//                                                   buildForAnnotation(ann),
//                                                   buildForMulti(selIds) }
//
// Tool mode:        size/width slider(s), tool-specific toggles
// Annotation mode:  same controls but write back to the annotation + sync tool settings
// Multi-select:     Scale% slider (line widths only), head size if arrows present

import { mkIcon } from './_icons.js';
import { buildPopupTrigger, wirePopupToggle, mkSectionLabel, mkDivider } from './_popup_utils.js';
import {
  DEFAULT_COLOR,
  DEFAULT_PAINT_SIZE, MIN_PAINT_SIZE, MAX_PAINT_SIZE,
  DEFAULT_TEXT_SIZE,  MIN_TEXT_SIZE,  MAX_TEXT_SIZE,
  DEFAULT_ARROW_WIDTH, MIN_ARROW_WIDTH, MAX_ARROW_WIDTH,
  DEFAULT_ARROW_SIZE, MIN_ARROW_SIZE, MAX_ARROW_SIZE,
  DEFAULT_SHAPE_WIDTH, MIN_SHAPE_WIDTH, MAX_SHAPE_WIDTH,
} from './_styles.js';

export function createStylePopup(settingsArea, {
  addTooltip,
  getState,
  setCurrentValue,
  applySingleUpdate,
  applyAnnotationMap,
  effectiveAnnotations,
  autoResizeTextarea,
  renderCanvas,
  emit,
  rebuild,
}) {

  // ── shared UI primitives ─────────────────────────────────────────────────────

  function _fmtNum(v) {
    const n = Number(v);
    if (!isFinite(n)) return "0";
    if (Number.isInteger(n)) return String(n);
    const r = Math.round(n * 100) / 100;
    return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0+$/, "");
  }

  // Adds a labeled range slider + value readout to container.
  function _mkSlider(container, label, min, max, value, onChange) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:6px;";

    const lbl = document.createElement("span");
    lbl.className = "ais-setting-label";
    lbl.textContent = label;
    wrap.appendChild(lbl);

    const slider = document.createElement("input");
    slider.type = "range";
    slider.className = "ais-range";
    slider.style.cssText = "flex:1;min-width:60px;";
    slider.min = min; slider.max = max; slider.value = value;

    const valLbl = document.createElement("span");
    valLbl.className = "ais-val-label";
    valLbl.textContent = _fmtNum(value);

    slider.addEventListener("input", () => {
      const sz = Number(slider.value);
      valLbl.textContent = _fmtNum(sz);
      onChange(sz, false);
    });
    slider.addEventListener("change", () => onChange(Number(slider.value), true));

    wrap.appendChild(slider);
    wrap.appendChild(valLbl);
    container.appendChild(wrap);
  }

  // Adds text alignment toggle buttons to container.
  function _mkTextAlignButtons(container, currentAlign, onChange) {
    const ALIGNS = [
      { value: "left",   icon: "align-left",   title: "Align left"   },
      { value: "center", icon: "align-center",  title: "Align center" },
      { value: "right",  icon: "align-right",   title: "Align right"  },
    ];
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:2px;";
    for (const a of ALIGNS) {
      const btn = document.createElement("button");
      btn.className = "ais-toggle-btn" + (currentAlign === a.value ? " active" : "");
      addTooltip(btn, a.title);
      btn.style.cssText = "width:26px;height:26px;";
      btn.appendChild(mkIcon(a.icon, 14));
      btn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        row.querySelectorAll(".ais-toggle-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        onChange(a.value);
      });
      row.appendChild(btn);
    }
    container.appendChild(row);
  }

  // Adds arrow-specific toggle buttons (start/end arrowhead, bezier, taper) to container.
  function _mkArrowToggles(container, source, onToggle) {
    const makeBtn = (content, title, active, onClick) => {
      const btn = document.createElement("button");
      btn.className = "ais-toggle-btn" + (active ? " active" : "");
      addTooltip(btn, title);
      btn.style.cssText = "font-size:14px;font-weight:bold;width:26px;height:26px;line-height:1;";
      if (typeof content === "string") btn.textContent = content;
      else btn.appendChild(content);
      btn.addEventListener("pointerdown", (e) => { e.stopPropagation(); onClick(); });
      return btn;
    };
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:2px;";
    row.appendChild(makeBtn("←", "Start arrowhead", source.has_start_arrow ?? false, () => {
      onToggle({ has_start_arrow: !(source.has_start_arrow ?? false) });
    }));
    row.appendChild(makeBtn("→", "End arrowhead", source.has_end_arrow ?? true, () => {
      onToggle({ has_end_arrow: !(source.has_end_arrow ?? true) });
    }));
    row.appendChild(makeBtn(mkIcon("bezier", 14), "Bezier curve", source.is_bezier ?? false, () => {
      onToggle({ is_bezier: !(source.is_bezier ?? false) });
    }));
    row.appendChild(makeBtn(mkIcon("taper", 14), "Taper stroke width", source.taper ?? false, () => {
      onToggle({ taper: !(source.taper ?? false) });
    }));
    container.appendChild(row);
  }

  // ── tool-mode content builders ───────────────────────────────────────────────

  function _buildPaintToolContent(popup, ts) {
    mkSectionLabel(popup, "Brush");
    _mkSlider(popup, "Size", MIN_PAINT_SIZE, MAX_PAINT_SIZE, ts.size ?? DEFAULT_PAINT_SIZE,
      (sz, doEmit) => {
        const s = getState();
        s.toolSettings.paint.size = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      });
    mkDivider(popup);
    mkSectionLabel(popup, "Pressure");
    const pressureOn = ts.pressure ?? false;
    const pressureRow = document.createElement("div");
    pressureRow.style.cssText = "display:flex;align-items:center;gap:6px;";
    const pressureBtn = document.createElement("button");
    pressureBtn.className = "ais-toggle-btn" + (pressureOn ? " active" : "");
    addTooltip(pressureBtn, "Pressure sensitivity (tablet/stylus only)");
    pressureBtn.style.cssText = "width:26px;height:26px;flex-shrink:0;";
    pressureBtn.appendChild(mkIcon("pressure", 14));
    pressureBtn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      const s = getState();
      s.toolSettings.paint.pressure = !pressureOn;
      setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
      rebuild(); emit();
    });
    pressureRow.appendChild(pressureBtn);
    const pressureLbl = document.createElement("span");
    pressureLbl.style.cssText = "font-size:11px;color:var(--muted-foreground);";
    pressureLbl.textContent = pressureOn ? "On" : "Off";
    pressureRow.appendChild(pressureLbl);
    popup.appendChild(pressureRow);

    if (pressureOn) {
      const currentMax = ts.size ?? DEFAULT_PAINT_SIZE;
      _mkSlider(popup, "Min", 0, Math.max(1, currentMax - 1), ts.pressureMin ?? 1,
        (sz, doEmit) => {
          const s = getState();
          s.toolSettings.paint.pressureMin = sz;
          setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
          if (doEmit) emit();
        });
    }
  }

  function _buildTextToolContent(popup, ts) {
    mkSectionLabel(popup, "Font");
    _mkSlider(popup, "Size", MIN_TEXT_SIZE, MAX_TEXT_SIZE, ts.font_size ?? DEFAULT_TEXT_SIZE,
      (sz, doEmit) => {
        const s = getState();
        s.toolSettings.text.font_size = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        if (s.textEditId) {
          s.textInput.style.fontSize = sz * s.displayScale * s.viewScale + "px";
          autoResizeTextarea();
          setCurrentValue({
            ...getState().currentValue,
            annotations: getState().currentValue.annotations.map((a) =>
              a.id === s.textEditId ? { ...a, font_size: sz } : a
            ),
          });
        }
        renderCanvas(); if (doEmit) emit();
      });
    mkDivider(popup);
    mkSectionLabel(popup, "Alignment");
    _mkTextAlignButtons(popup, ts.text_align || "left", (align) => {
      const s = getState();
      s.toolSettings.text.text_align = align;
      setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
      if (s.textEditId) {
        s.textInput.style.textAlign = align;
        setCurrentValue({
          ...getState().currentValue,
          annotations: getState().currentValue.annotations.map((a) =>
            a.id === s.textEditId ? { ...a, text_align: align } : a
          ),
        });
      }
      renderCanvas(); emit();
    });
  }

  function _buildArrowToolContent(popup, ts) {
    mkSectionLabel(popup, "Stroke");
    _mkSlider(popup, "Width", MIN_ARROW_WIDTH, MAX_ARROW_WIDTH, ts.width ?? DEFAULT_ARROW_WIDTH,
      (sz, doEmit) => {
        const s = getState();
        s.toolSettings.arrow.width = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      });
    _mkSlider(popup, "Head", MIN_ARROW_SIZE, MAX_ARROW_SIZE, ts.arrow_size ?? DEFAULT_ARROW_SIZE,
      (sz, doEmit) => {
        const s = getState();
        s.toolSettings.arrow.arrow_size = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      });
    mkDivider(popup);
    mkSectionLabel(popup, "Style");
    _mkArrowToggles(popup, ts, (changes) => {
      const s = getState();
      s.toolSettings.arrow = { ...s.toolSettings.arrow, ...changes };
      setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
      rebuild(); renderCanvas(); emit();
    });
  }

  function _buildShapeToolContent(popup, ts, activeTool) {
    mkSectionLabel(popup, "Stroke");
    _mkSlider(popup, "Width", MIN_SHAPE_WIDTH, MAX_SHAPE_WIDTH, ts.width ?? DEFAULT_SHAPE_WIDTH,
      (sz, doEmit) => {
        const s = getState();
        s.toolSettings[activeTool].width = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      });
  }

  // ── annotation-mode content builders ────────────────────────────────────────

  function _buildPaintAnnContent(popup, ann) {
    const baseSize = (ann.strokes && ann.strokes[0]) ? (ann.strokes[0].size ?? DEFAULT_PAINT_SIZE) : DEFAULT_PAINT_SIZE;
    const currentSize = Math.max(MIN_PAINT_SIZE, Math.round(baseSize * (ann.sizeScale ?? 1)));
    mkSectionLabel(popup, "Brush");
    _mkSlider(popup, "Size", MIN_PAINT_SIZE, MAX_PAINT_SIZE, currentSize, (sz, doEmit) => {
      applySingleUpdate(ann.id, (a) => ({ ...a, sizeScale: sz / baseSize }));
      const s = getState();
      s.toolSettings.paint.size = sz;
      setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
      renderCanvas(); if (doEmit) emit();
    });
  }

  function _buildTextAnnContent(popup, ann) {
    mkSectionLabel(popup, "Font");
    _mkSlider(popup, "Size", MIN_TEXT_SIZE, MAX_TEXT_SIZE, ann.font_size ?? DEFAULT_TEXT_SIZE,
      (sz, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, font_size: sz }));
        const s = getState();
        s.toolSettings.text.font_size = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        if (s.textInput && s.textEditId === ann.id) {
          s.textInput.style.fontSize = sz * s.displayScale * s.viewScale + "px";
          autoResizeTextarea();
        }
        renderCanvas(); if (doEmit) emit();
      });
    mkDivider(popup);
    mkSectionLabel(popup, "Alignment");
    _mkTextAlignButtons(popup, ann.text_align || "left", (align) => {
      applySingleUpdate(ann.id, (a) => ({ ...a, text_align: align }));
      const s = getState();
      s.toolSettings.text.text_align = align;
      setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
      if (s.textInput && s.textEditId === ann.id) s.textInput.style.textAlign = align;
      renderCanvas(); emit();
    });
  }

  function _buildArrowAnnContent(popup, ann) {
    mkSectionLabel(popup, "Stroke");
    _mkSlider(popup, "Width", MIN_ARROW_WIDTH, MAX_ARROW_WIDTH, ann.width ?? DEFAULT_ARROW_WIDTH,
      (sz, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, width: sz }));
        const s = getState();
        s.toolSettings.arrow.width = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      });
    _mkSlider(popup, "Head", MIN_ARROW_SIZE, MAX_ARROW_SIZE, ann.arrow_size ?? DEFAULT_ARROW_SIZE,
      (sz, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, arrow_size: sz }));
        const s = getState();
        s.toolSettings.arrow.arrow_size = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      });
    mkDivider(popup);
    mkSectionLabel(popup, "Style");
    _mkArrowToggles(popup, ann, (changes) => {
      applySingleUpdate(ann.id, (a) => ({ ...a, ...changes }));
      const s = getState();
      s.toolSettings.arrow = { ...s.toolSettings.arrow, ...changes };
      setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
      rebuild(); renderCanvas(); emit();
    });
  }

  function _buildShapeAnnContent(popup, ann) {
    mkSectionLabel(popup, "Stroke");
    _mkSlider(popup, "Width", MIN_SHAPE_WIDTH, MAX_SHAPE_WIDTH, ann.width ?? DEFAULT_SHAPE_WIDTH,
      (sz, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, width: sz }));
        const s = getState();
        s.toolSettings[ann.type].width = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      });
  }

  // ── multi-select content ─────────────────────────────────────────────────────

  function _buildMultiContent(popup, selIds) {
    const anns = effectiveAnnotations().filter((a) => selIds.includes(a.id));
    const origSizes = {}, origArrowSizes = {};
    for (const a of anns) {
      if (a.type === "paint") origSizes[a.id] = a.sizeScale ?? 1;
      else if (a.type === "arrow") {
        origSizes[a.id] = a.width ?? DEFAULT_ARROW_WIDTH;
        origArrowSizes[a.id] = a.arrow_size ?? DEFAULT_ARROW_SIZE;
      } else if (a.type === "rect" || a.type === "ellipse") origSizes[a.id] = a.width ?? DEFAULT_SHAPE_WIDTH;
    }
    mkSectionLabel(popup, "Scale");
    _mkSlider(popup, "Scale %", 25, 400, 100, (val, doEmit) => {
      const ratio = val / 100;
      const { annotations, overrides } = applyAnnotationMap(selIds, (a) => {
        if (a.type === "paint")   return { ...a, sizeScale: (origSizes[a.id] ?? 1) * ratio };
        if (a.type === "text")    return a;
        if (a.type === "arrow")   return {
          ...a,
          width:      Math.max(1, (origSizes[a.id] ?? DEFAULT_ARROW_WIDTH) * ratio),
          arrow_size: Math.max(5, (origArrowSizes[a.id] ?? DEFAULT_ARROW_SIZE) * ratio),
        };
        if (a.type === "rect" || a.type === "ellipse") return {
          ...a, width: Math.max(1, (origSizes[a.id] ?? DEFAULT_SHAPE_WIDTH) * ratio),
        };
        return a;
      });
      setCurrentValue({ ...getState().currentValue, annotations, overrides });
      renderCanvas(); if (doEmit) emit();
    });
    const arrowAnns = anns.filter((a) => a.type === "arrow");
    if (arrowAnns.length > 0) {
      mkDivider(popup);
      mkSectionLabel(popup, "Arrow Head");
      _mkSlider(popup, "Head", MIN_ARROW_SIZE, MAX_ARROW_SIZE,
        arrowAnns[0].arrow_size ?? DEFAULT_ARROW_SIZE, (sz, doEmit) => {
          const { annotations, overrides } = applyAnnotationMap(selIds, (a) => {
            if (a.type === "arrow") return { ...a, arrow_size: sz };
            return a;
          });
          setCurrentValue({ ...getState().currentValue, annotations, overrides });
          renderCanvas(); if (doEmit) emit();
        });
    }
  }

  // ── public API ───────────────────────────────────────────────────────────────

  function buildForTool(toolSettings, activeTool) {
    const btn = buildPopupTrigger(settingsArea, "Style", "paintbrush", true);
    wirePopupToggle(btn, (popup) => {
      const ts = toolSettings[activeTool] || {};
      if (activeTool === "paint")                              _buildPaintToolContent(popup, ts);
      else if (activeTool === "text")                          _buildTextToolContent(popup, ts);
      else if (activeTool === "arrow")                         _buildArrowToolContent(popup, ts);
      else if (activeTool === "rect" || activeTool === "ellipse") _buildShapeToolContent(popup, ts, activeTool);
    });
  }

  function buildForAnnotation(ann) {
    const btn = buildPopupTrigger(settingsArea, "Style", "paintbrush", true);
    wirePopupToggle(btn, (popup) => {
      if (ann.type === "paint")                              _buildPaintAnnContent(popup, ann);
      else if (ann.type === "text")                          _buildTextAnnContent(popup, ann);
      else if (ann.type === "arrow")                         _buildArrowAnnContent(popup, ann);
      else if (ann.type === "rect" || ann.type === "ellipse") _buildShapeAnnContent(popup, ann);
    });
  }

  function buildForMulti(selIds) {
    const btn = buildPopupTrigger(settingsArea, "Style", "paintbrush", true);
    wirePopupToggle(btn, (popup) => _buildMultiContent(popup, selIds));
  }

  return { buildForTool, buildForAnnotation, buildForMulti };
}
