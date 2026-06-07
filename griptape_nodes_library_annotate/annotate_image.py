import math
from io import BytesIO
from typing import Any

from griptape.artifacts import ImageUrlArtifact
from griptape_nodes.exe_types.core_types import Parameter, ParameterMode
from griptape_nodes.exe_types.node_types import DataNode
from griptape_nodes.exe_types.param_components.project_file_parameter import ProjectFileParameter
from griptape_nodes.exe_types.param_types.parameter_dict import ParameterDict
from griptape_nodes.exe_types.param_types.parameter_image import ParameterImage
from griptape_nodes.files.file import File
from griptape_nodes.retained_mode.griptape_nodes import GriptapeNodes, logger
from griptape_nodes.traits.widget import Widget
from PIL import Image, ImageDraw, ImageFont

from griptape_nodes_library_annotate.utils.color_utils import parse_color_to_rgba

DEFAULT_CANVAS_WIDTH = 1920
DEFAULT_CANVAS_HEIGHT = 1080


def _default_annotation_data() -> dict:
    return {
        "image_url": "",
        "raw_url": "",
        "canvas_width": 0,
        "canvas_height": 0,
        "annotations": [],
        "active_tool": "select",
        "tool_settings": {
            "paint": {"color": "#ff0000", "size": 8},
            "text": {"color": "#ffffff", "font_size": 48, "bg_color": "#FF0000C2"},
            "arrow": {
                "color": "#ff0000",
                "width": 8,
                "has_start_arrow": False,
                "has_end_arrow": True,
                "is_bezier": False,
                "taper": False,
            },
            "rect": {"color": "#ff0000", "width": 8, "fill_color": ""},
            "ellipse": {"color": "#ff0000", "width": 8, "fill_color": ""},
        },
        "selected_id": None,
    }


class AnnotateImage(DataNode):
    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)

        self.add_parameter(
            ParameterImage(
                name="input_image",
                default_value=None,
                tooltip="Input image to annotate",
                allowed_modes={ParameterMode.INPUT, ParameterMode.OUTPUT},
                hide_property=True,
            )
        )

        self.add_parameter(
            ParameterDict(
                name="input_annotation_data",
                default_value=None,
                tooltip="Annotation data to import from another node (overrides can be applied in canvas)",
                allowed_modes={ParameterMode.INPUT},
                hide_property=True,
            )
        )

        self.add_parameter(
            ParameterDict(
                name="output_annotation_data",
                default_value=_default_annotation_data(),
                tooltip="Canvas annotations (paint, text, arrows)",
                allowed_modes={ParameterMode.PROPERTY, ParameterMode.OUTPUT},
                traits={Widget(name="AnnotateImage", library="Annotate Image Library")},
            )
        )

        self.add_parameter(
            ParameterImage(
                name="output_image",
                tooltip="Image with annotations composited",
                allowed_modes={ParameterMode.OUTPUT},
                hide_property=True,
            )
        )

        self._output_file = ProjectFileParameter(node=self, name="output_file", default_filename="annotated.png")
        self._output_file.add_parameter()

    # ── helpers ───────────────────────────────────────────────────────────────

    def _resolve_url(self, artifact: Any) -> tuple[str, str]:
        """Return (raw_path, browser_url) for an image artifact."""
        from griptape_nodes.retained_mode.events.static_file_events import (
            CreateStaticFileDownloadUrlFromPathRequest,
            CreateStaticFileDownloadUrlResultSuccess,
        )

        raw = getattr(artifact, "value", "") or ""
        if not raw:
            return "", ""
        if raw.startswith(("http://", "https://", "data:")):
            return raw, raw
        try:
            resolved = File(raw).resolve()
        except Exception:
            resolved = str(raw)
        try:
            result = GriptapeNodes.handle_request(CreateStaticFileDownloadUrlFromPathRequest(file_path=resolved))
            if isinstance(result, CreateStaticFileDownloadUrlResultSuccess):
                return resolved, result.url
        except Exception:
            pass
        return resolved, raw

    def _get_dimensions(self, raw_path: str) -> tuple[int, int]:
        try:
            data = File(raw_path).read_bytes()
            with Image.open(BytesIO(data)) as img:
                return img.size  # (width, height)
        except Exception:
            return 0, 0

    # ── lifecycle ─────────────────────────────────────────────────────────────

    def after_value_set(self, parameter: Parameter, value: Any) -> None:
        if parameter.name == "input_image" and value:
            raw, browser_url = self._resolve_url(value)
            if not browser_url:
                return super().after_value_set(parameter, value)
            w, h = self._get_dimensions(raw)
            data = self.get_parameter_value("output_annotation_data") or _default_annotation_data()
            if not isinstance(data, dict):
                data = _default_annotation_data()
            new_data = {
                **data,
                "image_url": browser_url,
                "raw_url": raw,
                "canvas_width": w or data.get("canvas_width", 0),
                "canvas_height": h or data.get("canvas_height", 0),
            }
            self.set_parameter_value("output_annotation_data", new_data)
            self.publish_update_to_parameter("output_annotation_data", new_data)

        if parameter.name == "input_annotation_data" and isinstance(value, dict):
            # Accept full annotation_data dict from an upstream node's annotation_data output.
            # Compute the effective (merged) annotations so overrides and deletions are resolved.
            imported = self._effective_annotations(value)
            data = self.get_parameter_value("output_annotation_data") or _default_annotation_data()
            if not isinstance(data, dict):
                data = _default_annotation_data()
            new_data = {**data, "imported_annotations": imported}
            self.set_parameter_value("output_annotation_data", new_data)
            self.publish_update_to_parameter("output_annotation_data", new_data)

        return super().after_value_set(parameter, value)

    # ── compositing ───────────────────────────────────────────────────────────

    def _resolve_px(self, val: float, dim: float, is_pct: bool) -> float:
        return val * dim / 100.0 if is_pct else val

    def _parse_color(self, color_str: str, opacity: float = 1.0) -> tuple[int, int, int, int]:
        try:
            r, g, b, a = parse_color_to_rgba(color_str)
        except Exception:
            r, g, b, a = 255, 0, 0, 255
        return (r, g, b, int(a * opacity))

    def _paint_natural_center(self, ann: dict) -> tuple[float, float]:
        if ann.get("cx") is not None and ann.get("cy") is not None:
            return float(ann["cx"]), float(ann["cy"])
        min_x = min_y = float("inf")
        max_x = max_y = float("-inf")
        for stroke in ann.get("strokes", []):
            for pt in stroke.get("points", []):
                min_x = min(min_x, pt[0])
                min_y = min(min_y, pt[1])
                max_x = max(max_x, pt[0])
                max_y = max(max_y, pt[1])
        if math.isinf(min_x):
            return 0.0, 0.0
        return (min_x + max_x) / 2, (min_y + max_y) / 2

    def _draw_paint(self, draw: ImageDraw.ImageDraw, ann: dict) -> None:
        cx, cy = self._paint_natural_center(ann)
        tx_off = float(ann.get("x", 0) or 0)
        ty_off = float(ann.get("y", 0) or 0)
        sx = float(ann.get("scaleX", 1) or 1)
        sy = float(ann.get("scaleY", 1) or 1)
        rot = float(ann.get("rotation", 0) or 0)
        cos_r, sin_r = math.cos(rot), math.sin(rot)

        def xform(nx: float, ny: float) -> tuple[float, float]:
            lx, ly = (nx - cx) * sx, (ny - cy) * sy
            return cx + tx_off + lx * cos_r - ly * sin_r, cy + ty_off + lx * sin_r + ly * cos_r

        size_scale = float(ann.get("sizeScale", 1.0) or 1.0)
        transform_scale = math.sqrt(abs(sx * sy))
        effective_scale = size_scale * transform_scale

        for stroke in ann.get("strokes", []):
            pts_raw = stroke.get("points", [])
            if not pts_raw:
                continue
            color = self._parse_color(stroke.get("color", "#ff0000"))
            base_size = max(1.0, float(stroke.get("size", 8)))

            pts: list[tuple[float, float]] = []
            radii: list[float] = []
            for pt in pts_raw:
                px, py = xform(float(pt[0]), float(pt[1]))
                raw_sz = float(pt[2]) if len(pt) > 2 and pt[2] is not None else base_size
                pts.append((px, py))
                radii.append(max(0.5, raw_sz * effective_scale / 2))

            n = len(pts)
            if n == 1:
                r = radii[0]
                draw.ellipse([pts[0][0] - r, pts[0][1] - r, pts[0][0] + r, pts[0][1] + r], fill=color)
                continue

            # Draw additively: per-segment trapezoids + interior circles + half-circle caps.
            # Per-segment normals are always non-self-intersecting (unlike smooth tangents,
            # which create bowtie quads at sharp corners that even-odd fill renders as spikes).
            # Interior circles round the joints between segments. Half-circle caps match JS.
            def _half_arc(acx: float, acy: float, r: float, start_a: float, steps: int = 12) -> list:
                return [
                    (
                        acx + r * math.cos(start_a + math.pi * k / steps),
                        acy + r * math.sin(start_a + math.pi * k / steps),
                    )
                    for k in range(steps + 1)
                ]

            # Start cap — half-circle facing backward along first segment
            a0 = math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0])
            draw.polygon(_half_arc(pts[0][0], pts[0][1], radii[0], a0 + math.pi / 2), fill=color)

            for i in range(n - 1):
                dx = pts[i + 1][0] - pts[i][0]
                dy = pts[i + 1][1] - pts[i][1]
                seg_len = math.hypot(dx, dy)
                nx, ny = (dy / seg_len, -dx / seg_len) if seg_len > 0.001 else (0.0, 1.0)
                ri, ri1 = radii[i], radii[i + 1]
                draw.polygon(
                    [
                        (pts[i][0] + nx * ri, pts[i][1] + ny * ri),
                        (pts[i + 1][0] + nx * ri1, pts[i + 1][1] + ny * ri1),
                        (pts[i + 1][0] - nx * ri1, pts[i + 1][1] - ny * ri1),
                        (pts[i][0] - nx * ri, pts[i][1] - ny * ri),
                    ],
                    fill=color,
                )
                # Interior circle rounds the joint to the next segment
                if i + 1 < n - 1:
                    r = radii[i + 1]
                    draw.ellipse(
                        [pts[i + 1][0] - r, pts[i + 1][1] - r, pts[i + 1][0] + r, pts[i + 1][1] + r], fill=color
                    )

            # End cap — half-circle facing forward along last segment
            an = math.atan2(pts[n - 1][1] - pts[n - 2][1], pts[n - 1][0] - pts[n - 2][0])
            draw.polygon(_half_arc(pts[n - 1][0], pts[n - 1][1], radii[n - 1], an - math.pi / 2), fill=color)

    def _draw_text(
        self,
        draw: ImageDraw.ImageDraw,
        ann: dict,
        overlay: Image.Image | None = None,
        canvas_w: int = 0,
        canvas_h: int = 0,
    ) -> None:
        text = ann.get("text", "")
        if not text:
            return
        is_pct = bool(ann.get("percentage", False))
        x = self._resolve_px(float(ann.get("x", 0)), canvas_w, is_pct)
        y = self._resolve_px(float(ann.get("y", 0)), canvas_h, is_pct)
        rotation = float(ann.get("rotation", 0))
        font_size = max(8, int(ann.get("font_size", 48)))
        color = self._parse_color(ann.get("color", "#ff0000"))
        text_align = ann.get("text_align", "left")
        spacing = int(font_size * 0.2)
        try:
            font = ImageFont.load_default(size=font_size)
        except TypeError:
            font = ImageFont.load_default()

        bg_color_str = ann.get("bg_color", "") or ""
        bg_color = self._parse_color(bg_color_str) if bg_color_str else None
        pad = font_size * 0.15
        n_lines = len(text.split("\n"))
        line_height = font_size * 1.2  # matches JS lineHeight = fontSize * 1.2

        # Measure text width for anchor offset (use reference bbox at origin)
        ref_bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=spacing, align=text_align)
        text_w = ref_bbox[2] - ref_bbox[0]
        visual_h = line_height * n_lines

        # Apply anchor offsets — shifts draw origin so x/y pin to the chosen edge/center
        anchor_h = ann.get("anchor_h", "left")
        anchor_v = ann.get("anchor_v", "top")
        if anchor_h == "center":
            x -= text_w / 2
        elif anchor_h == "right":
            x -= text_w
        if anchor_v == "middle":
            y -= visual_h / 2
        elif anchor_v == "bottom":
            y -= visual_h

        def _draw_on(d: ImageDraw.ImageDraw, tx: float, ty: float) -> None:
            """Draw bg rect + text at (tx, ty) on draw surface d."""
            if bg_color:
                bbox = d.multiline_textbbox((tx, ty), text, font=font, spacing=spacing, align=text_align)
                d.rectangle(
                    [bbox[0] - pad, ty - pad, bbox[2] + pad, ty + line_height * n_lines + pad],
                    fill=bg_color,
                )
            d.text((tx, ty), text, font=font, fill=color, spacing=spacing, align=text_align)

        if not rotation or overlay is None:
            _draw_on(draw, x, y)
            return

        # Rotated text: draw onto an oversized temp so long text isn't clipped before
        # rotation. The padding must be at least the longest text dimension so the text
        # can extend past any canvas edge without being cropped pre-rotation.
        rot_pad = int(math.ceil(max(text_w, visual_h))) + int(pad) + 4

        temp = Image.new("RGBA", (overlay.width + 2 * rot_pad, overlay.height + 2 * rot_pad), (0, 0, 0, 0))
        temp_draw = ImageDraw.Draw(temp)
        _draw_on(temp_draw, x + rot_pad, y + rot_pad)

        degrees = -math.degrees(rotation)
        # Rotation pivot is the original (pre-anchor-offset) anchor point, which in the
        # temp image's coordinate space is (ann_x + rot_pad, ann_y + rot_pad).
        ann_x = self._resolve_px(float(ann.get("x", 0)), canvas_w, is_pct)
        ann_y = self._resolve_px(float(ann.get("y", 0)), canvas_h, is_pct)
        rotated = temp.rotate(
            degrees,
            resample=Image.Resampling.BICUBIC,
            expand=False,
            center=(ann_x + rot_pad, ann_y + rot_pad),
        )
        cropped = rotated.crop((rot_pad, rot_pad, rot_pad + overlay.width, rot_pad + overlay.height))
        overlay.alpha_composite(cropped)

    def _draw_arrow(self, draw: ImageDraw.ImageDraw, ann: dict) -> None:
        x1, y1 = float(ann.get("x1", 0)), float(ann.get("y1", 0))
        x2, y2 = float(ann.get("x2", 0)), float(ann.get("y2", 0))
        cp1x = float(ann.get("cp1x", x1 + (x2 - x1) / 3))
        cp1y = float(ann.get("cp1y", y1 + (y2 - y1) / 3))
        cp2x = float(ann.get("cp2x", x1 + (x2 - x1) * 2 / 3))
        cp2y = float(ann.get("cp2y", y1 + (y2 - y1) * 2 / 3))
        color = self._parse_color(ann.get("color", "#ff0000"))
        w = max(1.0, float(ann.get("width", 8)))
        a_len = max(5.0, float(ann.get("arrow_size", 20)))
        half_w = max(w * 2, a_len * 0.4)
        has_end_arrow = bool(ann.get("has_end_arrow", True))
        has_start_arrow = bool(ann.get("has_start_arrow", False))
        taper = bool(ann.get("taper", False))

        setback = a_len

        # Arrowhead angles from tangent at endpoints
        end_angle = start_angle = 0.0
        if has_end_arrow:
            dx, dy = x2 - cp2x, y2 - cp2y
            end_angle = math.atan2(dy, dx) if math.hypot(dx, dy) > 0.1 else math.atan2(y2 - y1, x2 - x1)
        if has_start_arrow:
            dx, dy = x1 - cp1x, y1 - cp1y
            start_angle = math.atan2(dy, dx) if math.hypot(dx, dy) > 0.1 else math.atan2(y1 - y2, x1 - x2)

        # Pull endpoints back to arrowhead base
        lx2 = x2 - setback * math.cos(end_angle) if has_end_arrow else x2
        ly2 = y2 - setback * math.sin(end_angle) if has_end_arrow else y2
        lx1 = x1 - setback * math.cos(start_angle) if has_start_arrow else x1
        ly1 = y1 - setback * math.sin(start_angle) if has_start_arrow else y1

        # Sample bezier and compute parametric speed (first derivative magnitude)
        n = 48
        pts, speeds, tangents = [], [], []
        for i in range(n + 1):
            t = i / n
            mt = 1 - t
            bx = mt**3 * lx1 + 3 * mt**2 * t * cp1x + 3 * mt * t**2 * cp2x + t**3 * lx2
            by = mt**3 * ly1 + 3 * mt**2 * t * cp1y + 3 * mt * t**2 * cp2y + t**3 * ly2
            dvx = 3 * (mt**2 * (cp1x - lx1) + 2 * mt * t * (cp2x - cp1x) + t**2 * (lx2 - cp2x))
            dvy = 3 * (mt**2 * (cp1y - ly1) + 2 * mt * t * (cp2y - cp1y) + t**2 * (ly2 - cp2y))
            spd = math.hypot(dvx, dvy)
            pts.append((bx, by))
            speeds.append(max(spd, 0.001))
            tangents.append((dvx, dvy, max(spd, 0.001)))

        min_spd = min(speeds)
        is_straight = (max(speeds) - min_spd) < 0.001

        if not taper or is_straight:
            # Uniform width — round caps via overlapping circles + connecting lines
            for i in range(n + 1):
                bx, by = pts[i]
                r = w / 2
                draw.ellipse([bx - r, by - r, bx + r, by + r], fill=color)
            for i in range(n):
                draw.line([pts[i], pts[i + 1]], fill=color, width=int(w))
        else:
            # Velocity taper — thick in curves (slow), thin on straights (fast).
            # Mirrors the JS formula: hw = (minSpd / spd) * w / 2
            left_pts, right_pts = [], []
            for i in range(n + 1):
                bx, by = pts[i]
                dvx, dvy, spd = tangents[i]
                hw = math.sqrt(min_spd / spd) * w / 2
                px, py = (-dvy / spd * hw, dvx / spd * hw)
                left_pts.append((bx + px, by + py))
                right_pts.append((bx - px, by - py))
            polygon = left_pts + list(reversed(right_pts))
            draw.polygon([(int(x), int(y)) for x, y in polygon], fill=color)

        # Arrowheads — length controlled by a_len, base width by half_w
        if has_end_arrow:
            bx = x2 - a_len * math.cos(end_angle)
            by = y2 - a_len * math.sin(end_angle)
            px, py = -math.sin(end_angle), math.cos(end_angle)
            draw.polygon(
                [(x2, y2), (bx + half_w * px, by + half_w * py), (bx - half_w * px, by - half_w * py)], fill=color
            )
        if has_start_arrow:
            bx = x1 - a_len * math.cos(start_angle)
            by = y1 - a_len * math.sin(start_angle)
            px, py = -math.sin(start_angle), math.cos(start_angle)
            draw.polygon(
                [(x1, y1), (bx + half_w * px, by + half_w * py), (bx - half_w * px, by - half_w * py)], fill=color
            )

    def _draw_rect(self, draw: ImageDraw.ImageDraw, ann: dict, canvas_w: int = 0, canvas_h: int = 0) -> None:
        is_pct = bool(ann.get("percentage", False))
        x = self._resolve_px(float(ann.get("x", 0)), canvas_w, is_pct)
        y = self._resolve_px(float(ann.get("y", 0)), canvas_h, is_pct)
        w = float(ann.get("w", 100))
        h = float(ann.get("h", 100))
        rotation = float(ann.get("rotation", 0))
        color_str = ann.get("color", "") or ""
        color = self._parse_color(color_str) if color_str else None
        width = max(1, int(ann.get("width", 2))) if color_str else 0
        fill_color_str = ann.get("fill_color", "") or ""
        fill = self._parse_color(fill_color_str) if fill_color_str else None
        hw, hh = w / 2, h / 2
        # Anchor: compute actual center from stored position + anchor offset
        ah = ann.get("anchor_h", "center")
        av = ann.get("anchor_v", "middle")
        cx = x + (hw if ah == "left" else -hw if ah == "right" else 0)
        cy = y + (hh if av == "top" else -hh if av == "bottom" else 0)
        cos_r, sin_r = math.cos(rotation), math.sin(rotation)
        corners = [
            (cx + lx * cos_r - ly * sin_r, cy + lx * sin_r + ly * cos_r)
            for lx, ly in [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
        ]
        draw.polygon(corners, fill=fill, outline=color, width=width)

    def _draw_ellipse(self, draw: ImageDraw.ImageDraw, ann: dict, canvas_w: int = 0, canvas_h: int = 0) -> None:
        is_pct = bool(ann.get("percentage", False))
        x = self._resolve_px(float(ann.get("x", 0)), canvas_w, is_pct)
        y = self._resolve_px(float(ann.get("y", 0)), canvas_h, is_pct)
        w = float(ann.get("w", 100))
        h = float(ann.get("h", 100))
        fill_color_str = ann.get("fill_color", "") or ""
        fill = self._parse_color(fill_color_str) if fill_color_str else None
        color_str = ann.get("color", "") or ""
        color = self._parse_color(color_str) if color_str else None
        width = max(1, int(ann.get("width", 2))) if color_str else 0
        hw, hh = w / 2, h / 2
        # Anchor: compute actual center from stored position + anchor offset
        ah = ann.get("anchor_h", "center")
        av = ann.get("anchor_v", "middle")
        cx = x + (hw if ah == "left" else -hw if ah == "right" else 0)
        cy = y + (hh if av == "top" else -hh if av == "bottom" else 0)
        bbox = [cx - hw, cy - hh, cx + hw, cy + hh]
        draw.ellipse(bbox, fill=fill, outline=color, width=width)

    def _effective_annotations(self, annotation_data: dict) -> list:
        """Return imported (with overrides applied, deleted ones skipped) + local annotations."""
        imported = annotation_data.get("imported_annotations", []) or []
        overrides = annotation_data.get("overrides", {}) or {}
        local = annotation_data.get("annotations", []) or []

        merged_imported = []
        for ann in imported:
            ov = overrides.get(ann.get("id", ""), {})
            if ov.get("deleted"):
                continue
            merged_imported.append({**ann, **{k: v for k, v in ov.items() if k != "deleted"}})

        return merged_imported + local

    def process(self) -> None:
        image_artifact = self.get_parameter_value("input_image")

        annotation_data = self.get_parameter_value("output_annotation_data") or _default_annotation_data()
        if not isinstance(annotation_data, dict):
            annotation_data = _default_annotation_data()

        bg = None
        if image_artifact:
            raw_url = annotation_data.get("raw_url") or getattr(image_artifact, "value", "")
            try:
                img_data = File(raw_url).read_bytes()
                bg = Image.open(BytesIO(img_data)).convert("RGBA")
            except Exception:
                bg = None

        if bg is None:
            w = annotation_data.get("canvas_width") or DEFAULT_CANVAS_WIDTH
            h = annotation_data.get("canvas_height") or DEFAULT_CANVAS_HEIGHT
            bg = Image.new("RGBA", (int(w), int(h)), (0, 0, 0, 0))

        overlay = Image.new("RGBA", bg.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        canvas_w, canvas_h = bg.width, bg.height

        all_annotations = self._effective_annotations(annotation_data)
        for ann in all_annotations:
            ann_type = ann.get("type")
            if ann_type == "paint":
                self._draw_paint(draw, ann)
            elif ann_type == "text":
                self._draw_text(draw, ann, overlay, canvas_w, canvas_h)
            elif ann_type == "arrow":
                self._draw_arrow(draw, ann)
            elif ann_type == "rect":
                self._draw_rect(draw, ann, canvas_w, canvas_h)
            elif ann_type == "ellipse":
                self._draw_ellipse(draw, ann, canvas_w, canvas_h)

        canvas = Image.alpha_composite(bg, overlay)

        dest = self._output_file.build_file()
        buf = BytesIO()
        canvas.convert("RGB").save(buf, format="PNG")
        saved = dest.write_bytes(buf.getvalue())

        artifact = ImageUrlArtifact(value=saved.location)
        self.set_parameter_value("output_image", artifact)
        self.parameter_output_values["output_image"] = artifact
        self.publish_update_to_parameter("output_image", artifact)

        if image_artifact:
            self.parameter_output_values["input_image"] = image_artifact
            self.publish_update_to_parameter("input_image", image_artifact)

        self.parameter_output_values["output_annotation_data"] = annotation_data
        self.publish_update_to_parameter("output_annotation_data", annotation_data)

        logger.debug(f"{self.name}: Output saved to {artifact.value}")
