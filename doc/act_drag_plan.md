# Act 拖拽功能实现计划

根据 [act_drag.md](file:///Users/saiyeux/Repos/ScriptConverter/doc/act_drag.md) 设计文档，本计划实现 Act 标签页的拖拽交互功能，用于镜头设计。用户将角色、场景拖入 Stage 区域后，配合描述窗口输入位姿信息，最终汇总为 image edit 工作流的输入。

## 参考布局

![act布局设计图](/Users/saiyeux/Repos/ScriptConverter/shots/act.png)

新布局分为：
- **左侧栏**：Act 列表 + 角色 (char) / 场景 (scene) 素材库
- **右上**：Stage（场景预览 + 角色缩略图叠加）| Video（视频输出）
- **右下**：Description（角色位姿描述窗口，**新增**）| Line（对话条目）

---

## 现状分析

### 已有能力
| 功能 | 状态 | 位置 |
|---|---|---|
| 场景拖拽至 Stage | ✅ 已实现 | [ActContent.tsx](file:///Users/saiyeux/Repos/ScriptConverter/frontend/src/components/ActContent.tsx#L177-L180) |
| 角色拖至 Dialogue Lines 新建条目 | ✅ 已实现 | [ActContent.tsx](file:///Users/saiyeux/Repos/ScriptConverter/frontend/src/components/ActContent.tsx#L190-L198) |
| 角色拖至已有 Line 替换角色 | ✅ 已实现 | [ActContent.tsx](file:///Users/saiyeux/Repos/ScriptConverter/frontend/src/components/ActContent.tsx#L183-L188) |
| Act / DialogueLine CRUD | ✅ 已实现 | [projectStore.ts](file:///Users/saiyeux/Repos/ScriptConverter/frontend/src/stores/projectStore.ts#L209-L255) |

### 待实现

1. **角色拖至 Stage → 显示缩略图**：目前 Stage 只接收场景图，还不支持角色叠加显示
2. **角色位姿描述窗口 (Description)**：全新面板，设计文档要求拖入角色后，对应 tab 上出现「位置 / 动作 / 神态」三个描述字段
3. **布局重制**：右下区域从「Dialogue Lines + Script Preview」改为「Description + Line」
4. **Generate 汇总输出**：点击 Generate 按钮时，汇总角色图、场景图、角色描述提示词，输出到终端（暂不调用工作流）

---

## 一、数据模型变更

### 1.1 前端类型扩展

#### [MODIFY] [index.ts](file:///Users/saiyeux/Repos/ScriptConverter/frontend/src/types/index.ts)

新增 `ActStageCharacter` 类型，表示拖入 Stage 的角色及其位姿描述：

```typescript
// 角色在 Stage 上的位姿描述
export interface ActStageCharacter {
  characterId: string
  position: string    // 位置，如 "画面左侧"、"前景中央"
  action: string      // 动作，如 "坐在椅子上"、"面朝窗户站立"
  expression: string  // 神态，如 "微笑"、"若有所思"
}
```

扩展 `Act` 接口，添加 Stage 角色列表：

```diff
 export interface Act {
   id: string
   projectId: string
   name: string
   stageSceneId: string | null
+  stageCharacters: ActStageCharacter[]  // 拖入 Stage 的角色列表
   dialogueLines: ActDialogueLine[]
 }
```

---

### 1.2 Store 扩展

#### [MODIFY] [projectStore.ts](file:///Users/saiyeux/Repos/ScriptConverter/frontend/src/stores/projectStore.ts)

新增 Stage 角色管理的 Actions：

```typescript
// 新增 Actions
addStageCharacter: (actId: string, char: ActStageCharacter) => void
updateStageCharacter: (actId: string, characterId: string, updates: Partial<ActStageCharacter>) => void
removeStageCharacter: (actId: string, characterId: string) => void
```

确保 `addAct` 默认包含 `stageCharacters: []`。

---

## 二、UI 布局重制

#### [MODIFY] [ActContent.tsx](file:///Users/saiyeux/Repos/ScriptConverter/frontend/src/components/ActContent.tsx)

### 2.1 右下区域改造

当前布局（右下）：
```
[ Dialogue Lines ] [ Script Preview ]
```

改为：
```
[ Description (角色位姿描述) ] [ Dialogue Lines ]
```

- 移除 Script Preview 面板
- 新增 Description 面板，放在左侧
- Dialogue Lines 移到右侧

### 2.2 Stage 区域增强 — 角色缩略图拖入

- Stage 的 droppable 同时接受 `scene` 和 `character` 类型
- 拖入 `character` 时：
  - 调用 `addStageCharacter` 添加角色（默认空描述）
  - 在 Stage 场景图上叠加角色缩略图（小圆形头像，绝对定位）
- 角色缩略图可点击删除（hover 显示 ✕ 按钮）
- 同一角色不可重复拖入（已存在时禁用/提示）

### 2.3 Description 面板（新增）

Description 面板展示当前 Act 中所有 Stage 角色的位姿描述卡片：

```
┌─ Description ──────────────────────┐
│  ┌─ [角色A头像] 角色A名 ────────┐  │
│  │ 位置:  [________输入框______] │  │
│  │ 动作:  [________输入框______] │  │
│  │ 神态:  [________输入框______] │  │
│  └─────────────────────────────┘  │
│  ┌─ [角色B头像] 角色B名 ────────┐  │
│  │ ...                          │  │
│  └─────────────────────────────┘  │
│                                    │
│  (空态: "拖入角色到 Stage 以配置")  │
└────────────────────────────────────┘
```

- 每张卡片对应一个 `ActStageCharacter`
- 三个字段 (`position` / `action` / `expression`) 各一个输入框
- 输入变化时实时调用 `updateStageCharacter`
- 卡片右上角有删除按钮，同时移除 Stage 上的缩略图

### 2.4 Generate 按钮数据汇总

点击 Stage 区域的 `✨ Generate` 按钮时：

1. 收集当前 Act 的以下信息：
   - **场景图**：`stageSceneId` 对应的场景图路径
   - **角色图**：`stageCharacters` 中每个角色的主图路径
   - **角色描述**：每个角色的 `position` / `action` / `expression` 拼接为提示词
2. 格式化输出到浏览器控制台（`console.log`），格式示例：
   ```
   === Generate Summary ===
   Scene: /path/to/scene.png
   Characters:
     - 角色A: image=/path/to/charA.png, prompt="位置:前景左侧, 动作:站立, 神态:微笑"
     - 角色B: image=/path/to/charB.png, prompt="位置:背景右侧, 动作:坐着, 神态:沉思"
   ```
3. 暂不调用工作流，后续再接入

---

## 三、变更文件汇总

| 文件 | 操作 | 说明 |
|---|---|---|
| [index.ts](file:///Users/saiyeux/Repos/ScriptConverter/frontend/src/types/index.ts) | MODIFY | 新增 `ActStageCharacter` 类型，扩展 `Act` 接口 |
| [projectStore.ts](file:///Users/saiyeux/Repos/ScriptConverter/frontend/src/stores/projectStore.ts) | MODIFY | 新增 `addStageCharacter` / `updateStageCharacter` / `removeStageCharacter` |
| [ActContent.tsx](file:///Users/saiyeux/Repos/ScriptConverter/frontend/src/components/ActContent.tsx) | MODIFY | 布局重制 + Stage 角色拖入 + Description 面板 + Generate 汇总 |

---

## 五、进度状态

- [x] **数据模型变更**：`ActStageCharacter` 类型及 Store Actions 已完成。
- [x] **Store 扩展**：`addStageCharacter` 等 Action 已实现。
- [ ] **UI 重制**：进行中，剩余工作见 [todo.md](todo.md)。
- [ ] **后端接口**：待开始。

## 四、验证计划

### 手动验证（浏览器测试）

> [!IMPORTANT]
> 此项目无前端自动化测试，所有验证通过浏览器手动操作完成。

1. **启动开发服务器**：`cd frontend && npm run dev`
2. **场景拖拽**: 拖一个已定型场景至 Stage，确认场景图显示
3. **角色拖至 Stage**：拖一个已定型角色至 Stage 区域：
   - ✅ Stage 上出现角色缩略图（小圆形头像）
   - ✅ Description 面板自动出现该角色的描述卡片
   - ✅ 再拖同一角色不会重复添加
4. **描述填写**：在 Description 面板填写位置 / 动作 / 神态，确认数据保存（刷新页面后仍在，localStorage 持久化）
5. **删除角色**：hover Stage 上的角色缩略图点击 ✕，确认 Stage 缩略图和 Description 卡片同步移除
6. **Generate 汇总**：打开浏览器 DevTools Console，点击 `✨ Generate`：
   - ✅ 控制台输出场景图路径、角色图路径、以及各角色描述提示词
7. **角色拖至 Dialogue Lines**：确认原有功能不受影响
8. **布局检查**：确认右下区域为 Description + Line 两栏，Script Preview 已移除
