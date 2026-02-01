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
  target_id?: string
  project_id?: string
}

export const generationApi = {
  // 查询任务状态
  getTaskStatus: (taskId: string) =>
    api.get<TaskStatus>(`/projects/tasks/${taskId}/status`),

  // 停止任务
  stopTask: (taskId: string) =>
    api.post<{ message: string }>(`/projects/tasks/${taskId}/stop`),

  // 获取项目中的活跃任务
  getActiveTasks: (projectId: string) =>
    api.get<Record<string, TaskStatus>>(`/projects/${projectId}/tasks/active`),

  generateCharacterImages: (
    projectId: string,
    characterId: string,
    imageTypes: string[],
    workflowId?: string,
    params?: Record<string, any>,
  ) =>
    api.post<TaskResponse>(`/projects/${projectId}/generate/character-images`, {
      character_id: characterId,
      image_types: imageTypes,
      workflow_id: workflowId,
      params,
    }),

  // 批量生成角色库
  generateCharacterLibrary: (projectId: string, imageTypes?: string[], workflowId?: string, params?: Record<string, any>) =>
    api.post<TaskResponse>(`/projects/${projectId}/generate/character-library`, {
      image_types: imageTypes,
      workflow_id: workflowId,
      params,
    }),

  // 生成单个场景图
  generateSceneImage: (projectId: string, sceneId: string, workflowId?: string, params?: Record<string, any>) =>
    api.post<TaskResponse>(`/projects/${projectId}/generate/scene-image`, {
      scene_id: sceneId,
      workflow_id: workflowId,
      params,
    }),

  generateAllSceneImages: (projectId: string, workflowId?: string, params?: Record<string, any>) =>
    api.post<TaskResponse>(`/projects/${projectId}/generate/all-scene-images`, {
      workflow_id: workflowId,
      params,
    }),



  generateAllVideos: (projectId: string, workflowId?: string, params?: Record<string, any>) =>
    api.post<TaskResponse>(`/projects/${projectId}/generate/all-videos`, {
      workflow_id: workflowId,
      params,
    }),
}
