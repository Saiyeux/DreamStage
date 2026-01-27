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
    <div className={`glass-effect rounded-xl p-5 text-center transition-all duration-300 hover:shadow-xl hover:scale-105 ${
      connected ? 'border-2 border-green-200' : 'border-2 border-red-200'
    }`}>
      <div className={`text-4xl mb-3 transition-all duration-300 ${connected ? 'animate-pulse' : ''}`}>
        {connected ? '🟢' : '🔴'}
      </div>
      <div className="font-semibold text-gray-800 text-lg mb-1">{label}</div>
      <div className={`text-sm font-medium ${connected ? 'text-green-600' : 'text-red-500'}`}>
        {connected ? '✓ 已连接' : '✗ 未连接'}
      </div>
      {detail && <div className="text-xs text-gray-500 mt-2 font-mono bg-gray-50 px-2 py-1 rounded">{detail}</div>}
    </div>
  )

  const statusLabels: Record<string, string> = {
    draft: '草稿',
    analyzing: '分析中',
    analyzed: '已分析',
    generating: '生成中',
    completed: '已完成',
  }

  const isActiveStatus = (status: string) => {
    return status === 'analyzing' || status === 'generating'
  }

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()  // 阻止点击事件冒泡到父元素
    if (!confirm('确定要删除这个项目吗？')) return

    try {
      await projectsApi.delete(projectId)
      setRecentProjects(prev => prev.filter(p => p.id !== projectId))
      // 如果删除的是当前项目，清空全局状态
      if (currentProject?.id === projectId) {
        resetStore()
      }
    } catch (err) {
      console.error('Delete project failed:', err)
      alert('删除失败，请重试')
    }
  }

  const handleStopProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    if (!confirm('确定要停止这个项目的任务吗？')) return

    try {
      const result = await projectsApi.stop(projectId)
      // 刷新项目列表以更新状态
      await loadProjects()
      alert(`已停止 ${result.stopped} 个任务`)
    } catch (err) {
      console.error('Stop project failed:', err)
      alert('停止失败，请重试')
    }
  }

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600 rounded-2xl p-10 text-white text-center shadow-2xl">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-3 animate-fade-in">
            🎬 AI短剧制作系统
          </h2>
          <p className="text-xl text-purple-100 mb-2">从剧本到视频，一站式AI创作平台</p>
          <p className="text-sm text-purple-200">ComfyUI + FLUX2 + LTX-Video 2.0</p>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full -ml-24 -mb-24"></div>
      </div>

      {/* Service Status */}
      <div className="glass-effect rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
            ⚡ 服务状态
          </h3>
          <button
            onClick={checkServices}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg hover:from-purple-600 hover:to-indigo-600 disabled:opacity-50 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105"
          >
            {loading ? '🔍 检测中...' : '🔄 刷新状态'}
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="relative">
            <StatusCard
              label="LLM服务"
              connected={status.llm.connected}
              detail={`${status.llm.type} :${status.llm.url.split(':').pop()}`}
            />
            <button
              onClick={() => setShowLLMConfig(true)}
              className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              title="LLM 配置"
            >
              ⚙️
            </button>
          </div>
          <StatusCard
            label="ComfyUI"
            connected={status.comfyui.connected}
            detail={`:${status.comfyui.url.split(':').pop()}`}
          />
        </div>

        {/* LLM 配置信息 */}
        {llmConfig && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">文本分块: <span className="font-medium">{llmConfig.chunkSize.toLocaleString()}</span> 字符</span>
              <span className="text-gray-600">上下文: <span className="font-medium">{llmConfig.contextLength.toLocaleString()}</span> 字符</span>
            </div>
          </div>
        )}

        {/* ComfyUI 可用模型 */}
        {status.comfyui.connected && Object.keys(status.comfyui.models).length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-3">ComfyUI 可用模型</h4>
            <div className="space-y-3">
              {Object.entries(status.comfyui.models).map(([type, models]) => (
                <div key={type}>
                  <div className="text-xs font-medium text-gray-500 uppercase mb-1">
                    {type} ({models.length})
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {models.slice(0, 5).map((model) => (
                      <span
                        key={model}
                        className="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded"
                        title={model}
                      >
                        {model.length > 30 ? model.slice(0, 27) + '...' : model}
                      </span>
                    ))}
                    {models.length > 5 && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
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
      <div className="glass-effect rounded-2xl p-8 shadow-xl">
        <h3 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent mb-6">
          🚀 快速开始
        </h3>
        <div className="space-y-4 mb-8">
          {[
            { num: '1', text: '上传剧本 PDF/TXT 文件', icon: '📄' },
            { num: '2', text: '系统自动分析角色和分镜', icon: '🤖' },
            { num: '3', text: '生成角色库和场景图', icon: '🎨' },
            { num: '4', text: '生成视频片段', icon: '🎬' },
          ].map((step) => (
            <div key={step.num} className="flex items-center gap-4 p-3 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg hover:shadow-md transition-all duration-300">
              <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full flex items-center justify-center font-bold shadow-lg">
                {step.num}
              </div>
              <span className="text-lg">{step.icon}</span>
              <p className="text-gray-700 font-medium">{step.text}</p>
            </div>
          ))}
        </div>
        <button
          onClick={() => navigate('/upload')}
          className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold text-lg hover:from-purple-700 hover:to-indigo-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105"
        >
          ▶️ 开始创作
        </button>
      </div>

      {/* Recent Projects */}
      <div className="glass-effect rounded-2xl p-6 shadow-xl">
        <h3 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent mb-6">
          📂 最近项目
        </h3>
        {recentProjects.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-gray-500">暂无项目</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/analysis?project=${project.id}`)}
                className="group flex items-center justify-between p-4 bg-gradient-to-r from-white to-gray-50 rounded-xl hover:from-purple-50 hover:to-indigo-50 cursor-pointer border-2 border-transparent hover:border-purple-200 transition-all duration-300 hover:shadow-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="text-3xl group-hover:scale-110 transition-transform duration-300">📁</div>
                  <div>
                    <span className="font-semibold text-gray-800 group-hover:text-purple-700 transition-colors">
                      {project.name}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        isActiveStatus(project.status)
                          ? 'bg-yellow-100 text-yellow-700'
                          : project.status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {statusLabels[project.status] || project.status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isActiveStatus(project.status) && (
                    <button
                      onClick={(e) => handleStopProject(e, project.id)}
                      className="px-3 py-1.5 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200 transition-all duration-300 hover:shadow-md"
                      title="停止任务"
                    >
                      ⏹️ 停止
                    </button>
                  )}
                  <button
                    onClick={(e) => handleDeleteProject(e, project.id)}
                    className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-all duration-300 hover:shadow-md"
                    title="删除项目"
                  >
                    🗑️ 删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* LLM 配置弹窗 */}
      {showLLMConfig && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">LLM 配置</h3>
              <button
                onClick={() => setShowLLMConfig(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  文本分块长度（字符）
                </label>
                <input
                  type="number"
                  value={editingChunkSize}
                  onChange={(e) => setEditingChunkSize(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="8000"
                />
                <p className="text-xs text-gray-500 mt-1">
                  每次发送给 LLM 的剧本文本长度，增大可分析更多内容
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  上下文长度（字符）
                </label>
                <input
                  type="number"
                  value={editingContextLength}
                  onChange={(e) => setEditingContextLength(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="32000"
                />
                <p className="text-xs text-gray-500 mt-1">
                  LLM 模型的上下文窗口大小，根据模型能力设置
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowLLMConfig(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                取消
              </button>
              <button
                onClick={saveLLMConfig}
                disabled={savingConfig}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                {savingConfig ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
