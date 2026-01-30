import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Character, Scene } from '@/types'
import { projectsApi, analysisApi, generationApi, configApi } from '@/api'
import type { ImageType, CharacterImageTemplates } from '@/api'
import { fileUrl } from '@/api/client'
import { useProjectStore } from '@/stores/projectStore'

type Tab = 'characters' | 'scenes' | 'videos'

export function GenerationCenterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const urlProjectId = searchParams.get('project')

  const {
    currentProject,
    characters,
    scenes,
    setCurrentProject,
    setCharacters,
    setScenes,
  } = useProjectStore()

  const projectId = urlProjectId || currentProject?.id

  const [activeTab, setActiveTab] = useState<Tab>('characters')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Global generation state that persists across tab switches
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [taskProgress, setTaskProgress] = useState(0)
  const [taskMessage, setTaskMessage] = useState('')
  const pollingRef = useRef<number | null>(null)

  const loadData = useCallback(async () => {
    if (!projectId) return

    setLoading(true)
    setError(null)
    try {
      if (urlProjectId && (!currentProject || currentProject.id !== urlProjectId)) {
        const projectData = await projectsApi.get(urlProjectId)
        setCurrentProject(projectData)
      }

      const [charactersData, scenesData] = await Promise.all([
        analysisApi.getCharacters(projectId).catch(() => []),
        analysisApi.getScenes(projectId).catch(() => []),
      ])
      setCharacters(charactersData)
      setScenes(scenesData)
    } catch (err) {
      setError('Failed to load project data')
      console.error('Load project failed:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId, urlProjectId, currentProject, setCurrentProject, setCharacters, setScenes])

  const startGlobalPolling = useCallback((taskId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    setActiveTaskId(taskId)
    setTaskMessage('Syncing task status...')
    setTaskProgress(0)

    pollingRef.current = window.setInterval(async () => {
      try {
        const status = await generationApi.getTaskStatus(taskId)
        setTaskProgress(status.progress)
        setTaskMessage(status.message)

        if (status.status === 'completed') {
          setActiveTaskId(null)
          setTaskMessage('Generation completed!')
          if (pollingRef.current) clearInterval(pollingRef.current)
          pollingRef.current = null
          loadData()
        } else if (status.status === 'failed') {
          setActiveTaskId(null)
          setTaskMessage('Generation failed')
          setError(status.error || 'Task failed')
          if (pollingRef.current) clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      } catch (err) {
        console.error('Poll status failed:', err)
      }
    }, 1000)
  }, [loadData])

  useEffect(() => {
    if (!projectId) return
    // Recovery Effect: Check for global active tasks
    generationApi.getActiveTasks(projectId).then(tasks => {
      Object.entries(tasks).forEach(([taskId, status]) => {
        // Handle global tasks (library, all_scenes, all_videos)
        if (status.target_id === 'library' || status.target_id === 'all_scenes' || status.target_id === 'all_videos') {
          startGlobalPolling(taskId)
        }
      })
    }).catch(console.error)
  }, [projectId, startGlobalPolling])

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  if (!projectId) {
    return (
      <div className="card p-12 text-center max-w-2xl mx-auto mt-12 bg-white">
        <div className="text-6xl mb-6 opacity-30">🎨</div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">No Project Selected</h2>
        <p className="text-slate-500 mb-8">Please complete script analysis before generating assets.</p>
        <button
          onClick={() => navigate('/upload')}
          className="btn btn-primary px-8"
        >
          Upload Script
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="card p-16 text-center max-w-2xl mx-auto mt-12">
        <div className="w-16 h-16 border-4 border-primary-100 border-t-primary-500 rounded-full animate-spin mx-auto mb-6"></div>
        <p className="text-slate-500 font-medium text-lg">Loading generation center...</p>
      </div>
    )
  }

  const hasCharacterLibrary = characters.some(c => c.images && c.images.length > 0)
  const hasSceneImages = scenes.some(s => s.sceneImage)

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="card p-6 border-l-4 border-primary-500 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <span className="p-2 bg-primary-50 rounded-lg text-2xl">🎨</span>
            Generation Center
          </h2>
          <p className="text-sm text-slate-500 mt-1 pl-14">
            Project: <span className="font-semibold text-slate-900">{currentProject?.name || 'Untitled'}</span>
          </p>
        </div>
        <button
          onClick={() => navigate(`/analysis?project=${projectId}`)}
          className="btn btn-secondary flex items-center gap-2 text-sm"
        >
          ← Back to Analysis
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}

      {/* Tabs container */}
      <div className="card overflow-hidden shadow-lg shadow-slate-200/50">
        <div className="border-b border-slate-200 bg-slate-50/50 p-1.5 flex gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveTab('characters')}
            className={`flex-1 min-w-[120px] px-6 py-3 text-sm font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2 ${activeTab === 'characters'
              ? 'bg-white text-primary-700 shadow-sm ring-1 ring-primary-100'
              : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
              }`}
          >
            <span className="text-lg">📸</span> Character Library
          </button>
          <button
            onClick={() => setActiveTab('scenes')}
            className={`flex-1 min-w-[120px] px-6 py-3 text-sm font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2 ${activeTab === 'scenes'
              ? 'bg-white text-primary-700 shadow-sm ring-1 ring-primary-100'
              : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
              }`}
          >
            <span className="text-lg">🖼️</span> Scene Images
          </button>
          <button
            onClick={() => setActiveTab('videos')}
            className={`flex-1 min-w-[120px] px-6 py-3 text-sm font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2 ${activeTab === 'videos'
              ? 'bg-white text-primary-700 shadow-sm ring-1 ring-primary-100'
              : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
              }`}
          >
            <span className="text-lg">🎬</span> Video Generation
          </button>
        </div>

        <div className="p-6 bg-white min-h-[500px]">
          {activeTab === 'characters' && (
            <CharacterLibraryTab
              projectId={projectId}
              characters={characters}
              onNavigateAnalysis={() => navigate(`/analysis?project=${projectId}`)}
              onRefresh={loadData}
              activeTaskId={activeTaskId}
              taskProgress={taskProgress}
              taskMessage={taskMessage}
              startGlobalPolling={startGlobalPolling}
            />
          )}
          {activeTab === 'scenes' && (
            <SceneImageTab
              projectId={projectId}
              scenes={scenes}
              hasCharacterLibrary={hasCharacterLibrary}
              onNavigateAnalysis={() => navigate(`/analysis?project=${projectId}`)}
              startGlobalPolling={startGlobalPolling}
            />
          )}
          {activeTab === 'videos' && (
            <VideoGenerationTab
              projectId={projectId}
              scenes={scenes}
              hasSceneImages={hasSceneImages}
              onNavigateAnalysis={() => navigate(`/analysis?project=${projectId}`)}
              startGlobalPolling={startGlobalPolling}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function CharacterLibraryTab({
  projectId,
  characters,
  onNavigateAnalysis,
  onRefresh,
  activeTaskId,
  taskProgress,
  taskMessage,
  startGlobalPolling,
}: {
  projectId: string
  characters: Character[]
  onNavigateAnalysis: () => void
  onRefresh: () => void
  activeTaskId: string | null
  taskProgress: number
  taskMessage: string
  startGlobalPolling: (taskId: string) => void
}) {
  const [error, setError] = useState<string | null>(null)

  const [templates, setTemplates] = useState<CharacterImageTemplates | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<ImageType[]>([])
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [characterCustomTypes, setCharacterCustomTypes] = useState<Record<string, ImageType[]>>({})

  useEffect(() => {
    configApi.getCharacterImageTemplates().then((data) => {
      setTemplates(data)
      setSelectedTypes(data.default_types)
    }).catch(console.error)
  }, [])

  const addType = (type: ImageType) => {
    if (!selectedTypes.find(t => t.id === type.id)) {
      setSelectedTypes([...selectedTypes, type])
    }
  }

  const removeType = (typeId: string) => {
    setSelectedTypes(selectedTypes.filter(t => t.id !== typeId))
  }

  const saveCharacterCustomTypes = (characterId: string, types: ImageType[]) => {
    setCharacterCustomTypes(prev => ({
      ...prev,
      [characterId]: types,
    }))
  }

  const getCharacterEffectiveTypes = (characterId: string): ImageType[] => {
    const customTypes = characterCustomTypes[characterId]
    if (customTypes && customTypes.length > 0) {
      return customTypes
    }
    return selectedTypes
  }

  if (characters.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-6xl mb-4 opacity-20">📸</div>
        <p className="text-slate-500 mb-4 font-medium">No characters found.</p>
        <p className="text-sm text-slate-400 mb-8 max-w-md mx-auto">Please complete script analysis to identify characters before generating images.</p>
        <button
          onClick={onNavigateAnalysis}
          className="btn btn-secondary"
        >
          Go to Script Analysis
        </button>
      </div>
    )
  }

  const startGeneration = async () => {
    setError(null)
    try {
      const imageTypes = selectedTypes.map(t => t.id)
      const response = await generationApi.generateCharacterLibrary(projectId, imageTypes)
      startGlobalPolling(response.task_id)
    } catch (err) {
      setError('Failed to start generation. Check backend service.')
      console.error('Start generation failed:', err)
    }
  }

  return (
    <div>
      {/* Type Config */}
      <div className="mb-8 p-6 bg-slate-50 rounded-xl border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-bold text-slate-800 flex items-center gap-2">
            <span>⚙️</span> Image Types Configuration
          </h4>
          <button
            onClick={() => setShowTemplateModal(true)}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium hover:underline"
          >
            📋 Select Templates
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {selectedTypes.map((type) => (
            <span
              key={type.id}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-primary-200 text-primary-700 text-sm rounded-lg shadow-sm"
            >
              <span className="font-medium">{type.label}</span>
              <button
                onClick={() => removeType(type.id)}
                className="text-primary-400 hover:text-red-500 transition-colors"
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
          {selectedTypes.length === 0 && (
            <span className="text-sm text-slate-400 italic py-1">Please add at least one image type...</span>
          )}
        </div>

        {templates && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 font-medium">Add Type:</span>
            <select
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              value=""
              onChange={(e) => {
                const type = templates.available_types.find(t => t.id === e.target.value)
                if (type) addType(type)
              }}
            >
              <option value="">Select type...</option>
              {templates.available_types
                .filter(t => !selectedTypes.find(s => s.id === t.id))
                .map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur py-4 border-b border-slate-100 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {activeTaskId ? (
            <div className="flex items-center gap-3 bg-primary-50 px-4 py-2 rounded-lg border border-primary-100">
              <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm font-medium text-primary-700">{taskMessage} <span className="opacity-75">({taskProgress}%)</span></span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg text-sm">
              <span>⏸️</span> Idle
            </div>
          )}
        </div>
        <button
          onClick={startGeneration}
          disabled={!!activeTaskId || selectedTypes.length === 0}
          className="btn btn-primary px-8 shadow-lg shadow-primary-500/20"
        >
          {activeTaskId ? 'Generating...' : '▶ Start Generation'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          {error}
        </div>
      )}

      {activeTaskId && (
        <div className="h-1.5 bg-slate-100 rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-300"
            style={{ width: `${taskProgress}%` }}
          />
        </div>
      )}

      {/* Character Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {characters.map((character) => (
          <CharacterGenerationCard
            key={character.id}
            character={character}
            selectedTypes={getCharacterEffectiveTypes(character.id)}
            onSaveCharacterTypes={(types) => saveCharacterCustomTypes(character.id, types)}
            status={character.images && character.images.length > 0 ? 'completed' : activeTaskId ? 'generating' : 'pending'}
            projectId={projectId}
            onRefresh={onRefresh}
          />
        ))}
      </div>

      <div className="mt-8 p-4 bg-blue-50/50 rounded-xl text-sm text-slate-600 flex items-start gap-3 border border-blue-100">
        <span className="text-xl">💡</span>
        <p className="mt-0.5">Once the character library is complete, the system will use these reference images to maintain character consistency across all generated scenes.</p>
      </div>

      {/* Modals */}
      {showTemplateModal && templates && (
        <TemplateSelectionModal
          templates={templates}
          selectedTypes={selectedTypes}
          onSelect={(types) => {
            const allTypes = new Map<string, ImageType>()
            types.forEach(type => {
              if (!allTypes.has(type.id)) {
                allTypes.set(type.id, type)
              }
            })
            setSelectedTypes(Array.from(allTypes.values()))
            setShowTemplateModal(false)
          }}
          onClose={() => setShowTemplateModal(false)}
        />
      )}
    </div>
  )
}

function TemplateSelectionModal({
  templates,
  selectedTypes,
  onSelect,
  onClose,
}: {
  templates: CharacterImageTemplates
  selectedTypes: ImageType[]
  onSelect: (types: ImageType[]) => void
  onClose: () => void
}) {
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([])
  const [customTypes, setCustomTypes] = useState<string[]>(
    selectedTypes.filter(t => {
      return !Object.values(templates.templates).some(templateTypes =>
        templateTypes.some(templateType => templateType.id === t.id)
      )
    }).map(t => t.id)
  )

  const currentSelectedTypes = useCallback(() => {
    const typeMap = new Map<string, ImageType>()
    customTypes.forEach(typeId => {
      const type = templates.available_types.find(t => t.id === typeId)
      if (type) typeMap.set(typeId, type)
    })
    selectedTemplates.forEach(templateName => {
      templates.templates[templateName]?.forEach(type => {
        if (!typeMap.has(type.id)) {
          typeMap.set(type.id, type)
        }
      })
    })
    return Array.from(typeMap.values())
  }, [templates, selectedTemplates, customTypes])

  const toggleTemplate = (templateName: string) => {
    setSelectedTemplates(prev =>
      prev.includes(templateName)
        ? prev.filter(t => t !== templateName)
        : [...prev, templateName]
    )
  }

  const toggleCustomType = (typeId: string) => {
    setCustomTypes(prev =>
      prev.includes(typeId)
        ? prev.filter(t => t !== typeId)
        : [...prev, typeId]
    )
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-800">Select Image Type Templates</h3>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Template Combinations (Multi-select)</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(templates.templates).map(([name, types]) => (
                <label
                  key={name}
                  className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-200 ${selectedTemplates.includes(name)
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-200'
                    : 'border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedTemplates.includes(name)}
                    onChange={() => toggleTemplate(name)}
                    className="mt-1 w-5 h-5 text-primary-600 rounded focus:ring-primary-500 border-gray-300"
                  />
                  <div className="flex-1">
                    <div className="font-bold text-slate-900 mb-1">{name}</div>
                    <div className="text-xs text-slate-500 leading-relaxed">
                      {types.map(t => t.label).join(', ')}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Custom Types</h4>
            <div className="flex flex-wrap gap-2">
              {templates.available_types.map((type) => {
                const isInTemplate = Object.values(templates.templates).some(templateTypes =>
                  templateTypes.some(t => t.id === type.id)
                )
                if (isInTemplate) return null

                const isSelected = customTypes.includes(type.id)
                return (
                  <label
                    key={type.id}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${isSelected
                      ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCustomType(type.id)}
                      className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500 border-gray-300"
                    />
                    <span className="text-sm">{type.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 rounded-lg">
          <div className="mb-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Preview Selection</h4>
            <div className="flex flex-wrap gap-2">
              {currentSelectedTypes().map((type) => (
                <span key={type.id} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded border border-slate-200 font-medium">
                  {type.label}
                </span>
              ))}
              {currentSelectedTypes().length === 0 && <span className="text-sm text-slate-400 italic">No types selected</span>}
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={() => onSelect(currentSelectedTypes())}
              disabled={currentSelectedTypes().length === 0}
              className="btn btn-primary"
            >
              Apply Selection
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CharacterGenerationCard({
  character,
  selectedTypes,
  onSaveCharacterTypes,
  status,
  projectId,
  onRefresh,
}: {
  character: Character
  selectedTypes: ImageType[]
  onSaveCharacterTypes?: (types: ImageType[]) => void
  status: 'pending' | 'generating' | 'completed'
  projectId: string
  onRefresh?: () => void
}) {
  const statusLabel = {
    pending: 'Waiting',
    generating: 'Generating',
    completed: 'Completed',
  }

  const avatar = character.gender?.includes('Female') || character.gender?.includes('女') ? '👩' : character.gender?.includes('Male') || character.gender?.includes('男') ? '👨' : '👤'
  const images = character.images || []
  const imageCount = images.length

  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingTypeId, setGeneratingTypeId] = useState<string | null>(null)
  const [genProgress, setGenProgress] = useState(0)
  const pollingRef = useRef<number | null>(null)

  const startPolling = useCallback((taskId: string, targetId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    setIsGenerating(true)
    setGeneratingTypeId(targetId)
    setGenProgress(0)

    pollingRef.current = window.setInterval(async () => {
      try {
        const taskStatus = await generationApi.getTaskStatus(taskId)
        setGenProgress(taskStatus.progress)

        if (taskStatus.status === 'completed' || taskStatus.status === 'failed') {
          setIsGenerating(false)
          setGeneratingTypeId(null)
          if (pollingRef.current) clearInterval(pollingRef.current)
          pollingRef.current = null
          if (taskStatus.status === 'completed' && onRefresh) {
            onRefresh()
          }
        }
      } catch (err) {
        console.error('Poll card status failed:', err)
      }
    }, 1000)
  }, [onRefresh])

  useEffect(() => {
    // Card Level Recovery
    generationApi.getActiveTasks(projectId).then(tasks => {
      Object.entries(tasks).forEach(([taskId, status]) => {
        if (status.target_id === character.id) {
          startPolling(taskId, character.id) // individual card tasks use character.id
        }
      })
    })

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [projectId, character.id, startPolling])

  const generateSingleImage = async (typeId: string) => {
    setIsGenerating(true)
    setGeneratingTypeId(typeId)
    setGenProgress(0)

    try {
      const response = await generationApi.generateCharacterImages(projectId, character.id, [typeId])
      startPolling(response.task_id, typeId)
    } catch (err) {
      setIsGenerating(false)
      setGeneratingTypeId(null)
      console.error('Generate failed:', err)
    }
  }

  const getImageByType = (typeId: string) => {
    return images.find(img => img.imageType === typeId)
  }

  const [showTypeConfig, setShowTypeConfig] = useState(false)
  const [localSelectedTypes, setLocalSelectedTypes] = useState<ImageType[]>(selectedTypes)
  const [templates, setTemplates] = useState<CharacterImageTemplates | null>(null)

  useEffect(() => {
    setLocalSelectedTypes(selectedTypes)
  }, [selectedTypes])

  useEffect(() => {
    if (showTypeConfig) {
      configApi.getCharacterImageTemplates().then(setTemplates).catch(console.error)
    }
  }, [showTypeConfig])

  const addLocalType = (type: ImageType) => {
    if (!localSelectedTypes.find(t => t.id === type.id)) {
      setLocalSelectedTypes([...localSelectedTypes, type])
    }
  }

  const removeLocalType = (typeId: string) => {
    setLocalSelectedTypes(localSelectedTypes.filter(t => t.id !== typeId))
  }

  const applyTemplateToCharacter = (templateName: string) => {
    if (templates?.templates[templateName]) {
      const newTypes = [...localSelectedTypes]
      templates.templates[templateName].forEach(type => {
        if (!newTypes.find(t => t.id === type.id)) {
          newTypes.push(type)
        }
      })
      setLocalSelectedTypes(newTypes)
    }
  }

  return (
    <div className="card p-5 group hover:shadow-lg transition-all duration-300 border border-slate-200">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-2xl border border-slate-200">
            {avatar}
          </div>
          <div>
            <div className="font-bold text-slate-900 text-lg">{character.name}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                {character.roleType}
              </span>
              <span className="text-xs text-slate-400">{imageCount} images</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${status === 'completed'
            ? 'bg-green-50 text-green-700 border-green-100'
            : status === 'generating'
              ? 'bg-primary-50 text-primary-700 border-primary-100 animate-pulse'
              : 'bg-slate-50 text-slate-500 border-slate-100'
            }`}>
            {statusLabel[status]}
          </span>
          <button
            onClick={() => setShowTypeConfig(true)}
            className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
            title="Configure Types"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        {selectedTypes.map((type) => {
          const img = getImageByType(type.id)
          const isThisGenerating = isGenerating && generatingTypeId === type.id
          return (
            <div
              key={type.id}
              className="relative group/img"
            >
              <div
                className={`w-20 h-24 rounded-lg flex items-center justify-center text-xs overflow-hidden border transition-all ${img
                  ? 'border-slate-200 bg-slate-50'
                  : isThisGenerating
                    ? 'border-primary-300 bg-primary-50 text-primary-600'
                    : status === 'generating'
                      ? 'border-primary-200 bg-primary-50/50 text-primary-400'
                      : 'border-slate-100 bg-slate-50 text-slate-300'
                  }`}
                title={type.label}
              >
                {img ? (
                  <img
                    src={fileUrl.image(img.imagePath)}
                    alt={`${character.name} ${type.label}`}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                ) : isThisGenerating ? (
                  <div className="text-center">
                    <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-1"></div>
                    <div className="text-[10px] font-medium">{genProgress}%</div>
                  </div>
                ) : status === 'generating' ? (
                  <span className="animate-pulse text-lg">⏳</span>
                ) : (
                  <span className="text-[10px] px-1 text-center font-medium">{type.label}</span>
                )}
              </div>

              {/* Action Overlay */}
              {!isGenerating && status !== 'generating' && (
                <div className="absolute inset-0 bg-slate-900/60 rounded-lg opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                  <button
                    onClick={() => generateSingleImage(type.id)}
                    className="text-white text-[10px] font-bold uppercase tracking-wide px-2 py-1 bg-primary-600 hover:bg-primary-500 rounded shadow-sm transform scale-90 hover:scale-100 transition-all"
                  >
                    {img ? 'Regen' : 'Gen'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {status === 'completed' && imageCount > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-100 flex gap-3 opacity-50 hover:opacity-100 transition-opacity">
          <button className="text-xs font-medium text-slate-500 hover:text-primary-600 transition-colors flex items-center gap-1">
            <span>📥</span> Export
          </button>
          <button className="text-xs font-medium text-slate-500 hover:text-primary-600 transition-colors flex items-center gap-1">
            <span>🔄</span> Regen All
          </button>
        </div>
      )}

      {/* Type Config Modal */}
      {showTypeConfig && templates && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800">Configure {character.name}</h3>
              <button
                onClick={() => setShowTypeConfig(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="mb-6">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Selected Types</h4>
              <div className="flex flex-wrap gap-2">
                {localSelectedTypes.map((type) => (
                  <span
                    key={type.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 text-primary-700 text-sm rounded-lg border border-primary-100"
                  >
                    {type.label}
                    <button
                      onClick={() => removeLocalType(type.id)}
                      className="text-primary-400 hover:text-red-500 transition-colors"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {localSelectedTypes.length === 0 && (
                  <span className="text-sm text-slate-400 italic">No types selected</span>
                )}
              </div>
            </div>

            <div className="mb-6">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Quick Templates</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(templates.templates).map(([name]) => (
                  <button
                    key={name}
                    onClick={() => applyTemplateToCharacter(name)}
                    className="px-3 py-1.5 bg-slate-100 text-slate-700 text-sm rounded-lg hover:bg-slate-200 transition-colors font-medium"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Add Available Types</h4>
              <div className="flex flex-wrap gap-2">
                {templates.available_types
                  .filter(t => !localSelectedTypes.find(s => s.id === t.id))
                  .map((type) => (
                    <button
                      key={type.id}
                      onClick={() => addLocalType(type)}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-sm rounded-lg hover:border-primary-300 hover:text-primary-600 transition-colors"
                    >
                      + {type.label}
                    </button>
                  ))}
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={() => {
                  setLocalSelectedTypes(selectedTypes)
                  setShowTypeConfig(false)
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (onSaveCharacterTypes) {
                    onSaveCharacterTypes(localSelectedTypes)
                  }
                  setShowTypeConfig(false)
                }}
                className="btn btn-primary"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SceneImageTab({
  projectId,
  scenes,
  hasCharacterLibrary,
  onNavigateAnalysis,
  startGlobalPolling,
}: {
  projectId: string
  scenes: Scene[]
  hasCharacterLibrary: boolean
  onNavigateAnalysis: () => void
  startGlobalPolling: (taskId: string) => void
}) {
  const [currentScene, setCurrentScene] = useState(1)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<number | null>(null)

  const totalScenes = scenes.length
  const completedScenes = scenes.filter(s => s.sceneImage).length

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  if (scenes.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-6xl mb-4 opacity-20">🖼️</div>
        <p className="text-slate-500 mb-8 font-medium">No scenes found. Please complete script analysis first.</p>
        <button
          onClick={onNavigateAnalysis}
          className="btn btn-secondary"
        >
          Go to Script Analysis
        </button>
      </div>
    )
  }

  const startGeneration = async () => {
    setGenerating(true)
    setProgress(0)
    setError(null)

    try {
      const response = await generationApi.generateAllSceneImages(projectId)
      startGlobalPolling(response.task_id)
    } catch (err) {
      setGenerating(false)
      setError('Failed to start generation task')
    }
  }

  const currentSceneData = scenes[currentScene - 1]

  return (
    <div>
      {/* Status Bar */}
      <div className="flex items-center justify-between mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="flex items-center gap-6 text-sm">
          {hasCharacterLibrary ? (
            <span className="text-green-600 font-medium flex items-center gap-2">
              <span className="bg-green-100 p-1 rounded-full">✓</span> Character Library Ready
            </span>
          ) : (
            <span className="text-amber-600 font-medium flex items-center gap-2">
              <span className="bg-amber-100 p-1 rounded-full">!</span> Character Library Missing
            </span>
          )}
          <div className="h-4 w-px bg-slate-300"></div>
          <span className="text-slate-600">
            {generating ? `Generating... (${progress}%)` : completedScenes > 0 ? `Completed: ${completedScenes} / ${totalScenes}` : 'Ready to generate'}
          </span>
        </div>
        <button
          onClick={startGeneration}
          disabled={!hasCharacterLibrary || generating}
          className="btn btn-primary shadow-lg shadow-primary-500/20"
        >
          {generating ? '⏳ Generating...' : '▶ Generate All Scenes'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}

      {totalScenes > 0 && (
        <div className="h-1.5 bg-slate-100 rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-500"
            style={{ width: `${(completedScenes / totalScenes) * 100}%` }}
          />
        </div>
      )}

      {/* Main Preview */}
      <div className="bg-slate-900 rounded-2xl aspect-[16/9] md:aspect-[21/9] max-h-[60vh] mx-auto flex items-center justify-center mb-6 overflow-hidden relative group shadow-2xl">
        {currentSceneData?.sceneImage ? (
          <img
            src={fileUrl.image(currentSceneData.sceneImage.imagePath)}
            alt={`Scene #${currentScene}`}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-center text-slate-700">
            <div className="text-8xl mb-4 opacity-20">🖼️</div>
            <p className="text-slate-500 text-lg font-medium">Scene #{currentSceneData?.sceneNumber} Preview</p>
            {generating && <p className="text-primary-500 mt-2 animate-pulse">Generating...</p>}
          </div>
        )}

        {/* Scene Info Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent text-white opacity-0 group-hover:opacity-100 transition-opacity">
          <h3 className="text-xl font-bold">Scene {currentSceneData?.sceneNumber}: {currentSceneData?.location}</h3>
          <p className="text-sm text-slate-300 mt-1 line-clamp-2">{currentSceneData?.environmentDesc}</p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-6 mb-8">
        <button
          onClick={() => setCurrentScene((s) => Math.max(1, s - 1))}
          className="p-3 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
          disabled={currentScene <= 1}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-lg font-mono font-bold text-slate-700">
          {currentScene} <span className="text-slate-400 font-normal">/</span> {totalScenes}
        </span>
        <button
          onClick={() => setCurrentScene((s) => Math.min(totalScenes, s + 1))}
          className="p-3 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
          disabled={currentScene >= totalScenes}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* Thumbnails */}
      {totalScenes > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin px-1">
          {scenes.map((scene, i) => (
            <button
              key={scene.id}
              onClick={() => setCurrentScene(i + 1)}
              className={`flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 transition-all ${i + 1 === currentScene ? 'border-primary-500 ring-2 ring-primary-100 scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                } ${scene.sceneImage ? 'bg-slate-800' : 'bg-slate-100'
                }`}
            >
              {scene.sceneImage ? (
                <img
                  src={fileUrl.image(scene.sceneImage.imagePath)}
                  alt={`Scene ${scene.sceneNumber}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-xs text-slate-400 font-medium">
                  {generating && i >= completedScenes ? <span className="animate-spin text-lg mb-1">⏳</span> : <span className="text-lg mb-1">⬜</span>}
                  <span>{scene.sceneNumber}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function VideoGenerationTab({
  projectId,
  scenes,
  hasSceneImages,
  onNavigateAnalysis,
  startGlobalPolling,
}: {
  projectId: string
  scenes: Scene[]
  hasSceneImages: boolean
  onNavigateAnalysis: () => void
  startGlobalPolling: (taskId: string) => void
}) {
  const [currentScene, setCurrentScene] = useState(1)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<number | null>(null)

  const totalScenes = scenes.length
  const completedVideos = scenes.filter(s => s.videoClip).length

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  if (scenes.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-6xl mb-4 opacity-20">🎬</div>
        <p className="text-slate-500 mb-8 font-medium">No scenes found.</p>
        <button
          onClick={onNavigateAnalysis}
          className="btn btn-secondary"
        >
          Go to Script Analysis
        </button>
      </div>
    )
  }

  const startGeneration = async () => {
    setGenerating(true)
    setProgress(0)
    setError(null)

    try {
      const response = await generationApi.generateAllVideos(projectId)
      startGlobalPolling(response.task_id)
    } catch (err) {
      setGenerating(false)
      setError('Failed to start video generation')
    }
  }

  const currentSceneData = scenes[currentScene - 1]

  return (
    <div>
      {/* Status Bar */}
      <div className="flex items-center justify-between mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="flex items-center gap-6 text-sm">
          {hasSceneImages ? (
            <span className="text-green-600 font-medium flex items-center gap-2">
              <span className="bg-green-100 p-1 rounded-full">✓</span> Scene Images Ready
            </span>
          ) : (
            <span className="text-amber-600 font-medium flex items-center gap-2">
              <span className="bg-amber-100 p-1 rounded-full">!</span> Scene Images Missing
            </span>
          )}
          <div className="h-4 w-px bg-slate-300"></div>
          <span className="text-slate-600">
            {generating ? `Processing... (${progress}%)` : completedVideos > 0 ? `Completed: ${completedVideos} / ${totalScenes}` : 'Ready to generate'}
          </span>
        </div>
        <button
          onClick={startGeneration}
          disabled={!hasSceneImages || generating}
          className="btn btn-primary shadow-lg shadow-primary-500/20"
        >
          {generating ? '⏳ Generating Videos...' : '▶ Generate All Videos'}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm border border-red-100 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {error}
        </div>
      )}

      {(generating || totalScenes > 0) && (
        <div className="h-1.5 bg-slate-100 rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-500"
            style={{ width: `${generating ? progress : (completedVideos / totalScenes) * 100}%` }}
          />
        </div>
      )}

      {/* Video Preview */}
      <div className="bg-black rounded-2xl aspect-[16/9] md:aspect-[21/9] max-h-[70vh] mx-auto flex items-center justify-center mb-6 overflow-hidden shadow-2xl relative">
        {currentSceneData?.videoClip ? (
          <video
            src={fileUrl.video(currentSceneData.videoClip.videoPath)}
            controls
            className="w-full h-full object-contain"
            poster={currentSceneData.sceneImage ? fileUrl.image(currentSceneData.sceneImage.imagePath) : undefined}
          />
        ) : (
          <div className="text-center text-white/50">
            <div className="text-8xl mb-4 opacity-50">🎬</div>
            <p className="text-white text-lg font-medium">Scene #{currentScene} Video</p>
            <p className="text-sm opacity-60 mt-2 font-mono">768x1344 | 24fps | 4s</p>
            {generating && <p className="text-primary-400 mt-4 animate-pulse">Generating...</p>}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-6 mb-8">
        <button
          onClick={() => setCurrentScene((s) => Math.max(1, s - 1))}
          className="p-3 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
          disabled={currentScene <= 1}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className="text-center">
          <span className="text-lg font-mono font-bold text-slate-700">
            {currentScene} <span className="text-slate-400 font-normal">/</span> {totalScenes}
          </span>
          <div className="text-xs text-slate-400 mt-1">{currentSceneData?.location || 'Unknown Location'}</div>
        </div>
        <button
          onClick={() => setCurrentScene((s) => Math.min(totalScenes, s + 1))}
          className="p-3 rounded-full hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
          disabled={currentScene >= totalScenes}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-3 mb-8">
        <button className="btn btn-secondary text-sm py-2 px-4 shadow-sm">
          🔄 Regenerate
        </button>
        <button className="btn btn-secondary text-sm py-2 px-4 shadow-sm">
          ✏️ Edit Action Prompt
        </button>
        <button className="btn btn-secondary text-sm py-2 px-4 shadow-sm">
          📥 Download
        </button>
      </div>
    </div>
  )
}
