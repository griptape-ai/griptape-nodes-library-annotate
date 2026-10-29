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
- `make check` — run all checks: ruff format, ruff lint, pyright, JSON validation, changelog
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
- `/node-errors` — error messages, `NodeError`, and routing failures
- `/griptape-nodes-widget-dev` — creating or modifying a JS widget
- `/annotate-image-node` — understanding the AnnotateImage node architecture
- `/annotate-image-icons` — adding icons to the widget
- `/annotate-image-layers` — working on the layers system
- `/annotate-image-hotkeys` — working on keyboard shortcuts and the hotkeys panel

## Changelog

`CHANGELOG.md` follows [Keep a Changelog 2.0.0](https://keepachangelog.com/en/2.0.0/). Each version is the `library_version` in `griptape-nodes-library.json`. Its readers are artists using these nodes and the agents that build workflows with them.

**Add an entry for every user-facing change** - In the same PR, add a file to `changelog.d/` holding the entry. User-facing means anything a user notices after updating the library: a node added, removed, or renamed; a parameter, default, or output that differs; a provider model added or retired; a saved workflow that loads or runs differently. After adding one, tell the user so they can review the wording.

**One file per entry, named for its type** - Never edit `## [Unreleased]` in `CHANGELOG.md` directly; `make check/changelog` rejects it. Create `changelog.d/<type>-<slug>.md`, where `<type>` is one of `added`, `changed`, `deprecated`, `removed`, `fixed`, or `security`, and `<slug>` is a few lowercase words joined by hyphens. The whole file is the bullet, with no heading. `make changelog` prints `[Unreleased]` with these files folded in. `changelog.d/README.md` is the same contract for humans.

**Skip what users never see** - Refactors, tests, CI, docs-only changes, and dev dependency bumps get no entry. Neither does a fix for a bug that never shipped in a version: edit or delete the entry that introduced it.

**Describe the result, not the code** - Name the node and parameter in backticks or by their editor label, say what the user sees now, present tense, one or two sentences. `Fixed` if the old behavior was a bug, `Changed` if it was intentional. Link the GitHub issue on its own last line. Leave out PR numbers and `@handles`. Wrap at about 100 characters, continuation lines indented two spaces.

**Mark breaking changes** - A change that makes a saved workflow stop working, or give a different result, without edits starts with `**Breaking:**`. Say what breaks and what to do about it.

**Leave `CHANGELOG.md` to the version bump** - Do not add version headings or link definitions. `make version/patch`, `make version/minor`, `make version/major`, and `make version/set` fold the `changelog.d/` entries into the new version section and delete them. Fixing a mistake in a released entry is fine.
