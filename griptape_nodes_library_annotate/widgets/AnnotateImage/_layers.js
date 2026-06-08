// _layers.js — Layers panel for the AnnotateImage widget.
// createLayersPanel(buttonEl, labelEl, deps) → { update, dismiss }
//
// Data model additions to currentValue:
//   layers: [{ id, name, visible }]  — ordered back-to-front (index 0 = furthest back)
//   active_layer_id: string          — layer new annotations go into
//   annotations[].layer_id: string   — which layer this annotation belongs to (absent = first layer)

import { mkIcon } from './_icons.js';
import { SEL_COLOR_RGB, IMP_COLOR_RGB } from './_styles.js';

// Returns the unified ordered list of all layer IDs (back=index 0, front=last).
// If layer_stack is stored and valid, uses it. Otherwise defaults to imported-below-local.
// New layers not yet in the stack are added (imported at bottom, local at top).
export function getEffectiveLayerStack(cv) {
  const local    = (cv.layers         || []).map((l) => l.id);
  const imported = (cv.imported_layers || []).map((l) => l.id);
  const allKnown = new Set([...imported, ...local]);
  const stack    = cv.layer_stack;
  if (stack?.length) {
    const valid  = stack.filter((id) => allKnown.has(id));
    const inStack = new Set(valid);
    return [
      ...imported.filter((id) => !inStack.has(id)), // new imported → bottom
      ...valid,
      ...local.filter((id) => !inStack.has(id)),    // new local → top
    ];
  }
  return [...imported, ...local]; // default: imported below local
}

// Ensures currentValue has a valid layers array, active_layer_id, and layer_stack.
// The default layer gets a unique ID (not a hardcoded constant) so that two annotation
// nodes never share the same layer ID when one imports from the other.
export function ensureLayers(cv) {
  const layers = cv.layers?.length ? cv.layers : [{
    id: `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: "Layer 1",
    visible: true,
  }];
  const validActive = layers.find((l) => l.id === cv.active_layer_id);
  const patched = { ...cv, layers, active_layer_id: validActive ? cv.active_layer_id : layers[0].id };
  // Materialise layer_stack so it's always stored explicitly.
  return { ...patched, layer_stack: getEffectiveLayerStack(patched) };
}

export function createLayersPanel(buttonEl, labelEl, iconWrapEl, {
  addTooltip,
  uid,
  getState,
  setCurrentValue,
  applyAnnotationMap,
  effectiveAnnotations,
  renderLayerThumb,
  emit,
  renderCanvas,
  rebuildSettings,
}) {
  let panel = null;
  let moveDropdown = null;
  let moreMenu = null;
  let _pendingRenameId = null;

  // ── dismiss helpers ────────────────────────────────────────────────────────

  function _dismissMoveDropdown() {
    if (moveDropdown) { moveDropdown.remove(); moveDropdown = null; }
    document.removeEventListener("pointerdown", _outsideMoveClick, true);
  }
  function _outsideMoveClick(e) {
    if (moveDropdown && !moveDropdown.contains(e.target)) _dismissMoveDropdown();
  }

  function _dismissMoreMenu() {
    if (moreMenu) { moreMenu.remove(); moreMenu = null; }
    document.removeEventListener("pointerdown", _outsideMoreClick, true);
  }
  function _outsideMoreClick(e) {
    if (moreMenu && !moreMenu.contains(e.target)) _dismissMoreMenu();
  }

  function dismiss() {
    _dismissMoveDropdown();
    _dismissMoreMenu();
    if (!panel) return;
    panel.remove(); panel = null;
    document.removeEventListener("pointerdown", _outsidePanelClick, true);
  }
  function _outsidePanelClick(e) {
    // Don't dismiss when clicking inside submenus (they live in document.body, not inside panel)
    if (moreMenu?.contains(e.target) || moveDropdown?.contains(e.target)) return;
    if (panel && !panel.contains(e.target) && !buttonEl.contains(e.target)) dismiss();
  }

  // ── data helpers ───────────────────────────────────────────────────────────

  function _cv()      { return getState().currentValue; }
  function _layers()  { return ensureLayers(_cv()).layers; }
  function _activeId() {
    const cv = _cv();
    const aid = cv.active_layer_id;
    if (aid) {
      const layers = _layers();
      const importedLayers = cv.imported_layers || [];
      // Valid if it exists in either local or imported layers
      if (layers.find((l) => l.id === aid) || importedLayers.find((l) => l.id === aid)) return aid;
    }
    return _layers()[0]?.id;
  }

  // ── layer operations ───────────────────────────────────────────────────────

  function _commitLayers(newLayers, extraPatch = {}) {
    const cv = _cv();
    const validActive = newLayers.find((l) => l.id === (extraPatch.active_layer_id ?? cv.active_layer_id));
    const active_layer_id = validActive ? (extraPatch.active_layer_id ?? cv.active_layer_id) : newLayers[0]?.id;
    setCurrentValue({ ...cv, layers: newLayers, active_layer_id, ...extraPatch });
    emit();
    update();
    if (panel) _renderPanel();
  }

  function createLayer() {
    const cv = _cv();
    const layers = _layers();
    const newLayer = { id: uid("layer"), name: `Layer ${layers.length + 1}`, visible: true };
    const newLayers = [...layers, newLayer];
    const stack = getEffectiveLayerStack(cv);
    const newStack = [...stack, newLayer.id]; // new layer at front
    setCurrentValue({ ...cv, layers: newLayers, active_layer_id: newLayer.id, layer_stack: newStack });
    emit(); update(); renderCanvas();
    if (panel) _renderPanel();
  }

  function deleteLayer(layerId) {
    const layers = _layers();
    if (layers.length <= 1) return;
    const cv = _cv();
    const newLayers = layers.filter((l) => l.id !== layerId);
    const newAnnotations = (cv.annotations || []).filter((a) => a.layer_id !== layerId);
    const newOverrides = { ...(cv.overrides || {}) };
    for (const imp of (cv.imported_annotations || [])) {
      if (imp.layer_id === layerId) newOverrides[imp.id] = { ...(newOverrides[imp.id] || {}), deleted: true };
    }
    const stack = getEffectiveLayerStack(cv).filter((id) => id !== layerId);
    const fallbackId = newLayers[newLayers.length - 1].id;
    const newActiveId = _activeId() === layerId ? fallbackId : _activeId();
    setCurrentValue({ ...cv, layers: newLayers, layer_stack: stack, active_layer_id: newActiveId, annotations: newAnnotations, overrides: newOverrides, selected_ids: [] });
    emit(); renderCanvas(); update();
    if (panel) _renderPanel();
  }

  function renameLayer(layerId, name) {
    _commitLayers(_layers().map((l) => l.id === layerId ? { ...l, name: name.trim() || l.name } : l));
  }

  function toggleVisibility(layerId) {
    _commitLayers(_layers().map((l) => l.id === layerId ? { ...l, visible: !l.visible } : l));
    renderCanvas();
  }

  function toggleLock(layerId) {
    const layer = _layers().find((l) => l.id === layerId);
    if (!layer) return;
    _commitLayers(_layers().map((l) => l.id === layerId ? { ...l, locked: !l.locked } : l));
    if (panel) _renderPanel();
  }

  function toggleImportedLock(layerId) {
    const cv = _cv();
    const impOvr = (cv.imported_layer_overrides || {})[layerId] || {};
    const isLocked = impOvr.locked ?? false;
    const newOvr = { ...(cv.imported_layer_overrides || {}), [layerId]: { ...impOvr, locked: !isLocked } };
    setCurrentValue({ ...cv, imported_layer_overrides: newOvr });
    emit();
    if (panel) _renderPanel();
  }

  function setActive(layerId) {
    if (_activeId() === layerId) return; // already active — skip rebuild so dblclick rename works
    const cv = _cv();
    // Clear selection when switching layers — one active layer at a time.
    setCurrentValue({ ...cv, active_layer_id: layerId, selected_ids: [] });
    emit(); update();
    rebuildSettings();
    if (panel) _renderPanel();
  }

  function selectLayerItems(layerId) {
    const cv = _cv();
    const layers = _layers();
    const defaultLayerId = layers[0]?.id;
    const selIds = effectiveAnnotations()
      .filter((a) => (a.layer_id ?? defaultLayerId) === layerId)
      .map((a) => a.id);
    setCurrentValue({ ...cv, selected_ids: selIds, active_layer_id: layerId });
    emit(); renderCanvas(); rebuildSettings();
    dismiss(); // close panel so user can see and interact with the selection
  }

  function toggleIsolation(layerId) {
    const cv = _cv();
    const isIsolated = cv.isolated_layer_id === layerId;
    setCurrentValue({ ...cv, isolated_layer_id: isIsolated ? null : layerId });
    emit(); renderCanvas();
    if (panel) _renderPanel();
  }

  function moveSelectionToLayer(layerId) {
    const cv = _cv();
    const selIds = cv.selected_ids || [];
    if (!selIds.length) return;
    const { annotations, overrides } = applyAnnotationMap(selIds, (a) => ({ ...a, layer_id: layerId }));
    setCurrentValue({ ...cv, annotations, overrides, active_layer_id: layerId });
    emit(); renderCanvas(); update();
    _dismissMoveDropdown();
    if (panel) _renderPanel();
  }

  // Single unified reorder — works for local and imported layers alike.
  function moveStackLayerToIndex(layerId, targetIdx) {
    const cv = _cv();
    const stack = getEffectiveLayerStack(cv);
    const from = stack.indexOf(layerId);
    if (from < 0) return;
    const result = [...stack];
    result.splice(from, 1);
    result.splice(Math.max(0, Math.min(result.length, targetIdx)), 0, layerId);
    setCurrentValue({ ...cv, layer_stack: result });
    emit(); renderCanvas();
    if (panel) _renderPanel();
  }

  function reorderLayer(layerId, dir) {
    const cv = _cv();
    const stack = getEffectiveLayerStack(cv);
    const idx = stack.indexOf(layerId);
    if (idx < 0) return;
    const newIdx = dir === "up" ? idx + 1 : idx - 1;
    if (newIdx < 0 || newIdx >= stack.length) return;
    const result = [...stack];
    [result[idx], result[newIdx]] = [result[newIdx], result[idx]];
    setCurrentValue({ ...cv, layer_stack: result });
    emit(); renderCanvas();
    if (panel) _renderPanel();
  }

  // ── drag handle ────────────────────────────────────────────────────────────
  // Shared by local and imported rows. accentColor is SEL_COLOR_RGB or IMP_COLOR_RGB.

  function _buildDragHandle(layer, row, list, accentColor) {
    const drag = document.createElement("div");
    drag.style.cssText =
      "flex-shrink:0;width:18px;height:24px;cursor:grab;display:flex;align-items:center;justify-content:center;" +
      "opacity:0.25;margin-left:6px;touch-action:none;";
    const dgSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    dgSvg.setAttribute("width", "10"); dgSvg.setAttribute("height", "14"); dgSvg.setAttribute("viewBox", "0 0 10 14");
    dgSvg.setAttribute("fill", "currentColor"); dgSvg.style.cssText = "display:block;pointer-events:none;";
    dgSvg.innerHTML =
      `<circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/>` +
      `<circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>` +
      `<circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/>`;
    drag.appendChild(dgSvg);

    const dropLine = document.createElement("div");
    dropLine.style.cssText =
      `height:2px;background:rgba(${accentColor},1);margin:0 4px;border-radius:1px;pointer-events:none;flex-shrink:0;`;

    drag.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      drag.setPointerCapture(e.pointerId);
      drag.style.cursor = "grabbing";
      row.style.opacity = "0.35";

      const ghost = document.createElement("div");
      ghost.style.cssText = [
        "position:fixed", "pointer-events:none", "z-index:99999",
        "display:flex", "align-items:center", "gap:8px",
        "padding:5px 12px 5px 8px",
        "background:var(--popover,#1e1e1e)",
        `border:1px solid rgba(${accentColor},0.5)`,
        "border-radius:8px",
        "box-shadow:0 8px 28px rgba(0,0,0,0.55)",
        "opacity:0.92",
        "font-family:sans-serif", "font-size:12px", "font-weight:600",
        "color:var(--foreground)", "white-space:nowrap",
        "transition:none",
      ].join(";");

      const ghostThumb = renderLayerThumb(layer.id);
      ghostThumb.style.cssText =
        "flex-shrink:0;width:38px;height:28px;border-radius:3px;" +
        `border:1px solid rgba(${accentColor},0.3);display:block;`;
      ghost.appendChild(ghostThumb);
      const ghostName = document.createElement("span");
      ghostName.textContent = layer.name;
      ghost.appendChild(ghostName);
      document.body.appendChild(ghost);

      const _placeGhost = (ev) => {
        ghost.style.left = `${ev.clientX + 14}px`;
        ghost.style.top  = `${ev.clientY - ghost.offsetHeight / 2}px`;
      };
      _placeGhost(e);

      let dropVisualIdx = null;

      const onMove = (ev) => {
        _placeGhost(ev);
        const otherRows = [...list.querySelectorAll("[data-stack-id]")]
          .filter((r) => r.dataset.stackId !== layer.id);
        dropLine.remove();
        dropVisualIdx = otherRows.length;
        for (let i = 0; i < otherRows.length; i++) {
          const rect = otherRows[i].getBoundingClientRect();
          if (ev.clientY < rect.top + rect.height / 2) {
            dropVisualIdx = i;
            list.insertBefore(dropLine, otherRows[i]);
            break;
          }
        }
        if (!dropLine.parentElement) list.appendChild(dropLine);
      };

      const onUp = () => {
        drag.style.cursor = "grab";
        row.style.opacity = "";
        dropLine.remove();
        ghost.remove();
        drag.removeEventListener("pointermove", onMove);
        drag.removeEventListener("pointerup", onUp);
        drag.removeEventListener("pointercancel", onUp);
        if (dropVisualIdx !== null) {
          const m = getEffectiveLayerStack(_cv()).length - 1;
          moveStackLayerToIndex(layer.id, Math.max(0, Math.min(m, m - dropVisualIdx)));
        }
      };

      drag.addEventListener("pointermove", onMove);
      drag.addEventListener("pointerup", onUp);
      drag.addEventListener("pointercancel", onUp);
    });

    return drag;
  }

  // ── panel render ───────────────────────────────────────────────────────────

  function _renderPanel() {
    if (!panel) return;
    panel.innerHTML = "";

    const layers = _layers();
    const activeId = _activeId();
    const cv = _cv();
    const selIds = cv.selected_ids || [];
    const hasSelection = selIds.length > 0;

    // ── header ────────────────────────────────────────────────────────────────
    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;" +
      "padding:10px 12px 8px;border-bottom:1px solid var(--border);";

    const titleEl = document.createElement("span");
    titleEl.style.cssText = "font-size:13px;font-weight:700;color:var(--foreground);";
    titleEl.textContent = "Layers";
    header.appendChild(titleEl);

    const newBtn = document.createElement("button");
    newBtn.className = "ais-hud-btn";
    newBtn.appendChild(mkIcon("plus", 16));
    addTooltip(newBtn, "Create a new layer");
    newBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); createLayer(); });
    header.appendChild(newBtn);
    panel.appendChild(header);

    // ── unified layer list ─────────────────────────────────────────────────────
    const list = document.createElement("div");
    list.style.cssText = "display:flex;flex-direction:column;overflow-y:auto;max-height:260px;padding:4px 0;";

    const importedLayers = cv.imported_layers || [];
    const localLayerMap    = new Map(layers.map((l) => [l.id, l]));
    const importedLayerMap = new Map(importedLayers.map((l) => [l.id, l]));
    const stack = getEffectiveLayerStack(cv);

    // Top of list = front (highest stack index)
    for (let i = stack.length - 1; i >= 0; i--) {
      const id = stack[i];
      if (localLayerMap.has(id)) {
        list.appendChild(_buildRow(localLayerMap.get(id), id === activeId, i, stack.length, list));
      } else if (importedLayerMap.has(id)) {
        list.appendChild(_buildImportedRow(importedLayerMap.get(id), list, i, stack.length));
      }
    }

    panel.appendChild(list);

    // ── footer — layer count + selection summary ───────────────────────────────
    const footer = document.createElement("div");
    footer.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:8px;" +
      "padding:5px 8px 5px 12px;border-top:1px solid var(--border);";

    const footerLeft = document.createElement("span");
    footerLeft.style.cssText = "font-size:11px;color:var(--muted-foreground);";
    footerLeft.textContent = `${stack.length} layer${stack.length !== 1 ? "s" : ""}` +
      (importedLayers.length ? ` (${importedLayers.length} imported)` : "");
    footer.appendChild(footerLeft);

    if (hasSelection) {
      // Count groups as a single item
      const selAnns = effectiveAnnotations().filter((a) => selIds.includes(a.id));
      const groupIds = new Set(selAnns.filter((a) => a.group_id).map((a) => a.group_id));
      const itemCount = groupIds.size + selAnns.filter((a) => !a.group_id).length;

      const footerRight = document.createElement("div");
      footerRight.style.cssText = "display:flex;align-items:center;gap:4px;flex-shrink:0;";

      const selLabel = document.createElement("span");
      selLabel.style.cssText = "font-size:11px;color:var(--muted-foreground);";
      selLabel.textContent = `${itemCount} item${itemCount !== 1 ? "s" : ""} selected`;
      footerRight.appendChild(selLabel);

      const moveBtn = document.createElement("button");
      moveBtn.className = "ais-hud-btn";
      moveBtn.style.cssText = "width:22px;height:22px;";
      moveBtn.appendChild(mkIcon("square-arrow-right-enter", 14));
      addTooltip(moveBtn, "Move selected to layer");
      moveBtn.addEventListener("pointerdown", (e) => {
        e.stopPropagation(); e.preventDefault();
        if (moveDropdown) { _dismissMoveDropdown(); return; }
        const selLayerIds = new Set(selAnns.map((a) => a.layer_id));
        const selLayerId = selLayerIds.size === 1 ? [...selLayerIds][0] : null;
        _openMoveDropdown(moveBtn, [...layers, ...importedLayers], selLayerId);
      });
      footerRight.appendChild(moveBtn);
      footer.appendChild(footerRight);
    }
    panel.appendChild(footer);

    // Trigger rename if scheduled (e.g. from the … menu)
    if (_pendingRenameId) {
      const targetId = _pendingRenameId;
      _pendingRenameId = null;
      requestAnimationFrame(() => {
        const nameEl = panel?.querySelector(`[data-rename-id="${targetId}"]`);
        const layer = _layers().find((l) => l.id === targetId);
        if (nameEl && layer) _startRename(nameEl, layer);
      });
    }
  }

  function _buildRow(layer, isActive, idx, total, list) {
    const isolatedLayerId = _cv().isolated_layer_id ?? null;
    const isIsolated = isolatedLayerId === layer.id;
    const otherIsIsolated = isolatedLayerId && !isIsolated;

    const row = document.createElement("div");
    row.dataset.stackId = layer.id;
    row.style.cssText =
      "display:flex;align-items:center;gap:6px;padding:5px 8px 5px 0;position:relative;cursor:pointer;" +
      "border-left:3px solid " + (isActive ? `rgba(${SEL_COLOR_RGB},0.85)` : "transparent") + ";" +
      (otherIsIsolated ? "opacity:0.35;" : "");

    row.addEventListener("pointerover", () => { if (!isActive) row.style.background = "rgba(255,255,255,0.05)"; });
    row.addEventListener("pointerout",  () => { row.style.background = ""; });
    row.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      e.stopPropagation();
      setActive(layer.id);
    });

    row.appendChild(_buildDragHandle(layer, row, list, SEL_COLOR_RGB));

    // ── thumbnail ──────────────────────────────────────────────────────────────
    const thumb = renderLayerThumb(layer.id);
    thumb.style.cssText =
      "flex-shrink:0;width:38px;height:28px;border-radius:3px;" +
      "border:1px solid var(--border);background:var(--muted);display:block;" +
      (layer.visible ? "" : "opacity:0.35;");
    row.appendChild(thumb);

    // ── layer name (double-click to rename) ────────────────────────────────────
    const nameWrap = document.createElement("div");
    nameWrap.style.cssText = "flex:1;min-width:0;";

    const nameEl = document.createElement("span");
    nameEl.style.cssText =
      "display:block;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" +
      "color:var(--foreground);" + (layer.visible ? "" : "opacity:0.4;");
    nameEl.dataset.renameId = layer.id;
    nameEl.textContent = layer.name;
    nameEl.addEventListener("dblclick", (e) => { e.stopPropagation(); _startRename(nameEl, layer); });
    nameWrap.appendChild(nameEl);
    row.appendChild(nameWrap);

    // ── visibility toggle ──────────────────────────────────────────────────────
    const visBtn = document.createElement("button");
    visBtn.className = "ais-hud-btn";
    visBtn.style.cssText = "width:26px;height:26px;flex-shrink:0;opacity:" + (layer.visible ? "0.55" : "0.25") + ";";
    visBtn.appendChild(mkIcon(layer.visible ? "eye" : "eye-closed", 14));
    addTooltip(visBtn, layer.visible ? "Hide layer" : "Show layer");
    visBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); toggleVisibility(layer.id); });
    row.appendChild(visBtn);

    // ── lock toggle ───────────────────────────────────────────────────────────
    const isLocked = !!layer.locked;
    const lockBtn = document.createElement("button");
    lockBtn.className = "ais-hud-btn";
    lockBtn.style.cssText = "width:26px;height:26px;flex-shrink:0;" + (isLocked ? "opacity:1;" : "opacity:0.25;");
    lockBtn.appendChild(mkIcon(isLocked ? "lock" : "lock-open", 13));
    addTooltip(lockBtn, isLocked ? "Unlock layer" : "Lock layer");
    lockBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); toggleLock(layer.id); });
    row.appendChild(lockBtn);

    // ── isolation toggle ───────────────────────────────────────────────────────
    const isolateBtn = document.createElement("button");
    isolateBtn.className = "ais-hud-btn";
    isolateBtn.style.cssText =
      "width:26px;height:26px;flex-shrink:0;" +
      (isIsolated
        ? `color:rgba(${SEL_COLOR_RGB},1);opacity:1;`
        : "opacity:0.3;");
    isolateBtn.appendChild(mkIcon("scan", 14));
    addTooltip(isolateBtn, isIsolated ? "Exit isolation" : "Isolate layer");
    isolateBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); toggleIsolation(layer.id); });
    row.appendChild(isolateBtn);

    // ── more actions (⋯) ──────────────────────────────────────────────────────
    const moreBtn = document.createElement("button");
    moreBtn.className = "ais-hud-btn";
    moreBtn.style.cssText = "width:26px;height:26px;flex-shrink:0;margin-right:4px;opacity:0.55;";
    moreBtn.appendChild(mkIcon("ellipsis-vertical", 14));
    addTooltip(moreBtn, "Layer options");
    moreBtn.addEventListener("pointerdown", (e) => {
      e.stopPropagation(); e.preventDefault();
      _dismissMoreMenu();
      _openMoreMenu(moreBtn, layer, idx, total);
    });
    row.appendChild(moreBtn);

    return row;
  }

  // ── imported layer row (read-only, visibility override only) ─────────────────

  function _buildImportedRow(layer, list, stackIdx, stackTotal) {
    const cv = _cv();
    const impOvr = (cv.imported_layer_overrides || {})[layer.id] || {};
    const isVisible = impOvr.visible !== undefined ? impOvr.visible : (layer.visible !== false);
    const isActive = cv.active_layer_id === layer.id;

    const row = document.createElement("div");
    row.dataset.stackId = layer.id;
    row.style.cssText =
      "display:flex;align-items:center;gap:6px;padding:5px 8px 5px 0;cursor:pointer;" +
      `border-left:3px solid ${isActive ? `rgba(${IMP_COLOR_RGB},0.85)` : "transparent"};` +
      (isVisible ? "" : "opacity:0.5;");

    row.addEventListener("pointerover", () => { if (!isActive) row.style.background = "rgba(255,255,255,0.05)"; });
    row.addEventListener("pointerout",  () => { row.style.background = ""; });
    row.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      e.stopPropagation();
      setActive(layer.id);
    });

    row.appendChild(_buildDragHandle(layer, row, list, IMP_COLOR_RGB));

    // Thumbnail
    const thumb = renderLayerThumb(layer.id);
    thumb.style.cssText =
      "flex-shrink:0;width:38px;height:28px;border-radius:3px;display:block;" +
      `border:1px solid rgba(${IMP_COLOR_RGB},0.3);background:var(--muted);`;
    row.appendChild(thumb);

    // Name + "imported" badge
    const nameWrap = document.createElement("div");
    nameWrap.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;";
    const nameEl = document.createElement("span");
    nameEl.style.cssText =
      "display:block;font-size:12px;color:var(--foreground);" +
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
    nameEl.textContent = layer.name;
    const importedBadge = document.createElement("span");
    importedBadge.style.cssText =
      `font-size:9px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;` +
      `color:rgba(${IMP_COLOR_RGB},0.7);line-height:1.2;`;
    importedBadge.textContent = "imported";
    nameWrap.appendChild(nameEl);
    nameWrap.appendChild(importedBadge);
    row.appendChild(nameWrap);

    // Visibility toggle (writes to imported_layer_overrides)
    const visBtn = document.createElement("button");
    visBtn.className = "ais-hud-btn";
    visBtn.style.cssText = "width:26px;height:26px;flex-shrink:0;opacity:" + (isVisible ? "0.55" : "0.25") + ";";
    visBtn.appendChild(mkIcon(isVisible ? "eye" : "eye-closed", 14));
    addTooltip(visBtn, isVisible ? "Hide imported layer" : "Show imported layer");
    visBtn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      const cv2 = _cv();
      const newOvr = {
        ...(cv2.imported_layer_overrides || {}),
        [layer.id]: { ...impOvr, visible: !isVisible },
      };
      setCurrentValue({ ...cv2, imported_layer_overrides: newOvr });
      emit(); renderCanvas();
      if (panel) _renderPanel();
    });
    row.appendChild(visBtn);

    // Lock toggle (writes to imported_layer_overrides)
    const impIsLocked = impOvr.locked ?? false;
    const impLockBtn = document.createElement("button");
    impLockBtn.className = "ais-hud-btn";
    impLockBtn.style.cssText = "width:26px;height:26px;flex-shrink:0;margin-right:4px;" +
      (impIsLocked ? "opacity:1;" : "opacity:0.25;");
    impLockBtn.appendChild(mkIcon(impIsLocked ? "lock" : "lock-open", 13));
    addTooltip(impLockBtn, impIsLocked ? "Unlock layer" : "Lock layer");
    impLockBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); toggleImportedLock(layer.id); });
    row.appendChild(impLockBtn);

    return row;
  }

  // ── inline rename ─────────────────────────────────────────────────────────

  function _startRename(nameEl, layer) {
    const input = document.createElement("input");
    input.value = layer.name;
    input.style.cssText =
      "width:100%;font-size:12px;background:var(--card);color:var(--foreground);" +
      "border:1px solid var(--border);border-radius:3px;padding:1px 4px;outline:none;";
    nameEl.replaceWith(input);
    input.focus(); input.select();
    const commit = () => renameLayer(layer.id, input.value);
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") { ev.preventDefault(); commit(); }
      if (ev.key === "Escape") { ev.preventDefault(); if (panel) _renderPanel(); }
    });
  }

  // ── "Move to layer" dropdown ───────────────────────────────────────────────

  function _openMoveDropdown(anchorEl, layers, selLayerId) {
    moveDropdown = document.createElement("div");
    moveDropdown.style.cssText = [
      "position:fixed", "background:var(--popover,#1e1e1e)",
      "border:1px solid var(--border,#444)", "border-radius:8px",
      "box-shadow:0 4px 16px rgba(0,0,0,0.5)", "z-index:10001",
      "overflow:hidden", "min-width:180px", "font-size:12px",
    ].join(";");

    // Title
    const titleEl = document.createElement("div");
    titleEl.style.cssText =
      "padding:8px 12px 6px;font-size:11px;font-weight:600;color:var(--muted-foreground);" +
      "letter-spacing:0.04em;text-transform:uppercase;border-bottom:1px solid var(--border);";
    titleEl.textContent = "Move to layer";
    moveDropdown.appendChild(titleEl);

    // Layer rows — front-to-back (same order as the panel list)
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      const isCurrent = layer.id === selLayerId;
      const item = document.createElement("div");
      item.style.cssText =
        "padding:7px 12px;white-space:nowrap;display:flex;align-items:center;gap:8px;" +
        "color:var(--foreground);" +
        (isCurrent ? "opacity:0.35;pointer-events:none;" : "cursor:pointer;");
      const nameSpan = document.createElement("span");
      nameSpan.style.cssText = "flex:1;";
      nameSpan.textContent = layer.name;
      item.appendChild(nameSpan);
      if (!isCurrent) {
        item.addEventListener("pointerover",  () => { item.style.background = `rgba(${SEL_COLOR_RGB},0.18)`; });
        item.addEventListener("pointerout",   () => { item.style.background = ""; });
        item.addEventListener("pointerdown",  (e) => { e.stopPropagation(); moveSelectionToLayer(layer.id); });
      }
      moveDropdown.appendChild(item);
    }

    document.body.appendChild(moveDropdown);
    _positionBelow(moveDropdown, anchorEl, true);
    setTimeout(() => document.addEventListener("pointerdown", _outsideMoveClick, true), 0);
  }

  // ── per-layer "..." menu ───────────────────────────────────────────────────

  function _openMoreMenu(anchorEl, layer, idx, total) {
    _dismissMoreMenu();
    moreMenu = document.createElement("div");
    moreMenu.style.cssText = [
      "position:fixed", "background:var(--popover,#1e1e1e)",
      "border:1px solid var(--border,#444)", "border-radius:6px",
      "box-shadow:0 4px 16px rgba(0,0,0,0.5)", "z-index:10001",
      "overflow:hidden", "min-width:150px", "font-size:12px",
    ].join(";");

    const atTop    = idx >= total - 1; // already the front layer
    const atBottom = idx <= 0;         // already the back layer

    const ITEMS = [
      { label: "Select items",  action: () => { _dismissMoreMenu(); selectLayerItems(layer.id); } },
      null,
      { label: "Rename",        action: () => { _dismissMoreMenu(); _pendingRenameId = layer.id; if (panel) _renderPanel(); } },
      null,
      { label: "Move to front", action: () => { _dismissMoreMenu(); reorderLayer(layer.id, "up");   }, disabled: atTop },
      { label: "Move to back",  action: () => { _dismissMoreMenu(); reorderLayer(layer.id, "down"); }, disabled: atBottom },
      null,
      { label: "Delete layer",  action: () => { _dismissMoreMenu(); deleteLayer(layer.id); }, danger: true, disabled: total <= 1 },
    ];

    for (const item of ITEMS) {
      if (!item) {
        const sep = document.createElement("div");
        sep.style.cssText = "height:1px;background:var(--border);margin:3px 0;";
        moreMenu.appendChild(sep);
        continue;
      }
      const el = document.createElement("div");
      el.style.cssText =
        "padding:7px 12px;white-space:nowrap;" +
        (item.danger ? "color:#f87171;" : "color:var(--foreground);") +
        (item.disabled ? "opacity:0.35;pointer-events:none;" : "cursor:pointer;");
      el.textContent = item.label;
      if (!item.disabled) {
        el.addEventListener("pointerover",  () => { el.style.background = `rgba(${SEL_COLOR_RGB},0.15)`; });
        el.addEventListener("pointerout",   () => { el.style.background = ""; });
        el.addEventListener("pointerdown",  (e) => { e.stopPropagation(); item.action(); });
      }
      moreMenu.appendChild(el);
    }

    document.body.appendChild(moreMenu);
    _positionBelow(moreMenu, anchorEl, true);
    setTimeout(() => document.addEventListener("pointerdown", _outsideMoreClick, true), 0);
  }

  // ── position helper ────────────────────────────────────────────────────────

  function _positionBelow(el, anchorEl, alignRight = false) {
    const bRect = anchorEl.getBoundingClientRect();
    el.style.top = `${bRect.bottom + 4}px`;
    requestAnimationFrame(() => {
      const pw = el.offsetWidth;
      let left = alignRight ? bRect.right - pw : bRect.left;
      if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
      if (left < 8) left = 8;
      el.style.left = `${left}px`;
    });
  }

  // ── open / toggle panel ────────────────────────────────────────────────────

  function _open() {
    if (panel) { dismiss(); return; }

    panel = document.createElement("div");
    panel.style.cssText = [
      "position:fixed",
      "background:var(--popover,#1e1e1e)",
      "border:1px solid var(--border,#444)",
      "border-radius:10px",
      "box-shadow:0 8px 32px rgba(0,0,0,0.55)",
      "z-index:10000",
      "min-width:300px",
      "max-width:400px",
      "overflow:hidden",
    ].join(";");

    _renderPanel();
    document.body.appendChild(panel);
    _positionBelow(panel, buttonEl, true);
    setTimeout(() => document.addEventListener("pointerdown", _outsidePanelClick, true), 0);
  }

  // ── update button label ────────────────────────────────────────────────────

  function update() {
    if (!labelEl) return;
    const cv = _cv();
    const activeId = _activeId();
    const layers = _layers();
    const importedLayers = cv.imported_layers || [];
    const isImported = !!importedLayers.find((l) => l.id === activeId);
    const active = layers.find((l) => l.id === activeId)
      || importedLayers.find((l) => l.id === activeId)
      || layers[0];
    labelEl.textContent = active?.name ?? "Layer 1";
    // Amber icon when on an imported layer, muted otherwise
    if (iconWrapEl) iconWrapEl.style.color = isImported ? `rgb(${IMP_COLOR_RGB})` : "";
  }

  buttonEl.addEventListener("pointerdown", (e) => {
    e.stopPropagation(); e.preventDefault(); buttonEl.blur();
    _open();
  });

  return { update, dismiss };
}
