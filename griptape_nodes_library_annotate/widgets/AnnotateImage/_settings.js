// Toolbar settings panel builders for the AnnotateImage widget.
// createSettings(settingsArea, deps) → { buildToolSettings, buildAnnotationSettings, buildMultiSettings }

import { mkIcon } from './_icons.js';
import { createColorPicker } from './_colorpicker.js';
import {
  DEFAULT_COLOR,
  DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT,
  DEFAULT_PAINT_SIZE, MIN_PAINT_SIZE, MAX_PAINT_SIZE,
  DEFAULT_TEXT_SIZE,  MIN_TEXT_SIZE,  MAX_TEXT_SIZE,
  DEFAULT_ARROW_WIDTH, MIN_ARROW_WIDTH, MAX_ARROW_WIDTH,
  DEFAULT_ARROW_SIZE, MIN_ARROW_SIZE, MAX_ARROW_SIZE,
  DEFAULT_SHAPE_WIDTH, MIN_SHAPE_WIDTH, MAX_SHAPE_WIDTH,
} from './_styles.js';

export function createSettings(settingsArea, {
  addTooltip,
  getState,         // () => { activeTool, toolSettings, currentValue, textEditId, textInput, displayScale, viewScale }
  setCurrentValue,  // (v) => void
  applySingleUpdate,
  applyAnnotationMap,
  effectiveAnnotations,
  autoResizeTextarea,
  renderCanvas,
  emit,
  rebuild,          // rebuildSettings()
}) {
  // Formats a number for display in slider labels.
  function _fmtNum(v) {
    const n = Number(v);
    if (!isFinite(n)) return "0";
    if (Number.isInteger(n)) return String(n);
    const r = Math.round(n * 100) / 100;
    return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0+$/, "");
  }

  // Appends a labeled range slider + value readout to settingsArea.
  function _buildSizeSlider(label, min, max, value, onChange) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:3px;flex-shrink:1;min-width:0;";
    const lbl = document.createElement("span");
    lbl.className = "ais-setting-label"; lbl.textContent = label;
    const slider = document.createElement("input");
    slider.type = "range"; slider.className = "ais-range";
    slider.min = min; slider.max = max; slider.value = value;
    const valLbl = document.createElement("span");
    valLbl.className = "ais-val-label"; valLbl.textContent = _fmtNum(value);
    slider.addEventListener("input", () => { const sz = Number(slider.value); valLbl.textContent = _fmtNum(sz); onChange(sz, false); });
    slider.addEventListener("change", () => onChange(Number(slider.value), true));
    wrap.appendChild(lbl); wrap.appendChild(slider); wrap.appendChild(valLbl);
    settingsArea.appendChild(wrap);
  }

  // Appends left/center/right alignment toggle buttons to settingsArea (text only).
  function _buildTextAlignButtons(currentAlign, onChange) {
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
    settingsArea.appendChild(row);
  }

  // Appends arrow-specific toggles (start/end arrowhead, bezier, taper) to settingsArea.
  // source is either a tool-settings object or a single arrow annotation.
  function _buildArrowToggles(source, onToggle) {
    const makeToggleBtn = (content, title, active, onClick) => {
      const btn = document.createElement("button");
      btn.className = "ais-toggle-btn" + (active ? " active" : "");
      addTooltip(btn, title);
      btn.style.cssText = "font-size:14px;font-weight:bold;width:26px;height:26px;line-height:1;";
      if (typeof content === "string") { btn.textContent = content; } else { btn.appendChild(content); }
      btn.addEventListener("pointerdown", (e) => { e.stopPropagation(); onClick(); });
      return btn;
    };
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:2px;";
    row.appendChild(makeToggleBtn("←", "Start arrowhead", source.has_start_arrow ?? false, () => {
      onToggle({ has_start_arrow: !(source.has_start_arrow ?? false) });
    }));
    row.appendChild(makeToggleBtn("→", "End arrowhead", source.has_end_arrow ?? true, () => {
      onToggle({ has_end_arrow: !(source.has_end_arrow ?? true) });
    }));
    row.appendChild(makeToggleBtn(mkIcon("bezier", 14), "Bezier curve", source.is_bezier ?? false, () => {
      onToggle({ is_bezier: !(source.is_bezier ?? false) });
    }));
    // Taper: variable-width stroke, thin at tail and full-width at arrowhead.
    row.appendChild(makeToggleBtn(mkIcon("taper", 14), "Taper stroke width", source.taper ?? false, () => {
      onToggle({ taper: !(source.taper ?? false) });
    }));
    settingsArea.appendChild(row);
  }

  // Always-present position controls: % toggle + anchor picker, rendered at the left of the
  // settings area on every rebuild. ann is the currently selected text/rect/ellipse annotation,
  // or null when no compatible annotation is selected (controls render disabled in that case).
  function buildPositionControls(ann) {
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

    const enabled = !!(ann && (ann.type === "text" || ann.type === "rect" || ann.type === "ellipse"));
    // Shapes use center/middle as default since x,y is their center; text uses left/top.
    const isShape = enabled && (ann.type === "rect" || ann.type === "ellipse");
    const defaultAH = isShape ? "center" : "left";
    const defaultAV = isShape ? "middle" : "top";
    const currentAH = enabled ? (ann.anchor_h || defaultAH) : defaultAH;
    const currentAV = enabled ? (ann.anchor_v || defaultAV) : defaultAV;
    const isPct = enabled && !!ann.percentage;

    // ── % toggle ───────────────────────────────────────────────────────────
    const pctBtn = document.createElement("button");
    pctBtn.className = "ais-toggle-btn" + (isPct ? " active" : "");
    addTooltip(pctBtn, enabled
      ? (isPct ? "Position: percentage — click to switch to pixels" : "Position: pixels — click to switch to percentage")
      : "Percentage position (select text, rect, or ellipse to enable)");
    pctBtn.style.cssText = "width:26px;height:26px;font-size:11px;font-weight:bold;letter-spacing:-0.5px;" +
      (enabled ? "" : "opacity:0.3;pointer-events:none;");
    pctBtn.textContent = "%";
    if (enabled) {
      pctBtn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        const { currentValue: cv } = getState();
        const cw = cv.canvas_width || DEFAULT_CANVAS_WIDTH;
        const ch = cv.canvas_height || DEFAULT_CANVAS_HEIGHT;
        applySingleUpdate(ann.id, (a) => isPct
          ? { ...a, x: (a.x ?? 0) / 100 * cw, y: (a.y ?? 0) / 100 * ch, percentage: false }
          : { ...a, x: (a.x ?? 0) / cw * 100, y: (a.y ?? 0) / ch * 100, percentage: true });
        emit(); rebuild(); renderCanvas();
      });
    }
    settingsArea.appendChild(pctBtn);

    // ── anchor picker ──────────────────────────────────────────────────────
    let anchorPopup = null;

    function _dismissAnchorPopup() {
      if (anchorPopup) { anchorPopup.remove(); anchorPopup = null; }
      document.removeEventListener("pointerdown", _outsideAnchor, true);
    }
    function _outsideAnchor(e) {
      if (anchorPopup && !anchorPopup.contains(e.target)) _dismissAnchorPopup();
    }

    const anchorBtn = document.createElement("button");
    anchorBtn.className = "ais-toggle-btn";
    addTooltip(anchorBtn, enabled ? "Position anchor" : "Position anchor (select text, rect, or ellipse to enable)");
    const hIcon = H_OPTIONS.find((o) => o.value === currentAH) || H_OPTIONS[0];
    anchorBtn.appendChild(mkIcon(hIcon.icon, 14));
    anchorBtn.style.cssText = "width:26px;height:26px;" + (enabled ? "" : "opacity:0.3;pointer-events:none;");

    if (enabled) {
      anchorBtn.addEventListener("pointerdown", (e) => {
        e.stopPropagation(); e.preventDefault(); anchorBtn.blur();
        if (anchorPopup) { _dismissAnchorPopup(); return; }

        anchorPopup = document.createElement("div");
        anchorPopup.style.cssText = [
          "position:fixed", "background:var(--popover,#1e1e1e)",
          "border:1px solid var(--border,#444)", "border-radius:6px",
          "box-shadow:0 4px 16px rgba(0,0,0,0.5)", "z-index:10000",
          "padding:6px", "display:grid",
          "grid-template-columns:repeat(3,28px)", "grid-template-rows:repeat(2,28px)", "gap:2px",
        ].join(";");

        let ah = currentAH, av = currentAV;

        function _renderGrid() {
          anchorPopup.innerHTML = "";
          for (const opt of H_OPTIONS) {
            const ib = document.createElement("button");
            ib.className = "ais-toggle-btn" + (ah === opt.value ? " active" : "");
            ib.style.cssText = "width:28px;height:28px;";
            addTooltip(ib, opt.title);
            ib.appendChild(mkIcon(opt.icon, 14));
            ib.addEventListener("pointerdown", (ev) => {
              ev.stopPropagation(); ah = opt.value; _renderGrid();
              applySingleUpdate(ann.id, (a) => ({ ...a, anchor_h: ah, anchor_v: av }));
              if (ann.type === "text") {
                const s = getState(); s.toolSettings.text.anchor_h = ah;
                setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
              }
              renderCanvas(); emit();
            });
            anchorPopup.appendChild(ib);
          }
          for (const opt of V_OPTIONS) {
            const ib = document.createElement("button");
            ib.className = "ais-toggle-btn" + (av === opt.value ? " active" : "");
            ib.style.cssText = "width:28px;height:28px;";
            addTooltip(ib, opt.title);
            ib.appendChild(mkIcon(opt.icon, 14));
            ib.addEventListener("pointerdown", (ev) => {
              ev.stopPropagation(); av = opt.value; _renderGrid();
              applySingleUpdate(ann.id, (a) => ({ ...a, anchor_h: ah, anchor_v: av }));
              if (ann.type === "text") {
                const s = getState(); s.toolSettings.text.anchor_v = av;
                setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
              }
              renderCanvas(); emit();
            });
            anchorPopup.appendChild(ib);
          }
        }
        _renderGrid();
        document.body.appendChild(anchorPopup);
        const bRect = anchorBtn.getBoundingClientRect();
        anchorPopup.style.top = `${bRect.bottom + 4}px`;
        requestAnimationFrame(() => {
          const pw = anchorPopup.offsetWidth;
          let left = bRect.left;
          if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
          anchorPopup.style.left = `${left}px`;
        });
        setTimeout(() => document.addEventListener("pointerdown", _outsideAnchor, true), 0);
      });
    }
    settingsArea.appendChild(anchorBtn);

    // ── separator ──────────────────────────────────────────────────────────
    const sep = document.createElement("div");
    sep.style.cssText = "width:1px;height:20px;background:var(--border);margin:0 4px;flex-shrink:0;";
    settingsArea.appendChild(sep);
  }

  // Builds settings for the active drawing tool (no annotation selected): size, color, fill, arrow toggles.
  function buildToolSettings() {
    const { activeTool, toolSettings } = getState();
    const ts = toolSettings[activeTool] || {};
    if (activeTool === "arrow") {
      _buildArrowToggles(toolSettings.arrow, (changes) => {
        const s = getState();
        s.toolSettings.arrow = { ...s.toolSettings.arrow, ...changes };
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        rebuild();
        renderCanvas();
        emit();
      });
    }
    const isShape = activeTool === "rect" || activeTool === "ellipse";
    if (activeTool === "text") {
      _buildTextAlignButtons(ts.text_align || "left", (align) => {
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
        renderCanvas();
        emit();
      });
    }
    const sizeKey = activeTool === "text" ? "font_size"
      : (activeTool === "arrow" || isShape) ? "width"
      : "size";
    const sizeVal = ts[sizeKey] ?? (activeTool === "text" ? DEFAULT_TEXT_SIZE : (activeTool === "arrow") ? DEFAULT_ARROW_WIDTH : isShape ? DEFAULT_SHAPE_WIDTH : DEFAULT_PAINT_SIZE);
    const sizeMin = activeTool === "text" ? MIN_TEXT_SIZE : (activeTool === "arrow" || isShape) ? MIN_ARROW_WIDTH : MIN_PAINT_SIZE;
    const sizeMax = activeTool === "text" ? MAX_TEXT_SIZE : (activeTool === "arrow" || isShape) ? MAX_ARROW_WIDTH : MAX_PAINT_SIZE;
    const sizeLbl = (activeTool === "arrow" || isShape) ? "Width" : "Size";
    _buildSizeSlider(sizeLbl, sizeMin, sizeMax, sizeVal, (sz, doEmit) => {
      const s = getState();
      s.toolSettings[activeTool][sizeKey] = sz;
      setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
      // While editing text, apply font size change live to the textarea and annotation
      if (activeTool === "text" && s.textEditId) {
        s.textInput.style.fontSize = sz * s.displayScale * s.viewScale + "px";
        autoResizeTextarea();
        setCurrentValue({
          ...getState().currentValue,
          annotations: getState().currentValue.annotations.map((a) =>
            a.id === s.textEditId ? { ...a, font_size: sz } : a
          ),
        });
      }
      renderCanvas();
      if (doEmit) emit();
    });
    if (activeTool === "paint") {
      const sliderRow = settingsArea.lastChild;
      const paintColor = toolSettings.paint.color || DEFAULT_COLOR;
      // Inline color swatch — sits between the value readout and pressure icon
      const paintPicker = createColorPicker({
        color: paintColor,
        label: "Stroke color",
        addTooltip,
        onChange: (col, doEmit) => {
          const s = getState();
          s.toolSettings.paint.color = col || DEFAULT_COLOR;
          setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
          renderCanvas();
          if (doEmit) emit();
        },
      });
      sliderRow.appendChild(paintPicker.el);
      // Pressure toggle icon
      const pressureOn = toolSettings.paint.pressure ?? false;
      const pressureBtn = document.createElement("button");
      pressureBtn.className = "ais-toggle-btn" + (pressureOn ? " active" : "");
      addTooltip(pressureBtn, "Pressure sensitivity (tablet/stylus only)");
      pressureBtn.style.cssText = "width:26px;height:26px;flex-shrink:0;";
      pressureBtn.appendChild(mkIcon("pressure", 14));
      pressureBtn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        const s = getState();
        s.toolSettings.paint.pressure = !(s.toolSettings.paint.pressure ?? false);
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        rebuild();
        emit();
      });
      sliderRow.appendChild(pressureBtn);
      // Min size slider — only visible when pressure is on
      if (pressureOn) {
        const currentMin = toolSettings.paint.pressureMin ?? 1;
        const currentMax = toolSettings.paint.size ?? DEFAULT_PAINT_SIZE;
        _buildSizeSlider("Min", 0, Math.max(1, currentMax - 1), currentMin, (sz, doEmit) => {
          const s = getState();
          s.toolSettings.paint.pressureMin = sz;
          setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
          if (doEmit) emit();
        });
      }
    }
    if (activeTool === "arrow") {
      const arrowSizeVal = ts.arrow_size ?? DEFAULT_ARROW_SIZE;
      _buildSizeSlider("Head", MIN_ARROW_SIZE, MAX_ARROW_SIZE, arrowSizeVal, (sz, doEmit) => {
        const s = getState();
        s.toolSettings.arrow.arrow_size = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas();
        if (doEmit) emit();
      });
    }
    const color = ts.color ?? DEFAULT_COLOR;
    if (activeTool !== "paint") {
      const hasOutlineNone = isShape || activeTool === "arrow";
      const toolColorPicker = createColorPicker({
        color,
        label: "Color",
        clearLabel: hasOutlineNone ? "No outline" : null,
        addTooltip,
        onChange: (col, doEmit) => {
          const s = getState();
          s.toolSettings[activeTool].color = col;
          setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
          if (activeTool === "text" && s.textEditId) {
            s.textInput.style.color = col || DEFAULT_COLOR;
            setCurrentValue({
              ...getState().currentValue,
              annotations: getState().currentValue.annotations.map((a) =>
                a.id === s.textEditId ? { ...a, color: col } : a
              ),
            });
            renderCanvas();
          }
          if (doEmit) emit();
        },
      });
      settingsArea.appendChild(toolColorPicker.el);
    }
    if (isShape) {
      const fillPicker = createColorPicker({
        color: ts.fill_color || "",
        hasAlpha: true,
        label: "Fill color",
        clearLabel: "No fill",
        addTooltip,
        onChange: (col, doEmit) => {
          const s = getState();
          s.toolSettings[activeTool].fill_color = col;
          setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
          renderCanvas();
          if (doEmit) emit();
        },
      });
      settingsArea.appendChild(fillPicker.el);
    }
    if (activeTool === "text") {
      const bgPicker = createColorPicker({
        color: ts.bg_color || "",
        hasAlpha: true,
        label: "Background color",
        clearLabel: "No background",
        addTooltip,
        onChange: (col, doEmit) => {
          const s = getState();
          s.toolSettings.text.bg_color = col;
          setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
          if (s.textEditId) {
            setCurrentValue({
              ...getState().currentValue,
              annotations: getState().currentValue.annotations.map((a) =>
                a.id === s.textEditId ? { ...a, bg_color: col } : a
              ),
            });
            if (s.textInput) s.textInput.style.background = col || "transparent";
          }
          renderCanvas();
          if (doEmit) emit();
        },
      });
      settingsArea.appendChild(bgPicker.el);
    }
  }

  // Builds settings for a single selected annotation (size/width, color, fill, arrow toggles).
  // Changes are written back to the annotation and synced to tool_settings so the next
  // new annotation inherits the same style.
  function buildAnnotationSettings(ann) {
    if (ann.type === "arrow") {
      _buildArrowToggles(ann, (changes) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, ...changes }));
        // Sync arrow-style toggles to tool settings so next arrow uses same style
        const s = getState();
        s.toolSettings.arrow = { ...s.toolSettings.arrow, ...changes };
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas();
        rebuild();
        emit();
      });
    }

    let color;
    if (ann.type === "paint") {
      color = (ann.strokes && ann.strokes[0]) ? ann.strokes[0].color : DEFAULT_COLOR;
    } else {
      color = ann.color ?? DEFAULT_COLOR;
    }

    if (ann.type === "paint") {
      const baseSize = (ann.strokes && ann.strokes[0]) ? (ann.strokes[0].size ?? DEFAULT_PAINT_SIZE) : DEFAULT_PAINT_SIZE;
      const currentSize = Math.max(MIN_PAINT_SIZE, Math.round(baseSize * (ann.sizeScale ?? 1)));
      _buildSizeSlider("Size", MIN_PAINT_SIZE, MAX_PAINT_SIZE, currentSize, (sz, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, sizeScale: sz / baseSize }));
        const s = getState();
        s.toolSettings.paint.size = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas();
        if (doEmit) emit();
      });
    }

    const isShape = ann.type === "rect" || ann.type === "ellipse";
    if (ann.type === "text") {
      _buildTextAlignButtons(ann.text_align || "left", (align) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, text_align: align }));
        const s = getState();
        s.toolSettings.text.text_align = align;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        if (s.textInput && s.textEditId === ann.id) s.textInput.style.textAlign = align;
        renderCanvas();
        emit();
      });
    }
    const sizeKey = ann.type === "text" ? "font_size" : (ann.type === "arrow" || isShape) ? "width" : null;
    if (sizeKey) {
      const sizeVal = ann[sizeKey] ?? (ann.type === "text" ? DEFAULT_TEXT_SIZE : isShape ? DEFAULT_SHAPE_WIDTH : DEFAULT_ARROW_WIDTH);
      const sizeMin = ann.type === "text" ? MIN_TEXT_SIZE : MIN_ARROW_WIDTH;
      const sizeMax = ann.type === "text" ? MAX_TEXT_SIZE : MAX_ARROW_WIDTH;
      const sizeLbl = ann.type === "text" ? "Size" : "Width";
      _buildSizeSlider(sizeLbl, sizeMin, sizeMax, sizeVal, (sz, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, [sizeKey]: sz }));
        const s = getState();
        if (ann.type === "arrow") { s.toolSettings.arrow.width = sz; setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } }); }
        if (ann.type === "text")  { s.toolSettings.text.font_size = sz; setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } }); }
        if (isShape) { s.toolSettings[ann.type].width = sz; setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } }); }
        const s2 = getState();
        if (s2.textInput && s2.textEditId === ann.id && sizeKey === "font_size") {
          s2.textInput.style.fontSize = sz * s2.displayScale * s2.viewScale + "px";
          autoResizeTextarea();
        }
        renderCanvas();
        if (doEmit) emit();
      });
    }
    if (ann.type === "arrow") {
      const arrowSizeVal = ann.arrow_size ?? DEFAULT_ARROW_SIZE;
      _buildSizeSlider("Head", MIN_ARROW_SIZE, MAX_ARROW_SIZE, arrowSizeVal, (sz, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, arrow_size: sz }));
        const s = getState();
        s.toolSettings.arrow.arrow_size = sz;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas();
        if (doEmit) emit();
      });
    }

    const hasOutlineNone = isShape || ann.type === "arrow";
    const annColorPicker = createColorPicker({
      color,
      label: "Color",
      clearLabel: hasOutlineNone ? "No outline" : null,
      addTooltip,
      onChange: (col, doEmit) => {
        applySingleUpdate(ann.id, (a) => {
          if (a.type === "paint") return { ...a, strokes: (a.strokes || []).map((s) => ({ ...s, color: col || DEFAULT_COLOR })) };
          return { ...a, color: col };
        });
        const s = getState();
        if (ann.type === "arrow") { s.toolSettings.arrow.color = col; setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } }); }
        if (ann.type === "text")  { s.toolSettings.text.color = col || DEFAULT_COLOR;  setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } }); }
        if (ann.type === "paint") { s.toolSettings.paint.color = col || DEFAULT_COLOR; setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } }); }
        if (isShape) { s.toolSettings[ann.type].color = col; setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } }); }
        const s2 = getState();
        if (s2.textInput && s2.textEditId === ann.id) {
          s2.textInput.style.color = col || DEFAULT_COLOR;
          s2.textInput.style.borderBottomColor = col || DEFAULT_COLOR;
        }
        renderCanvas();
        if (doEmit) emit();
      },
    });
    settingsArea.appendChild(annColorPicker.el);

    if (isShape) {
      const annFillPicker = createColorPicker({
        color: ann.fill_color || "",
        hasAlpha: true,
        label: "Fill color",
        clearLabel: "No fill",
        addTooltip,
        onChange: (col, doEmit) => {
          applySingleUpdate(ann.id, (a) => ({ ...a, fill_color: col }));
          const s = getState();
          s.toolSettings[ann.type].fill_color = col;
          setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
          renderCanvas();
          if (doEmit) emit();
        },
      });
      settingsArea.appendChild(annFillPicker.el);
    }
    if (ann.type === "text") {
      const annBgPicker = createColorPicker({
        color: ann.bg_color || "",
        hasAlpha: true,
        label: "Background color",
        clearLabel: "No background",
        addTooltip,
        onChange: (col, doEmit) => {
          applySingleUpdate(ann.id, (a) => ({ ...a, bg_color: col }));
          const s = getState();
          s.toolSettings.text.bg_color = col;
          setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
          if (s.textInput && s.textEditId === ann.id) s.textInput.style.background = col || "transparent";
          renderCanvas();
          if (doEmit) emit();
        },
      });
      settingsArea.appendChild(annBgPicker.el);
    }
  }

  // Builds settings for a multi-selection: a Scale% slider (line widths only, not text/dimensions)
  // and a color swatch that paints all selected annotations at once.
  function buildMultiSettings(selIds) {
    const anns = effectiveAnnotations().filter((a) => selIds.includes(a.id));
    // Capture original sizes when the panel is built; slider applies ratio to these originals
    const origSizes = {};
    const origArrowSizes = {};
    for (const a of anns) {
      if (a.type === "paint") origSizes[a.id] = a.sizeScale ?? 1;
      else if (a.type === "arrow") { origSizes[a.id] = a.width ?? 3; origArrowSizes[a.id] = a.arrow_size ?? DEFAULT_ARROW_SIZE; }
      else if (a.type === "rect" || a.type === "ellipse") origSizes[a.id] = a.width ?? DEFAULT_SHAPE_WIDTH;
    }
    _buildSizeSlider("Scale %", 25, 400, 100, (val, doEmit) => {
      const ratio = val / 100;
      const { annotations, overrides } = applyAnnotationMap(selIds, (a) => {
        if (a.type === "paint") return { ...a, sizeScale: (origSizes[a.id] ?? 1) * ratio };
        if (a.type === "text") return a;
        if (a.type === "arrow") return { ...a, width: Math.max(1, (origSizes[a.id] ?? 3) * ratio), arrow_size: Math.max(5, (origArrowSizes[a.id] ?? DEFAULT_ARROW_SIZE) * ratio) };
        if (a.type === "rect" || a.type === "ellipse") return { ...a, width: Math.max(1, (origSizes[a.id] ?? DEFAULT_SHAPE_WIDTH) * ratio) };
        return a;
      });
      setCurrentValue({ ...getState().currentValue, annotations, overrides });
      renderCanvas();
      if (doEmit) emit();
    });
    const arrowAnns = anns.filter((a) => a.type === "arrow");
    if (arrowAnns.length > 0) {
      const firstArrowSize = arrowAnns[0].arrow_size ?? DEFAULT_ARROW_SIZE;
      _buildSizeSlider("Head", MIN_ARROW_SIZE, MAX_ARROW_SIZE, firstArrowSize, (sz, doEmit) => {
        const { annotations, overrides } = applyAnnotationMap(selIds, (a) => {
          if (a.type === "arrow") return { ...a, arrow_size: sz };
          return a;
        });
        setCurrentValue({ ...getState().currentValue, annotations, overrides });
        renderCanvas();
        if (doEmit) emit();
      });
    }
    let firstColor = DEFAULT_COLOR;
    for (const a of anns) {
      if (a.type === "paint" && a.strokes?.[0]) { firstColor = a.strokes[0].color; break; }
      if (a.type !== "paint") { firstColor = a.color ?? DEFAULT_COLOR; break; }
    }
    const multiColorPicker = createColorPicker({
      color: firstColor,
      label: "Color",
      clearLabel: anns.some((a) => a.type === "rect" || a.type === "ellipse" || a.type === "arrow") ? "No outline" : null,
      addTooltip,
      onChange: (col, doEmit) => {
        const { annotations, overrides } = applyAnnotationMap(selIds, (a) => {
          if (a.type === "paint") return { ...a, strokes: (a.strokes || []).map((s) => ({ ...s, color: col || DEFAULT_COLOR })) };
          return { ...a, color: col };
        });
        setCurrentValue({ ...getState().currentValue, annotations, overrides });
        renderCanvas();
        if (doEmit) emit();
      },
    });
    settingsArea.appendChild(multiColorPicker.el);

    const shapeAnns = anns.filter((a) => a.type === "rect" || a.type === "ellipse");
    if (shapeAnns.length) {
      const firstFill = shapeAnns.find((a) => a.fill_color)?.fill_color || "";
      const multiFillPicker = createColorPicker({
        color: firstFill,
        hasAlpha: true,
        label: "Fill color",
        clearLabel: "No fill",
        addTooltip,
        onChange: (col, doEmit) => {
          const shapeIds = shapeAnns.map((a) => a.id);
          const { annotations, overrides } = applyAnnotationMap(shapeIds, (a) => ({ ...a, fill_color: col }));
          setCurrentValue({ ...getState().currentValue, annotations, overrides });
          renderCanvas();
          if (doEmit) emit();
        },
      });
      settingsArea.appendChild(multiFillPicker.el);
    }
  }

  return { buildPositionControls, buildToolSettings, buildAnnotationSettings, buildMultiSettings };
}
