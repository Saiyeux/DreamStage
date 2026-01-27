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

export const configApi = {
  getCharacterImageTemplates: () =>
    api.get<CharacterImageTemplates>('/config/character-image-templates'),

  getLLMConfig: () =>
    api.get<LLMConfig>('/config/llm'),

  updateLLMConfig: (config: Partial<LLMConfig>) =>
    api.put<LLMConfig>('/config/llm', config),
}
