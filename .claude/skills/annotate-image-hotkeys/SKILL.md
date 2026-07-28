# AnnotateImage — Hotkeys System

## Files

- `_hotkeys.js` — all document-level `keydown`/`keyup` listeners, wired via `setupHotkeys(getState, actions)`
- `_toolbar.js` — `_HOTKEY_SECTIONS` constant: the **canonical list** of all shortcuts shown in the `?` panel

---

## Adding a New Hotkey

1. Add an interceptor function in `_hotkeys.js` following the guard pattern:

```js
function _myInterceptor(e) {
  if (!getState().mouseIsOver) return;  // only fire when mouse is over the widget
  if (getState().textEditId) return;    // never fire while typing in a text annotation
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
  if (e.key !== "X") return;
  e.preventDefault(); e.stopPropagation();
  // ... action ...
}
```

2. Register and clean up in the same block as all other listeners:

```js
document.addEventListener("keydown", _myInterceptor, { capture: true });
// in cleanup():
document.removeEventListener("keydown", _myInterceptor, { capture: true });
```

3. Add an entry to `_HOTKEY_SECTIONS` in `_toolbar.js` so the `?` panel stays accurate:

```js
{ keys: ["X"], desc: "My action" },
```

---

## Space Key — Tap vs Hold

Space has two behaviours handled by `_spaceDownInterceptor` + `_spaceUpInterceptor`:

| Interaction | Result |
|---|---|
| **Tap** (<200 ms) | Toggles expand-to-modal via `toggleModal()` |
| **Hold** (≥200 ms) | Activates temporary pan mode (`isSpaceHeld = true`), identical to Alt+drag |

`isSpaceHeld` lives in `AnnotateImage.js` alongside `isAltHeld`. Both feed `_currentToolCursor()` and the wrapper pan-activation guard. Do not add a third pan-modifier without updating those two sites.

---

## Current Shortcut Reference

Kept in sync with `_HOTKEY_SECTIONS` in `_toolbar.js` (that object drives the `?` panel — always update it when adding/removing shortcuts):

**Tools**

| Key | Action |
|---|---|
| V | Select & Move |
| H | Pan |
| Z | Zoom |
| D | Draw |
| T | Text |
| L | Arrow |
| R | Rectangle |
| O | Ellipse |
| M | Stamp |

**View**

| Key | Action |
|---|---|
| F | Fit canvas to window |
| Space (tap) | Expand / collapse modal |
| Space (hold) | Temporary pan |

**Edit**

| Key | Action |
|---|---|
| ⌫ / Del | Delete selected |
| ⌘D / Ctrl+D | Duplicate selected |
| [ / ] | Decrease / increase size |
| Alt+drag | Temporary pan |
