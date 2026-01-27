import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Character, Scene } from '@/types'
import { projectsApi, analysisApi } from '@/api'
import { useProjectStore } from '@/stores/projectStore'
import { analysisService } from '@/services/analysisService'
import { CharacterShowcase } from '@/components/CharacterShowcase'
import { SceneShowcase } from '@/components/SceneShowcase'
import { fileUrl } from '@/api/client'

type Tab = 'characters' | 'scenes'

export function ScriptAnalysisPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
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
  const [selectedCharacterIndex, setSelectedCharacterIndex] = useState<number | null>(null)
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    // 检查是否有正在进行的分析（由 analysisService 管理）
    if (analysisService.isAnalyzing()) {
      // 分析正在进行，更新回调以恢复接收数据
      const analysisType = analysisService.getCurrentAnalysisType()
      if (analysisType && projectId) {
        analysisService.updateCallbacks(createAnalysisCallbacks(analysisType))
      }
    } else if (isStreaming) {
      // store 显示正在分析，但 service 没有连接（页面刷新导致）
      appendTerminalOutput('')
      appendTerminalOutput(`[${new Date().toLocaleTimeString()}] 检测到连接中断，已重置状态`)
      setAnalysisState({
        isStreaming: false,
        currentAnalyzing: null
      })
    }
  }, [projectId]) // 仅在 projectId 变化或首次加载时执行

  // 加载项目和数据
  useEffect(() => {
    if (!projectId) return

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        // 始终从后端刷新项目状态
        const projectData = await projectsApi.get(projectId)
        setCurrentProject(projectData)

        const [charactersData, scenesData] = await Promise.all([
          analysisApi.getCharacters(projectId).catch(() => []),
          analysisApi.getScenes(projectId).catch(() => []),
        ])
        console.log('[DEBUG] 加载的角色数据:', charactersData.length, '个')
        console.log('[DEBUG] 加载的场景数据:', scenesData.length, '个')
        if (scenesData.length > 0) {
          console.log('[DEBUG] 场景编号范围:', scenesData.map(s => s.sceneNumber))
          console.log('[DEBUG] 第一个场景:', scenesData[0])
        }
        setCharacters(charactersData)
        setScenes(scenesData)
      } catch (err) {
        setError('加载项目失败')
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

      // 重新加载数据 (数据已在后端保存)
      if (projectId) {
        try {
          if (analysisType === 'characters') {
            console.log('[DEBUG] 重新加载角色数据...')
            const data = await analysisApi.getCharacters(projectId)
            console.log('[DEBUG] 加载到', data.length, '个角色')
            setCharacters(data)
          } else {
            console.log('[DEBUG] 重新加载场景数据...')
            const data = await analysisApi.getScenes(projectId)
            console.log('[DEBUG] 加载到', data.length, '个场景')
            if (data.length > 0) {
              console.log('[DEBUG] 场景编号:', data.map(s => s.sceneNumber))
              console.log('[DEBUG] 第一个场景:', data[0])
            }
            setScenes(data)
          }
        } catch (err) {
          console.error('Reload data failed:', err)
          appendTerminalOutput(`[错误] 加载数据失败: ${err}`)
        }
      }

      console.log('[DEBUG] 开始刷新项目状态...')
      await refreshProjectStatus()
      console.log('[DEBUG] 刷新完成')
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

    // 如果已有分析任务在进行，不允许启动新任务
    if (isStreaming || analysisService.isAnalyzing()) return

    // 更新状态
    setAnalysisState({
      isStreaming: true,
      terminalExpanded: true,
      currentAnalyzing: analysisType,
    })
    setError(null)

    const typeName = analysisType === 'characters' ? '角色' : '场景'
    setAnalysisState({
      terminalOutput: [
        `> 开始分析${typeName}...`,
        `[${new Date().toLocaleTimeString()}] 连接 LLM 服务...`,
        '',
      ],
    })

    // 启动分析服务
    const callbacks = createAnalysisCallbacks(analysisType)
    analysisService.start(projectId, analysisType, callbacks)
  }

  // 无项目时的空状态
  if (!projectId) {
    return (
      <div className="bg-white rounded-xl p-12 shadow-sm text-center">
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-effect rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
              📊 剧本分析
            </h2>
            <p className="text-sm text-gray-600 mt-2">
              项目: <span className="font-semibold text-gray-800">{currentProject?.name || '未命名'}</span>
              {isStreaming && (
                <span className="ml-3 px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium animate-pulse">
                  🔄 分析中...
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => navigate(`/generation?project=${projectId}`)}
            disabled={characters.length === 0}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-semibold hover:from-green-600 hover:to-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
          >
            前往生成中心 →
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl">
          {error}
        </div>
      )}

      {/* LLM Terminal */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-700">
        <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-r from-gray-800 to-gray-700 border-b border-gray-600">
          <div
            className="flex items-center gap-3 flex-1 cursor-pointer group"
            onClick={() => setAnalysisState({ terminalExpanded: !terminalExpanded })}
          >
            <span className="text-green-400 font-mono text-lg group-hover:scale-110 transition-transform">$</span>
            <span className="text-gray-200 text-sm font-mono font-semibold">LLM Output</span>
            {isStreaming && (
              <span className="px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs rounded-full animate-pulse font-medium border border-yellow-500/30">
                streaming...
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isStreaming && (
              <button
                onClick={stopStream}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg font-medium transition-all duration-300 hover:shadow-lg hover:scale-105"
                title="停止当前分析"
              >
                ⏹ 停止
              </button>
            )}
            <button
              onClick={() => setAnalysisState({ terminalExpanded: !terminalExpanded })}
              className="text-gray-300 hover:text-white text-sm font-medium hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-all duration-300"
            >
              {terminalExpanded ? '▼ 收起' : '▲ 展开'}
            </button>
          </div>
        </div>

        {terminalExpanded && (
          <div
            ref={terminalRef}
            className="p-5 font-mono text-sm text-green-400 max-h-64 overflow-y-auto bg-black/20"
            style={{
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
              <span className="inline-block w-2 h-4 bg-green-400 animate-pulse ml-1 shadow-lg" style={{
                boxShadow: '0 0 10px rgba(74, 222, 128, 0.8)',
              }} />
            )}
          </div>
        )}
      </div>

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
                <span className="text-lg">👤</span>
                <span>角色信息</span>
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
                <span className="text-lg">🎬</span>
                <span>分镜信息</span>
              </span>
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'characters' ? (
            <CharactersTab
              characters={characters}
              onSelect={(index) => setSelectedCharacterIndex(index)}
              onAnalyze={() => analyzeWithStream('characters')}
              isAnalyzing={currentAnalyzing === 'characters'}
              isWaiting={currentAnalyzing === 'scenes'}
            />
          ) : (
            <ScenesTab
              scenes={scenes}
              onSelect={(index) => setSelectedSceneIndex(index)}
              onAnalyze={() => analyzeWithStream('scenes')}
              isAnalyzing={currentAnalyzing === 'scenes'}
              isWaiting={currentAnalyzing === 'characters'}
            />
          )}
        </div>
      </div>

      {/* Character Showcase - 原神风格全屏展示 */}
      {selectedCharacterIndex !== null && characters.length > 0 && (
        <CharacterShowcase
          characters={characters}
          initialIndex={selectedCharacterIndex}
          onClose={() => setSelectedCharacterIndex(null)}
          onGenerate={(characterId) => {
            console.log('生成角色图:', characterId)
            // TODO: 调用生成API
            alert('生成角色图功能即将实现！\n角色ID: ' + characterId)
          }}
          onUpdate={(characterId, updates) => {
            console.log('更新角色信息:', characterId, updates)
            // TODO: 调用更新API
            alert('保存成功！\n(实际保存功能即将实现)')
          }}
        />
      )}

      {/* Scene Showcase - 原神风格全屏展示 */}
      {selectedSceneIndex !== null && scenes.length > 0 && (
        <SceneShowcase
          scenes={scenes}
          initialIndex={selectedSceneIndex}
          onClose={() => setSelectedSceneIndex(null)}
        />
      )}
    </div>
  )
}

function CharactersTab({
  characters,
  onSelect,
  onAnalyze,
  isAnalyzing,
  isWaiting,
}: {
  characters: Character[]
  onSelect: (index: number) => void
  onAnalyze: () => void
  isAnalyzing: boolean
  isWaiting: boolean
}) {
  const disabled = isAnalyzing || isWaiting
  const buttonText = isAnalyzing ? '角色分析中...' : isWaiting ? '等待分镜分析完成...' : '🔍 开始分析角色'
  const reanalyzeText = isAnalyzing ? '角色分析中...' : isWaiting ? '等待中...' : '🔄 重新分析'

  if (characters.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">👤</div>
        <p className="text-gray-500 mb-4">暂无角色信息</p>
        <p className="text-sm text-gray-400 mb-6">点击下方按钮开始分析剧本中的角色</p>
        <button
          onClick={onAnalyze}
          disabled={disabled}
          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
        >
          {buttonText}
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-600">
          ✅ 已完成 (识别到 {characters.length} 个角色)
        </p>
        <button
          onClick={onAnalyze}
          disabled={disabled}
          className="text-sm font-medium text-purple-600 hover:text-indigo-600 disabled:opacity-50 bg-purple-50 px-4 py-2 rounded-lg hover:bg-purple-100 transition-all duration-300"
        >
          {reanalyzeText}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {characters.map((character, index) => {
          const avatar = character.gender?.includes('女') ? '👩' : character.gender?.includes('男') ? '👨' : '👤'
          const bgColor = character.gender?.includes('女') ? 'from-pink-400 to-rose-400' : character.gender?.includes('男') ? 'from-blue-400 to-indigo-400' : 'from-gray-400 to-gray-500'
          return (
          <div
            key={character.id}
            onClick={() => onSelect(index)}
            className="group glass-effect rounded-xl p-4 text-center cursor-pointer hover:shadow-2xl transition-all duration-300 hover:scale-105 border-2 border-transparent hover:border-purple-200"
          >
            <div className={`w-20 h-20 bg-gradient-to-br ${bgColor} rounded-full mx-auto mb-3 flex items-center justify-center text-3xl shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110`}>
              {avatar}
            </div>
            <p className="font-bold text-gray-800 mb-1">{character.name}</p>
            <p className="text-xs text-gray-600 mb-2 bg-gray-100 px-2 py-1 rounded-full">{character.roleType}</p>
            <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
              <span>📍</span>
              <span>出场: {character.sceneNumbers?.length || 0}</span>
            </p>
            <button className="mt-3 text-xs text-purple-600 font-medium bg-purple-50 px-3 py-1 rounded-full hover:bg-purple-100 transition-colors">
              查看详情 →
            </button>
          </div>
        )})}
      </div>

      <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl text-sm border-l-4 border-blue-500">
        <p className="text-blue-800 font-medium">💡 提示: 点击角色卡片查看详情并编辑，完成后可前往生成中心</p>
      </div>
    </div>
  )
}

function ScenesTab({
  scenes,
  onSelect,
  onAnalyze,
  isAnalyzing,
  isWaiting,
}: {
  scenes: Scene[]
  onSelect: (index: number) => void
  onAnalyze: () => void
  isAnalyzing: boolean
  isWaiting: boolean
}) {
  const disabled = isAnalyzing || isWaiting
  const buttonText = isAnalyzing ? '分镜分析中...' : isWaiting ? '等待角色分析完成...' : '🔍 开始分析分镜'
  const reanalyzeText = isAnalyzing ? '分镜分析中...' : isWaiting ? '等待中...' : '🔄 重新分析'

  if (scenes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🎬</div>
        <p className="text-gray-500 mb-4">暂无分镜信息</p>
        <p className="text-sm text-gray-400 mb-6">点击下方按钮开始分析剧本中的分镜</p>
        <button
          onClick={onAnalyze}
          disabled={disabled}
          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
        >
          {buttonText}
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-600">
          ✅ 已完成 (共 {scenes.length} 个场景)
        </p>
        <button
          onClick={onAnalyze}
          disabled={disabled}
          className="text-sm font-medium text-purple-600 hover:text-indigo-600 disabled:opacity-50 bg-purple-50 px-4 py-2 rounded-lg hover:bg-purple-100 transition-all duration-300"
        >
          {reanalyzeText}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scenes.map((scene, index) => (
          <div
            key={scene.id}
            onClick={() => onSelect(index)}
            className="group glass-effect rounded-xl overflow-hidden cursor-pointer hover:shadow-2xl transition-all duration-300 hover:scale-105 border-2 border-transparent hover:border-purple-200"
          >
            {/* 场景缩略图 */}
            <div className="relative h-40 bg-gradient-to-br from-slate-700 to-slate-800 overflow-hidden">
              {scene.sceneImage?.imagePath ? (
                <img
                  src={fileUrl.image(scene.sceneImage.imagePath)}
                  alt={`场景 ${scene.sceneNumber}`}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/30 text-5xl">
                  🎬
                </div>
              )}
              {/* 渐变遮罩 */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
              {/* 场景编号 */}
              <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full">
                <span className="text-white font-bold text-sm">#{scene.sceneNumber}</span>
              </div>
            </div>

            {/* 场景信息 */}
            <div className="p-4">
              <h4 className="font-bold text-gray-800 text-lg mb-2 truncate">{scene.location}</h4>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                  {scene.timeOfDay}
                </span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                  {scene.durationSeconds}秒
                </span>
              </div>
              <div className="text-sm text-gray-600 mb-2">
                <span className="font-medium">角色:</span>{' '}
                {scene.characters?.map((c) => c.characterName).join(', ') || '无'}
              </div>
              <button className="w-full mt-2 py-2 bg-purple-50 text-purple-600 rounded-lg text-sm font-medium hover:bg-purple-100 transition-colors">
                查看详情 →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


