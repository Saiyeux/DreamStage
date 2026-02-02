# Backend Implementation Plan: RAG & Act Analysis

This document details the technical steps to implement the backend optimizations proposed in `design_document.md`.

## 1. Environment & Dependencies

We need to introduce a vector database and embedding model for RAG.
**Important**: While LM Studio has internal RAG features, its API (`/v1/embeddings`) is the standard way to integrate programmatically. We will build our own RAG layer using ChromaDB and use LM Studio (or a local model) as the embedding provider.

### Modify `backend/requirements.txt`
Add the following:
```txt
chromadb>=0.4.0
sentence-transformers>=2.2.0  # Optional fallback if LM Studio embedding is slow
langchain>=0.1.0              # Optional, but helpful for text splitting
langchain-community>=0.0.10
langchain-huggingface>=0.0.1
```

## 2. RAG Service Implementation (`backend/app/services/rag_service.py`)

Create a new service to handle document indexing and retrieval.

**Key Responsibilities:**
- **Ingest**: specific script content -> Split into chunks (e.g., 500 chars with overlap) -> Embed -> Store in ChromaDB.
- **Query**: Query text -> Embed -> Retrieve top-k relevant chunks.
- **Persistence**: Store vector data in `backend/data/vector_store/{project_id}`.

**Pseudo-code Structure:**
```python
class RAGService:
    def __init__(self):
        # Option 1: Use Local SentenceTransformer (Faster, no API call)
        # self.embedding_model = ... 
        
        # Option 2: Use LM Studio Embedding API (If model supports it)
        # self.embedding_client = ...
        
        self.embedding_model = ... # Load SentenceTransformer('all-MiniLM-L6-v2') by default for speed
        self.client = chromadb.PersistentClient(path="./data/vector_store")

    async def index_script(self, project_id: str, script_text: str):
        collection = self.client.get_or_create_collection(f"project_{project_id}")
        chunks = self._split_text(script_text)
        embeddings = self.embedding_model.encode(chunks)
        collection.add(documents=chunks, embeddings=embeddings, ids=[...])

    async def search(self, project_id: str, query: str, k: int = 5) -> list[str]:
        collection = self.client.get_collection(f"project_{project_id}")
        results = collection.query(query_texts=[query], n_results=k)
        return results['documents'][0]
```

## 3. Refactoring `LLMClient` for RAG-Enhanced Analysis

Modify `backend/app/services/llm_client.py` to use `RAGService`.

### 3.1 Optimized Character Analysis
Instead of linear chunking, use a two-step process:

1.  **Discovery Pass**: Quickly scan the script (or use the linear method) just to get a *list of names*.
2.  **Deep Analysis Pass (RAG)**:
    For each character:
    - Query RAG: *"Extract physical appearance and personality for character {Name}"*
    - Construct Prompt: "Based on these context chunks: [Chunks], describe {Name}..."
    - This ensures all potential descriptions across the script are captured.

### 3.2 Optimized Scene Analysis
Keep the linear chunking for Scenes (as scenes are sequential), but use RAG to *enhance* environment descriptions.
- When parsing a scene location (e.g., "INT. KITCHEN"), query RAG: *"Description of Kitchen environment"*.
- Inject retrieved details into the prompt to get a richer `environment_desc`.

## 4. Act Analysis Implementation

Add `analyze_acts` method to `LLMClient`.

**Logic:**
1.  **Structure Detection**:
    - Try Regex first: Look for `ACT ONE`, `CHAPTER 1`, etc.
    - If Regex fails, ask LLM: "Identify the act breaks in this script. Return line numbers or markers."
2.  **Content Summarization**:
    - For each identified Act block:
        - Generate: Title, Summary, Main Conflict.
        - Output format matches frontend `Act` interface.

**New Schema (`backend/app/schemas/analysis.py`):**
```python
class ActAnalysisResult(BaseModel):
    act_number: int
    title: str
    summary: str
    start_scene: int
    end_scene: int
```

## 5. Migration Strategy

1.  **Phase 1**: Install dependencies and implement `RAGService` (basic string matching if embeddings are too heavy, but embeddings are preferred).
2.  **Phase 2**: Add `index_script` call when a project is created (`projects.py`).
3.  **Phase 3**: Update `analyze_characters` to use RAG.
4.  **Phase 4**: Implement `analyze_acts`.
