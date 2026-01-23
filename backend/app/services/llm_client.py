import json
import httpx
from typing import Any

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
                    },
                )
                data = response.json()
                return data.get("choices", [{}])[0].get("message", {}).get("content", "")

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

    async def analyze_summary(self, script_text: str) -> dict[str, Any]:
        """生成剧情简介"""
        prompt = f"""你是一位专业的剧本分析师。请阅读以下剧本内容，生成一段简洁的剧情简介。

## 剧本内容
{script_text[:8000]}

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
        return await self.chat_json(prompt)

    async def analyze_characters(self, script_text: str) -> dict[str, Any]:
        """分析角色信息"""
        prompt = f"""你是一位专业的剧本分析师和角色设计师。请从以下剧本中提取所有角色的详细信息。

## 剧本内容
{script_text[:8000]}

## 输出要求
请以JSON格式输出所有角色：
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

外貌描述要具体，适合AI图像生成。如果剧本未明确描述，请根据角色身份合理推断。"""
        return await self.chat_json(prompt)

    async def analyze_scenes(
        self, script_text: str, characters_info: list[dict]
    ) -> dict[str, Any]:
        """分析分镜信息"""
        characters_str = json.dumps(characters_info, ensure_ascii=False)

        prompt = f"""你是一位专业的分镜脚本师和导演。请将以下剧本分解为详细的分镜信息。

## 剧本内容
{script_text[:8000]}

## 已识别的角色
{characters_str}

## 输出要求
请以JSON格式输出所有场景分镜：
```json
{{
  "scenes": [
    {{
      "scene_number": 1,
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
        return await self.chat_json(prompt)


llm_client = LLMClient()
