// _colorpicker.js — Custom HSV color picker popup (no external deps).
// createColorPicker({ color, hasAlpha, label, clearLabel, addTooltip, onChange }) → { el }
//   color      — initial hex6 ("#rrggbb"), hex8 ("#rrggbbaa"), or "" / null for "none"
//   hasAlpha   — show alpha slider in popup
//   label      — tooltip text for the swatch trigger
//   clearLabel — if set, show a "None" button with this as its tooltip
//   addTooltip — the widget's addTooltip(el, text) helper
//   onChange   — (hexString, doEmit) — hexString="" means "none"

// ── Color math ───────────────────────────────────────────────────────────────

function _hsvToRgb(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function _rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const v = max, s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else                h = ((r - g) / d + 4) * 60;
  }
  return [h, s, v];
}

function _parseHex(str) {
  if (!str || typeof str !== 'string') return null;
  const h = str.startsWith('#') ? str.slice(1) : str;
  if (h.length !== 6 && h.length !== 8) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a].some(isNaN) ? null : { r, g, b, a };
}

function _fmtHex(r, g, b, a, hasAlpha) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
  const h6 = '#' + [r, g, b].map((v) => clamp(v, 0, 255).toString(16).padStart(2, '0')).join('');
  return hasAlpha ? h6 + clamp(a * 255, 0, 255).toString(16).padStart(2, '0') : h6;
}

// ── Singleton: only one picker popup open at a time ──────────────────────────

let _closeActive = null;
function _dismissAny() { if (_closeActive) { _closeActive(); _closeActive = null; } }

// ── Thumb helper ─────────────────────────────────────────────────────────────

function _mkThumb() {
  const t = document.createElement('div');
  t.style.cssText = [
    'position:absolute', 'top:50%', 'width:18px', 'height:18px', 'border-radius:50%',
    'border:2px solid white', 'box-shadow:0 0 0 1.5px rgba(0,0,0,0.55)',
    'transform:translate(-50%,-50%)', 'pointer-events:none', 'box-sizing:border-box',
  ].join(';');
  return t;
}

// ── Main export ──────────────────────────────────────────────────────────────

export function createColorPicker({ color, hasAlpha = false, label = null, clearLabel = null, addTooltip, onChange }) {
  const parsed = _parseHex(color);
  let isNone = !parsed;
  let H = 0, S = 1, V = 1, A = 1;
  if (parsed) { [H, S, V] = _rgbToHsv(parsed.r, parsed.g, parsed.b); A = parsed.a; }

  // ── Swatch trigger ────────────────────────────────────────────────────────

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;display:flex;align-items:center;flex-shrink:0;';

  const swatch = document.createElement('button');
  swatch.className = 'ais-cp-swatch';
  if (label && addTooltip) addTooltip(swatch, label);
  wrap.appendChild(swatch);

  function _refreshSwatch() {
    swatch.innerHTML = '';
    if (isNone) {
      swatch.style.backgroundImage = 'repeating-conic-gradient(#888 0% 25%,#444 0% 50%)';
      swatch.style.backgroundSize = '8px 8px';
      swatch.style.backgroundColor = '';
      // Diagonal red line = "no color" (Photoshop convention)
      swatch.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 18 18" style="display:block;margin:auto;pointer-events:none">' +
        '<line x1="1" y1="17" x2="17" y2="1" stroke="#e05050" stroke-width="2.5" stroke-linecap="round"/>' +
        '</svg>';
      return;
    }
    const [r, g, b] = _hsvToRgb(H, S, V);
    if (hasAlpha && A < 0.999) {
      swatch.style.backgroundImage =
        `linear-gradient(rgba(${r},${g},${b},${A.toFixed(3)}),rgba(${r},${g},${b},${A.toFixed(3)})),` +
        'repeating-conic-gradient(#888 0% 25%,#444 0% 50%)';
      swatch.style.backgroundSize = 'auto,8px 8px';
      swatch.style.backgroundColor = '';
    } else {
      swatch.style.backgroundImage = '';
      swatch.style.backgroundSize = '';
      swatch.style.backgroundColor = `rgb(${r},${g},${b})`;
    }
  }
  _refreshSwatch();

  // ── Popup ─────────────────────────────────────────────────────────────────

  let popup = null;

  function _openPopup() {
    _dismissAny();

    popup = document.createElement('div');
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', label || 'Color picker');
    popup.style.cssText = [
      'position:fixed', 'z-index:10001',
      'background:var(--popover,#1e1e1e)',
      'border:1px solid var(--border,#444)',
      'border-radius:8px',
      'box-shadow:0 4px 24px rgba(0,0,0,0.65)',
      'padding:10px',
      'display:flex', 'flex-direction:column', 'gap:8px',
      'width:220px', 'box-sizing:border-box',
      'user-select:none',
    ].join(';');

    // ── HSV square ───────────────────────────────────────────────────────────

    const square = document.createElement('div');
    square.setAttribute('aria-label', 'Color saturation and brightness');
    square.style.cssText = 'position:relative;width:100%;height:150px;border-radius:4px;cursor:crosshair;touch-action:none;';
    popup.appendChild(square);

    const sqThumb = document.createElement('div');
    sqThumb.style.cssText = [
      'position:absolute', 'width:16px', 'height:16px', 'border-radius:50%',
      'border:2px solid white', 'box-shadow:0 0 0 1.5px rgba(0,0,0,0.55)',
      'transform:translate(-50%,-50%)', 'pointer-events:none', 'box-sizing:border-box',
    ].join(';');
    square.appendChild(sqThumb);

    // ── Hue bar ──────────────────────────────────────────────────────────────

    const hueWrap = document.createElement('div');
    hueWrap.setAttribute('aria-label', 'Hue');
    hueWrap.style.cssText = 'position:relative;height:22px;border-radius:4px;touch-action:none;cursor:pointer;';
    const hueTrack = document.createElement('div');
    hueTrack.style.cssText = [
      'position:absolute', 'inset:0', 'border-radius:4px',
      'background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
    ].join(';');
    hueWrap.appendChild(hueTrack);
    const hueThumb = _mkThumb();
    hueWrap.appendChild(hueThumb);
    popup.appendChild(hueWrap);

    // ── Alpha bar (optional) ─────────────────────────────────────────────────

    let alphaWrap = null, alphaTrack = null, alphaThumb = null;
    if (hasAlpha) {
      alphaWrap = document.createElement('div');
      alphaWrap.setAttribute('aria-label', 'Opacity');
      alphaWrap.style.cssText = 'position:relative;height:22px;border-radius:4px;touch-action:none;cursor:pointer;';
      alphaTrack = document.createElement('div');
      alphaTrack.style.cssText = 'position:absolute;inset:0;border-radius:4px;';
      alphaWrap.appendChild(alphaTrack);
      alphaThumb = _mkThumb();
      alphaWrap.appendChild(alphaThumb);
      popup.appendChild(alphaWrap);
    }

    // ── Hex input + None button ──────────────────────────────────────────────

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const hexInput = document.createElement('input');
    hexInput.type = 'text';
    hexInput.spellcheck = false;
    hexInput.setAttribute('aria-label', 'Hex color value');
    hexInput.placeholder = hasAlpha ? '#rrggbbaa' : '#rrggbb';
    hexInput.style.cssText = [
      'flex:1', 'min-width:0',
      'background:var(--input,#2a2a2a)',
      'border:1px solid var(--border,#444)', 'border-radius:4px',
      'color:var(--foreground,#eee)', 'font-size:12px', 'font-family:monospace',
      'padding:4px 6px', 'height:30px', 'box-sizing:border-box', 'outline:none',
    ].join(';');
    row.appendChild(hexInput);

    if (clearLabel) {
      const noneBtn = document.createElement('button');
      noneBtn.className = 'ais-tool-btn';
      noneBtn.style.cssText = 'width:30px;height:30px;flex-shrink:0;';
      noneBtn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
        '<circle cx="7" cy="7" r="5.5"/>' +
        '<line x1="2.5" y1="11.5" x2="11.5" y2="2.5"/>' +
        '</svg>';
      if (addTooltip) addTooltip(noneBtn, clearLabel);
      noneBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        isNone = true;
        _sync(true);
      });
      row.appendChild(noneBtn);
    }
    popup.appendChild(row);

    // ── Sync: apply H/S/V/A/isNone → all UI elements + callback ─────────────

    function _sync(doEmit) {
      const [r, g, b] = _hsvToRgb(H, S, V);
      // Square background: pure hue at top-right, white at top-left, black at bottom
      const [hr, hg, hb] = _hsvToRgb(H, 1, 1);
      square.style.background = [
        'linear-gradient(to bottom, transparent, #000)',
        'linear-gradient(to right, #fff, transparent)',
        `rgb(${hr},${hg},${hb})`,
      ].join(',');
      // Square thumb — invert border in dark corners so it stays visible
      sqThumb.style.left = (S * 100) + '%';
      sqThumb.style.top  = ((1 - V) * 100) + '%';
      sqThumb.style.borderColor = V < 0.35 ? '#fff' : 'rgba(0,0,0,0.75)';
      // Hue thumb
      hueThumb.style.left = (H / 360 * 100) + '%';
      // Alpha bar gradient + thumb
      if (alphaTrack) {
        alphaTrack.style.backgroundImage = [
          `linear-gradient(to right, transparent, rgb(${r},${g},${b}))`,
          'repeating-conic-gradient(#888 0% 25%,#444 0% 50%)',
        ].join(',');
        alphaTrack.style.backgroundSize = 'auto, 8px 8px';
        alphaThumb.style.left = (A * 100) + '%';
      }
      // Hex field
      hexInput.value = isNone ? '' : _fmtHex(r, g, b, A, hasAlpha);
      // Swatch + callback
      _refreshSwatch();
      onChange(isNone ? '' : _fmtHex(r, g, b, A, hasAlpha), doEmit);
    }

    // Render initial state without emitting
    _sync(false);

    // ── Square drag ──────────────────────────────────────────────────────────

    square.addEventListener('pointerdown', (e) => {
      e.preventDefault(); square.setPointerCapture(e.pointerId);
      _pickSq(e); _sync(false);
    });
    square.addEventListener('pointermove', (e) => {
      if (!square.hasPointerCapture(e.pointerId)) return;
      _pickSq(e); _sync(false);
    });
    square.addEventListener('pointerup', (e) => {
      if (!square.hasPointerCapture(e.pointerId)) return;
      _pickSq(e); _sync(true);
    });
    function _pickSq(e) {
      const rc = square.getBoundingClientRect();
      S = Math.max(0, Math.min(1, (e.clientX - rc.left) / rc.width));
      V = Math.max(0, Math.min(1, 1 - (e.clientY - rc.top) / rc.height));
      isNone = false;
    }

    // ── Hue drag ─────────────────────────────────────────────────────────────

    hueWrap.addEventListener('pointerdown', (e) => {
      e.preventDefault(); hueWrap.setPointerCapture(e.pointerId);
      _pickHue(e); _sync(false);
    });
    hueWrap.addEventListener('pointermove', (e) => {
      if (!hueWrap.hasPointerCapture(e.pointerId)) return;
      _pickHue(e); _sync(false);
    });
    hueWrap.addEventListener('pointerup', (e) => {
      if (!hueWrap.hasPointerCapture(e.pointerId)) return;
      _pickHue(e); _sync(true);
    });
    function _pickHue(e) {
      const rc = hueTrack.getBoundingClientRect();
      H = Math.max(0, Math.min(360, (e.clientX - rc.left) / rc.width * 360));
      isNone = false;
    }

    // ── Alpha drag ───────────────────────────────────────────────────────────

    if (alphaWrap) {
      alphaWrap.addEventListener('pointerdown', (e) => {
        e.preventDefault(); alphaWrap.setPointerCapture(e.pointerId);
        _pickAlpha(e); _sync(false);
      });
      alphaWrap.addEventListener('pointermove', (e) => {
        if (!alphaWrap.hasPointerCapture(e.pointerId)) return;
        _pickAlpha(e); _sync(false);
      });
      alphaWrap.addEventListener('pointerup', (e) => {
        if (!alphaWrap.hasPointerCapture(e.pointerId)) return;
        _pickAlpha(e); _sync(true);
      });
      function _pickAlpha(e) {
        const rc = alphaTrack.getBoundingClientRect();
        A = Math.max(0, Math.min(1, (e.clientX - rc.left) / rc.width));
        isNone = false;
      }
    }

    // ── Hex input ────────────────────────────────────────────────────────────

    hexInput.addEventListener('focus', () => hexInput.select());
    hexInput.addEventListener('change', () => {
      const v = hexInput.value.trim();
      if (!v) { isNone = true; _sync(true); return; }
      const p = _parseHex(v.startsWith('#') ? v : '#' + v);
      if (!p) return;
      [H, S, V] = _rgbToHsv(p.r, p.g, p.b);
      if (hasAlpha) A = p.a;
      isNone = false;
      _sync(true);
    });
    hexInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); hexInput.blur(); }
      e.stopPropagation();
    });

    // ── Position: open below swatch, flip up if near bottom of viewport ──────

    document.body.appendChild(popup);
    requestAnimationFrame(() => {
      if (!popup) return;
      const sw = swatch.getBoundingClientRect();
      const pw = popup.offsetWidth, ph = popup.offsetHeight;
      let left = sw.left;
      let top  = sw.bottom + 6;
      if (left + pw > window.innerWidth  - 8) left = window.innerWidth  - pw - 8;
      if (top  + ph > window.innerHeight - 8) top  = sw.top - ph - 6;
      popup.style.left = `${Math.max(4, left)}px`;
      popup.style.top  = `${Math.max(4, top)}px`;
    });

    // ── Dismiss on click outside or Escape ───────────────────────────────────

    function _close() {
      if (!popup) return;
      popup.remove(); popup = null;
      document.removeEventListener('pointerdown', _outside, true);
      document.removeEventListener('keydown',     _keydown, true);
      if (_closeActive === _close) _closeActive = null;
    }
    function _outside(e) {
      // Exclude clicks on the swatch itself so it can toggle the popup closed
      if (!swatch.contains(e.target) && popup && !popup.contains(e.target)) _close();
    }
    function _keydown(e) {
      if (e.key === 'Escape') { e.stopPropagation(); _close(); }
    }
    // Defer listener registration so the triggering pointerdown doesn't close immediately
    setTimeout(() => {
      document.addEventListener('pointerdown', _outside, true);
      document.addEventListener('keydown',     _keydown, true);
    }, 0);
    _closeActive = _close;
  }

  // ── Swatch click — toggle popup ───────────────────────────────────────────

  swatch.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (popup) _dismissAny(); else _openPopup();
    swatch.blur();
  });

  return { el: wrap };
}
