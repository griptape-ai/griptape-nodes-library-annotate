"""Tests for the validation DetectionsToAnnotations runs before the node does."""

from unittest.mock import MagicMock

from griptape_nodes.exe_types.core_types import NodeError

from griptape_nodes_library_annotate.detections_to_annotations import DetectionsToAnnotations


def _validate(detections: object) -> list[Exception]:
    node = MagicMock(spec=DetectionsToAnnotations)
    node.get_parameter_value.return_value = detections
    return DetectionsToAnnotations.validate_before_node_run(node)


def test_missing_detections_is_a_node_error_naming_the_parameter() -> None:
    errors = _validate(None)

    assert len(errors) == 1
    assert isinstance(errors[0], NodeError)
    assert str(errors[0]) == "'Detections' is required. Connect an upstream detector's output to it."


def test_connected_detections_pass_validation() -> None:
    assert _validate([]) == []
