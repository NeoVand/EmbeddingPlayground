"""
Export all-MiniLM-L6-v2 to ONNX with every internal exposed as a named
graph output: 7 hidden states (embeddings output + 6 blocks) and 6
attention tensors (post-softmax, [1, 12, seq, seq]).

transformers.js surfaces every named ONNX output automatically, so the
browser gets the full picture in one forward pass. attn_implementation
must be "eager" — SDPA never materializes attention weights.
"""

import json
import os
import sys

import torch
from transformers import AutoConfig, AutoModel

OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "anatomy_out"
MODEL_ID = "sentence-transformers/all-MiniLM-L6-v2"


class AnatomyWrapper(torch.nn.Module):
    def __init__(self, model: torch.nn.Module):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask, token_type_ids):
        out = self.model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
            output_hidden_states=True,
            output_attentions=True,
            return_dict=True,
        )
        # Flatten tuples into a stable, named list.
        return (out.last_hidden_state, *out.hidden_states, *out.attentions)


def main() -> None:
    os.makedirs(os.path.join(OUT_DIR, "onnx"), exist_ok=True)

    model = AutoModel.from_pretrained(MODEL_ID, attn_implementation="eager")
    model.eval()
    wrapper = AnatomyWrapper(model)

    n_layers = model.config.num_hidden_layers  # 6
    seq = 12
    dummy = (
        torch.randint(0, 1000, (1, seq), dtype=torch.long),
        torch.ones(1, seq, dtype=torch.long),
        torch.zeros(1, seq, dtype=torch.long),
    )

    output_names = (
        ["last_hidden_state"]
        + [f"hidden_{i}" for i in range(n_layers + 1)]
        + [f"attn_{i}" for i in range(n_layers)]
    )
    dyn = {0: "batch_size", 1: "sequence_length"}
    dynamic_axes = {name: dyn for name in ["input_ids", "attention_mask", "token_type_ids"]}
    for name in output_names:
        if name.startswith("attn_"):
            dynamic_axes[name] = {0: "batch_size", 2: "sequence_length", 3: "sequence_length"}
        else:
            dynamic_axes[name] = {0: "batch_size", 1: "sequence_length"}

    fp32_path = os.path.join(OUT_DIR, "onnx", "model.onnx")
    torch.onnx.export(
        wrapper,
        dummy,
        fp32_path,
        input_names=["input_ids", "attention_mask", "token_type_ids"],
        output_names=output_names,
        dynamic_axes=dynamic_axes,
        opset_version=14,
        do_constant_folding=True,
        dynamo=False,
    )
    print("fp32 exported:", os.path.getsize(fp32_path) / 1e6, "MB")

    # Dynamic int8 quantization (weights only — activations, incl. the
    # attention outputs, stay fp32, so the visualized maps are exact).
    from onnxruntime.quantization import QuantType, quantize_dynamic

    q_path = os.path.join(OUT_DIR, "onnx", "model_quantized.onnx")
    quantize_dynamic(fp32_path, q_path, weight_type=QuantType.QInt8)
    print("int8 exported:", os.path.getsize(q_path) / 1e6, "MB")

    # transformers.js needs config.json next to onnx/.
    config = AutoConfig.from_pretrained(MODEL_ID)
    with open(os.path.join(OUT_DIR, "config.json"), "w") as f:
        json.dump(config.to_dict(), f, indent=1)

    # Parity fixture: known input → reference slices, checked in-browser.
    with torch.no_grad():
        ref = wrapper(*dummy)
    # Output order: [last_hidden, hidden_0..hidden_6, attn_0..attn_5]
    fixture = {
        "input_ids": dummy[0][0].tolist(),
        "last_hidden_state_row0": [round(x, 5) for x in ref[0][0, 0, :8].tolist()],
        "attn_0_head0_row0": [round(x, 5) for x in ref[8][0, 0, 0, :seq].tolist()],
        "hidden_6_row0": [round(x, 5) for x in ref[7][0, 0, :8].tolist()],
    }
    with open(os.path.join(OUT_DIR, "parity.json"), "w") as f:
        json.dump(fixture, f, indent=1)
    print("done")


if __name__ == "__main__":
    main()
