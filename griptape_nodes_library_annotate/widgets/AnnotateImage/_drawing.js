// Canvas drawing functions for the annotation widget.
// Use createDrawing(getState) to get a bound set of draw functions.
// getState() must return { ctx, displayScale, hoverId }.

import { paintCenter, defaultCps, naturalBounds, getTransformedCorners } from './_geometry.js';
import {
  DEFAULT_COLOR, DEFAULT_PAINT_SIZE, DEFAULT_ARROW_WIDTH, DEFAULT_ARROW_SIZE, DEFAULT_TEXT_SIZE, MIN_TEXT_SIZE, DEFAULT_SHAPE_WIDTH, DEFAULT_STAMP_SIZE,
  SEL_COLOR_RGB, HOVER_OPACITY, HANDLE_FILL, HANDLE_STROKE_OPACITY, CP_LINE_OPACITY,
  LINE_WIDTH_PRIMARY, LINE_WIDTH_SECONDARY,
  HANDLE_RADIUS, CP_HANDLE_RADIUS,
  DASH_CP_LINE, HOVER_PAD,
} from './_styles.js';
import { ICON_PATHS } from './_icons.js';

export function createDrawing(getState) {

  function isHovered(ann) {
    const { hoverId, hoverGroupId, marqueePreviewIds } = getState();
    return ann.id === hoverId
      || (hoverGroupId && ann.group_id === hoverGroupId)
      || (marqueePreviewIds && marqueePreviewIds.has(ann.id));
  }

  function renderStrokes(strokes, sizeScale = 1) {
    const { ctx } = getState();
    for (const stroke of strokes) {
      const pts = stroke.points || [];
      if (!pts.length) continue;
      ctx.fillStyle = stroke.color || DEFAULT_COLOR;
      const n = pts.length;
      const getR = (i) => Math.max(0.5, ((pts[i][2] ?? (stroke.size || DEFAULT_PAINT_SIZE)) * sizeScale) / 2);

      if (n === 1) {
        const r = getR(0);
        ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], r, 0, Math.PI * 2); ctx.fill();
        continue;
      }

      // Smoothed tangent at each point via central differences — eliminates per-segment
      // normal discontinuities that made individual trapezoids visible on curved strokes.
      const tang = [];
      for (let i = 0; i < n; i++) {
        const dx = i === 0 ? pts[1][0]-pts[0][0] : i === n-1 ? pts[n-1][0]-pts[n-2][0] : pts[i+1][0]-pts[i-1][0];
        const dy = i === 0 ? pts[1][1]-pts[0][1] : i === n-1 ? pts[n-1][1]-pts[n-2][1] : pts[i+1][1]-pts[i-1][1];
        const len = Math.hypot(dx, dy);
        tang.push(len > 0.001 ? [dx/len, dy/len] : [1, 0]);
      }

      // Left and right outline points (visual left/right in screen space)
      const L = tang.map(([tx, ty], i) => [pts[i][0] + ty*getR(i), pts[i][1] - tx*getR(i)]);
      const R = tang.map(([tx, ty], i) => [pts[i][0] - ty*getR(i), pts[i][1] + tx*getR(i)]);

      const a0 = Math.atan2(tang[0][1],    tang[0][0]);
      const an = Math.atan2(tang[n-1][1],  tang[n-1][0]);

      ctx.beginPath();
      // Start cap: arc from R[0] → L[0] going backward around the stroke start
      ctx.arc(pts[0][0], pts[0][1], getR(0), a0 + Math.PI/2, a0 - Math.PI/2, false);
      // Left outline forward — smooth via quadratic bezier through midpoints
      for (let i = 0; i < n - 1; i++) {
        ctx.quadraticCurveTo(L[i][0], L[i][1], (L[i][0]+L[i+1][0])/2, (L[i][1]+L[i+1][1])/2);
      }
      ctx.lineTo(L[n-1][0], L[n-1][1]);
      // End cap: arc from L[n-1] → R[n-1] going forward around the stroke tip
      ctx.arc(pts[n-1][0], pts[n-1][1], getR(n-1), an - Math.PI/2, an + Math.PI/2, false);
      // Right outline backward — smooth via quadratic bezier through midpoints
      for (let i = n - 1; i > 0; i--) {
        ctx.quadraticCurveTo(R[i][0], R[i][1], (R[i][0]+R[i-1][0])/2, (R[i][1]+R[i-1][1])/2);
      }
      ctx.lineTo(R[0][0], R[0][1]);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawPaint(ann, selected) {
    const { ctx, displayScale, hoverId } = getState();
    const [cx, cy] = paintCenter(ann);
    const x = ann.x || 0, y = ann.y || 0;
    const sx = ann.scaleX ?? 1, sy = ann.scaleY ?? 1, r = ann.rotation || 0;
    ctx.save();
    ctx.translate(cx + x, cy + y);
    ctx.rotate(r);
    ctx.scale(sx, sy);
    ctx.translate(-cx, -cy);
    renderStrokes(ann.strokes || [], ann.sizeScale ?? 1);
    ctx.restore();
    if (isHovered(ann) && !selected) {
      const corners = getTransformedCorners(ann, HOVER_PAD + 2);
      if (corners.length === 4) {
        ctx.save();
        ctx.strokeStyle = `rgba(${SEL_COLOR_RGB},${HOVER_OPACITY})`;
        ctx.lineWidth = LINE_WIDTH_PRIMARY / displayScale;
        ctx.beginPath();
        ctx.moveTo(corners[0][0], corners[0][1]);
        for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i][0], corners[i][1]);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawText(ann, selected) {
    const { ctx, displayScale, hoverId } = getState();
    const fontSize = Math.max(MIN_TEXT_SIZE, ann.font_size || DEFAULT_TEXT_SIZE);
    const lineHeight = fontSize * 1.2;
    const lines = (ann.text || "").split("\n");
    const textAlign = ann.text_align || "left";
    ctx.save();
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = "top";
    const maxW = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
    const { actualBoundingBoxDescent: bgDesc } = ctx.measureText(lines[0] || " ");
    // Shift glyphs down within the bg rect so they appear vertically centered (leading distributed equally above and below).
    // The bg rect stays anchored at ann.x,ann.y so it matches the tx frame exactly.
    const topShift = (lineHeight - bgDesc) / 2;

    // Anchor offset: shifts the text box so x/y pin to the chosen horizontal/vertical edge.
    const anchorH = ann.anchor_h || "left";
    const anchorV = ann.anchor_v || "top";
    const xOff = anchorH === "center" ? -maxW / 2 : anchorH === "right" ? -maxW : 0;
    const yOff = anchorV === "middle" ? -(lineHeight * lines.length) / 2 : anchorV === "bottom" ? -(lineHeight * lines.length) : 0;

    ctx.translate(ann.x || 0, ann.y || 0);
    ctx.rotate(ann.rotation || 0);
    ctx.translate(xOff, yOff);

    if (ann.bg_color) {
      const pad = fontSize * 0.15;
      ctx.fillStyle = ann.bg_color;
      ctx.fillRect(-pad, -pad, maxW + pad * 2, lineHeight * lines.length + pad * 2);
    }
    ctx.fillStyle = ann.color || DEFAULT_COLOR;
    ctx.textAlign = textAlign;
    const tx = textAlign === "center" ? maxW / 2 : textAlign === "right" ? maxW : 0;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], tx, topShift + i * lineHeight);
    }
    if (isHovered(ann) && !selected) {
      ctx.textAlign = "left";
      ctx.strokeStyle = `rgba(${SEL_COLOR_RGB},${HOVER_OPACITY})`;
      ctx.lineWidth = LINE_WIDTH_PRIMARY / displayScale;
      ctx.strokeRect(-HOVER_PAD, -HOVER_PAD, maxW + HOVER_PAD * 2, lineHeight * lines.length + HOVER_PAD * 2);
    }
    ctx.restore();
  }

  // Returns how far the line stroke should be pulled back from the endpoint tip
  // to make room for the cap shape.
  function _capSetback(shape, aLen, halfW) {
    if (!shape || shape === "none" || shape === "bar") return 0;
    if (shape === "dot")    return halfW;      // radius = halfW/2, front edge at tip
    if (shape === "square") return halfW / 2;  // side = halfW, front face at tip
    return aLen;  // triangle, open, diamond
  }

  // Draws a single arrowhead cap at (tipX, tipY) pointing in direction (cosA, sinA).
  function _drawCap(ctx, tipX, tipY, cosA, sinA, aLen, halfW, shape, color, strokeW) {
    if (!shape || shape === "none") return;
    const px = -sinA, py = cosA;
    ctx.fillStyle = ctx.strokeStyle = color;
    const bx = tipX - aLen * cosA, by = tipY - aLen * sinA;
    if (shape === "triangle") {
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(bx + halfW * px, by + halfW * py);
      ctx.lineTo(bx - halfW * px, by - halfW * py);
      ctx.closePath(); ctx.fill();
    } else if (shape === "open") {
      ctx.beginPath();
      ctx.moveTo(bx + halfW * px, by + halfW * py);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(bx - halfW * px, by - halfW * py);
      ctx.lineWidth = strokeW; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.stroke();
    } else if (shape === "dot") {
      const r = halfW / 2;
      const cx = tipX - r * cosA, cy = tipY - r * sinA;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    } else if (shape === "bar") {
      ctx.lineWidth = strokeW; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tipX + halfW * px, tipY + halfW * py);
      ctx.lineTo(tipX - halfW * px, tipY - halfW * py);
      ctx.stroke();
    } else if (shape === "square") {
      const hs = halfW / 2;
      const cx = tipX - hs * cosA, cy = tipY - hs * sinA;
      ctx.beginPath();
      ctx.moveTo(cx + hs * cosA + hs * px, cy + hs * sinA + hs * py);
      ctx.lineTo(cx - hs * cosA + hs * px, cy - hs * sinA + hs * py);
      ctx.lineTo(cx - hs * cosA - hs * px, cy - hs * sinA - hs * py);
      ctx.lineTo(cx + hs * cosA - hs * px, cy + hs * sinA - hs * py);
      ctx.closePath(); ctx.fill();
    } else if (shape === "diamond") {
      const mx = tipX - aLen / 2 * cosA, my = tipY - aLen / 2 * sinA;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(mx + halfW * px, my + halfW * py);
      ctx.lineTo(bx, by);
      ctx.lineTo(mx - halfW * px, my - halfW * py);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawArrowLine(x1, y1, x2, y2, color, width, arrowSize, cp1x, cp1y, cp2x, cp2y, startShape, endShape, taper, taperMin = 0, arrowHeadWidth = null) {
    const { ctx } = getState();
    if (cp1x == null) cp1x = x1 + (x2 - x1) / 3;
    if (cp1y == null) cp1y = y1 + (y2 - y1) / 3;
    if (cp2x == null) cp2x = x1 + (x2 - x1) * 2 / 3;
    if (cp2y == null) cp2y = y1 + (y2 - y1) * 2 / 3;
    if (endShape == null) endShape = "triangle";
    const w = Math.max(1, width);
    const aLen = Math.max(5, arrowSize ?? DEFAULT_ARROW_SIZE);
    const halfW = arrowHeadWidth != null ? arrowHeadWidth / 2 : Math.max(w * 2, aLen * 0.4);

    const hasEnd   = endShape   && endShape   !== "none";
    const hasStart = startShape && startShape !== "none";
    let endAngle = 0, startAngle = 0;
    if (hasEnd) {
      endAngle = Math.hypot(x2 - cp2x, y2 - cp2y) < 0.1
        ? Math.atan2(y2 - y1, x2 - x1)
        : Math.atan2(y2 - cp2y, x2 - cp2x);
    }
    if (hasStart) {
      startAngle = Math.hypot(cp1x - x1, cp1y - y1) < 0.1
        ? Math.atan2(y1 - y2, x1 - x2)
        : Math.atan2(y1 - cp1y, x1 - cp1x);
    }

    const endSb   = _capSetback(endShape,   aLen, halfW);
    const startSb = _capSetback(startShape, aLen, halfW);
    const lx2 = hasEnd   ? x2 - endSb   * Math.cos(endAngle)   : x2;
    const ly2 = hasEnd   ? y2 - endSb   * Math.sin(endAngle)   : y2;
    const lx1 = hasStart ? x1 - startSb * Math.cos(startAngle) : x1;
    const ly1 = hasStart ? y1 - startSb * Math.sin(startAngle) : y1;

    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    if (taper) {
      // Velocity taper: stroke is thickest where the bezier curves most (slow parametric
      // speed) and thinnest where it runs straight (fast speed). On a perfectly straight
      // arrow the width is uniform; on a curved bezier the curves bulge out visibly.
      const N = 48;
      const bxs = [], bys = [], spds = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, mt = 1 - t;
        bxs.push(mt**3*lx1 + 3*mt**2*t*cp1x + 3*mt*t**2*cp2x + t**3*lx2);
        bys.push(mt**3*ly1 + 3*mt**2*t*cp1y + 3*mt*t**2*cp2y + t**3*ly2);
        const dvx = 3*(mt**2*(cp1x-lx1) + 2*mt*t*(cp2x-cp1x) + t**2*(lx2-cp2x));
        const dvy = 3*(mt**2*(cp1y-ly1) + 2*mt*t*(cp2y-cp1y) + t**2*(ly2-cp2y));
        spds.push(Math.max(0.001, Math.hypot(dvx, dvy)));
      }
      const minSpd = Math.min(...spds);
      const maxSpd = Math.max(...spds);
      // Remap the natural taper range [naturalMin, w/2] → [taperMin/2, w/2] so
      // taperMin is the true minimum width, not just a floor on the physics formula.
      const naturalMin = Math.sqrt(minSpd / maxSpd) * w / 2;
      const taperRange = w / 2 - naturalMin;
      const left = [], right = [], hws = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, mt = 1 - t;
        const spd = spds[i];
        const hwNatural = Math.sqrt(minSpd / spd) * w / 2;
        const hw = taperRange < 0.001
          ? w / 2  // straight arrow — uniform width
          : taperMin / 2 + (hwNatural - naturalMin) * (w / 2 - taperMin / 2) / taperRange;
        hws.push(hw);
        const dvx = 3*(mt**2*(cp1x-lx1) + 2*mt*t*(cp2x-cp1x) + t**2*(lx2-cp2x));
        const dvy = 3*(mt**2*(cp1y-ly1) + 2*mt*t*(cp2y-cp1y) + t**2*(ly2-cp2y));
        const [px, py] = spd < 0.001 ? [0, hw] : [-dvy / spd * hw, dvx / spd * hw];
        left.push([bxs[i] + px, bys[i] + py]);
        right.push([bxs[i] - px, bys[i] - py]);
      }
      // Tangent angles at endpoints for rounded caps.
      // Counterclockwise arc (anticlockwise=true) goes from startAngle decreasing to endAngle,
      // which passes through the tip direction (outward) at each end.
      const startTang = Math.atan2(bys[1] - bys[0], bxs[1] - bxs[0]);
      const endTang   = Math.atan2(bys[N] - bys[N - 1], bxs[N] - bxs[N - 1]);
      ctx.beginPath();
      ctx.moveTo(left[0][0], left[0][1]);
      for (let i = 1; i <= N; i++) ctx.lineTo(left[i][0], left[i][1]);
      ctx.arc(bxs[N], bys[N], hws[N], endTang + Math.PI / 2, endTang - Math.PI / 2, true);
      for (let i = N - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
      ctx.arc(bxs[0], bys[0], hws[0], startTang - Math.PI / 2, startTang + Math.PI / 2, true);
      ctx.closePath();
      ctx.fill();
    } else {
      // Uniform-width stroke — simple and clean.
      ctx.lineWidth = w;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(lx1, ly1);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, lx2, ly2);
      ctx.stroke();
    }

    if (hasEnd)   _drawCap(ctx, x2, y2, Math.cos(endAngle),   Math.sin(endAngle),   aLen, halfW, endShape,   color, w);
    if (hasStart) _drawCap(ctx, x1, y1, Math.cos(startAngle), Math.sin(startAngle), aLen, halfW, startShape, color, w);
    ctx.restore();
  }

  function drawArrowAnnotation(ann, selected) {
    const { ctx, displayScale, hoverId } = getState();
    const isBezier = ann.is_bezier ?? false;
    const cps = defaultCps(ann);
    const cp1x = isBezier ? cps.cp1x : null;
    const cp1y = isBezier ? cps.cp1y : null;
    const cp2x = isBezier ? cps.cp2x : null;
    const cp2y = isBezier ? cps.cp2y : null;
    if (!ann.color) return;
    const startShape = ann.start_arrow_shape ?? (ann.has_start_arrow ? "triangle" : "none");
    const endShape   = ann.end_arrow_shape   ?? (ann.has_end_arrow !== false ? "triangle" : "none");
    drawArrowLine(ann.x1, ann.y1, ann.x2, ann.y2, ann.color, ann.width || DEFAULT_ARROW_WIDTH,
      ann.arrow_size ?? DEFAULT_ARROW_SIZE,
      cp1x, cp1y, cp2x, cp2y, startShape, endShape,
      ann.taper ?? false, ann.taperMin ?? 0, ann.arrow_head_width ?? null);
    if (selected) {
      const r = HANDLE_RADIUS / displayScale;
      ctx.save();
      for (const [ex, ey] of [[ann.x1, ann.y1], [ann.x2, ann.y2]]) {
        ctx.fillStyle = HANDLE_FILL;
        ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(${SEL_COLOR_RGB},${HANDLE_STROKE_OPACITY})`; ctx.lineWidth = LINE_WIDTH_PRIMARY / displayScale;
        ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.stroke();
      }
      if (isBezier) {
        const cpR = CP_HANDLE_RADIUS / displayScale;
        ctx.strokeStyle = `rgba(${SEL_COLOR_RGB},${CP_LINE_OPACITY})`;
        ctx.lineWidth = LINE_WIDTH_SECONDARY / displayScale;
        ctx.setLineDash(DASH_CP_LINE.map((v) => v / displayScale));
        ctx.beginPath(); ctx.moveTo(ann.x1, ann.y1); ctx.lineTo(cps.cp1x, cps.cp1y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ann.x2, ann.y2); ctx.lineTo(cps.cp2x, cps.cp2y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(${SEL_COLOR_RGB},${HANDLE_STROKE_OPACITY})`;
        ctx.lineWidth = LINE_WIDTH_PRIMARY / displayScale;
        for (const [hx, hy] of [[cps.cp1x, cps.cp1y], [cps.cp2x, cps.cp2y]]) {
          ctx.fillStyle = HANDLE_FILL;
          ctx.beginPath(); ctx.arc(hx, hy, cpR, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(hx, hy, cpR, 0, Math.PI * 2); ctx.stroke();
        }
      }
      ctx.restore();
    }
    if (isHovered(ann) && !selected) {
      const r = CP_HANDLE_RADIUS / displayScale;
      ctx.save();
      ctx.strokeStyle = `rgba(${SEL_COLOR_RGB},${HOVER_OPACITY})`;
      ctx.lineWidth = LINE_WIDTH_PRIMARY / displayScale;
      for (const [ex, ey] of [[ann.x1, ann.y1], [ann.x2, ann.y2]]) {
        ctx.beginPath(); ctx.arc(ex, ey, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawRect(ann, selected) {
    const { ctx, displayScale, hoverId } = getState();
    const hw = (ann.w || 10) / 2, hh = (ann.h || 10) / 2;
    const ah = ann.anchor_h || "center", av = ann.anchor_v || "middle";
    const cx = (ann.x || 0) + (ah === "left" ? hw : ah === "right" ? -hw : 0);
    const cy = (ann.y || 0) + (av === "top" ? hh : av === "bottom" ? -hh : 0);
    const isRounded = ann.shape === "rounded";
    const isPill = ann.shape === "pill";
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ann.rotation || 0);
    ctx.lineWidth = ann.width || DEFAULT_SHAPE_WIDTH;
    if (isRounded || isPill) {
      const r = isPill ? Math.min(hw, hh) : Math.min(hw, hh) * 0.3;
      if (ann.fill_color) {
        ctx.fillStyle = ann.fill_color;
        ctx.beginPath(); ctx.roundRect(-hw, -hh, hw * 2, hh * 2, r); ctx.fill();
      }
      if (ann.color) {
        ctx.strokeStyle = ann.color;
        ctx.beginPath(); ctx.roundRect(-hw, -hh, hw * 2, hh * 2, r); ctx.stroke();
      }
      if (isHovered(ann) && !selected) {
        const pad = HOVER_PAD / displayScale;
        ctx.strokeStyle = `rgba(${SEL_COLOR_RGB},${HOVER_OPACITY})`;
        ctx.lineWidth = LINE_WIDTH_PRIMARY / displayScale;
        ctx.beginPath(); ctx.roundRect(-hw - pad, -hh - pad, hw * 2 + pad * 2, hh * 2 + pad * 2, r + pad); ctx.stroke();
      }
    } else {
      if (ann.fill_color) { ctx.fillStyle = ann.fill_color; ctx.fillRect(-hw, -hh, hw * 2, hh * 2); }
      if (ann.color) { ctx.strokeStyle = ann.color; ctx.strokeRect(-hw, -hh, hw * 2, hh * 2); }
      if (isHovered(ann) && !selected) {
        const pad = HOVER_PAD / displayScale;
        ctx.strokeStyle = `rgba(${SEL_COLOR_RGB},${HOVER_OPACITY})`;
        ctx.lineWidth = LINE_WIDTH_PRIMARY / displayScale;
        ctx.strokeRect(-hw - pad, -hh - pad, hw * 2 + pad * 2, hh * 2 + pad * 2);
      }
    }
    ctx.restore();
  }

  function drawEllipse(ann, selected) {
    const { ctx, displayScale, hoverId } = getState();
    const rx = Math.max(0.5, (ann.w || 10) / 2), ry = Math.max(0.5, (ann.h || 10) / 2);
    const ah = ann.anchor_h || "center", av = ann.anchor_v || "middle";
    const cx = (ann.x || 0) + (ah === "left" ? rx : ah === "right" ? -rx : 0);
    const cy = (ann.y || 0) + (av === "top" ? ry : av === "bottom" ? -ry : 0);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ann.rotation || 0);
    ctx.lineWidth = ann.width || DEFAULT_SHAPE_WIDTH;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    if (ann.fill_color) { ctx.fillStyle = ann.fill_color; ctx.fill(); }
    if (ann.color) { ctx.strokeStyle = ann.color; ctx.stroke(); }
    if (isHovered(ann) && !selected) {
      const pad = HOVER_PAD / displayScale;
      ctx.strokeStyle = `rgba(${SEL_COLOR_RGB},${HOVER_OPACITY})`;
      ctx.lineWidth = LINE_WIDTH_PRIMARY / displayScale;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx + pad, ry + pad, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Render a Lucide icon (SVG innerHTML string) at 24×24 onto the current ctx.
  // ctx must already be transformed so that 0,0 maps to the top-left of a 24×24 square.
  // Elements with fill="currentColor" are filled; all others are stroked.
  function _drawLucideIconOnCanvas(ctx, svgInner) {
    const tmp = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    tmp.innerHTML = svgInner;
    for (const el of tmp.children) {
      const tag = el.tagName.toLowerCase();
      const hasFill = el.getAttribute("fill") === "currentColor";
      if (tag === "path") {
        const p = new Path2D(el.getAttribute("d") || "");
        if (hasFill) ctx.fill(p); else ctx.stroke(p);
      } else if (tag === "line") {
        ctx.beginPath();
        ctx.moveTo(+el.getAttribute("x1"), +el.getAttribute("y1"));
        ctx.lineTo(+el.getAttribute("x2"), +el.getAttribute("y2"));
        ctx.stroke();
      } else if (tag === "circle") {
        ctx.beginPath();
        ctx.arc(+el.getAttribute("cx"), +el.getAttribute("cy"),
                +el.getAttribute("r"), 0, Math.PI * 2);
        if (hasFill) ctx.fill(); else ctx.stroke();
      } else if (tag === "polyline") {
        const pts = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
        if (pts.length >= 4) {
          ctx.beginPath();
          ctx.moveTo(pts[0], pts[1]);
          for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
          ctx.stroke();
        }
      } else if (tag === "rect") {
        const rx = +el.getAttribute("rx") || 0;
        const bx = +el.getAttribute("x") || 0, by = +el.getAttribute("y") || 0;
        const bw = +el.getAttribute("width") || 0, bh = +el.getAttribute("height") || 0;
        if (rx) ctx.roundRect(bx, by, bw, bh, rx); else ctx.rect(bx, by, bw, bh);
        if (hasFill) ctx.fill(); else ctx.stroke();
      }
    }
  }

  function drawStamp(ann, selected) {
    const { ctx, displayScale } = getState();
    const sz = ann.size || DEFAULT_STAMP_SIZE;
    const color = ann.color || DEFAULT_COLOR;
    const r = sz / 2;
    const iconKey = "stamp-" + (ann.stamp_type || "checkmark");
    const iconSvg = ICON_PATHS[iconKey] || ICON_PATHS["stamp-checkmark"] || "";

    ctx.save();
    ctx.translate(ann.x || 0, ann.y || 0);
    ctx.rotate(ann.rotation || 0);

    // Filled disc (the sticker background)
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // White border ring
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,1.0)";
    ctx.lineWidth = Math.max(1, sz * 0.04);
    ctx.stroke();

    // Lucide icon in white, scaled from 24×24 to stamp size with 15% padding
    const pad = sz * 0.15;
    const scale = (sz - pad * 2) / 24;
    ctx.save();
    ctx.translate(-r + pad, -r + pad);
    ctx.scale(scale, scale);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    _drawLucideIconOnCanvas(ctx, iconSvg);
    ctx.restore();

    if (isHovered(ann) && !selected) {
      const hr = sz / 2 + HOVER_PAD / displayScale;
      ctx.strokeStyle = `rgba(${SEL_COLOR_RGB},${HOVER_OPACITY})`;
      ctx.lineWidth = LINE_WIDTH_PRIMARY / displayScale;
      ctx.beginPath();
      ctx.arc(0, 0, hr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  return { renderStrokes, drawPaint, drawText, drawArrowLine, drawArrowAnnotation, drawRect, drawEllipse, drawStamp };
}
