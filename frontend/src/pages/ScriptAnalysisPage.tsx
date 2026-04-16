import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Character, Scene, CharacterImage, SceneImage, Beat } from '@/types'
import { projectsApi, analysisApi, charactersApi, generationApi, configApi } from '@/api'
import type { ImageType, CharacterImageTemplates } from '@/api'
import { useProjectStore } from '@/stores/projectStore'
import { analysisService } from '@/services/analysisService'
import { ProjectSidebar } from '@/components/ProjectSidebar'
import { fileUrl } from '@/api/client'

import { ActContent } from '@/components/ActContent'

type Tab = 'characters' | 'scenes' | 'act'

export function ScriptAnalysisPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlProjectId = searchParams.get('project')

  const {
    currentProject,
    characters,
    scenes,
    analysisState,
    setCurrentProject,
    setCharacters,
    setScenes,
    setAnalysisState,
    appendTerminalOutput,
    updateLastTerminalLine,
    setBeats,
  } = useProjectStore()

  const projectId = urlProjectId || currentProject?.id

  // Sync tab with URL
  const activeTab: Tab = (searchParams.get('tab') as Tab) || 'characters'

  const handleTabChange = (tab: Tab) => {
    setSearchParams(prev => {
      prev.set('tab', tab)
      return prev
    }, { replace: true })
  }
  const [loading, setLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const validTypes = ['.txt', '.pdf']
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    if (!validTypes.includes(fileExtension)) {
      alert('只支持 .txt 或 .pdf 文件')
      return
    }

    setIsUploading(true)
    try {
      const projectName = file.name.replace(/\.[^/.]+$/, '')
      const response = await projectsApi.create(projectName, file)
      alert('上传成功！')
      if (response.id) {
        setSearchParams({ project: response.id })
        // Force reload sidebar list if needed, though Sidebar handles its own state. 
        // Ideally we'd trigger a global refresh or context update here.
        window.location.reload()
      }
    } catch (err) {
      console.error('Upload failed:', err)
      alert('Upload failed, please try again')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }


  const { terminalOutput, isStreaming, terminalExpanded, currentAnalyzing } = analysisState
  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [terminalOutput])

  useEffect(() => {
    if (!projectId) return

    const loadData = async () => {
      setLoading(true)
      try {
        const projectData = await projectsApi.get(projectId)
        setCurrentProject(projectData)

        const [charactersData, scenesData] = await Promise.all([
          analysisApi.getCharacters(projectId).catch(() => []),
          analysisApi.getScenes(projectId).catch(() => []),
        ])
        setCharacters(charactersData)
        setScenes(scenesData)
      } catch (err) {
        console.error('Load project failed:', err)
        // If project doesn't exist (e.g. deleted), clear the URL param to show Welcome screen
        setSearchParams({}, { replace: true })
        setCurrentProject(null)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [projectId])

  const refreshProjectStatus = async () => {
    if (!projectId) return
    try {
      const projectData = await projectsApi.get(projectId)
      setCurrentProject(projectData)
    } catch (err) {
      console.error('Refresh project status failed:', err)
    }
  }

  const createAnalysisCallbacks = useCallback((analysisType: 'characters' | 'scenes' | 'acts') => ({
    onStart: () => {
      appendTerminalOutput(`[${new Date().toLocaleTimeString()}] LLM Responding...`)
      appendTerminalOutput('')
    },
    onChunk: (content: string) => {
      updateLastTerminalLine(content)
    },
    onItemGenerated: (item: any) => {
      if (analysisType === 'characters') {
        const char = item as any
        // Map raw LLM response to Character type
        const newChar: Character = {
          id: char.id || `temp-${Date.now()}`,
          name: char.name,
          gender: char.gender || 'Unknown',
          age: char.age || 'Unknown',
          roleType: char.role_type || 'Supporting',
          personality: char.personality || '',
          clothingStyle: char.clothing_style || '',
          hair: char.appearance?.hair || '',
          face: char.appearance?.face || '',
          body: char.appearance?.body || '',
          skin: char.appearance?.skin || '',
          basePrompt: '',
          images: [],
          sceneNumbers: [],
          projectId: projectId || '',
          isFinalized: false
        }

        // Use functional update if supported, or functional logic with current state
        // Since we can't be sure if the store supports functional updates from the error,
        // and we want to avoid stale closures, let's try accessing the store state directly if possible
        // or just rely on the fact that we are in a callback. 
        // NOTE: The error said setCharacters expects Character[], not a function.
        // So we must pass the array.
        // We can get the current list from the store hook if we use useProjectStore.getState()
        // But here we are inside the component.

        const currentChars = useProjectStore.getState().characters
        if (!currentChars.some(c => c.name === newChar.name)) {
          setCharacters([...currentChars, newChar])
          appendTerminalOutput(`[INFO] Found character: ${newChar.name}`)
        }
      }
      else if (analysisType === 'scenes') {
        const scene = item as any
        const newScene: Scene = {
          id: scene.id || `temp-${Date.now()}`,
          sceneNumber: scene.scene_number,
          location: scene.location,
          timeOfDay: scene.time_of_day,
          atmosphere: scene.atmosphere,
          environmentDesc: scene.environment?.description || scene.environment_desc,
          characters: scene.characters || [],
          dialogue: scene.dialogue,

          scenePrompt: '',
          actionPrompt: '',
          negativePrompt: '',
          projectId: projectId || '',
          isFinalized: false
        }

        const currentScenes = useProjectStore.getState().scenes
        // 用 id 去重，避免重复添加同一场景；scene_number 由后端保证
        if (!currentScenes.some(s => s.id === newScene.id)) {
          setScenes([...currentScenes, newScene])
          appendTerminalOutput(`[INFO] Found scene ${newScene.sceneNumber}: ${newScene.location}`)
        }
      }
      else if (analysisType === 'acts') {
        const beat = item as any
        const newBeat: Beat = {
          id: beat.id || `temp-${Date.now()}`,
          sceneNumber: beat.scene_number || 0, // Fallback if missing
          beatType: beat.type || 'action',
          description: beat.action || beat.dialogue || '',
          characterName: beat.characterName,
          camera: beat.camera || {},
          duration: 0,
          projectId: projectId || ''
        }

        const currentBeats = useProjectStore.getState().beats
        // Check uniqueness? Or just append? Beats might not have unique numbers in stream
        // Usually safer to append for beats
        setBeats([...currentBeats, newBeat])
        appendTerminalOutput(`[INFO] Found beat: ${newBeat.beatType} ${newBeat.characterName || ''}`)
      }
    },
    onSaved: (count: number) => {
      appendTerminalOutput('')
      appendTerminalOutput(`[${new Date().toLocaleTimeString()}] Saved ${count} items`)
    },
    onParseError: (message: string) => {
      appendTerminalOutput('')
      appendTerminalOutput(`[WARN] JSON Parse Error: ${message}`)
    },
    onDone: async () => {
      appendTerminalOutput('')
      appendTerminalOutput(`[${new Date().toLocaleTimeString()}] Analysis Complete`)
      setAnalysisState({
        isStreaming: false,
        currentAnalyzing: null
      })

      if (projectId) {
        try {
          if (analysisType === 'characters') {
            const data = await analysisApi.getCharacters(projectId)
            setCharacters(data)
          } else if (analysisType === 'scenes') {
            const data = await analysisApi.getScenes(projectId)
            setScenes(data)
          } else if (analysisType === 'acts') {
            const data = await analysisApi.getBeats(projectId)
            setBeats(data)
          }
        } catch (err) {
          console.error('Reload data failed:', err)
          appendTerminalOutput(`[ERROR] Reload data failed: ${err}`)
        }
      }

      await refreshProjectStatus()
    },
    onError: (message: string) => {
      appendTerminalOutput('')
      appendTerminalOutput(`[ERROR] ${message}`)
      setAnalysisState({
        isStreaming: false,
        currentAnalyzing: null
      })
      refreshProjectStatus()
    },
    onConnectionLost: () => {
      appendTerminalOutput('')
      appendTerminalOutput('[Connection Lost]')
      setAnalysisState({
        isStreaming: false,
        currentAnalyzing: null
      })
      refreshProjectStatus()
    }
  }), [projectId, appendTerminalOutput, updateLastTerminalLine, setAnalysisState, setCharacters, setScenes, refreshProjectStatus])

  useEffect(() => {
    if (analysisService.isAnalyzing()) {
      const analysisType = analysisService.getCurrentAnalysisType()
      if (analysisType && projectId) {
        analysisService.updateCallbacks(createAnalysisCallbacks(analysisType))
      }
    } else if (isStreaming) {
      appendTerminalOutput('')
      appendTerminalOutput(`[${new Date().toLocaleTimeString()}] Connection lost, state reset`)
      setAnalysisState({
        isStreaming: false,
        currentAnalyzing: null
      })
    }

    // Check for server-side active analysis on mount/project change
    if (projectId && !isStreaming && !analysisService.isAnalyzing()) {
      analysisApi.getAnalysisStatus(projectId).then(status => {
        if (status.status === 'running' && status.analysis_type) {
          const type = status.analysis_type as 'characters' | 'scenes' | 'acts'
          console.log(`Resuming detached analysis: ${type}`)

          setAnalysisState({
            isStreaming: true,
            currentAnalyzing: type,
            terminalExpanded: true,
            terminalOutput: [`> Resuming detached ${type} analysis...`]
          })

          const callbacks = createAnalysisCallbacks(type)
          analysisService.start(projectId, type, callbacks)
        }
      }).catch(console.error)
    }

  }, [projectId, isStreaming, createAnalysisCallbacks, setAnalysisState])

  const stopStream = async () => {
    analysisService.stop()
    appendTerminalOutput('')
    appendTerminalOutput(`[${new Date().toLocaleTimeString()}] Stopped manually`)
    setAnalysisState({
      isStreaming: false,
      currentAnalyzing: null
    })
    await refreshProjectStatus()
  }

  const analyzeWithStream = async (analysisType: 'characters' | 'scenes' | 'acts', mode: 'quick' | 'deep' = 'deep', extraParams: Record<string, string> = {}) => {
    if (!currentProject?.id || isStreaming) return

    setAnalysisState({
      isStreaming: true,
      currentAnalyzing: analysisType,
      terminalExpanded: true
    })
    if (!projectId) return
    if (isStreaming || analysisService.isAnalyzing()) return

    setAnalysisState({
      isStreaming: true,
      terminalExpanded: true,
      currentAnalyzing: analysisType,
    })

    const modeLabel = mode === 'quick' ? '(Quick)' : '(Deep)'
    const typeName = analysisType === 'characters' ? 'Characters' : analysisType === 'scenes' ? 'Scenes' : 'Acts'
    setAnalysisState({
      terminalOutput: [
        `> Starting ${modeLabel} analysis for ${typeName}...`,
        `[${new Date().toLocaleTimeString()}] Connecting to LLM Service...`,
        '',
      ],
    })

    const callbacks = createAnalysisCallbacks(analysisType)
    analysisService.start(projectId, analysisType, callbacks, mode, extraParams)
  }

  const handleProjectChange = (newProjectId: string) => {
    if (newProjectId && newProjectId !== projectId) {
      setSearchParams({ project: newProjectId })
    }
  }

  // Empty state
  if (!projectId) {
    return (
      <div className="flex h-screen bg-transparent/50">
        <ProjectSidebar
          currentProject={null}
          onProjectChange={handleProjectChange}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 bg-white rounded-2xl border border-slate-200 flex items-center justify-center mx-auto mb-6 shadow-sm">
              <span className="text-3xl">👋</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">欢迎使用 Studio</h2>
            <p className="text-sm text-slate-500 mb-8">请从左侧选择项目或上传新剧本以开始。</p>

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
              className="btn btn-primary px-6 py-2.5 shadow-lg shadow-primary-500/20"
            >
              {isUploading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  上传中...
                </>
              ) : (
                <>
                  <span className="mr-2">📁</span>
                  上传剧本
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-screen bg-transparent/50">
        <ProjectSidebar
          currentProject={currentProject}
          onProjectChange={handleProjectChange}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <span className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin" />
            <span className="text-sm font-medium text-slate-500">加载工作区...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      {/* Sidebar */}
      <ProjectSidebar
        currentProject={currentProject}
        onProjectChange={handleProjectChange}
        onAnalyzeCharacters={(mode) => analyzeWithStream('characters', mode)}
        onAnalyzeScenes={(sceneType) => analyzeWithStream('scenes', 'deep', { scene_type: sceneType })}
        onAnalyzeActs={() => analyzeWithStream('acts')}
        onStopAnalysis={stopStream}
        isAnalyzing={isStreaming}
        currentAnalyzing={currentAnalyzing}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="bg-white/70 backdrop-blur-md border-b border-white/20 px-6 py-4 flex items-center justify-between shadow-sm z-10 basis-16 shrink-0 relative">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 bg-indigo-50/80 text-indigo-600 rounded-lg flex items-center justify-center text-lg shadow-sm border border-indigo-100/50">
                📝
              </span>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight truncate max-w-md">
                {currentProject?.name || 'Untitled Project'}
              </h1>
            </div>

            {isStreaming && (
              <span className="badge badge-accent animate-pulse-soft shadow-[0_0_10px_rgba(249,115,22,0.4)]">
                Processing
              </span>
            )}
          </div>

          {/* View Toggle */}
          <div className="flex bg-slate-100/50 p-1 rounded-xl border border-slate-200/50 backdrop-blur-sm shadow-inner">
            <button
              onClick={() => handleTabChange('characters')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'characters'
                ? 'bg-white text-primary-700 shadow-sm ring-1 ring-slate-200/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/30'
                }`}
            >
              <span className={activeTab === 'characters' ? 'scale-110 transition-transform' : ''}>👤</span> 角色
              {characters.length > 0 && (
                <span className={`text-[10px] ${activeTab === 'characters' ? 'bg-indigo-50 text-indigo-600 font-bold' : 'bg-slate-200 text-slate-500'} px-1.5 py-0.5 rounded-full transition-colors`}>
                  {characters.length}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange('scenes')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'scenes'
                ? 'bg-white text-primary-700 shadow-sm ring-1 ring-slate-200/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/30'
                }`}
            >
              <span className={activeTab === 'scenes' ? 'scale-110 transition-transform' : ''}>🎬</span> 场景
              {scenes.length > 0 && (
                <span className={`text-[10px] ${activeTab === 'scenes' ? 'bg-indigo-50 text-indigo-600 font-bold' : 'bg-slate-200 text-slate-500'} px-1.5 py-0.5 rounded-full transition-colors`}>
                  {scenes.length}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange('act')}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'act'
                ? 'bg-white text-primary-700 shadow-sm ring-1 ring-slate-200/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/30'
                }`}
            >
              <span className={activeTab === 'act' ? 'scale-110 transition-transform' : ''}>🎭</span> Act
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex relative z-0">
          {activeTab === 'characters' ? (
            <CharactersContent
              characters={characters}
              projectId={projectId}
            />
          ) : activeTab === 'act' ? (
            <ActContent projectId={projectId} />
          ) : (
            <ScenesContent
              scenes={scenes}
              projectId={projectId}
            />
          )}
        </div>

        {/* Terminal */}
        <div className="border-t border-slate-800/50 bg-slate-900/95 backdrop-blur-md text-slate-400 z-20 shadow-[0_-8px_30px_rgba(0,0,0,0.3)] shrink-0">
          <div
            className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-white/5 transition-colors group"
            onClick={() => setAnalysisState({ terminalExpanded: !terminalExpanded })}
          >
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-xs font-mono group-hover:translate-x-1 transition-transform">➜</span>
              <span className="text-xs font-mono font-medium text-slate-300 group-hover:text-white transition-colors">控制台输出</span>
              {isStreaming && (
                <span className="flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-medium border border-indigo-500/20 shadow-[0_0_10px_rgba(99,102,241,0.2)]">
                  <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                  Streaming
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <ClearCacheButton
                onClear={() => setAnalysisState({ terminalOutput: ['> Console cleared.'] })}
              />
              <svg
                className={`w-4 h-4 transition-transform duration-300 ${terminalExpanded ? '' : 'rotate-180'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {terminalExpanded && (
            <div
              ref={terminalRef}
              className="px-4 py-3 font-mono text-xs overflow-y-auto bg-black/40 custom-scrollbar"
              style={{ maxHeight: '200px', height: '160px' }}
            >
              {terminalOutput.length === 0 ? (
                <p className="opacity-30 italic px-2">Ready for tasks...</p>
              ) : (
                terminalOutput.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all leading-relaxed py-0.5 pl-2 border-l-2 border-transparent hover:border-slate-700 hover:bg-white/5 transition-colors">
                    {line || '\u00A0'}
                  </div>
                ))
              )}
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-indigo-500 animate-pulse align-middle ml-3 mt-1 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============ AudioSection Component ============
function AudioSection({
  character,
  projectId,
  onAudiosUpdated,
}: {
  character: Character
  projectId: string
  onAudiosUpdated: () => Promise<void>
}) {
  const [isUploadingAudio, setIsUploadingAudio] = useState(false)
  const [selectedRefAudioId, setSelectedRefAudioId] = useState<string | undefined>()
  const [ttsText, setTtsText] = useState('')
  const [ttsTaskId, setTtsTaskId] = useState<string | null>(null)
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'generating' | 'done' | 'error'>('idle')
  const [ttsAudioPath, setTtsAudioPath] = useState<string | null>(null)
  const audioUploadRef = useRef<HTMLInputElement>(null)
  const ttsPollingRef = useRef<number | null>(null)

  const refAudios = character.audios?.filter(a => a.audioType === 'reference') ?? []

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsUploadingAudio(true)
    try {
      await charactersApi.uploadAudio(projectId, character.id, file)
      await onAudiosUpdated()
    } catch {
      alert('Failed to upload audio')
    } finally {
      setIsUploadingAudio(false)
      if (audioUploadRef.current) audioUploadRef.current.value = ''
    }
  }

  const handleDeleteAudio = async (audioId: string) => {
    if (!confirm('Delete this audio?')) return
    try {
      await charactersApi.deleteAudio(projectId, audioId)
      if (selectedRefAudioId === audioId) setSelectedRefAudioId(undefined)
      await onAudiosUpdated()
    } catch {
      alert('Failed to delete audio')
    }
  }

  const handleGenerateTTS = async () => {
    if (!ttsText.trim()) return
    setTtsStatus('generating')
    setTtsAudioPath(null)
    try {
      const res = await charactersApi.generateTTS(projectId, character.id, ttsText, selectedRefAudioId)
      setTtsTaskId(res.task_id)
      // Poll for result
      ttsPollingRef.current = window.setInterval(async () => {
        try {
          const status = await generationApi.getTaskStatus(res.task_id)
          if (status.status === 'completed') {
            clearInterval(ttsPollingRef.current!)
            setTtsStatus('done')
            const result = status.result as any
            if (result?.audio_path) setTtsAudioPath(result.audio_path)
            await onAudiosUpdated()
          } else if (status.status === 'failed') {
            clearInterval(ttsPollingRef.current!)
            setTtsStatus('error')
          }
        } catch {
          // ignore polling errors
        }
      }, 2000)
    } catch {
      setTtsStatus('error')
    }
  }

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
        <span>🎙️</span> Voice & Audio
      </h3>

      {/* Reference Audio */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reference Audio</span>
          <div>
            <input ref={audioUploadRef} type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a" className="hidden" onChange={handleAudioUpload} />
            <button
              onClick={() => audioUploadRef.current?.click()}
              disabled={isUploadingAudio}
              className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-600 transition-colors disabled:opacity-50"
            >
              {isUploadingAudio ? '⏳' : '+ Upload'}
            </button>
          </div>
        </div>
        {refAudios.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No reference audio yet. Upload a voice sample for cloning.</p>
        ) : (
          <div className="space-y-1.5">
            {refAudios.map(audio => (
              <div
                key={audio.id}
                onClick={() => setSelectedRefAudioId(prev => prev === audio.id ? undefined : audio.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-xs ${
                  selectedRefAudioId === audio.id
                    ? 'border-primary-400 bg-primary-50 text-primary-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                }`}
              >
                <span className="text-base">🎵</span>
                <span className="flex-1 truncate">{audio.audioName}</span>
                {selectedRefAudioId === audio.id && <span className="text-primary-500 font-bold text-[10px]">ACTIVE</span>}
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteAudio(audio.id) }}
                  className="p-0.5 text-red-400 hover:text-red-600 rounded"
                  title="Delete"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TTS Preview */}
      <div>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-2">TTS Preview</span>
        <textarea
          value={ttsText}
          onChange={e => setTtsText(e.target.value)}
          placeholder="Enter text to synthesize..."
          rows={3}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-primary-400 bg-white/80"
        />
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleGenerateTTS}
            disabled={!ttsText.trim() || ttsStatus === 'generating'}
            className="btn btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {ttsStatus === 'generating' ? '⏳ Generating...' : '▶ Generate TTS'}
          </button>
          {selectedRefAudioId && (
            <span className="text-[10px] text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">Voice Clone</span>
          )}
          {ttsStatus === 'error' && <span className="text-xs text-red-500">Generation failed</span>}
        </div>
        {ttsAudioPath && ttsStatus === 'done' && (
          <div className="mt-3">
            <audio controls src={`/files/${ttsAudioPath}`} className="w-full h-8" />
          </div>
        )}
        {/* Generated audio list */}
        {(character.audios?.filter(a => a.audioType === 'generated') ?? []).length > 0 && (
          <div className="mt-3 space-y-1.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Generated Clips</span>
            {character.audios.filter(a => a.audioType === 'generated').slice(-3).map(audio => (
              <div key={audio.id} className="flex items-center gap-2">
                <audio controls src={`/files/${audio.audioPath}`} className="flex-1 h-7" />
                <button
                  onClick={() => handleDeleteAudio(audio.id)}
                  className="p-0.5 text-red-400 hover:text-red-600 rounded shrink-0"
                  title="Delete"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CharactersContent({
  characters,
  projectId
}: {
  characters: Character[]
  projectId: string
}) {
  const { setCharacters, addCharacter, removeCharacter, selectedWorkflows, workflowParams, healthStatus } = useProjectStore()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const [editedCharacter, setEditedCharacter] = useState<Partial<Character>>({})
  const [isSaving, setIsSaving] = useState(false)
  const selectedCharacter = characters[selectedIndex]
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([])
  const [isFinalizing, setIsFinalizing] = useState(false)

  // Generation state
  const [generatingCharId, setGeneratingCharId] = useState<string | null>(null)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [generateMessage, setGenerateMessage] = useState('')
  const pollingRef = useRef<number | null>(null)

  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  // Reset gallery management state when switching characters
  useEffect(() => {
    setIsManagingGallery(false)
    setSelectedImageIds([])
  }, [selectedIndex])

  // Settings state
  const [templates, setTemplates] = useState<CharacterImageTemplates | null>(null)
  const [selections, setSelections] = useState<{
    view: string | undefined;
    expression: string | undefined;
    action: string | undefined;
  }>({
    view: 'front',
    expression: 'neutral',
    action: 'standing'
  })

  const [isManagingGallery, setIsManagingGallery] = useState(false)

  // Tag Management
  const [isManageMode, setIsManageMode] = useState(false)
  const [addingCategory, setAddingCategory] = useState<string | null>(null)
  const [editingTagKey, setEditingTagKey] = useState<string | null>(null)
  const [tempTagValue, setTempTagValue] = useState('')

  // Add Character State
  const [showAddPopover, setShowAddPopover] = useState(false)
  const [newCharName, setNewCharName] = useState('')
  const addPopoverContainerRef = useRef<HTMLDivElement>(null)
  const addPopoverButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        showAddPopover &&
        addPopoverContainerRef.current &&
        !addPopoverContainerRef.current.contains(event.target as Node) &&
        addPopoverButtonRef.current &&
        !addPopoverButtonRef.current.contains(event.target as Node)
      ) {
        setShowAddPopover(false)
        setNewCharName('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showAddPopover])

  const handleAddCharacter = async () => {
    if (!newCharName.trim()) return

    try {
      const newChar = await analysisApi.createCharacter(projectId, { name: newCharName.trim() })
      addCharacter(newChar)
      // Select the new character
      setSelectedIndex(characters.length)
      setShowAddPopover(false)
      setNewCharName('')
    } catch (err) {
      console.error('Add character failed:', err)
      alert('添加角色失败')
    }
  }

  useEffect(() => {
    // Load image templates to get available types
    configApi.getCharacterImageTemplates().then(setTemplates).catch(console.error)
  }, [])

  const handleAddTag = async (category: string) => {
    if (!tempTagValue.trim() || !templates) return

    const newTag: ImageType = {
      id: `tag_${Date.now()}`,
      label: tempTagValue.trim(),
      prompt_suffix: tempTagValue.trim()
    }

    const currentTags = templates.templates[category] || []
    const newTemplates = {
      ...templates,
      templates: {
        ...templates.templates,
        [category]: [...currentTags, newTag]
      }
    }

    await configApi.updateCharacterImageTemplates(newTemplates)
    setTemplates(newTemplates)
    setAddingCategory(null)
    setTempTagValue('')
  }

  const handleUpdateTag = async (category: string, tagId: string, newLabel: string) => {
    if (!newLabel.trim() || !templates) return

    const currentTags = templates.templates[category] || []
    const newTags = currentTags.map(t => t.id === tagId ? { ...t, label: newLabel, prompt_suffix: newLabel } : t)

    const newTemplates = {
      ...templates,
      templates: {
        ...templates.templates,
        [category]: newTags
      }
    }

    await configApi.updateCharacterImageTemplates(newTemplates)
    setTemplates(newTemplates)
    setEditingTagKey(null)
    setTempTagValue('')
  }

  const handleDeleteTag = async (category: string, tagId: string) => {
    if (!templates || !confirm('Delete this tag?')) return

    const currentTags = templates.templates[category] || []
    const newTags = currentTags.filter(t => t.id !== tagId)

    const newTemplates = {
      ...templates,
      templates: {
        ...templates.templates,
        [category]: newTags
      }
    }

    await configApi.updateCharacterImageTemplates(newTemplates)
    setTemplates(newTemplates)
  }

  const toggleSelection = (categoryKey: 'view' | 'expression' | 'action', id: string) => {
    setSelections(prev => {
      // Toggle logic: if selected, deselect; otherwise select
      if (prev[categoryKey] === id) {
        // Deselect
        // We will just keep it as is? Or maybe allow empty string?
        // The type definition says: view: string; expression: string; action: string;
        // Looking at initial state: view: 'front', etc.
        // If the user wants to "deselect", maybe we switch to a default? 
        // Or we should update the type to allow optional strings.
        // For now, let's just allow selecting different ones. 
        // The user request said "delete current selection", implying they don't want to see the "Current Selection" text.
        // But the functionality of selecting tags is still needed for generation.
        // If I implement toggle, I need to handle the case where nothing is selected.

        // Let's check the type definition again.
        // "const [selections, setSelections] = useState<{ view: string; ... }>(...)"
        // If I want to allow deselect, I need to change the state type or initial value.
        // For now, I'll just implement the logic to update. 
        // The previous implementation was `updateSelection` which just overwrote it.
        // The UI requirement "don't want label's english" and "remove current selection"
        // referred to the UI display, not necessarily the logic.
        return { ...prev, [categoryKey]: undefined }
      }
      return { ...prev, [categoryKey]: id }
    })
  }



  const handleDownload = async (imageUrl: string, filename: string) => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Download failed:', error)
    }
  }

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm('Permanently delete this image?')) return
    try {
      await analysisApi.deleteCharacterImage(projectId, imageId)
      const updatedCharacters = await analysisApi.getCharacters(projectId)
      setCharacters(updatedCharacters)
    } catch (err) {
      console.error('Delete image failed:', err)
      alert('Failed to delete image')
    }
  }

  const [isUploading, setIsUploading] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedCharacter) return
    setIsUploading(true)
    try {
      await charactersApi.uploadImage(projectId, selectedCharacter.id, file)
      const updatedCharacters = await analysisApi.getCharacters(projectId)
      setCharacters(updatedCharacters)
    } catch (err) {
      console.error('Upload failed:', err)
      alert('Failed to upload image')
    } finally {
      setIsUploading(false)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    }
  }

  const handleSelect = (index: number) => {
    setSelectedIndex(index)
    setIsEditing(false)
    setEditedCharacter({})
  }

  const handleEdit = () => {
    if (!selectedCharacter) return
    setIsEditing(true)
    setEditedCharacter({
      name: selectedCharacter.name,
      gender: selectedCharacter.gender,
      age: selectedCharacter.age,
      roleType: selectedCharacter.roleType,
      personality: selectedCharacter.personality,
      clothingStyle: selectedCharacter.clothingStyle,
      hair: selectedCharacter.hair,
      face: selectedCharacter.face,
      body: selectedCharacter.body,
      skin: selectedCharacter.skin,
    })
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditedCharacter({})
  }

  const handleSave = async () => {
    if (!selectedCharacter?.id) return

    setIsSaving(true)
    try {
      await charactersApi.update(projectId, selectedCharacter.id, {
        name: editedCharacter.name,
        gender: editedCharacter.gender,
        age: editedCharacter.age,
        role_type: editedCharacter.roleType,
        personality: editedCharacter.personality,
        clothing_style: editedCharacter.clothingStyle,
        hair: editedCharacter.hair,
        face: editedCharacter.face,
        body: editedCharacter.body,
        skin: editedCharacter.skin,
      })

      alert('Successfully saved!')
      setIsEditing(false)
      const updated = await analysisApi.getCharacters(projectId)
      setCharacters(updated)
    } catch (err) {
      console.error('Save character failed:', err)
      alert('Failed to save, please try again')
    } finally {
      setIsSaving(false)
    }
  }

  const updateField = (field: keyof Character, value: string) => {
    setEditedCharacter(prev => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  const startPolling = useCallback((taskId: string, targetId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current)

    setGeneratingCharId(targetId)
    setCurrentTaskId(taskId)
    setGenerateMessage('Syncing task status...')

    pollingRef.current = window.setInterval(async () => {
      try {
        const status = await generationApi.getTaskStatus(taskId)

        if (status.status === 'completed' || status.status === 'failed') {
          // Clear interval immediately
          if (pollingRef.current) {
            clearInterval(pollingRef.current)
            pollingRef.current = null
          }

          if (status.status === 'completed') {
            setGenerateMessage('Done!')

            try {
              // Retrieve fresh data
              const updatedCharacters = await analysisApi.getCharacters(projectId)

              // Force update state
              setCharacters(updatedCharacters)

              // Also check specifically for the generating character to ensure image is there
              const updatedChar = updatedCharacters.find(c => c.id === targetId)
              if (updatedChar && updatedChar.images) {
                // console.log('Updated character images:', updatedChar.images)
              }
            } catch (err) {
              console.error('Failed to reload characters:', err)
            }

            setTimeout(() => {
              setGeneratingCharId(null)
              setCurrentTaskId(null)
              setGenerateMessage('')
            }, 2000)
          } else {
            setGenerateMessage(`Failed: ${status.error || 'Unknown error'}`)
            setTimeout(() => {
              setGeneratingCharId(null)
              setCurrentTaskId(null)
              setGenerateMessage('')
            }, 5000)
          }
        } else {
          setGenerateMessage(status.message || 'Generating...')
        }
      } catch (err) {
        console.error('Poll status failed:', err)
      }
    }, 1000)
  }, [projectId, setCharacters])

  useEffect(() => {
    // Status Recovery: Check for active tasks on mount
    generationApi.getActiveTasks(projectId).then(tasks => {
      Object.entries(tasks).forEach(([taskId, status]) => {
        if (status.target_id && status.target_id !== 'library' && !status.target_id.startsWith('all_')) {
          const charId = status.target_id

          // Inject placeholder using fresh state
          const currentChars = useProjectStore.getState().characters
          const charIndex = currentChars.findIndex(c => c.id === charId)

          if (charIndex !== -1) {
            const char = currentChars[charIndex]
            const hasLoading = char.images?.some(img => img.isLoading)

            if (!hasLoading) {
              const newImage: CharacterImage = {
                id: `temp_recover_${Date.now()}`,
                characterId: charId,
                imageType: 'Recovering...',
                imagePath: '',
                promptUsed: '',
                negativePrompt: '',
                seed: 0,
                isSelected: false,
                isLoading: true
              }

              const newChars = [...currentChars]
              newChars[charIndex] = {
                ...char,
                images: [...(char.images || []), newImage]
              }
              setCharacters(newChars)
            }
          }

          // If it's a character task, resume polling
          startPolling(taskId, charId)
        }
      })
    }).catch(err => console.error('Failed to recover active tasks:', err))
  }, [projectId, startPolling, setCharacters])

  const handleStop = async () => {
    if (!currentTaskId) return
    try {
      await generationApi.stopTask(currentTaskId)
      if (pollingRef.current) clearInterval(pollingRef.current)
      pollingRef.current = null
      setGenerateMessage('Stopping...')
    } catch (err) {
      console.error('Stop failed:', err)
    }
  }


  const handleFinalize = async () => {
    if (!selectedCharacter) return

    // If in manage mode but no images selected, warn user
    if (isManagingGallery && selectedImageIds.length === 0) {
      alert('Please select at least one image to anchor this character.')
      return
    }

    setIsFinalizing(true)
    try {
      await analysisService.finalizeAsset(
        projectId,
        'characters',
        selectedCharacter.id,
        selectedImageIds // Can be empty if user just wants to lock without images, or we can enforce it.
      )

      // Refresh
      const updated = await analysisApi.getCharacters(projectId)
      setCharacters(updated)
      setIsManagingGallery(false)
      setSelectedImageIds([])
    } catch (err) {
      console.error('Finalize failed:', err)
      alert('Failed to finalize character')
    } finally {
      setIsFinalizing(false)
    }
  }

  const handleUnfinalize = async () => {
    if (!selectedCharacter) return
    if (!confirm('Unfinalize this character? You will be able to edit and generate new images again.')) return

    try {
      await analysisService.unfinalizeAsset(projectId, 'characters', selectedCharacter.id)
      // Refresh
      const updated = await analysisApi.getCharacters(projectId)
      setCharacters(updated)
    } catch (err) {
      console.error('Unfinalize failed:', err)
      alert('Failed to unfinalize')
    }
  }

  const toggleImageSelection = (imageId: string) => {
    setSelectedImageIds(prev =>
      prev.includes(imageId)
        ? prev.filter(id => id !== imageId)
        : [...prev, imageId]
    )
  }

  const handleGenerate = async () => {
    if (!selectedCharacter?.id || generatingCharId) return

    const selectedTypes = [selections.view, selections.expression, selections.action].filter(Boolean) as string[] as string[]
    if (selectedTypes.length === 0) {
      alert('Please select at least one characteristic')
      return
    }


    try {
      const response = await generationApi.generateCharacterImages(
        projectId,
        selectedCharacter.id,
        selectedTypes,
        selectedWorkflows.character || undefined,
        workflowParams.character || undefined
      )

      // Optimistic UI: Add ONE placeholder for the combined generation
      const combinedTypeLabel = selectedTypes.length > 0
        ? selectedTypes.map(t => t.replace('id_', '')).join(', ')
        : 'Generated'

      const newImage: CharacterImage = {
        id: `temp_${Date.now()}`,
        characterId: selectedCharacter.id,
        imageType: combinedTypeLabel,
        imagePath: '',
        promptUsed: '',
        negativePrompt: '',
        seed: 0,
        isSelected: false,
        isLoading: true
      }

      const updatedCharacters = characters.map(c => {
        if (c.id === selectedCharacter.id) {
          return {
            ...c,
            images: [...(c.images || []), newImage]
          }
        }
        return c
      })
      setCharacters(updatedCharacters)

      startPolling(response.task_id, selectedCharacter.id)
    } catch (err) {
      console.error('Generate failed:', err)
      setGeneratingCharId(null)
      // Remove placeholders if failed immediately
      // Remove placeholders if failed immediately
      const revertedCharacters = characters.map(c => {
        if (c.id === selectedCharacter.id) {
          return {
            ...c,
            images: (c.images || []).filter(img => !img.isLoading)
          }
        }
        return c
      })
      setCharacters(revertedCharacters)
      setGenerateMessage('Failed to start task')
    }
  }



  return (
    <div className="flex flex-1 overflow-hidden">
      {/* List Pane */}
      <div className="w-64 bg-white/90 backdrop-blur-sm border-r border-white/20 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between z-20">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">角色列表</h3>
          <button
            ref={addPopoverButtonRef}
            onClick={() => setShowAddPopover(!showAddPopover)}
            className={`text-slate-400 hover:text-primary-600 hover:bg-primary-50 p-1 rounded transition-colors ${showAddPopover ? 'text-primary-600 bg-primary-50' : ''}`}
            title="添加角色"
          >
            <svg className={`w-4 h-4 transition-transform ${showAddPopover ? 'rotate-45' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          </button>
        </div>

        {/* Add Character Inline Input */}
        {showAddPopover && (
          <div ref={addPopoverContainerRef} className="p-2 bg-primary-50/50 border-b border-primary-100 animate-fade-in">
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={newCharName}
                onChange={(e) => setNewCharName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCharacter()
                  if (e.key === 'Escape') {
                    setShowAddPopover(false)
                    setNewCharName('')
                  }
                }}
                placeholder="角色名称..."
                className="w-full text-sm border border-primary-200 rounded px-2 py-1.5 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 bg-white"
              />
              <button
                onClick={handleAddCharacter}
                disabled={!newCharName.trim()}
                className="btn btn-primary text-xs px-3 py-1.5 disabled:opacity-50 shrink-0"
              >
                添加
              </button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {characters.map((character, index) => (
            <button
              key={character.id}
              onClick={() => handleSelect(index)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all group flex items-center justify-between ${index === selectedIndex
                ? 'bg-primary-50 text-primary-700 shadow-sm border border-primary-100'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${character.gender?.includes('女') || character.gender?.toLowerCase() === 'female' ? 'bg-pink-400' : 'bg-blue-400'
                  }`} />
                <span className="truncate flex-1">{character.name}</span>
              </div>
              <button
                onClick={async (e) => {
                  e.stopPropagation()
                  if (confirm('Are you sure you want to delete this character?')) {
                    try {
                      await analysisApi.deleteCharacter(projectId, character.id)
                      removeCharacter(character.id)
                      if (selectedIndex >= index && selectedIndex > 0) {
                        setSelectedIndex(selectedIndex - 1)
                      }
                    } catch (err) {
                      console.error('Delete failed:', err)
                      alert('删除失败')
                    }
                  }
                }}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-all ml-2"
                title="删除角色"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </button>
          ))}
        </div>
      </div>

      {/* Main Detail Content - Removed padding from container */}
      {characters.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-300 bg-white/5 backdrop-blur-sm">
          <div className="w-16 h-16 bg-white/10 rounded-2xl border border-white/20 flex items-center justify-center mb-6 shadow-sm backdrop-blur-md">
            <span className="text-3xl opacity-50">👤</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-200 mb-2">No Characters Found</h3>
          <p className="text-sm text-slate-400">Run character analysis to populate this list.</p>
        </div>
      ) : (
        <div className="flex-1 bg-white/80 backdrop-blur-md overflow-y-auto">
          <div className="h-full flex flex-col">
            {/* Header / Actions - Sticky & Styled like Scenes */}
            <div className="px-6 py-4 bg-white/80 backdrop-blur-md border-b border-indigo-50/50 flex justify-between items-center sticky top-0 z-10 shadow-sm shrink-0">
              <div>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedCharacter.name || ''}
                    onChange={(e) => updateField('name', e.target.value)}
                    className="input text-xl font-bold px-2 py-1 w-full sm:w-64"
                    placeholder="Character Name"
                  />
                ) : (
                  <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                    {selectedCharacter?.name}
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${selectedCharacter.gender?.includes('Female') || selectedCharacter.gender?.includes('女')
                      ? 'bg-pink-50 text-pink-600 border-pink-100'
                      : 'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>
                      {selectedCharacter.gender?.includes('Female') || selectedCharacter.gender?.includes('女') ? '♀' : '♂'} {selectedCharacter.gender}
                    </span>
                  </h2>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span className="px-2 py-0.5 bg-slate-100 rounded-full border border-slate-200">{selectedCharacter.roleType || 'Role'}</span>
                  <span className="w-px h-3 bg-slate-300"></span>
                  <span className="px-2 py-0.5 bg-slate-100 rounded-full border border-slate-200">{selectedCharacter.age || 'Age'}</span>
                </div>
              </div>

              <div className="flex gap-2">
                {!isEditing ? (
                  <>
                    <button
                      onClick={handleEdit}
                      className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-2"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      Edit Profile
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={!!generatingCharId || !healthStatus?.comfyui?.connected}
                      title={!healthStatus?.comfyui?.connected ? 'Please check ComfyUI service' : ''}
                      className="btn btn-primary text-xs px-3 py-1.5 shadow-md shadow-primary-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {generatingCharId === selectedCharacter.id ? '⏳ Generating...' : '▶ Generate'}
                    </button>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="btn btn-primary px-4"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={handleCancel}
                      className="btn btn-ghost px-4"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {/* Finalize Controls */}
                {!isEditing && (
                  selectedCharacter.isFinalized ? (
                    <button
                      onClick={handleUnfinalize}
                      className="btn bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 hover:border-amber-300 text-xs flex items-center gap-1"
                    >
                      <span>🔓</span> Unlock Character
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        // If already managing gallery, finalize. 
                        // If not, enter manage mode to select images.
                        if (isManagingGallery) {
                          handleFinalize()
                        } else {
                          // Check if we have images. If so, enter manage mode.
                          if (selectedCharacter.images && selectedCharacter.images.length > 0) {
                            setIsManagingGallery(true)
                          } else {
                            // No images, just finalize directly (lock text only)
                            handleFinalize()
                          }
                        }
                      }}
                      disabled={isFinalizing}
                      className={`btn text-xs flex items-center gap-1 ${isManagingGallery
                        ? 'btn-primary shadow-lg shadow-primary-500/30'
                        : 'btn-secondary'}`}
                    >
                      {isFinalizing ? '⏳ Finalizing...' : (isManagingGallery ? '✅ Confirm Anchor' : '🔒 Finalize Role')}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Content Container - Added padding here instead */}
            <div className="p-6 lg:p-8 max-w-7xl mx-auto w-full space-y-6">

              {/* Simple Status Message (Scoped to active character) */}
              {generatingCharId === selectedCharacter.id && generateMessage && (
                <div className="p-3 bg-primary-50 border border-primary-100 rounded-lg shadow-sm animate-fade-in flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="animate-spin w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full flex-shrink-0" />
                    <span className="text-sm font-medium text-primary-700">
                      {generateMessage}
                    </span>
                  </div>
                  <button
                    onClick={handleStop}
                    className="px-2 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded border border-transparent hover:border-red-200 transition-all"
                  >
                    🛑 Stop
                  </button>
                </div>
              )}

              {/* Split Grid - 50/50 Ratio */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* Left Column: Details & Settings */}
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="card p-6">
                    <h3 className="text-sm font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                      <span>📄</span> Character Profile
                    </h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                      <SelectField
                        label="Role Type"
                        value={selectedCharacter.roleType}
                        isEditing={isEditing}
                        editValue={editedCharacter.roleType}
                        onChange={(v) => updateField('roleType', v)}
                        options={[
                          { value: '主角', label: '主角 (Protagonist)' },
                          { value: '配角', label: '配角 (Supporting)' },
                          { value: '反派', label: '反派 (Antagonist)' },
                          { value: '路人', label: '路人 (Extra)' }
                        ]}
                      />
                      <SelectField
                        label="Gender"
                        value={selectedCharacter.gender}
                        isEditing={isEditing}
                        editValue={editedCharacter.gender}
                        onChange={(v) => updateField('gender', v)}
                        options={[
                          { value: '男', label: '男 (Male)' },
                          { value: '女', label: '女 (Female)' }
                        ]}
                      />
                      <SelectField
                        label="Age"
                        value={selectedCharacter.age}
                        isEditing={isEditing}
                        editValue={editedCharacter.age}
                        onChange={(v) => updateField('age', v)}
                        options={[
                          { value: 'Child', label: 'Child (0-12)' },
                          { value: 'Teen', label: 'Teen (13-19)' },
                          { value: 'Young Adult', label: 'Young Adult (20-35)' },
                          { value: 'Adult', label: 'Adult (36-50)' },
                          { value: 'Middle-aged', label: 'Middle-aged (51-65)' },
                          { value: 'Elderly', label: 'Elderly (65+)' }
                        ]}
                      />
                    </div>
                    <div className="mt-4 space-y-4">
                      <Field label="Personality" value={selectedCharacter.personality} isEditing={isEditing} editValue={editedCharacter.personality} onChange={(v) => updateField('personality', v)} multiline />
                      <Field label="Clothing Style" value={selectedCharacter.clothingStyle} isEditing={isEditing} editValue={editedCharacter.clothingStyle} onChange={(v) => updateField('clothingStyle', v)} multiline />
                      <div className="border-t border-slate-100 pt-4 mt-4">
                        <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Appearance Details</h4>
                        <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                          <Field label="Hair" value={selectedCharacter.hair} isEditing={isEditing} editValue={editedCharacter.hair} onChange={(v) => updateField('hair', v)} />
                          <Field label="Face" value={selectedCharacter.face} isEditing={isEditing} editValue={editedCharacter.face} onChange={(v) => updateField('face', v)} />
                          <Field label="Body" value={selectedCharacter.body} isEditing={isEditing} editValue={editedCharacter.body} onChange={(v) => updateField('body', v)} />
                          <Field label="Skin" value={selectedCharacter.skin} isEditing={isEditing} editValue={editedCharacter.skin} onChange={(v) => updateField('skin', v)} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="card p-6">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <span>⚙️</span> Image Generation Settings
                      </h3>
                      <div className="flex bg-slate-100 p-1 rounded-lg items-center">
                        <button
                          onClick={() => {
                            setIsManageMode(!isManageMode)
                            // Clean states when exiting manage mode
                            if (isManageMode) {
                              setAddingCategory(null)
                              setEditingTagKey(null)
                            }
                          }}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${isManageMode ? 'bg-white shadow-sm text-slate-900' : 'hover:bg-white hover:shadow-sm text-slate-500'}`}
                        >
                          {isManageMode ? '✓ Done' : '⚙️ Manage'}
                        </button>
                      </div>
                    </div>

                    {templates ? (
                      <div className="space-y-6">
                        {/* Render Categories */}
                        {([
                          { key: 'view', label: '1. 视图 (View)', category: '三视图' },
                          { key: 'expression', label: '2. 表情 (Expression)', category: '表情系列' },
                          { key: 'action', label: '3. 动作 (Action)', category: '动作系列' },
                        ] as const).map(({ key, label, category }) => (
                          <div key={key}>
                            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{label}</h4>
                            <div className="flex flex-wrap gap-2">
                              {/* Tags List */}
                              {(templates.templates[category] || []).map(type => {
                                const isEditing = editingTagKey === type.id

                                if (isEditing) {
                                  return (
                                    <input
                                      key={type.id}
                                      autoFocus
                                      className="px-2 py-1 text-sm rounded-lg border border-primary-500 outline-none w-24"
                                      value={tempTagValue}
                                      onChange={(e) => setTempTagValue(e.target.value)}
                                      onBlur={() => handleUpdateTag(category, type.id, tempTagValue)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleUpdateTag(category, type.id, tempTagValue)
                                        if (e.key === 'Escape') setEditingTagKey(null)
                                      }}
                                    />
                                  )
                                }

                                return (
                                  <div key={type.id} className="relative group">
                                    <button
                                      onClick={() => {
                                        if (isManageMode) {
                                          setEditingTagKey(type.id)
                                          setTempTagValue(type.label)
                                        } else {
                                          toggleSelection(key, type.id)
                                        }
                                      }}
                                      className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${selections[key] === type.id
                                        ? 'bg-primary-50 border-primary-500 text-primary-700 font-medium shadow-sm'
                                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                        } ${isManageMode ? 'hover:border-primary-300 cursor-text' : ''}`}
                                    >
                                      {selections[key] === type.id && !isManageMode && '● '} {type.label}
                                    </button>

                                    {isManageMode && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDeleteTag(category, type.id)
                                        }}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] shadow-sm hover:scale-110"
                                      >
                                        ✕
                                      </button>
                                    )}
                                  </div>
                                )
                              })}

                              {/* Add Button */}
                              {addingCategory === category ? (
                                <input
                                  autoFocus
                                  className="px-2 py-1 text-sm rounded-lg border border-primary-500 outline-none w-24 animate-fade-in"
                                  placeholder="New Tag"
                                  value={tempTagValue}
                                  onChange={(e) => setTempTagValue(e.target.value)}
                                  onBlur={() => {
                                    if (tempTagValue.trim()) {
                                      handleAddTag(category)
                                    } else {
                                      setAddingCategory(null)
                                      setTempTagValue('')
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleAddTag(category)
                                    if (e.key === 'Escape') {
                                      setAddingCategory(null)
                                      setTempTagValue('')
                                    }
                                  }}
                                />
                              ) : (
                                <button
                                  onClick={() => {
                                    setAddingCategory(category)
                                    setTempTagValue('')
                                  }}
                                  className="px-3 py-1.5 text-sm rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-primary-400 hover:text-primary-600 hover:bg-slate-50 transition-all flex items-center gap-1"
                                  title="Add Tag"
                                >
                                  <span>+</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-slate-400 text-sm italic">Loading settings...</div>
                    )}
                  </div>

                  {/* Audio Section */}
                  <AudioSection
                    character={selectedCharacter}
                    projectId={projectId}
                    onAudiosUpdated={async () => {
                      const updated = await analysisApi.getCharacters(projectId)
                      setCharacters(updated)
                    }}
                  />
                </div>

                {/* Right Column: Gallery */}
                <div className="h-full">
                  <div className="card p-6 h-full min-h-[500px] flex flex-col">
                    <h3 className="text-sm font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span>🖼️</span> Generated Gallery
                      </span>
                      <div className="flex items-center gap-3">
                        {!selectedCharacter.isFinalized && (
                          <button
                            onClick={() => {
                              setIsManagingGallery(!isManagingGallery)
                              if (isManagingGallery) setSelectedImageIds([]) // Clear selection on exit
                            }}
                            className={`text-xs px-2 py-1 rounded-md transition-colors ${isManagingGallery
                              ? 'bg-primary-600 text-white shadow-sm'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                          >
                            {isManagingGallery ? 'Cancel Selection' : '⚙️ Manage / Anchor'}
                          </button>
                        )}
                        <input
                          ref={uploadInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleUploadImage}
                        />
                        <button
                          onClick={() => uploadInputRef.current?.click()}
                          disabled={isUploading}
                          className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
                          title="Upload image"
                        >
                          {isUploading ? '⏳' : '⬆️ Upload'}
                        </button>
                        <span className="text-xs px-2 py-0.5 bg-slate-100 rounded-full text-slate-500">
                          {selectedCharacter.images?.length || 0} images
                        </span>
                      </div>
                    </h3>

                    <div className="flex-1 overflow-y-auto pr-1">
                      {selectedCharacter.images && selectedCharacter.images.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {selectedCharacter.images.map((img, index) => (
                            <div
                              key={img.id}
                              className={`relative group rounded-xl overflow-hidden border transition-all aspect-[3/4] shadow-sm 
                              ${img.isLoading ? 'cursor-wait bg-slate-50 border-slate-200' : 'cursor-pointer'}
                              ${selectedImageIds.includes(img.id) ? 'ring-4 ring-primary-500 border-primary-500 shadow-xl scale-95' : 'border-slate-200 hover:shadow-md'}
                              ${selectedCharacter.isFinalized && !selectedCharacter.finalizedMetadata?.selected_image_ids?.includes(img.id) ? 'opacity-40 grayscale' : ''}
                          `}
                              onClick={() => {
                                if (img.isLoading) return
                                if (isManagingGallery && !selectedCharacter.isFinalized) {
                                  toggleImageSelection(img.id)
                                } else {
                                  setLightboxImage(fileUrl.image(img.imagePath))
                                }
                              }}
                            >
                              {img.isLoading ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-primary-500">
                                  <span className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full mb-2" />
                                  <span className="text-xs font-medium animate-pulse">Generating...</span>
                                  <span className="text-[10px] text-slate-400 mt-1">{img.imageType}</span>
                                </div>
                              ) : (
                                <img
                                  src={fileUrl.image(img.imagePath)}
                                  alt={img.imageType}
                                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                              )}

                              {/* Hover info box - shows to the left or right depending on grid position */}
                              {!img.isLoading && (
                                <div className={`absolute top-0 w-64 p-3 bg-white/95 backdrop-blur-md shadow-2xl border border-slate-200 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-[60] hidden lg:block
                                ${(index + 1) % 3 === 0 ? 'right-full mr-3' : 'left-full ml-3'}`}>
                                  <div className="text-[10px] font-bold text-primary-600 mb-1.5 uppercase tracking-widest border-b border-slate-100 pb-1">Prompt Details</div>
                                  <div className="space-y-2">
                                    <div className="text-[11px] text-slate-600 leading-relaxed font-medium">
                                      {img.promptUsed || 'No prompt information available.'}
                                    </div>
                                    {img.seed && (
                                      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-50">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase">Seed:</span>
                                        <span className="text-[10px] text-slate-500 font-mono">{img.seed}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Overlay with single download button */}
                              {!img.isLoading && (
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] text-white/90 font-medium capitalize truncate pl-1">{img.imageType}</span>
                                    <div className="flex gap-1">
                                      {isManagingGallery ? (
                                        selectedCharacter.isFinalized ? null : (
                                          <div className="flex gap-2 w-full justify-between items-center">
                                            {/* Selection Indicator */}
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center
                                                ${selectedImageIds.includes(img.id) ? 'bg-primary-500 border-primary-500' : 'border-white bg-black/20'}`}>
                                              {selectedImageIds.includes(img.id) && <span className="text-white text-[10px]">✓</span>}
                                            </div>

                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                handleDeleteImage(img.id)
                                              }}
                                              className="p-1.5 bg-red-500 hover:bg-red-600 rounded-lg text-white shadow-lg transition-colors"
                                              title="Delete Image"
                                            >
                                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                          </div>
                                        )
                                      ) : (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleDownload(fileUrl.image(img.imagePath), `char_${selectedCharacter.name}_${img.imageType}_${img.id.slice(0, 4)}.png`)
                                          }}
                                          className="p-1.5 bg-white/20 hover:bg-white/40 rounded-lg text-white backdrop-blur-sm transition-colors"
                                          title="Download Image"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                          </svg>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-10 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-slate-100">
                            <span className="text-3xl opacity-30">🖼️</span>
                          </div>
                          <h4 className="text-slate-900 font-medium mb-1">No Images Yet</h4>
                          <p className="text-xs text-slate-500 max-w-[200px]">
                            Select image types on the left settings panel and click Generate to start.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Lightbox Overlay */}
      {
        lightboxImage && (
          <Lightbox
            imageUrl={lightboxImage}
            onClose={() => setLightboxImage(null)}
          />
        )
      }
    </div>
  )
}


function SelectField({
  label,
  value,
  isEditing,
  editValue,
  onChange,
  options
}: {
  label: string
  value?: string
  isEditing: boolean
  editValue?: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      {isEditing ? (
        <select
          value={editValue || ''}
          onChange={(e) => onChange(e.target.value)}
          className="input w-full p-2 text-sm appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236B7280%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-no-repeat bg-[right_0.5rem_center]"
        >
          <option value="" disabled>Select {label.toLowerCase()}...</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <div className="text-sm font-medium text-slate-800 min-h-[38px] flex items-center px-1">
          {value || <span className="text-slate-400 italic">Enter {label.toLowerCase()}...</span>}
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  isEditing,
  editValue,
  onChange,
  multiline = false
}: {
  label: string
  value?: string
  isEditing: boolean
  editValue?: string
  onChange: (value: string) => void
  multiline?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      {isEditing ? (
        multiline ? (
          <textarea
            value={editValue || ''}
            onChange={(e) => onChange(e.target.value)}
            className="input w-full p-2 text-sm min-h-[80px]"
            placeholder={`Enter ${label.toLowerCase()}...`}
          />
        ) : (
          <input
            type="text"
            value={editValue || ''}
            onChange={(e) => onChange(e.target.value)}
            className="input w-full p-2 text-sm"
            placeholder={`Enter ${label.toLowerCase()}...`}
          />
        )
      ) : (
        <span className={`text-sm text-slate-700 leading-relaxed ${!value ? 'italic text-slate-400' : ''}`}>
          {value || 'Not specified'}
        </span>
      )}
    </div>
  )
}

function Lightbox({
  imageUrl,
  onClose
}: {
  imageUrl: string
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <img
        src={imageUrl}
        alt="Full view"
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking image
      />
    </div>
  )
}


function ScenesContent({
  scenes,
  projectId
}: {
  scenes: Scene[]
  projectId: string
}) {
  const { setScenes, addScene, removeScene, selectedWorkflows, workflowParams, healthStatus } = useProjectStore()
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editedScene, setEditedScene] = useState<Partial<Scene>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false)
  // Removed unused scroll handlers from old carousel layout

  // Resolution
  const [sceneResolution, setSceneResolutionRaw] = useState(() => {
    return localStorage.getItem('dreamstage_scene_resolution') || '768x1344'
  })
  const setSceneResolution = (newRes: string) => {
    setSceneResolutionRaw(newRes)
    localStorage.setItem('dreamstage_scene_resolution', newRes)
  }

  // Add Scene State
  const [showAddPopover, setShowAddPopover] = useState(false)
  const [newSceneLocation, setNewSceneLocation] = useState('')
  const addPopoverContainerRef = useRef<HTMLDivElement>(null)
  const addPopoverButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        showAddPopover &&
        addPopoverContainerRef.current &&
        !addPopoverContainerRef.current.contains(event.target as Node) &&
        addPopoverButtonRef.current &&
        !addPopoverButtonRef.current.contains(event.target as Node)
      ) {
        setShowAddPopover(false)
        setNewSceneLocation('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showAddPopover])

  const handleAddScene = async () => {
    // Calculate next scene number
    const maxSceneNum = scenes.reduce((max, s) => Math.max(max, s.sceneNumber), 0)
    const nextNum = maxSceneNum + 1
    const location = newSceneLocation.trim() || '新场景'

    try {
      const newScene = await analysisApi.createScene(projectId, {
        scene_number: nextNum,
        location: location,
        time_of_day: '白天',
        atmosphere: '一般'
      } as any)
      addScene(newScene)
      setSelectedIndex(scenes.length)
      setShowAddPopover(false)
      setNewSceneLocation('')
    } catch (err) {
      console.error('Add scene failed:', err)
      alert('添加场景失败')
    }
  }

  const selectedScene = scenes[selectedIndex]

  // Generation state
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(null)
  const [generateMessage, setGenerateMessage] = useState('')
  const pollingRef = useRef<number | null>(null)

  const handleSelect = (index: number) => {
    setSelectedIndex(index)
    setIsEditing(false)
    setEditedScene({})
  }

  const handleEdit = () => {
    if (!selectedScene) return
    setIsEditing(true)
    setEditedScene({
      location: selectedScene.location,
      timeOfDay: selectedScene.timeOfDay,
      atmosphere: selectedScene.atmosphere,
      environmentDesc: selectedScene.environmentDesc,

      dialogue: selectedScene.dialogue,
    })
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditedScene({})
  }

  const handleSave = async () => {
    if (!selectedScene?.id) return

    setIsSaving(true)
    try {
      await analysisApi.updateScene(projectId, selectedScene.id, {
        location: editedScene.location,
        timeOfDay: editedScene.timeOfDay,
        atmosphere: editedScene.atmosphere,
        environmentDesc: editedScene.environmentDesc,

        dialogue: editedScene.dialogue,
      })

      alert('Successfully saved')
      setIsEditing(false)
      const updated = await analysisApi.getScenes(projectId)
      setScenes(updated)
    } catch (err) {
      console.error('Save scene failed:', err)
      alert('Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  const handleFinalize = async () => {
    const imageIds = selectedScene?.sceneImage ? [selectedScene.sceneImage.id] : []
    if (!selectedScene) return

    if (!confirm(`Finalize scene #${selectedScene.sceneNumber}? This will lock the scene.`)) return

    setIsFinalizing(true)
    try {
      await analysisService.finalizeAsset(
        projectId,
        'scenes',
        selectedScene.id,
        imageIds
      )
      const updated = await analysisApi.getScenes(projectId)
      setScenes(updated)
    } catch (err) {
      console.error('Finalize scene failed:', err)
      alert('Failed to finalize scene')
    } finally {
      setIsFinalizing(false)
    }
  }

  const handleUnfinalize = async () => {
    if (!selectedScene) return
    if (!confirm('Unlock this scene?')) return

    try {
      await analysisService.unfinalizeAsset(
        projectId,
        'scenes',
        selectedScene.id
      )
      const updated = await analysisApi.getScenes(projectId)
      setScenes(updated)
    } catch (err) {
      console.error('Unfinalize scene failed:', err)
      alert('Failed to unlock scene')
    }
  }



  const updateField = (field: keyof Scene, value: string) => {
    setEditedScene(prev => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  const startPolling = useCallback((taskId: string, targetId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current)

    setGeneratingSceneId(targetId)
    setGenerateMessage('Syncing task status...')

    pollingRef.current = window.setInterval(async () => {
      try {
        const status = await generationApi.getTaskStatus(taskId)
        setGenerateMessage(status.message || 'Generating...')

        if (status.status === 'completed') {
          if (pollingRef.current) clearInterval(pollingRef.current)
          pollingRef.current = null
          setGenerateMessage('Done!')

          // Force reload and update state
          const updatedScenes = await analysisApi.getScenes(projectId)
          setScenes(updatedScenes)

          setTimeout(() => {
            setGeneratingSceneId(null)
            setGenerateMessage('')
          }, 2000)
        } else if (status.status === 'failed') {
          if (pollingRef.current) clearInterval(pollingRef.current)
          pollingRef.current = null
          setGenerateMessage(`Failed: ${status.error || 'Unknown error'}`)
          setTimeout(() => {
            setGeneratingSceneId(null)
            setGenerateMessage('')
          }, 5000)
        }
      } catch (err) {
        console.error('Poll status failed:', err)
      }
    }, 1000)
  }, [projectId, setScenes])

  useEffect(() => {
    // Status Recovery: Check for active tasks on mount
    generationApi.getActiveTasks(projectId).then(tasks => {
      Object.entries(tasks).forEach(([taskId, status]) => {
        if (status.target_id && !status.target_id.startsWith('all_') && status.target_id !== 'library') {
          const sceneId = status.target_id

          // Inject placeholder if needed
          const currentScenes = useProjectStore.getState().scenes
          const sceneIndex = currentScenes.findIndex(s => s.id === sceneId)

          if (sceneIndex !== -1) {
            const scene = currentScenes[sceneIndex]
            if (!scene.sceneImage) {
              const newImage: SceneImage = {
                id: `temp_recover_${Date.now()}`,
                sceneId: sceneId,
                imagePath: '',
                promptUsed: 'Recovering...',
                seed: 0,
                isApproved: false,
                isLoading: true
              }

              const newScenes = [...currentScenes]
              newScenes[sceneIndex] = {
                ...scene,
                sceneImage: newImage
              }
              setScenes(newScenes)
            }
          }

          startPolling(taskId, sceneId)
        }
      })
    }).catch(err => console.error('Failed to recover active scenes tasks:', err))
  }, [projectId, startPolling, setScenes])

  const handleGenerateImage = async () => {
    if (!selectedScene?.id || generatingSceneId) return

    try {
      const [w, h] = sceneResolution.split('x').map(Number)
      const resolvedParams = { ...workflowParams.scene, width: w, height: h }
      const response = await generationApi.generateSceneImage(projectId, selectedScene.id, selectedWorkflows.scene || undefined, resolvedParams)
      startPolling(response.task_id, selectedScene.id)
    } catch (err) {
      console.error('Generate image failed:', err)
      setGeneratingSceneId(null)
      setGenerateMessage('Failed to start task')
    }
  }



  const handleDeleteSceneImage = async () => {
    if (!selectedScene?.sceneImage?.id) return
    if (!confirm('Permanently delete this scene image?')) return
    try {
      await analysisApi.deleteSceneImage(projectId, selectedScene.sceneImage.id)
      const updated = await analysisApi.getScenes(projectId)
      setScenes(updated)
    } catch (err) {
      console.error('Delete scene image failed:', err)
      alert('Failed to delete image')
    }
  }



  return (
    <div className="flex-1 flex h-full bg-transparent overflow-hidden">
      {/* LEFT SIDEBAR: Scene List - Uses Wood Theme indirectly via bg-white/50 or custom class */}
      <div className="w-72 bg-white/50 backdrop-blur-md border-r border-amber-200/50 flex flex-col shrink-0">
        <div className="p-4 border-b border-amber-200/50 bg-amber-50/50 flex items-center justify-between relative z-20">
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">场景时间轴</h3>
            <div className="text-xs text-slate-400 font-mono">共 {scenes.length} 场</div>
          </div>
          <button
            ref={addPopoverButtonRef}
            onClick={() => setShowAddPopover(!showAddPopover)}
            className={`text-slate-400 hover:text-amber-600 hover:bg-amber-100 p-1.5 rounded-lg transition-colors border border-transparent hover:border-amber-200 ${showAddPopover ? 'text-amber-600 bg-amber-100 border-amber-200' : ''}`}
            title="添加场景"
          >
            <svg className={`w-4 h-4 transition-transform ${showAddPopover ? 'rotate-45' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          </button>
        </div>

        {/* Add Scene Inline Input */}
        {showAddPopover && (
          <div ref={addPopoverContainerRef} className="p-2 bg-amber-50/50 border-b border-amber-100 animate-fade-in">
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                value={newSceneLocation}
                onChange={(e) => setNewSceneLocation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddScene()
                  if (e.key === 'Escape') {
                    setShowAddPopover(false)
                    setNewSceneLocation('')
                  }
                }}
                placeholder="例如: 咖啡馆 / INT. COFFEE SHOP"
                className="w-full text-sm border border-amber-200 rounded px-2 py-1.5 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-white"
              />
              <button
                onClick={handleAddScene}
                className="btn bg-amber-500 hover:bg-amber-600 text-white border-none text-xs px-3 py-1.5 shadow-sm shadow-amber-500/20 shrink-0"
              >
                添加
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
          {scenes.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-sm">No scenes found</div>
          ) : (
            scenes.map((scene, i) => (
              <button
                key={scene.id}
                onClick={() => handleSelect(i)}
                className={`w-full text-left p-2 rounded-lg border transition-all flex gap-3 group relative ${i === selectedIndex
                  ? 'bg-amber-100 border-amber-300 shadow-sm'
                  : 'bg-transparent border-transparent hover:bg-white/50 hover:border-amber-200'
                  }`}
              >
                {/* Thumbnail */}
                <div className="w-16 h-12 bg-slate-100 rounded overflow-hidden shrink-0 border border-slate-200 relative">
                  {scene.sceneImage ? (
                    <img src={fileUrl.image(scene.sceneImage.imagePath)} className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-lg opacity-20">🎬</div>
                  )}
                  {/* Status Indicator */}
                  {scene.sceneImage && <div className="absolute top-0 right-0 w-2 h-2 bg-green-500 rounded-full border border-white m-0.5"></div>}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 py-0.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-bold truncate mb-0.5 ${i === selectedIndex ? 'text-amber-900' : 'text-slate-700'}`}>
                      #{scene.sceneNumber} {scene.location}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${i === selectedIndex ? 'bg-primary-400' : 'bg-slate-300'}`}></span>
                      {scene.timeOfDay}
                    </div>
                  </div>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation()
                      if (confirm('Are you sure you want to delete this scene?')) {
                        try {
                          await analysisApi.deleteScene(projectId, scene.id)
                          removeScene(scene.id)
                          if (selectedIndex >= i && selectedIndex > 0) {
                            setSelectedIndex(selectedIndex - 1)
                          }
                        } catch (err) {
                          console.error('Delete scene failed:', err)
                          alert('删除场景失败')
                        }
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded transition-all"
                    title="删除场景"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Detailed View */}
      {scenes.length > 0 ? (
        <div className="flex-1 overflow-y-auto">
          <div className="h-full flex flex-col">
            {/* Header Toolbar */}
            <div className="px-6 py-4 bg-white/80 border-b border-amber-200/50 flex justify-between items-center sticky top-0 z-10 shadow-sm backdrop-blur-md">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                  <span className="text-slate-300 font-mono text-lg">#{selectedScene.sceneNumber}</span>
                  {isEditing ? (
                    <input
                      value={editedScene.location || ''}
                      onChange={(e) => updateField('location', e.target.value)}
                      className="input py-1 px-2 font-bold text-lg"
                    />
                  ) : (
                    <span>{selectedScene.location}</span>
                  )}
                </h2>
              </div>

              <div className="flex gap-3 items-center">
                {isEditing ? (
                  <>
                    <button onClick={handleSave} disabled={isSaving} className="btn btn-primary text-sm px-6 py-2 rounded-lg font-medium shadow-sm transition-all bg-indigo-600 text-white hover:bg-indigo-700">Save Changes</button>
                    <button onClick={handleCancel} className="btn btn-ghost text-sm px-6 py-2 rounded-lg font-medium transition-all">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={handleEdit} className="btn btn-secondary text-sm px-6 py-2 flex items-center justify-center gap-2 font-medium bg-white rounded-lg shadow-sm border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      Edit Scene
                    </button>

                    <button
                      onClick={handleGenerateImage}
                      disabled={!!generatingSceneId || !healthStatus?.comfyui?.connected}
                      title={!healthStatus?.comfyui?.connected ? 'Please check ComfyUI service' : ''}
                      className="btn btn-primary text-sm px-6 py-2 flex items-center justify-center gap-2 font-medium rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-700 text-white transition-all"
                    >
                      {generatingSceneId === selectedScene.id ? '⏳ Generating...' : '▶ Generate'}
                    </button>

                    {selectedScene.isFinalized ? (
                      <button
                        onClick={handleUnfinalize}
                        className="btn text-sm px-6 py-2 flex items-center justify-center gap-2 font-medium rounded-lg shadow-sm border border-amber-200 bg-amber-50 text-amber-600 hover:bg-amber-100 hover:border-amber-300 transition-all"
                      >
                        <span>🔓</span> Unlock Scene
                      </button>
                    ) : (
                      <button
                        onClick={handleFinalize}
                        disabled={!selectedScene.sceneImage || isFinalizing}
                        title={!selectedScene.sceneImage ? 'Generate an image first' : ''}
                        className="btn btn-secondary text-sm px-6 py-2 flex items-center justify-center gap-2 font-medium bg-white rounded-lg shadow-sm border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span>🔒</span> {isFinalizing ? 'Finalizing...' : 'Finalize Scene'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Content Layout: Split Grid */}
            <div className="p-6 max-w-[1600px] w-full mx-auto flex-1 min-h-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">

                {/* LEFT: Details & Context */}
                <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar">

                  {/* 1. Scene Details */}
                  <div className="card p-6">
                    <h3 className="text-sm font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                      <span>📄</span> Scene Details
                    </h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                      <Field label="Location" value={selectedScene.location} isEditing={isEditing} editValue={editedScene.location} onChange={(v) => updateField('location', v)} />
                      <Field label="Time" value={selectedScene.timeOfDay} isEditing={isEditing} editValue={editedScene.timeOfDay} onChange={(v) => updateField('timeOfDay', v)} />
                      <Field label="Atmosphere" value={selectedScene.atmosphere} isEditing={isEditing} editValue={editedScene.atmosphere} onChange={(v) => updateField('atmosphere', v)} />

                      <div className="flex flex-col">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Resolution</label>
                        <div className="flex items-center gap-2">
                          <input 
                            className="input w-28 px-2 text-center py-2 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all" 
                            type="number" 
                            value={sceneResolution.split('x')[0] || ''} 
                            onChange={(e) => setSceneResolution(`${e.target.value}x${sceneResolution.split('x')[1] || '1024'}`)} 
                          />
                          <span className="text-slate-400 font-medium">×</span>
                          <input 
                            className="input w-28 px-2 text-center py-2 text-sm bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all" 
                            type="number" 
                            value={sceneResolution.split('x')[1] || ''} 
                            onChange={(e) => setSceneResolution(`${sceneResolution.split('x')[0] || '1024'}x${e.target.value}`)} 
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2. Visual Context */}
                  <div className="card p-6 border-l-4 border-l-blue-500 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                      <span>👁️</span> Visual Context
                    </h3>
                    <div className="space-y-4">
                      <Field label="Environment Description" value={selectedScene.environmentDesc} isEditing={isEditing} editValue={editedScene.environmentDesc} onChange={(v) => updateField('environmentDesc', v)} multiline />

                    </div>
                  </div>

                  {/* 3. Dialogue Preview */}
                  {selectedScene.dialogue && (
                    <div className="card p-6">
                      <h3 className="text-sm font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                        <span>💬</span> Dialogue Preview
                      </h3>
                      <div className="text-sm text-slate-600 whitespace-pre-line leading-relaxed italic border-l-2 border-slate-200 pl-4 py-1">
                        {selectedScene.dialogue}
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT: Image Generation (Sticky/Fixed) */}
                <div className="h-full flex flex-col min-h-0">
                  <div className="card p-1 overflow-hidden bg-slate-50 border-slate-200 flex flex-col h-full shadow-sm">
                    {/* Toolbar */}
                    <div className="px-4 py-3 bg-white border-b border-slate-100 flex justify-between items-center shrink-0">
                      <h3 className="text-sm font-semibold text-slate-700">Scene Visualization</h3>
                      <div className="flex items-center gap-2">
                        {generatingSceneId === selectedScene.id && (
                          <div className="flex items-center gap-2 mr-3 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs animate-pulse border border-blue-100">
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                            {generateMessage}
                          </div>
                        )}
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                          <span className="text-xs text-slate-400 px-2">Settings & Preview</span>
                        </div>
                      </div>
                    </div>

                    {/* Preview Area */}
                    <div className="bg-slate-50/50 flex-1 p-8 flex items-center justify-center overflow-hidden">
                      <div className="relative max-w-full max-h-full flex flex-col items-center justify-center">
                        {selectedScene.sceneImage ? (
                          selectedScene.sceneImage.isLoading ? (
                            <div className="flex flex-col items-center justify-center text-primary-500">
                              <span className="animate-spin w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full mb-3" />
                              <span className="text-sm font-medium animate-pulse">Generating Scene Image...</span>
                            </div>
                          ) : (
                            <div
                              className="relative group cursor-zoom-in"
                              onClick={() => setLightboxImage(fileUrl.image(selectedScene.sceneImage!.imagePath))}
                            >
                              <div className="relative p-1 bg-white rounded shadow-sm border border-slate-200">
                                <div className="relative border-4 border-slate-800/5 rounded-sm overflow-hidden">
                                  <img
                                    src={fileUrl.image(selectedScene.sceneImage.imagePath)}
                                    className="max-w-full max-h-[60vh] object-contain block" // limit height to avoid overflow
                                    alt={`Scene ${selectedScene.sceneNumber}`}
                                  />
                                </div>
                              </div>
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded pointer-events-none flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <span className="bg-black/70 text-white text-xs px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/20 shadow-lg transform scale-95 group-hover:scale-100 transition-all duration-300">
                                  🔍 Click to Zoom
                                </span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteSceneImage()
                                }}
                                className="absolute -top-3 -right-3 p-2 bg-white text-red-500 rounded-full shadow-lg border border-slate-100 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 hover:scale-110 z-10"
                                title="Delete Image"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          )
                        ) : selectedScene.videoClip ? (
                          <div className="h-full w-full aspect-video max-h-[60vh] bg-black rounded-lg overflow-hidden shadow-lg border-[6px] border-slate-800">
                            <video
                              src={fileUrl.video(selectedScene.videoClip.videoPath)}
                              controls
                              className="w-full h-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="w-96 aspect-video flex items-center justify-center flex-col text-slate-400 bg-slate-100 rounded-xl border-2 border-dashed border-slate-200">
                            <span className="text-4xl mb-3 opacity-30">🖼️</span>
                            <span className="text-sm font-medium">No Preview</span>
                            <span className="text-[10px] text-slate-400 mt-1">Generate an image to view</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      ) : (
        <div className="flex-1 w-full h-full flex flex-col items-center justify-center text-center p-8 text-slate-300 bg-white/5 backdrop-blur-sm">
          <div className="w-16 h-16 bg-white rounded-2xl border border-slate-200 flex items-center justify-center mb-6 shadow-sm">
            <span className="text-3xl opacity-20">🎬</span>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">No Scenes Available</h3>
          <p className="text-sm text-slate-500">Analyze a script to generate scenes.</p>
        </div>
      )}
      {/* Lightbox */}
      {lightboxImage && (
        <Lightbox imageUrl={lightboxImage} onClose={() => setLightboxImage(null)} />
      )}
    </div>
  )
}



// Clear Cache Button Component
function ClearCacheButton({ onClear }: { onClear?: () => void }) {
  const [clearing, setClearing] = useState(false)

  const handleClear = async (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent terminal toggle
    setClearing(true)
    try {
      const result = await configApi.clearLlmCache({
        clearPromptCache: true,
        clearAnalysisTasks: true,
        clearOutputFiles: false,
      })
      onClear?.()
      console.log('Cache cleared:', result.message)
    } catch (err) {
      console.error('Clear cache failed:', err)
    } finally {
      setClearing(false)
    }
  }

  return (
    <button
      onClick={handleClear}
      disabled={clearing}
      className="text-[10px] text-slate-400 hover:text-red-400 font-medium transition-colors px-2 py-0.5 rounded hover:bg-red-500/10 flex items-center gap-1"
      title="清除 LLM 缓存和分析任务"
    >
      {clearing ? (
        <span className="w-2.5 h-2.5 border border-slate-500 border-t-red-400 rounded-full animate-spin" />
      ) : (
        <span>🗑️</span>
      )}
      <span>{clearing ? '清除中...' : '清除缓存'}</span>
    </button>
  )
}

