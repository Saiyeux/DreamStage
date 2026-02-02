import { api } from './client'
import type { Character, Scene } from '@/types'

interface AnalysisResponse {
  success: boolean
  message: string
  data: Record<string, unknown> | null
}

export const analysisApi = {
  // 生成剧情简介
  analyzeSummary: (projectId: string) =>
    api.post<AnalysisResponse>(`/projects/${projectId}/analyze/summary`),

  // 分析角色
  analyzeCharacters: (projectId: string) =>
    api.post<AnalysisResponse>(`/projects/${projectId}/analyze/characters`),

  // 分析分镜
  analyzeScenes: (projectId: string) =>
    api.post<AnalysisResponse>(`/projects/${projectId}/analyze/scenes`),

  // 获取角色列表
  getCharacters: (projectId: string) =>
    api.get<Character[]>(`/projects/${projectId}/characters`),

  // 更新角色
  updateCharacter: (projectId: string, characterId: string, data: Partial<Character>) =>
    api.put<Character>(`/projects/${projectId}/characters/${characterId}`, data),

  // 获取场景列表
  getScenes: (projectId: string) =>
    api.get<Scene[]>(`/projects/${projectId}/scenes`),

  // 更新场景
  updateScene: (projectId: string, sceneId: string, data: Partial<Scene>) =>
    api.put<Scene>(`/projects/${projectId}/scenes/${sceneId}`, data),

  // 删除角色图像
  deleteCharacterImage: (projectId: string, imageId: string) =>
    api.delete<{ success: boolean; message: string }>(`/projects/${projectId}/characters/images/${imageId}`),

  // 删除场景图像
  deleteSceneImage: (projectId: string, imageId: string) =>
    api.delete<{ success: boolean; message: string }>(`/projects/${projectId}/scenes/images/${imageId}`),

  // 删除场景视频
  deleteVideoClip: (projectId: string, videoId: string) =>
    api.delete<{ success: boolean; message: string }>(`/projects/${projectId}/scenes/videos/${videoId}`),

  // 获取分析状态
  getAnalysisStatus: (projectId: string) =>
    api.get<{ status: string; analysis_type: string | null; progress?: string }>(`/projects/${projectId}/analysis/status`),

  // 停止分析 (Add this)
  stopAnalysis: (projectId: string) =>
    api.post<{ message: string }>(`/projects/${projectId}/analysis/stop`),
}
