# Xinyue 受控 ComfyUI 网关

这个可选网关只把管理员挂载的 ComfyUI 工作流暴露给 Xinyue Local Worker 协议。用户不能提交工作流 JSON、节点 ID 或任意参数。

每个 `/workflows/*.json` 必须包含：

```json
{
  "id": "product-v1",
  "name": "商品视觉工作流",
  "workflow": { "6": { "class_type": "CLIPTextEncode", "inputs": { "text": "" } } },
  "bindings": {
    "prompt": { "node": "6", "field": "text" },
    "negativePrompt": { "node": "7", "field": "text" },
    "width": { "node": "5", "field": "width" },
    "height": { "node": "5", "field": "height" },
    "seed": { "node": "3", "field": "seed" },
    "image": { "node": "10", "field": "image" }
  },
  "outputNodes": ["9"],
  "limits": { "minDimension": 256, "maxDimension": 2048 }
}
```

上面的示例只说明清单结构，不是一份可运行的完整工作流。请从运维人员自己的 ComfyUI 导出 API 格式工作流，逐项核对节点和模型，再以只读方式挂载。更换工作流文件后需要重启网关。
