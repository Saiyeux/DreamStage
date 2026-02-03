// 项目状态
export type ProjectStatus = 'draft' | 'analyzing' | 'analyzed' | 'generating' | 'completed'

// 项目
export interface Project {
  id: string
  name: string
  scriptPath: string
  scriptText: string
  summary: string
  actAnalysis?: Beat[] // Optional field for act analysis results
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


  scriptContent?: string
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
  isLoading?: boolean
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

export interface Beat {
  id: string
  sceneNumber: number // Added
  beatType: string    // Added (e.g., 'action', 'dialogue')
  description: string // Added (content of action or dialogue)
  characterName?: string
  camera?: {
    shot_type?: string
    angle?: string
    movement?: string
  }
  duration: number
  projectId: string
  // Legacy fields (optional compatibility)
  characterId?: string
  action?: string
  order?: number
}

// Act (剧幕)
export interface Act {
  id: string
  projectId: string
  name: string
  stageSceneId: string | null
  dialogueLines: ActDialogueLine[]
}

export interface ActDialogueLine {
  id: string
  characterId: string
  text: string
}
