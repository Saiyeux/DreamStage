# 故障汇总清单

## ✅ 已修复：生成按钮跳转问题
**问题描述**：点击 角色库 -> 生成角色图 会跳转至老页面

**修复方案**：
- 修改 `ScriptAnalysisPage.tsx` 中的 CharactersContent 组件
- "生成角色图"按钮现在直接调用 `generationApi.generateCharacterImages()` API
- 添加任务状态轮询，显示生成进度
- 生成完成后自动刷新角色数据，显示新生成的图片

**涉及文件**：
- `frontend/src/pages/ScriptAnalysisPage.tsx`

**当前行为**：
1. 点击"生成角色图"按钮
2. 调用后端 API 为当前选中的角色生成 front 类型图片
3. 显示进度条和状态消息
4. 生成完成后自动刷新，在右侧"生成内容"区域显示图片
