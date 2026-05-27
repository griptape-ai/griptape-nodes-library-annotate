# Annotate Image

A [Griptape Nodes](https://www.griptapenodes.com/) library for drawing directly on images — no external tools required. Add paint strokes, labels, arrows, boxes, and ellipses right inside your workflow, then pass the result downstream to any node that accepts an image.

![The Annotate Image node on the Griptape Nodes canvas, showing an image loaded into the annotation widget with a mix of paint strokes, an arrow, a rectangle, and a text label drawn on it. The sidebar tool picker is visible on the left and the header bar with tool settings is across the top.](images/annotate_image_overview.png)

---

## Why Annotate?

When you're directing an AI, a picture with notes is worth more than any text prompt.

Instead of writing "the thing in the upper-left corner — make it smaller and move it toward the center," you can just draw an arrow and a box around it. Annotation bridges the gap between what you see and what you mean.

Use it to:

- **Show exactly what needs to change** — no ambiguous descriptions, just marks on the pixels that matter
- **Give clear creative direction** — arrows, shapes, and labels cut through the guesswork
- **Build tighter workflows** — annotate inside Griptape Nodes and connect the result directly to generation or editing nodes without leaving the canvas
- **Document visual intent** — annotated images carry their own context, making it easy for collaborators (or AI) to understand what you're after

---

## The Annotate Image Node

The library adds one node: **Annotate Image**.

Drop it into a flow, connect an incoming image (or leave it blank to start fresh), draw your notes, and wire the output into whatever comes next.

![The Annotate Image node collapsed on the canvas with its input and output ports visible — an image artifact feeds in from the left and the annotated image artifact exits on the right, connecting to a downstream generation node.](images/annotate_image_node_ports.png)

### Drawing Tools

| Tool | Shortcut | What it's for |
|---|---|---|
| Draw | `D` | Freehand painting — works like a brush |
| Text | `T` | Drop a text label anywhere on the image |
| Arrow | `L` | Point at something specific |
| Rectangle | `R` | Box in a region of interest |
| Ellipse | `O` | Circle or oval callouts |

![Side-by-side examples of each drawing tool in use on an image: a freehand paint stroke, a text label reading "fix this", an arrow pointing at a subject, a rectangle boxing a region, and an ellipse circling a detail.](images/annotate_image_drawing_tools.png)

### Navigation Tools

| Tool | Shortcut | What it's for |
|---|---|---|
| Select & Move | `V` | Pick, move, or resize any annotation |
| Pan | `H` | Scroll the canvas without selecting anything |
| Zoom | `Z` | Zoom in for detail work |
| Fit to Window | `F` | Snap the view so the whole canvas is visible |

### Working with Annotations

Once you've placed annotations, you can keep them organized:

- **Group / ungroup** — lock multiple annotations together so they move as one
- **Layer order** — bring an annotation to the front or push it to the back
- **Delete selected** — remove just what you've selected
- **Delete all** — wipe the canvas and start over
- **Expand to modal** — open a larger view when you need more room to work

### Chaining Annotation Nodes

You can feed the output of one **Annotate Image** node into the input of another. Upstream annotations arrive as a separate layer alongside your own — useful for building up notes in stages or passing reviewed work further down the flow. Each incoming annotation can be independently overridden or reset.

![Two Annotate Image nodes connected in sequence on the canvas. The first node has red paint strokes and arrows; the second node's canvas shows both those upstream annotations and new blue text labels added on top, with the header bar showing "Reset all overrides" available.](images/annotate_image_chained.png)

---

## Installation

1. **Download the library** to your machine. A `libraries` folder inside your Griptape Nodes workspace is a good home for it:

   **Option A: Download ZIP**

   - Click the green **Code** button → **Download ZIP**
   - Unzip the file and move the folder to your library location

   **Option B: Using Git**

   ```bash
   cd "$(gtn config show workspace_directory)"
   git clone https://github.com/griptape-ai/griptape-nodes-library-annotate.git
   ```

2. **Register the library** in Griptape Nodes:

   - Go to **Settings → Libraries**
   - Click **+ Add Library**
   - Enter the path to `griptape-nodes-library.json` inside the cloned folder
   - Close the settings panel and click **Refresh Libraries**

3. **Find the node** — look for **Annotate Image** in the `image` category in the node picker.

---

## License

Apache License 2.0
