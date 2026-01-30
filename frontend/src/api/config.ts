import { api } from './client'

export interface ImageType {
  id: string
  label: string
  prompt_suffix: string
}

export interface CharacterImageTemplates {
  default_types: ImageType[]
  templates: Record<string, ImageType[]>
  available_types: ImageType[]
}

export interface LLMConfig {
  chunkSize: number
  contextLength: number
}

// 分析提示词配置
export interface AnalysisPromptConfig {
  system: string
  template: string
  existing_hint_template?: string
}

export interface AnalysisPromptsConfig {
  summary: AnalysisPromptConfig
  characters: AnalysisPromptConfig
  scenes: AnalysisPromptConfig
}

// 角色图提示词配置
export interface CharacterPromptsConfig {
  character_portrait: {
    description: string
    base_template: string
    quality_suffix: string
    negative_prompt: string
  }
  gender_mapping: Record<string, string>
  style_presets: Record<string, {
    quality_suffix: string
    negative_prompt: string
  }>
}

// 场景图提示词配置
export interface ScenePromptsConfig {
  scene_image: {
    description: string
    base_template: string
    character_template: string
    quality_suffix: string
    negative_prompt: string
  }
  time_of_day_mapping: Record<string, string>
  atmosphere_enhancements: Record<string, string>
}

// 视频动作提示词配置
export interface ActionPromptsConfig {
  video_action: {
    description: string
    quality_suffix: string
    negative_prompt: string
  }
  camera_movement_mapping: Record<string, string>
  action_enhancements: Record<string, string>
  default_action: string
}

// 分块配置
export interface ChunkConfig {
  chunk_mode: 'chapter' | 'size'
  chapter_delimiters: string[]
  fallback_chunk_size: number
  min_chunk_size: number
  max_chunk_size: number
  description?: Record<string, string>
}

// 工作流配置
export interface WorkflowParams {
  width?: number
  height?: number
  steps?: number
  cfg?: number
  guidance?: number
  model?: string
  ip_adapter_weight?: number
  video_length?: number
  frame_rate?: number
  [key: string]: string | number | undefined
}

export interface WorkflowItem {
  id: string
  name: string
  description: string
  workflow_file: string
  default?: boolean
  params: WorkflowParams
}

export interface WorkflowConfig {
  character_workflows: WorkflowItem[]
  scene_workflows: WorkflowItem[]
  video_workflows: WorkflowItem[]
  workflow_directory: string
  description?: Record<string, string>
}

export const configApi = {
  getCharacterImageTemplates: () =>
    api.get<CharacterImageTemplates>('/config/character-image-templates'),

  updateCharacterImageTemplates: (data: CharacterImageTemplates) =>
    api.put<CharacterImageTemplates>('/config/character-image-templates', data),

  getLLMConfig: () =>
    api.get<LLMConfig>('/config/llm'),

  updateLLMConfig: (config: Partial<LLMConfig>) =>
    api.put<LLMConfig>('/config/llm', config),

  // 分析提示词
  getAnalysisPrompts: () =>
    api.get<AnalysisPromptsConfig>('/config/prompts/analysis'),

  updateAnalysisPrompts: (data: AnalysisPromptsConfig) =>
    api.put('/config/prompts/analysis', data),

  // 角色图提示词
  getCharacterPrompts: () =>
    api.get<CharacterPromptsConfig>('/config/prompts/character'),

  updateCharacterPrompts: (data: CharacterPromptsConfig) =>
    api.put('/config/prompts/character', data),

  // 场景图提示词
  getScenePrompts: () =>
    api.get<ScenePromptsConfig>('/config/prompts/scene'),

  updateScenePrompts: (data: ScenePromptsConfig) =>
    api.put('/config/prompts/scene', data),

  // 视频动作提示词
  getActionPrompts: () =>
    api.get<ActionPromptsConfig>('/config/prompts/action'),

  updateActionPrompts: (data: ActionPromptsConfig) =>
    api.put('/config/prompts/action', data),

  // 分块配置
  getChunkConfig: () =>
    api.get<ChunkConfig>('/config/chunk'),

  updateChunkConfig: (data: ChunkConfig) =>
    api.put('/config/chunk', data),

  // 工作流配置
  getWorkflowConfig: () =>
    api.get<WorkflowConfig>('/config/workflows'),

  updateWorkflowConfig: (data: WorkflowConfig) =>
    api.put('/config/workflows', data),
}
