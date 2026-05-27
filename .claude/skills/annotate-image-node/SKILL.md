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
- `griptape_nodes_library_annotate/widgets/AnnotateImage/_icons.js` — SVG icon registry
- `griptape_nodes_library_annotate/widgets/AnnotateImage/_styles.js` — all constants (colors, sizes, opacities, dash patterns)
- `griptape_nodes_library_annotate/widgets/AnnotateImage/_tooltip.js` — tooltip factory

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
  "image_url": "http://...",        // browser-accessible URL for the canvas background
  "raw_url": "/path/to/file.png",   // filesystem path used by Python for compositing
  "canvas_width": 1920,
  "canvas_height": 1080,
  "active_tool": "select",
  "tool_settings": { ... },         // per-tool defaults (see below)
  "annotations": [ ... ],           // locally created annotations
  "imported_annotations": [ ... ],  // annotations received from upstream node
  "overrides": { "id": { ... } },   // per-id field overrides for imported annotations
  "selected_ids": ["id1", "id2"]
}
```

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

All annotations share `id` (unique string) and `type`. Additional fields per type:

**paint**
```json
{
  "id": "paint-1", "type": "paint",
  "strokes": [
    { "color": "#ff0000", "size": 8, "points": [[x, y, size], ...] }
  ],
  "x": 0, "y": 0,            // translation offset
  "scaleX": 1, "scaleY": 1, // scale applied from transform handles
  "rotation": 0,             // radians
  "cx": null, "cy": null,    // natural center (computed from strokes if null)
  "sizeScale": 1.0           // brush size scale from transform
}
```

**text**
```json
{
  "id": "text-1", "type": "text",
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
  "id": "arrow-1", "type": "arrow",
  "x1": 100, "y1": 100, "x2": 400, "y2": 300,
  "cp1x": null, "cp1y": null,   // bezier control points (null = auto)
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
  "id": "rect-1", "type": "rect",
  "x": 200, "y": 150,   // center point
  "w": 300, "h": 200,   // total width/height
  "rotation": 0,
  "color": "#ff0000",
  "width": 8,
  "fill_color": ""
}
```

**ellipse**
```json
{
  "id": "ellipse-1", "type": "ellipse",
  "x": 200, "y": 150,   // center point
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
imported_annotations (with overrides applied, deleted ones skipped) + annotations
```

**Override rules:**
- Imported annotations are never mutated; changes write to `overrides[id]`
- `overrides[id] = { field: newValue }` — only differing fields stored
- `overrides[id] = { deleted: true }` — soft-delete

**JS helper:** `_effectiveAnnotations()` in `AnnotateImage.js`  
**Python helper:** `_effective_annotations(annotation_data)` in `annotate_image.py`

Selection chrome: local annotations use blue (`SEL_COLOR`), imported annotations use amber (`IMP_COLOR`).

---

## JS Widget Architecture

### Entry Point (`AnnotateImage.js`)

- Exports `default function AnnotateImageSimple(container, props)`
- Returns `{ cleanup, update: handleUpdate }` — framework calls `update` on value changes
- Owns all top-level state: `currentValue`, `activeTool`, `toolSettings`, view transform (`viewScale`, `panX`, `panY`)
- Wires all modules together via dependency injection (closures)

### Module Responsibilities

| File | Owns |
|---|---|
| `_toolbar.js` | Sidebar tool buttons + header bar layout (3 regions). Exports `createToolbar()` |
| `_settings.js` | Content of the `settingsArea` (left header region). Populates based on active tool + selection |
| `_object_actions.js` | Content of `objectActionsEl` (right header region). Group/ungroup, layer order, delete, reset overrides |
| `_drawing.js` | All canvas draw calls for committed annotations. Factory bound to live state |
| `_geometry.js` | OBB helpers, bounding boxes, bezier control point defaults, paint transform math |
| `_hotkeys.js` | All `document`-level keyboard listeners (tool shortcuts, delete, undo, etc.) |
| `_styles.js` | All constants. Import from here; never hardcode colors or sizes elsewhere |
| `_tooltip.js` | `createTooltip()` → `addTooltip(el, text)` |
| `_icons.js` | `mkIcon(id, size?)` → SVG element |

### Header Bar Layout

```
headerBar (flex row)
├── settingsArea   (flex:1, left) — tool/annotation settings
├── objectActionsEl (flex-shrink:0, right of settings) — object actions, display:none when empty
└── viewControls   (flex-shrink:0, far right) — fit-to-canvas [F] + expand modal
```

### `createToolbar()` Return Value

```js
{ sidebar, headerBar, settingsArea, objectActionsEl, toolBtns,
  setActiveTool(id),        // updates button active state
  setResetViewEnabled(bool), // dims/enables the fit-to-canvas button
  updateExpandIcon(isExpanded) // swaps expand ↔ contract icon
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

> **IMPORTANT — JS/Python parity rule:** Any change to how an annotation type is drawn in `_drawing.js` **must** be mirrored in the corresponding `_draw_<type>()` method in `annotate_image.py`, and vice versa. The JS widget is the live preview; Python is the final render — they must produce identical output. This includes geometry formulas, new annotation fields, and math fixes (e.g. taper, arrowhead size).

---

## Adding a New Annotation Type

1. Add draw function to `_drawing.js` and export it from `createDrawing()`
2. Add hit test branch in `hitTest()` in `AnnotateImage.js`
3. Add bounding box branch in `_getAnnotationBounds()`
4. Add pointer-down handling in `onPointerDown()`
5. Add in-progress preview in `_doRender()`
6. Add render call in `drawAnnotation()`
7. Add tool entry to `DRAW_TOOLS` in `_toolbar.js`
8. Add icon path to `_icons.js`
9. Add tool settings to `_settings.js` and defaults to `_styles.js`
10. Add Python draw method `_draw_<type>()` in `annotate_image.py` and call it in `process()`
