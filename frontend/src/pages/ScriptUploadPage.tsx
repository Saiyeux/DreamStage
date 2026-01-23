import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

export function ScriptUploadPage() {
  const navigate = useNavigate()
  const [projectName, setProjectName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [summary, setSummary] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [fileInfo, setFileInfo] = useState<{
    pages?: number
    chars?: number
  } | null>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && (droppedFile.name.endsWith('.pdf') || droppedFile.name.endsWith('.txt'))) {
      setFile(droppedFile)
      // 模拟文件信息
      setFileInfo({ pages: 32, chars: 15420 })
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setFileInfo({ pages: 32, chars: 15420 })
    }
  }

  const generateSummary = async () => {
    setAnalyzing(true)
    // TODO: 调用 /api/projects/{id}/analyze/summary
    setTimeout(() => {
      setSummary(
        '这是一个关于都市职场的爱情故事。女主林晓雨是一名刚入职的新人，在一次意外的咖啡店邂逅中遇到了神秘总裁陈默。两人的命运从此交织在一起...'
      )
      setAnalyzing(false)
    }, 2000)
  }

  const startAnalysis = () => {
    // TODO: 创建项目并跳转到分析页面
    navigate('/analysis')
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
                  <button className="text-sm text-gray-500 hover:text-gray-700">
                    📖 预览
                  </button>
                  <button
                    onClick={() => {
                      setFile(null)
                      setFileInfo(null)
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
            <span>页数: {fileInfo.pages}</span>
            <span>字符数: {fileInfo.chars?.toLocaleString()}</span>
            <span>预估场景: 24个</span>
            <span>预估角色: 6人</span>
          </div>
        </div>
      )}

      {/* Action Button */}
      <div className="flex justify-center">
        <button
          onClick={startAnalysis}
          disabled={!file || !projectName}
          className="px-8 py-3 bg-blue-500 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
        >
          ▶️ 开始分析剧本
        </button>
      </div>
    </div>
  )
}
