import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectsApi, analysisApi } from '@/api'
import { useProjectStore } from '@/stores/projectStore'

export function ScriptUploadPage() {
  const navigate = useNavigate()
  const { currentProject, setCurrentProject, reset } = useProjectStore()

  // Local UI State
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingName, setPendingName] = useState('')
  const [summary, setSummary] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refresh project from backend
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
  }, [])

  // Restore summary from store
  useEffect(() => {
    if (currentProject) {
      setSummary(currentProject.summary || '')
    }
  }, [currentProject])

  // Computed Values
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
      if (currentProject) {
        reset()
        setSummary('')
      }

      const nameWithoutExt = droppedFile.name.replace(/\.(pdf|txt)$/i, '')
      setPendingFile(droppedFile)
      setPendingName(nameWithoutExt)
      setError(null)

      await uploadFile(droppedFile, nameWithoutExt)
    }
  }, [currentProject, reset])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (currentProject) {
        reset()
        setSummary('')
      }

      const nameWithoutExt = selectedFile.name.replace(/\.(pdf|txt)$/i, '')
      setPendingFile(selectedFile)
      setPendingName(nameWithoutExt)
      setError(null)

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
      setError('Upload failed, please try again')
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
        setCurrentProject({
          ...currentProject,
          summary: response.data.summary as string,
        })
      } else {
        setError(response.message || 'Failed to generate summary')
      }
    } catch (err) {
      setError('Failed to generate summary, please try again')
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
    <div className="space-y-6 max-w-5xl mx-auto px-4 py-8">
      {/* Project Name */}
      <div className="card p-6">
        <label className="block text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <span className="text-lg">📝</span>
          <span>Project Name</span>
        </label>
        <input
          type="text"
          value={projectName}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Enter project name..."
          className="input w-full text-lg font-medium"
          disabled={uploading}
        />
      </div>

      {/* Upload and Summary */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* File Upload */}
        <div className="card p-6 h-full flex flex-col">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <span className="text-xl">📤</span>
            <span>Script Upload</span>
          </h3>

          {!isUploaded && !pendingFile ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="flex-1 border-2 border-dashed border-primary-200 rounded-xl p-8 text-center hover:border-primary-500 hover:bg-primary-50/50 transition-all duration-300 cursor-pointer group flex flex-col items-center justify-center"
            >
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
                disabled={uploading}
              />
              <label htmlFor="file-upload" className="cursor-pointer w-full h-full flex flex-col items-center justify-center">
                <div className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-300 text-primary-200 group-hover:text-primary-400">📁</div>
                <p className="text-slate-700 font-semibold text-lg mb-2">Drag & Drop Script Here</p>
                <p className="text-slate-500 text-sm mb-4">or click to browse</p>
                <span className="text-xs bg-primary-100 text-primary-700 px-3 py-1 rounded-full font-medium">
                  PDF / TXT supported
                </span>
              </label>
            </div>
          ) : (
            <div className="flex-1 p-6 bg-green-50/50 rounded-xl border-2 border-green-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{uploading ? '⏳' : '✅'}</span>
                  <div>
                    <h4 className="font-bold text-green-800 text-lg leading-tight">
                      {uploading ? 'Uploading...' : fileName}
                    </h4>
                    {fileChars && (
                      <span className="text-xs text-green-600 font-medium">
                        {fileChars.toLocaleString()} characters
                      </span>
                    )}
                  </div>
                </div>
                {isUploaded && !uploading && (
                  <div className="ml-9">
                    <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium inline-block">
                      ☁️  Uploaded securely
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={handleClearProject}
                disabled={uploading}
                className="w-full mt-6 py-2.5 text-sm font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg disabled:opacity-50 transition-all"
              >
                Remove File
              </button>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="card p-6 h-full flex flex-col">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <span className="text-xl">📖</span>
            <span>Plot Summary</span>
          </h3>

          {!summary ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <div className="text-4xl mb-4 opacity-30">✨</div>
              <p className="text-slate-500 mb-6 font-medium px-4">
                {isUploaded ? 'Generate a summary to understand the script plot.' : 'Upload a script first to generate a summary.'}
              </p>
              <button
                onClick={generateSummary}
                disabled={!isUploaded || analyzing}
                className="btn btn-primary w-full max-w-xs shadow-lg shadow-primary-500/20"
              >
                {analyzing ? 'Generating...' : 'Generate Summary'}
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="flex-1 bg-gradient-to-br from-slate-50 to-white rounded-xl p-4 text-slate-700 leading-relaxed max-h-[300px] overflow-y-auto border border-slate-200 shadow-inner mb-4 text-sm scrollbar-thin">
                {summary}
              </div>
              <button
                onClick={generateSummary}
                disabled={analyzing}
                className="btn btn-secondary w-full"
              >
                {analyzing ? 'Regenerating...' : 'Regenerate Summary'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Project Status Bar */}
      {currentProject && (
        <div className="card p-5 flex items-center justify-between bg-slate-50 border-slate-200">
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">ID:</span>
              <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600 text-xs">
                {currentProject.id.slice(0, 8)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">Status:</span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${currentProject.status === 'draft' ? 'bg-slate-200 text-slate-700' :
                  currentProject.status === 'analyzing' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                    currentProject.status === 'analyzed' ? 'bg-green-100 text-green-700' :
                      currentProject.status === 'generating' ? 'bg-primary-100 text-primary-700' :
                        currentProject.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-slate-100 text-slate-700'
                }`}>
                {currentProject.status}
              </span>
            </div>
          </div>
          {isAnalyzed && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-100">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
              Ready to Generate
            </span>
          )}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl text-center border border-red-100 flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}

      {/* Main Action */}
      <div className="flex justify-center pt-4 pb-8">
        <button
          onClick={startAnalysis}
          disabled={!isUploaded || uploading}
          className="btn btn-primary px-12 py-4 text-base rounded-full shadow-xl shadow-primary-500/20 hover:scale-105 transition-transform"
        >
          {isAnalyzing ? 'Analyzing Script...' :
            isAnalyzed ? 'View Analysis Results →' :
              'Start Script Analysis ▶'}
        </button>
      </div>
    </div>
  )
}
