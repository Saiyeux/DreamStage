import { useState, useEffect } from 'react'
import type { Project, ServiceStatus } from '@/types'
import { healthApi, projectsApi, analysisApi, configApi } from '@/api'
import type { WorkflowConfig } from '@/api/config'
import { useProjectStore } from '@/stores/projectStore'
import { WorkflowSettingsModal } from './WorkflowSettingsModal'

interface ProjectSidebarProps {
  currentProject: Project | null
  onProjectChange?: (projectId: string) => void
  onAnalyzeCharacters?: (mode: 'quick' | 'deep') => void
  onAnalyzeScenes?: (sceneType: 'script' | 'simple') => void
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
  const [sceneMode, setSceneMode] = useState<'script' | 'simple'>('script')
  const [analysisMode, setAnalysisMode] = useState<'quick' | 'deep'>('quick')

  const [projects, setProjects] = useState<Project[]>([])
  const [healthStatus, setHealthStatus] = useState<ServiceStatus | null>(null)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [workflowConfig, setWorkflowConfig] = useState<WorkflowConfig | null>(null)

  // New Project State
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectFile, setNewProjectFile] = useState<File | null>(null)

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



  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      alert('请输入项目名称')
      return
    }

    setIsUploading(true)
    try {
      // If file is selected, use it. If not, create empty project.
      const response = await projectsApi.create(newProjectName, newProjectFile || undefined)

      if (response.id) {
        onProjectChange?.(response.id)
        window.location.reload()
      }
      setIsCreatingProject(false)
      setNewProjectName('')
      setNewProjectFile(null)
    } catch (err) {
      console.error('Create project failed:', err)
      alert('创建项目失败')
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
    <div className="w-72 bg-white/80 backdrop-blur-md border-r border-white/20 flex flex-col h-screen overflow-y-auto shadow-[2px_0_20px_rgba(0,0,0,0.02)] relative z-20">
      {/* Sidebar Header */}
      <div className="px-6 py-6 border-b border-indigo-50/50 flex-shrink-0 bg-gradient-to-b from-white/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-lg shadow-primary-500/20 ring-1 ring-white/50">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-500 tracking-tight">Studio Panel</h1>
            <p className="text-[11px] font-medium text-slate-400">Project Management</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
        {/* Project Selection */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">
              Current Project
            </label>
            {currentProject && (
              <button
                onClick={handleDeleteProject}
                className="text-xs text-red-400 hover:text-red-500 font-medium transition-colors px-2 py-0.5 rounded hover:bg-red-50"
                title="Delete Project"
              >
                Delete
              </button>
            )}
          </div>

          <div className="relative group">
            <div className="w-full text-sm mb-3 flex items-center bg-gradient-to-r from-violet-600 to-indigo-600 rounded-lg shadow-md shadow-indigo-500/20">
              <span className="flex-1 truncate pl-3 py-2 pr-10 text-white font-semibold">
                {currentProject?.name || 'Select a project...'}
              </span>
            </div>
            <select
              value={currentProject?.id || ''}
              onChange={(e) => onProjectChange?.(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            >
              <option value="" className="text-slate-900 bg-white">Select a project...</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id} className="text-slate-900 bg-white">
                  {project.name}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-3 pointer-events-none text-white/80 group-hover:text-white transition-colors z-20">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>

          </div>
          <div className="mt-4 pt-4 border-t border-slate-200/50">
            <button
              onClick={() => setIsCreatingProject(true)}
              disabled={isUploading}
              className="w-full btn btn-secondary justify-center text-xs py-2 bg-white/60 hover:bg-white hover:text-primary-600 border-dashed border-slate-300 hover:border-primary-300 shadow-none group"
            >
              {isUploading ? (
                <>
                  <span className="w-3 h-3 border-2 border-slate-300 border-t-primary-500 rounded-full animate-spin" />
                  Running...
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center group-hover:bg-primary-50 group-hover:text-primary-600 transition-colors">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <span>New Project</span>
                </div>
              )}
            </button>
          </div>

          {/* New Project Modal */}
          {isCreatingProject && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md p-6 animate-fade-in">
                <h2 className="text-xl font-bold text-slate-800 mb-6">Create New Project</h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Project Name</label>
                    <input
                      autoFocus
                      type="text"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                      placeholder="Enter project name..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Script File (Optional)</label>
                    <div className="relative">
                      <input
                        type="file"
                        accept=".txt,.pdf"
                        onChange={(e) => {
                          if (e.target.files) {
                            const file = e.target.files[0]
                            setNewProjectFile(file)
                            // Auto-fill name if empty
                            if (!newProjectName && file) {
                              setNewProjectName(file.name.replace(/\.[^/.]+$/, ""))
                            }
                          }
                        }}
                        className="hidden"
                        id="modal-file-upload"
                      />
                      <label
                        htmlFor="modal-file-upload"
                        className="flex items-center justify-between w-full bg-slate-50 border border-slate-300 border-dashed rounded-lg px-3 py-2 text-sm text-slate-500 cursor-pointer hover:border-primary-500 hover:text-primary-600 transition-colors"
                      >
                        <span className="truncate">{newProjectFile ? newProjectFile.name : "Click to upload script..."}</span>
                        <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded ml-2">Browse</span>
                      </label>
                      {newProjectFile && (
                        <button
                          onClick={() => setNewProjectFile(null)}
                          className="absolute right-[-24px] top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 p-1"
                          title="Remove file"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 pl-1">Supported formats: .txt, .pdf</p>
                  </div>
                </div>

                <div className="flex gap-3 mt-8">
                  <button
                    onClick={() => {
                      setIsCreatingProject(false)
                      setNewProjectName('')
                      setNewProjectFile(null)
                    }}
                    className="flex-1 btn bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 justify-center"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateProject}
                    disabled={!newProjectName.trim() || isUploading}
                    className="flex-1 btn btn-primary justify-center shadow-lg shadow-primary-500/20"
                  >
                    {isUploading ? 'Creating...' : (newProjectFile ? 'Create & Upload' : 'Create Empty Project')}
                  </button>
                </div>
              </div>
            </div>
          )}

        </section>

        {/* Project Summary */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">
              Summary
            </label>
            {currentProject && (
              <button
                onClick={handleGenerateSummary}
                disabled={isGeneratingSummary}
                className="text-xs text-primary-500 hover:text-primary-600 font-medium disabled:opacity-50 transition-colors flex items-center gap-1 hover:bg-primary-50 px-2 py-0.5 rounded"
              >
                {isGeneratingSummary ? (
                  <span className="w-3 h-3 border-2 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                )}
                {isGeneratingSummary ? 'Generating...' : 'Regenerate'}
              </button>
            )}
          </div>
          <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 rounded-xl p-3 min-h-[80px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]">
            {currentProject?.summary ? (
              <p className="text-xs text-slate-600 leading-relaxed font-normal text-balance">
                {currentProject.summary}
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic text-center py-4 flex flex-col items-center gap-2">
                <span className="text-xl opacity-30">📝</span>
                <span>No summary available.</span>
              </p>
            )}
          </div>
        </section>

        {/* Analysis Tools */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider pl-1">
              Analysis Tools
            </label>
            {isAnalyzing && (
              <button
                onClick={onStopAnalysis}
                className="flex items-center gap-1.5 px-2 py-0.5 bg-red-50 text-red-600 rounded border border-red-200 text-[10px] font-medium hover:bg-red-100 transition-colors animate-fade-in shadow-sm"
              >
                <span className="w-1.5 h-1.5 bg-red-500 rounded-sm animate-pulse" />
                STOP
              </button>
            )}
          </div>
          <div className="space-y-2">
            {/* Quick / Deep toggle */}
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
              <button
                onClick={() => setAnalysisMode('quick')}
                className={`flex-1 py-1 rounded-md transition-colors ${analysisMode === 'quick' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                ⚡ Quick
              </button>
              <button
                onClick={() => setAnalysisMode('deep')}
                className={`flex-1 py-1 rounded-md transition-colors ${analysisMode === 'deep' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                🔍 Deep
              </button>
            </div>

            {/* Character Analysis */}
            <button
              onClick={() => onAnalyzeCharacters?.(analysisMode)}
              disabled={!currentProject || isAnalyzing || !healthStatus?.llm?.connected}
              title={!healthStatus?.llm?.connected ? 'Please check LLM service' : ''}
              className={`w-full btn justify-between group relative overflow-hidden ${currentAnalyzing === 'characters'
                ? 'bg-primary-50 text-primary-700 border-primary-200 ring-1 ring-primary-200 shadow-md shadow-primary-500/10'
                : 'btn-secondary text-slate-600 bg-white/50 hover:bg-white hover:text-primary-600 hover:border-primary-200/50 hover:shadow-md hover:shadow-primary-500/5'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="flex items-center gap-2 relative z-10">
                <span className="text-lg group-hover:scale-110 transition-transform duration-300">👥</span>
                Character Analysis
              </span>
              {currentAnalyzing === 'characters' && (
                <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
              )}
            </button>

            {/* Drama / Bio toggle — scene analysis mode */}
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
              <button
                onClick={() => setSceneMode('script')}
                className={`flex-1 py-1 rounded-md transition-colors ${sceneMode === 'script' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                🎭 Drama
              </button>
              <button
                onClick={() => setSceneMode('simple')}
                className={`flex-1 py-1 rounded-md transition-colors ${sceneMode === 'simple' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                📖 Bio
              </button>
            </div>

            {/* Scene Analysis */}
            <button
              onClick={() => onAnalyzeScenes?.(sceneMode)}
              disabled={!currentProject || isAnalyzing || !healthStatus?.llm?.connected}
              title={!healthStatus?.llm?.connected ? 'Please check LLM service' : ''}
              className={`w-full btn justify-between group relative overflow-hidden ${currentAnalyzing === 'scenes'
                ? 'bg-primary-50 text-primary-700 border-primary-200 ring-1 ring-primary-200 shadow-md shadow-primary-500/10'
                : 'btn-secondary text-slate-600 bg-white/50 hover:bg-white hover:text-primary-600 hover:border-primary-200/50 hover:shadow-md hover:shadow-primary-500/5'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="flex items-center gap-2 relative z-10">
                <span className="text-lg group-hover:scale-110 transition-transform duration-300">🎬</span>
                Scene Analysis
              </span>
              {currentAnalyzing === 'scenes' && (
                <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
              )}
            </button>

            {/* Act Analysis */}
            <button
              onClick={onAnalyzeActs}
              disabled={!currentProject || isAnalyzing || !healthStatus?.llm?.connected}
              title={!healthStatus?.llm?.connected ? 'Please check LLM service' : ''}
              className={`w-full btn justify-between group relative overflow-hidden ${currentAnalyzing === 'acts'
                ? 'bg-primary-50 text-primary-700 border-primary-200 ring-1 ring-primary-200 shadow-md shadow-primary-500/10'
                : 'btn-secondary text-slate-600 bg-white/50 hover:bg-white hover:text-primary-600 hover:border-primary-200/50 hover:shadow-md hover:shadow-primary-500/5'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="flex items-center gap-2 relative z-10">
                <span className="text-lg group-hover:scale-110 transition-transform duration-300">🎭</span>
                Act Analysis
              </span>
              {currentAnalyzing === 'acts' && (
                <span className="w-2 h-2 bg-primary-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
              )}
            </button>
          </div>
        </section>

        {/* ComfyUI Settings */}
        <section className="pt-4 border-t border-dashed border-indigo-100/50">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-4 pl-1 flex items-center gap-2">
            <span>Workflow Settings</span>
            <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent"></div>
          </label>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5 ml-0.5">
                <label className="text-[11px] font-medium text-slate-500">Character Workflow</label>
                <button
                  onClick={() => openSettings('character')}
                  disabled={!selectedWorkflows.character}
                  className="text-slate-400 hover:text-primary-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed p-1 hover:bg-primary-50 rounded"
                  title="Configure Parameters"
                >
                  <span className="text-xs">⚙️</span>
                </button>
              </div>
              <div className="relative group/select">
                <select
                  value={selectedWorkflows.character || ''}
                  onChange={(e) => setSelectedWorkflow('character', e.target.value)}
                  className="w-full bg-white/50 hover:bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all cursor-pointer appearance-none shadow-sm pr-6"
                >
                  {workflowConfig?.character_workflows.map(wf => (
                    <option key={wf.id} value={wf.id}>{wf.name}</option>
                  ))}
                </select>
                <div className="absolute right-2.5 top-2.5 pointer-events-none text-slate-400 group-hover/select:text-primary-500 transition-colors">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5 ml-0.5">
                <label className="text-[11px] font-medium text-slate-500">Scene Workflow</label>
                <button
                  onClick={() => openSettings('scene')}
                  disabled={!selectedWorkflows.scene}
                  className="text-slate-400 hover:text-primary-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed p-1 hover:bg-primary-50 rounded"
                  title="Configure Parameters"
                >
                  <span className="text-xs">⚙️</span>
                </button>
              </div>
              <div className="relative group/select">
                <select
                  value={selectedWorkflows.scene || ''}
                  onChange={(e) => setSelectedWorkflow('scene', e.target.value)}
                  className="w-full bg-white/50 hover:bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all cursor-pointer appearance-none shadow-sm pr-6"
                >
                  {workflowConfig?.scene_workflows.map(wf => (
                    <option key={wf.id} value={wf.id}>{wf.name}</option>
                  ))}
                </select>
                <div className="absolute right-2.5 top-2.5 pointer-events-none text-slate-400 group-hover/select:text-primary-500 transition-colors">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5 ml-0.5">
                <label className="text-[11px] font-medium text-slate-500">Video Workflow</label>
                <button
                  onClick={() => openSettings('video')}
                  disabled={!selectedWorkflows.video}
                  className="text-slate-400 hover:text-primary-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed p-1 hover:bg-primary-50 rounded"
                  title="Configure Parameters"
                >
                  <span className="text-xs">⚙️</span>
                </button>
              </div>
              <div className="relative group/select">
                <select
                  value={selectedWorkflows.video || ''}
                  onChange={(e) => setSelectedWorkflow('video', e.target.value)}
                  className="w-full bg-white/50 hover:bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all cursor-pointer appearance-none shadow-sm pr-6"
                >
                  {workflowConfig?.video_workflows.map(wf => (
                    <option key={wf.id} value={wf.id}>{wf.name}</option>
                  ))}
                </select>
                <div className="absolute right-2.5 top-2.5 pointer-events-none text-slate-400 group-hover/select:text-primary-500 transition-colors">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
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
      <div className="p-4 border-t border-white/20 bg-transparent rounded-none">
        <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-3 pl-1">
          System Status
        </label>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs group">
            <span className="text-slate-600 flex items-center gap-1.5 font-medium">
              <span className="p-1 rounded-md bg-white shadow-sm border border-slate-100 group-hover:border-slate-200 transition-colors">
                <svg className="w-3 h-3 text-slate-400 group-hover:text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="3" strokeWidth="2" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
                </svg>
              </span>
              ComfyUI
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border shadow-sm ${healthStatus?.comfyui?.connected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100 shadow-emerald-500/5'
              : 'bg-red-50 text-red-700 border-red-100 shadow-red-500/5'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${healthStatus?.comfyui?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {healthStatus?.comfyui?.connected ? 'Connected' : 'Offline'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs group">
            <span className="text-slate-600 flex items-center gap-1.5 font-medium">
              <span className="p-1 rounded-md bg-white shadow-sm border border-slate-100 group-hover:border-slate-200 transition-colors">
                <svg className="w-3 h-3 text-slate-400 group-hover:text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
              LLM Service
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border shadow-sm ${healthStatus?.llm?.connected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100 shadow-emerald-500/5'
              : 'bg-red-50 text-red-700 border-red-100 shadow-red-500/5'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${healthStatus?.llm?.connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {healthStatus?.llm?.connected ? 'Connected' : 'Offline'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
