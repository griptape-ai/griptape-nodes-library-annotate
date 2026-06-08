---
name: griptape-node-dev
description: Patterns for developing Python nodes in a Griptape Nodes library — base classes, parameter types, artifact handling, file output, lifecycle callbacks, and manifest registration. Load when adding or modifying nodes in this library.
---

# Griptape Node Development

Reference: [Comprehensive Guide](https://docs.griptapenodes.com/en/stable/developing_nodes/comprehensive_guide/index.md)

---

## Base Classes — When to Use Which

| Class | Use when |
|---|---|
| `DataNode` | Synchronous data processing (most nodes, including `AnnotateImage`) |
| `ControlNode` | Async/long-running work, external APIs, polling — needs `AsyncResult` |
| `SuccessFailureNode` | Same as ControlNode + you want separate success/failure outputs with status reporting |

> The annotate library currently uses `DataNode`. Add a `ControlNode` or `SuccessFailureNode` only if the new node calls an external API or runs heavy inference.

---

## Parameter Modes

```python
from griptape_nodes.exe_types.core_types import Parameter, ParameterMode

Parameter(
    name="my_param",
    allowed_modes={ParameterMode.INPUT, ParameterMode.PROPERTY},  # wire + UI editable
    # INPUT only: {ParameterMode.INPUT}
    # PROPERTY only (no wire): {ParameterMode.PROPERTY}
    # OUTPUT only: {ParameterMode.OUTPUT}  — also set output_type=
)
```

---

## Parameter Helpers — Prefer These Over Raw Parameter

```python
from griptape_nodes.exe_types.param_types.parameter_image import ParameterImage
from griptape_nodes.exe_types.param_types.parameter_audio import ParameterAudio
from griptape_nodes.exe_types.param_types.parameter_video import ParameterVideo
```

**Always use `ParameterImage` for images** — it sets correct artifact types and enables file browser/webcam UI automatically.

```python
# Input image
self.add_parameter(ParameterImage(
    name="input_image",
    tooltip="Source image",
    allow_output=False,
))

# Output image
self.add_parameter(ParameterImage(
    name="output_image",
    tooltip="Result image",
    allow_input=False,
    allow_property=False,
))
```

**Other helpers:**

| Helper | Enforces type | Use for |
|---|---|---|
| `ParameterString` | `"str"` | Text, prompts, labels |
| `ParameterBool` | `"bool"` | Toggles |
| `ParameterInt` | `"int"` | Integers |
| `ParameterFloat` | `"float"` | Floats |
| `ParameterDict` | `"dict"` | Dict data |
| `ParameterAudio` | `"AudioUrlArtifact"` | Audio files |
| `ParameterVideo` | `"VideoUrlArtifact"` | Video files |

---

## Traits — Options, Slider, ColorPicker

```python
from griptape_nodes.traits.options import Options
from griptape_nodes.traits.slider import Slider

# Dropdown
param = Parameter(name="mode", type="str", ...)
param.add_trait(Options(choices=["fast", "quality", "best"]))
self.add_parameter(param)

# Slider
param = Parameter(name="strength", type="float", default_value=0.5, ...)
param.add_trait(Slider(min_val=0.0, max_val=1.0))
self.add_parameter(param)
```

---

## Artifact Types — Reading Media Inputs

**Prefer URL artifact variants** — they hold a reference rather than raw bytes, avoiding WebSocket saturation.

```python
from griptape.artifacts import ImageArtifact, ImageUrlArtifact
from griptape_nodes.files.file import File

image_artifact = self.parameter_values.get("image")
if not isinstance(image_artifact, (ImageArtifact, ImageUrlArtifact)):
    raise ValueError("image is required")
if isinstance(image_artifact, ImageUrlArtifact):
    image_bytes = File(image_artifact.value).read_bytes()
else:
    image_bytes = image_artifact.value  # ImageArtifact.value is already bytes
```

The `isinstance` branch is also required by pyright — `.get()` returns `Any | None`, and narrowing it avoids type errors.

Audio follows the same pattern (`AudioArtifact` / `AudioUrlArtifact`). Video has no `VideoArtifact` — only `VideoUrlArtifact`, so no branch is needed.

---

## File Output — ProjectFileParameter (Replaces StaticFilesManager)

**New pattern** — use for any node that writes a file output:

```python
from griptape_nodes.exe_types.param_components.project_file_parameter import ProjectFileParameter
from griptape.artifacts import ImageUrlArtifact

# In __init__:
self._output_file = ProjectFileParameter(
    node=self,
    name="output_file",
    default_filename="output.png",
)
self._output_file.add_parameter()

# In process():
dest = self._output_file.build_file()
saved = dest.write_bytes(image_bytes)  # ← capture return value (macros resolve on write)
self.parameter_output_values["output_image"] = ImageUrlArtifact(saved.location)
```

> **Common mistake:** `dest.location` before `write_bytes()` — macros like `{file_extension}` only resolve when the file is actually written.

**Old pattern (deprecated — still used in `annotate_image.py`):**
```python
url = GriptapeNodes.StaticFilesManager().save_static_file(image_bytes, filename)
```

This still works but new nodes should use `ProjectFileParameter`.

---

## Writing Media Outputs

Never embed large raw bytes directly in an artifact — use URL artifacts:

```python
from griptape.artifacts import ImageUrlArtifact
# Or AudioUrlArtifact, VideoUrlArtifact

self.parameter_output_values["output_image"] = ImageUrlArtifact(saved.location)
```

Use `output_type="ImageUrlArtifact"` on the output `Parameter`. Never use non-URL variants (`ImageArtifact`, `AudioArtifact`) for node outputs.

---

## Lifecycle Callbacks

### `after_value_set` — React to Parameter Changes

```python
def after_value_set(self, parameter: Parameter, value: Any) -> None:
    if parameter.name == "mode":
        if value == "advanced":
            self.show_parameter_by_name("advanced_settings")
        else:
            self.hide_parameter_by_name("advanced_settings")
    return super().after_value_set(parameter, value)
```

### `validate_before_node_run` — Pre-run Validation

```python
def validate_before_node_run(self) -> list[Exception] | None:
    errors = []
    if not self.parameter_values.get("required_input"):
        errors.append(ValueError("required_input is required"))
    return errors if errors else None
```

### Helper Methods

- `self.get_parameter_value(name)` — retrieve a value
- `self.set_parameter_value(name, value)` — set a value
- `self.hide_parameter_by_name(name)` / `self.show_parameter_by_name(name)` — toggle visibility
- `self.publish_update_to_parameter(name, value)` — push a real-time UI update

---

## SuccessFailureNode Pattern

Use when the node operation can meaningfully fail and you want success/failure output ports:

```python
from griptape_nodes.exe_types.node_types import SuccessFailureNode

class MyNode(SuccessFailureNode):
    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        # ... add parameters ...

        # MUST be the last call in __init__
        self._create_status_parameters()

    def process(self) -> None:
        self._clear_execution_status()
        try:
            result = do_work()
            self.parameter_output_values["output"] = result
            self._set_status_results(was_successful=True, result_details="Done")
        except Exception as e:
            self._set_status_results(was_successful=False, result_details=f"FAILURE: {e}")
            self._handle_failure_exception(e)
```

> `_create_status_parameters()` **must be the last call** in `__init__` — it places the status outputs after all other parameters in the UI. Calling it mid-`__init__` pushes status before other outputs.

---

## AsyncResult — Long-Running Work

Use `ControlNode` or `SuccessFailureNode` + yield pattern when work blocks the main thread:

```python
from griptape_nodes.exe_types.node_types import AsyncResult, SuccessFailureNode

class InferenceNode(SuccessFailureNode):
    def process(self) -> AsyncResult[None]:
        yield lambda: self._run_inference()

    def _run_inference(self) -> None:
        # Called in a background thread
        result = heavy_computation()
        self.parameter_output_values["output"] = result
```

`DataNode.process()` is synchronous (`-> None`). `ControlNode`/`SuccessFailureNode` use `-> AsyncResult[None]` with a yield.

---

## Secrets

```python
from griptape_nodes.retained_mode.griptape_nodes import GriptapeNodes

api_key = GriptapeNodes.SecretsManager().get_secret("MY_API_KEY")
if not api_key:
    raise ValueError("MY_API_KEY is not configured")
```

Never hardcode secrets. Register secret names in `griptape-nodes-library.json` under `settings[].contents.secrets_to_register`.

---

## Manifest Registration

After creating a new node file, add it to `griptape_nodes_library_annotate/griptape-nodes-library.json`:

```json
{
  "class_name": "MyNode",
  "file_path": "my_node.py",
  "metadata": {
    "category": "annotate",
    "description": "One-line description",
    "display_name": "My Node"
  }
}
```

`file_path` is relative to the package directory (same directory as `griptape-nodes-library.json`).

---

## Lint and Format

```bash
make check   # ruff + pyright
make fix     # ruff auto-fix
```

Common issues:
- **E741**: `l` is an ambiguous variable name — use `layer` in list comprehensions (already documented in `annotate-image-node` skill)
- Unused imports — remove them
- Missing return type annotations on public methods
- `isinstance` narrowing required before accessing `.value` on artifact parameters

---

## Dynamic Parameter Visibility

```python
def __init__(self, **kwargs) -> None:
    super().__init__(**kwargs)
    self.add_parameter(ParameterImage(name="mask", tooltip="Optional mask", allow_output=False))
    self.hide_parameter_by_name("mask")  # hidden by default

def after_value_set(self, parameter: Parameter, value: Any) -> None:
    if parameter.name == "mode":
        if value == "inpaint":
            self.show_parameter_by_name("mask")
        else:
            self.hide_parameter_by_name("mask")
            self.set_parameter_value("mask", None)
    return super().after_value_set(parameter, value)
```
