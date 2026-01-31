# 系统设计 V2：AI导演助手与资产化工作流

## 1. 概述 (Overview)
V2版本致力于打造一个“AI导演助手”，核心在于**定角（Finalize Role）**机制与**所见即所得的剧幕编排（Act Orchestration）**。用户不再是单纯的生成者，而是通过拖拽资产、编排戏份来导演视频。

## 2. 核心概念 (Core Concepts)

### 2.1 定角与定景 (Cast & Set Finalization)
*   **概念转变**: 从单纯的“Tag/Anchor”转变为“定角/锁定”状态。
*   **流程**:
    1.  **选拔**: 用户在画廊中生成多张图片。
    2.  **定角 (Finalize)**: 用户点击“定角”按钮，选择一张或多张满意的图片。
    3.  **锁定 (Lock)**: 确认后，角色进入“锁定状态”。
        *   **不可变**: 此时不可修改角色Prompt，不可生成新图，不可删除已选定图片。
        *   **资产化**: 系统将选定的图片路径及当前角色设定快照写入数据库。
    4.  **解除 (Unfinalize)**: 只有点击“解除定角”，才能恢复编辑和生成功能。
*   **场景**: 同理，场景也通过此流程进行“定景”。

### 2.2 剧幕工作台 (Act Workbench)
*   **交互模式**: 就像导演在白板上排戏。
*   **核心逻辑**: 资产驱动。只有“定角/定景”后的资产才能进入工作台。

## 3. 详细功能设计 (Detailed Design)

### 3.1 资产管理 UI (Asset Management)
*   **Character/Scene Tab**:
    *   新增显眼的 **[定角/定景]** 按钮。
    *   定角状态下，界面只展示选定的资产图，隐藏生成控件，并在显眼处显示“已定角”标识及 **[解除定角]** 按钮。

### 3.2 剧幕工作台 (Act Page - 重构)
*   **布局 (Layout)**:
    *   **左侧/底部 (Assets Dock)**: 显示所有已定角/定景的资产。
        *   表现为圆角标签 (Chip/Card)，包含缩略图和ID/名称。
        *   支持拖拽操作。
    *   **右侧 (Script Reference)**: 
        *   展示剧本原文/分析结果作为参考。
        *   高亮显示当前识别到的剧幕 (Act) 内容。
    *   **中部 (Stage/Workspace)**: 核心编排区。
        *   **拖拽区**: 用户将 1张场景卡片 + N张角色卡片 拖入此区域，确立本场戏的“班底”。
        *   **对话/动作编辑器**: 
            *   基于角色的对话框。只有拖入的角色才能分配台词。
            *   UI示例：[头像] 角色A: "台词内容..." [动作描述]。
    *   **右上 (Controls)**: 生成预览(关键帧)、生成视频。

### 3.3 剧本分析与引用 (Analysis & Reference)
*   **逻辑调整**: 后端分析不再强求“一步到位”填充所有字段。
*   **结构识别 (Structure Detection)**:
    *   **Act/Scene**: 基于关键词（如 "Scene 1", "Act 1", "Chapter 1"）进行物理分割。
    *   **Scene Description**: 语义分析，用于推荐场景资产。
*   **参考优先**: 分析结果主要展示在右侧侧边栏，供用户参考或“一键引用”到工作台，而不是直接覆盖用户的编辑。

### 3.4 视频生成管线 (Generation Pipeline)
视频生成分为两步走，确保可控性。

*   **Step 1: 关键帧合成 (Keyframe Composition)**
    *   **Input**: 选定的场景图 + 选定的角色图(s) + 布局/Pose信息。
    *   **Process**: 使用图像融合/Compositing工作流 (TODO: 需研究具体实现)。
    *   **Output**: 一张展示了人物在场景中站位/姿态的“关键帧图片”。
    *   **User Action**: 用户确认关键帧满意后，进入下一步。

*   **Step 2: 视频生成 (Image-to-Video)**
    *   **Input**: 关键帧图片 (Start Frame) + 文本Prompt (根据剧幕构建)
    *   **Model**: LTX-Video (使用 `video_ltx2_i2v.json`)。
    *   **Output**: 最终视频片段。

## 4. 任务清单 (Action Items)

### Phase 1: 资产定角机制 (Asset Finalization)
1.  [Backend] DB Update: Add `is_finalized`, `finalized_images` (json) to Character/Scene.Snapshot profile data.
2.  [Backend] API: `finalize_asset`, `unfinalize_asset`.
3.  [Frontend] Implement Selection Mode & Lock UI in Character/Scene galleries.

### Phase 2: 剧幕工作台 (Act Workbench UI)
1.  [Frontend] Pick a Drag-and-Drop library (e.g., `dnd-kit`).
2.  [Frontend] Build Assets Dock (Draggable Chips).
3.  [Frontend] Build Stage (Drop Zone & Character-aware Dialogue Editors).
4.  [Frontend] Build Script Reference Sidebar.

### Phase 3: 生成管线 (Generation)
1.  [Backend] Implement Act structure logic (Keyword-based).
2.  [Backend] Integrate `video_ltx2_i2v.json`.
3.  [Research] 调研多图融合生成关键帧的工作流 (Character + Scene composition).
