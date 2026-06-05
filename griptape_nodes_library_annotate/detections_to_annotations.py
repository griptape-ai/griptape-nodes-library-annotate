from collections import defaultdict
from typing import Any

from griptape_nodes.exe_types.core_types import Parameter, ParameterMode
from griptape_nodes.exe_types.node_types import DataNode
from griptape_nodes.exe_types.param_types.parameter_bool import ParameterBool
from griptape_nodes.exe_types.param_types.parameter_dict import ParameterDict
from griptape_nodes.exe_types.param_types.parameter_int import ParameterInt
from griptape_nodes.exe_types.param_types.parameter_json import ParameterJson
from griptape_nodes.exe_types.param_types.parameter_string import ParameterString
from griptape_nodes.retained_mode.griptape_nodes import logger
from griptape_nodes.traits.options import Options
from griptape_nodes.traits.slider import Slider

# Field name aliases to try when auto-detecting label and confidence
_CONFIDENCE_KEYS = ("confidence", "score", "conf", "prob", "probability")
_LABEL_KEYS = ("label", "class", "class_name", "name", "category")

# Human-readable dropdown choices → internal format key
_FORMAT_CHOICES = {
    "x, y, width, height": "top_left_xywh",
    "cx, cy, width, height": "center_xywh",
    "x1, y1, x2, y2": "corner_xyxy",
    "normalized (0.0 – 1.0)": "normalized_xywh",
}
_DEFAULT_FORMAT_LABEL = "x, y, width, height"

# For each coordinate format, ordered list of (x, y, w_or_x2, h_or_y2) field name tuples to try
_COORD_ALIASES: dict[str, list[tuple[str, str, str, str]]] = {
    "top_left_xywh": [
        ("x", "y", "width", "height"),
        ("x", "y", "w", "h"),
        ("bbox_x", "bbox_y", "bbox_width", "bbox_height"),
    ],
    "center_xywh": [
        ("cx", "cy", "width", "height"),
        ("cx", "cy", "w", "h"),
        ("center_x", "center_y", "width", "height"),
        ("x_center", "y_center", "width", "height"),
        ("x", "y", "width", "height"),  # some YOLO exports use x/y for center
        ("x", "y", "w", "h"),
    ],
    "corner_xyxy": [
        ("x1", "y1", "x2", "y2"),
        ("xmin", "ymin", "xmax", "ymax"),
        ("left", "top", "right", "bottom"),
        ("x_min", "y_min", "x_max", "y_max"),
    ],
    # Normalized shares field names with top_left; values are scaled ×100 → percentage space
    "normalized_xywh": [
        ("x", "y", "width", "height"),
        ("x", "y", "w", "h"),
        ("xmin", "ymin", "width", "height"),
        ("xmin", "ymin", "xmax", "ymax"),  # normalized corner format (TF OD API style)
    ],
}

# Common wrapper keys when the input is a dict rather than a bare list
_WRAPPER_KEYS = ("detections", "objects", "results", "predictions", "faces", "items", "data", "boxes")


def _extract_detections_list(value: Any) -> list[dict]:
    if isinstance(value, list):
        return [d for d in value if isinstance(d, dict)]
    if isinstance(value, dict):
        for key in _WRAPPER_KEYS:
            if key in value and isinstance(value[key], list):
                return [d for d in value[key] if isinstance(d, dict)]
        # Single detection passed as a bare dict
        if any(k in value for k in ("x", "x1", "cx", "xmin", "left")):
            return [value]
    return []


def _extract_coords(det: dict, coord_format: str) -> tuple[float, float, float, float] | None:
    """Return (x_topleft, y_topleft, width, height) in the annotation coordinate space.

    For pixel formats this is raw pixels. For normalized_xywh all values are
    multiplied by 100 so they sit in percentage space (0–100), ready for use
    with the annotation system's ``"percentage": true`` flag.
    """
    for alias in _COORD_ALIASES.get(coord_format, []):
        a, b, c, d = alias
        if all(k in det for k in (a, b, c, d)):
            va, vb, vc, vd = float(det[a]), float(det[b]), float(det[c]), float(det[d])
            if coord_format == "top_left_xywh":
                return va, vb, vc, vd
            elif coord_format == "center_xywh":
                return va - vc / 2, vb - vd / 2, vc, vd
            elif coord_format == "corner_xyxy":
                return va, vb, vc - va, vd - vb
            elif coord_format == "normalized_xywh":
                # Determine if input is xywh (top-left) or xyxy (corners)
                if a.endswith("min") or a in ("x", "y"):
                    if c.endswith("max"):  # corner form: xmin, ymin, xmax, ymax
                        return (va * 100, vb * 100, (vc - va) * 100, (vd - vb) * 100)
                    return va * 100, vb * 100, vc * 100, vd * 100  # top-left form
    return None


def _extract_confidence(det: dict) -> float | None:
    for key in _CONFIDENCE_KEYS:
        if key in det:
            try:
                return float(det[key])
            except (TypeError, ValueError):
                pass
    return None


def _extract_label(det: dict) -> str | None:
    for key in _LABEL_KEYS:
        if key in det and det[key] is not None:
            return str(det[key])
    return None


def _format_label(template: str, det: dict) -> str:
    """Apply a {key} / {key:.2f} template against a detection dict.

    Converts literal \\n sequences to real newlines so multiline templates
    entered in the UI work as expected. Falls back to auto-building from
    known label and confidence fields if format substitution fails.
    """
    template = template.replace("\\n", "\n")
    try:
        return template.format_map(defaultdict(lambda: "", det))
    except (ValueError, KeyError, TypeError):
        pass
    # Auto-fallback: label + confidence, whatever is present
    parts: list[str] = []
    lbl = _extract_label(det)
    if lbl:
        parts.append(lbl)
    conf = _extract_confidence(det)
    if conf is not None:
        parts.append(f"{conf:.2f}")
    return " ".join(parts) or "detection"


def _derive_bg_color(hex_color: str) -> str:
    """Return the box color at ~76 % opacity for use as a label background."""
    c = hex_color.strip().lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    if len(c) == 6:
        return f"#{c}C2"
    return hex_color


class DetectionsToAnnotations(DataNode):
    """Convert bounding-box detection results into annotation data for the Annotate Image node."""

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)

        self.add_parameter(
            ParameterJson(
                name="detections",
                default_value=None,
                tooltip=(
                    "Detection results from an upstream detector. Accepts a list of bounding-box dicts "
                    "or a dict with a wrapper key (e.g. 'detections', 'objects', 'results').\n"
                    "Common field names are auto-detected for confidence and class label."
                ),
                allowed_modes={ParameterMode.INPUT},
                hide_property=True,
            )
        )

        self.add_parameter(
            ParameterString(
                name="coordinate_format",
                default_value=_DEFAULT_FORMAT_LABEL,
                tooltip=(
                    "The bounding-box fields your detector outputs:\n"
                    "• x, y, width, height — top-left corner (most face detectors, OpenCV, MediaPipe)\n"
                    "• cx, cy, width, height — center point (YOLO / ultralytics)\n"
                    "• x1, y1, x2, y2 — two opposite corners (torchvision, DETR)"
                ),
                allowed_modes={ParameterMode.PROPERTY},
                traits={Options(choices=list(_FORMAT_CHOICES.keys()))},
            )
        )

        self.add_parameter(
            ParameterString(
                name="color",
                default_value="#ff0000",
                tooltip="Stroke color for the annotation rectangles.",
                allowed_modes={ParameterMode.PROPERTY},
                ui_options={"color_picker": True},
            )
        )

        self.add_parameter(
            ParameterInt(
                name="stroke_width",
                default_value=2,
                tooltip="Line width for annotation rectangles (pixels).",
                allowed_modes={ParameterMode.PROPERTY},
                traits={Slider(min_val=1, max_val=32)},
                ui_options={"step": 1},
            )
        )

        self.add_parameter(
            ParameterBool(
                name="include_label",
                default_value=False,
                tooltip=(
                    "Add a text label above each box. "
                    "Use {key} placeholders in the template to insert values from the detection "
                    "(e.g. {label}, {confidence:.2f}). "
                    "Known fields are auto-detected when the template fails to render."
                ),
                allowed_modes={ParameterMode.PROPERTY},
            )
        )

        self.add_parameter(
            ParameterString(
                name="label_template",
                default_value="{confidence:.2f}",
                tooltip=(
                    "Template for the label text. Use {key} to insert any field from the detection dict, "
                    "with optional Python format specs (e.g. {confidence:.2f}, {confidence:.0%}).\n"
                    "Use \\n for a line break (e.g. '{x},{y}\\nconf: {confidence:.2f}')."
                ),
                allowed_modes={ParameterMode.PROPERTY},
                ui_options={"hide": True, "placeholder_text": "{confidence:.2f}"},
            )
        )

        self.add_parameter(
            ParameterInt(
                name="label_font_size",
                default_value=24,
                tooltip="Font size for the label text.",
                allowed_modes={ParameterMode.PROPERTY},
                traits={Slider(min_val=8, max_val=96)},
                ui_options={"hide": True, "step": 1},
            )
        )

        self.add_parameter(
            ParameterString(
                name="label_text_color",
                default_value="#ffffff",
                tooltip="Text color for the label. Defaults to white, which reads well on the colored background.",
                allowed_modes={ParameterMode.PROPERTY},
                ui_options={"hide": True, "color_picker": True},
            )
        )

        self.add_parameter(
            ParameterString(
                name="id_prefix",
                default_value="rect-detection",
                tooltip=(
                    "Prefix used when generating annotation IDs. "
                    "For example, 'rect-face' produces ids 'rect-face-1', 'rect-face-2', …"
                ),
                allowed_modes={ParameterMode.PROPERTY},
                hide_property=True,
            )
        )

        self.add_parameter(
            ParameterDict(
                name="output_annotation_data",
                default_value={"annotations": []},
                tooltip="Annotation data ready to connect to the 'Annotation Data Input' port of an Annotate Image node.",
                allowed_modes={ParameterMode.OUTPUT},
                hide_property=True,
            )
        )

    def validate_before_node_run(self) -> list[Exception]:
        errors = []
        raw = self.get_parameter_value("detections")
        if raw is None:
            errors.append(ValueError("'detections' is required. Connect an upstream detector's output to this input."))
        return errors

    def after_value_set(self, parameter: Parameter, value: Any) -> None:
        if parameter.name == "include_label":
            label_params = ("label_template", "label_font_size", "label_text_color")
            if value:
                for name in label_params:
                    self.show_parameter_by_name(name)
            else:
                for name in label_params:
                    self.hide_parameter_by_name(name)
        return super().after_value_set(parameter, value)

    def process(self) -> None:
        raw = self.get_parameter_value("detections")
        format_label = self.get_parameter_value("coordinate_format") or _DEFAULT_FORMAT_LABEL
        coord_format = _FORMAT_CHOICES.get(format_label, "top_left_xywh")
        use_percentage = coord_format == "normalized_xywh"
        color = self.get_parameter_value("color") or "#ff0000"
        stroke_width = max(1, int(self.get_parameter_value("stroke_width") or 2))
        include_label = bool(self.get_parameter_value("include_label"))
        label_template = self.get_parameter_value("label_template") or "{confidence:.2f}"
        label_font_size = max(8, int(self.get_parameter_value("label_font_size") or 24))
        label_text_color = self.get_parameter_value("label_text_color") or "#ffffff"
        id_prefix = self.get_parameter_value("id_prefix") or "rect-detection"

        detections = _extract_detections_list(raw)
        if not detections:
            logger.warning(f"{self.name}: No detections found in input; outputting empty annotations.")

        rect_annotations: list[dict] = []
        text_annotations: list[dict] = []
        skipped = 0
        idx = 0

        for det in detections:
            coords = _extract_coords(det, coord_format)
            if coords is None:
                logger.warning(f"{self.name}: Could not extract '{format_label}' coordinates from: {det}")
                skipped += 1
                continue

            idx += 1
            x, y, w, h = coords

            rect_annotations.append(
                {
                    "id": f"{id_prefix}-{idx}",
                    "type": "rect",
                    "anchor_h": "left",
                    "anchor_v": "top",
                    "x": x,
                    "y": y,
                    "w": w,
                    "h": h,
                    "rotation": 0,
                    "color": color,
                    "fill_color": "",
                    "width": stroke_width,
                    "percentage": use_percentage,
                }
            )

            if include_label:
                label_text = _format_label(label_template, det)
                text_annotations.append(
                    {
                        "id": f"text-{id_prefix}-{idx}",
                        "type": "text",
                        "anchor_h": "left",
                        "anchor_v": "bottom",
                        "x": x,
                        "y": y,
                        "text": label_text,
                        "text_align": "left",
                        "color": label_text_color,
                        "bg_color": _derive_bg_color(color),
                        "font_size": label_font_size,
                        "rotation": 0,
                        "percentage": use_percentage,
                    }
                )

        output = {"annotations": rect_annotations + text_annotations}
        self.parameter_output_values["output_annotation_data"] = output
        self.publish_update_to_parameter("output_annotation_data", output)

        logger.debug(f"{self.name}: {idx} annotation(s) generated, {skipped} detection(s) skipped.")
