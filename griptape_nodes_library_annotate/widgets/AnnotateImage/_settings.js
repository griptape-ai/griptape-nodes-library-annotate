// _settings.js — Toolbar settings orchestrator for the AnnotateImage widget.
//
// Thin wrapper: delegates position popup to _popup_position.js,
// style popup to _popup_style.js, and inline color swatches to _colorpicker.js.
//
// createSettings(settingsArea, deps) → { buildToolSettings, buildAnnotationSettings, buildMultiSettings }

import { createColorPicker } from './_colorpicker.js';
import { createPositionPopup } from './_popup_position.js';
import { createStylePopup } from './_popup_style.js';
import { buildPopupTrigger } from './_popup_utils.js';
import { DEFAULT_COLOR } from './_styles.js';

export function createSettings(settingsArea, {
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
  rebuildTxFrame,
}) {
  const deps = {
    addTooltip, getState, setCurrentValue, applySingleUpdate, applyAnnotationMap,
    effectiveAnnotations, autoResizeTextarea, renderCanvas, emit, rebuild, rebuildTxFrame,
  };

  const positionPopup = createPositionPopup(settingsArea, deps);
  const stylePopup    = createStylePopup(settingsArea, deps);

  function _mkSeparator() {
    const sep = document.createElement("div");
    sep.style.cssText = "width:1px;height:20px;background:var(--border);margin:0 4px;flex-shrink:0;";
    settingsArea.appendChild(sep);
  }

  function _mkColorSwatch(color, label, clearLabel, hasAlpha, onChange) {
    const picker = createColorPicker({ color, hasAlpha, label, clearLabel, addTooltip, onChange });
    settingsArea.appendChild(picker.el);
  }

  // ── buildToolSettings ────────────────────────────────────────────────────────
  // Called when a draw tool is active with no matching annotation selected,
  // or when a nav tool (hand, zoom) is active.

  function buildToolSettings() {
    const { activeTool, toolSettings } = getState();
    const NAV_TOOLS = ["hand", "zoom"];
    const isNavTool = NAV_TOOLS.includes(activeTool);

    positionPopup.build(null);

    if (isNavTool) {
      buildPopupTrigger(settingsArea, "Style", "paintbrush", false);
      return;
    }

    stylePopup.buildForTool(toolSettings, activeTool);
    _mkSeparator();

    const ts = toolSettings[activeTool] || {};
    const isShape = activeTool === "rect" || activeTool === "ellipse";

    if (activeTool === "paint") {
      _mkColorSwatch(ts.color || DEFAULT_COLOR, "Stroke color", null, false, (col, doEmit) => {
        const s = getState();
        s.toolSettings.paint.color = col || DEFAULT_COLOR;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      });
    } else {
      _mkColorSwatch(ts.color ?? DEFAULT_COLOR, "Color",
        isShape || activeTool === "arrow" ? "No outline" : null, false,
        (col, doEmit) => {
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
        });
    }

    if (isShape) {
      _mkColorSwatch(ts.fill_color || "", "Fill color", "No fill", true, (col, doEmit) => {
        const s = getState();
        s.toolSettings[activeTool].fill_color = col;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      });
    }
    if (activeTool === "text") {
      _mkColorSwatch(ts.bg_color || "", "Background color", "No background", true, (col, doEmit) => {
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
        renderCanvas(); if (doEmit) emit();
      });
    }
  }

  // ── buildAnnotationSettings ──────────────────────────────────────────────────
  // Called when a single annotation is selected (select tool, or matching draw tool).

  function buildAnnotationSettings(ann) {
    positionPopup.build(ann);
    stylePopup.buildForAnnotation(ann);
    _mkSeparator();

    const isShape = ann.type === "rect" || ann.type === "ellipse";
    const color = ann.type === "paint"
      ? ((ann.strokes && ann.strokes[0]) ? ann.strokes[0].color : DEFAULT_COLOR)
      : (ann.color ?? DEFAULT_COLOR);

    _mkColorSwatch(color, "Color", isShape || ann.type === "arrow" ? "No outline" : null, false,
      (col, doEmit) => {
        applySingleUpdate(ann.id, (a) => {
          if (a.type === "paint") return { ...a, strokes: (a.strokes || []).map((s) => ({ ...s, color: col || DEFAULT_COLOR })) };
          return { ...a, color: col };
        });
        const s = getState();
        if (ann.type === "arrow") { s.toolSettings.arrow.color = col; setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } }); }
        if (ann.type === "text")  { s.toolSettings.text.color  = col || DEFAULT_COLOR; setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } }); }
        if (ann.type === "paint") { s.toolSettings.paint.color = col || DEFAULT_COLOR; setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } }); }
        if (isShape) { s.toolSettings[ann.type].color = col; setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } }); }
        const s2 = getState();
        if (s2.textInput && s2.textEditId === ann.id) {
          s2.textInput.style.color = col || DEFAULT_COLOR;
          s2.textInput.style.borderBottomColor = col || DEFAULT_COLOR;
        }
        renderCanvas(); if (doEmit) emit();
      });

    if (isShape) {
      _mkColorSwatch(ann.fill_color || "", "Fill color", "No fill", true, (col, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, fill_color: col }));
        const s = getState();
        s.toolSettings[ann.type].fill_color = col;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        renderCanvas(); if (doEmit) emit();
      });
    }
    if (ann.type === "text") {
      _mkColorSwatch(ann.bg_color || "", "Background color", "No background", true, (col, doEmit) => {
        applySingleUpdate(ann.id, (a) => ({ ...a, bg_color: col }));
        const s = getState();
        s.toolSettings.text.bg_color = col;
        setCurrentValue({ ...s.currentValue, tool_settings: { ...s.toolSettings } });
        if (s.textInput && s.textEditId === ann.id) s.textInput.style.background = col || "transparent";
        renderCanvas(); if (doEmit) emit();
      });
    }
  }

  // ── buildMultiSettings ───────────────────────────────────────────────────────
  // Called when multiple annotations are selected.

  function buildMultiSettings(selIds) {
    // Deduplicate by ID — effectiveAnnotations() can return the same ID twice
    // (imported + local) if there is an ID collision, which would cause double-transform.
    const seen = new Set();
    const allAnns = effectiveAnnotations()
      .filter((a) => selIds.includes(a.id) && !seen.has(a.id) && seen.add(a.id));
    const groupId = allAnns[0]?.group_id;
    const isSingleGroup = !!groupId && allAnns.every((a) => a.group_id === groupId);
    if (isSingleGroup) {
      positionPopup.build({ type: "group", id: groupId, groupAnns: allAnns });
    } else {
      positionPopup.build(null);
    }
    stylePopup.buildForMulti(selIds);
    _mkSeparator();

    const anns = effectiveAnnotations().filter((a) => selIds.includes(a.id));
    let firstColor = DEFAULT_COLOR;
    for (const a of anns) {
      if (a.type === "paint" && a.strokes?.[0]) { firstColor = a.strokes[0].color; break; }
      if (a.type !== "paint") { firstColor = a.color ?? DEFAULT_COLOR; break; }
    }

    _mkColorSwatch(firstColor, "Color",
      anns.some((a) => a.type === "rect" || a.type === "ellipse" || a.type === "arrow") ? "No outline" : null,
      false,
      (col, doEmit) => {
        const { annotations, overrides } = applyAnnotationMap(selIds, (a) => {
          if (a.type === "paint") return { ...a, strokes: (a.strokes || []).map((s) => ({ ...s, color: col || DEFAULT_COLOR })) };
          return { ...a, color: col };
        });
        setCurrentValue({ ...getState().currentValue, annotations, overrides });
        renderCanvas(); if (doEmit) emit();
      });

    const shapeAnns = anns.filter((a) => a.type === "rect" || a.type === "ellipse");
    if (shapeAnns.length) {
      const firstFill = shapeAnns.find((a) => a.fill_color)?.fill_color || "";
      _mkColorSwatch(firstFill, "Fill color", "No fill", true, (col, doEmit) => {
        const shapeIds = shapeAnns.map((a) => a.id);
        const { annotations, overrides } = applyAnnotationMap(shapeIds, (a) => ({ ...a, fill_color: col }));
        setCurrentValue({ ...getState().currentValue, annotations, overrides });
        renderCanvas(); if (doEmit) emit();
      });
    }
  }

  return { buildToolSettings, buildAnnotationSettings, buildMultiSettings };
}
