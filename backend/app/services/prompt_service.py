"""提示词配置服务"""
import json
import re
from pathlib import Path
from typing import Any


# 配置文件目录
CONFIG_DIR = Path(__file__).parent.parent / "config" / "prompts"
WORKFLOW_CONFIG_FILE = Path(__file__).parent.parent / "config" / "workflow_config.json"


class PromptService:
    """提示词配置服务 - 从 JSON 文件读取和管理提示词模板"""

    def __init__(self):
        self._cache: dict[str, Any] = {}

    def _load_json(self, relative_path: str) -> dict[str, Any]:
        """加载 JSON 配置文件"""
        cache_key = relative_path
        if cache_key in self._cache:
            return self._cache[cache_key]

        file_path = CONFIG_DIR / relative_path
        if not file_path.exists():
            return {}

        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Pre-process templates: join lists into strings
            self._process_templates_in_data(data)
            self._cache[cache_key] = data
            return data

    def _process_templates_in_data(self, data: Any) -> None:
        """Recursively join 'template' lists into strings"""
        if isinstance(data, dict):
            for key, value in data.items():
                if key == "template" and isinstance(value, list):
                    data[key] = "\n".join(value)
                else:
                    self._process_templates_in_data(value)
        elif isinstance(data, list):
            for item in data:
                self._process_templates_in_data(item)

    def _save_json(self, relative_path: str, data: dict[str, Any]) -> bool:
        """保存 JSON 配置文件"""
        file_path = CONFIG_DIR / relative_path
        file_path.parent.mkdir(parents=True, exist_ok=True)

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        # 更新缓存
        self._cache[relative_path] = data
        return True

    def clear_cache(self):
        """清除缓存"""
        self._cache.clear()

    # ============ 文本分析提示词 ============

    def get_analysis_prompts(self) -> dict[str, Any]:
        """获取所有分析提示词配置"""
        return self._load_json("text/analysis_prompts.json")

    def get_summary_prompt(self, script_text: str) -> str:
        """获取剧情简介分析提示词"""
        config = self.get_analysis_prompts().get("summary", {})
        template = config.get("template", "")
        return template.replace("{{script_text}}", script_text)

    def get_characters_prompt(
        self,
        script_text: str,
        chunk_index: int,
        total_chunks: int,
        existing_names: list[str] | None = None,
        mode: str = "deep",
    ) -> str:
        """获取角色分析提示词
        
        Args:
            mode: 'quick' for fast shallow analysis, 'deep' for detailed analysis
        """
        # Select template based on mode
        template_key = "characters_quick" if mode == "quick" else "characters"
        prompts = self.get_analysis_prompts()
        config = prompts.get(template_key, prompts.get("characters", {}))
        template = config.get("template", "")

        # 构建已识别角色提示
        existing_hint = ""
        if existing_names:
            hint_template = config.get("existing_hint_template", "")
            existing_hint = hint_template.replace(
                "{{existing_names}}", ", ".join(existing_names)
            )

        prompt = template.replace("{{script_text}}", script_text)
        prompt = prompt.replace("{{chunk_index}}", str(chunk_index))
        prompt = prompt.replace("{{total_chunks}}", str(total_chunks))
        prompt = prompt.replace("{{existing_hint}}", existing_hint)

        return prompt

    def get_scenes_prompt(
        self,
        script_text: str,
        chunk_index: int,
        total_chunks: int,
        characters_json: str,
        scene_start_num: int,
    ) -> str:
        """获取分镜分析提示词"""
        config = self.get_analysis_prompts().get("scenes", {})
        template = config.get("template", "")

        prompt = template.replace("{{script_text}}", script_text)
        prompt = prompt.replace("{{chunk_index}}", str(chunk_index))
        prompt = prompt.replace("{{total_chunks}}", str(total_chunks))
        prompt = prompt.replace("{{characters_json}}", characters_json)
        prompt = prompt.replace("{{scene_start_num}}", str(scene_start_num))

        return prompt
 
    def get_acts_prompt(
         self,
         script_text: str,
         chunk_index: int,
         total_chunks: int,
     ) -> str:
         """获取幕/场面分析提示词"""
         config = self.get_analysis_prompts().get("acts", {})
         template = config.get("template", "")
 
         prompt = template.replace("{{script_text}}", script_text)
         prompt = prompt.replace("{{chunk_index}}", str(chunk_index))
         prompt = prompt.replace("{{total_chunks}}", str(total_chunks))
 
         return prompt

    def update_analysis_prompts(self, data: dict[str, Any]) -> bool:
        """更新分析提示词配置"""
        return self._save_json("text/analysis_prompts.json", data)

    # ============ 角色图提示词 ============

    def get_character_prompts_config(self) -> dict[str, Any]:
        """获取角色图提示词配置"""
        return self._load_json("img/character_prompts.json")

    def build_character_prompt(
        self,
        gender: str | None = None,
        age: str | None = None,
        hair: str | None = None,
        face: str | None = None,
        body: str | None = None,
        skin: str | None = None,
        clothing_style: str | None = None,
        personality: str | None = None,
        style_preset: str = "default",
    ) -> tuple[str, str]:
        """
        构建角色图生成提示词

        Returns:
            (positive_prompt, negative_prompt)
        """
        config = self.get_character_prompts_config()
        portrait_config = config.get("character_portrait", {})
        gender_mapping = config.get("gender_mapping", {})

        # 构建基础部分
        parts = []

        if gender:
            gender_en = gender_mapping.get(gender, gender_mapping.get("default", "person"))
            parts.append(f"a {gender_en}")
        if age:
            parts.append(f"{age} years old")
        if hair:
            parts.append(hair)
        if face:
            parts.append(face)
        if body:
            parts.append(body)
        if skin:
            parts.append(f"{skin} skin")
        if clothing_style:
            parts.append(clothing_style)
        # Note: personality is intentionally NOT included - it's non-visual

        base = ", ".join(parts) if parts else "a person"

        # 获取风格预设
        style_presets = config.get("style_presets", {})
        if style_preset in style_presets:
            preset = style_presets[style_preset]
            quality_suffix = preset.get("quality_suffix", portrait_config.get("quality_suffix", ""))
            negative_prompt = preset.get("negative_prompt", portrait_config.get("negative_prompt", ""))
        else:
            quality_suffix = portrait_config.get("quality_suffix", "")
            negative_prompt = portrait_config.get("negative_prompt", "")

        positive_prompt = f"{base}, {quality_suffix}"

        return positive_prompt, negative_prompt

    def update_character_prompts(self, data: dict[str, Any]) -> bool:
        """更新角色图提示词配置"""
        return self._save_json("img/character_prompts.json", data)

    # ============ 场景图提示词 ============

    def get_scene_prompts_config(self) -> dict[str, Any]:
        """获取场景图提示词配置"""
        return self._load_json("img/scene_prompts.json")

    def build_scene_prompt(
        self,
        location: str | None = None,
        time_of_day: str | None = None,
        atmosphere: str | None = None,
        environment_desc: str | None = None,
        characters_in_scene: list[dict] | None = None,
    ) -> tuple[str, str]:
        """
        构建场景图生成提示词

        Returns:
            (positive_prompt, negative_prompt)
        """
        config = self.get_scene_prompts_config()
        scene_config = config.get("scene_image", {})
        time_mapping = config.get("time_of_day_mapping", {})
        atmosphere_mapping = config.get("atmosphere_enhancements", {})

        parts = []

        if location:
            parts.append(location)
        if time_of_day:
            time_enhanced = time_mapping.get(time_of_day, time_of_day)
            parts.append(time_enhanced)
        if atmosphere:
            atmo_enhanced = atmosphere_mapping.get(atmosphere, atmosphere)
            parts.append(atmo_enhanced)
        if environment_desc:
            parts.append(environment_desc)

        # 添加角色信息
        if characters_in_scene:
            char_template = scene_config.get("character_template", "")
            for char in characters_in_scene:
                char_desc = char_template
                char_desc = char_desc.replace("{{character_name}}", char.get("character_name", ""))
                char_desc = char_desc.replace("{{position}}", char.get("position", ""))
                char_desc = char_desc.replace("{{action}}", char.get("action", ""))
                char_desc = char_desc.replace("{{expression}}", char.get("expression", ""))
                # 移除空占位符
                char_desc = re.sub(r",\s*,", ",", char_desc)
                char_desc = char_desc.strip(", ")
                if char_desc:
                    parts.append(char_desc)

        base = ", ".join(parts) if parts else "a scene"
        quality_suffix = scene_config.get("quality_suffix", "")
        negative_prompt = scene_config.get("negative_prompt", "")

        positive_prompt = f"{base}, {quality_suffix}"

        return positive_prompt, negative_prompt

    def update_scene_prompts(self, data: dict[str, Any]) -> bool:
        """更新场景图提示词配置"""
        return self._save_json("img/scene_prompts.json", data)

    # ============ 视频动作提示词 ============

    def get_action_prompts_config(self) -> dict[str, Any]:
        """获取视频动作提示词配置"""
        return self._load_json("video/action_prompts.json")

    def build_action_prompt(
        self,
        character_actions: list[str] | None = None,
        camera_movement: str | None = None,
    ) -> tuple[str, str]:
        """
        构建视频动作提示词

        Returns:
            (positive_prompt, negative_prompt)
        """
        config = self.get_action_prompts_config()
        video_config = config.get("video_action", {})
        camera_mapping = config.get("camera_movement_mapping", {})

        parts = []

        # 角色动作
        if character_actions:
            parts.extend(character_actions)

        # 镜头运动
        if camera_movement:
            camera_enhanced = camera_mapping.get(camera_movement, camera_movement)
            parts.append(camera_enhanced)

        # 默认动作
        if not parts:
            default_action = config.get("default_action", "subtle movement, gentle motion")
            parts.append(default_action)

        quality_suffix = video_config.get("quality_suffix", "")
        negative_prompt = video_config.get("negative_prompt", "")

        positive_prompt = ", ".join(parts) + ", " + quality_suffix

        return positive_prompt, negative_prompt

    def update_action_prompts(self, data: dict[str, Any]) -> bool:
        """更新视频动作提示词配置"""
        return self._save_json("video/action_prompts.json", data)

    def get_chunk_config(self) -> dict[str, Any]:
        """获取分块配置"""
        return self._load_json("text/chunk_config.json")

    def update_chunk_config(self, data: dict[str, Any]) -> bool:
        """更新分块配置"""
        return self._save_json("text/chunk_config.json", data)

    # ============ 剧幕配置 ============

    def get_act_config(self) -> dict[str, Any]:
        """获取剧幕检测配置"""
        return self._load_json("text/act_config.json")

    def update_act_config(self, data: dict[str, Any]) -> bool:
        """更新剧幕检测配置"""
        return self._save_json("text/act_config.json", data)

    def split_script_by_acts(self, script_text: str) -> list[dict[str, Any]]:
        """
        按剧幕关键词分割剧本文本
        
        Returns:
            包含 act_number, script_content, start_line, end_line 的字典列表
        """
        config = self.get_act_config()
        keywords = config.get("detection_keywords", ["ACT", "CHAPTER", "第.{1,3}幕"])
        min_length = config.get("min_act_length", 500)
        max_acts = config.get("max_acts", 50)

        # 构建正则表达式模式
        patterns = []
        for kw in keywords:
            try:
                re.compile(kw)
                patterns.append(kw)
            except re.error:
                patterns.append(re.escape(kw))

        if not patterns:
            # 无关键词，整个剧本作为一幕
            return [{
                "act_number": 1,
                "script_content": script_text,
                "start_line": 1,
                "end_line": script_text.count("\n") + 1
            }]

        combined_pattern = "|".join(f"({p})" for p in patterns)
        
        try:
            # 匹配行首的关键词
            full_pattern = rf"^.*(?:{combined_pattern}).*$"
            matches = list(re.finditer(full_pattern, script_text, re.MULTILINE | re.IGNORECASE))
        except re.error:
            return [{
                "act_number": 1,
                "script_content": script_text,
                "start_line": 1,
                "end_line": script_text.count("\n") + 1
            }]

        if not matches:
            # 没有找到关键词，整个剧本作为一幕
            return [{
                "act_number": 1,
                "script_content": script_text,
                "start_line": 1,
                "end_line": script_text.count("\n") + 1
            }]

        acts = []
        lines = script_text.split("\n")
        
        for i, match in enumerate(matches[:max_acts]):
            start_pos = match.start()
            if i == len(matches) - 1:
                end_pos = len(script_text)
            else:
                end_pos = matches[i + 1].start()

            act_content = script_text[start_pos:end_pos].strip()
            
            # 计算行号
            start_line = script_text[:start_pos].count("\n") + 1
            end_line = script_text[:end_pos].count("\n") + 1

            # 如果内容太短且不是第一幕，合并到前一幕
            if len(act_content) < min_length and acts:
                acts[-1]["script_content"] += "\n\n" + act_content
                acts[-1]["end_line"] = end_line
            else:
                acts.append({
                    "act_number": len(acts) + 1,
                    "script_content": act_content,
                    "start_line": start_line,
                    "end_line": end_line
                })

        # 处理第一个关键词前的内容（序幕）
        preamble = script_text[:matches[0].start()].strip()
        if preamble and len(preamble) >= min_length:
            preamble_act = {
                "act_number": 0,
                "script_content": preamble,
                "start_line": 1,
                "end_line": script_text[:matches[0].start()].count("\n") + 1
            }
            acts.insert(0, preamble_act)
            # 重新编号
            for idx, act in enumerate(acts):
                act["act_number"] = idx + 1

        return acts if acts else [{
            "act_number": 1,
            "script_content": script_text,
            "start_line": 1,
            "end_line": script_text.count("\n") + 1
        }]

    def split_script_by_chapters(self, script_text: str) -> list[str]:
        """
        按章节分隔符分割剧本文本

        Returns:
            分割后的文本块列表
        """
        config = self.get_chunk_config()
        delimiters = config.get("chapter_delimiters", [])
        fallback_size = config.get("fallback_chunk_size", 8000)
        min_size = config.get("min_chunk_size", 1000)
        max_size = config.get("max_chunk_size", 16000)
        mode = config.get("chunk_mode", "chapter")

        # 如果模式是 size，直接按大小分割
        if mode == "size":
            return self._split_by_size(script_text, fallback_size)

        # 构建正则表达式模式
        if not delimiters:
            return self._split_by_size(script_text, fallback_size)

        # 合并所有分隔符为一个正则模式
        patterns = []
        for d in delimiters:
            # 尝试编译为正则表达式，如果失败则转义
            try:
                re.compile(d)
                # 编译成功，可能是有效的正则表达式
                patterns.append(d)
            except re.error:
                # 编译失败，转义为字面量
                patterns.append(re.escape(d))

        combined_pattern = "|".join(f"({p})" for p in patterns)

        # 查找所有分隔符位置
        try:
            matches = list(re.finditer(combined_pattern, script_text, re.IGNORECASE))
        except re.error:
            # 正则表达式错误，回退到按大小分割
            return self._split_by_size(script_text, fallback_size)

        if not matches:
            # 没有找到分隔符，回退到按大小分割
            return self._split_by_size(script_text, fallback_size)

        # 按分隔符分割
        chunks = []
        start = 0

        for match in matches:
            # 获取分隔符前的内容
            chunk_text = script_text[start:match.start()].strip()

            if chunk_text and len(chunk_text) >= min_size:
                # 如果块太大，进一步分割
                if len(chunk_text) > max_size:
                    sub_chunks = self._split_by_size(chunk_text, fallback_size)
                    chunks.extend(sub_chunks)
                else:
                    chunks.append(chunk_text)
            elif chunk_text and chunks:
                # 块太小，合并到上一块
                chunks[-1] += "\n\n" + chunk_text

            start = match.start()

        # 处理最后一块
        last_chunk = script_text[start:].strip()
        if last_chunk:
            if len(last_chunk) > max_size:
                sub_chunks = self._split_by_size(last_chunk, fallback_size)
                chunks.extend(sub_chunks)
            elif len(last_chunk) >= min_size:
                chunks.append(last_chunk)
            elif chunks:
                chunks[-1] += "\n\n" + last_chunk
            else:
                chunks.append(last_chunk)

        return chunks if chunks else [script_text]

    def split_script_by_scenes(self, script_text: str) -> list[str]:
        """
        按场景标题 (INT./EXT.) 分割剧本
        """
        # 匹配场景标题的正则 (多行模式)
        # 支持: INT., EXT., INT/EXT., I/E.
        pattern = r"^\s*(?:INT\.|EXT\.|INT/EXT\.|I/E\.).*$"
        
        matches = list(re.finditer(pattern, script_text, re.MULTILINE | re.IGNORECASE))
        
        if not matches:
            # 如果没找到场景标题，回退到按章节或大小分割
            return self.split_script_by_chapters(script_text)
            
        chunks = []
        for i, match in enumerate(matches):
            start = match.start()
            # 如果是最后一个匹配，到文本结束
            if i == len(matches) - 1:
                end = len(script_text)
            else:
                end = matches[i+1].start()
                
            chunk = script_text[start:end].strip()
            if chunk:
                chunks.append(chunk)
                
        # 处理第一个场景前的内容（如果有的话，且有意义的内容）
        preamble = script_text[:matches[0].start()].strip()
        if preamble and len(preamble) > 50: # 忽略太短的前言
            chunks.insert(0, preamble)
            
        return chunks

    def _split_by_size(self, text: str, chunk_size: int) -> list[str]:
        """按字符数分割文本，尽量在段落边界处分割"""
        if len(text) <= chunk_size:
            return [text]

        chunks = []
        start = 0

        while start < len(text):
            end = start + chunk_size
            if end >= len(text):
                chunks.append(text[start:])
                break

            # 尝试在段落边界处分割
            split_pos = text.rfind("\n\n", start, end)
            if split_pos == -1 or split_pos <= start:
                split_pos = text.rfind("\n", start, end)
            if split_pos == -1 or split_pos <= start:
                split_pos = end

            chunks.append(text[start:split_pos].strip())
            start = split_pos

            # 跳过换行符
            while start < len(text) and text[start] in "\n":
                start += 1

        return chunks

    # ============ 工作流配置 ============

    def get_workflow_config(self) -> dict[str, Any]:
        """获取工作流配置"""
        if not WORKFLOW_CONFIG_FILE.exists():
            return {
                "character_workflows": [],
                "scene_workflows": [],
                "video_workflows": [],
                "workflow_directory": "comfyui_workflows",
            }

        with open(WORKFLOW_CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)

    def update_workflow_config(self, data: dict[str, Any]) -> bool:
        """更新工作流配置"""
        with open(WORKFLOW_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True

    def get_default_workflow(self, workflow_type: str) -> dict[str, Any] | None:
        """
        获取指定类型的默认工作流配置

        Args:
            workflow_type: 'character', 'scene', 或 'video'

        Returns:
            工作流配置字典，包含 workflow_file, params 等
        """
        config = self.get_workflow_config()
        workflows_key = f"{workflow_type}_workflows"
        workflows = config.get(workflows_key, [])

        # 找默认工作流
        for wf in workflows:
            if wf.get("default", False):
                return wf

        # 没有默认的则返回第一个
        return workflows[0] if workflows else None

    def get_workflow_by_id(self, workflow_type: str, workflow_id: str) -> dict[str, Any] | None:
        """
        根据 ID 获取工作流配置

        Args:
            workflow_type: 'character', 'scene', 或 'video'
            workflow_id: 工作流 ID

        Returns:
            工作流配置字典
        """
        config = self.get_workflow_config()
        workflows_key = f"{workflow_type}_workflows"
        workflows = config.get(workflows_key, [])

        for wf in workflows:
            if wf.get("id") == workflow_id:
                return wf

        return None


# 全局实例
prompt_service = PromptService()
