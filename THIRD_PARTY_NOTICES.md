# 第三方声明

本文件只记录已确认允许商业使用和二次开发的第三方代码、组件或媒体资源。使用这些项目的代码或资源时，请同时保留其原始版权和许可证文本。模型权重、字体、图片和数据集可能有独立条款，需要单独核对。

下方 MIT 许可证原文保持英文，以便与上游声明一致。

| 项目 | 来源 | 许可证 | 当前用途 |
| --- | --- | --- | --- |
| Art Design Pro | https://github.com/Daymychen/art-design-pro | MIT | 管理后台基础组件与布局 |
| Lobe Icons | https://github.com/lobehub/lobe-icons | MIT | `public/assets/model-logos/` 中的模型厂商 SVG 图标来源 |
| Bloub | https://github.com/jeremy-prt/bloub | MIT | `src/assistant-avatar/` 头像引擎的上游来源，经移植和改造 |
| OpenTu | https://github.com/ljquan/opentu | MIT | 仅作画布交互与 Skill 选择器组织方式参考，未复制源码与技能提示词 |
| Infinite Canvas | https://github.com/basketikun/infinite-canvas | MIT | 仅作画布交互参考，未复制源码 |
| Aivory | https://github.com/hjxwz123/Aivory | Apache-2.0 | 仅作自托管 AI 工作台、模型管理与部署架构参考，未声明复制源码 |
| rembg | https://github.com/danielgatis/rembg | MIT | 可选本地图片工具 Worker 依赖 |
| IOPaint | https://github.com/Sanster/IOPaint | Apache-2.0 | 可选图片修复 Worker 依赖 |
| Real-ESRGAN | https://github.com/xinntao/Real-ESRGAN | BSD-3-Clause | 可选图片放大 Worker 依赖 |
| Coverr | https://coverr.co/ | Coverr License | 视频灵感页中的预览素材，保留来源记录 |

## 使用说明

- MIT、Apache-2.0 和 BSD-3-Clause 代码允许商业使用和修改，但分发时必须保留对应版权和许可证声明。
- Worker 的模型文件、PyTorch/BasicSR 等传递依赖不随主仓库提交，部署者应按所选模型和依赖的许可证执行。
- 未在本文件列出的项目、图片提示词数据源、外部服务和品牌仅作为功能观察对象，不代表获得代码、数据或商标授权。
- 更完整的技术依赖、功能用途、内容来源与参考边界见 [`docs/OPEN_SOURCE_AND_REFERENCES.md`](docs/OPEN_SOURCE_AND_REFERENCES.md)。

## Bloub MIT License

The avatar engine under `src/assistant-avatar/` is adapted from [jeremy-prt/bloub](https://github.com/jeremy-prt/bloub).

```text
MIT License

Copyright (c) 2026 Jérémy Perret

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The upstream project states that it recreates the visual behaviour of the x.ai bot avatar. The MIT license covers its code, not the x.ai/Grok design or trademarks. Xinyue AI is not affiliated with or endorsed by x.ai.

## Lobe Icons MIT License

The model logo files under `public/assets/model-logos/` are sourced from [lobehub/lobe-icons](https://github.com/lobehub/lobe-icons).

```text
MIT License

Copyright (c) 2023 LobeHub

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The MIT license covers the icon files supplied by Lobe Icons. Product names and logos remain trademarks of their respective owners; inclusion does not imply endorsement.
