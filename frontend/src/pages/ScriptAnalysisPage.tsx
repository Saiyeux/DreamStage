import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Character, Scene } from '@/types'
import { projectsApi, analysisApi } from '@/api'
import { useProjectStore } from '@/stores/projectStore'

type Tab = 'characters' | 'scenes'

export function ScriptAnalysisPage() {
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
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 终端状态
  const [terminalExpanded, setTerminalExpanded] = useState(false)
  const [terminalOutput, setTerminalOutput] = useState<string[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const terminalRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // 自动滚动终端
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [terminalOutput])

  // 清理 EventSource
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  // 加载项目和数据
  useEffect(() => {
    if (!projectId) return

    const loadData = async () => {
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
    }

    loadData()
  }, [projectId, urlProjectId])

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

  // 流式分析
  const analyzeWithStream = async (analysisType: 'characters' | 'scenes') => {
    if (!projectId) return

    // 更新状态
    setIsStreaming(true)
    setTerminalExpanded(true)
    setError(null)

    // 更新项目状态
    if (currentProject) {
      setCurrentProject({ ...currentProject, status: 'analyzing' })
    }

    const typeName = analysisType === 'characters' ? '角色' : '场景'
    setTerminalOutput([
      `> 开始分析${typeName}...`,
      `[${new Date().toLocaleTimeString()}] 连接 LLM 服务...`,
      '',
    ])

    // 关闭之前的连接
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const url = `/api/projects/${projectId}/analyze/${analysisType}/stream`
    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'start') {
          setTerminalOutput((prev) => [
            ...prev,
            `[${new Date().toLocaleTimeString()}] LLM 开始响应...`,
            '',
          ])
        } else if (data.type === 'chunk') {
          setTerminalOutput((prev) => {
            const newOutput = [...prev]
            newOutput[newOutput.length - 1] += data.content
            return newOutput
          })
        } else if (data.type === 'done') {
          setTerminalOutput((prev) => [
            ...prev,
            '',
            `[${new Date().toLocaleTimeString()}] 分析完成，正在保存...`,
          ])
          eventSource.close()
          setIsStreaming(false)

          // 调用后端保存并重新加载数据
          try {
            if (analysisType === 'characters') {
              await analysisApi.analyzeCharacters(projectId)
              const data = await analysisApi.getCharacters(projectId)
              setCharacters(data)
            } else {
              await analysisApi.analyzeScenes(projectId)
              const data = await analysisApi.getScenes(projectId)
              setScenes(data)
            }
            setTerminalOutput((prev) => [
              ...prev,
              `[${new Date().toLocaleTimeString()}] 保存成功`,
            ])
          } catch (err) {
            setTerminalOutput((prev) => [
              ...prev,
              `[错误] 保存失败: ${err}`,
            ])
          }

          await refreshProjectStatus()
        } else if (data.type === 'error') {
          setTerminalOutput((prev) => [
            ...prev,
            '',
            `[错误] ${data.message}`,
          ])
          eventSource.close()
          setIsStreaming(false)
          await refreshProjectStatus()
        }
      } catch (e) {
        console.error('Parse SSE data failed:', e)
      }
    }

    eventSource.onerror = async () => {
      setTerminalOutput((prev) => [...prev, '', '[连接断开]'])
      eventSource.close()
      setIsStreaming(false)
      await refreshProjectStatus()
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">剧本分析</h2>
          <p className="text-sm text-gray-500">
            项目: {currentProject?.name || '未命名'}
            {currentProject?.status === 'analyzing' && (
              <span className="ml-2 text-yellow-600">🔄 分析中...</span>
            )}
          </p>
        </div>
        <button
          onClick={() => navigate(`/generation?project=${projectId}`)}
          disabled={characters.length === 0}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
        >
          前往生成中心 →
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl">
          {error}
        </div>
      )}

      {/* LLM Terminal */}
      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <div
          className="flex items-center justify-between px-4 py-2 bg-gray-800 cursor-pointer"
          onClick={() => setTerminalExpanded(!terminalExpanded)}
        >
          <div className="flex items-center gap-2">
            <span className="text-green-400 font-mono">$</span>
            <span className="text-gray-300 text-sm font-mono">LLM Output</span>
            {isStreaming && (
              <span className="text-yellow-400 text-xs animate-pulse">
                streaming...
              </span>
            )}
          </div>
          <button className="text-gray-400 hover:text-white text-sm">
            {terminalExpanded ? '▼ 收起' : '▲ 展开'}
          </button>
        </div>

        {terminalExpanded && (
          <div
            ref={terminalRef}
            className="p-4 font-mono text-sm text-green-400 max-h-64 overflow-y-auto"
          >
            {terminalOutput.length === 0 ? (
              <p className="text-gray-500">等待分析任务...</p>
            ) : (
              terminalOutput.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">
                  {line || '\u00A0'}
                </div>
              ))
            )}
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-green-400 animate-pulse ml-1" />
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('characters')}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'characters'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              👤 角色信息
            </button>
            <button
              onClick={() => setActiveTab('scenes')}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'scenes'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              🎬 分镜信息
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'characters' ? (
            <CharactersTab
              characters={characters}
              onSelect={setSelectedCharacter}
              onAnalyze={() => analyzeWithStream('characters')}
              analyzing={isStreaming}
            />
          ) : (
            <ScenesTab
              scenes={scenes}
              onSelect={setSelectedScene}
              onAnalyze={() => analyzeWithStream('scenes')}
              analyzing={isStreaming}
            />
          )}
        </div>
      </div>

      {/* Character Detail Modal */}
      {selectedCharacter && (
        <CharacterModal
          character={selectedCharacter}
          onClose={() => setSelectedCharacter(null)}
        />
      )}

      {/* Scene Detail Modal */}
      {selectedScene && (
        <SceneModal
          scene={selectedScene}
          onClose={() => setSelectedScene(null)}
        />
      )}
    </div>
  )
}

function CharactersTab({
  characters,
  onSelect,
  onAnalyze,
  analyzing,
}: {
  characters: Character[]
  onSelect: (c: Character) => void
  onAnalyze: () => void
  analyzing: boolean
}) {
  if (characters.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">👤</div>
        <p className="text-gray-500 mb-4">暂无角色信息</p>
        <p className="text-sm text-gray-400 mb-6">点击下方按钮开始分析剧本中的角色</p>
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          {analyzing ? '分析中...' : '🔍 开始分析角色'}
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
          disabled={analyzing}
          className="text-sm text-blue-500 hover:text-blue-600 disabled:opacity-50"
        >
          {analyzing ? '分析中...' : '🔄 重新分析'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {characters.map((character) => (
          <div
            key={character.id}
            onClick={() => onSelect(character)}
            className="bg-gray-50 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-100 transition-colors"
          >
            <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-2 flex items-center justify-center text-2xl">
              👤
            </div>
            <p className="font-medium text-gray-800">{character.name}</p>
            <p className="text-xs text-gray-500">{character.roleType}</p>
            <p className="text-xs text-gray-400">
              出场: {character.sceneNumbers?.length || 0}
            </p>
            <button className="mt-2 text-xs text-blue-500">详情</button>
          </div>
        ))}
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
        💡 提示: 点击角色卡片查看详情并编辑，完成后可前往生成中心
      </div>
    </div>
  )
}

function ScenesTab({
  scenes,
  onSelect,
  onAnalyze,
  analyzing,
}: {
  scenes: Scene[]
  onSelect: (s: Scene) => void
  onAnalyze: () => void
  analyzing: boolean
}) {
  if (scenes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🎬</div>
        <p className="text-gray-500 mb-4">暂无分镜信息</p>
        <p className="text-sm text-gray-400 mb-6">点击下方按钮开始分析剧本中的分镜</p>
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          {analyzing ? '分析中...' : '🔍 开始分析分镜'}
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
          disabled={analyzing}
          className="text-sm text-blue-500 hover:text-blue-600 disabled:opacity-50"
        >
          {analyzing ? '分析中...' : '🔄 重新分析'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">#</th>
              <th className="px-4 py-2 text-left">场景</th>
              <th className="px-4 py-2 text-left">时间</th>
              <th className="px-4 py-2 text-left">角色</th>
              <th className="px-4 py-2 text-left">时长</th>
              <th className="px-4 py-2 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {scenes.map((scene) => (
              <tr key={scene.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3">{scene.sceneNumber}</td>
                <td className="px-4 py-3">{scene.location}</td>
                <td className="px-4 py-3">{scene.timeOfDay}</td>
                <td className="px-4 py-3">
                  {scene.characters?.map((c) => c.characterName).join(', ') || '-'}
                </td>
                <td className="px-4 py-3">{scene.durationSeconds}s</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onSelect(scene)}
                    className="text-blue-500 hover:text-blue-600"
                  >
                    详情
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CharacterModal({
  character,
  onClose,
}: {
  character: Character
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">👤 {character.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-100 rounded-lg aspect-[3/4] flex items-center justify-center text-6xl">
            👤
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">基本信息</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p>姓名: {character.name}</p>
                <p>性别: {character.gender}</p>
                <p>年龄: {character.age}</p>
                <p>角色类型: {character.roleType}</p>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-700 mb-2">外貌特征</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p>发型: {character.hair}</p>
                <p>脸型: {character.face}</p>
                <p>身材: {character.body}</p>
                <p>肤色: {character.skin}</p>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-700 mb-2">性格特点</h4>
              <p className="text-sm text-gray-600">{character.personality}</p>
            </div>

            <div>
              <h4 className="font-medium text-gray-700 mb-2">服装风格</h4>
              <p className="text-sm text-gray-600">{character.clothingStyle}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
            ✏️ 编辑信息
          </button>
          <button className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
            📋 复制Prompt
          </button>
          <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            💾 保存
          </button>
        </div>
      </div>
    </div>
  )
}

function SceneModal({
  scene,
  onClose,
}: {
  scene: Scene
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">
            🎬 场景 #{scene.sceneNumber}: {scene.location}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-gray-100 rounded-lg aspect-video flex items-center justify-center text-4xl">
            🖼️
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">场景信息</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p>地点: {scene.location}</p>
                <p>时间: {scene.timeOfDay}</p>
                <p>氛围: {scene.atmosphere}</p>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-700 mb-2">环境描述</h4>
              <p className="text-sm text-gray-600">{scene.environmentDesc}</p>
            </div>

            <div>
              <h4 className="font-medium text-gray-700 mb-2">角色与动作</h4>
              <div className="text-sm text-gray-600 space-y-1">
                {scene.characters?.map((c, i) => (
                  <p key={i}>
                    • {c.characterName}: {c.position}，{c.action}，{c.expression}
                  </p>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-700 mb-2">对白</h4>
              <p className="text-sm text-gray-600 whitespace-pre-line">
                {scene.dialogue}
              </p>
            </div>

            <div>
              <h4 className="font-medium text-gray-700 mb-2">镜头</h4>
              <div className="text-sm text-gray-600 space-y-1">
                <p>机位: {scene.shotType}</p>
                <p>运动: {scene.cameraMovement}</p>
                <p>时长: {scene.durationSeconds}秒</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
            ✏️ 编辑信息
          </button>
          <button className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
            📋 复制Prompt
          </button>
          <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            💾 保存
          </button>
        </div>
      </div>
    </div>
  )
}
