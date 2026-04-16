import { api } from './client'
import type { Character, CharacterImage, CharacterAudio } from '@/types'

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

  uploadImage: (projectId: string, characterId: string, file: File, imageType = 'upload') => {
    const formData = new FormData()
    formData.append('image_file', file)
    formData.append('image_type', imageType)
    return api.upload<CharacterImage>(`/projects/${projectId}/characters/${characterId}/images/upload`, formData)
  },

  // Audio
  getAudios: (projectId: string, characterId: string) =>
    api.get<CharacterAudio[]>(`/projects/${projectId}/characters/${characterId}/audio`),

  uploadAudio: (projectId: string, characterId: string, file: File) => {
    const formData = new FormData()
    formData.append('audio_file', file)
    return api.upload<CharacterAudio>(`/projects/${projectId}/characters/${characterId}/audio/upload`, formData)
  },

  deleteAudio: (projectId: string, audioId: string) =>
    api.delete(`/projects/${projectId}/characters/audio/${audioId}`),

  generateTTS: (projectId: string, characterId: string, text: string, refAudioId?: string) =>
    api.post<{ task_id: string; message: string }>(
      `/projects/${projectId}/characters/${characterId}/tts/generate`,
      { text, ref_audio_id: refAudioId ?? null }
    ),
}
