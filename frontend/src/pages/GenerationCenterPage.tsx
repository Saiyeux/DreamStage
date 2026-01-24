import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Character, Scene } from '@/types'
import { projectsApi, analysisApi } from '@/api'
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

  // 加载数据
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">生成中心</h2>
          <p className="text-sm text-gray-500">
            项目: {currentProject?.name || '未命名'}
          </p>
        </div>
        <button
          onClick={() => navigate(`/analysis?project=${projectId}`)}
          className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
        >
          ← 返回分析
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-xl">
          {error}
        </div>
      )}

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
              📸 角色库
            </button>
            <button
              onClick={() => setActiveTab('scenes')}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'scenes'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              🖼️ 场景图
            </button>
            <button
              onClick={() => setActiveTab('videos')}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'videos'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              🎬 视频生成
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'characters' && (
            <CharacterLibraryTab
              characters={characters}
              onNavigateAnalysis={() => navigate(`/analysis?project=${projectId}`)}
            />
          )}
          {activeTab === 'scenes' && (
            <SceneImageTab
              scenes={scenes}
              hasCharacterLibrary={hasCharacterLibrary}
              onNavigateAnalysis={() => navigate(`/analysis?project=${projectId}`)}
            />
          )}
          {activeTab === 'videos' && (
            <VideoGenerationTab
              scenes={scenes}
              hasSceneImages={hasSceneImages}
              onNavigateAnalysis={() => navigate(`/analysis?project=${projectId}`)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// 角色图类型选项
const CHARACTER_IMAGE_TYPES = ['正面', '侧面', '微笑', '惊讶', '思考']

function CharacterLibraryTab({
  characters,
  onNavigateAnalysis,
}: {
  characters: Character[]
  onNavigateAnalysis: () => void
}) {
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)

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
            {CHARACTER_IMAGE_TYPES.map((type, i) => (
              <span
                key={type}
                className={`px-2 py-1 text-xs rounded ${
                  i === 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {type} {i === 0 && '⭐'}
              </span>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const startGeneration = () => {
    setGenerating(true)
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval)
          setGenerating(false)
          return 100
        }
        return p + 10
      })
    }, 500)
  }

  return (
    <div>
      {/* Status Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-600">
          {generating ? `🔄 生成中 (${progress}%)` : '⏸️ 待开始'}
        </div>
        <button
          onClick={startGeneration}
          disabled={generating}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50 hover:bg-blue-600"
        >
          {generating ? '⏸️ 暂停' : '▶️ 开始生成'}
        </button>
      </div>

      {generating && (
        <div className="h-2 bg-gray-200 rounded-full mb-6">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Character Cards */}
      <div className="space-y-4">
        {characters.map((character) => (
          <CharacterGenerationCard
            key={character.id}
            name={character.name}
            role={character.roleType}
            status="pending"
            images={0}
          />
        ))}
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
        💡 角色库完成后，系统将使用这些参考图保持场景中角色一致性
      </div>
    </div>
  )
}

function CharacterGenerationCard({
  name,
  role,
  status,
  images,
  progress,
}: {
  name: string
  role: string
  status: 'pending' | 'generating' | 'completed'
  images: number
  progress?: number
}) {
  const statusLabel = {
    pending: '⬜ 待生成',
    generating: `🔄 生成中 ${progress}%`,
    completed: '✅ 完成',
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="font-medium">{name}</span>
          <span className="text-sm text-gray-500 ml-2">({role})</span>
        </div>
        <span className="text-sm">{statusLabel[status]}</span>
      </div>

      <div className="flex gap-2">
        {CHARACTER_IMAGE_TYPES.map((type, i) => (
          <div
            key={type}
            className={`w-16 h-20 rounded-lg flex items-center justify-center text-xs ${
              i < images
                ? 'bg-gray-200'
                : status === 'generating' && i === images
                ? 'bg-blue-100 text-blue-500'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            {i < images ? (
              <span>{type} {i === 0 && '⭐'}</span>
            ) : status === 'generating' && i === images ? (
              '生成中'
            ) : (
              type
            )}
          </div>
        ))}
      </div>

      {status === 'completed' && (
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
    </div>
  )
}

function SceneImageTab({
  scenes,
  hasCharacterLibrary,
  onNavigateAnalysis,
}: {
  scenes: Scene[]
  hasCharacterLibrary: boolean
  onNavigateAnalysis: () => void
}) {
  const [currentScene, setCurrentScene] = useState(1)
  const totalScenes = scenes.length
  const completedScenes = 0

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
            {completedScenes > 0 ? `🔄 进行中 (${completedScenes}/${totalScenes})` : '⏸️ 待开始'}
          </span>
        </div>
        <button
          disabled={!hasCharacterLibrary}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          ▶️ 开始生成
        </button>
      </div>

      {totalScenes > 0 && (
        <div className="h-2 bg-gray-200 rounded-full mb-6">
          <div
            className="h-full bg-blue-500 rounded-full"
            style={{ width: `${(completedScenes / totalScenes) * 100}%` }}
          />
        </div>
      )}

      {/* Main Preview */}
      <div className="bg-gray-100 rounded-lg aspect-[9/16] max-w-md mx-auto flex items-center justify-center mb-4">
        <div className="text-center">
          <div className="text-6xl mb-2">🖼️</div>
          <p className="text-gray-500">场景 #{currentScene} 预览</p>
        </div>
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
              className={`flex-shrink-0 w-12 h-12 rounded flex items-center justify-center text-xs ${
                i + 1 === currentScene ? 'ring-2 ring-blue-500' : ''
              } ${
                i < completedScenes
                  ? 'bg-green-100 text-green-600'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {i < completedScenes ? '✅' : '⬜'}
              <br />
              {scene.sceneNumber}
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
  scenes,
  hasSceneImages,
  onNavigateAnalysis,
}: {
  scenes: Scene[]
  hasSceneImages: boolean
  onNavigateAnalysis: () => void
}) {
  const [currentScene, setCurrentScene] = useState(1)
  const totalScenes = scenes.length
  const completedVideos = 0

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
            {completedVideos > 0 ? `🔄 进行中 (${completedVideos}/${totalScenes})` : '⏸️ 待开始'}
          </span>
        </div>
        <button
          disabled={!hasSceneImages}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          ▶️ 开始生成
        </button>
      </div>

      {totalScenes > 0 && (
        <div className="h-2 bg-gray-200 rounded-full mb-6">
          <div
            className="h-full bg-blue-500 rounded-full"
            style={{ width: `${(completedVideos / totalScenes) * 100}%` }}
          />
        </div>
      )}

      {/* Video Preview */}
      <div className="bg-black rounded-lg aspect-[9/16] max-w-md mx-auto flex items-center justify-center mb-4">
        <div className="text-center text-white">
          <div className="text-6xl mb-2">🎬</div>
          <p className="text-gray-400">场景 #{currentScene} 视频</p>
          <p className="text-sm text-gray-500 mt-2">768x1344 | 24fps | 4s</p>
        </div>
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
