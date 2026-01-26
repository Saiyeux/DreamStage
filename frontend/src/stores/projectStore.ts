import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Project, Character, Scene } from '@/types'

interface ProjectState {
  // 当前项目
  currentProject: Project | null
  characters: Character[]
  scenes: Scene[]

  // 项目列表
  projects: Project[]

  // 分析状态 (用于页面切换时保持状态)
  analysisState: {
    terminalOutput: string[]
    isStreaming: boolean
    terminalExpanded: boolean
    currentAnalyzing: 'characters' | 'scenes' | null
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
  reset: () => void
}

const initialAnalysisState = {
  terminalOutput: [],
  isStreaming: false,
  terminalExpanded: false,
  currentAnalyzing: null as 'characters' | 'scenes' | null,
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      currentProject: null,
      characters: [],
      scenes: [],
      projects: [],
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

      reset: () =>
        set({
          currentProject: null,
          characters: [],
          scenes: [],
          analysisState: { ...initialAnalysisState },
        }),
    }),
    {
      name: 'project-storage',
      storage: createJSONStorage(() => sessionStorage),
      // 只持久化关键数据
      partialize: (state) => ({
        currentProject: state.currentProject,
        characters: state.characters,
        scenes: state.scenes,
        analysisState: state.analysisState,
      }),
    }
  )
)
