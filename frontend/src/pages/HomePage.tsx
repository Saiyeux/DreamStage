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
    <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
      <div className="text-3xl mb-2">{connected ? '🟢' : '🔴'}</div>
      <div className="font-medium text-gray-800">{label}</div>
      <div className="text-sm text-gray-500">
        {connected ? '已连接' : '未连接'}
      </div>
      {detail && <div className="text-xs text-gray-400 mt-1">{detail}</div>}
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
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-8 text-white text-center">
        <h2 className="text-3xl font-bold mb-2">🎬 AI短剧制作系统</h2>
        <p className="text-blue-100">从剧本到视频，一站式AI创作</p>
      </div>

      {/* Service Status */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">服务状态</h3>
          <button
            onClick={checkServices}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50"
          >
            {loading ? '检测中...' : '🔄 刷新'}
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
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">快速开始</h3>
        <div className="space-y-2 text-gray-600 mb-6">
          <p>1. 上传剧本 PDF/TXT 文件</p>
          <p>2. 系统自动分析角色和分镜</p>
          <p>3. 生成角色库和场景图</p>
          <p>4. 生成视频片段</p>
        </div>
        <button
          onClick={() => navigate('/upload')}
          className="w-full py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
        >
          ▶️ 开始创作
        </button>
      </div>

      {/* Recent Projects */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">最近项目</h3>
        {recentProjects.length === 0 ? (
          <p className="text-gray-500 text-center py-4">暂无项目</p>
        ) : (
          <div className="space-y-2">
            {recentProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => navigate(`/analysis?project=${project.id}`)}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span>📁</span>
                  <span className="font-medium">{project.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {statusLabels[project.status] || project.status}
                  </span>
                  <div className="flex gap-1">
                    {isActiveStatus(project.status) && (
                      <button
                        onClick={(e) => handleStopProject(e, project.id)}
                        className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
                        title="停止任务"
                      >
                        ⏹️ 停止
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDeleteProject(e, project.id)}
                      className="px-2 py-1 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200"
                      title="删除项目"
                    >
                      🗑️ 删除
                    </button>
                  </div>
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
