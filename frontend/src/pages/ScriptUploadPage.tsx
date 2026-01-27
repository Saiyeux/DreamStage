import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectsApi, analysisApi } from '@/api'
import { useProjectStore } from '@/stores/projectStore'

export function ScriptUploadPage() {
  const navigate = useNavigate()
  const { currentProject, setCurrentProject, reset } = useProjectStore()

  // 本地 UI 状态
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingName, setPendingName] = useState('')
  const [summary, setSummary] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 从后端刷新项目状态，确保显示最新状态
  useEffect(() => {
    const refreshProject = async () => {
      if (currentProject?.id) {
        try {
          const freshProject = await projectsApi.get(currentProject.id)
          setCurrentProject(freshProject)
        } catch (err) {
          console.error('Refresh project failed:', err)
        }
      }
    }
    refreshProject()
  }, []) // 仅在页面加载时执行一次

  // 从 store 恢复 summary
  useEffect(() => {
    if (currentProject) {
      setSummary(currentProject.summary || '')
    }
  }, [currentProject])

  // 计算显示信息
  const projectName = currentProject?.name || pendingName
  const isUploaded = !!currentProject
  const fileName = currentProject?.name || pendingFile?.name
  const fileChars = currentProject?.scriptText?.length
  const isAnalyzing = currentProject?.status === 'analyzing'
  const isAnalyzed = currentProject?.status === 'analyzed' || currentProject?.status === 'generating' || currentProject?.status === 'completed'

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && (droppedFile.name.endsWith('.pdf') || droppedFile.name.endsWith('.txt'))) {
      // 如果已有项目，先重置
      if (currentProject) {
        reset()
        setSummary('')
      }

      const nameWithoutExt = droppedFile.name.replace(/\.(pdf|txt)$/i, '')
      setPendingFile(droppedFile)
      setPendingName(nameWithoutExt)
      setError(null)

      // 立即上传
      await uploadFile(droppedFile, nameWithoutExt)
    }
  }, [currentProject, reset])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      // 如果已有项目，先重置
      if (currentProject) {
        reset()
        setSummary('')
      }

      const nameWithoutExt = selectedFile.name.replace(/\.(pdf|txt)$/i, '')
      setPendingFile(selectedFile)
      setPendingName(nameWithoutExt)
      setError(null)

      // 立即上传
      await uploadFile(selectedFile, nameWithoutExt)
    }
  }

  const uploadFile = async (file: File, name: string) => {
    setUploading(true)
    setError(null)
    try {
      const project = await projectsApi.create(name, file)
      setCurrentProject(project)
      setPendingFile(null)
      setPendingName('')
    } catch (err) {
      setError('上传失败，请重试')
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  const generateSummary = async () => {
    if (!currentProject) return

    setAnalyzing(true)
    setError(null)

    try {
      const response = await analysisApi.analyzeSummary(currentProject.id)
      if (response.success && response.data?.summary) {
        setSummary(response.data.summary as string)
        // 更新 store 中的项目
        setCurrentProject({
          ...currentProject,
          summary: response.data.summary as string,
        })
      } else {
        setError(response.message || '生成简介失败')
      }
    } catch (err) {
      setError('生成简介失败，请重试')
      console.error('Generate summary failed:', err)
    } finally {
      setAnalyzing(false)
    }
  }

  const startAnalysis = () => {
    if (!currentProject) return
    navigate(`/analysis?project=${currentProject.id}`)
  }

  const handleClearProject = () => {
    reset()
    setPendingFile(null)
    setPendingName('')
    setSummary('')
    setError(null)
  }

  const handleNameChange = async (newName: string) => {
    if (currentProject && newName !== currentProject.name) {
      // 更新后端
      try {
        const updated = await projectsApi.update(currentProject.id, { name: newName })
        setCurrentProject(updated)
      } catch (err) {
        console.error('Update name failed:', err)
      }
    } else {
      setPendingName(newName)
    }
  }

  return (
    <div className="space-y-6">
      {/* Project Name */}
      <div className="glass-effect rounded-2xl p-6 shadow-xl">
        <label className="block text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <span className="text-lg">📝</span>
          <span>项目名称</span>
        </label>
        <input
          type="text"
          value={projectName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="输入项目名称，如：都市恋曲 第一集"
          className="w-full px-5 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-300 text-lg font-medium"
          disabled={uploading}
        />
      </div>

      {/* Upload and Summary */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* File Upload */}
        <div className="glass-effect rounded-2xl p-6 shadow-xl">
          <h3 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent mb-4 flex items-center gap-2">
            <span className="text-xl">📤</span>
            <span>文件上传</span>
          </h3>

          {!isUploaded && !pendingFile ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-purple-300 rounded-xl p-10 text-center hover:border-purple-500 hover:bg-purple-50/50 transition-all duration-300 cursor-pointer group"
            >
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
                disabled={uploading}
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <div className="text-6xl mb-4 group-hover:scale-110 transition-transform duration-300">📁</div>
                <p className="text-gray-700 font-semibold text-lg mb-2">拖拽文件到此处</p>
                <p className="text-gray-500 text-sm mb-3">或点击选择文件上传</p>
                <p className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full inline-block font-medium">
                  支持 PDF / TXT 格式
                </p>
              </label>
            </div>
          ) : (
            <div className="p-5 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border-2 border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-700 font-bold flex items-center gap-2 text-lg">
                    {uploading ? (
                      <>
                        <span className="animate-spin text-2xl">⏳</span>
                        <span>上传中...</span>
                      </>
                    ) : (
                      <>
                        <span className="text-2xl">✅</span>
                        <span>{fileName}</span>
                      </>
                    )}
                  </p>
                  {fileChars && (
                    <p className="text-sm text-green-600 mt-1 font-medium">
                      📊 {fileChars.toLocaleString()} 字符
                    </p>
                  )}
                  {isUploaded && (
                    <p className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full inline-block mt-2 font-medium">
                      ☁️ 已保存到服务器
                    </p>
                  )}
                </div>
                <button
                  onClick={handleClearProject}
                  disabled={uploading}
                  className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 bg-red-100 hover:bg-red-200 rounded-lg disabled:opacity-50 transition-all duration-300"
                >
                  🗑️ 清除
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="glass-effect rounded-2xl p-6 shadow-xl">
          <h3 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent mb-4 flex items-center gap-2">
            <span className="text-xl">📖</span>
            <span>剧情简介</span>
          </h3>

          {!summary ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">✨</div>
              <p className="text-gray-600 mb-6 font-medium">
                {isUploaded ? '点击生成剧情简介' : '上传剧本后可生成简介'}
              </p>
              <button
                onClick={generateSummary}
                disabled={!isUploaded || analyzing}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
              >
                {analyzing ? '⏳ 生成中...' : '🤖 AI生成简介'}
              </button>
            </div>
          ) : (
            <div>
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-5 text-gray-800 leading-relaxed max-h-48 overflow-y-auto border-l-4 border-purple-500 shadow-inner">
                {summary}
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={generateSummary}
                  disabled={analyzing}
                  className="px-4 py-2 text-sm font-medium bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50 transition-all duration-300"
                >
                  {analyzing ? '⏳ 生成中...' : '🔄 重新生成'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Project Status */}
      {currentProject && (
        <div className="glass-effect rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-medium">项目ID:</span>
                <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-mono font-semibold">
                  {currentProject.id.slice(0, 8)}...
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-medium">状态:</span>
                <span className={`px-3 py-1 rounded-full font-semibold ${
                  currentProject.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                  currentProject.status === 'analyzing' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                  currentProject.status === 'analyzed' ? 'bg-green-100 text-green-700' :
                  currentProject.status === 'generating' ? 'bg-purple-100 text-purple-700' :
                  currentProject.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {currentProject.status === 'draft' ? '📝 草稿' :
                  currentProject.status === 'analyzing' ? '🔄 分析中' :
                  currentProject.status === 'analyzed' ? '✅ 已分析' :
                  currentProject.status === 'generating' ? '🎨 生成中' :
                  currentProject.status === 'completed' ? '🎉 已完成' :
                  currentProject.status}
                </span>
              </div>
            </div>
            {isAnalyzed && (
              <span className="px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-semibold">
                ✓ 可以开始生成
              </span>
            )}
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl text-center">
          {error}
        </div>
      )}

      {/* Action Button */}
      <div className="flex justify-center pt-4">
        <button
          onClick={startAnalysis}
          disabled={!isUploaded || uploading}
          className="px-10 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:from-purple-700 hover:to-indigo-700 shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 hover:scale-105"
        >
          {isAnalyzing ? '🔄 分析中...' :
           isAnalyzed ? '📊 查看分析结果 →' :
           '▶️ 开始分析剧本'}
        </button>
      </div>
    </div>
  )
}
