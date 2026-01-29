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
            <span className="w-4 h-4 border-2 border-[#E4E5E7] border-t-[#F97316] rounded-full animate-spin" />
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

        {/* Tab切换 - 胶囊式按钮 */}
        <div className="bg-white border-b border-[#E4E5E7] px-6 py-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('characters')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeTab === 'characters'
                  ? 'bg-[#F97316] text-white shadow-sm'
                  : 'bg-[#F7F8F9] text-[#6B6F76] hover:bg-[#FFEDD5] hover:text-[#EA580C]'
              }`}
            >
              角色库
              {characters.length > 0 && (
                <span className={`ml-1.5 text-xs ${activeTab === 'characters' ? 'text-white/80' : 'text-[#9CA0A8]'}`}>
                  {characters.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('scenes')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeTab === 'scenes'
                  ? 'bg-[#F97316] text-white shadow-sm'
                  : 'bg-[#F7F8F9] text-[#6B6F76] hover:bg-[#FFEDD5] hover:text-[#EA580C]'
              }`}
            >
              场景库
              {scenes.length > 0 && (
                <span className={`ml-1.5 text-xs ${activeTab === 'scenes' ? 'text-white/80' : 'text-[#9CA0A8]'}`}>
                  {scenes.length}
                </span>
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
              <span className="text-[#F97316] text-xs font-mono">$</span>
              <span className="text-[#9CA0A8] text-xs font-medium">Output</span>
              {isStreaming && (
                <span className="flex items-center gap-1 text-xs text-[#F97316]">
                  <span className="w-1.5 h-1.5 bg-[#F97316] rounded-full animate-pulse" />
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
                <span className="inline-block w-1.5 h-3 bg-[#F97316] animate-pulse ml-0.5" />
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
      {/* 左侧详情面板 - 精致设计 */}
      <div className="w-80 bg-white border-r border-[#E4E5E7] overflow-y-auto">
        {characters.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 bg-[#FFF7ED] rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-[#F97316]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-[#1D1D1F] mb-1">暂无角色数据</h3>
            <p className="text-xs text-[#9CA0A8]">请先分析角色</p>
          </div>
        ) : (
          <div className="p-4 overflow-y-auto">
            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-4">
              {isEditing ? (
                <input
                  type="text"
                  value={editedCharacter.name || ''}
                  onChange={(e) => updateField('name', e.target.value)}
                  className="flex-1 px-2 py-1 border border-[#E4E5E7] rounded text-base font-semibold focus:outline-none focus:border-[#F97316]"
                />
              ) : (
                <h3 className="text-base font-semibold text-[#1D1D1F]">{selectedCharacter?.name}</h3>
              )}
              {!isEditing && (
                <button
                  onClick={handleEdit}
                  className="text-xs text-[#F97316] hover:text-[#EA580C] font-medium"
                >
                  编辑
                </button>
              )}
            </div>

            {/* 详情信息区 */}
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

            {isEditing ? (
              <div className="flex gap-2 pt-4 border-t border-[#E4E5E7]">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-[#F97316] text-white rounded-lg text-sm font-medium hover:bg-[#EA580C] disabled:opacity-50 shadow-sm"
                >
                  {isSaving ? '保存中...' : '保存修改'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-[#F7F8F9] text-[#6B6F76] rounded-lg text-sm font-medium hover:bg-[#E4E5E7] disabled:opacity-50"
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="pt-4 border-t border-[#E4E5E7] space-y-3">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="w-full py-2.5 bg-[#F97316] text-white rounded-lg text-sm font-medium hover:bg-[#EA580C] disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      生成角色图
                    </>
                  )}
                </button>

                {/* 进度条 */}
                {(isGenerating || generateMessage) && (
                  <div className="space-y-1.5">
                    <div className="h-2 bg-[#E4E5E7] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#F97316] to-[#FB923C] transition-all duration-300"
                        style={{ width: `${generateProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-[#6B6F76] text-center">{generateMessage}</p>
                  </div>
                )}
              </div>
            )}
            </div>
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

            {/* 角色选择器 - 卡片式 */}
            <div className="bg-gradient-to-t from-[#F9FAFB] to-white border-t border-[#E4E5E7] p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-[#1D1D1F]">角色列表</h4>
                <div className="flex gap-1">
                  <button
                    onClick={handleScrollLeft}
                    className="w-7 h-7 bg-white border border-[#E4E5E7] rounded-full flex items-center justify-center hover:border-[#F97316] hover:text-[#F97316] shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={handleScrollRight}
                    className="w-7 h-7 bg-white border border-[#E4E5E7] rounded-full flex items-center justify-center hover:border-[#F97316] hover:text-[#F97316] shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              <div ref={scrollContainerRef} className="flex gap-2 overflow-x-auto scrollbar-hide py-1 items-stretch">
                {characters.map((character, index) => {
                  const isSelected = index === selectedIndex
                  const isFemale = character.gender?.includes('女')
                  const isMale = character.gender?.includes('男')

                  // 性别对应的颜色
                  const getBgColor = () => {
                    if (isSelected) return '#F97316'
                    if (isFemale) return '#FDF2F8'
                    if (isMale) return '#EFF6FF'
                    return '#F7F8F9'
                  }
                  const getTextColor = () => {
                    if (isSelected) return 'white'
                    if (isFemale) return '#BE185D'
                    if (isMale) return '#1D4ED8'
                    return '#6B7280'
                  }

                  return (
                    <button
                      key={character.id}
                      onClick={() => handleSelect(index)}
                      className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        background: getBgColor(),
                        color: getTextColor(),
                      }}
                    >
                      {character.name}
                    </button>
                  )
                })}
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
      {/* 左侧详情面板 - 精致设计 */}
      <div className="w-80 bg-white border-r border-[#E4E5E7] overflow-y-auto">
        {scenes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 bg-[#FFF7ED] rounded-2xl flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-[#F97316]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-[#1D1D1F] mb-1">暂无场景数据</h3>
            <p className="text-xs text-[#9CA0A8]">请先分析场景</p>
          </div>
        ) : (
          <div className="p-4 overflow-y-auto">
            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-[#1D1D1F]">
                场景 #{selectedScene?.sceneNumber}
              </h3>
              <span className="text-xs text-[#9CA0A8]">{selectedScene?.timeOfDay}</span>
            </div>

            {/* 详情信息区 */}
            <div className="space-y-4 text-sm">
              <Field label="地点" value={selectedScene?.location} />
              {selectedScene?.durationSeconds && (
                <Field label="时长" value={`${selectedScene.durationSeconds}秒`} />
              )}
              <Field label="环境" value={selectedScene?.environment} multiline />
              <Field label="镜头" value={selectedScene?.cameraAngle} />

              {selectedScene?.characters && selectedScene.characters.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-[#6B6F76] block mb-2">出场角色</label>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedScene.characters.map((char) => (
                      <span
                        key={char.characterId}
                        className="px-2.5 py-1 bg-[#FFF7ED] text-[#F97316] text-xs rounded-full font-medium"
                      >
                        {char.characterName}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedScene?.dialogues && selectedScene.dialogues.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-[#6B6F76] block mb-2">对白</label>
                  <div className="bg-[#F7F8F9] rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                    {selectedScene.dialogues.map((dialogue, idx) => (
                      <div key={idx} className="text-xs">
                        <span className="font-semibold text-[#F97316]">{dialogue.characterName}</span>
                        <p className="text-[#1D1D1F] mt-0.5 pl-2 border-l-2 border-[#FFEDD5]">{dialogue.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="pt-4 border-t border-[#E4E5E7] space-y-2">
                <button
                  onClick={() => navigate(`/generation?project=${projectId}`)}
                  className="w-full py-2.5 bg-[#F97316] text-white rounded-lg text-sm font-medium hover:bg-[#EA580C] shadow-sm flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  生成场景图
                </button>
                <button
                  onClick={() => navigate(`/generation?project=${projectId}`)}
                  className="w-full py-2.5 bg-white text-[#1D1D1F] border border-[#E4E5E7] rounded-lg text-sm font-medium hover:border-[#F97316] hover:text-[#F97316] flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  生成视频
                </button>
              </div>
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

            {/* 场景选择器 - 卡片式 */}
            <div className="bg-gradient-to-t from-[#F9FAFB] to-white border-t border-[#E4E5E7] p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-[#1D1D1F]">场景列表</h4>
                <div className="flex gap-1">
                  <button
                    onClick={handleScrollLeft}
                    className="w-7 h-7 bg-white border border-[#E4E5E7] rounded-full flex items-center justify-center hover:border-[#F97316] hover:text-[#F97316] shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={handleScrollRight}
                    className="w-7 h-7 bg-white border border-[#E4E5E7] rounded-full flex items-center justify-center hover:border-[#F97316] hover:text-[#F97316] shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>

              <div ref={scrollContainerRef} className="flex gap-2 overflow-x-auto scrollbar-hide py-1 items-stretch">
                {scenes.map((scene, index) => {
                  const isSelected = index === selectedIndex

                  return (
                    <button
                      key={scene.id}
                      onClick={() => handleSelect(index)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isSelected
                          ? 'bg-[#F97316] text-white'
                          : 'bg-[#FFF7ED] text-[#EA580C] hover:bg-[#FFEDD5]'
                      }`}
                    >
                      #{scene.sceneNumber} {scene.location || '未知'}
                    </button>
                  )
                })}
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
            className="w-full px-2 py-1.5 border border-[#E4E5E7] rounded-md text-sm resize-none focus:outline-none focus:border-[#F97316]"
            rows={3}
          />
        ) : (
          <input
            type="text"
            value={editValue || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-2 py-1.5 border border-[#E4E5E7] rounded-md text-sm focus:outline-none focus:border-[#F97316]"
          />
        )
      ) : (
        <p className="text-sm text-[#1D1D1F] leading-relaxed">{value || '—'}</p>
      )}
    </div>
  )
}
