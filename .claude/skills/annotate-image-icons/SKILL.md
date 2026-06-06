---
name: annotate-image-icons
description: Icon registry for the AnnotateImage widget — all available icon IDs, how to use mkIcon(), and how to add new icons. Load this when adding a new tool, button, or UI element that needs an icon.
---

# AnnotateImage — Icon Registry

**File:** `griptape_nodes_library_annotate/widgets/AnnotateImage/_icons.js`

All icons are Lucide SVG paths (MIT licensed) rendered at a 24×24 viewBox.

## Usage

```js
import { mkIcon } from './_icons.js';

mkIcon('trash')       // 15px (default)
mkIcon('trash', 16)   // explicit size
```

Returns an `<svg>` element with `display:block; flex-shrink:0; pointer-events:none` already set. Safe to append directly to any container.

---

## Adding a New Icon

1. Find the icon on [lucide.dev](https://lucide.dev)
2. View the SVG source — copy the **inner elements only** (the `<path>`, `<circle>`, `<rect>` tags, not the outer `<svg>` wrapper)
3. Add an entry to `ICON_PATHS` in `_icons.js`:

```js
"my-icon": `<path d="..."/><circle cx="12" cy="12" r="3"/>`,
```

> **If you need an icon that isn't in the list below, ask the user to provide the SVG path data.** Do not guess or fabricate path strings — incorrect paths render as invisible or broken shapes with no error.

---

## Available Icons

| ID | Used for |
|---|---|
| `select` | Select tool button |
| `paint` | Paint/draw tool button |
| `text` | Text tool button |
| `arrow` | Arrow tool button |
| `rect` | Rectangle tool button |
| `ellipse` | Ellipse tool button |
| `hand` | Pan tool button |
| `zoom` | Zoom tool button |
| `trash` | Delete action |
| `bezier` | Bezier curve toggle |
| `taper` | Taper stroke toggle |
| `pressure` | Pressure-sensitive stroke toggle |
| `expand` | Expand to modal |
| `contract` | Contract from modal |
| `align-left` | Text align left |
| `align-center` | Text align center |
| `align-right` | Text align right |
| `align-start-vertical` | Anchor left |
| `align-center-vertical` | Anchor center-horizontal |
| `align-end-vertical` | Anchor right |
| `align-start-horizontal` | Anchor top |
| `align-center-horizontal` | Anchor middle-vertical |
| `align-end-horizontal` | Anchor bottom |
| `list-chevrons-up-down` | Object ordering (Bring to Front / Back) in settings |
| `layers` | Layers panel button in header bar |
| `plus` | Create new layer |
| `square-arrow-right-enter` | Move selection to layer |
| `scan` | Isolate layer |
| `lock` | Layer locked state |
| `lock-open` | Layer unlocked state |
| `ellipsis-vertical` | Layer row "more" menu (⋯) |
| `eye` | Layer visible |
| `eye-closed` | Layer hidden |
