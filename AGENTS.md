# HttpMocker AI 规范

## 前端交互

- 全局禁止 `Space` 键触发页面滚动。除文本输入区、`textarea`、`contenteditable`、代码编辑器等明确编辑场景外，`Space` 应被拦截。
- 按钮、Tab、`role="button"`、`role="tab"` 等可点击控件不得响应 `Space` 产生点击、选中、框选、焦点描边或其它视觉高亮。需要键盘触发时，优先使用 `Enter` 或显式快捷键。
- 新增或调整可聚焦控件时，必须检查 `Space` 行为，避免浏览器默认滚动和控件默认激活导致界面闪动或出现丑陋焦点框。
