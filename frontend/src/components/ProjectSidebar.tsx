import { useState, useEffect, useRef } from 'react'
import type { Project, ServiceStatus } from '@/types'
import { healthApi, projectsApi, analysisApi, configApi } from '@/api'
import type { WorkflowConfig } from '@/api/config'
import { useProjectStore } from '@/stores/projectStore'
import { WorkflowSettingsModal } from './WorkflowSettingsModal'

interface ProjectSidebarProps {
  currentProject: Project | null
  onProjectChange?: (projectId: string) => void
  onAnalyzeCharacters?: () => void
  onAnalyzeScenes?: () => void
  onAnalyzeActs?: () => void
  onStopAnalysis?: () => void
  isAnalyzing?: boolean
  currentAnalyzing?: 'characters' | 'scenes' | 'acts' | null
}

export function ProjectSidebar({
  currentProject,
  onProjectChange,
  onAnalyzeCharacters,
  onAnalyzeScenes,
  onAnalyzeActs,
  onStopAnalysis,
  isAnalyzing,
  currentAnalyzing
}: ProjectSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [healthStatus, setHealthStatus] = useState<ServiceStatus | null>(null)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [workflowConfig, setWorkflowConfig] = useState<WorkflowConfig | null>(null)

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false)
  const [settingsType, setSettingsType] = useState<'character' | 'scene' | 'video' | null>(null)

  const { selectedWorkflows, setSelectedWorkflow, workflowParams, setWorkflowParams, reset, setHealthStatus: setGlobalHealthStatus } = useProjectStore()

  const openSettings = (type: 'character' | 'scene' | 'video') => {
    setSettingsType(type)
    setShowSettings(true)
  }

  const handleSaveSettings = (params: Record<string, any>) => {
    if (settingsType) {
      setWorkflowParams(settingsType, params)
    }
  }

  const getCurrentParams = (type: 'character' | 'scene' | 'video') => {
    const userParams = workflowParams[type]
    if (Object.keys(userParams).length > 0) return userParams

    // If no user override, use default from config
    const workflowId = selectedWorkflows[type]
    if (workflowConfig && workflowId) {
      const workflowsKey = `${type}_workflows` as keyof WorkflowConfig
      // @ts-ignore - dynamic key access
      const wf = (workflowConfig[workflowsKey] as any[]).find((w: any) => w.id === workflowId)
      if (wf) return wf.params || {}
    }
    return {}
  }

  useEffect(() => {
    loadProjects()
    loadWorkflowConfig()
  }, [])

  const loadWorkflowConfig = async () => {
    try {
      const config = await configApi.getWorkflowConfig()
      setWorkflowConfig(config)

      // 设置初始默认值
      if (!selectedWorkflows.character && config.character_workflows.length > 0) {
        const defaultWf = config.character_workflows.find(w => w.default) || config.character_workflows[0]
        setSelectedWorkflow('character', defaultWf.id)
      }
      if (!selectedWorkflows.scene && config.scene_workflows.length > 0) {
        const defaultWf = config.scene_workflows.find(w => w.default) || config.scene_workflows[0]
        setSelectedWorkflow('scene', defaultWf.id)
      }
      if (!selectedWorkflows.video && config.video_workflows.length > 0) {
        const defaultWf = config.video_workflows.find(w => w.default) || config.video_workflows[0]
        setSelectedWorkflow('video', defaultWf.id)
      }
    } catch (err) {
      console.error('Load workflow config failed:', err)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  useEffect(() => {
    loadHealthStatus()
    const interval = setInterval(loadHealthStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  const loadProjects = async () => {
    try {
      const response = await projectsApi.list()
      setProjects(response.projects || [])
    } catch (err) {
      console.error('Load projects failed:', err)
    }
  }

  const loadHealthStatus = async () => {
    try {
      const response = await healthApi.check()
      setHealthStatus(response.services)
      setGlobalHealthStatus(response.services)
    } catch (err) {
      console.error('Load health status failed:', err)
    }
  }

  const handleGenerateSummary = async () => {
    if (!currentProject?.id || isGeneratingSummary) return

    setIsGeneratingSummary(true)
    try {
      await analysisApi.analyzeSummary(currentProject.id)
      alert('简介生成成功！')
      window.location.reload()
    } catch (err) {
      console.error('Generate summary failed:', err)
      alert('生成简介失败，请重试')
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const validTypes = ['.txt', '.pdf']
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    if (!validTypes.includes(fileExtension)) {
      alert('只支持 .txt 或 .pdf 格式的剧本文件')
      return
    }

    setIsUploading(true)
    try {
      const projectName = file.name.replace(/\.[^/.]+$/, '')
      const response = await projectsApi.create(projectName, file)
      alert('上传成功！')
      await loadProjects()
      if (response.id) {
        onProjectChange?.(response.id)
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      console.error('Upload failed:', err)
      alert('上传失败，请重试')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!currentProject?.id) return

    if (!window.confirm(`确定要删除项目"${currentProject.name}"吗？此操作不可恢复。`)) {
      return
    }

    try {
      await projectsApi.delete(currentProject.id)
      reset() // Clear store state
      alert('项目删除成功！')
      await loadProjects()
      onProjectChange?.('')
      window.location.reload()
    } catch (err) {
      console.error('Delete project failed:', err)
      alert('删除项目失败，请重试')
    }
  }

  return (
    <div className="w-72 bg-white border-r border-slate-200 flex flex-col h-screen overflow-y-auto shadow-sm">
      {/* Sidebar Header */}
      <div className="px-6 py-6 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-md shadow-primary-500/20">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 tracking-tight">Studio Panel</h1>
            <p className="text-[11px] font-medium text-slate-400">Project Management</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6 flex-1 overflow-y-auto">
        {/* Project Selection */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Current Project
            </label>
            {currentProject && (
              <button
                onClick={handleDeleteProject}
                className="text-xs text-red-500 hover:text-red-600 font-medium transition-colors"
                title="Delete Project"
              >
                Delete
              </button>
            )}
          </div>

          <select
            value={currentProject?.id || ''}
            onChange={(e) => onProjectChange?.(e.target.value)}
            className="w-full input text-sm mb-3 cursor-pointer"
          >
            <option value="">Select a project...</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.pdf"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full btn btn-secondary justify-center text-xs py-2"
          >
            {isUploading ? (
              <>
                <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                Uploading...
              </>
            ) : (
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>New Project</span>
              </div>
            )}
          </button>
        </section>

        {/* Project Summary */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Summary
            </label>
            {currentProject && (
              <button
                onClick={handleGenerateSummary}
                disabled={isGeneratingSummary}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50 transition-colors"
              >
                {isGeneratingSummary ? 'Generating...' : 'Regenerate'}
              </button>
            )}
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 min-h-[80px]">
            {currentProject?.summary ? (
              <p className="text-xs text-slate-600 leading-relaxed font-normal">
                {currentProject.summary}
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-4">
                No summary available.
              </p>
            )}
          </div>
        </section>

        {/* Analysis Tools */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Analysis Tools
            </label>
            {isAnalyzing && (
              <button
                onClick={onStopAnalysis}
                className="flex items-center gap-1.5 px-2 py-0.5 bg-red-50 text-red-600 rounded border border-red-200 text-[10px] font-medium hover:bg-red-100 transition-colors animate-fade-in"
              >
                <span className="w-1.5 h-1.5 bg-red-500 rounded-sm animate-pulse" />
                STOP
              </button>
            )}
          </div>
          <div className="space-y-2.5">
            <button
              onClick={onAnalyzeCharacters}
              disabled={!currentProject || isAnalyzing}
              className={`w-full btn justify-between group ${currentAnalyzing === 'characters'
                ? 'bg-primary-50 text-primary-700 border-primary-200 ring-1 ring-primary-200'
                : 'btn-secondary text-slate-600'
                }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-lg">👥</span>
                Character Analysis
              </span>
              {currentAnalyzing === 'characters' && (
                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-pulse" />
              )}
            </button>

            <button
              onClick={onAnalyzeScenes}
              disabled={!currentProject || isAnalyzing}
              className={`w-full btn justify-between group ${currentAnalyzing === 'scenes'
                ? 'bg-primary-50 text-primary-700 border-primary-200 ring-1 ring-primary-200'
                : 'btn-secondary text-slate-600'
                }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-lg">🎬</span>
                Scene Analysis
              </span>
              {currentAnalyzing === 'scenes' && (
                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-pulse" />
              )}
            </button>

            <button
              onClick={onAnalyzeActs}
              disabled={!currentProject || isAnalyzing}
              className={`w-full btn justify-between group ${currentAnalyzing === 'acts'
                ? 'bg-primary-50 text-primary-700 border-primary-200 ring-1 ring-primary-200'
                : 'btn-secondary text-slate-600'
                }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-lg">🎭</span>
                Act Analysis
              </span>
              {currentAnalyzing === 'acts' && (
                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-pulse" />
              )}
            </button>
          </div>
        </section>

        {/* ComfyUI Settings */}
        <section className="pt-2 border-t border-slate-100">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-4">
            ComfyUI Workflow Settings
          </label>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5 ml-0.5">
                <label className="text-[11px] font-medium text-slate-500">Character Workflow</label>
                <button
                  onClick={() => openSettings('character')}
                  disabled={!selectedWorkflows.character}
                  className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Configure Parameters"
                >
                  <span className="text-xs">⚙️</span>
                </button>
              </div>
              <select
                value={selectedWorkflows.character || ''}
                onChange={(e) => setSelectedWorkflow('character', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all cursor-pointer"
              >
                {workflowConfig?.character_workflows.map(wf => (
                  <option key={wf.id} value={wf.id}>{wf.name}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5 ml-0.5">
                <label className="text-[11px] font-medium text-slate-500">Scene Workflow</label>
                <button
                  onClick={() => openSettings('scene')}
                  disabled={!selectedWorkflows.scene}
                  className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Configure Parameters"
                >
                  <span className="text-xs">⚙️</span>
                </button>
              </div>
              <select
                value={selectedWorkflows.scene || ''}
                onChange={(e) => setSelectedWorkflow('scene', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all cursor-pointer"
              >
                {workflowConfig?.scene_workflows.map(wf => (
                  <option key={wf.id} value={wf.id}>{wf.name}</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5 ml-0.5">
                <label className="text-[11px] font-medium text-slate-500">Video Workflow</label>
                <button
                  onClick={() => openSettings('video')}
                  disabled={!selectedWorkflows.video}
                  className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Configure Parameters"
                >
                  <span className="text-xs">⚙️</span>
                </button>
              </div>
              <select
                value={selectedWorkflows.video || ''}
                onChange={(e) => setSelectedWorkflow('video', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all cursor-pointer"
              >
                {workflowConfig?.video_workflows.map(wf => (
                  <option key={wf.id} value={wf.id}>{wf.name}</option>
                ))}
              </select>
            </div>
          </div>
          {settingsType && (
            <WorkflowSettingsModal
              visible={showSettings}
              onClose={() => setShowSettings(false)}
              onSave={handleSaveSettings}
              initialParams={getCurrentParams(settingsType)}
              title={`${settingsType.charAt(0).toUpperCase() + settingsType.slice(1)} Settings`}
            />
          )}
        </section>
      </div>

      {/* System Status Footer */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-3">
          System Status
        </label>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 flex items-center gap-1.5">
              <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="3" strokeWidth="2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
              </svg>
              ComfyUI
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${healthStatus?.comfyui?.connected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-red-50 text-red-700 border-red-100'
              }`}>
              <span className={`w-1 h-1 rounded-full ${healthStatus?.comfyui?.connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {healthStatus?.comfyui?.connected ? 'Connected' : 'Offline'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 flex items-center gap-1.5">
              <svg className="w-3 h-3 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              LLM Service
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${healthStatus?.llm?.connected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-red-50 text-red-700 border-red-100'
              }`}>
              <span className={`w-1 h-1 rounded-full ${healthStatus?.llm?.connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {healthStatus?.llm?.connected ? 'Connected' : 'Offline'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
