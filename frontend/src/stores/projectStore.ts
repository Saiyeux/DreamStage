import { create } from 'zustand'
import type { Project, Character, Scene } from '@/types'

interface ProjectState {
  // 当前项目
  currentProject: Project | null
  characters: Character[]
  scenes: Scene[]

  // 项目列表
  projects: Project[]

  // Actions
  setCurrentProject: (project: Project | null) => void
  setCharacters: (characters: Character[]) => void
  setScenes: (scenes: Scene[]) => void
  setProjects: (projects: Project[]) => void
  updateCharacter: (id: string, updates: Partial<Character>) => void
  updateScene: (id: string, updates: Partial<Scene>) => void
  reset: () => void
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  characters: [],
  scenes: [],
  projects: [],

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

  reset: () =>
    set({
      currentProject: null,
      characters: [],
      scenes: [],
    }),
}))
