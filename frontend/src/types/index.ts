// 项目状态
export type ProjectStatus = 'draft' | 'analyzing' | 'analyzed' | 'generating' | 'completed'

// 项目
export interface Project {
  id: string
  name: string
  scriptPath: string
  scriptText: string
  summary: string
  status: ProjectStatus
  createdAt: string
  updatedAt: string
}

// 角色
export interface Character {
  id: string
  projectId: string
  name: string
  gender: string
  age: string
  roleType: string
  hair: string
  face: string
  body: string
  skin: string
  personality: string
  clothingStyle: string
  sceneNumbers: number[]
  basePrompt: string
  images: CharacterImage[]
  mainImageId?: string
  isFinalized: boolean
  finalizedMetadata?: Record<string, any>
}

export interface CharacterImage {
  id: string
  characterId: string
  imageType: string
  imagePath: string
  promptUsed: string
  negativePrompt: string
  seed: number
  isSelected: boolean
  isLoading?: boolean
}

// 场景
export interface Scene {
  id: string
  projectId: string
  sceneNumber: number
  location: string
  timeOfDay: string
  atmosphere: string
  environmentDesc: string
  characters: SceneCharacter[]
  dialogue: string
  shotType: string
  cameraMovement: string
  durationSeconds: number
  scenePrompt: string
  actionPrompt: string
  negativePrompt: string
  sceneImage?: SceneImage
  videoClip?: VideoClip
  isFinalized: boolean
  finalizedMetadata?: Record<string, any>
}

export interface SceneCharacter {
  characterId: string
  characterName: string
  position: string
  action: string
  expression: string
}

export interface SceneImage {
  id: string
  sceneId: string
  imagePath: string
  promptUsed: string
  seed: number
  isApproved: boolean
}

export interface VideoClip {
  id: string
  sceneId: string
  videoPath: string
  duration: number
  fps: number
  resolution: string
  promptUsed: string
  seed: number
  isApproved: boolean
}

// 服务状态
export interface ServiceStatus {
  llm: {
    connected: boolean
    type: 'ollama' | 'lmstudio'
    url: string
  }
  comfyui: {
    connected: boolean
    url: string
    models: Record<string, string[]>  // 按类型分组的模型列表
  }
}

// 任务
export interface Task {
  id: string
  type: 'character_image' | 'scene_image' | 'video' | 'export'
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  message: string
  result?: unknown
  error?: string
}
