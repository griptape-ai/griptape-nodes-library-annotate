"""Tests that after_value_set() on a locked AnnotateImage node doesn't raise."""

from unittest.mock import MagicMock

from griptape_nodes_library_annotate.annotate_image import AnnotateImage, _default_annotation_data


def _make_node():
    """Return a minimal fake AnnotateImage instance without calling __init__."""
    node = MagicMock(spec=AnnotateImage)
    node.parameter_output_values = {}
    node.get_parameter_value.return_value = _default_annotation_data()
    # Simulate locked node manager: set_parameter_value raises.
    node.set_parameter_value.side_effect = RuntimeError("Failed because the Node was locked.")
    return node


def test_after_value_set_input_image_locked():
    node = _make_node()
    node._resolve_url.return_value = ("/raw/path.png", "http://example.com/img.png")
    node._get_dimensions.return_value = (1920, 1080)

    param = MagicMock()
    param.name = "input_image"
    artifact = MagicMock()
    artifact.value = "http://example.com/img.png"

    # Must not raise even though set_parameter_value raises.
    AnnotateImage.after_value_set(node, param, artifact)

    data = node.parameter_output_values.get("output_annotation_data")
    assert isinstance(data, dict)
    assert data["image_url"] == "http://example.com/img.png"
    assert data["canvas_width"] == 1920
    assert data["canvas_height"] == 1080

    # set_parameter_value must never be called for output_annotation_data.
    for call in node.set_parameter_value.call_args_list:
        assert call.args[0] != "output_annotation_data"


def test_after_value_set_input_annotation_data_locked():
    node = _make_node()
    node._effective_annotations.return_value = []

    param = MagicMock()
    param.name = "input_annotation_data"
    value = {
        "annotations": [{"id": "a1", "type": "rect"}],
        "layers": [],
        "layer_stack": [],
    }

    AnnotateImage.after_value_set(node, param, value)

    data = node.parameter_output_values.get("output_annotation_data")
    assert isinstance(data, dict)
    assert "imported_annotations" in data

    for call in node.set_parameter_value.call_args_list:
        assert call.args[0] != "output_annotation_data"
