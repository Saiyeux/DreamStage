import { useState } from 'react'

type Tab = 'characters' | 'scenes' | 'videos'

export function GenerationCenterPage() {
  const [activeTab, setActiveTab] = useState<Tab>('characters')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">生成中心</h2>
          <p className="text-sm text-gray-500">项目: 都市恋曲</p>
        </div>
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
          {activeTab === 'characters' && <CharacterLibraryTab />}
          {activeTab === 'scenes' && <SceneImageTab />}
          {activeTab === 'videos' && <VideoGenerationTab />}
        </div>
      </div>
    </div>
  )
}

function CharacterLibraryTab() {
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState(0)

  const startGeneration = () => {
    setGenerating(true)
    // 模拟进度
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
        <CharacterGenerationCard
          name="林晓雨"
          role="女主角"
          status="completed"
          images={5}
        />
        <CharacterGenerationCard
          name="陈默"
          role="男主角"
          status={generating ? 'generating' : 'pending'}
          images={generating ? 3 : 0}
          progress={generating ? 60 : 0}
        />
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
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`w-16 h-20 rounded-lg flex items-center justify-center text-xs ${
              i < images
                ? 'bg-gray-200'
                : status === 'generating' && i === images
                ? 'bg-blue-100 text-blue-500'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            {i < images ? (
              i === 0 ? '正面 ⭐' : ['侧面', '微笑', '惊讶', '思考'][i - 1]
            ) : status === 'generating' && i === images ? (
              '生成中'
            ) : (
              '待生成'
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

function SceneImageTab() {
  const [currentScene, setCurrentScene] = useState(1)
  const totalScenes = 24
  const completedScenes = 15

  return (
    <div>
      {/* Status Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm">
          <span className="text-green-600">✅ 前置条件: 角色库已完成</span>
          <span className="ml-4 text-gray-600">
            🔄 进行中 ({completedScenes}/{totalScenes})
          </span>
        </div>
        <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
          ▶️ 开始生成
        </button>
      </div>

      <div className="h-2 bg-gray-200 rounded-full mb-6">
        <div
          className="h-full bg-blue-500 rounded-full"
          style={{ width: `${(completedScenes / totalScenes) * 100}%` }}
        />
      </div>

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
          {currentScene} / {totalScenes}
        </span>
        <button
          onClick={() => setCurrentScene((s) => Math.min(totalScenes, s + 1))}
          className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
        >
          下一场景 ▶
        </button>
      </div>

      {/* Thumbnails */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {Array.from({ length: totalScenes }).map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentScene(i + 1)}
            className={`flex-shrink-0 w-12 h-12 rounded flex items-center justify-center text-xs ${
              i + 1 === currentScene
                ? 'ring-2 ring-blue-500'
                : ''
            } ${
              i < completedScenes
                ? 'bg-green-100 text-green-600'
                : 'bg-gray-100 text-gray-400'
            }`}
          >
            {i < completedScenes ? '✅' : '⬜'}
            <br />
            {i + 1}
          </button>
        ))}
      </div>

      <div className="mt-4 text-sm text-gray-600 text-center">
        ✅ 已完成: {completedScenes} | 🔄 生成中: 1 | ⬜ 待生成:{' '}
        {totalScenes - completedScenes - 1}
      </div>
    </div>
  )
}

function VideoGenerationTab() {
  const [currentScene, setCurrentScene] = useState(1)
  const totalScenes = 24
  const completedVideos = 7

  return (
    <div>
      {/* Status Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm">
          <span className="text-green-600">✅ 前置条件: 场景图已完成</span>
          <span className="ml-4 text-gray-600">
            🔄 进行中 ({completedVideos}/{totalScenes})
          </span>
        </div>
        <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
          ▶️ 开始生成
        </button>
      </div>

      <div className="h-2 bg-gray-200 rounded-full mb-6">
        <div
          className="h-full bg-blue-500 rounded-full"
          style={{ width: `${(completedVideos / totalScenes) * 100}%` }}
        />
      </div>

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
          {currentScene} / {totalScenes}
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

      {/* Queue */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium text-gray-700 mb-2">生成队列</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>#08 电梯内</span>
            <span className="text-blue-500">🔄 生成中 45%</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>#09 办公室走廊</span>
            <span>⏳ 队列中</span>
          </div>
          <div className="flex justify-between text-gray-500">
            <span>#10 总裁办公室</span>
            <span>⏳ 队列中</span>
          </div>
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-600 text-center">
        ✅ 已完成: {completedVideos} | 🔄 生成中: 1 | ⏳ 队列中:{' '}
        {totalScenes - completedVideos - 1}
      </div>
    </div>
  )
}
