# ComfyUI API Design

## 图片生成流程（已实现）
 - 用户输入文本（已实现） -> 后端llm分析角色形象，场景（已实现） -> 前端展示与编辑（已实现）
 待实现：根据用户编辑好的角色信息，场景信息，生成ComfyUI的prompt，根据prompt和工作流模板，生成ComfyUI的workflow，执行workflow，生成图片，展示图片。示例脚本在archive目录中。

## 按需生图
 - 目前已经打通由页面调用后端comfyui生图的流程，接下来要按需生成。
 - 