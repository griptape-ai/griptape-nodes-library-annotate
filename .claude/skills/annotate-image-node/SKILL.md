---
name: annotate-image-node
description: Architecture, data format, and capabilities of the AnnotateImage node and its JS widget. Use when reading, editing, or extending the annotate image node or its widget files.
---

# AnnotateImage Node

## Overview

One Python node (`AnnotateImage`) backed by one JS widget (`AnnotateImage.js`). The widget is the primary interface — users draw on it and the result flows out as both a rendered PNG and a raw annotation JSON dict.

**Files:**
- `griptape_nodes_library_annotate/annotate_image.py` — Python node
- `griptape_nodes_library_annotate/widgets/AnnotateImage/AnnotateImage.js` — widget entry point
- `griptape_nodes_library_annotate/widgets/AnnotateImage/_toolbar.js` — sidebar tool picker + header bar chrome
- `griptape_nodes_library_annotate/widgets/AnnotateImage/_settings.js` — per-tool and per-annotation settings panel (populates `settingsArea`)
- `griptape_nodes_library_annotate/widgets/AnnotateImage/_object_actions.js` — contextual object actions panel (group, layer order, delete, reset; populates `objectActionsEl`)
- `griptape_nodes_library_annotate/widgets/AnnotateImage/_drawing.js` — canvas draw functions for all annotation types
- `griptape_nodes_library_annotate/widgets/AnnotateImage/_geometry.js` — bounding box, transform, and OBB helpers
- `griptape_nodes_library_annotate/widgets/AnnotateImage/_hotkeys.js` — all document-level keyboard listeners
- `griptape_nodes_library_annotate/widgets/AnnotateImage/_icons.js` — SVG icon registry (see **annotate-image-icons** skill for the full list)
- `griptape_nodes_library_annotate/widgets/AnnotateImage/_styles.js` — all constants (colors, sizes, opacities, dash patterns)
- `griptape_nodes_library_annotate/widgets/AnnotateImage/_tooltip.js` — tooltip factory
- `griptape_nodes_library_annotate/widgets/AnnotateImage/_layers.js` — layers panel and operations (see **annotate-image-layers** skill)

---

## Python Node Parameters

| Parameter | Type | Modes | Purpose |
|---|---|---|---|
| `input_image` | `ParameterImage` | INPUT, OUTPUT | Source image to annotate |
| `input_annotation_data` | `ParameterDict` | INPUT | Annotation dict from an upstream node (imported layer) |
| `output_annotation_data` | `ParameterDict` | PROPERTY, OUTPUT | Full canvas state dict — also hosts the JS widget |
| `output_image` | `ParameterImage` | OUTPUT | Composited PNG with annotations baked in |
| `output_file` | `ProjectFileParameter` | — | Destination path for the composited PNG |

The widget lives on `output_annotation_data` via `Widget(name="AnnotateImage", library="Annotate Image Library")`.

---

## Annotation Data Format

`output_annotation_data` is the single source of truth for everything the widget and Python compositor use.

```json
{
  "image_url": "http://...",
  "raw_url": "/path/to/file.png",
  "canvas_width": 1920,
  "canvas_height": 1080,
  "active_tool": "select",
  "tool_settings": { ... },
  "annotations": [ ... ],
  "imported_annotations": [ ... ],
  "overrides": { "id": { ... } },
  "selected_ids": ["id1", "id2"],

  "layers": [ { "id": "layer-abc123", "name": "Layer 1", "visible": true, "locked": false } ],
  "active_layer_id": "layer-abc123",
  "layer_stack": ["layer-abc123", ...],
  "imported_layers": [ { "id": "...", "name": "...", "visible": true } ],
  "imported_layer_overrides": { "layer-id": { "visible": false, "locked": true } },
  "isolated_layer_id": null
}
```

See the **annotate-image-layers** skill for full documentation of the layer fields.

### Tool Settings

```json
{
  "tool_settings": {
    "paint":   { "color": "#ff0000", "size": 8 },
    "text":    { "color": "#ff0000", "font_size": 48, "text_align": "left", "bg_color": "" },
    "arrow":   { "color": "#ff0000", "width": 8, "has_start_arrow": false, "has_end_arrow": true, "is_bezier": false, "taper": false, "arrow_size": 20 },
    "rect":    { "color": "#ff0000", "width": 8, "fill_color": "" },
    "ellipse": { "color": "#ff0000", "width": 8, "fill_color": "" }
  }
}
```

### Annotation Types

All annotations share `id` (unique string), `type`, and `layer_id` (which layer this belongs to; absent = default/first layer).

**paint**
```json
{
  "id": "paint-1", "type": "paint", "layer_id": "layer-abc123",
  "strokes": [
    { "color": "#ff0000", "size": 8, "points": [[x, y, size], ...] }
  ],
  "x": 0, "y": 0,
  "scaleX": 1, "scaleY": 1,
  "rotation": 0,
  "cx": null, "cy": null,
  "sizeScale": 1.0
}
```

**text**
```json
{
  "id": "text-1", "type": "text", "layer_id": "layer-abc123",
  "text": "Shot Description",
  "x": 10, "y": 10,
  "rotation": 0,
  "color": "#96fdfb",
  "font_size": 48,
  "text_align": "left",
  "bg_color": "#4f4f4fa6"
}
```

**arrow**
```json
{
  "id": "arrow-1", "type": "arrow", "layer_id": "layer-abc123",
  "x1": 100, "y1": 100, "x2": 400, "y2": 300,
  "cp1x": null, "cp1y": null,
  "cp2x": null, "cp2y": null,
  "color": "#ff0000",
  "width": 8,
  "arrow_size": 20,
  "has_start_arrow": false,
  "has_end_arrow": true,
  "is_bezier": false,
  "taper": false
}
```

**rect**
```json
{
  "id": "rect-1", "type": "rect", "layer_id": "layer-abc123",
  "x": 200, "y": 150,
  "w": 300, "h": 200,
  "rotation": 0,
  "color": "#ff0000",
  "width": 8,
  "fill_color": ""
}
```

**ellipse**
```json
{
  "id": "ellipse-1", "type": "ellipse", "layer_id": "layer-abc123",
  "x": 200, "y": 150,
  "w": 300, "h": 200,
  "rotation": 0,
  "color": "#ff0000",
  "width": 8,
  "fill_color": ""
}
```

---

## Imported Annotations and Overrides

When an upstream `output_annotation_data` is wired into `input_annotation_data`, Python resolves it into an `imported_annotations` array and writes it into `output_annotation_data`. The JS widget renders imported annotations alongside local ones.

**Effective annotation list** (used for rendering, hit testing, export):
```
imported_annotations (overrides applied, deleted ones skipped, hidden-layer ones filtered)
+ local annotations
sorted by layer_stack order
```

**Override rules:**
- Imported annotations are never mutated; changes write to `overrides[id]`
- `overrides[id] = { field: newValue }` — only differing fields stored
- `overrides[id] = { deleted: true }` — soft-delete

**JS helper:** `_effectiveAnnotations()` in `AnnotateImage.js`  
**Python helper:** `_effective_annotations(annotation_data)` in `annotate_image.py`

Selection chrome: local annotations use blue (`SEL_COLOR`), imported annotations use amber (`IMP_COLOR`).

---

## JS/Python Parity — Critical Rule

> **IMPORTANT:** Any change to how an annotation type is drawn in `_drawing.js` **must** be mirrored in the corresponding `_draw_<type>()` method in `annotate_image.py`, and vice versa. The JS widget is the live preview; Python is the final render — they must produce identical output.

This parity applies to:
- Geometry formulas and math (taper, arrowhead size, transform order)
- New annotation fields
- Layer filtering logic (`_effectiveAnnotations` / `_effective_annotations`)
- Visibility filtering (hidden layers, isolated layer, imported layer overrides)
- Opacity / alpha compositing

### Opacity (Alpha Compositing) — Critical Pitfall

`ImageDraw` in Pillow sets pixels directly and **does not composite**. Drawing a semi-transparent annotation directly to `overlay` makes it fully opaque. The correct pattern for every annotation type except text:

```python
ann_temp = Image.new("RGBA", overlay.size, (0, 0, 0, 0))
ann_draw = ImageDraw.Draw(ann_temp)
# ... draw onto ann_draw ...
overlay.alpha_composite(ann_temp)
```

Text handles its own temp/composite internally (required for rotation). **Never** draw other annotation types directly to `overlay` via `ImageDraw.Draw(overlay)`.

`_parse_color()` must preserve the alpha from `parse_color_to_rgba`:

```python
r, g, b, a = parse_color_to_rgba(color_str)
return (r, g, b, int(a * opacity))
```

Do **not** discard `a` with `_` or hardcode `255`.

---

## JS Widget Architecture

### Entry Point (`AnnotateImage.js`)

- Exports `default function AnnotateImageSimple(container, props)`
- Returns `{ cleanup, update: handleUpdate }` — framework calls `update` on value changes
- Owns all top-level state: `currentValue`, `activeTool`, `toolSettings`, view transform (`viewScale`, `panX`, `panY`)
- Wires all modules together via dependency injection (closures)
- Calls `ensureLayers(currentValue)` at init to guarantee a valid layer exists

### Module Responsibilities

| File | Owns |
|---|---|
| `_toolbar.js` | Sidebar tool buttons + header bar layout (3 regions). Exports `createToolbar()`. Includes the layers status pill (icon + label + chevron) in the header. |
| `_settings.js` | Content of the `settingsArea` (left header region). Populates based on active tool + selection. Includes object ordering popup (Bring to Front / Back). |
| `_object_actions.js` | Content of `objectActionsEl` (right header region). Group/ungroup, delete, reset overrides. `reorderAnnotations` is layer-aware (skips annotations on other layers). |
| `_drawing.js` | All canvas draw calls for committed annotations. Factory bound to live state. |
| `_geometry.js` | OBB helpers, bounding boxes, bezier control point defaults, paint transform math. |
| `_hotkeys.js` | All `document`-level keyboard listeners (tool shortcuts, delete, undo, etc.). |
| `_styles.js` | All constants. Import from here; never hardcode colors or sizes elsewhere. |
| `_tooltip.js` | `createTooltip()` → `addTooltip(el, text)` |
| `_icons.js` | `mkIcon(id, size?)` → SVG element. See **annotate-image-icons** skill for the full registry. |
| `_layers.js` | Layers panel UI + all layer operations. See **annotate-image-layers** skill. |

### Header Bar Layout

```
headerBar (flex row)
├── settingsArea    (flex:1, left) — tool/annotation settings
├── objectActionsEl (flex-shrink:0, hidden when empty) — object actions
├── [divider]
├── layersBtn       (status pill: icon + active layer name + chevron) — opens layers panel
└── viewControls   (flex-shrink:0, far right) — fit-to-canvas [F] + expand modal
```

### `createToolbar()` Return Value

```js
{ sidebar, headerBar, settingsArea, objectActionsEl,
  layersBtn, layersLabelEl, layersIconWrap,
  toolBtns,
  setActiveTool(id),
  setResetViewEnabled(bool),
  updateExpandIcon(isExpanded)
}
```

### Key State Patterns

**Emitting changes:** `_emit()` calls `onChange({ ...currentValue })` — always pass a copy.

**Rendering:** `renderCanvas()` schedules via RAF with a generation counter to cancel stale frames. `_doRender()` is async (image load) but synchronous from clear → draw to prevent flicker.

**Text editing:** An overlay `<textarea>` is positioned/rotated to match the annotation. Committing either saves the text and drops to select mode, or deletes the annotation if empty.

**Transform frame (OBB):** `txFrame = { pivotX, pivotY, rotation, halfW, halfH }`. For single paint/rect/ellipse it matches the annotation's own rotation. For groups it accumulates rotation during drag. Rebuilt by `_buildTxFrame()` which is called from `rebuildSettings()`.

**Drag state types:** `translate`, `txRotate`, `txScale`, `arrowHandle`, `arrowCp`, `marquee`, `zoom`

---

## Python Compositing

`process()` reads `output_annotation_data`, loads the background image, creates an RGBA overlay, draws all effective annotations onto it using Pillow, then alpha-composites and saves as PNG.

Draw functions mirror the JS render exactly:
- `_draw_paint` — interprets strokes with transform (translate + scale + rotate around natural center)
- `_draw_text` — rotated text uses an oversized temp image to avoid clipping
- `_draw_arrow` — samples cubic bezier, uniform or tapered width, filled arrowheads
- `_draw_rect` — rotated polygon (4 corners)
- `_draw_ellipse` — axis-aligned ellipse (rotation not yet supported in Python)

Color parsing via `griptape_nodes_library_annotate.utils.color_utils.parse_color_to_rgba`.

### `_effective_annotations(annotation_data)` — Python

The Python counterpart to JS `_effectiveAnnotations()`. In order:
1. Merge `imported_annotations` with `overrides` (skip deleted), apply `imported_layer_overrides` (filter hidden)
2. Append local `annotations`
3. Filter out annotations on hidden local layers
4. Sort by `layer_stack` (or fallback `[imported ids] + [local ids]`)
5. Filter to `isolated_layer_id` if set

---

## Known Issues / Gotchas

### Engine Serialization Bug

`ParameterDict` + `Widget` + `LifecycleStage.BETA` in the same node manifest causes a save/reload failure after Griptape Nodes engine commit `1ba3709d`. The repr `stage=<LifecycleStage.BETA: 'BETA'>` is emitted as invalid Python syntax in saved workflows.

**Workaround:** `AnnotateImage` has `"declarations": []` in `griptape-nodes-library.json` (BETA removed). Do not add BETA back to this node until the engine bug is fixed.

### E741 Lint — Ambiguous Variable Name

Python lints `l` as an ambiguous variable name (E741). All list comprehensions in `annotate_image.py` must use `layer` (or any non-`l` name) as the loop variable:

```python
# WRONG — fails CI (ruff check)
hidden_ids = {l["id"] for l in layers if not l.get("visible", True)}

# CORRECT
hidden_ids = {layer["id"] for layer in layers if not layer.get("visible", True)}
```

CI runs `ruff check` — this will fail the PR if you use `l` as a loop variable.

---

## Adding a New Annotation Type

1. Add draw function to `_drawing.js` and export it from `createDrawing()`
2. Add hit test branch in `hitTest()` in `AnnotateImage.js`
3. Add bounding box branch in `_getAnnotationBounds()`
4. Add pointer-down handling in `onPointerDown()`
5. Add in-progress preview in `_doRender()`
6. Add render call in `drawAnnotation()`
7. Add tool entry to `DRAW_TOOLS` in `_toolbar.js`
8. Add icon to `_icons.js` — see **annotate-image-icons** skill; ask the user for the SVG if needed
9. Add tool settings to `_settings.js` and defaults to `_styles.js`
10. Add Python draw method `_draw_<type>()` in `annotate_image.py` and call it in `process()`
11. Stamp `layer_id: currentValue.active_layer_id || currentValue.layers?.[0]?.id` on the new annotation object (same as all existing types)
12. Use `ann_temp` + `overlay.alpha_composite(ann_temp)` in `process()` — **not** `ImageDraw.Draw(overlay)` directly
