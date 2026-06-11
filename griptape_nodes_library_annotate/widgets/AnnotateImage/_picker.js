// _picker.js — flyout pickers for shape variants and stamp types.
//
// createRectShapePicker(btn, { onSelect, getActive }) → { destroy }
// createStampPicker(btn, { onSelect, getActive }) → { destroy }
//
// Flyout opens to the RIGHT of the sidebar button using position:fixed.
// Dismisses on outside click or after a selection.

import { mkIcon } from './_icons.js';

const RECT_SHAPES = [
  { id: "plain",   label: "Rectangle" },
  { id: "rounded", label: "Rounded"   },
  { id: "pill",    label: "Pill"      },
];

const STAMPS = [
  { id: "checkmark",   label: "Checkmark"   },
  { id: "cross",       label: "Cross"       },
  { id: "no",          label: "No"          },
  { id: "warning",     label: "Warning"     },
  { id: "question",    label: "Question"    },
  { id: "exclamation", label: "Exclamation" },
  { id: "thumbs-up",   label: "Thumbs Up"   },
  { id: "thumbs-down", label: "Thumbs Down" },
  { id: "pin",         label: "Location Pin"},
];

function _createPicker(anchorBtn, items, iconPrefix, { onSelect, getActive }) {
  let panel = null;
  let outside = null;

  function open() {
    if (panel) { close(); return; }

    panel = document.createElement("div");
    panel.style.cssText =
      "position:fixed;z-index:10000;" +
      "background:var(--card,#1e1e20);border:1px solid var(--border,#333);" +
      "border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.6);" +
      "padding:6px;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;";

    const active = getActive();
    for (const item of items) {
      const btn = document.createElement("button");
      btn.style.cssText =
        "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
        "gap:3px;padding:6px 4px;border:none;border-radius:5px;cursor:pointer;" +
        "background:transparent;color:var(--foreground);transition:background 0.12s;" +
        "min-width:50px;";
      if (item.id === active) {
        btn.style.background = "rgba(122,157,184,0.25)";
        btn.style.boxShadow = "0 0 0 1.5px rgba(122,157,184,0.6)";
      }
      btn.appendChild(mkIcon(`${iconPrefix}${item.id}`, 18));
      const lbl = document.createElement("span");
      lbl.style.cssText = "font-size:9px;color:var(--muted-foreground);white-space:nowrap;font-family:inherit;";
      lbl.textContent = item.label;
      btn.appendChild(lbl);
      btn.addEventListener("pointerover", () => { if (item.id !== getActive()) btn.style.background = "var(--muted)"; });
      btn.addEventListener("pointerout",  () => { if (item.id !== getActive()) btn.style.background = "transparent"; });
      btn.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        onSelect(item.id);
        close();
      });
      panel.appendChild(btn);
    }

    document.body.appendChild(panel);
    _position();

    // Dismiss on outside click (next frame so the current event doesn't immediately close)
    requestAnimationFrame(() => {
      outside = (e) => {
        if (!panel) return;
        if (!panel.contains(e.target) && e.target !== anchorBtn) {
          close();
        }
      };
      document.addEventListener("pointerdown", outside, { capture: true });
    });
  }

  function _position() {
    if (!panel) return;
    const rect = anchorBtn.getBoundingClientRect();
    // Position to the right of the sidebar button with a small gap
    const left = rect.right + 6;
    const top  = Math.min(rect.top, window.innerHeight - panel.offsetHeight - 8);
    panel.style.left = `${left}px`;
    panel.style.top  = `${Math.max(8, top)}px`;
  }

  function close() {
    if (outside) document.removeEventListener("pointerdown", outside, { capture: true });
    outside = null;
    panel?.remove();
    panel = null;
  }

  function destroy() { close(); }

  return { open, close, destroy };
}

export function createRectShapePicker(anchorBtn, opts) {
  return _createPicker(anchorBtn, RECT_SHAPES, "rect-", opts);
}

export function createStampPicker(anchorBtn, opts) {
  return _createPicker(anchorBtn, STAMPS, "stamp-", opts);
}
