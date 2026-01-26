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

export const configApi = {
  getCharacterImageTemplates: () =>
    api.get<CharacterImageTemplates>('/config/character-image-templates'),
}
