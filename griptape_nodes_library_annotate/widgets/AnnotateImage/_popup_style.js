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
import { buildPopupTrigger, wirePopupToggle, mkSectionLabel, mkDivider, mkScrubNumRow } from './_popup_utils.js';
import {
  DEFAULT_PAINT_SIZE, MIN_PAINT_SIZE, MAX_PAINT_SIZE,
  DEFAULT_TEXT_SIZE,  MIN_TEXT_SIZE,  MAX_TEXT_SIZE,
  DEFAULT_ARROW_WIDTH, MIN_ARROW_WIDTH, MAX_ARROW_WIDTH,
  DEFAULT_ARROW_SIZE, MIN_ARROW_SIZE, MAX_ARROW_SIZE,
  DEFAULT_ARROW_HEAD_WIDTH, MIN_ARROW_HEAD_WIDTH, MAX_ARROW_HEAD_WIDTH,
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

  // Bezier + taper icon toggles — shown under STYLE.
  // taperMinOpts: { value, min, max, step, onChange } — when provided and source.taper is true,
  // a compact scrubby "Min" field is appended inline after the taper button.
  function _mkArrowToggles(container, source, onToggle, taperMinOpts = null) {
    const makeIconBtn = (content, title, active, onClick) => {
      const btn = document.createElement("button");
      btn.className = "ais-toggle-btn" + (active ? " active" : "");
      addTooltip(btn, title);
      btn.style.cssText = "width:26px;height:26px;";
      btn.appendChild(content);
      btn.addEventListener("pointerdown", (e) => { e.stopPropagation(); onClick(); });
      return btn;
    };
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:2px;";
    row.appendChild(makeIconBtn(mkIcon("bezier", 14), "Bezier curve",       source.is_bezier ?? false, () => onToggle({ is_bezier: !(source.is_bezier ?? false) })));
    row.appendChild(makeIconBtn(mkIcon("taper",  14), "Taper stroke width", source.taper     ?? false, () => onToggle({ taper:     !(source.taper     ?? false) })));
    if (source.taper && taperMinOpts) {
      const sep = document.createElement("div");
      sep.style.cssText = "width:1px;height:18px;background:var(--border);margin:0 4px;flex-shrink:0;";
      row.appendChild(sep);
      const lbl = document.createElement("span");
      lbl.style.cssText = "font-size:11px;color:var(--muted-foreground);cursor:ew-resize;user-select:none;touch-action:none;flex-shrink:0;";
      lbl.textContent = "Min";
      const inp = document.createElement("input");
      inp.type = "number";
      inp.value = Math.round((taperMinOpts.value ?? 0) * 10) / 10;
      if (taperMinOpts.min !== undefined) inp.min = taperMinOpts.min;
      if (taperMinOpts.max !== undefined) inp.max = taperMinOpts.max;
      inp.step = taperMinOpts.step ?? 1;
      inp.style.cssText = [
        "width:52px", "min-width:0",
        "background:var(--input,#2a2a2a)",
        "border:1px solid var(--border,#444)", "border-radius:4px",
        "color:var(--foreground,#eee)", "font-size:12px", "font-family:monospace",
        "padding:3px 6px", "height:28px", "box-sizing:border-box", "outline:none",
        "appearance:textfield", "-moz-appearance:textfield",
        "caret-color:var(--foreground,#eee)", "margin-left:4px",
      ].join(";");
      let dragging = false, startCX = 0, startVal = 0, lastVal = 0;
      const _step = taperMinOpts.step ?? 1;
      const _clamp = (v) => {
        if (taperMinOpts.min !== undefined) v = Math.max(taperMinOpts.min, v);
        if (taperMinOpts.max !== undefined) v = Math.min(taperMinOpts.max, v);
        return v;
      };
      lbl.addEventListener("pointerdown", (e) => {
        e.stopPropagation(); e.preventDefault();
        lbl.setPointerCapture(e.pointerId);
        dragging = true; startCX = e.clientX; startVal = Number(inp.value); lastVal = startVal;
      });
      lbl.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        lastVal = _clamp(startVal + (e.clientX - startCX) * _step);
        inp.value = Math.round(lastVal * 10) / 10;
        taperMinOpts.onChange?.(lastVal, false);
      });
      lbl.addEventListener("pointerup", (e) => {
        if (!dragging) return;
        dragging = false; lbl.releasePointerCapture(e.pointerId);
        taperMinOpts.onChange?.(lastVal, true);
      });
      inp.addEventListener("input",   () => taperMinOpts.onChange?.(Number(inp.value), false));
      inp.addEventListener("change",  () => taperMinOpts.onChange?.(Number(inp.value), true));
      inp.addEventListener("keydown", (e) => e.stopPropagation());
      inp.addEventListener("focus",   () => inp.select());
      row.appendChild(lbl);
      row.appendChild(inp);
    }
    container.appendChild(row);
  }

  // Per-end cap shape selectors — shown under HEAD.
  function _mkArrowShapeRows(container, source, onToggle) {
    const END_SHAPES = [
      { value: "none",     icon: "—",  title: "No cap"           },
      { value: "triangle", icon: "▶",  title: "Filled triangle"  },
      { value: "open",     icon: "▷",  title: "Open triangle"    },
      { value: "dot",      icon: "●",  title: "Dot"              },
      { value: "bar",      icon: "|",  title: "Bar"              },
      { value: "square",   icon: "■",  title: "Square"           },
      { value: "diamond",  icon: "◆",  title: "Diamond"          },
    ];
    const START_SHAPES = [
      { value: "none",     icon: "—",  title: "No cap"           },
      { value: "triangle", icon: "◀",  title: "Filled triangle"  },
      { value: "open",     icon: "◁",  title: "Open triangle"    },
      { value: "dot",      icon: "●",  title: "Dot"              },
      { value: "bar",      icon: "|",  title: "Bar"              },
      { value: "square",   icon: "■",  title: "Square"           },
      { value: "diamond",  icon: "◆",  title: "Diamond"          },
    ];
    const currentEnd   = source.end_arrow_shape   ?? (source.has_end_arrow   !== false ? "triangle" : "none");
    const currentStart = source.start_arrow_shape ?? (source.has_start_arrow             ? "triangle" : "none");
    const mkRow = (label, shapes, current, field) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:2px;";
      const lbl = document.createElement("span");
      lbl.className = "ais-setting-label";
      lbl.style.cssText = "min-width:34px;flex-shrink:0;";
      lbl.textContent = label;
      row.appendChild(lbl);
      for (const s of shapes) {
        const btn = document.createElement("button");
        btn.className = "ais-toggle-btn" + (current === s.value ? " active" : "");
        addTooltip(btn, s.title);
        btn.style.cssText = "font-size:12px;width:22px;height:22px;line-height:1;";
        btn.textContent = s.icon;
        btn.addEventListener("pointerdown", (e) => { e.stopPropagation(); onToggle({ [field]: s.value }); });
        row.appendChild(btn);
      }
      container.appendChild(row);
    };
    mkRow("End",   END_SHAPES,   currentEnd,   "end_arrow_shape");
    mkRow("Start", START_SHAPES, currentStart, "start_arrow_shape");
  }

  // ── tool-mode content builders ───────────────────────────────────────────────

  function _buildPaintToolContent(popup, ts) {
    mkSectionLabel(popup, "Brush");
    mkScrubNumRow(popup, "Size", ts.size ?? DEFAULT_PAINT_SIZE,
      { min: MIN_PAINT_SIZE, max: MAX_PAINT_SIZE, step: 1, onChange: (sz, doEmit) => {
        const s = getState();
        s.toolSettings.paint.size = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      } });
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
      emit();
      popup.innerHTML = "";
      _buildPaintToolContent(popup, getState().toolSettings.paint);
    });
    pressureRow.appendChild(pressureBtn);
    const pressureLbl = document.createElement("span");
    pressureLbl.style.cssText = "font-size:11px;color:var(--muted-foreground);";
    pressureLbl.textContent = pressureOn ? "On" : "Off";
    pressureRow.appendChild(pressureLbl);
    popup.appendChild(pressureRow);

    if (pressureOn) {
      const currentMax = ts.size ?? DEFAULT_PAINT_SIZE;
      mkScrubNumRow(popup, "Min size", ts.pressureMin ?? 1,
        { min: 0, max: Math.max(1, currentMax - 1), step: 1, onChange: (sz, doEmit) => {
          const s = getState();
          s.toolSettings.paint.pressureMin = sz;
          setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
          if (doEmit) emit();
        } });
    }
  }

  function _buildTextToolContent(popup, ts) {
    mkSectionLabel(popup, "Font");
    mkScrubNumRow(popup, "Size", ts.font_size ?? DEFAULT_TEXT_SIZE,
      { min: MIN_TEXT_SIZE, max: MAX_TEXT_SIZE, step: 1, onChange: (sz, doEmit) => {
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
      } });
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
    const currentWidth = ts.width ?? DEFAULT_ARROW_WIDTH;
    mkSectionLabel(popup, "Stroke");
    mkScrubNumRow(popup, "Width", currentWidth,
      { min: MIN_ARROW_WIDTH, max: MAX_ARROW_WIDTH, step: 1, onChange: (sz, doEmit) => {
        const s = getState();
        s.toolSettings.arrow.width = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      } });
    mkDivider(popup);
    mkSectionLabel(popup, "Style");
    _mkArrowToggles(popup, ts, (changes) => {
      const s = getState();
      s.toolSettings.arrow = { ...s.toolSettings.arrow, ...changes };
      setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
      renderCanvas(); emit();
      popup.innerHTML = "";
      _buildArrowToolContent(popup, getState().toolSettings.arrow);
    }, { value: ts.taperMin ?? 0, min: 0, max: Math.max(1, currentWidth - 1), step: 1, onChange: (sz, doEmit) => {
      const s = getState();
      s.toolSettings.arrow.taperMin = sz;
      setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
      renderCanvas(); if (doEmit) emit();
    } });
    mkDivider(popup);
    mkSectionLabel(popup, "Head");
    _mkArrowShapeRows(popup, ts, (changes) => {
      const s = getState();
      s.toolSettings.arrow = { ...s.toolSettings.arrow, ...changes };
      setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
      renderCanvas(); emit();
      popup.innerHTML = "";
      _buildArrowToolContent(popup, getState().toolSettings.arrow);
    });
    mkScrubNumRow(popup, "Length", ts.arrow_size ?? DEFAULT_ARROW_SIZE,
      { min: MIN_ARROW_SIZE, max: MAX_ARROW_SIZE, step: 1, onChange: (sz, doEmit) => {
        const s = getState();
        s.toolSettings.arrow.arrow_size = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      } });
    mkScrubNumRow(popup, "Width", ts.arrow_head_width ?? DEFAULT_ARROW_HEAD_WIDTH,
      { min: MIN_ARROW_HEAD_WIDTH, max: MAX_ARROW_HEAD_WIDTH, step: 1, onChange: (sz, doEmit) => {
        const s = getState();
        s.toolSettings.arrow.arrow_head_width = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      } });
  }

  function _buildShapeToolContent(popup, ts, activeTool) {
    mkSectionLabel(popup, "Stroke");
    mkScrubNumRow(popup, "Width", ts.width ?? DEFAULT_SHAPE_WIDTH,
      { min: MIN_SHAPE_WIDTH, max: MAX_SHAPE_WIDTH, step: 1, onChange: (sz, doEmit) => {
        const s = getState();
        s.toolSettings[activeTool].width = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      } });
  }

  // ── annotation-mode content builders ────────────────────────────────────────

  function _buildPaintAnnContent(popup, ann) {
    const baseSize = (ann.strokes && ann.strokes[0]) ? (ann.strokes[0].size ?? DEFAULT_PAINT_SIZE) : DEFAULT_PAINT_SIZE;
    const currentSize = Math.max(MIN_PAINT_SIZE, Math.round(baseSize * (ann.sizeScale ?? 1)));
    mkSectionLabel(popup, "Brush");
    mkScrubNumRow(popup, "Size", currentSize,
      { min: MIN_PAINT_SIZE, max: MAX_PAINT_SIZE, step: 1, onChange: (sz, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, sizeScale: sz / baseSize }));
        const s = getState();
        s.toolSettings.paint.size = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      } });
  }

  function _buildTextAnnContent(popup, ann) {
    mkSectionLabel(popup, "Font");
    mkScrubNumRow(popup, "Size", ann.font_size ?? DEFAULT_TEXT_SIZE,
      { min: MIN_TEXT_SIZE, max: MAX_TEXT_SIZE, step: 1, onChange: (sz, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, font_size: sz }));
        const s = getState();
        s.toolSettings.text.font_size = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        if (s.textInput && s.textEditId === ann.id) {
          s.textInput.style.fontSize = sz * s.displayScale * s.viewScale + "px";
          autoResizeTextarea();
        }
        renderCanvas(); if (doEmit) emit();
      } });
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
    const currentWidth = ann.width ?? DEFAULT_ARROW_WIDTH;
    const effectiveHeadWidth = ann.arrow_head_width ?? DEFAULT_ARROW_HEAD_WIDTH;
    mkSectionLabel(popup, "Stroke");
    mkScrubNumRow(popup, "Width", currentWidth,
      { min: MIN_ARROW_WIDTH, max: MAX_ARROW_WIDTH, step: 1, onChange: (sz, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, width: sz }));
        const s = getState();
        s.toolSettings.arrow.width = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      } });
    mkDivider(popup);
    mkSectionLabel(popup, "Style");
    _mkArrowToggles(popup, ann, (changes) => {
      applySingleUpdate(ann.id, (a) => ({ ...a, ...changes }));
      const s = getState();
      s.toolSettings.arrow = { ...s.toolSettings.arrow, ...changes };
      setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
      renderCanvas(); emit();
      const fresh = effectiveAnnotations().find((a) => a.id === ann.id) ?? { ...ann, ...changes };
      popup.innerHTML = "";
      _buildArrowAnnContent(popup, fresh);
    }, { value: ann.taperMin ?? 0, min: 0, max: Math.max(1, currentWidth - 1), step: 1, onChange: (sz, doEmit) => {
      applySingleUpdate(ann.id, (a) => ({ ...a, taperMin: sz }));
      const s = getState();
      s.toolSettings.arrow.taperMin = sz;
      setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
      renderCanvas(); if (doEmit) emit();
    } });
    mkDivider(popup);
    mkSectionLabel(popup, "Head");
    _mkArrowShapeRows(popup, ann, (changes) => {
      applySingleUpdate(ann.id, (a) => ({ ...a, ...changes }));
      const s = getState();
      s.toolSettings.arrow = { ...s.toolSettings.arrow, ...changes };
      setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
      renderCanvas(); emit();
      const fresh = effectiveAnnotations().find((a) => a.id === ann.id) ?? { ...ann, ...changes };
      popup.innerHTML = "";
      _buildArrowAnnContent(popup, fresh);
    });
    mkScrubNumRow(popup, "Length", ann.arrow_size ?? DEFAULT_ARROW_SIZE,
      { min: MIN_ARROW_SIZE, max: MAX_ARROW_SIZE, step: 1, onChange: (sz, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, arrow_size: sz }));
        const s = getState();
        s.toolSettings.arrow.arrow_size = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      } });
    mkScrubNumRow(popup, "Width", effectiveHeadWidth,
      { min: MIN_ARROW_HEAD_WIDTH, max: MAX_ARROW_HEAD_WIDTH, step: 1, onChange: (sz, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, arrow_head_width: sz }));
        const s = getState();
        s.toolSettings.arrow.arrow_head_width = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      } });
  }

  function _buildShapeAnnContent(popup, ann) {
    mkSectionLabel(popup, "Stroke");
    mkScrubNumRow(popup, "Width", ann.width ?? DEFAULT_SHAPE_WIDTH,
      { min: MIN_SHAPE_WIDTH, max: MAX_SHAPE_WIDTH, step: 1, onChange: (sz, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, width: sz }));
        const s = getState();
        s.toolSettings[ann.type].width = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      } });
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
    mkScrubNumRow(popup, "Scale", 100,
      { min: 25, max: 400, step: 1, unit: "%", onChange: (val, doEmit) => {
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
      } });
    const arrowAnns = anns.filter((a) => a.type === "arrow");
    if (arrowAnns.length > 0) {
      mkDivider(popup);
      mkSectionLabel(popup, "Arrow Head");
      mkScrubNumRow(popup, "Length", arrowAnns[0].arrow_size ?? DEFAULT_ARROW_SIZE,
        { min: MIN_ARROW_SIZE, max: MAX_ARROW_SIZE, step: 1, onChange: (sz, doEmit) => {
          const { annotations, overrides } = applyAnnotationMap(selIds, (a) => {
            if (a.type === "arrow") return { ...a, arrow_size: sz };
            return a;
          });
          setCurrentValue({ ...getState().currentValue, annotations, overrides });
          renderCanvas(); if (doEmit) emit();
        } });
      mkScrubNumRow(popup, "Width", arrowAnns[0].arrow_head_width ?? DEFAULT_ARROW_HEAD_WIDTH,
        { min: MIN_ARROW_HEAD_WIDTH, max: MAX_ARROW_HEAD_WIDTH, step: 1, onChange: (sz, doEmit) => {
          const { annotations, overrides } = applyAnnotationMap(selIds, (a) => {
            if (a.type === "arrow") return { ...a, arrow_head_width: sz };
            return a;
          });
          setCurrentValue({ ...getState().currentValue, annotations, overrides });
          renderCanvas(); if (doEmit) emit();
        } });
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
