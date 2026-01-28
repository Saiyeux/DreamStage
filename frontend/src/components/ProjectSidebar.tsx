import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Project, ServiceStatus } from '@/types'
import { healthApi, projectsApi, analysisApi } from '@/api'

interface ProjectSidebarProps {
  currentProject: Project | null
  onProjectChange?: (projectId: string) => void
  onAnalyzeCharacters?: () => void
  onAnalyzeScenes?: () => void
  isAnalyzing?: boolean
  currentAnalyzing?: 'characters' | 'scenes' | null
}

export function ProjectSidebar({
  currentProject,
  onProjectChange,
  onAnalyzeCharacters,
  onAnalyzeScenes,
  isAnalyzing,
  currentAnalyzing
}: ProjectSidebarProps) {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [healthStatus, setHealthStatus] = useState<ServiceStatus | null>(null)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  // 加载项目列表
  useEffect(() => {
    loadProjects()
  }, [])

  // 加载健康状态
  useEffect(() => {
    loadHealthStatus()
    const interval = setInterval(loadHealthStatus, 10000) // 每10秒刷新
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
      // 刷新项目信息
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

    // 验证文件类型
    const validTypes = ['.txt', '.pdf']
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    if (!validTypes.includes(fileExtension)) {
      alert('只支持 .txt 或 .pdf 格式的剧本文件')
      return
    }

    setIsUploading(true)
    try {
      // 使用文件名作为项目名（去掉扩展名）
      const projectName = file.name.replace(/\.[^/.]+$/, '')
      const response = await projectsApi.create(projectName, file)
      alert('上传成功！')

      // 刷新项目列表
      await loadProjects()

      // 自动选择新项目
      if (response.id) {
        onProjectChange?.(response.id)
      }

      // 重置文件输入
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
      alert('项目删除成功！')

      // 刷新项目列表
      await loadProjects()

      // 清除当前选中的项目
      onProjectChange?.('')

      // 刷新页面以重置状态
      window.location.reload()
    } catch (err) {
      console.error('Delete project failed:', err)
      alert('删除项目失败，请重试')
    }
  }

  return (
    <div className="w-52 bg-gradient-to-br from-gray-50 to-gray-100 border-r border-gray-200 flex flex-col h-screen overflow-y-auto">
      {/* 剧情简介 */}
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-xs font-bold text-gray-700 mb-2">剧情简介</h3>
        <div className="bg-white rounded-lg p-2 text-xs text-gray-600 min-h-[80px] shadow-sm">
          {currentProject?.summary ? (
            <p className="whitespace-pre-wrap">{currentProject.summary}</p>
          ) : (
            <p className="text-gray-400 italic">暂无简介</p>
          )}
        </div>
      </div>

      {/* 服务状态 */}
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-xs font-bold text-gray-700 mb-2">服务状态</h3>

        {/* ComfyUI */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-gray-700">ComfyUI</span>
            <div className={`w-2 h-2 rounded-full ${healthStatus?.comfyui?.connected ? 'bg-green-500' : 'bg-red-500'}`} />
          </div>
          {healthStatus?.comfyui?.connected && healthStatus.comfyui.models && (
            <div className="text-xs text-gray-500 space-y-0.5 pl-2">
              {Object.entries(healthStatus.comfyui.models).map(([type, models]) => (
                <div key={type}>{type}: {Array.isArray(models) ? models.length : 0} 个模型</div>
              ))}
            </div>
          )}
        </div>

        {/* LLM */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold text-gray-700">LLM</span>
            <div className={`w-2 h-2 rounded-full ${healthStatus?.llm?.connected ? 'bg-green-500' : 'bg-red-500'}`} />
          </div>
          {healthStatus?.llm?.connected && (
            <div className="text-xs text-gray-500 pl-2">
              <div>类型: {healthStatus.llm.type}</div>
              <div>URL: {healthStatus.llm.url}</div>
            </div>
          )}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="p-3 border-b border-gray-200 space-y-2">
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
          className="w-full py-2 bg-blue-500 text-white rounded-lg text-xs font-semibold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {isUploading ? '上传中...' : '上传文件'}
        </button>

        <button
          onClick={handleGenerateSummary}
          disabled={!currentProject || isGeneratingSummary}
          className="w-full py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg text-xs font-semibold hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {isGeneratingSummary ? '生成中...' : '生成简介'}
        </button>
      </div>

      {/* 选择项目 */}
      <div className="p-3 border-b border-gray-200">
        <h3 className="text-xs font-bold text-gray-700 mb-2">选择项目</h3>
        <select
          value={currentProject?.id || ''}
          onChange={(e) => onProjectChange?.(e.target.value)}
          className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 mb-2"
        >
          <option value="">请选择项目</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        {currentProject && (
          <button
            onClick={handleDeleteProject}
            className="w-full py-1.5 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600 transition-colors shadow-sm"
          >
            删除项目
          </button>
        )}
      </div>

      {/* 剧本分析 */}
      <div className="p-3 flex-1">
        <h3 className="text-xs font-bold text-gray-700 mb-2">剧本分析</h3>
        <div className="space-y-2">
          <button
            onClick={onAnalyzeCharacters}
            disabled={!currentProject || isAnalyzing}
            className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors shadow-sm ${
              currentAnalyzing === 'characters'
                ? 'bg-green-600 text-white'
                : 'bg-green-500 text-white hover:bg-green-600'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {currentAnalyzing === 'characters' ? '分析角色中...' : '分析角色'}
          </button>

          <button
            onClick={onAnalyzeScenes}
            disabled={!currentProject || isAnalyzing}
            className={`w-full py-2 rounded-lg text-xs font-semibold transition-colors shadow-sm ${
              currentAnalyzing === 'scenes'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {currentAnalyzing === 'scenes' ? '分析场景中...' : '分析场景'}
          </button>
        </div>
      </div>
    </div>
  )
}
