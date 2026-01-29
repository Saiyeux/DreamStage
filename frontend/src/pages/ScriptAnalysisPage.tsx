import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Character, Scene } from '@/types'
import { projectsApi, analysisApi, charactersApi, generationApi } from '@/api'
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
  } = useProjectStore()

  const projectId = urlProjectId || currentProject?.id

  const [activeTab, setActiveTab] = useState<Tab>('characters')
  const [loading, setLoading] = useState(false)

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
      appendTerminalOutput(`[${new Date().toLocaleTimeString()}] 检测到连接中断，已重置状态`)
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

  const handleProjectChange = (newProjectId: string) => {
    if (newProjectId && newProjectId !== projectId) {
      setSearchParams({ project: newProjectId })
    }
  }

  // 无项目时的空状态
  if (!projectId) {
    return (
      <div className="flex h-screen bg-[#FBFBFC]">
        <ProjectSidebar
          currentProject={null}
          onProjectChange={handleProjectChange}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="w-12 h-12 bg-[#F7F8F9] rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[#9CA0A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-base font-medium text-[#1D1D1F] mb-1">请先上传剧本</h2>
            <p className="text-sm text-[#6B6F76]">上传剧本后，系统将自动分析角色和分镜</p>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-screen bg-[#FBFBFC]">
        <ProjectSidebar
          currentProject={currentProject}
          onProjectChange={handleProjectChange}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-[#6B6F76]">
            <span className="w-4 h-4 border-2 border-[#E4E5E7] border-t-[#5E6AD2] rounded-full animate-spin" />
            <span className="text-sm">加载中...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#FBFBFC]">
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
        <div className="bg-white border-b border-[#E4E5E7] px-6 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-medium text-[#1D1D1F]">
              {currentProject?.name || '未命名项目'}
            </h1>
            {isStreaming && (
              <span className="tag primary animate-pulse-subtle">
                分析中
              </span>
            )}
          </div>
        </div>

        {/* Tab切换 */}
        <div className="bg-white border-b border-[#E4E5E7] px-6">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('characters')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'characters'
                  ? 'text-[#5E6AD2] border-[#5E6AD2]'
                  : 'text-[#6B6F76] border-transparent hover:text-[#1D1D1F]'
              }`}
            >
              角色库
              {characters.length > 0 && (
                <span className="ml-1.5 text-xs text-[#9CA0A8]">{characters.length}</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('scenes')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'scenes'
                  ? 'text-[#5E6AD2] border-[#5E6AD2]'
                  : 'text-[#6B6F76] border-transparent hover:text-[#1D1D1F]'
              }`}
            >
              场景库
              {scenes.length > 0 && (
                <span className="ml-1.5 text-xs text-[#9CA0A8]">{scenes.length}</span>
              )}
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
        <div className="border-t border-[#E4E5E7] bg-[#1D1D1F]">
          <div
            className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-white/5"
            onClick={() => setAnalysisState({ terminalExpanded: !terminalExpanded })}
          >
            <div className="flex items-center gap-2">
              <span className="text-[#5E6AD2] text-xs font-mono">$</span>
              <span className="text-[#9CA0A8] text-xs font-medium">Output</span>
              {isStreaming && (
                <span className="flex items-center gap-1 text-xs text-[#5E6AD2]">
                  <span className="w-1.5 h-1.5 bg-[#5E6AD2] rounded-full animate-pulse" />
                  streaming
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isStreaming && (
                <button
                  onClick={(e) => { e.stopPropagation(); stopStream(); }}
                  className="px-2 py-1 bg-[#EF4444] text-white text-xs rounded font-medium hover:bg-[#DC2626]"
                >
                  停止
                </button>
              )}
              <svg
                className={`w-4 h-4 text-[#6B6F76] transition-transform ${terminalExpanded ? '' : 'rotate-180'}`}
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
              className="px-4 py-3 font-mono text-xs text-[#9CA0A8] overflow-y-auto bg-[#161618]"
              style={{ maxHeight: '160px' }}
            >
              {terminalOutput.length === 0 ? (
                <p className="text-[#6B6F76]">等待任务...</p>
              ) : (
                terminalOutput.map((line, i) => (
                  <div key={i} className="whitespace-pre-wrap break-all leading-relaxed">
                    {line || '\u00A0'}
                  </div>
                ))
              )}
              {isStreaming && (
                <span className="inline-block w-1.5 h-3 bg-[#5E6AD2] animate-pulse ml-0.5" />
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
  const { setCharacters } = useProjectStore()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isEditing, setIsEditing] = useState(false)
  const [editedCharacter, setEditedCharacter] = useState<Partial<Character>>({})
  const [isSaving, setIsSaving] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const selectedCharacter = characters[selectedIndex]

  // 生成相关状态
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateProgress, setGenerateProgress] = useState(0)
  const [generateMessage, setGenerateMessage] = useState('')
  const pollingRef = useRef<number | null>(null)

  const handleSelect = (index: number) => {
    setSelectedIndex(index)
    setIsEditing(false)
    setEditedCharacter({})
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

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  // 生成角色图
  const handleGenerate = async () => {
    if (!selectedCharacter?.id || isGenerating) return

    setIsGenerating(true)
    setGenerateProgress(0)
    setGenerateMessage('正在启动生成任务...')

    try {
      // 调用生成 API，生成 front 类型的图片
      const response = await generationApi.generateCharacterImages(
        projectId,
        selectedCharacter.id,
        ['front']
      )

      const taskId = response.task_id
      setGenerateMessage('生成中...')

      // 轮询任务状态
      pollingRef.current = window.setInterval(async () => {
        try {
          const status = await generationApi.getTaskStatus(taskId)
          setGenerateProgress(status.progress)
          setGenerateMessage(status.message || '生成中...')

          if (status.status === 'completed') {
            if (pollingRef.current) {
              clearInterval(pollingRef.current)
              pollingRef.current = null
            }
            setIsGenerating(false)
            setGenerateMessage('生成完成！')

            // 刷新角色数据
            const updatedCharacters = await analysisApi.getCharacters(projectId)
            setCharacters(updatedCharacters)

            setTimeout(() => {
              setGenerateMessage('')
              setGenerateProgress(0)
            }, 2000)
          } else if (status.status === 'failed') {
            if (pollingRef.current) {
              clearInterval(pollingRef.current)
              pollingRef.current = null
            }
            setIsGenerating(false)
            setGenerateMessage(`生成失败: ${status.error || '未知错误'}`)
          }
        } catch (err) {
          console.error('Poll status failed:', err)
        }
      }, 1000)
    } catch (err) {
      console.error('Generate failed:', err)
      setIsGenerating(false)
      setGenerateMessage('启动生成任务失败')
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 左侧详情面板 */}
      <div className="w-72 bg-white border-r border-[#E4E5E7] overflow-y-auto">
        {characters.length === 0 ? (
          <div className="p-4">
            <h3 className="text-sm font-medium text-[#1D1D1F] mb-3">详情</h3>
            <div className="text-sm text-[#6B6F76]">
              <p>暂无角色数据</p>
              <p className="text-xs mt-1 text-[#9CA0A8]">请先分析角色</p>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-[#1D1D1F]">
                {isEditing ? (
                  <input
                    type="text"
                    value={editedCharacter.name || ''}
                    onChange={(e) => updateField('name', e.target.value)}
                    className="w-full px-2 py-1 border border-[#E4E5E7] rounded text-sm focus:outline-none focus:border-[#5E6AD2]"
                  />
                ) : (
                  selectedCharacter?.name
                )}
              </h3>
              {!isEditing && (
                <button
                  onClick={handleEdit}
                  className="text-xs text-[#5E6AD2] hover:text-[#4F5BC7] font-medium"
                >
                  编辑
                </button>
              )}
            </div>

            <div className="space-y-4 text-sm">
              <Field
                label="类型"
                value={selectedCharacter?.roleType}
                isEditing={isEditing}
                editValue={editedCharacter.roleType}
                onChange={(v) => updateField('roleType', v)}
              />
              <Field
                label="性别"
                value={selectedCharacter?.gender}
                isEditing={isEditing}
                editValue={editedCharacter.gender}
                onChange={(v) => updateField('gender', v)}
              />
              <Field
                label="年龄"
                value={selectedCharacter?.age}
                isEditing={isEditing}
                editValue={editedCharacter.age}
                onChange={(v) => updateField('age', v)}
              />
              <Field
                label="外貌"
                value={selectedCharacter?.appearance}
                isEditing={isEditing}
                editValue={editedCharacter.appearance}
                onChange={(v) => updateField('appearance', v)}
                multiline
              />
              <Field
                label="性格"
                value={selectedCharacter?.personality}
                isEditing={isEditing}
                editValue={editedCharacter.personality}
                onChange={(v) => updateField('personality', v)}
                multiline
              />
              <Field
                label="服装"
                value={selectedCharacter?.clothing}
                isEditing={isEditing}
                editValue={editedCharacter.clothing}
                onChange={(v) => updateField('clothing', v)}
                multiline
              />
            </div>

            {isEditing ? (
              <div className="flex gap-2 mt-6">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-2 bg-[#5E6AD2] text-white rounded-md text-xs font-medium hover:bg-[#4F5BC7] disabled:opacity-50"
                >
                  {isSaving ? '保存中...' : '保存'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="flex-1 py-2 bg-[#F7F8F9] text-[#6B6F76] rounded-md text-xs font-medium hover:bg-[#E4E5E7] disabled:opacity-50"
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-2">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="w-full py-2 bg-[#5E6AD2] text-white rounded-md text-xs font-medium hover:bg-[#4F5BC7] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      生成中...
                    </span>
                  ) : '生成角色图'}
                </button>

                {/* 进度条 */}
                {(isGenerating || generateMessage) && (
                  <div className="space-y-1">
                    <div className="h-1.5 bg-[#E4E5E7] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#5E6AD2] transition-all duration-300"
                        style={{ width: `${generateProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-[#6B6F76]">{generateMessage}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 bg-[#FBFBFC] overflow-hidden flex flex-col">
        {characters.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 bg-[#F7F8F9] rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-[#9CA0A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <p className="text-sm text-[#6B6F76]">暂无角色数据</p>
              <p className="text-xs text-[#9CA0A8] mt-1">使用左侧"分析角色"按钮开始</p>
            </div>
          </div>
        ) : (
          <>
            {/* 生成的图片 */}
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-sm font-medium text-[#1D1D1F] mb-4">生成内容</h3>
              {selectedCharacter?.characterImages && selectedCharacter.characterImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {selectedCharacter.characterImages.map((img) => (
                    <div key={img.id} className="card overflow-hidden">
                      <img
                        src={fileUrl.image(img.imagePath)}
                        alt={`${selectedCharacter.name} - ${img.imageType}`}
                        className="w-full aspect-square object-cover"
                      />
                      <div className="p-3">
                        <p className="text-sm font-medium text-[#1D1D1F]">{img.imageType}</p>
                        <p className="text-xs text-[#9CA0A8] mt-0.5">
                          {new Date(img.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-12 h-12 bg-[#F7F8F9] rounded-lg flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-[#9CA0A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-[#6B6F76]">暂无生成图片</p>
                  <p className="text-xs text-[#9CA0A8] mt-1">点击"生成角色图"开始</p>
                </div>
              )}
            </div>

            {/* 角色选择器 */}
            <div className="bg-white border-t border-[#E4E5E7] p-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleScrollLeft}
                  className="flex-shrink-0 w-8 h-8 bg-white border border-[#E4E5E7] rounded-md flex items-center justify-center hover:border-[#5E6AD2] hover:text-[#5E6AD2]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <div ref={scrollContainerRef} className="flex-1 flex gap-2 overflow-x-auto scrollbar-hide py-1">
                  {characters.map((character, index) => {
                    const isSelected = index === selectedIndex
                    const isFemale = character.gender?.includes('女')
                    const isMale = character.gender?.includes('男')

                    // 根据性别设置颜色
                    const getColors = () => {
                      if (isSelected) {
                        if (isFemale) return 'bg-[#E11D48] text-white'
                        if (isMale) return 'bg-[#2563EB] text-white'
                        return 'bg-[#5E6AD2] text-white'
                      }
                      if (isFemale) return 'bg-[#FFF1F2] text-[#BE123C] hover:bg-[#FFE4E6]'
                      if (isMale) return 'bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#DBEAFE]'
                      return 'bg-[#F7F8F9] text-[#6B6F76] hover:bg-[#E4E5E7]'
                    }

                    return (
                      <button
                        key={character.id}
                        onClick={() => handleSelect(index)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${getColors()}`}
                      >
                        {character.name}
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={handleScrollRight}
                  className="flex-shrink-0 w-8 h-8 bg-white border border-[#E4E5E7] rounded-md flex items-center justify-center hover:border-[#5E6AD2] hover:text-[#5E6AD2]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' })
    }
  }

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' })
    }
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 左侧详情面板 */}
      <div className="w-72 bg-white border-r border-[#E4E5E7] overflow-y-auto">
        {scenes.length === 0 ? (
          <div className="p-4">
            <h3 className="text-sm font-medium text-[#1D1D1F] mb-3">详情</h3>
            <div className="text-sm text-[#6B6F76]">
              <p>暂无场景数据</p>
              <p className="text-xs mt-1 text-[#9CA0A8]">请先分析场景</p>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-[#1D1D1F]">
                场景 #{selectedScene?.sceneNumber}
              </h3>
            </div>

            <div className="space-y-4 text-sm">
              <Field label="地点" value={selectedScene?.location} />
              <Field label="时间" value={selectedScene?.timeOfDay} />
              <Field label="时长" value={selectedScene?.durationSeconds ? `${selectedScene.durationSeconds}秒` : undefined} />
              <Field label="环境" value={selectedScene?.environment} multiline />
              <Field label="镜头" value={selectedScene?.cameraAngle} />

              {selectedScene?.characters && selectedScene.characters.length > 0 && (
                <div>
                  <label className="text-xs text-[#6B6F76] block mb-1.5">出场角色</label>
                  <div className="flex flex-wrap gap-1">
                    {selectedScene.characters.map((char) => (
                      <span
                        key={char.characterId}
                        className="tag primary"
                      >
                        {char.characterName}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedScene?.dialogues && selectedScene.dialogues.length > 0 && (
                <div>
                  <label className="text-xs text-[#6B6F76] block mb-1.5">对白</label>
                  <div className="bg-[#F7F8F9] rounded-md p-2.5 max-h-32 overflow-y-auto space-y-1.5">
                    {selectedScene.dialogues.map((dialogue, idx) => (
                      <div key={idx} className="text-xs">
                        <span className="font-medium text-[#5E6AD2]">{dialogue.characterName}:</span>
                        <span className="text-[#1D1D1F] ml-1">{dialogue.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 mt-6">
              <button
                onClick={() => navigate(`/generation?project=${projectId}`)}
                className="w-full py-2 bg-[#5E6AD2] text-white rounded-md text-xs font-medium hover:bg-[#4F5BC7]"
              >
                生成场景图
              </button>
              <button
                onClick={() => navigate(`/generation?project=${projectId}`)}
                className="w-full py-2 bg-white text-[#1D1D1F] border border-[#E4E5E7] rounded-md text-xs font-medium hover:border-[#5E6AD2] hover:text-[#5E6AD2]"
              >
                生成视频
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 右侧内容区 */}
      <div className="flex-1 bg-[#FBFBFC] overflow-hidden flex flex-col">
        {scenes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-12 h-12 bg-[#F7F8F9] rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-[#9CA0A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm text-[#6B6F76]">暂无场景数据</p>
              <p className="text-xs text-[#9CA0A8] mt-1">使用左侧"分析场景"按钮开始</p>
            </div>
          </div>
        ) : (
          <>
            {/* 生成的内容 */}
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-sm font-medium text-[#1D1D1F] mb-4">生成内容</h3>
              {(selectedScene?.sceneImage || (selectedScene?.videoClips && selectedScene.videoClips.length > 0)) ? (
                <div className="space-y-4">
                  {selectedScene.sceneImage && (
                    <div className="card overflow-hidden">
                      <img
                        src={fileUrl.image(selectedScene.sceneImage.imagePath)}
                        alt={`场景 ${selectedScene.sceneNumber}`}
                        className="w-full aspect-video object-cover"
                      />
                      <div className="p-3">
                        <p className="text-sm font-medium text-[#1D1D1F]">场景图</p>
                        <p className="text-xs text-[#9CA0A8] mt-0.5">
                          {new Date(selectedScene.sceneImage.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedScene.videoClips && selectedScene.videoClips.length > 0 && (
                    <div className="grid grid-cols-2 gap-4">
                      {selectedScene.videoClips.map((video) => (
                        <div key={video.id} className="card overflow-hidden">
                          <video
                            src={fileUrl.video(video.videoPath)}
                            controls
                            className="w-full aspect-video object-cover bg-black"
                          />
                          <div className="p-3">
                            <p className="text-sm font-medium text-[#1D1D1F]">视频片段</p>
                            <p className="text-xs text-[#9CA0A8] mt-0.5">
                              {new Date(video.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-12 h-12 bg-[#F7F8F9] rounded-lg flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-[#9CA0A8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-[#6B6F76]">暂无生成内容</p>
                  <p className="text-xs text-[#9CA0A8] mt-1">点击左侧按钮开始生成</p>
                </div>
              )}
            </div>

            {/* 场景选择器 */}
            <div className="bg-white border-t border-[#E4E5E7] p-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleScrollLeft}
                  className="flex-shrink-0 w-8 h-8 bg-white border border-[#E4E5E7] rounded-md flex items-center justify-center hover:border-[#5E6AD2] hover:text-[#5E6AD2]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <div ref={scrollContainerRef} className="flex-1 flex gap-2 overflow-x-auto scrollbar-hide py-1">
                  {scenes.map((scene, index) => {
                    const isSelected = index === selectedIndex
                    return (
                      <button
                        key={scene.id}
                        onClick={() => handleSelect(index)}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-[#5E6AD2] text-white'
                            : 'bg-[#F7F8F9] text-[#6B6F76] hover:bg-[#E4E5E7] hover:text-[#1D1D1F]'
                        }`}
                      >
                        #{scene.sceneNumber} {scene.location}
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={handleScrollRight}
                  className="flex-shrink-0 w-8 h-8 bg-white border border-[#E4E5E7] rounded-md flex items-center justify-center hover:border-[#5E6AD2] hover:text-[#5E6AD2]"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

// 字段组件
function Field({
  label,
  value,
  isEditing,
  editValue,
  onChange,
  multiline
}: {
  label: string
  value?: string
  isEditing?: boolean
  editValue?: string
  onChange?: (v: string) => void
  multiline?: boolean
}) {
  return (
    <div>
      <label className="text-xs text-[#6B6F76] block mb-1">{label}</label>
      {isEditing && onChange ? (
        multiline ? (
          <textarea
            value={editValue || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-2 py-1.5 border border-[#E4E5E7] rounded-md text-sm resize-none focus:outline-none focus:border-[#5E6AD2]"
            rows={3}
          />
        ) : (
          <input
            type="text"
            value={editValue || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-2 py-1.5 border border-[#E4E5E7] rounded-md text-sm focus:outline-none focus:border-[#5E6AD2]"
          />
        )
      ) : (
        <p className="text-sm text-[#1D1D1F] leading-relaxed">{value || '—'}</p>
      )}
    </div>
  )
}
