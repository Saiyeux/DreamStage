import { api } from './client'
import type { Character } from '@/types'

interface CharacterUpdatePayload {
  name?: string
  gender?: string
  age?: string
  role_type?: string
  hair?: string
  face?: string
  body?: string
  skin?: string
  personality?: string
  clothing_style?: string
  base_prompt?: string
  main_image_id?: string
}

export const charactersApi = {
  update: (projectId: string, characterId: string, data: CharacterUpdatePayload) =>
    api.put<Character>(`/projects/${projectId}/characters/${characterId}`, data),
}
