import { useState, useEffect, useRef } from 'react'
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [healthStatus, setHealthStatus] = useState<ServiceStatus | null>(null)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

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
    <div className="w-56 bg-white border-r border-[#E4E5E7] flex flex-col h-screen">
      {/* Logo / 标题 */}
      <div className="px-4 py-3 border-b border-[#E4E5E7]">
        <h1 className="text-sm font-semibold text-[#1D1D1F]">AI Drama Studio</h1>
      </div>

      {/* 项目选择 */}
      <div className="px-3 py-3 border-b border-[#E4E5E7]">
        <label className="text-xs font-medium text-[#6B6F76] mb-1.5 block">项目</label>
        <select
          value={currentProject?.id || ''}
          onChange={(e) => onProjectChange?.(e.target.value)}
          className="w-full px-2.5 py-1.5 bg-[#F7F8F9] border border-[#E4E5E7] rounded-md text-sm text-[#1D1D1F] focus:outline-none focus:border-[#5E6AD2] focus:ring-1 focus:ring-[#5E6AD2]/20"
        >
          <option value="">选择项目...</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        {currentProject && (
          <button
            onClick={handleDeleteProject}
            className="w-full mt-2 py-1.5 text-xs text-[#EF4444] hover:bg-[#FEF2F2] rounded-md font-medium transition-colors"
          >
            删除项目
          </button>
        )}
      </div>

      {/* 剧情简介 */}
      <div className="px-3 py-3 border-b border-[#E4E5E7]">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-[#6B6F76]">简介</label>
          {currentProject && (
            <button
              onClick={handleGenerateSummary}
              disabled={isGeneratingSummary}
              className="text-xs text-[#5E6AD2] hover:text-[#4F5BC7] font-medium disabled:opacity-50"
            >
              {isGeneratingSummary ? '生成中...' : '生成'}
            </button>
          )}
        </div>
        <div className="bg-[#F7F8F9] rounded-md p-2.5 text-xs text-[#6B6F76] min-h-[60px] leading-relaxed">
          {currentProject?.summary ? (
            <p className="whitespace-pre-wrap text-[#1D1D1F]">{currentProject.summary}</p>
          ) : (
            <p className="text-[#9CA0A8] italic">暂无简介</p>
          )}
        </div>
      </div>

      {/* 服务状态 */}
      <div className="px-3 py-3 border-b border-[#E4E5E7]">
        <label className="text-xs font-medium text-[#6B6F76] mb-2 block">服务状态</label>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#1D1D1F]">ComfyUI</span>
            <div className={`status-dot ${healthStatus?.comfyui?.connected ? 'online' : 'offline'}`} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#1D1D1F]">LLM</span>
            <div className={`status-dot ${healthStatus?.llm?.connected ? 'online' : 'offline'}`} />
          </div>
        </div>
      </div>

      {/* 操作区 */}
      <div className="px-3 py-3 border-b border-[#E4E5E7] space-y-2">
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
          className="w-full py-2 bg-[#5E6AD2] text-white rounded-md text-xs font-medium hover:bg-[#4F5BC7] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUploading ? '上传中...' : '上传剧本'}
        </button>
      </div>

      {/* 分析操作 */}
      <div className="px-3 py-3 flex-1">
        <label className="text-xs font-medium text-[#6B6F76] mb-2 block">剧本分析</label>
        <div className="space-y-2">
          <button
            onClick={onAnalyzeCharacters}
            disabled={!currentProject || isAnalyzing}
            className={`w-full py-2 rounded-md text-xs font-medium border transition-all ${
              currentAnalyzing === 'characters'
                ? 'bg-[#5E6AD2] text-white border-[#5E6AD2]'
                : 'bg-white text-[#1D1D1F] border-[#E4E5E7] hover:border-[#5E6AD2] hover:text-[#5E6AD2]'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {currentAnalyzing === 'characters' ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                分析角色中...
              </span>
            ) : '分析角色'}
          </button>

          <button
            onClick={onAnalyzeScenes}
            disabled={!currentProject || isAnalyzing}
            className={`w-full py-2 rounded-md text-xs font-medium border transition-all ${
              currentAnalyzing === 'scenes'
                ? 'bg-[#5E6AD2] text-white border-[#5E6AD2]'
                : 'bg-white text-[#1D1D1F] border-[#E4E5E7] hover:border-[#5E6AD2] hover:text-[#5E6AD2]'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {currentAnalyzing === 'scenes' ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                分析场景中...
              </span>
            ) : '分析场景'}
          </button>
        </div>
      </div>

    </div>
  )
}
