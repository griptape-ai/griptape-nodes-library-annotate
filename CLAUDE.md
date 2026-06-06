# Annotate Image Library

A Griptape Nodes library providing image annotation nodes with a custom JS widget.

## Structure

- `griptape_nodes_library_annotate/annotate_image.py` — AnnotateImage node (canvas drawing widget)
- `griptape_nodes_library_annotate/detections_to_annotations.py` — DetectionsToAnnotations node (converts detection data to annotation format)
- `griptape_nodes_library_annotate/utils/` — shared utilities (color parsing, etc.)
- `griptape_nodes_library_annotate/widgets/AnnotateImage/` — JS widget files (multiple `_*.js` modules)
- `griptape-nodes-library.json` — node and widget manifest (register new nodes/widgets here)

## Commands

- `make install/dev` — install dev dependencies (run once after cloning)
- `make check` — run all checks: ruff format, ruff lint, pyright, JSON validation
- `make fix` — auto-fix formatting and lint issues
- `make deps/sync` — sync `pip_dependencies` in the library JSON from `pyproject.toml` — **run this after adding or removing Python dependencies**

Dependency management uses `uv`. Add Python packages to `pyproject.toml`, then run `make deps/sync` to keep `griptape-nodes-library.json` in sync. CI runs `make check` on every PR.

## Key rules

- Always load the relevant skill before touching node or widget code
- Never modify files in `.venv/` or `node_modules/`
- Run `make check` before marking any task done
- Before creating a PR, ask the user for the GitHub issue number to link it to

## Skills — load these before working on:

- `/griptape-node-dev` — creating or modifying a Python node
- `/griptape-nodes-widget-dev` — creating or modifying a JS widget
- `/annotate-image-node` — understanding the AnnotateImage node architecture
- `/annotate-image-icons` — adding icons to the widget
- `/annotate-image-layers` — working on the layers system
