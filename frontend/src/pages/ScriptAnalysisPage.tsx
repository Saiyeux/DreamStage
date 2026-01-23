import { useState } from 'react'
import type { Character, Scene } from '@/types'

// 模拟数据
const mockCharacters: Character[] = [
  {
    id: '1',
    projectId: '1',
    name: '林晓雨',
    gender: '女',
    age: '25岁',
    roleType: '女主角',
    hair: '黑色长直发，及腰',
    face: '鹅蛋脸，杏眼，柳叶眉',
    body: '身高165cm，纤细',
    skin: '白皙',
    personality: '温柔、独立、有主见',
    clothingStyle: '职业装为主',
    sceneNumbers: [1, 3, 5, 7, 8, 12, 15],
    basePrompt: '',
    images: [],
  },
  {
    id: '2',
    projectId: '1',
    name: '陈默',
    gender: '男',
    age: '30岁',
    roleType: '男主角',
    hair: '黑色短发，干练',
    face: '国字脸，剑眉星目',
    body: '身高180cm，健壮',
    skin: '小麦色',
    personality: '沉稳、神秘、有魅力',
    clothingStyle: '高端西装',
    sceneNumbers: [1, 4, 5, 9, 15],
    basePrompt: '',
    images: [],
  },
]

const mockScenes: Scene[] = [
  {
    id: '1',
    projectId: '1',
    sceneNumber: 1,
    location: '咖啡店内景',
    timeOfDay: '白天',
    atmosphere: '温馨',
    environmentDesc: '现代风格咖啡店，落地窗，阳光洒入',
    characters: [
      { characterId: '1', characterName: '林晓雨', position: '左侧', action: '坐着喝咖啡', expression: '若有所思' },
      { characterId: '2', characterName: '陈默', position: '右侧', action: '刚走进店', expression: '惊讶' },
    ],
    dialogue: '陈默: "好久不见，林小姐。"\n林晓雨: "陈...陈总？"',
    shotType: '中景',
    cameraMovement: '缓慢推进',
    durationSeconds: 15,
    scenePrompt: '',
    actionPrompt: '',
    negativePrompt: '',
  },
]

type Tab = 'characters' | 'scenes'

export function ScriptAnalysisPage() {
  const [activeTab, setActiveTab] = useState<Tab>('characters')
  const [characters] = useState(mockCharacters)
  const [scenes] = useState(mockScenes)
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
  const [selectedScene, setSelectedScene] = useState<Scene | null>(null)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">剧本分析</h2>
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
            />
          ) : (
            <ScenesTab scenes={scenes} onSelect={setSelectedScene} />
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
}: {
  characters: Character[]
  onSelect: (c: Character) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-600">
          ✅ 已完成 (识别到 {characters.length} 个角色)
        </p>
        <button className="text-sm text-blue-500 hover:text-blue-600">
          🔄 重新分析
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
              出场: {character.sceneNumbers.length}
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
}: {
  scenes: Scene[]
  onSelect: (s: Scene) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-600">
          ✅ 已完成 (共 {scenes.length} 个场景)
        </p>
        <button className="text-sm text-blue-500 hover:text-blue-600">
          🔄 重新分析
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
                  {scene.characters.map((c) => c.characterName).join(', ')}
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
                {scene.characters.map((c, i) => (
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
