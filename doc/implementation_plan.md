# System V2 Implementation Plan

## Goal Description
Implement the "Director's Workflow" (System V2).
Key features:
1.  **Finalize Role/Scene ("定角/定景")**: Lock assets (images + profile) for consistency.
2.  **Act Workbench**: A drag-and-drop interface to compose scenes using finalized assets.
3.  **Two-Step Generation**: Compose Keyframe -> Generate Video (Image-to-Video).

## User Review Required
> [!IMPORTANT]
> **Generation Pipeline Split**: Video generation is now a 2-step process. 
> We need to research/implement the "Keyframe Composition" step (merging characters into scene) before the Image-to-Video step works perfectly. 
> For now, we will focus on the UI flow and integrating the LTX I2V workflow (`video_ltx2_i2v.json`).

## Proposed Changes

### Backend
#### [MODIFY] [models.py](file:///e:/Github/ScriptConverter/backend/app/models.py)
*   **Character/Scene**:
    *   Add `is_finalized` (Boolean, default False).
    *   Add `finalized_metadata` (JSON). Stores the list of selected image paths and the profile/prompt snapshot at the time of finalization.
*   **Act/Script**:
    *   Update models to store structured script data (Acts/Scenes) parsed by keyword detection.

#### [MODIFY] [main.py](file:///e:/Github/ScriptConverter/backend/app/main.py)
*   Add endpoints: `/api/characters/{id}/finalize`, `/api/characters/{id}/unfinalize`.
*   *   Same for Scenes.
*   Update `Act` endpoints to handle "Composition" requests.

#### [MODIFY] [analysis_service.py](file:///e:/Github/ScriptConverter/backend/app/services/analysis_service.py)
*   Refactor to use Keyword-based detection for Acts/Scenes (e.g., regex for "Scene X", "Act Y").
*   Return raw text segments for frontend reference.

### Frontend
#### [MODIFY] [CharacterPage.tsx](file:///e:/Github/ScriptConverter/frontend/src/pages/CharacterPage.tsx) & ScenePage.tsx
*   Add "Finalize" button.
*   Implement "Selection Mode" in Gallery (Multi-select).
*   Implement "Locked View": When finalized, hide generation controls, show only selected images.

#### [NEW] [ActPage.tsx](file:///e:/Github/ScriptConverter/frontend/src/pages/ActPage.tsx)
*   **Libraries**: Install `dnd-kit` (or similar) for Drag-and-Drop.
*   **Components**:
    *   `AssetDock`: Horizontal scroll of finalized Character/Scene chips.
    *   `Stage`: Drop zone for current Act's assets.
    *   `DialogueEditor`: Dynamic inputs linked to dropped Characters.
    *   `ScriptSidebar`: View raw script/analysis.

### ComfyUI Integration
#### [NEW] [GenerationService]
*   Implement logic to load `video_ltx2_i2v.json`.
*   (Future) Implement Keyframe Composition workflow.

## Verification Plan

### Manual Verification
1.  **Test Finalization Logic**:
    *   Generate 3 character images.
    *   Select 2 and click "Finalize".
    *   Confirm UI locks and other images are hidden/archived (visual only).
    *   Refresh page, confirm state persists.
    *   Click "Unfinalize", confirm editing is restored.
2.  **Test Act Workbench**:
    *   Go to Act Page.
    *   Verify finalized assets appear in Dock.
    *   Drag Scene and Character to Stage.
    *   Add a dialogue line, assign to the dragged Character.
3.  **Test Video Trigger**:
    *   (Mock keyframe for now) Upload a dummy image as "Keyframe".
    *   Trigger "Generate Video".
    *   Verify backend calls ComfyUI with `video_ltx2_i2v.json` and the dummy image.
