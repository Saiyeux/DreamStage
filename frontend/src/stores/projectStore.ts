import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Project, Character, Scene, Beat, ServiceStatus, Act, ActDialogueLine } from '@/types'



interface ProjectState {
  // 当前项目
  currentProject: Project | null
  characters: Character[]
  scenes: Scene[]
  beats: Beat[]
  activeStageSceneId: string | null
  healthStatus: ServiceStatus | null

  // 项目列表
  projects: Project[]

  // Acts (剧幕)
  acts: Act[]
  selectedActId: string | null

  // 分析状态 (用于页面切换时保持状态)
  analysisState: {
    terminalOutput: string[]
    isStreaming: boolean
    terminalExpanded: boolean
    currentAnalyzing: 'characters' | 'scenes' | 'acts' | null
  }

  // 工作流选择
  selectedWorkflows: {
    character: string | null
    scene: string | null
    video: string | null
  }

  // 工作流参数
  workflowParams: {
    character: Record<string, any>
    scene: Record<string, any>
    video: Record<string, any>
  }

  // Actions
  setCurrentProject: (project: Project | null) => void
  setCharacters: (characters: Character[]) => void
  setScenes: (scenes: Scene[]) => void
  setProjects: (projects: Project[]) => void
  updateCharacter: (id: string, updates: Partial<Character>) => void
  updateScene: (id: string, updates: Partial<Scene>) => void
  setAnalysisState: (state: Partial<ProjectState['analysisState']>) => void
  appendTerminalOutput: (line: string) => void
  updateLastTerminalLine: (content: string) => void
  setSelectedWorkflow: (type: 'character' | 'scene' | 'video', id: string | null) => void
  setWorkflowParams: (type: 'character' | 'scene' | 'video', params: Record<string, any>) => void

  // Act Workbench Actions
  setBeats: (beats: Beat[]) => void
  addBeat: (beat: Beat) => void
  updateBeat: (id: string, updates: Partial<Beat>) => void
  removeBeat: (id: string) => void
  reorderBeats: (beats: Beat[]) => void
  setActiveStageSceneId: (sceneId: string | null) => void
  setHealthStatus: (status: ServiceStatus | null) => void

  // Acts Actions (剧幕操作)
  setActs: (acts: Act[]) => void
  addAct: (act: Act) => void
  updateAct: (id: string, updates: Partial<Act>) => void
  removeAct: (id: string) => void
  setSelectedActId: (id: string | null) => void
  addDialogueLine: (actId: string, line: ActDialogueLine) => void
  updateDialogueLine: (actId: string, lineId: string, updates: Partial<ActDialogueLine>) => void
  removeDialogueLine: (actId: string, lineId: string) => void

  reset: () => void

}

const initialAnalysisState = {
  terminalOutput: [],
  isStreaming: false,
  terminalExpanded: false,
  currentAnalyzing: null as 'characters' | 'scenes' | 'acts' | null,
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      currentProject: null,
      characters: [],
      scenes: [],
      beats: [],
      activeStageSceneId: null,
      healthStatus: null,
      projects: [],
      acts: [],
      selectedActId: null,
      analysisState: { ...initialAnalysisState },

      setCurrentProject: (project) => set({ currentProject: project }),

      setCharacters: (characters) => set({ characters }),

      setScenes: (scenes) => set({ scenes }),

      setProjects: (projects) => set({ projects }),

      updateCharacter: (id, updates) =>
        set((state) => ({
          characters: state.characters.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      updateScene: (id, updates) =>
        set((state) => ({
          scenes: state.scenes.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          ),
        })),

      setAnalysisState: (newState) =>
        set((state) => ({
          analysisState: { ...state.analysisState, ...newState },
        })),

      appendTerminalOutput: (line) =>
        set((state) => ({
          analysisState: {
            ...state.analysisState,
            terminalOutput: [...state.analysisState.terminalOutput, line],
          },
        })),

      updateLastTerminalLine: (content) =>
        set((state) => {
          const output = [...state.analysisState.terminalOutput]
          if (output.length > 0) {
            output[output.length - 1] += content
          }
          return {
            analysisState: {
              ...state.analysisState,
              terminalOutput: output,
            },
          }
        }),

      selectedWorkflows: {
        character: null,
        scene: null,
        video: null,
      },
      workflowParams: {
        character: {},
        scene: {},
        video: {},
      },

      setSelectedWorkflow: (type, id) =>
        set((state) => ({
          selectedWorkflows: { ...state.selectedWorkflows, [type]: id },
        })),

      setWorkflowParams: (type, params) =>
        set((state) => ({
          workflowParams: { ...state.workflowParams, [type]: params },
        })),

      setBeats: (beats) => set({ beats }),

      addBeat: (beat) => set((state) => ({ beats: [...state.beats, beat] })),

      updateBeat: (id, updates) =>
        set((state) => ({
          beats: state.beats.map((b) => (b.id === id ? { ...b, ...updates } : b)),
        })),

      removeBeat: (id) => set((state) => ({ beats: state.beats.filter((b) => b.id !== id) })),

      reorderBeats: (beats) => set({ beats }),

      setActiveStageSceneId: (sceneId) => set({ activeStageSceneId: sceneId }),

      setHealthStatus: (status) => set({ healthStatus: status }),

      // Acts Actions
      setActs: (acts) => set({ acts }),

      addAct: (act) => set((state) => ({ acts: [...state.acts, act] })),

      updateAct: (id, updates) =>
        set((state) => ({
          acts: state.acts.map((a) => (a.id === id ? { ...a, ...updates } : a)),
        })),

      removeAct: (id) =>
        set((state) => ({
          acts: state.acts.filter((a) => a.id !== id),
          selectedActId: state.selectedActId === id ? null : state.selectedActId,
        })),

      setSelectedActId: (id) => set({ selectedActId: id }),

      addDialogueLine: (actId, line) =>
        set((state) => ({
          acts: state.acts.map((a) =>
            a.id === actId ? { ...a, dialogueLines: [...a.dialogueLines, line] } : a
          ),
        })),

      updateDialogueLine: (actId, lineId, updates) =>
        set((state) => ({
          acts: state.acts.map((a) =>
            a.id === actId
              ? {
                  ...a,
                  dialogueLines: a.dialogueLines.map((l) =>
                    l.id === lineId ? { ...l, ...updates } : l
                  ),
                }
              : a
          ),
        })),

      removeDialogueLine: (actId, lineId) =>
        set((state) => ({
          acts: state.acts.map((a) =>
            a.id === actId
              ? { ...a, dialogueLines: a.dialogueLines.filter((l) => l.id !== lineId) }
              : a
          ),
        })),

      reset: () =>
        set({
          currentProject: null,
          characters: [],
          scenes: [],
          beats: [],
          activeStageSceneId: null,
          acts: [],
          selectedActId: null,
          analysisState: { ...initialAnalysisState },
          selectedWorkflows: {
            character: null,
            scene: null,
            video: null,
          },
          workflowParams: {
            character: {},
            scene: {},
            video: {},
          },
        }),
    }),
    {
      name: 'project-storage',
      storage: createJSONStorage(() => localStorage), // 改用 localStorage 持久化
      // 只持久化关键数据
      partialize: (state) => ({
        currentProject: state.currentProject,
        characters: state.characters,
        scenes: state.scenes,
        beats: state.beats,
        activeStageSceneId: state.activeStageSceneId,
        acts: state.acts,
        selectedActId: state.selectedActId,
        analysisState: state.analysisState,
        selectedWorkflows: state.selectedWorkflows,
        workflowParams: state.workflowParams,
      }),
    }
  )
)
