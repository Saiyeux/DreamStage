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

  // 加载数据 (可复用)
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
      setError('加载项目失败')
      console.error('Load project failed:', err)
    } finally {
      setLoading(false)
    }
  }, [projectId, urlProjectId, currentProject, setCurrentProject, setCharacters, setScenes])

  // 初始加载
  useEffect(() => {
    loadData()
  }, [loadData])

  // 无项目时的空状态
  if (!projectId) {
    return (
      <div className="bg-white rounded-xl p-12 shadow-sm text-center">
        <div className="text-6xl mb-4">🎨</div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">请先选择项目</h2>
        <p className="text-gray-500 mb-6">完成剧本分析后，可在此生成角色库和视频</p>
        <button
          onClick={() => navigate('/upload')}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          上传剧本
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-12 shadow-sm text-center">
        <div className="text-4xl mb-4 animate-pulse">⏳</div>
        <p className="text-gray-500">加载中...</p>
      </div>
    )
  }

  // 计算前置条件
  const hasCharacterLibrary = characters.some(c => c.images && c.images.length > 0)
  const hasSceneImages = scenes.some(s => s.sceneImage)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-effect rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
              🎨 生成中心
            </h2>
            <p className="text-sm text-gray-600 mt-2">
              项目: <span className="font-semibold text-gray-800">{currentProject?.name || '未命名'}</span>
            </p>
          </div>
          <button
            onClick={() => navigate(`/analysis?project=${projectId}`)}
            className="px-6 py-3 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-xl font-semibold hover:from-gray-600 hover:to-gray-700 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
          >
            ← 返回分析
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="glass-effect rounded-2xl shadow-xl overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex gap-2 p-2">
            <button
              onClick={() => setActiveTab('characters')}
              className={`flex-1 px-6 py-3 text-sm font-semibold rounded-lg transition-all duration-300 ${
                activeTab === 'characters'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg scale-105'
                  : 'text-gray-600 hover:bg-white hover:text-purple-600 hover:shadow-md'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-lg">📸</span>
                <span>角色库</span>
              </span>
            </button>
            <button
              onClick={() => setActiveTab('scenes')}
              className={`flex-1 px-6 py-3 text-sm font-semibold rounded-lg transition-all duration-300 ${
                activeTab === 'scenes'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg scale-105'
                  : 'text-gray-600 hover:bg-white hover:text-purple-600 hover:shadow-md'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-lg">🖼️</span>
                <span>场景图</span>
              </span>
            </button>
            <button
              onClick={() => setActiveTab('videos')}
              className={`flex-1 px-6 py-3 text-sm font-semibold rounded-lg transition-all duration-300 ${
                activeTab === 'videos'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg scale-105'
                  : 'text-gray-600 hover:bg-white hover:text-purple-600 hover:shadow-md'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <span className="text-lg">🎬</span>
                <span>视频生成</span>
              </span>
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'characters' && (
            <CharacterLibraryTab
              projectId={projectId}
              characters={characters}
              onNavigateAnalysis={() => navigate(`/analysis?project=${projectId}`)}
              onRefresh={loadData}
            />
          )}
          {activeTab === 'scenes' && (
            <SceneImageTab
              projectId={projectId}
              scenes={scenes}
              hasCharacterLibrary={hasCharacterLibrary}
              onNavigateAnalysis={() => navigate(`/analysis?project=${projectId}`)}
              onRefresh={loadData}
            />
          )}
          {activeTab === 'videos' && (
            <VideoGenerationTab
              projectId={projectId}
              scenes={scenes}
              hasSceneImages={hasSceneImages}
              onNavigateAnalysis={() => navigate(`/analysis?project=${projectId}`)}
              onRefresh={loadData}
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
}: {
  projectId: string
  characters: Character[]
  onNavigateAnalysis: () => void
  onRefresh: () => void
}) {
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<number | null>(null)

  // 模板配置
  const [templates, setTemplates] = useState<CharacterImageTemplates | null>(null)
  const [selectedTypes, setSelectedTypes] = useState<ImageType[]>([])
  const [showTemplateModal, setShowTemplateModal] = useState(false)

  // 角色特定的类型配置
  const [characterCustomTypes, setCharacterCustomTypes] = useState<Record<string, ImageType[]>>({})

  // 加载模板配置
  useEffect(() => {
    configApi.getCharacterImageTemplates().then((data) => {
      setTemplates(data)
      setSelectedTypes(data.default_types)
    }).catch(console.error)
  }, [])

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  // 添加类型
  const addType = (type: ImageType) => {
    if (!selectedTypes.find(t => t.id === type.id)) {
      setSelectedTypes([...selectedTypes, type])
    }
  }

  // 删除类型
  const removeType = (typeId: string) => {
    setSelectedTypes(selectedTypes.filter(t => t.id !== typeId))
  }

  // 保存角色特定的类型配置
  const saveCharacterCustomTypes = (characterId: string, types: ImageType[]) => {
    setCharacterCustomTypes(prev => ({
      ...prev,
      [characterId]: types,
    }))
  }

  // 获取角色的有效类型配置（优先使用角色特定的，没有则使用全局）
  const getCharacterEffectiveTypes = (characterId: string): ImageType[] => {
    const customTypes = characterCustomTypes[characterId]
    if (customTypes && customTypes.length > 0) {
      return customTypes
    }
    return selectedTypes
  }

  // 应用模板（预留功能）
  // const applyTemplate = (templateName: string) => {
  //   if (templates?.templates[templateName]) {
  //     setSelectedTypes([...templates.templates[templateName]])
  //   }
  //   setShowTemplateModal(false)
  // }

  // 空状态
  if (characters.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📸</div>
        <p className="text-gray-500 mb-4">暂无角色数据</p>
        <p className="text-sm text-gray-400 mb-6">请先完成剧本分析，识别角色后再生成角色库</p>
        <button
          onClick={onNavigateAnalysis}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          前往剧本分析
        </button>

        <div className="mt-8 p-4 bg-gray-50 rounded-lg text-left max-w-md mx-auto">
          <h4 className="font-medium text-gray-700 mb-2">角色图类型说明</h4>
          <p className="text-sm text-gray-500 mb-2">每个角色将生成以下类型的参考图：</p>
          <div className="flex flex-wrap gap-2">
            {selectedTypes.map((type, i) => (
              <span
                key={type.id}
                className={`px-2 py-1 text-xs rounded ${
                  i === 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {type.label} {i === 0 && '⭐'}
              </span>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const startGeneration = async () => {
    setGenerating(true)
    setProgress(0)
    setError(null)
    setStatusMessage('正在启动生成任务...')

    try {
      // 传递选中的类型到后端
      const imageTypes = selectedTypes.map(t => t.id)
      const response = await generationApi.generateCharacterLibrary(projectId, imageTypes)
      const taskId = response.task_id

      // 轮询任务状态
      pollingRef.current = window.setInterval(async () => {
        try {
          const status = await generationApi.getTaskStatus(taskId)
          setProgress(status.progress)
          setStatusMessage(status.message)

          if (status.status === 'completed') {
            setGenerating(false)
            if (pollingRef.current) clearInterval(pollingRef.current)
            onRefresh() // 刷新数据
          } else if (status.status === 'failed') {
            setGenerating(false)
            setError(status.error || '生成失败')
            if (pollingRef.current) clearInterval(pollingRef.current)
          }
        } catch (err) {
          console.error('Poll status failed:', err)
        }
      }, 1000)
    } catch (err) {
      setGenerating(false)
      setError('启动任务失败，请检查 ComfyUI 服务')
      console.error('Start generation failed:', err)
    }
  }

  return (
    <div>
      {/* 类型配置区 */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium text-gray-700">图片类型配置</h4>
          <div className="flex gap-2">
            <button
              onClick={() => setShowTemplateModal(true)}
              className="text-sm text-blue-500 hover:text-blue-600"
            >
              📋 选择模板
            </button>
          </div>
        </div>

        {/* 已选类型 */}
        <div className="flex flex-wrap gap-2 mb-3">
          {selectedTypes.map((type) => (
            <span
              key={type.id}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded"
            >
              {type.label}
              <button
                onClick={() => removeType(type.id)}
                className="ml-1 text-blue-500 hover:text-red-500"
                title="删除"
              >
                ×
              </button>
            </span>
          ))}
          {selectedTypes.length === 0 && (
            <span className="text-sm text-gray-400">请添加至少一个类型</span>
          )}
        </div>

        {/* 添加类型下拉 */}
        {templates && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">添加类型:</span>
            <select
              className="text-sm border border-gray-300 rounded px-2 py-1"
              value=""
              onChange={(e) => {
                const type = templates.available_types.find(t => t.id === e.target.value)
                if (type) addType(type)
              }}
            >
              <option value="">选择类型...</option>
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

      {/* Status Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-600">
          {generating ? `🔄 ${statusMessage} (${progress}%)` : '⏸️ 待开始'}
        </div>
        <button
          onClick={startGeneration}
          disabled={generating || selectedTypes.length === 0}
          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
        >
          {generating ? '⏳ 生成中...' : '▶️ 开始生成'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          ❌ {error}
        </div>
      )}

      {generating && (
        <div className="relative h-3 bg-gray-200 rounded-full mb-6 overflow-hidden shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 rounded-full transition-all duration-300 relative"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute inset-0 bg-white/30 animate-pulse"></div>
          </div>
        </div>
      )}

      {/* Character Cards */}
      <div className="space-y-4">
        {characters.map((character) => (
          <CharacterGenerationCard
            key={character.id}
            character={character}
            selectedTypes={getCharacterEffectiveTypes(character.id)}
            onSaveCharacterTypes={(types) => saveCharacterCustomTypes(character.id, types)}
            status={character.images && character.images.length > 0 ? 'completed' : generating ? 'generating' : 'pending'}
            projectId={projectId}
            onRefresh={onRefresh}
          />
        ))}
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
        💡 角色库完成后，系统将使用这些参考图保持场景中角色一致性
      </div>

      {/* 模板选择弹窗 */}
      {showTemplateModal && templates && (
        <TemplateSelectionModal
          templates={templates}
          selectedTypes={selectedTypes}
          onSelect={(types) => {
            // 合并所选模板的类型
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

// 模板选择弹窗组件 - 多选打勾类型
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
      // 检查是否属于某个模板
      return !Object.values(templates.templates).some(templateTypes =>
        templateTypes.some(templateType => templateType.id === t.id)
      )
    }).map(t => t.id)
  )

  // 计算当前选中的所有类型
  const currentSelectedTypes = useCallback(() => {
    const typeMap = new Map<string, ImageType>()

    // 添加自定义类型
    customTypes.forEach(typeId => {
      const type = templates.available_types.find(t => t.id === typeId)
      if (type) typeMap.set(typeId, type)
    })

    // 添加模板中的类型
    selectedTemplates.forEach(templateName => {
      templates.templates[templateName]?.forEach(type => {
        if (!typeMap.has(type.id)) {
          typeMap.set(type.id, type)
        }
      })
    })

    return Array.from(typeMap.values())
  }, [templates, selectedTemplates, customTypes])

  // 切换模板选择
  const toggleTemplate = (templateName: string) => {
    setSelectedTemplates(prev =>
      prev.includes(templateName)
        ? prev.filter(t => t !== templateName)
        : [...prev, templateName]
    )
  }

  // 切换自定义类型
  const toggleCustomType = (typeId: string) => {
    setCustomTypes(prev =>
      prev.includes(typeId)
        ? prev.filter(t => t !== typeId)
        : [...prev, typeId]
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">选择图片类型模板</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* 模板选择区 - 打勾类型 */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-2">模板组合（可多选）</h4>
          <div className="space-y-2">
            {Object.entries(templates.templates).map(([name, types]) => (
              <label
                key={name}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedTemplates.includes(name)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedTemplates.includes(name)}
                  onChange={() => toggleTemplate(name)}
                  className="w-4 h-4 text-blue-500 rounded"
                />
                <div className="flex-1">
                  <div className="font-medium">{name}</div>
                  <div className="text-sm text-gray-500">
                    {types.map(t => t.label).join('、')}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* 自定义类型 - 打勾选择 */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-2">自定义类型</h4>
          <div className="flex flex-wrap gap-2">
            {templates.available_types.map((type) => {
              // 排除已在模板中的类型
              const isInTemplate = Object.values(templates.templates).some(templateTypes =>
                templateTypes.some(t => t.id === type.id)
              )
              if (isInTemplate) return null

              const isSelected = customTypes.includes(type.id)
              return (
                <label
                  key={type.id}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleCustomType(type.id)}
                    className="w-3 h-3 text-blue-500 rounded"
                  />
                  <span className="text-sm">{type.label}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* 预览当前选择 */}
        <div className="mb-6 p-3 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-700 mb-2">当前选择预览</h4>
          <div className="flex flex-wrap gap-2">
            {currentSelectedTypes().map((type) => (
              <span
                key={type.id}
                className="px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded"
              >
                {type.label}
              </span>
            ))}
            {currentSelectedTypes().length === 0 && (
              <span className="text-sm text-gray-400">未选择任何类型</span>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            取消
          </button>
          <button
            onClick={() => onSelect(currentSelectedTypes())}
            disabled={currentSelectedTypes().length === 0}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            应用选择
          </button>
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
    pending: '⬜ 待生成',
    generating: '🔄 生成中',
    completed: '✅ 完成',
  }

  const avatar = character.gender?.includes('女') ? '👩' : character.gender?.includes('男') ? '👨' : '👤'
  const images = character.images || []
  const imageCount = images.length

  // 单个角色生成状态
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingTypeId, setGeneratingTypeId] = useState<string | null>(null)
  const [genProgress, setGenProgress] = useState(0)
  const pollingRef = useRef<number | null>(null)

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  // 生成单张图片
  const generateSingleImage = async (typeId: string) => {
    setIsGenerating(true)
    setGeneratingTypeId(typeId)
    setGenProgress(0)

    try {
      const response = await generationApi.generateCharacterImages(projectId, character.id, [typeId])
      const taskId = response.task_id

      // 轮询任务状态
      pollingRef.current = window.setInterval(async () => {
        try {
          const taskStatus = await generationApi.getTaskStatus(taskId)
          setGenProgress(taskStatus.progress)

          if (taskStatus.status === 'completed' || taskStatus.status === 'failed') {
            setIsGenerating(false)
            setGeneratingTypeId(null)
            if (pollingRef.current) clearInterval(pollingRef.current)
            if (taskStatus.status === 'completed' && onRefresh) {
              onRefresh()
            }
          }
        } catch (err) {
          console.error('Poll status failed:', err)
        }
      }, 1000)
    } catch (err) {
      setIsGenerating(false)
      setGeneratingTypeId(null)
      console.error('Generate failed:', err)
    }
  }

  // 根据类型查找图片
  const getImageByType = (typeId: string) => {
    return images.find(img => img.imageType === typeId)
  }

  // 角色特定的类型配置
  const [showTypeConfig, setShowTypeConfig] = useState(false)
  const [localSelectedTypes, setLocalSelectedTypes] = useState<ImageType[]>(selectedTypes)
  const [templates, setTemplates] = useState<CharacterImageTemplates | null>(null)

  // 同步父组件传来的 selectedTypes
  useEffect(() => {
    setLocalSelectedTypes(selectedTypes)
  }, [selectedTypes])

  useEffect(() => {
    if (showTypeConfig) {
      configApi.getCharacterImageTemplates().then(setTemplates).catch(console.error)
    }
  }, [showTypeConfig])

  // 添加类型
  const addLocalType = (type: ImageType) => {
    if (!localSelectedTypes.find(t => t.id === type.id)) {
      setLocalSelectedTypes([...localSelectedTypes, type])
    }
  }

  // 删除类型
  const removeLocalType = (typeId: string) => {
    setLocalSelectedTypes(localSelectedTypes.filter(t => t.id !== typeId))
  }

  // 应用模板到角色
  const applyTemplateToCharacter = (templateName: string) => {
    if (templates?.templates[templateName]) {
      // 合并现有类型和模板类型
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
    <div className="glass-effect border-2 border-gray-200 hover:border-purple-300 rounded-xl p-5 transition-all duration-300 hover:shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{avatar}</span>
          <div>
            <span className="font-bold text-gray-800">{character.name}</span>
            <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
              {character.roleType}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium px-3 py-1 rounded-full ${
            status === 'completed'
              ? 'bg-green-100 text-green-700'
              : status === 'generating'
              ? 'bg-blue-100 text-blue-700 animate-pulse'
              : 'bg-gray-100 text-gray-600'
          }`}>
            {statusLabel[status]}
          </span>
          <button
            onClick={() => setShowTypeConfig(true)}
            className="text-sm px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 font-medium transition-all duration-300"
            title="配置该角色的图片类型"
          >
            ⚙️ 类型
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {selectedTypes.map((type) => {
          const img = getImageByType(type.id)
          const isThisGenerating = isGenerating && generatingTypeId === type.id
          return (
            <div
              key={type.id}
              className="relative group"
            >
              <div
                className={`w-16 h-20 rounded-lg flex items-center justify-center text-xs overflow-hidden ${
                  img
                    ? 'bg-gray-100'
                    : isThisGenerating
                    ? 'bg-blue-100 text-blue-500'
                    : status === 'generating'
                    ? 'bg-blue-50 text-blue-400'
                    : 'bg-gray-100 text-gray-400'
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
                    <span className="animate-spin inline-block">⏳</span>
                    <div className="text-[10px] mt-1">{genProgress}%</div>
                  </div>
                ) : status === 'generating' ? (
                  '⏳'
                ) : (
                  type.label
                )}
              </div>
              {/* 生成按钮 - 悬停时显示 */}
              {!img && !isGenerating && status !== 'generating' && (
                <button
                  onClick={() => generateSingleImage(type.id)}
                  className="absolute inset-0 bg-purple-600/80 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-medium"
                  title={`生成${type.label}`}
                >
                  生成
                </button>
              )}
              {/* 重新生成按钮 - 已有图片时悬停显示 */}
              {img && !isGenerating && status !== 'generating' && (
                <button
                  onClick={() => generateSingleImage(type.id)}
                  className="absolute inset-0 bg-purple-600/80 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-medium"
                  title={`重新生成${type.label}`}
                >
                  重新生成
                </button>
              )}
            </div>
          )
        })}
      </div>

      {status === 'completed' && imageCount > 0 && (
        <div className="flex gap-2 mt-3">
          <button className="text-sm text-blue-500 hover:text-blue-600">
            🔄 重新生成
          </button>
          <button className="text-sm text-blue-500 hover:text-blue-600">
            ➕ 添加变体
          </button>
          <button className="text-sm text-blue-500 hover:text-blue-600">
            📥 导出角色
          </button>
        </div>
      )}

      {/* 角色类型配置弹窗 */}
      {showTypeConfig && templates && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">配置 {character.name} 的图片类型</h3>
              <button
                onClick={() => setShowTypeConfig(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {/* 已选类型 */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">已选类型</h4>
              <div className="flex flex-wrap gap-2">
                {localSelectedTypes.map((type) => (
                  <span
                    key={type.id}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded"
                  >
                    {type.label}
                    <button
                      onClick={() => removeLocalType(type.id)}
                      className="ml-1 text-blue-500 hover:text-red-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {localSelectedTypes.length === 0 && (
                  <span className="text-sm text-gray-400">请添加至少一个类型</span>
                )}
              </div>
            </div>

            {/* 快速添加模板 */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">快速添加模板</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(templates.templates).map(([name]) => (
                  <button
                    key={name}
                    onClick={() => applyTemplateToCharacter(name)}
                    className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* 添加可用类型 */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">添加类型</h4>
              <div className="flex flex-wrap gap-2">
                {templates.available_types
                  .filter(t => !localSelectedTypes.find(s => s.id === t.id))
                  .map((type) => (
                    <button
                      key={type.id}
                      onClick={() => addLocalType(type)}
                      className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200"
                    >
                      {type.label}
                    </button>
                  ))}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => {
                  setLocalSelectedTypes(selectedTypes)
                  setShowTypeConfig(false)
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={() => {
                  // 保存角色特定的类型配置
                  if (onSaveCharacterTypes) {
                    onSaveCharacterTypes(localSelectedTypes)
                  }
                  setShowTypeConfig(false)
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                保存
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
  onRefresh,
}: {
  projectId: string
  scenes: Scene[]
  hasCharacterLibrary: boolean
  onNavigateAnalysis: () => void
  onRefresh: () => void
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

  // 空状态
  if (scenes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🖼️</div>
        <p className="text-gray-500 mb-4">暂无场景数据</p>
        <p className="text-sm text-gray-400 mb-6">请先完成剧本分析，识别分镜后再生成场景图</p>
        <button
          onClick={onNavigateAnalysis}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          前往剧本分析
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
      const taskId = response.task_id

      pollingRef.current = window.setInterval(async () => {
        try {
          const status = await generationApi.getTaskStatus(taskId)
          setProgress(status.progress)

          if (status.status === 'completed' || status.status === 'failed') {
            setGenerating(false)
            if (status.status === 'failed') setError(status.error || '生成失败')
            if (pollingRef.current) clearInterval(pollingRef.current)
            if (status.status === 'completed') onRefresh() // 刷新数据
          }
        } catch (err) {
          console.error('Poll status failed:', err)
        }
      }, 1000)
    } catch (err) {
      setGenerating(false)
      setError('启动任务失败')
    }
  }

  // 当前场景
  const currentSceneData = scenes[currentScene - 1]

  return (
    <div>
      {/* Status Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm">
          {hasCharacterLibrary ? (
            <span className="text-green-600">✅ 前置条件: 角色库已完成</span>
          ) : (
            <span className="text-orange-500">⚠️ 前置条件: 请先生成角色库</span>
          )}
          <span className="ml-4 text-gray-600">
            {generating ? `🔄 生成中 (${progress}%)` : completedScenes > 0 ? `✅ ${completedScenes}/${totalScenes}` : '⏸️ 待开始'}
          </span>
        </div>
        <button
          onClick={startGeneration}
          disabled={!hasCharacterLibrary || generating}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          {generating ? '⏳ 生成中...' : '▶️ 开始生成'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          ❌ {error}
        </div>
      )}

      {totalScenes > 0 && (
        <div className="h-2 bg-gray-200 rounded-full mb-6">
          <div
            className="h-full bg-blue-500 rounded-full"
            style={{ width: `${(completedScenes / totalScenes) * 100}%` }}
          />
        </div>
      )}

      {/* Main Preview */}
      <div className="bg-gray-100 rounded-lg aspect-[9/16] max-w-md mx-auto flex items-center justify-center mb-4 overflow-hidden">
        {currentSceneData?.sceneImage ? (
          <img
            src={fileUrl.image(currentSceneData.sceneImage.imagePath)}
            alt={`场景 #${currentScene}`}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              e.currentTarget.parentElement!.innerHTML = `
                <div class="text-center">
                  <div class="text-6xl mb-2">🖼️</div>
                  <p class="text-gray-500">图片加载失败</p>
                </div>
              `
            }}
          />
        ) : (
          <div className="text-center">
            <div className="text-6xl mb-2">🖼️</div>
            <p className="text-gray-500">场景 #{currentScene} 预览</p>
            {generating && <p className="text-sm text-blue-500 mt-2">生成中...</p>}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-4 mb-4">
        <button
          onClick={() => setCurrentScene((s) => Math.max(1, s - 1))}
          className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
        >
          ◀ 上一场景
        </button>
        <span className="text-sm text-gray-600">
          {currentScene} / {totalScenes || 0}
        </span>
        <button
          onClick={() => setCurrentScene((s) => Math.min(totalScenes, s + 1))}
          className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
        >
          下一场景 ▶
        </button>
      </div>

      {/* Thumbnails */}
      {totalScenes > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {scenes.map((scene, i) => (
            <button
              key={scene.id}
              onClick={() => setCurrentScene(i + 1)}
              className={`flex-shrink-0 w-12 h-16 rounded overflow-hidden ${
                i + 1 === currentScene ? 'ring-2 ring-blue-500' : ''
              } ${
                scene.sceneImage ? '' : 'bg-gray-100'
              }`}
            >
              {scene.sceneImage ? (
                <img
                  src={fileUrl.image(scene.sceneImage.imagePath)}
                  alt={`场景 ${scene.sceneNumber}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-xs text-gray-400">
                  <span>{generating && i >= completedScenes ? '⏳' : '⬜'}</span>
                  <span>{scene.sceneNumber}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 text-sm text-gray-600 text-center">
        ✅ 已完成: {completedScenes} | ⬜ 待生成: {totalScenes - completedScenes}
      </div>
    </div>
  )
}

function VideoGenerationTab({
  projectId,
  scenes,
  hasSceneImages,
  onNavigateAnalysis,
  onRefresh,
}: {
  projectId: string
  scenes: Scene[]
  hasSceneImages: boolean
  onNavigateAnalysis: () => void
  onRefresh: () => void
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

  // 空状态
  if (scenes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🎬</div>
        <p className="text-gray-500 mb-4">暂无场景数据</p>
        <p className="text-sm text-gray-400 mb-6">请先完成剧本分析和场景图生成，再生成视频</p>
        <button
          onClick={onNavigateAnalysis}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          前往剧本分析
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
      const taskId = response.task_id

      pollingRef.current = window.setInterval(async () => {
        try {
          const status = await generationApi.getTaskStatus(taskId)
          setProgress(status.progress)

          if (status.status === 'completed' || status.status === 'failed') {
            setGenerating(false)
            if (status.status === 'failed') setError(status.error || '生成失败')
            if (pollingRef.current) clearInterval(pollingRef.current)
            if (status.status === 'completed') onRefresh() // 刷新数据
          }
        } catch (err) {
          console.error('Poll status failed:', err)
        }
      }, 1000)
    } catch (err) {
      setGenerating(false)
      setError('启动任务失败')
    }
  }

  // 当前场景
  const currentSceneData = scenes[currentScene - 1]

  return (
    <div>
      {/* Status Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm">
          {hasSceneImages ? (
            <span className="text-green-600">✅ 前置条件: 场景图已完成</span>
          ) : (
            <span className="text-orange-500">⚠️ 前置条件: 请先生成场景图</span>
          )}
          <span className="ml-4 text-gray-600">
            {generating ? `🔄 生成中 (${progress}%)` : completedVideos > 0 ? `✅ ${completedVideos}/${totalScenes}` : '⏸️ 待开始'}
          </span>
        </div>
        <button
          onClick={startGeneration}
          disabled={!hasSceneImages || generating}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          {generating ? '⏳ 生成中...' : '▶️ 开始生成'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          ❌ {error}
        </div>
      )}

      {(generating || totalScenes > 0) && (
        <div className="h-2 bg-gray-200 rounded-full mb-6">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${generating ? progress : (completedVideos / totalScenes) * 100}%` }}
          />
        </div>
      )}

      {/* Video Preview */}
      <div className="bg-black rounded-lg aspect-[9/16] max-w-md mx-auto flex items-center justify-center mb-4 overflow-hidden">
        {currentSceneData?.videoClip ? (
          <video
            src={fileUrl.video(currentSceneData.videoClip.videoPath)}
            controls
            className="w-full h-full object-cover"
            poster={currentSceneData.sceneImage ? fileUrl.image(currentSceneData.sceneImage.imagePath) : undefined}
          />
        ) : (
          <div className="text-center text-white">
            <div className="text-6xl mb-2">🎬</div>
            <p className="text-gray-400">场景 #{currentScene} 视频</p>
            <p className="text-sm text-gray-500 mt-2">768x1344 | 24fps | 4s</p>
            {generating && <p className="text-sm text-blue-400 mt-2">生成中...</p>}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-4 mb-4">
        <button
          onClick={() => setCurrentScene((s) => Math.max(1, s - 1))}
          className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
        >
          ◀ 上一场景
        </button>
        <span className="text-sm text-gray-600">
          {currentScene} / {totalScenes || 0}
        </span>
        <button
          onClick={() => setCurrentScene((s) => Math.min(totalScenes, s + 1))}
          className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
        >
          下一场景 ▶
        </button>
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-2 mb-6">
        <button className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">
          🔄 重新生成
        </button>
        <button className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">
          ✏️ 编辑动作Prompt
        </button>
        <button className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">
          📥 下载片段
        </button>
      </div>

      {/* Queue - only show when there are pending tasks */}
      {totalScenes > completedVideos && (
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="font-medium text-gray-700 mb-2">生成队列</h4>
          <div className="space-y-2 text-sm text-gray-500">
            <p>暂无生成任务</p>
          </div>
        </div>
      )}

      <div className="mt-4 text-sm text-gray-600 text-center">
        ✅ 已完成: {completedVideos} | ⬜ 待生成: {totalScenes - completedVideos}
      </div>
    </div>
  )
}
