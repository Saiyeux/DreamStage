# Act 拖拽功能 - 待办事项

## UI 实现 (ActContent.tsx)
- [ ] **Stage 区域修复**
  - [ ] 实现角色缩略图在 Stage 上的叠加显示 (Overlay)
  - [ ] 修复 `multi_replace` 失败的问题
- [ ] **底部区域重构**
  - [ ] 左侧：新增 **Description Panel** (角色位姿描述)
    - [ ] 显示 Stage 上的角色列表
    - [ ] 提供 Position / Action / Expression 输入框
    - [ ] 数据绑定到 Store
  - [ ] 右侧：移动 **Dialogue Lines** 面板
    - [ ] 从左侧移至右侧
    - [ ] 移除原有的 Script Preview
- [ ] **Generate 按钮逻辑**
  - [ ] 实现点击 Generate 时的控制台汇总输出 (Scene + Characters + Prompts)

## 后端实现
- [ ] **Stub 接口**
  - [ ] 在 `backend/app/api/generation.py` 中添加 `generate_act_preview` 占位接口

## 验证
- [ ] 验证角色拖入 Stage
- [ ] 验证描述信息保存
- [ ] 验证 Generate 输出
