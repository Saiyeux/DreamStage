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
    <div className="w-60 bg-white border-r border-[#E4E5E7] flex flex-col h-screen overflow-y-auto">
      {/* Logo / 标题 - 带图标 */}
      <div className="px-4 py-4 border-b border-[#E4E5E7] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-[#F97316] to-[#FB923C] rounded-xl flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold text-[#1D1D1F]">AI Drama</h1>
            <p className="text-[10px] text-[#9CA0A8]">智能剧本工作室</p>
          </div>
        </div>
      </div>

      {/* 项目选择 - 卡片式 */}
      <div className="px-3 py-3 border-b border-[#E4E5E7] flex-shrink-0">
        <label className="text-xs font-medium text-[#6B6F76] mb-2 block flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          项目
        </label>
        <select
          value={currentProject?.id || ''}
          onChange={(e) => onProjectChange?.(e.target.value)}
          className="w-full px-3 py-2 bg-[#F7F8F9] border border-[#E4E5E7] rounded-lg text-sm text-[#1D1D1F] focus:outline-none focus:border-[#F97316] focus:ring-2 focus:ring-[#F97316]/10 cursor-pointer"
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
            className="w-full mt-2 py-1.5 text-xs text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg font-medium transition-colors flex items-center justify-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            删除项目
          </button>
        )}
      </div>

      {/* 剧情简介 */}
      <div className="px-3 py-3 border-b border-[#E4E5E7] flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-[#6B6F76] flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            简介
          </label>
          {currentProject && (
            <button
              onClick={handleGenerateSummary}
              disabled={isGeneratingSummary}
              className="text-xs text-[#F97316] hover:text-[#EA580C] font-medium disabled:opacity-50 flex items-center gap-1"
            >
              {isGeneratingSummary ? (
                <>
                  <span className="w-3 h-3 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin" />
                  生成中
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  生成
                </>
              )}
            </button>
          )}
        </div>
        <div className="bg-[#F7F8F9] rounded-lg p-3 text-xs text-[#6B6F76] min-h-[60px] leading-relaxed">
          {currentProject?.summary ? (
            <p className="whitespace-pre-wrap text-[#1D1D1F]">{currentProject.summary}</p>
          ) : (
            <p className="text-[#9CA0A8] italic text-center py-2">暂无简介</p>
          )}
        </div>
      </div>

      {/* 服务状态 */}
      <div className="px-3 py-3 border-b border-[#E4E5E7] flex-shrink-0">
        <label className="text-xs font-medium text-[#6B6F76] mb-2 block flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
          服务状态
        </label>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 bg-[#F7F8F9] rounded-lg">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#6B6F76]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-xs text-[#1D1D1F]">ComfyUI</span>
            </div>
            <div className={`status-dot ${healthStatus?.comfyui?.connected ? 'online' : 'offline'}`} />
          </div>
          <div className="flex items-center justify-between p-2 bg-[#F7F8F9] rounded-lg">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#6B6F76]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className="text-xs text-[#1D1D1F]">LLM</span>
            </div>
            <div className={`status-dot ${healthStatus?.llm?.connected ? 'online' : 'offline'}`} />
          </div>
        </div>
      </div>

      {/* 操作区 */}
      <div className="px-3 py-3 border-b border-[#E4E5E7] flex-shrink-0">
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
          className="w-full py-2.5 bg-gradient-to-r from-[#F97316] to-[#FB923C] text-white rounded-lg text-sm font-medium hover:from-[#EA580C] hover:to-[#F97316] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2"
        >
          {isUploading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              上传中...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              上传剧本
            </>
          )}
        </button>
      </div>

      {/* 分析操作 */}
      <div className="px-3 py-3 flex-1">
        <label className="text-xs font-medium text-[#6B6F76] mb-2 block flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          剧本分析
        </label>
        <div className="space-y-2">
          <button
            onClick={onAnalyzeCharacters}
            disabled={!currentProject || isAnalyzing}
            className={`w-full py-2.5 rounded-lg text-sm font-medium border transition-all flex items-center justify-center gap-2 ${
              currentAnalyzing === 'characters'
                ? 'bg-[#F97316] text-white border-[#F97316] shadow-sm'
                : 'bg-white text-[#1D1D1F] border-[#E4E5E7] hover:border-[#F97316] hover:text-[#F97316]'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {currentAnalyzing === 'characters' ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                分析角色中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                分析角色
              </>
            )}
          </button>

          <button
            onClick={onAnalyzeScenes}
            disabled={!currentProject || isAnalyzing}
            className={`w-full py-2.5 rounded-lg text-sm font-medium border transition-all flex items-center justify-center gap-2 ${
              currentAnalyzing === 'scenes'
                ? 'bg-[#F97316] text-white border-[#F97316] shadow-sm'
                : 'bg-white text-[#1D1D1F] border-[#E4E5E7] hover:border-[#F97316] hover:text-[#F97316]'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {currentAnalyzing === 'scenes' ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                分析场景中...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                分析场景
              </>
            )}
          </button>
        </div>
      </div>

    </div>
  )
}
