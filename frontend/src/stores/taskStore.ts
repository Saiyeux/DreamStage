import { create } from 'zustand'
import type { Task } from '@/types'

interface TaskState {
  tasks: Task[]

  addTask: (task: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  removeTask: (id: string) => void
  clearTasks: () => void
  getTaskById: (id: string) => Task | undefined
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],

  addTask: (task) =>
    set((state) => ({
      tasks: [...state.tasks, task],
    })),

  updateTask: (id, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    })),

  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    })),

  clearTasks: () => set({ tasks: [] }),

  getTaskById: (id) => get().tasks.find((t) => t.id === id),
}))
