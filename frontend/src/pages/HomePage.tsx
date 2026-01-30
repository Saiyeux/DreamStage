import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ServiceStatus, Project } from '@/types'
import { healthApi, projectsApi, configApi } from '@/api'
import type { LLMConfig } from '@/api/config'
import { useProjectStore } from '@/stores/projectStore'

const defaultStatus: ServiceStatus = {
  llm: { connected: false, type: 'ollama', url: 'localhost:11434' },
  comfyui: { connected: false, url: 'localhost:8000', models: {} },
}

export function HomePage() {
  const navigate = useNavigate()
  const { currentProject, reset: resetStore } = useProjectStore()
  const [status, setStatus] = useState<ServiceStatus>(defaultStatus)
  const [recentProjects, setRecentProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // LLM 配置
  const [llmConfig, setLLMConfig] = useState<LLMConfig | null>(null)
  const [showLLMConfig, setShowLLMConfig] = useState(false)
  const [editingChunkSize, setEditingChunkSize] = useState('')
  const [editingContextLength, setEditingContextLength] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)

  const checkServices = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await healthApi.check()
      setStatus(response.services)
    } catch (err) {
      setError('无法连接后端服务')
      console.error('Health check failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadProjects = async () => {
    try {
      const response = await projectsApi.list()
      setRecentProjects(response.projects.slice(0, 5))
    } catch (err) {
      console.error('Failed to load projects:', err)
    }
  }

  const loadLLMConfig = async () => {
    try {
      const config = await configApi.getLLMConfig()
      setLLMConfig(config)
      setEditingChunkSize(String(config.chunkSize))
      setEditingContextLength(String(config.contextLength))
    } catch (err) {
      console.error('Failed to load LLM config:', err)
    }
  }

  const saveLLMConfig = async () => {
    setSavingConfig(true)
    try {
      const config = await configApi.updateLLMConfig({
        chunkSize: parseInt(editingChunkSize) || 8000,
        contextLength: parseInt(editingContextLength) || 32000,
      })
      setLLMConfig(config)
      setShowLLMConfig(false)
    } catch (err) {
      console.error('Failed to save LLM config:', err)
      alert('保存失败')
    } finally {
      setSavingConfig(false)
    }
  }

  useEffect(() => {
    checkServices()
    loadProjects()
    loadLLMConfig()
  }, [])

  const StatusCard = ({
    label,
    connected,
    detail,
  }: {
    label: string
    connected: boolean
    detail?: string
  }) => (
    <div className={`card p-5 text-center transition-all duration-300 hover:shadow-lg hover:scale-[1.02] ${connected ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'
      }`}>
      <div className={`text-4xl mb-3 transition-all duration-300 ${connected ? 'animate-pulse scale-110' : 'grayscale opacity-50'}`}>
        {connected ? '🟢' : '🔴'}
      </div>
      <div className="font-semibold text-slate-800 text-lg mb-1">{label}</div>
      <div className={`text-sm font-medium ${connected ? 'text-green-600' : 'text-red-500'}`}>
        {connected ? '✓ Connected' : '✗ Disconnected'}
      </div>
      {detail && <div className="text-xs text-slate-500 mt-2 font-mono bg-white/50 px-2 py-1 rounded inline-block">{detail}</div>}
    </div>
  )

  const statusLabels: Record<string, string> = {
    draft: 'Draft',
    analyzing: 'Analyzing',
    analyzed: 'Analyzed',
    generating: 'Generating',
    completed: 'Completed',
  }

  const isActiveStatus = (status: string) => {
    return status === 'analyzing' || status === 'generating'
  }

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this project?')) return

    try {
      await projectsApi.delete(projectId)
      setRecentProjects(prev => prev.filter(p => p.id !== projectId))
      if (currentProject?.id === projectId) {
        resetStore()
      }
    } catch (err) {
      console.error('Delete project failed:', err)
      alert('Failed to delete project')
    }
  }

  const handleStopProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to stop active tasks?')) return

    try {
      const result = await projectsApi.stop(projectId)
      await loadProjects()
      alert(`Stopped ${result.stopped} tasks`)
    } catch (err) {
      console.error('Stop project failed:', err)
      alert('Failed to stop tasks')
    }
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-700 via-primary-600 to-indigo-800 rounded-3xl p-12 text-white text-center shadow-2xl">
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20"></div>
        <div className="relative z-10">
          <h2 className="text-5xl md:text-6xl font-bold mb-4 font-display tracking-tight text-white drop-shadow-sm">
            AI Script Studio
          </h2>
          <p className="text-xl text-indigo-100 mb-2 max-w-2xl mx-auto font-light">Transform scripts into videos with advanced AI pipeline</p>
          <div className="flex gap-2 justify-center text-xs lg:text-sm font-mono text-indigo-200 mt-4 opacity-80">
            <span className="bg-white/10 px-2 py-1 rounded">ComfyUI</span>
            <span className="bg-white/10 px-2 py-1 rounded">FLUX2</span>
            <span className="bg-white/10 px-2 py-1 rounded">LTX-Video 2.0</span>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -mr-48 -mt-48 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary-500/20 rounded-full blur-3xl -ml-32 -mb-32 pointer-events-none"></div>
      </div>

      {/* Service Status */}
      <div className="card p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <span className="w-1.5 h-6 bg-primary-500 rounded-full block"></span>
            System Status
          </h3>
          <button
            onClick={checkServices}
            disabled={loading}
            className="btn btn-secondary text-xs"
          >
            {loading ? 'Checking...' : 'Check Status'}
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-center gap-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="relative group">
            <StatusCard
              label="LLM Service"
              connected={status.llm.connected}
              detail={`${status.llm.type}`}
            />
            <button
              onClick={() => setShowLLMConfig(true)}
              className="absolute top-3 right-3 p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
              title="Configure LLM"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
          </div>
          <StatusCard
            label="ComfyUI"
            connected={status.comfyui.connected}
            detail={`:${status.comfyui.url.split(':').pop()}`}
          />
        </div>

        {/* LLM Info Badge */}
        {llmConfig && (
          <div className="mb-6 p-4 bg-slate-50 border border-slate-100 rounded-lg text-sm flex items-center justify-between">
            <span className="text-slate-500">Chunk Size: <span className="text-slate-900 font-mono font-medium">{llmConfig.chunkSize.toLocaleString()}</span></span>
            <span className="text-slate-500">Context: <span className="text-slate-900 font-mono font-medium">{llmConfig.contextLength.toLocaleString()}</span></span>
          </div>
        )}

        {/* Models List */}
        {status.comfyui.connected && Object.keys(status.comfyui.models).length > 0 && (
          <div className="pt-6 border-t border-slate-100">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Available Models</h4>
            <div className="space-y-4">
              {Object.entries(status.comfyui.models).map(([type, models]) => (
                <div key={type}>
                  <div className="text-[10px] font-bold text-primary-600 bg-primary-50 inline-block px-1.5 py-0.5 rounded mb-2 uppercase">
                    {type} ({models.length})
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {models.slice(0, 5).map((model) => (
                      <span
                        key={model}
                        className="px-2.5 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded-md shadow-sm"
                        title={model}
                      >
                        {model.length > 25 ? model.slice(0, 22) + '...' : model}
                      </span>
                    ))}
                    {models.length > 5 && (
                      <span className="px-2.5 py-1 bg-slate-50 text-slate-400 text-xs rounded-md">
                        +{models.length - 5} more
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick Start */}
      <div className="card p-8 bg-gradient-to-br from-white to-indigo-50/30">
        <h3 className="text-xl font-bold text-slate-900 mb-8 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-primary-500 rounded-full block"></span>
          Quick Start Pipeline
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[
            { num: '01', text: 'Upload Script', desc: 'PDF/TXT supported', icon: '📄' },
            { num: '02', text: 'Analyze', desc: 'Extract chars & scenes', icon: '🤖' },
            { num: '03', text: 'Generate', desc: 'Create vivid assets', icon: '🎨' },
            { num: '04', text: 'Produce', desc: 'Render final video', icon: '🎬' },
          ].map((step, i) => (
            <div key={step.num} className="relative p-6 bg-white rounded-xl shadow-sm border border-indigo-50 hover:shadow-md hover:-translate-y-1 transition-all duration-300">
              <div className="text-4xl mb-4 opacity-10 font-bold absolute top-4 right-4">{step.num}</div>
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center text-2xl mb-4">
                {step.icon}
              </div>
              <h4 className="font-bold text-slate-900 mb-1">{step.text}</h4>
              <p className="text-xs text-slate-500">{step.desc}</p>
              {i < 3 && <div className="hidden md:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-indigo-200">➜</div>}
            </div>
          ))}
        </div>
        <button
          onClick={() => navigate('/upload')}
          className="btn btn-primary w-full py-4 text-base shadow-lg shadow-primary-500/20"
        >
          Start New Project
        </button>
      </div>

      {/* Recent Projects */}
      <div className="card p-6 lg:p-8">
        <h3 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
          <span className="w-1.5 h-6 bg-primary-500 rounded-full block"></span>
          Recent Projects
        </h3>
        {recentProjects.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
            <div className="text-4xl mb-4 opacity-50">📂</div>
            <p className="text-slate-500 font-medium">No projects yet</p>
            <button onClick={() => navigate('/upload')} className="text-primary-600 text-sm hover:underline mt-2">Create your first project</button>
          </div>
        ) : (
          <div className="space-y-3">
            {recentProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/analysis?project=${project.id}`)}
                className="group flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl hover:border-primary-200 hover:shadow-md hover:bg-primary-50/30 cursor-pointer transition-all duration-300"
              >
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center text-xl font-bold group-hover:scale-110 group-hover:bg-primary-100 group-hover:text-primary-600 transition-all">
                    {project.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-lg group-hover:text-primary-700 transition-colors">
                      {project.name}
                    </h4>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${isActiveStatus(project.status)
                          ? 'bg-amber-100 text-amber-700'
                          : project.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                        {statusLabels[project.status] || project.status}
                      </span>
                      <span className="text-xs text-slate-400">ID: {project.id.slice(0, 8)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0">
                  {isActiveStatus(project.status) && (
                    <button
                      onClick={(e) => handleStopProject(e, project.id)}
                      className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                      title="Stop Tasks"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" /></svg>
                    </button>
                  )}
                  <button
                    onClick={(e) => handleDeleteProject(e, project.id)}
                    className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                    title="Delete Project"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                  <div className="w-px h-6 bg-slate-200 mx-1"></div>
                  <div className="pr-2 text-slate-300">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* LLM Config Modal */}
      {showLLMConfig && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4 transform transition-all scale-100">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">LLM Configuration</h3>
              <button
                onClick={() => setShowLLMConfig(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Chunk Size
                </label>
                <input
                  type="number"
                  value={editingChunkSize}
                  onChange={(e) => setEditingChunkSize(e.target.value)}
                  className="input w-full"
                  placeholder="8000"
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  Character count per script chunk sent to LLM.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Context Length
                </label>
                <input
                  type="number"
                  value={editingContextLength}
                  onChange={(e) => setEditingContextLength(e.target.value)}
                  className="input w-full"
                  placeholder="32000"
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  Max context window size for the LLM model.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowLLMConfig(false)}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={saveLLMConfig}
                disabled={savingConfig}
                className="btn btn-primary flex-1"
              >
                {savingConfig ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
