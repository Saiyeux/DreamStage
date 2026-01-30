import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Character, Scene, CharacterImage } from '@/types'
import { projectsApi, analysisApi, charactersApi, generationApi, configApi } from '@/api'
import type { ImageType, CharacterImageTemplates } from '@/api'
import { useProjectStore } from '@/stores/projectStore'
import { analysisService } from '@/services/analysisService'
import { ProjectSidebar } from '@/components/ProjectSidebar'
import { fileUrl } from '@/api/client'

type Tab = 'characters' | 'scenes'

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
    selectedWorkflows,
    workflowParams
  } = useProjectStore()

  const projectId = urlProjectId || currentProject?.id

  const [activeTab, setActiveTab] = useState<Tab>('characters')
  const [loading, setLoading] = useState(false)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)

  const { terminalOutput, isStreaming, terminalExpanded, currentAnalyzing } = analysisState
  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [terminalOutput])

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
  }, [projectId])

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

  const createAnalysisCallbacks = useCallback((analysisType: 'characters' | 'scenes') => ({
    onStart: () => {
      appendTerminalOutput(`[${new Date().toLocaleTimeString()}] LLM Responding...`)
      appendTerminalOutput('')
    },
    onChunk: (content: string) => {
      updateLastTerminalLine(content)
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
          } else {
            const data = await analysisApi.getScenes(projectId)
            setScenes(data)
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

  const analyzeWithStream = async (analysisType: 'characters' | 'scenes') => {
    if (!projectId) return
    if (isStreaming || analysisService.isAnalyzing()) return

    setAnalysisState({
      isStreaming: true,
      terminalExpanded: true,
      currentAnalyzing: analysisType,
    })

    const typeName = analysisType === 'characters' ? 'Characters' : 'Scenes'
    setAnalysisState({
      terminalOutput: [
        `> Starting analysis for ${typeName}...`,
        `[${new Date().toLocaleTimeString()}] Connecting to LLM Service...`,
        '',
      ],
    })

    const callbacks = createAnalysisCallbacks(analysisType)
    analysisService.start(projectId, analysisType, callbacks)
  }

  const handleProjectChange = (newProjectId: string) => {
    if (newProjectId && newProjectId !== projectId) {
      setSearchParams({ project: newProjectId })
    }
  }

  // Empty state
  if (!projectId) {
    return (
      <div className="flex h-screen bg-slate-50">
        <ProjectSidebar
          currentProject={null}
          onProjectChange={handleProjectChange}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 bg-white rounded-2xl border border-slate-200 flex items-center justify-center mx-auto mb-6 shadow-sm">
              <span className="text-3xl">👋</span>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Welcome to Studio</h2>
            <p className="text-sm text-slate-500">Select or create a project to get started with script analysis</p>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-screen bg-slate-50">
        <ProjectSidebar
          currentProject={currentProject}
          onProjectChange={handleProjectChange}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <span className="w-8 h-8 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin" />
            <span className="text-sm font-medium text-slate-500">Loading workspace...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar */}
      <ProjectSidebar
        currentProject={currentProject}
        onProjectChange={handleProjectChange}
        onAnalyzeCharacters={() => analyzeWithStream('characters')}
        onAnalyzeScenes={() => analyzeWithStream('scenes')}
        isAnalyzing={isStreaming}
        currentAnalyzing={currentAnalyzing}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm z-10 basis-16 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center text-lg shadow-sm border border-indigo-100">
                📝
              </span>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight truncate max-w-md">
                {currentProject?.name || 'Untitled Project'}
              </h1>
            </div>

            {isStreaming && (
              <span className="badge badge-accent animate-pulse-soft">
                Processing
              </span>
            )}
          </div>

          {/* View Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('characters')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'characters'
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              <span>👤</span> Characters
              {characters.length > 0 && (
                <span className={`text-xs ${activeTab === 'characters' ? 'opacity-100' : 'opacity-60'} bg-slate-200 px-1.5 rounded-full`}>
                  {characters.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('scenes')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'scenes'
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
                }`}
            >
              <span>🎬</span> Scenes
              {scenes.length > 0 && (
                <span className={`text-xs ${activeTab === 'scenes' ? 'opacity-100' : 'opacity-60'} bg-slate-200 px-1.5 rounded-full`}>
                  {scenes.length}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex relative">
          {activeTab === 'characters' ? (
            <CharactersContent
              characters={characters}
              projectId={projectId}
            />
          ) : (
            <ScenesContent
              scenes={scenes}
              projectId={projectId}
            />
          )}
        </div>

        {/* Terminal */}
        <div className="border-t border-slate-200 bg-slate-900 text-slate-400 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] shrink-0">
          <div
            className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-white/5 transition-colors"
            onClick={() => setAnalysisState({ terminalExpanded: !terminalExpanded })}
          >
            <div className="flex items-center gap-2">
              <span className="text-green-400 text-xs font-mono">➜</span>
              <span className="text-xs font-mono font-medium">Console Output</span>
              {isStreaming && (
                <span className="flex items-center gap-1.5 ml-2 px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-400 text-[10px] font-medium border border-primary-500/20">
                  <span className="w-1 h-1 bg-primary-400 rounded-full animate-pulse" />
                  Streaming
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {isStreaming && (
                <button
                  onClick={(e) => { e.stopPropagation(); stopStream(); }}
                  className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 text-[10px] rounded hover:bg-red-500/20 transition-colors"
                >
                  Stop Process
                </button>
              )}
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${terminalExpanded ? '' : 'rotate-180'}`}
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
              className="px-4 py-3 font-mono text-xs overflow-y-auto bg-black/20"
              style={{ maxHeight: '200px', height: '160px' }}
            >
              {terminalOutput.length === 0 ? (
                <p className="opacity-50 italic">Ready for tasks...</p>
              ) : (
                terminalOutput.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all leading-tight py-0.5">
                    {line || '\u00A0'}
                  </div>
                ))
              )}
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-primary-500 animate-pulse align-middle ml-1" />
              )}
            </div>
          )}
        </div>
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
  const { setCharacters, selectedWorkflows, workflowParams } = useProjectStore()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const [editedCharacter, setEditedCharacter] = useState<Partial<Character>>({})
  const [isSaving, setIsSaving] = useState(false)
  const selectedCharacter = characters[selectedIndex]

  // Generation state
  const [generatingCharId, setGeneratingCharId] = useState<string | null>(null)
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)
  const [generateMessage, setGenerateMessage] = useState('')
  const pollingRef = useRef<number | null>(null)

  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  // Settings state
  const [templates, setTemplates] = useState<CharacterImageTemplates | null>(null)
  const [selections, setSelections] = useState<{
    view: string;
    expression: string;
    action: string;
  }>({
    view: 'front',
    expression: 'neutral',
    action: 'standing'
  })
  const [isManagingTags, setIsManagingTags] = useState(false)
  const [isManagingGallery, setIsManagingGallery] = useState(false)

  useEffect(() => {
    // Load image templates to get available types
    configApi.getCharacterImageTemplates().then(setTemplates).catch(console.error)
  }, [])

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
              const updatedCharacters = await analysisApi.getCharacters(projectId)
              setCharacters(updatedCharacters)
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
          // If it's a character task, resume polling
          startPolling(taskId, status.target_id)
        }
      })
    }).catch(err => console.error('Failed to recover active tasks:', err))
  }, [projectId, startPolling])

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

  const handleGenerate = async () => {
    if (!selectedCharacter?.id || generatingCharId) return

    const selectedTypes = [selections.view, selections.expression, selections.action].filter(Boolean)
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

  const updateSelection = (category: 'view' | 'expression' | 'action', typeId: string) => {
    setSelections(prev => ({
      ...prev,
      [category]: prev[category] === typeId ? undefined : typeId
    }))
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* List Pane */}
      <div className="w-64 bg-white border-r border-slate-200 overflow-y-auto flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 sticky top-0 z-10 backdrop-blur-sm">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Character List</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {characters.map((character, index) => (
            <button
              key={character.id}
              onClick={() => handleSelect(index)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${index === selectedIndex
                ? 'bg-primary-50 text-primary-700 shadow-sm border border-primary-100'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }`}
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${character.gender?.includes('女') || character.gender?.toLowerCase() === 'female' ? 'bg-pink-400' : 'bg-blue-400'
                  }`} />
                <span className="truncate">{character.name}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Detail Content */}
      <div className="flex-1 bg-slate-50 overflow-y-auto p-6 lg:p-8">
        {characters.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-white rounded-2xl border border-slate-200 flex items-center justify-center mb-6 shadow-sm">
              <span className="text-3xl opacity-20">👤</span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">No Characters Found</h3>
            <p className="text-sm text-slate-500">Run character analysis to populate this list.</p>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header / Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedCharacter.name || ''}
                    onChange={(e) => updateField('name', e.target.value)}
                    className="input text-2xl font-bold px-3 py-1.5 w-full sm:w-64"
                    placeholder="Character Name"
                  />
                ) : (
                  <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                    {selectedCharacter?.name}
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${selectedCharacter.gender?.includes('Female') || selectedCharacter.gender?.includes('女')
                      ? 'bg-pink-50 text-pink-600 border-pink-100'
                      : 'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>
                      {selectedCharacter.gender?.includes('Female') || selectedCharacter.gender?.includes('女') ? '♀' : '♂'} {selectedCharacter.gender}
                    </span>
                  </h2>
                )}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="badge badge-neutral bg-white border border-slate-200">{selectedCharacter.roleType || 'Role'}</span>
                  <span className="badge badge-neutral bg-white border border-slate-200">{selectedCharacter.age || 'Age'}</span>
                </div>
              </div>

              <div className="flex gap-2">
                {!isEditing ? (
                  <>
                    <button
                      onClick={handleEdit}
                      className="btn btn-secondary text-xs"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={!!generatingCharId}
                      className="btn btn-primary text-xs shadow-md shadow-primary-500/20"
                    >
                      {generatingCharId === selectedCharacter.id ? '⏳ Generating...' : '▶ Generate Selected'}
                    </button>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="btn btn-primary text-xs"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={handleCancel}
                      className="btn btn-secondary text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

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
                    <Field label="Role Type" value={selectedCharacter.roleType} isEditing={isEditing} editValue={editedCharacter.roleType} onChange={(v) => updateField('roleType', v)} />
                    <Field label="Gender" value={selectedCharacter.gender} isEditing={isEditing} editValue={editedCharacter.gender} onChange={(v) => updateField('gender', v)} />
                    <Field label="Age" value={selectedCharacter.age} isEditing={isEditing} editValue={editedCharacter.age} onChange={(v) => updateField('age', v)} />
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

                {/* Settings Panel */}
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                      <span>⚙️</span> Image Generation Settings
                    </h3>
                    <button
                      onClick={() => setIsManagingTags(!isManagingTags)}
                      className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                    >
                      {isManagingTags ? 'Done' : 'Manage Tags'}
                    </button>
                  </div>

                  {isManagingTags && templates ? (
                    <TagManager
                      templates={templates}
                      onUpdate={async (newTemplates) => {
                        await configApi.updateCharacterImageTemplates(newTemplates)
                        setTemplates(newTemplates)
                      }}
                    />
                  ) : templates ? (
                    <div className="space-y-6">
                      {/* View Row */}
                      <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">1. 视图 (View)</h4>
                        <div className="flex flex-wrap gap-2">
                          {(templates.templates['三视图'] || []).map(type => (
                            <button
                              key={type.id}
                              onClick={() => updateSelection('view', type.id)}
                              className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${selections.view === type.id
                                ? 'bg-primary-50 border-primary-500 text-primary-700 font-medium shadow-sm'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                }`}
                            >
                              {selections.view === type.id && '● '} {type.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Expression Row */}
                      <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">2. 表情 (Expression)</h4>
                        <div className="flex flex-wrap gap-2">
                          {(templates.templates['表情系列'] || []).map(type => (
                            <button
                              key={type.id}
                              onClick={() => updateSelection('expression', type.id)}
                              className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${selections.expression === type.id
                                ? 'bg-primary-50 border-primary-500 text-primary-700 font-medium shadow-sm'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                }`}
                            >
                              {selections.expression === type.id && '● '} {type.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Action Row */}
                      <div>
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">3. 动作 (Action)</h4>
                        <div className="flex flex-wrap gap-2">
                          {(templates.templates['动作系列'] || []).map(type => (
                            <button
                              key={type.id}
                              onClick={() => updateSelection('action', type.id)}
                              className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${selections.action === type.id
                                ? 'bg-primary-50 border-primary-500 text-primary-700 font-medium shadow-sm'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                }`}
                            >
                              {selections.action === type.id && '● '} {type.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs text-slate-400">Current selection:</span>
                        <div className="flex gap-1">
                          {Object.values(selections).filter(Boolean).map(s => (
                            <span key={s} className="px-1.5 py-0.5 bg-slate-100 text-[10px] rounded text-slate-500">{s}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-400 text-sm italic">Loading settings...</div>
                  )}
                </div>
              </div>

              {/* Right Column: Gallery */}
              <div className="h-full">
                <div className="card p-6 h-full min-h-[500px] flex flex-col">
                  <h3 className="text-sm font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span>🖼️</span> Generated Gallery
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setIsManagingGallery(!isManagingGallery)}
                        className={`text-xs px-2 py-1 rounded-md transition-colors ${isManagingGallery
                          ? 'bg-primary-600 text-white shadow-sm'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                      >
                        {isManagingGallery ? '✓ Done' : '⚙️ Manage'}
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
                            className={`relative group rounded-xl overflow-hidden border border-slate-200 aspect-[3/4] shadow-sm hover:shadow-md transition-all ${img.isLoading ? 'cursor-wait bg-slate-50' : 'cursor-pointer'}`}
                            onClick={() => !img.isLoading && setLightboxImage(fileUrl.image(img.imagePath))}
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
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDeleteImage(img.id)
                                        }}
                                        className="p-1.5 bg-red-500 hover:bg-red-600 rounded-lg text-white shadow-lg transition-colors"
                                        title="Delete Image"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
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
        )}
      </div>

      {/* Lightbox Overlay */}
      {lightboxImage && (
        <Lightbox
          imageUrl={lightboxImage}
          onClose={() => setLightboxImage(null)}
        />
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
  const { setScenes } = useProjectStore()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const [editedScene, setEditedScene] = useState<Partial<Scene>>({})
  const [isSaving, setIsSaving] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

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

  const handleScrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' })
    }
  }

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' })
    }
  }

  const handleEdit = () => {
    if (!selectedScene) return
    setIsEditing(true)
    setEditedScene({
      location: selectedScene.location,
      timeOfDay: selectedScene.timeOfDay,
      atmosphere: selectedScene.atmosphere,
      environmentDesc: selectedScene.environmentDesc,
      shotType: selectedScene.shotType,
      cameraMovement: selectedScene.cameraMovement,
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
        shotType: editedScene.shotType,
        cameraMovement: editedScene.cameraMovement,
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
          // If it's a scene task (and we are in ScenesContent), resume
          // Note: In ScenesContent we check if the ID refers to a scene.
          // For simplicity, we assume any task with target_id that isn't 'all_...' or 'library' is a scene if we're here.
          // (CharactersContent does the same, but they share the same project_id space)
          // To be safer, we could check if target_id exists in 'scenes' array.
          startPolling(taskId, status.target_id)
        }
      })
    }).catch(err => console.error('Failed to recover active scenes tasks:', err))
  }, [projectId, startPolling])

  const handleGenerateImage = async () => {
    if (!selectedScene?.id || generatingSceneId) return

    const { selectedWorkflows } = useProjectStore()
    try {
      const response = await generationApi.generateSceneImage(projectId, selectedScene.id, selectedWorkflows.scene || undefined)
      startPolling(response.task_id, selectedScene.id)
    } catch (err) {
      console.error('Generate image failed:', err)
      setGeneratingSceneId(null)
      setGenerateMessage('Failed to start task')
    }
  }

  const handleGenerateVideo = async () => {
    if (!selectedScene?.id || !selectedScene.sceneImage || generatingSceneId) return

    const { selectedWorkflows } = useProjectStore()
    try {
      const response = await generationApi.generateSceneVideo(projectId, selectedScene.id, selectedWorkflows.video || undefined)
      startPolling(response.task_id, selectedScene.id)
    } catch (err) {
      console.error('Generate video failed:', err)
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

  const handleDeleteVideo = async () => {
    if (!selectedScene?.videoClip?.id) return
    if (!confirm('Permanently delete this video clip?')) return
    try {
      await analysisApi.deleteVideoClip(projectId, selectedScene.videoClip.id)
      const updated = await analysisApi.getScenes(projectId)
      setScenes(updated)
    } catch (err) {
      console.error('Delete video failed:', err)
      alert('Failed to delete video')
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Scene Selector Strip */}
      <div className="h-40 bg-white border-b border-slate-200 shrink-0 relative flex flex-col">
        <div className="p-3 border-b border-slate-100 flex justify-between items-center">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Scene Timeline</h3>
          <div className="text-xs text-slate-400">{selectedIndex + 1} / {scenes.length}</div>
        </div>

        <div className="flex-1 relative group">
          {/* Scroll Buttons */}
          <button
            onClick={handleScrollLeft}
            className="absolute left-0 top-0 bottom-0 width-10 bg-gradient-to-r from-white to-transparent z-10 hover:from-slate-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button
            onClick={handleScrollRight}
            className="absolute right-0 top-0 bottom-0 width-10 bg-gradient-to-l from-white to-transparent z-10 hover:from-slate-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>

          <div
            ref={scrollContainerRef}
            className="h-full overflow-x-auto flex items-center gap-4 px-4 scrollbar-hide snap-x"
          >
            {scenes.length === 0 ? (
              <div className="w-full text-center text-slate-400 text-sm">No scenes found</div>
            ) : (
              scenes.map((scene, i) => (
                <button
                  key={scene.id}
                  onClick={() => handleSelect(i)}
                  className={`shrink-0 w-48 h-24 rounded-lg border-2 transition-all flex flex-col overflow-hidden relative snap-center ${i === selectedIndex
                    ? 'border-primary-500 ring-2 ring-primary-100 shadow-md'
                    : 'border-slate-200 hover:border-slate-300 opacity-70 hover:opacity-100'
                    }`}
                >
                  {scene.sceneImage ? (
                    <img src={fileUrl.image(scene.sceneImage.imagePath)} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 bg-slate-100 flex items-center justify-center">
                      <span className="text-2xl opacity-20">🎬</span>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1.5 text-white backdrop-blur-[1px]">
                    <div className="text-xs font-bold truncate">Sc {i + 1}. {scene.location}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Detailed View */}
      <div className="flex-1 overflow-y-auto p-6 lg:p-8">
        {scenes.length > 0 ? (
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                  <span className="text-slate-400 font-normal">#{selectedIndex + 1}</span>
                  {isEditing ? (
                    <input
                      value={editedScene.location || ''}
                      onChange={(e) => updateField('location', e.target.value)}
                      className="input py-1 px-2 font-bold"
                    />
                  ) : selectedScene?.location}
                </h2>
                <p className="text-slate-500 mt-1 flex items-center gap-3">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400"></span> {selectedScene?.timeOfDay}</span>
                  <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                  <span>{selectedScene?.atmosphere}</span>
                </p>
              </div>

              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <button onClick={handleSave} disabled={isSaving} className="btn btn-primary text-xs">Save</button>
                    <button onClick={handleCancel} className="btn btn-secondary text-xs">Cancel</button>
                  </>
                ) : (
                  <button onClick={handleEdit} className="btn btn-secondary text-xs">✏️ Edit Scene</button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Script Info */}
              <div className="space-y-6">
                <div className="card p-6">
                  <h3 className="text-sm font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-100">Visual Description</h3>
                  <Field label="Environment" value={selectedScene.environmentDesc} isEditing={isEditing} editValue={editedScene.environmentDesc} onChange={(v) => updateField('environmentDesc', v)} multiline />
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <Field label="Shot Type" value={selectedScene.shotType} isEditing={isEditing} editValue={editedScene.shotType} onChange={(v) => updateField('shotType', v)} />
                    <Field label="Camera" value={selectedScene.cameraMovement} isEditing={isEditing} editValue={editedScene.cameraMovement} onChange={(v) => updateField('cameraMovement', v)} />
                  </div>
                </div>

                <div className="card p-6 bg-slate-900 text-slate-200 border-none">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Dialogue</h3>
                  <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap opacity-90">
                    {isEditing ? (
                      <textarea
                        value={editedScene.dialogue || ''}
                        onChange={(e) => updateField('dialogue', e.target.value)}
                        className="w-full bg-slate-800 border-slate-700 rounded p-3 text-slate-200 focus:ring-primary-500 focus:border-primary-500 min-h-[150px]"
                      />
                    ) : (
                      selectedScene.dialogue || <span className="italic opacity-50">No dialogue</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Media Preview */}
              <div className="space-y-6">
                <div className="card p-6">
                  <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-900">Media Assets</h3>
                    <div className="flex gap-2">
                      <button onClick={handleGenerateImage} disabled={!!generatingSceneId} className="btn btn-secondary text-xs">
                        {generatingSceneId === selectedScene.id ? '⏳ Gen Image...' : 'Gen Image'}
                      </button>
                      <button onClick={handleGenerateVideo} disabled={!!generatingSceneId || !selectedScene.sceneImage} className="btn btn-primary text-xs">
                        {generatingSceneId === selectedScene.id ? '⏳ Gen Video...' : 'Gen Video'}
                      </button>
                    </div>
                  </div>

                  {/* Simple Status Message (Scoped to active scene) */}
                  {generatingSceneId === selectedScene.id && generateMessage && (
                    <div className="p-3 bg-primary-50 border border-primary-100 rounded-lg shadow-sm animate-fade-in flex items-center gap-3">
                      <span className="animate-spin w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full flex-shrink-0" />
                      <span className="text-sm font-medium text-primary-700">
                        {generateMessage}
                      </span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="aspect-video bg-slate-100 rounded-xl overflow-hidden border border-slate-200 relative group">
                      {selectedScene.sceneImage ? (
                        <>
                          <img src={fileUrl.image(selectedScene.sceneImage.imagePath)} className="w-full h-full object-cover" />
                          <button
                            onClick={handleDeleteSceneImage}
                            className="absolute top-2 left-2 p-1.5 bg-red-500/80 hover:bg-red-600 rounded-lg text-white shadow-lg backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 z-10"
                            title="Delete Image"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-400 flex-col">
                          <span className="text-4xl mb-2">🖼️</span>
                          <span className="text-sm">No Scene Image</span>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-xs text-white backdrop-blur">
                        Reference Image
                      </div>
                    </div>

                    <div className="aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 relative group">
                      {selectedScene.videoClip ? (
                        <>
                          <video src={fileUrl.video(selectedScene.videoClip.videoPath)} controls className="w-full h-full object-contain" />
                          <button
                            onClick={handleDeleteVideo}
                            className="absolute top-2 left-2 p-1.5 bg-red-500/80 hover:bg-red-600 rounded-lg text-white shadow-lg backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 z-10"
                            title="Delete Video"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-slate-600 flex-col">
                          <span className="text-4xl mb-2 opacity-50">🎬</span>
                          <span className="text-sm">No Video Clip</span>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 bg-primary-600 px-2 py-1 rounded text-xs text-white backdrop-blur shadow-sm">
                        Motion Preview
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400">
            Select a project with scenes analyzed
          </div>
        )}
      </div>
    </div>
  )
}

function TagManager({
  templates,
  onUpdate
}: {
  templates: CharacterImageTemplates
  onUpdate: (templates: CharacterImageTemplates) => Promise<void>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<ImageType>>({})
  const [isAdding, setIsAdding] = useState(false)

  const handleEdit = (type: ImageType) => {
    setEditingId(type.id)
    setEditForm({ ...type })
    setIsAdding(false)
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditForm({})
    setIsAdding(false)
  }

  const handleSave = async () => {
    const label = editForm.label?.trim()
    if (!label) return

    let newType: ImageType
    if (isAdding) {
      // Generate a simple ID from label or timestamp
      const id = editForm.id || `tag_${Date.now()}`
      newType = {
        id,
        label,
        prompt_suffix: editForm.prompt_suffix || label // Default suffix to label
      }
    } else {
      newType = {
        ...(editForm as ImageType),
        label,
        prompt_suffix: editForm.prompt_suffix || label
      }
    }

    let newAvailableTypes = [...templates.available_types]

    if (isAdding) {
      if (newAvailableTypes.some(t => t.id === newType.id)) {
        alert('Tag already exists')
        return
      }
      newAvailableTypes.push(newType)
    } else {
      newAvailableTypes = newAvailableTypes.map(t => t.id === editingId ? newType : t)
    }

    await onUpdate({
      ...templates,
      available_types: newAvailableTypes
    })

    handleCancel()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tag?')) return
    const newAvailableTypes = templates.available_types.filter(t => t.id !== id)
    await onUpdate({
      ...templates,
      available_types: newAvailableTypes
    })
  }

  return (
    <div className="space-y-3">
      {/* List */}
      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
        {templates.available_types.map(type => (
          <div key={type.id} className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-lg text-sm group hover:border-primary-200 transition-colors">
            {editingId === type.id ? (
              <div className="flex-1 flex flex-col gap-2">
                <input
                  autoFocus
                  className="input text-sm py-1.5 w-full"
                  placeholder="Enter tag name"
                  value={editForm.label}
                  onChange={e => setEditForm({ ...editForm, label: e.target.value })}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={handleSave} className="px-3 py-1 bg-primary-600 text-white rounded text-xs font-medium shadow-sm">Save</button>
                  <button onClick={handleCancel} className="px-3 py-1 bg-slate-100 text-slate-600 rounded text-xs">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-700 truncate">{type.label}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleEdit(type)} className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all opacity-0 group-hover:opacity-100" title="Edit">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                  <button onClick={() => handleDelete(type.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100" title="Delete">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add Button */}
      {!isAdding && !editingId && (
        <button onClick={() => { setIsAdding(true); setEditForm({ id: '', label: '', prompt_suffix: '' }) }} className="w-full py-2 border border-dashed border-slate-300 rounded-lg text-slate-500 text-xs hover:border-primary-400 hover:text-primary-600 transition-colors hover:bg-slate-50">
          + Add New Tag
        </button>
      )}

      {isAdding && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-fade-in shadow-inner">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight ml-1">New Tag Name</label>
            <input
              autoFocus
              className="input text-sm w-full py-2 shadow-sm"
              placeholder="e.g. Happy, Jumping..."
              value={editForm.label}
              onChange={e => setEditForm({ ...editForm, label: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={handleSave} className="btn btn-primary btn-sm px-4">Add Tag</button>
            <button onClick={handleCancel} className="btn btn-ghost btn-sm px-4">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
