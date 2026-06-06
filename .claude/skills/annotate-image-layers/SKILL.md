---
name: annotate-image-layers
description: Full layers system for the AnnotateImage node — data model, JS panel operations, imported layers, Python parity, and how to add new layer features. Load this when working on anything layer-related.
---

# AnnotateImage — Layers System

**Main file:** `griptape_nodes_library_annotate/widgets/AnnotateImage/_layers.js`  
**Exports:** `createLayersPanel`, `ensureLayers`, `getEffectiveLayerStack`  
**Python side:** `_effective_annotations()` and `after_value_set()` in `annotate_image.py`

---

## Data Model

These fields live inside `output_annotation_data`:

| Field | Type | Purpose |
|---|---|---|
| `layers` | `[{id, name, visible, locked}]` | Local layers, back-to-front (index 0 = back) |
| `active_layer_id` | string | Layer new annotations go into; only its annotations are selectable/drawable |
| `layer_stack` | `[id, ...]` | Unified render order for ALL layers (local + imported). Index 0 = back. This is the authority. |
| `imported_layers` | `[{id, name, visible}]` | Layers received from upstream; ordered by upstream `layer_stack` |
| `imported_layer_overrides` | `{layerId: {visible?, locked?}}` | Downstream visibility/lock overrides for imported layers |
| `isolated_layer_id` | string or null | When set, only this layer's annotations are rendered |

Every annotation also carries `layer_id` — the ID of the layer it belongs to. Absent means "default (first local) layer."

---

## Layer ID Uniqueness

Layer IDs are **never hardcoded**. `ensureLayers()` always generates a unique ID:

```js
id: `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
```

This prevents collisions when two nodes are connected — if both used `"layer-default"`, imported annotations would appear on the wrong layer.

---

## Unified Layer Stack (`layer_stack`)

`layer_stack` is the single source of render order. Local and imported layers are freely interleaved. `getEffectiveLayerStack(cv)` computes it:

- If `layer_stack` is stored and valid: filter stale IDs, append new ones (new imported → bottom, new local → top)
- If no `layer_stack`: default to `[...imported layer ids, ...local layer ids]`

Python `_effective_annotations()` mirrors this using the same fallback logic.

---

## `ensureLayers(cv)` — Call at Init Only

Guarantees `cv` has a valid `layers` array, `active_layer_id`, and `layer_stack`. Call once in `AnnotateImage.js` at widget init — do not call on every update.

```js
currentValue = ensureLayers(currentValue);
```

---

## Active Layer Enforcement (JS)

Only the active layer is interactive:

- `_hittableAnnotations()` — returns only annotations on the active layer, skipping locked layers
- `_isActiveLayerLocked()` — checks local and imported layers (including overrides)
- `onPointerDown` gate: `if (_isActiveLayerLocked() && activeTool !== "hand" && activeTool !== "zoom") return;`
- Cursor: `"not-allowed"` when drawing on a locked layer

When the active layer changes (`setActive()`), `selected_ids` is cleared to prevent cross-layer edits.

---

## Orphaned Layer IDs

Annotations may have a `layer_id` that no longer exists (e.g. upstream node disconnected). Both JS and Python resolve these to the default (first local) layer so annotations stay visible and selectable.

- **JS:** `_resolveLayerId(ann)` inside `_effectiveAnnotations()` and `_hittableAnnotations()`
- **Python:** `_resolve_layer(a)` inside `_effective_annotations()`

---

## Imported Layers

When an upstream `output_annotation_data` flows into `input_annotation_data`:

1. **Python** (`after_value_set`) resolves effective annotations from the upstream, extracts `imported_layers` in upstream `layer_stack` order. Only layers with at least one live annotation are kept.
2. Python writes `imported_annotations` and `imported_layers` into `output_annotation_data`.
3. **JS** renders imported annotations alongside local ones using the unified `layer_stack`.

Imported layers appear in the panel with an amber "imported" badge. Their lock/visibility is overridden locally via `imported_layer_overrides` — the original `imported_layers[i]` values are never mutated.

Imported annotations can be selected, moved, and resized when their layer is active — changes go to `overrides[id]`, never the original.

Toolbar: the layers icon turns amber when an imported layer is active.

---

## Layer Locking

Blocks **all** drawing and selection — including text placement and object controls.

- Local: `layers[i].locked`
- Imported: `imported_layer_overrides[layerId].locked` (source `imported_layers[i].locked` is read-only)

---

## Layer Visibility

- Local: `layers[i].visible` — hidden layers excluded from `_effectiveAnnotations()` in both JS and Python
- Imported: `imported_layer_overrides[layerId].visible` overrides `imported_layers[i].visible`

---

## Layer Isolation

When `isolated_layer_id` is set, only that layer's annotations render (both JS and Python). Panel dims other rows. Toggle the scan icon to exit.

---

## `createLayersPanel(buttonEl, labelEl, iconWrapEl, deps)` → `{ update, dismiss }`

**`deps` object:**
```js
{
  addTooltip, uid, getState, setCurrentValue,
  applyAnnotationMap,   // _applyAnnotationMap from AnnotateImage.js
  effectiveAnnotations, // _effectiveAnnotations
  renderLayerThumb,     // renders layer annotations to a small canvas thumbnail
  emit,
  renderCanvas,
  rebuildSettings,
}
```

**Layer operations:**
- `createLayer()` — new layer at top of stack, makes it active
- `deleteLayer(id)` — removes layer + its local annotations + soft-deletes its imported annotations
- `renameLayer(id, name)` — inline rename via dblclick on the name element
- `toggleVisibility(id)` — toggles `layers[i].visible`
- `toggleLock(id)` — toggles `layers[i].locked`
- `toggleImportedLock(id)` — writes to `imported_layer_overrides[id].locked`
- `setActive(id)` — changes `active_layer_id`, clears `selected_ids`
- `selectLayerItems(id)` — selects all annotations on the layer and makes it active
- `toggleIsolation(id)` — toggles `isolated_layer_id`
- `moveSelectionToLayer(id)` — moves selected annotations to `id` via `applyAnnotationMap`
- `moveStackLayerToIndex(id, targetIdx)` — reorders `layer_stack` (used by drag-to-reorder)
- `reorderLayer(id, dir)` — moves layer up/down in `layer_stack` by one position

**`update()`** — syncs the toolbar pill label and icon color to the active layer. Call whenever `currentValue` changes.

**Drag-to-reorder:** pointer capture on the drag handle. A ghost element (fixed near cursor) shows a layer thumbnail + name. A drop-indicator line shows the target position. On release, `moveStackLayerToIndex` is called. Works identically for local and imported rows.

**Layer thumbnail:** `renderLayerThumb(layerId)` renders annotations into a 76×56 off-screen canvas (2× the 38×28 CSS display size).

---

## JS/Python Parity Checklist

When changing any layer behavior, verify both sides:

| Behavior | JS location | Python location |
|---|---|---|
| Effective annotation list | `_effectiveAnnotations()` in `AnnotateImage.js` | `_effective_annotations()` in `annotate_image.py` |
| Render order | `getEffectiveLayerStack()` in `_layers.js` | `layer_stack` fallback in `_effective_annotations()` |
| Hidden-layer filtering | `_effectiveAnnotations()` — `hiddenIds` | `_effective_annotations()` — `hidden_ids` |
| Imported-layer visibility override | `_effectiveAnnotations()` — `hiddenImportedLayerIds` | `_effective_annotations()` — `hidden_imp_layers` |
| Isolation | `_effectiveAnnotations()` — `isolatedId` | `_effective_annotations()` — `isolated_id` |
| Orphaned layer_id fallback | `_resolveLayerId()` → `defaultLayerId` | `_resolve_layer()` → `default_layer_id` |
| Imported layer extraction | JS reads `currentValue.imported_layers` | Python `after_value_set` builds from upstream `layer_stack` order |

---

## Adding a New Layer Feature

1. Add new fields to `output_annotation_data` (document them here and in `annotate-image-node` SKILL)
2. Implement the operation in `_layers.js` using `setCurrentValue` + `emit()` + `renderCanvas()`
3. Mirror any filtering/sorting logic in `_effective_annotations()` in `annotate_image.py`
4. Verify JS/Python parity using the checklist above
5. Test: multiple layers, import from another node, verify Python output matches JS preview
