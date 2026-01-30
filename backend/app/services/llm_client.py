import json
import httpx
from typing import Any, AsyncGenerator

from app.core.config import settings
from app.schemas.common import LLMStatus


class LLMClient:
    """LLM 客户端 - 支持 Ollama 和 LM Studio"""

    def __init__(self):
        self.llm_type = settings.LLM_TYPE
        self.model = settings.LLM_MODEL

        if self.llm_type == "ollama":
            self.base_url = settings.OLLAMA_URL
            self.api_endpoint = f"{self.base_url}/api/chat"
        else:  # lmstudio
            self.base_url = settings.LMSTUDIO_URL
            self.api_endpoint = f"{self.base_url}/v1/chat/completions"

    async def check_connection(self) -> LLMStatus:
        """检查 LLM 服务连接状态"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                if self.llm_type == "ollama":
                    response = await client.get(f"{self.base_url}/api/tags")
                else:
                    response = await client.get(f"{self.base_url}/v1/models")

                connected = response.status_code == 200
        except Exception:
            connected = False

        return LLMStatus(
            connected=connected,
            type=self.llm_type,
            url=self.base_url.replace("http://", ""),
        )

    async def chat(self, prompt: str, system_prompt: str = "") -> str:
        """发送对话请求"""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        async with httpx.AsyncClient(timeout=120.0) as client:
            if self.llm_type == "ollama":
                response = await client.post(
                    self.api_endpoint,
                    json={
                        "model": self.model,
                        "messages": messages,
                        "stream": False,
                        "options": {
                            "num_predict": 8192,  # 最大输出token数
                        },
                    },
                )
                data = response.json()
                return data.get("message", {}).get("content", "")
            else:  # lmstudio (OpenAI compatible)
                response = await client.post(
                    self.api_endpoint,
                    json={
                        "model": self.model,
                        "messages": messages,
                        "max_tokens": 8192,  # 最大输出token数
                    },
                )
                data = response.json()
                return data.get("choices", [{}])[0].get("message", {}).get("content", "")

    async def chat_stream(
        self, prompt: str, system_prompt: str = ""
    ) -> AsyncGenerator[str, None]:
        """流式发送对话请求，逐块返回内容"""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        # 使用较长的超时：连接 30 秒，读取 300 秒（5分钟，LLM 响应可能很慢）
        timeout = httpx.Timeout(connect=30.0, read=300.0, write=30.0, pool=30.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            if self.llm_type == "ollama":
                async with client.stream(
                    "POST",
                    self.api_endpoint,
                    json={
                        "model": self.model,
                        "messages": messages,
                        "stream": True,
                        "options": {
                            "num_predict": 8192,  # 最大输出token数（Ollama参数）
                        },
                    },
                ) as response:
                    async for line in response.aiter_lines():
                        if line:
                            try:
                                data = json.loads(line)
                                content = data.get("message", {}).get("content", "")
                                if content:
                                    yield content
                            except json.JSONDecodeError:
                                pass
            else:  # lmstudio (OpenAI compatible)
                async with client.stream(
                    "POST",
                    self.api_endpoint,
                    json={
                        "model": self.model,
                        "messages": messages,
                        "stream": True,
                        "max_tokens": 8192,  # 最大输出token数（OpenAI兼容参数）
                    },
                ) as response:
                    async for line in response.aiter_lines():
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                data = json.loads(data_str)
                                content = (
                                    data.get("choices", [{}])[0]
                                    .get("delta", {})
                                    .get("content", "")
                                )
                                if content:
                                    yield content
                            except json.JSONDecodeError:
                                pass

    async def chat_json(self, prompt: str, system_prompt: str = "") -> dict[str, Any]:
        """发送请求并解析 JSON 响应"""
        response_text = await self.chat(prompt, system_prompt)

        # 尝试提取 JSON
        try:
            # 尝试直接解析
            return json.loads(response_text)
        except json.JSONDecodeError:
            # 尝试提取 ```json ... ``` 代码块
            import re
            json_match = re.search(r"```json\s*([\s\S]*?)\s*```", response_text)
            if json_match:
                return json.loads(json_match.group(1))

            # 尝试提取 { ... } 或 [ ... ]
            json_match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", response_text)
            if json_match:
                return json.loads(json_match.group(1))

            raise ValueError(f"Failed to parse JSON from response: {response_text[:200]}")

    def _split_script_into_chunks(self, script_text: str, chunk_size: int = 8000) -> list[str]:
        """将剧本文本分割成多个块，尽量在段落边界处分割"""
        if len(script_text) <= chunk_size:
            return [script_text]

        chunks = []
        start = 0
        while start < len(script_text):
            end = start + chunk_size
            if end >= len(script_text):
                chunks.append(script_text[start:])
                break

            # 尝试在段落边界处分割
            split_pos = script_text.rfind('\n\n', start, end)
            if split_pos == -1 or split_pos <= start:
                split_pos = script_text.rfind('\n', start, end)
            if split_pos == -1 or split_pos <= start:
                split_pos = end

            chunks.append(script_text[start:split_pos])
            start = split_pos
            while start < len(script_text) and script_text[start] in '\n':
                start += 1

        return chunks

    def _merge_characters(self, existing: list[dict], new_chars: list[dict]) -> list[dict]:
        """合并角色列表，根据名字去重"""
        char_dict = {c.get("name", ""): c for c in existing}
        for char in new_chars:
            name = char.get("name", "")
            if name and name not in char_dict:
                char_dict[name] = char
        return list(char_dict.values())

    async def analyze_summary(self, script_text: str) -> dict[str, Any]:
        """生成剧情简介"""
        # 摘要使用较大的文本块以获取完整概览
        chunk_size = 16000
        text_to_analyze = script_text[:chunk_size]

        prompt = f"""你是一位专业的剧本分析师。请阅读以下剧本内容，生成一段简洁的剧情简介。

## 剧本内容
{text_to_analyze}

## 输出要求
请以JSON格式输出：
```json
{{
  "summary": "100-200字的剧情简介，包含主要人物和核心冲突",
  "main_conflict": "主要冲突点（一句话）",
  "tone": "故事基调（如：甜宠、虐恋、悬疑、喜剧等）",
  "estimated_duration_minutes": 预估时长（分钟，数字）
}}
```"""
        try:
            result = await self.chat_json(prompt)
            if isinstance(result, dict):
                return result
            elif isinstance(result, list) and len(result) > 0:
                first = result[0]
                if isinstance(first, dict):
                    return first
                return {"summary": str(first)}
            elif isinstance(result, str):
                return {"summary": result}
            return {"summary": ""}
        except Exception:
            return {"summary": ""}

    async def analyze_characters(self, script_text: str, chunk_size: int = 8000) -> dict[str, Any]:
        """分析角色信息 - 支持多块文本处理"""
        chunks = self._split_script_into_chunks(script_text, chunk_size)
        all_characters = []

        for chunk_idx, chunk in enumerate(chunks, 1):
            existing_names = [c.get("name", "") for c in all_characters]
            existing_hint = ""
            if existing_names:
                existing_hint = f"\n\n## 已识别的角色（请勿重复）\n{', '.join(existing_names)}"

            prompt = f"""你是一位专业的剧本分析师和角色设计师。请从以下剧本片段中提取所有角色的详细信息。

## 剧本内容（第{chunk_idx}部分，共{len(chunks)}部分）
{chunk}{existing_hint}

## 输出要求
请以JSON格式输出本片段中出现的所有角色（不要重复已识别的角色）：
```json
{{
  "characters": [
    {{
      "name": "角色姓名",
      "gender": "男/女",
      "age": "具体年龄或年龄段，如25岁、30多岁",
      "role_type": "主角/配角/龙套",
      "appearance": {{
        "hair": "发型和发色描述",
        "face": "脸型和五官特征",
        "body": "身材特征",
        "skin": "肤色"
      }},
      "personality": "性格特点",
      "clothing_style": "服装风格"
    }}
  ]
}}
```

外貌描述要具体，适合AI图像生成。如果剧本未明确描述，请根据角色身份合理推断。
如果本片段没有新角色，返回空数组。"""

            try:
                result = await self.chat_json(prompt)
                if isinstance(result, list):
                    new_chars = result
                elif isinstance(result, dict):
                    new_chars = result.get("characters", [])
                else:
                    new_chars = []
                
                all_characters = self._merge_characters(all_characters, new_chars)
            except Exception:
                continue

        return {"characters": all_characters}

    async def analyze_scenes(
        self, script_text: str, characters_info: list[dict], chunk_size: int = 8000
    ) -> dict[str, Any]:
        """分析分镜信息 - 支持多块文本处理"""
        characters_str = json.dumps(characters_info, ensure_ascii=False)
        chunks = self._split_script_into_chunks(script_text, chunk_size)
        all_scenes = []

        for chunk_idx, chunk in enumerate(chunks, 1):
            scene_start_num = len(all_scenes) + 1

            prompt = f"""你是一位专业的分镜脚本师和导演。请将以下剧本片段分解为详细的分镜信息。

## 剧本内容（第{chunk_idx}部分，共{len(chunks)}部分）
{chunk}

## 已识别的角色
{characters_str}

## 输出要求
请以JSON格式输出本片段的所有场景分镜（场景序号从{scene_start_num}开始）：
```json
{{
  "scenes": [
    {{
      "scene_number": {scene_start_num},
      "location": "地点名称",
      "time_of_day": "白天/黄昏/夜晚",
      "atmosphere": "场景氛围",
      "environment": {{
        "description": "环境详细视觉描述"
      }},
      "characters": [
        {{
          "character_name": "角色名",
          "position": "画面位置",
          "action": "动作描述",
          "expression": "表情"
        }}
      ],
      "dialogue": "对白内容",
      "camera": {{
        "shot_type": "特写/近景/中景/全景",
        "movement": "固定/推进/拉远/平移"
      }},
      "duration_seconds": 15
    }}
  ]
}}
```"""

            try:
                result = await self.chat_json(prompt)
                if isinstance(result, list):
                    new_scenes = result
                elif isinstance(result, dict):
                    new_scenes = result.get("scenes", [])
                else:
                    new_scenes = []
                    
                all_scenes.extend(new_scenes)
            except Exception:
                continue

        # 重新编号确保连续
        for idx, scene in enumerate(all_scenes, 1):
            scene["scene_number"] = idx

        return {"scenes": all_scenes}


llm_client = LLMClient()
