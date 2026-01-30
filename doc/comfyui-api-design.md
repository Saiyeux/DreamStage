# ComfyUI API Design

## 图片生成流程
 - 用户输入文本（已实现） -> 后端llm分析角色形象，场景（已实现） -> 前端展示与编辑（已实现）
 待实现：根据用户编辑好的角色信息，场景信息，生成ComfyUI的prompt，根据prompt和工作流模板，生成ComfyUI的workflow，执行workflow，生成图片，展示图片。示例脚本在archive目录中。

## 视频生成流程
 - 在visual description和dialog面板下增加一个角色选择面板，用户选择角色后，根据已生成的角色和场景信息，生成预览图。预览图在根据场景信息生成视频。