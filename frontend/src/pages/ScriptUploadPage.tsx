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
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          项目名称
        </label>
        <input
          type="text"
          value={projectName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="输入项目名称，如：都市恋曲 第一集"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={uploading}
        />
      </div>

      {/* Upload and Summary */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* File Upload */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">文件上传</h3>

          {!isUploaded && !pendingFile ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
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
                <div className="text-4xl mb-2">📁</div>
                <p className="text-gray-600">拖拽文件到此处</p>
                <p className="text-gray-400 text-sm">或点击上传</p>
                <p className="text-gray-400 text-xs mt-2">支持 PDF / TXT</p>
              </label>
            </div>
          ) : (
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-700 font-medium flex items-center gap-2">
                    {uploading ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        上传中...
                      </>
                    ) : (
                      <>
                        ✅ {fileName}
                      </>
                    )}
                  </p>
                  {fileChars && (
                    <p className="text-sm text-green-600">
                      {fileChars.toLocaleString()} 字符
                    </p>
                  )}
                  {isUploaded && (
                    <p className="text-xs text-green-500 mt-1">已保存到服务器</p>
                  )}
                </div>
                <button
                  onClick={handleClearProject}
                  disabled={uploading}
                  className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
                >
                  🗑️ 清除
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">剧情简介</h3>

          {!summary ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">
                {isUploaded ? '点击生成剧情简介' : '上传剧本后可生成简介'}
              </p>
              <button
                onClick={generateSummary}
                disabled={!isUploaded || analyzing}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600"
              >
                {analyzing ? '生成中...' : '🔄 生成简介'}
              </button>
            </div>
          ) : (
            <div>
              <div className="bg-gray-50 rounded-lg p-4 text-gray-700 leading-relaxed max-h-48 overflow-y-auto">
                {summary}
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={generateSummary}
                  disabled={analyzing}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                >
                  {analyzing ? '生成中...' : '🔄 重新生成'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Project Status */}
      {currentProject && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4 text-gray-600">
              <span>项目ID: {currentProject.id.slice(0, 8)}...</span>
              <span>状态: {
                currentProject.status === 'draft' ? '📝 草稿' :
                currentProject.status === 'analyzing' ? '🔄 分析中' :
                currentProject.status === 'analyzed' ? '✅ 已分析' :
                currentProject.status === 'generating' ? '🎨 生成中' :
                currentProject.status === 'completed' ? '🎉 已完成' :
                currentProject.status
              }</span>
            </div>
            {isAnalyzed && (
              <span className="text-green-600">可以开始生成</span>
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
      <div className="flex justify-center">
        <button
          onClick={startAnalysis}
          disabled={!isUploaded || uploading}
          className="px-8 py-3 bg-blue-500 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
        >
          {isAnalyzing ? '🔄 分析中...' :
           isAnalyzed ? '📊 查看分析结果' :
           '▶️ 开始分析剧本'}
        </button>
      </div>
    </div>
  )
}
