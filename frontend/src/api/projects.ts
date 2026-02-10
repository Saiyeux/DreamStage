import { api } from './client'
import type { Project } from '@/types'

interface ProjectListResponse {
  projects: Project[]
  total: number
}

interface StopResponse {
  message: string
  stopped: number
}

export const projectsApi = {
  list: () => api.get<ProjectListResponse>('/projects'),

  get: (id: string) => api.get<Project>(`/projects/${id}`),

  create: (name: string, scriptFile?: File) => {
    const formData = new FormData()
    formData.append('name', name)
    if (scriptFile) {
      formData.append('script_file', scriptFile)
    }
    return api.upload<Project>('/projects', formData)
  },

  update: (id: string, data: Partial<Project>) =>
    api.put<Project>(`/projects/${id}`, data),

  stop: (id: string) => api.post<StopResponse>(`/projects/${id}/stop`),

  delete: (id: string) => api.delete<{ message: string }>(`/projects/${id}`),
}
