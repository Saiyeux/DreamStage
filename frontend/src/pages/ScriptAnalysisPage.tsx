import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Character, Scene } from '@/types'
import { projectsApi, analysisApi, charactersApi } from '@/api'
import { useProjectStore } from '@/stores/projectStore'
import { analysisService } from '@/services/analysisService'
import { ProjectSidebar } from '@/components/ProjectSidebar'
import { fileUrl } from '@/api/client'

type Tab = 'characters' | 'scenes'

export function ScriptAnalysisPage() {
  const navigate = useNavigate()
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
  } = useProjectStore()

  const projectId = urlProjectId || currentProject?.id

  const [activeTab, setActiveTab] = useState<Tab>('characters')
  const [loading, setLoading] = useState(false)

  // 从 store 获取终端状态和当前分析类型
  const { terminalOutput, isStreaming, terminalExpanded, currentAnalyzing } = analysisState
  const terminalRef = useRef<HTMLDivElement>(null)

  // 自动滚动终端
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [terminalOutput])

  // 页面加载时检查分析服务状态
  useEffect(() => {
    if (analysisService.isAnalyzing()) {
      const analysisType = analysisService.getCurrentAnalysisType()
      if (analysisType && projectId) {
        analysisService.updateCallbacks(createAnalysisCallbacks(analysisType))
      }
    } else if (isStreaming) {
      appendTerminalOutput('')
      appendTerminalOutput(`[${new Date().toLocaleTimeString()}] 检测到连接中断，已重置状态`)
      setAnalysisState({
        isStreaming: false,
        currentAnalyzing: null
      })
    }
  }, [projectId])

  // 加载项目和数据
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

  // 刷新项目状态
  const refreshProjectStatus = async () => {
    if (!projectId) return
    try {
      const projectData = await projectsApi.get(projectId)
      setCurrentProject(projectData)
    } catch (err) {
      console.error('Refresh project status failed:', err)
    }
  }

  // 创建分析回调函数
  const createAnalysisCallbacks = useCallback((analysisType: 'characters' | 'scenes') => ({
    onStart: () => {
      appendTerminalOutput(`[${new Date().toLocaleTimeString()}] LLM 开始响应...`)
      appendTerminalOutput('')
    },
    onChunk: (content: string) => {
      updateLastTerminalLine(content)
    },
    onSaved: (count: number) => {
      appendTerminalOutput('')
      appendTerminalOutput(`[${new Date().toLocaleTimeString()}] 已保存 ${count} 条数据`)
    },
    onParseError: (message: string) => {
      appendTerminalOutput('')
      appendTerminalOutput(`[警告] 解析JSON失败: ${message}`)
    },
    onDone: async () => {
      appendTerminalOutput('')
      appendTerminalOutput(`[${new Date().toLocaleTimeString()}] 分析完成`)
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
          appendTerminalOutput(`[错误] 加载数据失败: ${err}`)
        }
      }

      await refreshProjectStatus()
    },
    onError: (message: string) => {
      appendTerminalOutput('')
      appendTerminalOutput(`[错误] ${message}`)
      setAnalysisState({
        isStreaming: false,
        currentAnalyzing: null
      })
      refreshProjectStatus()
    },
    onConnectionLost: () => {
      appendTerminalOutput('')
      appendTerminalOutput('[连接断开]')
      setAnalysisState({
        isStreaming: false,
        currentAnalyzing: null
      })
      refreshProjectStatus()
    }
  }), [projectId, appendTerminalOutput, updateLastTerminalLine, setAnalysisState, setCharacters, setScenes, refreshProjectStatus])

  // 停止流式分析
  const stopStream = async () => {
    analysisService.stop()
    appendTerminalOutput('')
    appendTerminalOutput(`[${new Date().toLocaleTimeString()}] 已手动停止`)
    setAnalysisState({
      isStreaming: false,
      currentAnalyzing: null
    })
    await refreshProjectStatus()
  }

  // 流式分析
  const analyzeWithStream = async (analysisType: 'characters' | 'scenes') => {
    if (!projectId) return
    if (isStreaming || analysisService.isAnalyzing()) return

    setAnalysisState({
      isStreaming: true,
      terminalExpanded: true,
      currentAnalyzing: analysisType,
    })

    const typeName = analysisType === 'characters' ? '角色' : '场景'
    setAnalysisState({
      terminalOutput: [
        `> 开始分析${typeName}...`,
        `[${new Date().toLocaleTimeString()}] 连接 LLM 服务...`,
        '',
      ],
    })

    const callbacks = createAnalysisCallbacks(analysisType)
    analysisService.start(projectId, analysisType, callbacks)
  }

  // 项目切换处理
  const handleProjectChange = (newProjectId: string) => {
    if (newProjectId && newProjectId !== projectId) {
      setSearchParams({ project: newProjectId })
    }
  }

  // 无项目时的空状态
  if (!projectId) {
    return (
      <div className="flex h-screen">
        <ProjectSidebar
          currentProject={null}
          onProjectChange={handleProjectChange}
        />
        <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
          <div className="glass-effect rounded-2xl p-12 shadow-xl text-center max-w-md">
            <div className="text-6xl mb-4">📝</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">请先上传剧本</h2>
            <p className="text-gray-500 mb-6">上传剧本后，系统将自动分析角色和分镜</p>
            <button
              onClick={() => navigate('/upload')}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              上传剧本
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-screen">
        <ProjectSidebar
          currentProject={currentProject}
          onProjectChange={handleProjectChange}
        />
        <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50">
          <div className="glass-effect rounded-2xl p-12 shadow-xl text-center">
            <div className="text-4xl mb-4 animate-pulse">⏳</div>
            <p className="text-gray-500">加载中...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 左侧边栏 */}
      <ProjectSidebar
        currentProject={currentProject}
        onProjectChange={handleProjectChange}
        onAnalyzeCharacters={() => analyzeWithStream('characters')}
        onAnalyzeScenes={() => analyzeWithStream('scenes')}
        isAnalyzing={isStreaming}
        currentAnalyzing={currentAnalyzing}
      />

      {/* 右侧主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部标题栏 */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-800">
              项目: {currentProject?.name || '未命名'}
            </h1>
            {isStreaming && (
              <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium animate-pulse">
                🔄 分析中...
              </span>
            )}
          </div>
        </div>

        {/* Tab切换 */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-2">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('characters')}
              className={`px-6 py-2 text-sm font-semibold rounded-t-lg transition-colors ${
                activeTab === 'characters'
                  ? 'bg-white text-purple-600 border-t-2 border-purple-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              角色库
            </button>
            <button
              onClick={() => setActiveTab('scenes')}
              className={`px-6 py-2 text-sm font-semibold rounded-t-lg transition-colors ${
                activeTab === 'scenes'
                  ? 'bg-white text-purple-600 border-t-2 border-purple-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              场景库
            </button>
          </div>
        </div>

        {/* 主内容区域 */}
        <div className="flex-1 overflow-hidden flex">
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

        {/* 底部终端 */}
        <div className="border-t border-gray-200 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
          <div className="flex items-center justify-between px-5 py-2 bg-gradient-to-r from-gray-800 to-gray-700 border-b border-gray-600">
            <div
              className="flex items-center gap-3 flex-1 cursor-pointer group"
              onClick={() => setAnalysisState({ terminalExpanded: !terminalExpanded })}
            >
              <span className="text-green-400 font-mono text-sm">$</span>
              <span className="text-gray-200 text-xs font-mono font-semibold">LLM / ComfyUI Output</span>
              {isStreaming && (
                <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs rounded-full animate-pulse border border-yellow-500/30">
                  streaming...
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isStreaming && (
                <button
                  onClick={stopStream}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded font-medium transition-all"
                  title="停止当前分析"
                >
                  ⏹ 停止
                </button>
              )}
              <button
                onClick={() => setAnalysisState({ terminalExpanded: !terminalExpanded })}
                className="text-gray-300 hover:text-white text-xs px-2 py-1 rounded hover:bg-gray-700 transition-all"
              >
                {terminalExpanded ? '▼' : '▲'}
              </button>
            </div>
          </div>

          {terminalExpanded && (
            <div
              ref={terminalRef}
              className="p-4 font-mono text-xs text-green-400 overflow-y-auto bg-black/20"
              style={{
                maxHeight: '200px',
                textShadow: '0 0 5px rgba(74, 222, 128, 0.5)',
              }}
            >
              {terminalOutput.length === 0 ? (
                <p className="text-gray-500 italic">$ 等待分析任务...</p>
              ) : (
                terminalOutput.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all leading-relaxed">
                    {line || '\u00A0'}
                  </div>
                ))
              )}
              {isStreaming && (
                <span className="inline-block w-1.5 h-3 bg-green-400 animate-pulse ml-1" />
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

// 角色内容区
function CharactersContent({
  characters,
  projectId
}: {
  characters: Character[]
  projectId: string
}) {
  const navigate = useNavigate()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const [editedCharacter, setEditedCharacter] = useState<Partial<Character>>({})
  const [isSaving, setIsSaving] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const selectedCharacter = characters[selectedIndex]

  const handleSelect = (index: number) => {
    setSelectedIndex(index)
    setIsEditing(false)
    setEditedCharacter({})
  }

  const handleScrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -300, behavior: 'smooth' })
    }
  }

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 300, behavior: 'smooth' })
    }
  }

  const handleEdit = () => {
    setIsEditing(true)
    setEditedCharacter({
      name: selectedCharacter.name,
      gender: selectedCharacter.gender,
      age: selectedCharacter.age,
      roleType: selectedCharacter.roleType,
      appearance: selectedCharacter.appearance,
      personality: selectedCharacter.personality,
      clothing: selectedCharacter.clothing,
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
        clothing_style: editedCharacter.clothing,
      })

      alert('保存成功！')
      setIsEditing(false)
      // 刷新页面以更新数据
      window.location.reload()
    } catch (err) {
      console.error('Save character failed:', err)
      alert('保存失败，请重试')
    } finally {
      setIsSaving(false)
    }
  }

  const updateField = (field: keyof Character, value: string) => {
    setEditedCharacter(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 左侧 Info 面板 - 显示选中角色详情 */}
      <div className="w-64 bg-white border-r border-gray-200 p-4 overflow-y-auto">
        {characters.length === 0 ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-800">Info</h3>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-gray-600 block mb-1 text-xs">角色数量</label>
                <p className="font-semibold text-gray-800">0 个</p>
              </div>
              <div>
                <label className="text-gray-600 block mb-1 text-xs">状态</label>
                <p className="font-semibold text-gray-500">待分析</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-800">
                {isEditing ? (
                  <input
                    type="text"
                    value={editedCharacter.name || ''}
                    onChange={(e) => updateField('name', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                ) : (
                  selectedCharacter.name
                )}
              </h3>
              {!isEditing && (
                <button
                  onClick={handleEdit}
                  className="text-blue-500 text-xs font-medium hover:text-blue-600"
                >
                  编辑
                </button>
              )}
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-gray-500 block mb-1">角色类型</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedCharacter.roleType || ''}
                    onChange={(e) => updateField('roleType', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded"
                  />
                ) : (
                  <p className="font-semibold text-gray-800">{selectedCharacter.roleType}</p>
                )}
              </div>
              <div>
                <label className="text-gray-500 block mb-1">性别</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedCharacter.gender || ''}
                    onChange={(e) => updateField('gender', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded"
                  />
                ) : (
                  <p className="font-semibold text-gray-800">{selectedCharacter.gender || '未知'}</p>
                )}
              </div>
              <div>
                <label className="text-gray-500 block mb-1">年龄</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedCharacter.age || ''}
                    onChange={(e) => updateField('age', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded"
                  />
                ) : (
                  <p className="font-semibold text-gray-800">{selectedCharacter.age || '未知'}</p>
                )}
              </div>
              <div>
                <label className="text-gray-500 block mb-1">外貌特征</label>
                {isEditing ? (
                  <textarea
                    value={editedCharacter.appearance || ''}
                    onChange={(e) => updateField('appearance', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded resize-none"
                    rows={3}
                  />
                ) : (
                  <p className="text-gray-700 leading-relaxed">{selectedCharacter.appearance || '暂无描述'}</p>
                )}
              </div>
              <div>
                <label className="text-gray-500 block mb-1">性格特点</label>
                {isEditing ? (
                  <textarea
                    value={editedCharacter.personality || ''}
                    onChange={(e) => updateField('personality', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded resize-none"
                    rows={3}
                  />
                ) : (
                  <p className="text-gray-700 leading-relaxed">{selectedCharacter.personality || '暂无描述'}</p>
                )}
              </div>
              <div>
                <label className="text-gray-500 block mb-1">服装风格</label>
                {isEditing ? (
                  <textarea
                    value={editedCharacter.clothing || ''}
                    onChange={(e) => updateField('clothing', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded resize-none"
                    rows={3}
                  />
                ) : (
                  <p className="text-gray-700 leading-relaxed">{selectedCharacter.clothing || '暂无描述'}</p>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-2 bg-green-500 text-white rounded-lg text-sm font-semibold hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {isSaving ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="flex-1 py-2 bg-gray-400 text-white rounded-lg text-sm font-semibold hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate(`/generation?project=${projectId}`)}
                className="w-full mt-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg text-sm font-semibold hover:from-purple-600 hover:to-indigo-600 shadow-md transition-all"
              >
                生成角色图
              </button>
            )}
          </>
        )}
      </div>

      {/* 右侧 Generated Contents - 只显示已生成的图片 */}
      <div className="flex-1 bg-gray-50 overflow-hidden flex flex-col">
        {characters.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">👤</div>
              <p>暂无角色数据</p>
              <p className="text-sm mt-2">请使用左侧边栏的"分析角色"按钮</p>
            </div>
          </div>
        ) : (
          <>
            {/* 上方：已生成的图片展示 */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6">
                <h3 className="text-lg font-bold text-gray-700 mb-4">Generated Contents</h3>

                {selectedCharacter.characterImages && selectedCharacter.characterImages.length > 0 ? (
                  <div className="grid grid-cols-2 gap-4">
                    {selectedCharacter.characterImages.map((img) => (
                      <div key={img.id} className="bg-white rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
                        <img
                          src={fileUrl.image(img.imagePath)}
                          alt={`${selectedCharacter.name} - ${img.imageType}`}
                          className="w-full aspect-square object-cover"
                        />
                        <div className="p-3">
                          <p className="text-sm font-semibold text-gray-700">{img.imageType}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(img.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 text-gray-400">
                    <div className="text-5xl mb-3">🖼️</div>
                    <p>暂无生成图片</p>
                    <p className="text-sm mt-2">点击左侧"生成角色图"按钮开始生成</p>
                  </div>
                )}
              </div>
            </div>

            {/* 下方：横向滚动选择器 - 修复遮挡问题 */}
            <div className="bg-white border-t border-gray-200 p-4 pt-6">
              <div className="mb-2 text-xs text-gray-600">
                角色列表 ({characters.length} 项) - 点击切换
              </div>
              <div className="flex items-center gap-2">
                {/* 左箭头按钮 */}
                <button
                  onClick={handleScrollLeft}
                  className="flex-shrink-0 w-10 h-10 bg-white border-2 border-gray-300 rounded-full flex items-center justify-center hover:border-purple-500 hover:bg-purple-50 transition-all shadow-sm"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                {/* 角色列表 */}
                <div ref={scrollContainerRef} className="flex-1 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {characters.map((character, index) => {
                    const avatar = character.gender?.includes('女') ? '👩' : character.gender?.includes('男') ? '👨' : '👤'
                    const bgColor = character.gender?.includes('女') ? 'from-pink-400 to-rose-400' : character.gender?.includes('男') ? 'from-blue-400 to-indigo-400' : 'from-gray-400 to-gray-500'
                    const isSelected = index === selectedIndex
                    return (
                      <div
                        key={character.id}
                        onClick={() => handleSelect(index)}
                        className={`flex-shrink-0 w-20 cursor-pointer transition-all duration-300 ${
                          isSelected ? 'scale-110 origin-bottom' : 'opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className={`relative bg-white rounded-xl p-2 border-2 ${
                          isSelected ? 'border-purple-500 shadow-lg' : 'border-gray-200'
                        }`}>
                          <div className={`w-full aspect-square bg-gradient-to-br ${bgColor} rounded-lg flex items-center justify-center text-3xl shadow-md`}>
                            {avatar}
                          </div>
                          <p className="text-xs font-bold text-gray-800 mt-1 text-center truncate">
                            {character.name}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-purple-500 rounded-full" />
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* 右箭头按钮 */}
                <button
                  onClick={handleScrollRight}
                  className="flex-shrink-0 w-10 h-10 bg-white border-2 border-gray-300 rounded-full flex items-center justify-center hover:border-purple-500 hover:bg-purple-50 transition-all shadow-sm"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// 场景内容区
function ScenesContent({
  scenes,
  projectId
}: {
  scenes: Scene[]
  projectId: string
}) {
  const navigate = useNavigate()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const selectedScene = scenes[selectedIndex]

  const handleSelect = (index: number) => {
    setSelectedIndex(index)
  }

  const handleScrollLeft = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -300, behavior: 'smooth' })
    }
  }

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 300, behavior: 'smooth' })
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 左侧 Info 面板 - 显示选中场景详情 */}
      <div className="w-64 bg-white border-r border-gray-200 p-4 overflow-y-auto">
        {scenes.length === 0 ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-800">Info</h3>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-gray-600 block mb-1 text-xs">场景数量</label>
                <p className="font-semibold text-gray-800">0 个</p>
              </div>
              <div>
                <label className="text-gray-600 block mb-1 text-xs">状态</label>
                <p className="font-semibold text-gray-500">待分析</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-800">场景 #{selectedScene.sceneNumber}</h3>
              <button className="text-blue-500 text-xs font-medium hover:text-blue-600">
                编辑
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-gray-500 block mb-1">地点</label>
                <p className="font-semibold text-gray-800">{selectedScene.location}</p>
              </div>
              <div>
                <label className="text-gray-500 block mb-1">时间</label>
                <p className="font-semibold text-gray-800">{selectedScene.timeOfDay}</p>
              </div>
              <div>
                <label className="text-gray-500 block mb-1">时长</label>
                <p className="font-semibold text-gray-800">{selectedScene.durationSeconds}秒</p>
              </div>
              <div>
                <label className="text-gray-500 block mb-1">环境描述</label>
                <p className="text-gray-700 leading-relaxed">{selectedScene.environment || '暂无描述'}</p>
              </div>
              <div>
                <label className="text-gray-500 block mb-1">镜头设置</label>
                <p className="text-gray-700 leading-relaxed">{selectedScene.cameraAngle || '暂无描述'}</p>
              </div>
              <div>
                <label className="text-gray-500 block mb-1">出场角色</label>
                <div className="flex flex-wrap gap-1">
                  {selectedScene.characters && selectedScene.characters.length > 0 ? (
                    selectedScene.characters.map((char) => (
                      <span
                        key={char.characterId}
                        className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full"
                      >
                        {char.characterName}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400">无</span>
                  )}
                </div>
              </div>
              {selectedScene.dialogues && selectedScene.dialogues.length > 0 && (
                <div>
                  <label className="text-gray-500 block mb-1">对白</label>
                  <div className="space-y-1 bg-gray-50 rounded p-2 max-h-32 overflow-y-auto">
                    {selectedScene.dialogues.map((dialogue, idx) => (
                      <div key={idx} className="text-xs">
                        <span className="font-semibold text-purple-700">{dialogue.characterName}:</span>
                        <span className="text-gray-700 ml-1">{dialogue.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 mt-4">
              <button
                onClick={() => navigate(`/generation?project=${projectId}`)}
                className="w-full py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-lg text-sm font-semibold hover:from-purple-600 hover:to-indigo-600 shadow-md transition-all"
              >
                生成场景图
              </button>
              <button
                onClick={() => navigate(`/generation?project=${projectId}`)}
                className="w-full py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg text-sm font-semibold hover:from-green-600 hover:to-emerald-600 shadow-md transition-all"
              >
                生成视频
              </button>
            </div>
          </>
        )}
      </div>

      {/* 右侧 Generated Contents - 只显示已生成的图片/视频 */}
      <div className="flex-1 bg-gray-50 overflow-hidden flex flex-col">
        {scenes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">🎬</div>
              <p>暂无场景数据</p>
              <p className="text-sm mt-2">请使用左侧边栏的"分析场景"按钮</p>
            </div>
          </div>
        ) : (
          <>
            {/* 上方：已生成的图片/视频展示 */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6">
                <h3 className="text-lg font-bold text-gray-700 mb-4">Generated Contents</h3>

                {(selectedScene.sceneImage || selectedScene.videoClips?.length > 0) ? (
                  <div className="space-y-4">
                    {/* 场景图 */}
                    {selectedScene.sceneImage && (
                      <div className="bg-white rounded-xl overflow-hidden shadow-lg">
                        <img
                          src={fileUrl.image(selectedScene.sceneImage.imagePath)}
                          alt={`场景 ${selectedScene.sceneNumber}`}
                          className="w-full aspect-video object-cover"
                        />
                        <div className="p-3">
                          <p className="text-sm font-semibold text-gray-700">场景图</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(selectedScene.sceneImage.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* 视频片段 */}
                    {selectedScene.videoClips && selectedScene.videoClips.length > 0 && (
                      <div className="grid grid-cols-2 gap-4">
                        {selectedScene.videoClips.map((video) => (
                          <div key={video.id} className="bg-white rounded-xl overflow-hidden shadow-lg">
                            <video
                              src={fileUrl.video(video.videoPath)}
                              controls
                              className="w-full aspect-video object-cover bg-black"
                            />
                            <div className="p-3">
                              <p className="text-sm font-semibold text-gray-700">视频片段</p>
                              <p className="text-xs text-gray-500 mt-1">
                                {new Date(video.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-16 text-gray-400">
                    <div className="text-5xl mb-3">🎬</div>
                    <p>暂无生成内容</p>
                    <p className="text-sm mt-2">点击左侧按钮开始生成场景图或视频</p>
                  </div>
                )}
              </div>
            </div>

            {/* 下方：横向滚动选择器 - 修复遮挡问题 */}
            <div className="bg-white border-t border-gray-200 p-4 pt-6">
              <div className="mb-2 text-xs text-gray-600">
                场景列表 ({scenes.length} 项) - 点击切换
              </div>
              <div className="flex items-center gap-2">
                {/* 左箭头按钮 */}
                <button
                  onClick={handleScrollLeft}
                  className="flex-shrink-0 w-10 h-10 bg-white border-2 border-gray-300 rounded-full flex items-center justify-center hover:border-purple-500 hover:bg-purple-50 transition-all shadow-sm"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                {/* 场景列表 */}
                <div ref={scrollContainerRef} className="flex-1 flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {scenes.map((scene, index) => {
                    const isSelected = index === selectedIndex
                    return (
                      <div
                        key={scene.id}
                        onClick={() => handleSelect(index)}
                        className={`flex-shrink-0 w-32 cursor-pointer transition-all duration-300 ${
                          isSelected ? 'scale-105 origin-bottom' : 'opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className={`relative bg-white rounded-xl overflow-hidden border-2 ${
                          isSelected ? 'border-purple-500 shadow-lg' : 'border-gray-200'
                        }`}>
                          <div className="relative h-20 bg-gradient-to-br from-slate-700 to-slate-900">
                            {scene.sceneImage?.imagePath ? (
                              <img
                                src={fileUrl.image(scene.sceneImage.imagePath)}
                                alt={`场景 ${scene.sceneNumber}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white/20 text-3xl">
                                🎬
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                            <div className="absolute top-1 left-1 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-full">
                              <span className="text-white font-bold text-xs">#{scene.sceneNumber}</span>
                            </div>
                          </div>
                          <div className="p-2 bg-white">
                            <p className="text-xs font-bold text-gray-800 truncate">{scene.location}</p>
                            <p className="text-xs text-gray-500 truncate">{scene.timeOfDay}</p>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-purple-500 rounded-full" />
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* 右箭头按钮 */}
                <button
                  onClick={handleScrollRight}
                  className="flex-shrink-0 w-10 h-10 bg-white border-2 border-gray-300 rounded-full flex items-center justify-center hover:border-purple-500 hover:bg-purple-50 transition-all shadow-sm"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
