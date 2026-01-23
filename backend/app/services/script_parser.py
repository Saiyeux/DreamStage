from pathlib import Path


class ScriptParser:
    """剧本解析器 - 支持 PDF 和 TXT"""

    async def parse(self, file_path: str) -> str:
        """解析剧本文件，返回文本内容"""
        path = Path(file_path)

        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        if path.suffix.lower() == ".txt":
            return await self._parse_txt(path)
        elif path.suffix.lower() == ".pdf":
            return await self._parse_pdf(path)
        else:
            raise ValueError(f"Unsupported file type: {path.suffix}")

    async def _parse_txt(self, path: Path) -> str:
        """解析 TXT 文件"""
        return path.read_text(encoding="utf-8")

    async def _parse_pdf(self, path: Path) -> str:
        """解析 PDF 文件"""
        try:
            import pypdf
            reader = pypdf.PdfReader(str(path))
            text_parts = []
            for page in reader.pages:
                text_parts.append(page.extract_text())
            return "\n".join(text_parts)
        except ImportError:
            # 如果没有安装 pypdf，返回提示
            raise ImportError(
                "pypdf is required for PDF parsing. "
                "Install it with: pip install pypdf"
            )


script_parser = ScriptParser()
