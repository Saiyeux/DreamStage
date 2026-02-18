# AI Director — 剧本分析引擎：数据库与识别流程设计文档

> **版本**: 2.0  
> **最后更新**: 2026-02-18  
> **文档定位**: 本文档是 AI Director 项目剧本分析模块的完整技术设计规范。开发 Agent 应基于本文档理解系统架构、数据模型、处理流程和接口约定，并据此实现代码。

---

## 1. 系统概述

### 1.1 目标

将用户输入的剧本文本，通过自动化流程，解析为结构化的影视制作数据，包括：

- 角色资产库（外貌描述 + 多姿态视图）
- 场景资产库（环境描述 + 多子视角）
- 逐镜头的画面生成条件（关键帧）
- 逐镜头的视频生成条件（动作 + 台词）

最终使得用户完成"定角"后，系统可自动组装所有生成 prompt，驱动图像/视频生成 pipeline。

### 1.2 核心设计原则

| 原则 | 说明 |
|------|------|
| **LLM 轻量化** | LLM 仅负责单章节的阅读理解和信息提取，prompt 固定长度，不随剧本增长而膨胀 |
| **后端承担一致性** | 查重、合并、去重、冲突解决等逻辑全部由后端 Reconciler 层处理 |
| **增量式构建** | 角色和场景的描述按片段存储，逐章累积，可追溯来源 |
| **生成条件可组装** | 所有生成所需的 prompt 素材（描述、姿态、视角、位置、神态、动作、台词）均可从数据库中直接查询组装 |

### 1.3 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                      用户输入：剧本文本                    │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │  Step 1: 章节分割器   │  ← 规则/正则，不用 LLM
                │  (Chapter Splitter)  │
                └──────────┬──────────┘
                           │ 输出: chapters[]
                           ▼
              ┌───────────────────────────┐
              │  Step 2: 逐章循环处理       │
              │  ┌─────────────────────┐  │
              │  │  2a. LLM Extractor  │  │  ← 固定 prompt，仅看当前章节
              │  │  (信息提取)          │  │
              │  └──────────┬──────────┘  │
              │             │ 原始提取结果   │
              │             ▼              │
              │  ┌─────────────────────┐  │
              │  │  2b. Reconciler     │  │  ← 查重 + 合并 + 存疑
              │  │  (一致性引擎)        │  │
              │  └──────────┬──────────┘  │
              │             │ 清洗后的数据   │
              │             ▼              │
              │  ┌─────────────────────┐  │
              │  │  2c. DB Writer      │  │  ← 增量写入数据库
              │  │  (数据库写入)        │  │
              │  └─────────────────────┘  │
              └───────────────────────────┘
                           │ 全部章节处理完毕
                           ▼
              ┌───────────────────────────┐
              │  Step 3: 存疑处理          │  ← 批量 LLM 判断 或 用户确认
              │  (Ambiguity Resolver)     │
              └──────────┬────────────────┘
                         │
                         ▼
              ┌───────────────────────────┐
              │  Step 4: 描述合成          │  ← 可选 LLM 润色
              │  (Description Synthesizer)│
              └──────────┬────────────────┘
                         │
                         ▼
              ┌───────────────────────────┐
              │  Step 5: 用户定角          │  ← UI 交互
              └──────────┬────────────────┘
                         │
                         ▼
              ┌───────────────────────────┐
              │  Step 6: 关键帧组装        │  ← 自动从 DB 拉取条件
              │  (Keyframe Assembler)     │
              └──────────┬────────────────┘
                         │
                         ▼
              ┌───────────────────────────┐
              │  Step 7: 视频任务组装      │  ← keyframe + action + dialogue
              │  (Video Task Assembler)   │
              └───────────────────────────┘
```

---

## 2. 数据库设计

### 2.1 技术选型

推荐使用 **PostgreSQL**（生产环境）或 **SQLite**（开发/演示环境），ORM 使用 **SQLAlchemy**（配合 FastAPI 后端）。

JSON 字段在 PostgreSQL 中使用 `JSONB` 类型，SQLite 中使用 `TEXT` + JSON 序列化。

### 2.2 ER 关系总览

```
projects (1) ──── (N) chapters
                        │
                        │ (1:N)
                        ▼
                      shots ──────────── (N:1) scenes
                        │                       │
                        │ (1:N)                  │ (1:N)
                        ▼                        ▼
                  shot_characters           scene_views
                        │                       │
                        │ (N:1)                  │
                        ▼                        │
                   characters                    │
                        │                        │
                        │ (1:N)                  │
                        ▼                        │
                  character_poses                │
                                                 │
                  keyframes ─────────────────────┘
                      │           (引用 scene_view)
                      │ (1:1)
                      ▼
                  video_tasks
```

### 2.3 表结构定义

#### 2.3.1 projects — 项目表

管理多个剧本项目。

```sql
CREATE TABLE projects (
    id              TEXT PRIMARY KEY,           -- UUID
    name            TEXT NOT NULL,
    raw_script      TEXT NOT NULL,              -- 完整剧本原文
    delimiter_type  TEXT,                       -- 检测到的分段类型: chapter/scene/act/roman/numeric/custom
    delimiter_pattern TEXT,                     -- 分段正则表达式
    status          TEXT DEFAULT 'created',     -- created/splitting/analyzing/resolving/ready/generating
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
```

#### 2.3.2 chapters — 章节表

```sql
CREATE TABLE chapters (
    id              TEXT PRIMARY KEY,           -- UUID
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    chapter_index   INTEGER NOT NULL,           -- 从 0 开始的顺序号
    title           TEXT,                       -- 章节标题原文（如 "Scene 3" "第二幕"）
    raw_text        TEXT NOT NULL,              -- 本章节原始文本
    analysis_status TEXT DEFAULT 'pending',     -- pending/extracted/reconciled/error
    llm_raw_output  JSONB,                     -- LLM 原始返回的 JSON，用于调试和回溯
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_chapters_project ON chapters(project_id, chapter_index);
```

#### 2.3.3 characters — 角色表

```sql
CREATE TABLE characters (
    id              TEXT PRIMARY KEY,           -- UUID
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,              -- 角色主名称
    aliases         JSONB DEFAULT '[]',        -- 别名列表: ["老王", "王局长"]
    base_description TEXT,                     -- 合成后的完整描述（Step 4 生成）
    status          TEXT DEFAULT 'accumulating', -- accumulating/synthesized/cast(已定角)
    cast_image      TEXT,                      -- 定角后的基础形象图路径
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_characters_project_name ON characters(project_id, name);
```

#### 2.3.4 character_desc_fragments — 角色描述片段表

```sql
CREATE TABLE character_desc_fragments (
    id              TEXT PRIMARY KEY,           -- UUID
    character_id    TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    text            TEXT NOT NULL,              -- 描述片段，如 "穿着黑色长外套"
    source_chapter_id TEXT REFERENCES chapters(id),  -- 来源章节
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_char_desc_character ON character_desc_fragments(character_id);
```

#### 2.3.5 character_poses — 角色姿态视图表

每个角色可能有多种姿态（站、坐、跑、倚墙等），每种姿态对应一张生成图。

```sql
CREATE TABLE character_poses (
    id              TEXT PRIMARY KEY,           -- UUID
    character_id    TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    pose_tag        TEXT NOT NULL,              -- 标准化姿态标签: "sitting", "standing", "running"
    pose_description TEXT,                     -- 姿态的详细描述
    source_chapter_id TEXT REFERENCES chapters(id),  -- 首次出现的章节
    generated_image TEXT,                      -- 生成后的姿态图路径
    status          TEXT DEFAULT 'pending',     -- pending/generated/approved
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_char_poses_unique ON character_poses(character_id, pose_tag);
```

#### 2.3.6 scenes — 场景表

```sql
CREATE TABLE scenes (
    id              TEXT PRIMARY KEY,           -- UUID
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,              -- 场景名: "客厅", "森林小路"
    aliases         JSONB DEFAULT '[]',        -- 别名列表
    base_description TEXT,                     -- 合成后的完整描述（Step 4 生成）
    status          TEXT DEFAULT 'accumulating', -- accumulating/synthesized/generated
    base_image      TEXT,                      -- 场景基础全景图路径
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_scenes_project_name ON scenes(project_id, name);
```

#### 2.3.7 scene_desc_fragments — 场景描述片段表

```sql
CREATE TABLE scene_desc_fragments (
    id              TEXT PRIMARY KEY,           -- UUID
    scene_id        TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    text            TEXT NOT NULL,              -- 描述片段，如 "米色布艺沙发，旁边有一盏落地灯"
    source_chapter_id TEXT REFERENCES chapters(id),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scene_desc_scene ON scene_desc_fragments(scene_id);
```

#### 2.3.8 scene_views — 场景子视角表

同一场景在不同镜头中可能呈现不同角度，每个子视角对应一张生成图。

```sql
CREATE TABLE scene_views (
    id              TEXT PRIMARY KEY,           -- UUID
    scene_id        TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    view_tag        TEXT NOT NULL,              -- 子视角标签: "front_sofa", "side_bedroom_door"
    view_description TEXT NOT NULL,            -- 该角度看到的内容描述
    source_chapter_id TEXT REFERENCES chapters(id),  -- 首次出现的章节
    generated_image TEXT,                      -- 生成后的子视角图路径
    status          TEXT DEFAULT 'pending',     -- pending/generated/approved
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_scene_views_unique ON scene_views(scene_id, view_tag);
```

#### 2.3.9 shots — 镜头表

章节内拆分出的最小叙事单位，每个 shot 对应一个关键帧画面。

```sql
CREATE TABLE shots (
    id              TEXT PRIMARY KEY,           -- UUID
    chapter_id      TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    shot_index      INTEGER NOT NULL,           -- 章节内顺序号
    scene_id        TEXT REFERENCES scenes(id), -- 发生在哪个场景
    scene_view_id   TEXT REFERENCES scene_views(id), -- 此刻的子视角
    raw_text        TEXT,                       -- 该镜头对应的原始文本片段
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_shots_chapter ON shots(chapter_id, shot_index);
```

#### 2.3.10 shot_characters — 镜头-角色关联表

记录每个镜头中每个角色的完整状态。

```sql
CREATE TABLE shot_characters (
    id              TEXT PRIMARY KEY,           -- UUID
    shot_id         TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
    character_id    TEXT NOT NULL REFERENCES characters(id),
    character_pose_id TEXT REFERENCES character_poses(id), -- 此刻的姿态
    position        TEXT,                       -- 画面中的位置: "沙发右侧", "画面左前方"
    expression      TEXT,                       -- 神态: "疲惫", "微笑", "惊恐"
    action          TEXT,                       -- 动作描述: "缓缓放下杯子"
    dialogue        TEXT,                       -- 台词: "我累了。"
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_shot_chars_shot ON shot_characters(shot_id);
CREATE INDEX idx_shot_chars_character ON shot_characters(character_id);
```

#### 2.3.11 keyframes — 关键帧表

每个 shot 生成一个关键帧，包含完整的画面生成条件。

```sql
CREATE TABLE keyframes (
    id              TEXT PRIMARY KEY,           -- UUID
    shot_id         TEXT NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
    scene_view_id   TEXT REFERENCES scene_views(id),
    composition_prompt TEXT,                   -- 组装后的完整画面生成 prompt
    character_placements JSONB,                -- 角色布局: [{character_id, pose_tag, position, expression}]
    status          TEXT DEFAULT 'pending',     -- pending/generated/approved
    generated_image TEXT,                      -- 生成的关键帧图路径
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_keyframes_shot ON keyframes(shot_id);
```

#### 2.3.12 video_tasks — 视频生成任务表

```sql
CREATE TABLE video_tasks (
    id              TEXT PRIMARY KEY,           -- UUID
    keyframe_id     TEXT NOT NULL REFERENCES keyframes(id) ON DELETE CASCADE,
    motion_prompt   TEXT,                       -- 动作描述 prompt（从 shot_characters.action 组装）
    dialogue_text   TEXT,                       -- 合并后的台词文本
    audio_path      TEXT,                       -- TTS 生成的音频路径
    status          TEXT DEFAULT 'pending',     -- pending/generated/approved
    generated_video TEXT,                      -- 生成的视频路径
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_video_tasks_keyframe ON video_tasks(keyframe_id);
```

#### 2.3.13 ambiguous_matches — 存疑队列表

```sql
CREATE TABLE ambiguous_matches (
    id              TEXT PRIMARY KEY,           -- UUID
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    entity_type     TEXT NOT NULL,              -- 'character' / 'scene' / 'character_pose' / 'scene_view'
    new_name        TEXT NOT NULL,              -- LLM 提取的新名称
    new_description TEXT,                       -- LLM 提取的新描述
    candidate_id    TEXT NOT NULL,              -- 疑似匹配的已有条目 ID
    candidate_name  TEXT NOT NULL,              -- 已有条目的名称（冗余存储，便于展示）
    similarity      REAL NOT NULL,              -- 匹配相似度分数
    match_method    TEXT,                       -- 'edit_distance' / 'substring' / 'semantic'
    resolution      TEXT DEFAULT 'pending',     -- pending / merged / separate / user_decided
    source_chapter_id TEXT REFERENCES chapters(id),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ambiguous_project ON ambiguous_matches(project_id, resolution);
```

---

## 3. 处理流程详细设计

### 3.1 Step 1: 章节分割器 (Chapter Splitter)

**职责**: 检测剧本的分段标志，将全文切分为章节列表。

**实现方式**: 纯规则/正则，不使用 LLM。

#### 3.1.1 分段标志检测

按优先级依次尝试匹配以下模式：

```python
DELIMITER_PATTERNS = [
    {
        "type": "scene_heading",
        "pattern": r"^(INT\.|EXT\.|INT/EXT\.|内景|外景)[\s\.].+",
        "description": "标准电影剧本的场景标题 (slugline)"
    },
    {
        "type": "act",
        "pattern": r"^(ACT|Act|幕|第[一二三四五六七八九十百]+幕)\s*[:\-\s]?\s*\w*",
        "description": "幕 (Act) 分段"
    },
    {
        "type": "scene",
        "pattern": r"^(SCENE|Scene|场|第[一二三四五六七八九十百]+场)\s*[:\-\s]?\d*",
        "description": "场 (Scene) 分段"
    },
    {
        "type": "chapter",
        "pattern": r"^(CHAPTER|Chapter|章|第[一二三四五六七八九十百]+章)\s*[:\-\s]?\d*",
        "description": "章 (Chapter) 分段"
    },
    {
        "type": "roman",
        "pattern": r"^(I{1,3}|IV|VI{0,3}|IX|X{0,3})\s*[\.\:\-]",
        "description": "罗马数字分段"
    },
    {
        "type": "numeric",
        "pattern": r"^\d{1,3}\s*[\.\:\-]\s*\S+",
        "description": "阿拉伯数字分段"
    },
    {
        "type": "separator",
        "pattern": r"^[\-\=\*]{3,}\s*$",
        "description": "分隔线分段 (---, ===, ***)"
    }
]
```

#### 3.1.2 分割算法

```python
def split_chapters(script_text: str) -> tuple[str, list[dict]]:
    """
    返回:
        delimiter_type: 检测到的分段类型
        chapters: [{"index": int, "title": str|None, "raw_text": str}]
    """
    lines = script_text.split('\n')
    
    # 1. 统计每种 pattern 的匹配次数
    match_counts = {}
    for pattern_info in DELIMITER_PATTERNS:
        count = sum(1 for line in lines if re.match(pattern_info["pattern"], line.strip()))
        if count >= 2:  # 至少出现2次才视为有效分段标志
            match_counts[pattern_info["type"]] = count
    
    # 2. 选择匹配次数最多的 pattern（如果有平局，按优先级）
    if not match_counts:
        # 无分段标志，整个剧本作为一个章节
        return "none", [{"index": 0, "title": None, "raw_text": script_text}]
    
    best_type = max(match_counts, key=match_counts.get)
    best_pattern = next(p for p in DELIMITER_PATTERNS if p["type"] == best_type)
    
    # 3. 按匹配的行切分
    chapters = []
    current_title = None
    current_lines = []
    
    for line in lines:
        if re.match(best_pattern["pattern"], line.strip()):
            if current_lines:
                chapters.append({
                    "index": len(chapters),
                    "title": current_title,
                    "raw_text": '\n'.join(current_lines).strip()
                })
            current_title = line.strip()
            current_lines = []
        else:
            current_lines.append(line)
    
    # 最后一段
    if current_lines:
        chapters.append({
            "index": len(chapters),
            "title": current_title,
            "raw_text": '\n'.join(current_lines).strip()
        })
    
    return best_type, chapters
```

#### 3.1.3 写库

```python
# 写入 projects 表
project.delimiter_type = delimiter_type
project.status = 'splitting'

# 写入 chapters 表
for ch in chapters:
    Chapter(
        project_id=project.id,
        chapter_index=ch["index"],
        title=ch["title"],
        raw_text=ch["raw_text"],
        analysis_status='pending'
    )
```

---

### 3.2 Step 2a: LLM Extractor (信息提取)

**职责**: 对单个章节文本做阅读理解，提取角色、场景、镜头等结构化信息。

**关键约束**: 
- prompt 中 **不包含** 已有角色库/场景库信息
- prompt 长度固定，不随剧本增长而膨胀
- LLM 只做提取，不做查重/合并判断

#### 3.2.1 System Prompt

```
你是一个专业的影视剧本分析师。你的任务是从给定的剧本章节文本中提取结构化信息。

请严格按照以下规则提取：

1. **角色 (characters)**: 提取所有出现的角色，包括：
   - name: 该角色在文本中的称呼（取最完整的名称）
   - description_fragments: 本段文本中出现的所有外貌、穿着、体态特征描述（数组，每条一个独立特征）
   - poses: 该角色在本段中出现的所有姿态（如 sitting, standing, walking, leaning, running 等，用英文标签）

2. **场景 (scenes)**: 提取所有出现的场景/地点，包括：
   - name: 场景名称
   - description_fragments: 本段文本中出现的环境细节描述（数组）
   - views: 根据文本中角色的站位和动作推断出的子视角，每个视角包含：
     - tag: 简短的视角标签（英文，如 "front_sofa", "doorway_angle"）
     - description: 从该角度能看到什么

3. **镜头 (shots)**: 将文本拆分为独立的镜头单位。每当发生以下变化时应切分为新镜头：
   - 场景/地点切换
   - 视角明显变化
   - 时间跳跃
   - 重要的动作转折
   
   每个镜头包含：
   - scene_name: 所处场景名
   - scene_view_tag: 此刻的子视角标签
   - characters: 本镜头中每个角色的状态：
     - name: 角色名
     - pose_tag: 当前姿态标签（英文）
     - position: 在画面中的位置（自然语言描述）
     - expression: 神态/表情
     - action: 正在执行的动作
     - dialogue: 台词（如果有的话，null 如果没有）

请仅基于给定文本提取信息，不要推测文本之外的内容。
```

#### 3.2.2 User Prompt 模板

```
## 剧本章节文本

{chapter.raw_text}

请分析以上文本并返回 JSON，格式如下：
{
  "characters": [...],
  "scenes": [...],
  "shots": [...]
}
```

#### 3.2.3 期望的 LLM 输出格式 (JSON Schema)

```json
{
  "characters": [
    {
      "name": "string — 角色名",
      "description_fragments": ["string — 外貌特征片段"],
      "poses": ["string — 姿态英文标签"]
    }
  ],
  "scenes": [
    {
      "name": "string — 场景名",
      "description_fragments": ["string — 环境描述片段"],
      "views": [
        {
          "tag": "string — 子视角英文标签",
          "description": "string — 该角度的画面描述"
        }
      ]
    }
  ],
  "shots": [
    {
      "scene_name": "string — 场景名（应与 scenes 中的 name 对应）",
      "scene_view_tag": "string — 子视角标签（应与该场景的 views 中某个 tag 对应）",
      "characters": [
        {
          "name": "string — 角色名",
          "pose_tag": "string — 姿态标签",
          "position": "string — 画面位置描述",
          "expression": "string — 神态",
          "action": "string — 动作描述",
          "dialogue": "string | null — 台词"
        }
      ]
    }
  ]
}
```

#### 3.2.4 LLM 调用配置

```python
LLM_CONFIG = {
    "model": "claude-sonnet-4-5-20250929",  # 或其他适合的模型
    "temperature": 0.1,                      # 低温度，确保稳定输出
    "max_tokens": 4096,
    "response_format": "json"                # 强制 JSON 输出
}
```

#### 3.2.5 输出验证

LLM 返回结果后，需做基本校验：

```python
def validate_extraction(result: dict) -> tuple[bool, list[str]]:
    """校验 LLM 提取结果的基本格式"""
    errors = []
    
    # 1. 顶层字段检查
    for key in ["characters", "scenes", "shots"]:
        if key not in result:
            errors.append(f"缺少顶层字段: {key}")
    
    # 2. shots 中引用的 scene_name 必须在 scenes 中存在
    scene_names = {s["name"] for s in result.get("scenes", [])}
    for i, shot in enumerate(result.get("shots", [])):
        if shot.get("scene_name") not in scene_names:
            errors.append(f"shot[{i}].scene_name '{shot.get('scene_name')}' 未在 scenes 中定义")
    
    # 3. shots 中引用的 character name 必须在 characters 中存在
    char_names = {c["name"] for c in result.get("characters", [])}
    for i, shot in enumerate(result.get("shots", [])):
        for j, ch in enumerate(shot.get("characters", [])):
            if ch.get("name") not in char_names:
                errors.append(f"shot[{i}].characters[{j}].name '{ch.get('name')}' 未在 characters 中定义")
    
    return len(errors) == 0, errors
```

---

### 3.3 Step 2b: Reconciler (一致性引擎)

**职责**: 将 LLM 提取结果与数据库中的已有条目进行比对，决定"新建"或"合并"。

#### 3.3.1 匹配策略：三级匹配

对角色、场景、姿态、子视角分别做查重匹配。匹配分三级：

| 级别 | 方法 | 匹配条件 | 处理方式 |
|------|------|----------|----------|
| L1 精确匹配 | 名称标准化后完全一致 | `normalize(new) == normalize(existing)` | 直接合并 |
| L2 模糊匹配 | 编辑距离 / 包含关系 | `levenshtein ≤ 2` 或 子串包含 | 自动合并（高置信度） |
| L3 语义匹配 | Embedding 余弦相似度 | `similarity > threshold` | 根据阈值自动合并或存疑 |

#### 3.3.2 名称标准化函数

```python
import re
import unicodedata

def normalize_name(name: str) -> str:
    """
    标准化名称，用于精确匹配。
    处理：大小写、空格、标点、中文全角半角、Unicode 规范化。
    """
    name = unicodedata.normalize('NFKC', name)  # 全角→半角
    name = name.strip().lower()
    name = re.sub(r'[·・\-—–\s\u3000]+', '', name)  # 移除间隔符
    name = re.sub(r'["""\'\'\'`]+', '', name)          # 移除引号
    return name
```

#### 3.3.3 模糊匹配函数

```python
from Levenshtein import distance as levenshtein_distance

def fuzzy_match(new_name: str, existing_names: list[str]) -> list[dict]:
    """
    对新名称与已有名称列表做模糊匹配。
    返回所有候选匹配结果。
    """
    new_norm = normalize_name(new_name)
    candidates = []
    
    for existing_name in existing_names:
        existing_norm = normalize_name(existing_name)
        
        # L1: 精确匹配
        if new_norm == existing_norm:
            candidates.append({
                "name": existing_name,
                "method": "exact",
                "confidence": 1.0
            })
            continue
        
        # L2a: 编辑距离
        dist = levenshtein_distance(new_norm, existing_norm)
        max_len = max(len(new_norm), len(existing_norm))
        if max_len > 0 and dist <= 2 and dist / max_len < 0.4:
            candidates.append({
                "name": existing_name,
                "method": "edit_distance",
                "confidence": 1.0 - (dist / max_len)
            })
            continue
        
        # L2b: 子串包含（处理 "老王" vs "王建国" 等情况）
        if len(new_norm) >= 2 and len(existing_norm) >= 2:
            if new_norm in existing_norm or existing_norm in new_norm:
                candidates.append({
                    "name": existing_name,
                    "method": "substring",
                    "confidence": 0.75
                })
    
    return candidates
```

#### 3.3.4 语义匹配函数

用于处理同义不同名的情况（"客厅" vs "起居室"，"沙发正面" vs "沙发前方"）。

```python
from sentence_transformers import SentenceTransformer
import numpy as np

# 全局加载（轻量模型，~120MB，CPU 推理即可，不占 GPU 资源）
_semantic_model = None

def get_semantic_model():
    global _semantic_model
    if _semantic_model is None:
        _semantic_model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
    return _semantic_model

def semantic_match(
    new_text: str,
    existing_texts: list[str],
    threshold_auto: float = 0.85,
    threshold_ambiguous: float = 0.70
) -> list[dict]:
    """
    对名称+描述做语义比对。
    
    返回:
        匹配结果列表，每个包含 index, similarity, decision:
        - decision="merge": similarity >= threshold_auto，自动合并
        - decision="ambiguous": threshold_ambiguous <= similarity < threshold_auto，需人工确认
        - 低于 threshold_ambiguous 的不返回
    """
    model = get_semantic_model()
    new_emb = model.encode(new_text, normalize_embeddings=True)
    existing_embs = model.encode(existing_texts, normalize_embeddings=True)
    
    similarities = np.dot(existing_embs, new_emb)
    
    results = []
    for i, sim in enumerate(similarities):
        if sim >= threshold_auto:
            results.append({"index": i, "similarity": float(sim), "decision": "merge"})
        elif sim >= threshold_ambiguous:
            results.append({"index": i, "similarity": float(sim), "decision": "ambiguous"})
    
    return sorted(results, key=lambda x: x["similarity"], reverse=True)
```

#### 3.3.5 Reconciler 主流程

```python
def reconcile_extraction(
    project_id: str,
    chapter_id: str,
    extraction: dict,
    db_session
) -> dict:
    """
    将 LLM 提取结果与数据库中已有条目做查重合并。
    
    返回:
        {
            "characters_merged": int,
            "characters_created": int,
            "characters_ambiguous": int,
            "scenes_merged": int,
            "scenes_created": int,
            "scenes_ambiguous": int,
            "shots_created": int
        }
    """
    stats = defaultdict(int)
    
    # ===== 角色处理 =====
    existing_characters = get_characters_by_project(project_id, db_session)
    char_name_map = {}  # LLM输出的name → DB中的character_id 映射
    
    for char_data in extraction["characters"]:
        resolved = resolve_character(
            project_id, chapter_id, char_data, existing_characters, db_session
        )
        char_name_map[char_data["name"]] = resolved["character_id"]
        stats[f"characters_{resolved['action']}"] += 1
    
    # ===== 场景处理 =====
    existing_scenes = get_scenes_by_project(project_id, db_session)
    scene_name_map = {}  # LLM输出的name → DB中的scene_id 映射
    
    for scene_data in extraction["scenes"]:
        resolved = resolve_scene(
            project_id, chapter_id, scene_data, existing_scenes, db_session
        )
        scene_name_map[scene_data["name"]] = resolved["scene_id"]
        stats[f"scenes_{resolved['action']}"] += 1
    
    # ===== 镜头写入 =====
    for shot_index, shot_data in enumerate(extraction["shots"]):
        create_shot(
            chapter_id, shot_index, shot_data,
            char_name_map, scene_name_map, db_session
        )
        stats["shots_created"] += 1
    
    return dict(stats)
```

#### 3.3.6 角色解析函数

```python
def resolve_character(
    project_id: str,
    chapter_id: str,
    char_data: dict,
    existing_characters: list,
    db_session
) -> dict:
    """
    解析单个角色，决定新建、合并或存疑。
    
    返回: {"character_id": str, "action": "created" | "merged" | "ambiguous"}
    """
    new_name = char_data["name"]
    
    # --- L1 + L2: 精确 + 模糊匹配（基于名称和别名）---
    all_names = []
    name_to_char = {}
    for ch in existing_characters:
        all_names.append(ch.name)
        name_to_char[ch.name] = ch
        for alias in (ch.aliases or []):
            all_names.append(alias)
            name_to_char[alias] = ch
    
    fuzzy_results = fuzzy_match(new_name, all_names)
    
    # 高置信度匹配 → 直接合并
    high_confidence = [r for r in fuzzy_results if r["confidence"] >= 0.8]
    if high_confidence:
        matched_char = name_to_char[high_confidence[0]["name"]]
        merge_character_data(matched_char, char_data, chapter_id, db_session)
        return {"character_id": matched_char.id, "action": "merged"}
    
    # --- L3: 语义匹配（名称+描述拼接比对）---
    if existing_characters and char_data.get("description_fragments"):
        new_text = f"{new_name}: {' '.join(char_data['description_fragments'])}"
        existing_texts = [
            f"{ch.name}: {' '.join(get_char_desc_texts(ch.id, db_session))}"
            for ch in existing_characters
        ]
        
        semantic_results = semantic_match(new_text, existing_texts)
        
        for result in semantic_results:
            candidate = existing_characters[result["index"]]
            if result["decision"] == "merge":
                merge_character_data(candidate, char_data, chapter_id, db_session)
                # 将新名称加入别名
                if normalize_name(new_name) != normalize_name(candidate.name):
                    add_alias(candidate, new_name, db_session)
                return {"character_id": candidate.id, "action": "merged"}
            elif result["decision"] == "ambiguous":
                create_ambiguous_match(
                    project_id=project_id,
                    entity_type="character",
                    new_name=new_name,
                    new_description=' '.join(char_data.get('description_fragments', [])),
                    candidate_id=candidate.id,
                    candidate_name=candidate.name,
                    similarity=result["similarity"],
                    match_method="semantic",
                    source_chapter_id=chapter_id,
                    db_session=db_session
                )
                # 存疑时仍然创建新条目，后续合并时处理
                break
    
    # --- 无匹配 → 新建 ---
    new_char = create_character(project_id, char_data, chapter_id, db_session)
    return {"character_id": new_char.id, "action": "created"}
```

#### 3.3.7 合并操作函数

```python
def merge_character_data(
    existing_char,
    new_data: dict,
    chapter_id: str,
    db_session
):
    """将新提取的角色数据合并到已有角色中"""
    
    # 1. 追加描述片段（去重）
    existing_frags = get_char_desc_texts(existing_char.id, db_session)
    for frag in new_data.get("description_fragments", []):
        if not is_duplicate_fragment(frag, existing_frags):
            create_char_desc_fragment(
                character_id=existing_char.id,
                text=frag,
                source_chapter_id=chapter_id,
                db_session=db_session
            )
    
    # 2. 追加新姿态（通过语义匹配去重）
    existing_poses = get_char_poses(existing_char.id, db_session)
    existing_pose_tags = [p.pose_tag for p in existing_poses]
    
    for pose_tag in new_data.get("poses", []):
        # 对姿态标签做语义匹配
        pose_norm = normalize_name(pose_tag)
        is_dup = any(
            normalize_name(t) == pose_norm or
            levenshtein_distance(normalize_name(t), pose_norm) <= 1
            for t in existing_pose_tags
        )
        if not is_dup:
            create_char_pose(
                character_id=existing_char.id,
                pose_tag=pose_tag,
                source_chapter_id=chapter_id,
                db_session=db_session
            )


def is_duplicate_fragment(new_frag: str, existing_frags: list[str]) -> bool:
    """判断描述片段是否与已有片段重复"""
    new_norm = normalize_name(new_frag)
    for existing in existing_frags:
        existing_norm = normalize_name(existing)
        # 精确重复
        if new_norm == existing_norm:
            return True
        # 高度语义重复
        if len(new_norm) > 5 and len(existing_norm) > 5:
            results = semantic_match(new_frag, [existing], threshold_auto=0.90, threshold_ambiguous=0.90)
            if results:
                return True
    return False
```

#### 3.3.8 场景解析（同角色逻辑，增加子视角处理）

```python
def resolve_scene(
    project_id: str,
    chapter_id: str,
    scene_data: dict,
    existing_scenes: list,
    db_session
) -> dict:
    """解析场景，逻辑同 resolve_character，额外处理 views"""
    # ... L1/L2/L3 匹配逻辑同上 ...
    # 匹配成功后，除了合并描述片段，还要处理子视角：
    
    # matched_scene = ...
    # merge_scene_views(matched_scene, scene_data["views"], chapter_id, db_session)


def merge_scene_views(
    existing_scene,
    new_views: list[dict],
    chapter_id: str,
    db_session
):
    """合并新的子视角到已有场景"""
    existing_views = get_scene_views(existing_scene.id, db_session)
    existing_view_texts = [f"{v.view_tag}: {v.view_description}" for v in existing_views]
    
    for new_view in new_views:
        new_text = f"{new_view['tag']}: {new_view['description']}"
        
        # 精确标签匹配
        tag_match = next(
            (v for v in existing_views if normalize_name(v.view_tag) == normalize_name(new_view['tag'])),
            None
        )
        
        if tag_match:
            # 标签相同 → 可能需要补充描述
            continue
        
        # 语义匹配
        sem_results = semantic_match(new_text, existing_view_texts, threshold_auto=0.82, threshold_ambiguous=0.68)
        
        if sem_results and sem_results[0]["decision"] == "merge":
            # 已有相似视角，跳过
            continue
        elif sem_results and sem_results[0]["decision"] == "ambiguous":
            # 存疑
            candidate_view = existing_views[sem_results[0]["index"]]
            create_ambiguous_match(
                project_id=existing_scene.project_id,
                entity_type="scene_view",
                new_name=new_view["tag"],
                new_description=new_view["description"],
                candidate_id=candidate_view.id,
                candidate_name=candidate_view.view_tag,
                similarity=sem_results[0]["similarity"],
                match_method="semantic",
                source_chapter_id=chapter_id,
                db_session=db_session
            )
        
        # 新视角 → 插入
        create_scene_view(
            scene_id=existing_scene.id,
            view_tag=new_view["tag"],
            view_description=new_view["description"],
            source_chapter_id=chapter_id,
            db_session=db_session
        )
```

#### 3.3.9 镜头写入函数

```python
def create_shot(
    chapter_id: str,
    shot_index: int,
    shot_data: dict,
    char_name_map: dict,
    scene_name_map: dict,
    db_session
):
    """
    创建镜头记录及其角色关联。
    
    char_name_map: LLM输出的角色名 → DB中的character_id
    scene_name_map: LLM输出的场景名 → DB中的scene_id
    """
    scene_id = scene_name_map.get(shot_data["scene_name"])
    
    # 查找对应的子视角
    scene_view_id = None
    if scene_id:
        view = find_scene_view_by_tag(scene_id, shot_data["scene_view_tag"], db_session)
        if view:
            scene_view_id = view.id
    
    # 创建 shot
    shot = Shot(
        chapter_id=chapter_id,
        shot_index=shot_index,
        scene_id=scene_id,
        scene_view_id=scene_view_id,
        raw_text=None  # 可选：从原文中截取对应段落
    )
    db_session.add(shot)
    db_session.flush()
    
    # 创建 shot_characters
    for char_in_shot in shot_data.get("characters", []):
        character_id = char_name_map.get(char_in_shot["name"])
        if not character_id:
            continue
        
        # 查找对应的姿态
        pose_id = None
        if char_in_shot.get("pose_tag"):
            pose = find_char_pose_by_tag(character_id, char_in_shot["pose_tag"], db_session)
            if pose:
                pose_id = pose.id
        
        shot_char = ShotCharacter(
            shot_id=shot.id,
            character_id=character_id,
            character_pose_id=pose_id,
            position=char_in_shot.get("position"),
            expression=char_in_shot.get("expression"),
            action=char_in_shot.get("action"),
            dialogue=char_in_shot.get("dialogue")
        )
        db_session.add(shot_char)
```

---

### 3.4 Step 3: 存疑处理 (Ambiguity Resolver)

全部章节处理完后，处理 `ambiguous_matches` 表中的待决条目。

#### 3.4.1 方式 A：批量 LLM 判断（推荐）

将所有存疑项打包为一次 LLM 调用：

```
以下是一些可能重复的条目对，请判断每对是否是同一个实体：

1. 角色 "老王"（穿灰色西装，秃顶）vs 角色 "王建国"（中年男人，戴眼镜）
   → 是否同一人？

2. 场景子视角 "sofa_front"（正对沙发，背景是电视墙）vs "living_room_main"（客厅主视角，沙发和茶几）
   → 是否同一视角？

请返回 JSON:
[
  {"pair_id": 1, "is_same": true, "confidence": 0.9, "reason": "都是中年男性，灰西装和眼镜不矛盾"},
  {"pair_id": 2, "is_same": true, "confidence": 0.85, "reason": "都是客厅正面视角，描述互补"}
]
```

#### 3.4.2 方式 B：用户 UI 确认

在前端展示存疑列表，用户点选"合并"或"保持独立"。

#### 3.4.3 合并执行

```python
def execute_merge(ambiguous_match, db_session):
    """执行合并：将新条目并入已有条目"""
    if ambiguous_match.entity_type == "character":
        merge_characters(
            keep_id=ambiguous_match.candidate_id,
            remove_id=find_character_by_name(ambiguous_match.new_name).id,
            db_session=db_session
        )
    elif ambiguous_match.entity_type == "scene_view":
        merge_scene_views_by_id(
            keep_id=ambiguous_match.candidate_id,
            remove_id=find_scene_view_by_tag_and_name(ambiguous_match.new_name).id,
            db_session=db_session
        )
    
    ambiguous_match.resolution = 'merged'
    db_session.commit()
```

---

### 3.5 Step 4: 描述合成 (Description Synthesizer)

将角色/场景的描述片段合成为连贯的完整描述。

#### 3.5.1 方式 A：简单拼接

```python
def synthesize_description_simple(fragments: list[str]) -> str:
    """去重后按顺序拼接"""
    seen = set()
    unique = []
    for frag in fragments:
        norm = normalize_name(frag)
        if norm not in seen:
            seen.add(norm)
            unique.append(frag)
    return '，'.join(unique)
```

#### 3.5.2 方式 B：LLM 润色（推荐）

将所有角色/场景的片段打包，一次 LLM 调用润色所有描述：

```
请将以下角色的外貌描述片段整合为连贯的、适合作为图像生成 prompt 的完整描述。
保留所有细节，不要添加原文没有的内容。使用英文输出，适合 Stable Diffusion / FLUX 模型。

角色1: 王建国
片段: ["穿灰色西装", "秃顶", "戴金丝眼镜", "身材微胖", "40多岁"]

角色2: 小美
片段: ["长发及腰", "穿白色连衣裙", "20岁左右", "眼睛很大"]

返回 JSON:
{
  "角色名": "synthesized english description for image generation",
  ...
}
```

---

### 3.6 Step 5-7: 定角 → 关键帧 → 视频任务

#### 3.6.1 Step 5: 用户定角

用户在 UI 上为每个角色选择/上传/生成基础形象图。定角完成后，系统为每个角色的每种姿态生成对应的姿态图。

```python
def on_character_cast(character_id: str, base_image_path: str, db_session):
    """用户确认角色基础形象后触发"""
    char = get_character(character_id, db_session)
    char.cast_image = base_image_path
    char.status = 'cast'
    
    # 为每种姿态生成图（加入生成队列）
    poses = get_char_poses(character_id, db_session)
    for pose in poses:
        enqueue_pose_generation(character_id, pose.id, base_image_path, pose.pose_description)
```

#### 3.6.2 Step 6: 关键帧组装

```python
def assemble_keyframe(shot_id: str, db_session) -> dict:
    """
    从数据库中拉取所有条件，组装关键帧 prompt。
    要求：角色已定角，场景已生成基础图。
    """
    shot = get_shot(shot_id, db_session)
    scene_view = get_scene_view(shot.scene_view_id, db_session)
    scene = get_scene(shot.scene_id, db_session)
    shot_chars = get_shot_characters(shot_id, db_session)
    
    # 组装画面 prompt
    char_descriptions = []
    char_placements = []
    
    for sc in shot_chars:
        character = get_character(sc.character_id, db_session)
        pose = get_char_pose(sc.character_pose_id, db_session) if sc.character_pose_id else None
        
        char_desc = f"{character.base_description}"
        if pose:
            char_desc += f", {pose.pose_description}"
        char_desc += f", position: {sc.position}, expression: {sc.expression}"
        char_descriptions.append(char_desc)
        
        char_placements.append({
            "character_id": sc.character_id,
            "character_name": character.name,
            "pose_tag": pose.pose_tag if pose else None,
            "position": sc.position,
            "expression": sc.expression
        })
    
    composition_prompt = f"""
Cinematic film still,
Scene: {scene.base_description},
View angle: {scene_view.view_description},
Characters: {'; '.join(char_descriptions)},
professional color grading, film grain, highly detailed, 8k uhd
"""
    
    keyframe = Keyframe(
        shot_id=shot_id,
        scene_view_id=shot.scene_view_id,
        composition_prompt=composition_prompt.strip(),
        character_placements=char_placements,
        status='pending'
    )
    db_session.add(keyframe)
    db_session.commit()
    
    return keyframe
```

#### 3.6.3 Step 7: 视频任务组装

```python
def assemble_video_task(keyframe_id: str, db_session) -> dict:
    """
    从关键帧 + 镜头数据组装视频生成任务。
    """
    keyframe = get_keyframe(keyframe_id, db_session)
    shot = get_shot(keyframe.shot_id, db_session)
    shot_chars = get_shot_characters(shot.id, db_session)
    
    # 组装动作 prompt
    actions = []
    dialogues = []
    
    for sc in shot_chars:
        character = get_character(sc.character_id, db_session)
        if sc.action:
            actions.append(f"{character.name} {sc.action}")
        if sc.dialogue:
            dialogues.append(f"{character.name}: {sc.dialogue}")
    
    motion_prompt = f"""
{', '.join(actions)},
smooth natural motion, subtle facial expressions,
consistent lighting, cinematic motion
"""
    
    dialogue_text = '\n'.join(dialogues) if dialogues else None
    
    video_task = VideoTask(
        keyframe_id=keyframe_id,
        motion_prompt=motion_prompt.strip(),
        dialogue_text=dialogue_text,
        status='pending'
    )
    db_session.add(video_task)
    db_session.commit()
    
    return video_task
```

---

## 4. 依赖与环境要求

### 4.1 Python 依赖

```
# requirements.txt (剧本分析模块)
fastapi>=0.104.0
sqlalchemy>=2.0
alembic>=1.12                      # 数据库迁移
pydantic>=2.0                      # 数据校验
sentence-transformers>=2.2.0       # 语义匹配（~120MB 模型）
python-Levenshtein>=0.21           # 编辑距离计算
numpy>=1.24
httpx>=0.25                        # LLM API 调用
```

### 4.2 语义模型

```python
# 首次使用时自动下载，约 120MB
# 模型: paraphrase-multilingual-MiniLM-L12-v2
# 特性: 支持中英文，CPU 推理即可（<50ms/query），不占 GPU
```

---

## 5. API 接口规范

以下列出核心 API 端点，供前端对接。

### 5.1 项目管理

```
POST   /api/projects                    创建项目（上传剧本）
GET    /api/projects/{id}               获取项目状态
POST   /api/projects/{id}/analyze       启动分析流程
GET    /api/projects/{id}/progress      获取分析进度（SSE）
```

### 5.2 资产查询

```
GET    /api/projects/{id}/characters              角色列表
GET    /api/projects/{id}/characters/{cid}         角色详情（含所有片段和姿态）
GET    /api/projects/{id}/scenes                   场景列表
GET    /api/projects/{id}/scenes/{sid}             场景详情（含所有子视角）
GET    /api/projects/{id}/shots                    镜头列表
GET    /api/projects/{id}/shots/{sid}              镜头详情（含角色状态）
```

### 5.3 存疑处理

```
GET    /api/projects/{id}/ambiguous                存疑列表
POST   /api/projects/{id}/ambiguous/resolve-all    批量 LLM 判断
PATCH  /api/projects/{id}/ambiguous/{aid}          手动决策（merge/separate）
```

### 5.4 定角与生成

```
PATCH  /api/projects/{id}/characters/{cid}/cast    定角（上传基础形象）
POST   /api/projects/{id}/keyframes/assemble       批量组装关键帧
POST   /api/projects/{id}/video-tasks/assemble     批量组装视频任务
GET    /api/projects/{id}/keyframes                关键帧列表
GET    /api/projects/{id}/video-tasks              视频任务列表
```

---

## 6. 数据流示例

以下用一个具体例子演示完整数据流。

### 输入剧本片段

```
SCENE 1 - 客厅 - 白天

王建国穿着灰色西装，坐在沙发右侧，疲惫地放下手中的咖啡杯。

王建国：我真的累了。

小美从卧室门口探出头来，穿着白色睡衣，表情担忧。

小美：你还好吗？

---

SCENE 2 - 客厅 - 夜晚

王建国站在落地窗前，望着窗外的城市灯火。他解开了西装外套的扣子。

小美坐在沙发上，抱着一个靠枕，安静地看着他。
```

### 处理过程

**Step 1 分割** → 检测到 `SCENE` 分段标志，切分为 2 个 chapter

**Step 2a LLM 提取 (Chapter 0)** →

```json
{
  "characters": [
    {
      "name": "王建国",
      "description_fragments": ["穿灰色西装"],
      "poses": ["sitting"]
    },
    {
      "name": "小美",
      "description_fragments": ["穿白色睡衣"],
      "poses": ["standing_doorway"]
    }
  ],
  "scenes": [
    {
      "name": "客厅",
      "description_fragments": ["有沙发", "有卧室门口"],
      "views": [
        {"tag": "sofa_front", "description": "正对沙发方向，角色坐在沙发右侧"},
        {"tag": "bedroom_doorway", "description": "从卧室门口方向看向客厅"}
      ]
    }
  ],
  "shots": [
    {
      "scene_name": "客厅",
      "scene_view_tag": "sofa_front",
      "characters": [
        {
          "name": "王建国",
          "pose_tag": "sitting",
          "position": "沙发右侧",
          "expression": "疲惫",
          "action": "缓缓放下手中的咖啡杯",
          "dialogue": "我真的累了。"
        }
      ]
    },
    {
      "scene_name": "客厅",
      "scene_view_tag": "bedroom_doorway",
      "characters": [
        {
          "name": "小美",
          "pose_tag": "standing_doorway",
          "position": "卧室门口",
          "expression": "担忧",
          "action": "从门口探出头来",
          "dialogue": "你还好吗？"
        }
      ]
    }
  ]
}
```

**Step 2b Reconciler (Chapter 0)** → 数据库为空，全部新建

**Step 2a LLM 提取 (Chapter 1)** →

```json
{
  "characters": [
    {
      "name": "王建国",
      "description_fragments": [],
      "poses": ["standing"]
    },
    {
      "name": "小美",
      "description_fragments": [],
      "poses": ["sitting"]
    }
  ],
  "scenes": [
    {
      "name": "客厅",
      "description_fragments": ["有落地窗", "能看到城市灯火"],
      "views": [
        {"tag": "window_front", "description": "正对落地窗方向，角色背对镜头望向窗外"}
      ]
    }
  ],
  "shots": [
    {
      "scene_name": "客厅",
      "scene_view_tag": "window_front",
      "characters": [
        {
          "name": "王建国",
          "pose_tag": "standing",
          "position": "落地窗前",
          "expression": "沉思",
          "action": "解开西装外套的扣子",
          "dialogue": null
        }
      ]
    },
    {
      "scene_name": "客厅",
      "scene_view_tag": "sofa_front",
      "characters": [
        {
          "name": "小美",
          "pose_tag": "sitting",
          "position": "沙发上",
          "expression": "安静",
          "action": "抱着靠枕看着王建国",
          "dialogue": null
        }
      ]
    }
  ]
}
```

**Step 2b Reconciler (Chapter 1)** →
- "王建国" → L1 精确匹配 → 合并，新增 `standing` 姿态
- "小美" → L1 精确匹配 → 合并，新增 `sitting` 姿态
- "客厅" → L1 精确匹配 → 合并描述片段 + 新增 `window_front` 子视角
- `sofa_front` → L1 精确匹配已有视角 → 复用

### 最终数据库状态

**characters**: 王建国（灰色西装）, 小美（白色睡衣）

**character_poses**:
- 王建国: sitting, standing
- 小美: standing_doorway, sitting

**scenes**: 客厅（有沙发, 有卧室门口, 有落地窗, 能看到城市灯火）

**scene_views**:
- 客厅: sofa_front, bedroom_doorway, window_front

**shots**: 4个镜头，各自关联正确的场景视角和角色状态

---

## 7. 扩展点

以下功能可在基础架构上逐步添加：

| 扩展 | 说明 |
|------|------|
| **角色关系图** | 新增 `character_relationships` 表，记录角色间的关系（亲人/恋人/对手等），可从 LLM 提取 |
| **情绪曲线** | 为每个角色沿镜头顺序记录 expression，可视化情绪变化 |
| **镜头类型标注** | 在 shots 表新增 `shot_type` (close-up / medium / wide) 和 `camera_movement` (pan / zoom / static) |
| **音乐/氛围标注** | 新增 `shot_atmosphere` 字段，用于匹配 BGM 或调色风格 |
| **多语言台词** | 台词支持多语言列，配合 TTS 生成不同语种的配音 |
| **版本控制** | 为 keyframes 和 video_tasks 增加版本号，支持重新生成和对比 |

---

## 8. 开发优先级建议

1. **Phase 1 — 数据库 + 章节分割 + LLM 提取**: 建表，实现 Step 1 和 Step 2a，跑通单章提取
2. **Phase 2 — Reconciler**: 实现三级匹配和合并逻辑，跑通多章累积
3. **Phase 3 — 存疑处理 + 描述合成**: 完成 Step 3 和 Step 4
4. **Phase 4 — 关键帧/视频任务组装**: 完成 Step 6 和 Step 7，对接生成 pipeline
5. **Phase 5 — UI + 定角流程**: 前端页面和交互
