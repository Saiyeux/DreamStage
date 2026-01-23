import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ServiceStatus, Project } from '@/types'
import { healthApi, projectsApi } from '@/api'

const defaultStatus: ServiceStatus = {
  llm: { connected: false, type: 'ollama', url: 'localhost:11434' },
  comfyui: { connected: false, url: 'localhost:8000' },
  flux2Loaded: false,
  ltx2Loaded: false,
}

export function HomePage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<ServiceStatus>(defaultStatus)
  const [recentProjects, setRecentProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    checkServices()
    loadProjects()
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatusCard
            label="LLM服务"
            connected={status.llm.connected}
            detail={`${status.llm.type} :${status.llm.url.split(':').pop()}`}
          />
          <StatusCard
            label="ComfyUI"
            connected={status.comfyui.connected}
            detail={`:${status.comfyui.url.split(':').pop()}`}
          />
          <StatusCard label="FLUX2" connected={status.flux2Loaded} />
          <StatusCard label="LTX2" connected={status.ltx2Loaded} />
        </div>
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
                <span className="text-sm text-gray-500">
                  {statusLabels[project.status] || project.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
