import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectsApi, analysisApi } from '@/api'
import { useProjectStore } from '@/stores/projectStore'

export function ScriptUploadPage() {
  const navigate = useNavigate()
  const { setCurrentProject } = useProjectStore()

  const [projectName, setProjectName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [summary, setSummary] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fileInfo, setFileInfo] = useState<{
    chars?: number
  } | null>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && (droppedFile.name.endsWith('.pdf') || droppedFile.name.endsWith('.txt'))) {
      setFile(droppedFile)
      setProjectId(null)
      setSummary('')
      setError(null)

      // 自动用文件名作为项目名（去掉扩展名）
      const nameWithoutExt = droppedFile.name.replace(/\.(pdf|txt)$/i, '')
      setProjectName(nameWithoutExt)

      // 估算字符数
      if (droppedFile.name.endsWith('.txt')) {
        droppedFile.text().then(text => {
          setFileInfo({ chars: text.length })
        })
      } else {
        setFileInfo({ chars: undefined })
      }
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setProjectId(null)
      setSummary('')
      setError(null)

      // 自动用文件名作为项目名（去掉扩展名）
      if (!projectName) {
        const nameWithoutExt = selectedFile.name.replace(/\.(pdf|txt)$/i, '')
        setProjectName(nameWithoutExt)
      }

      if (selectedFile.name.endsWith('.txt')) {
        selectedFile.text().then(text => {
          setFileInfo({ chars: text.length })
        })
      } else {
        setFileInfo({ chars: undefined })
      }
    }
  }

  const uploadAndCreateProject = async (): Promise<string | null> => {
    if (!file || !projectName) return null

    setUploading(true)
    setError(null)
    try {
      const project = await projectsApi.create(projectName, file)
      setProjectId(project.id)
      setCurrentProject(project)  // 保存到全局 store
      if (project.scriptText) {
        setFileInfo({ chars: project.scriptText.length })
      }
      return project.id
    } catch (err) {
      setError('上传失败，请重试')
      console.error('Upload failed:', err)
      return null
    } finally {
      setUploading(false)
    }
  }

  const generateSummary = async () => {
    setAnalyzing(true)
    setError(null)

    try {
      // 如果还没上传，先上传
      let id = projectId
      if (!id) {
        id = await uploadAndCreateProject()
        if (!id) {
          setAnalyzing(false)
          return
        }
      }

      // 调用分析简介 API
      const response = await analysisApi.analyzeSummary(id)
      if (response.success && response.data?.summary) {
        setSummary(response.data.summary as string)
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

  const startAnalysis = async () => {
    setError(null)

    // 如果还没上传，先上传
    let id = projectId
    if (!id) {
      id = await uploadAndCreateProject()
      if (!id) return
    }

    // 跳转到分析页面
    navigate(`/analysis?project=${id}`)
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
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="输入项目名称，如：都市恋曲 第一集"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Upload and Summary */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* File Upload */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">文件上传</h3>

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
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="text-4xl mb-2">📁</div>
              <p className="text-gray-600">拖拽文件到此处</p>
              <p className="text-gray-400 text-sm">或点击上传</p>
              <p className="text-gray-400 text-xs mt-2">支持 PDF / TXT</p>
            </label>
          </div>

          {file && (
            <div className="mt-4 p-3 bg-green-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-700 font-medium">✅ {file.name}</p>
                  <p className="text-sm text-green-600">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <div className="space-x-2">
                  <button
                    onClick={() => {
                      setFile(null)
                      setFileInfo(null)
                      setProjectId(null)
                      setSummary('')
                      setError(null)
                    }}
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    🗑️ 删除
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">剧情简介</h3>

          {!summary ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">上传剧本后可生成简介</p>
              <button
                onClick={generateSummary}
                disabled={!file || analyzing}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600"
              >
                {analyzing ? '生成中...' : '🔄 生成简介'}
              </button>
            </div>
          ) : (
            <div>
              <div className="bg-gray-50 rounded-lg p-4 text-gray-700 leading-relaxed">
                {summary}
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={generateSummary}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                >
                  🔄 重新生成
                </button>
                <button className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                  ✏️ 手动编辑
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* File Info */}
      {fileInfo && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              文件类型: {file?.name.endsWith('.pdf') ? 'PDF' : 'TXT'}
            </span>
            {fileInfo.chars && (
              <span>字符数: {fileInfo.chars.toLocaleString()}</span>
            )}
            {projectId && (
              <span className="text-green-600">✅ 已上传</span>
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
          disabled={!file || !projectName || uploading}
          className="px-8 py-3 bg-blue-500 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
        >
          {uploading ? '上传中...' : '▶️ 开始分析剧本'}
        </button>
      </div>
    </div>
  )
}
