# Act 页面设计文档 (Design Document)

## 2. 设计目标 (Design Goals)
- **左侧 (Left)**: 资源库 (角色、场景)。
- **右侧 (Right)**: 包含舞台 (Stage)、视频预览 (Video Preview) 和台词 (Lines)。
- *内部结构*: 上半部分是“舞台”和“视频预览”左右并排，下半部分是“台词”区域。
- **消除空白**: 采用全屏填充的三栏布局，确保每个区域都有明确的用途和填充逻辑。
- **逻辑分区**: 将“资源”、“编辑”、“预览”明确分开。
- **拖拽体验**: 优化 DnD (Drag and Drop) 区域，避免层级遮挡。

## 3. 新版布局方案 (Proposed Layout)
采用经典的 **三栏式布局 (3-Column Layout)**，从左到右依次为：

### A. 左侧栏：资源库 (Assets Library)
- **宽度**: 固定 (例如 `w-80` / `320px`)。
- **功能**: 展示可用的角色 (Characters) 和场景 (Scenes)。
- **交互**: 作为拖拽源 (Drag Source)，用户可以从中拖拽角色到“台词区域”或拖拽场景到“舞台区域”。
- **组件结构**:
    - Header: Cast & Sets Library
    - List: Characters Grid, Scenes List

### B. 中间栏：编排工作台 (Workbench)
- **宽度**: 自适应 (Flex grow)，占据主要屏幕空间。
- **功能**: 核心编辑区域。
- **内部结构 (垂直分布)**:
    1.  **舞台 (Stage) [上左部分]**:
        -   用于可视化展示当前场景和角色站位。
        -   作为 Drop Target，接收“场景”卡片来切换背景。
        -   包含“清空舞台”、“生成关键帧”等编辑操作。
    2.  **台词/时间轴 (Script/Timeline) [下半部分]**:
        -   用于编排对话和动作 (Beats)。
        -   作为 Drop Target，接收“角色”卡片来添加新的对话行 (Beat)。
        -   高度固定或可拖动调整 (建议默认 `h-1/2` 或 `flex-1` 与舞台平分)。

### C. 右侧栏：预览与导出  [上右部分] (Preview & Export)
- **宽度**: 固定 (例如 `w-96` / `380px`)。
- **功能**: 展示最终结果和导出选项。
- **组件结构**:
    - **视频预览 (Video Player)**: 位于顶部，保持 16:9 比例。
    - **生成控制 (Generate Controls)**: “生成视频”、“清空 Act”等按钮。
    - **详细设置 (Settings)**: 导出格式、分辨率等面板 (预留)。

## 4. 交互逻辑 (Interaction Logic)
1.  **拖入场景 (Scene)**:
    -   拖拽 `Scene` 卡片 -> 放入 `Stage` 区域 -> 更新 `activeStageSceneId`。
2.  **拖入角色 (Character)**:
    -   拖拽 `Character` 卡片 -> 放入 `Lines` 区域 -> 添加新的 `Beat`。
3.  **生成视频**:
    -   点击右侧栏的“Generate Video” -> 触发后端生成任务。

## 5. 技术实现 (Implementation Details)
- 使用 Tailwind CSS 的 Flexbox 进行布局：
    ```jsx
    <div className="flex h-full overflow-hidden">
      <aside className="w-80 border-r">{/* Left */}</aside>
      <main className="flex-1 flex flex-col border-r">{/* Center (Stage + Lines) */}</main>
      <aside className="w-96">{/* Right (Video) */}</aside>
    </div>
    ```
- `dnd-kit` 上下文 (Context) 包裹最外层，确保拖拽层 (Overlay) 能覆盖所有区域。
