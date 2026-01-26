import { api } from './client'

interface TaskResponse {
  task_id: string
  message: string
}

interface TaskStatus {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'unknown'
  progress: number
  message: string
  result?: unknown
  error?: string
}

export const generationApi = {
  // 查询任务状态
  getTaskStatus: (taskId: string) =>
    api.get<TaskStatus>(`/projects/tasks/${taskId}/status`),

  // 生成单个角色图像
  generateCharacterImages: (
    projectId: string,
    characterId: string,
    imageTypes: string[],
  ) =>
    api.post<TaskResponse>(`/projects/${projectId}/generate/character-images`, {
      character_id: characterId,
      image_types: imageTypes,
    }),

  // 批量生成角色库
  generateCharacterLibrary: (projectId: string, imageTypes?: string[]) =>
    api.post<TaskResponse>(`/projects/${projectId}/generate/character-library`, {
      image_types: imageTypes,
    }),

  // 生成单个场景图
  generateSceneImage: (projectId: string, sceneId: string) =>
    api.post<TaskResponse>(`/projects/${projectId}/generate/scene-image`, {
      scene_id: sceneId,
    }),

  // 批量生成场景图
  generateAllSceneImages: (projectId: string) =>
    api.post<TaskResponse>(`/projects/${projectId}/generate/all-scene-images`),

  // 生成单个场景视频
  generateSceneVideo: (projectId: string, sceneId: string) =>
    api.post<TaskResponse>(`/projects/${projectId}/generate/scene-video`, {
      scene_id: sceneId,
    }),

  // 批量生成视频
  generateAllVideos: (projectId: string) =>
    api.post<TaskResponse>(`/projects/${projectId}/generate/all-videos`),
}
