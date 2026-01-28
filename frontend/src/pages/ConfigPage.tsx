import { useState, useEffect } from 'react'
import { configApi } from '@/api'
import type {
  AnalysisPromptsConfig,
  CharacterPromptsConfig,
  ScenePromptsConfig,
  ActionPromptsConfig,
  ChunkConfig,
  WorkflowConfig,
  WorkflowItem,
} from '@/api/config'

type ConfigTab = 'analysis' | 'character' | 'scene' | 'action' | 'chunk' | 'workflow'

export function ConfigPage() {
  const [activeTab, setActiveTab] = useState<ConfigTab>('analysis')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 配置数据
  const [analysisPrompts, setAnalysisPrompts] = useState<AnalysisPromptsConfig | null>(null)
  const [characterPrompts, setCharacterPrompts] = useState<CharacterPromptsConfig | null>(null)
  const [scenePrompts, setScenePrompts] = useState<ScenePromptsConfig | null>(null)
  const [actionPrompts, setActionPrompts] = useState<ActionPromptsConfig | null>(null)
  const [chunkConfig, setChunkConfig] = useState<ChunkConfig | null>(null)
  const [workflowConfig, setWorkflowConfig] = useState<WorkflowConfig | null>(null)

  // 加载配置
  useEffect(() => {
    loadConfig(activeTab)
  }, [activeTab])

  const loadConfig = async (tab: ConfigTab) => {
    setLoading(true)
    setMessage(null)
    try {
      switch (tab) {
        case 'analysis':
          setAnalysisPrompts(await configApi.getAnalysisPrompts())
          break
        case 'character':
          setCharacterPrompts(await configApi.getCharacterPrompts())
          break
        case 'scene':
          setScenePrompts(await configApi.getScenePrompts())
          break
        case 'action':
          setActionPrompts(await configApi.getActionPrompts())
          break
        case 'chunk':
          setChunkConfig(await configApi.getChunkConfig())
          break
        case 'workflow':
          setWorkflowConfig(await configApi.getWorkflowConfig())
          break
      }
    } catch (err) {
      setMessage({ type: 'error', text: '加载配置失败' })
      console.error('Load config failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const saveConfig = async () => {
    setSaving(true)
    setMessage(null)
    try {
      switch (activeTab) {
        case 'analysis':
          if (analysisPrompts) await configApi.updateAnalysisPrompts(analysisPrompts)
          break
        case 'character':
          if (characterPrompts) await configApi.updateCharacterPrompts(characterPrompts)
          break
        case 'scene':
          if (scenePrompts) await configApi.updateScenePrompts(scenePrompts)
          break
        case 'action':
          if (actionPrompts) await configApi.updateActionPrompts(actionPrompts)
          break
        case 'chunk':
          if (chunkConfig) await configApi.updateChunkConfig(chunkConfig)
          break
        case 'workflow':
          if (workflowConfig) await configApi.updateWorkflowConfig(workflowConfig)
          break
      }
      setMessage({ type: 'success', text: '保存成功' })
    } catch (err) {
      setMessage({ type: 'error', text: '保存失败' })
      console.error('Save config failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const tabs: { id: ConfigTab; label: string; icon: string }[] = [
    { id: 'analysis', label: 'LLM 分析提示词', icon: '🤖' },
    { id: 'character', label: '角色图提示词', icon: '👤' },
    { id: 'scene', label: '场景图提示词', icon: '🖼️' },
    { id: 'action', label: '视频动作提示词', icon: '🎬' },
    { id: 'chunk', label: '分块配置', icon: '📄' },
    { id: 'workflow', label: '工作流配置', icon: '🔧' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-effect rounded-2xl p-6 shadow-xl">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
          ⚙️ 配置管理
        </h2>
        <p className="text-sm text-gray-600 mt-2">
          编辑提示词模板和系统配置
        </p>
      </div>

      {/* Tabs */}
      <div className="glass-effect rounded-2xl shadow-xl overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex gap-1 p-2 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-white hover:text-purple-600 hover:shadow-md'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {/* Message */}
          {message && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm ${
                message.type === 'success'
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {message.type === 'success' ? '✅' : '❌'} {message.text}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4 animate-pulse">⏳</div>
              <p className="text-gray-500">加载中...</p>
            </div>
          ) : (
            <>
              {activeTab === 'analysis' && analysisPrompts && (
                <AnalysisPromptsEditor
                  data={analysisPrompts}
                  onChange={setAnalysisPrompts}
                />
              )}
              {activeTab === 'character' && characterPrompts && (
                <CharacterPromptsEditor
                  data={characterPrompts}
                  onChange={setCharacterPrompts}
                />
              )}
              {activeTab === 'scene' && scenePrompts && (
                <ScenePromptsEditor
                  data={scenePrompts}
                  onChange={setScenePrompts}
                />
              )}
              {activeTab === 'action' && actionPrompts && (
                <ActionPromptsEditor
                  data={actionPrompts}
                  onChange={setActionPrompts}
                />
              )}
              {activeTab === 'chunk' && chunkConfig && (
                <ChunkConfigEditor
                  data={chunkConfig}
                  onChange={setChunkConfig}
                />
              )}
              {activeTab === 'workflow' && workflowConfig && (
                <WorkflowConfigEditor
                  data={workflowConfig}
                  onChange={setWorkflowConfig}
                />
              )}

              {/* Save Button */}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={saveConfig}
                  disabled={saving}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  {saving ? '⏳ 保存中...' : '💾 保存配置'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ============ 分析提示词编辑器 ============
function AnalysisPromptsEditor({
  data,
  onChange,
}: {
  data: AnalysisPromptsConfig
  onChange: (data: AnalysisPromptsConfig) => void
}) {
  const [expandedSection, setExpandedSection] = useState<string | null>('summary')

  const sections = [
    { key: 'summary', label: '剧情简介分析', icon: '📝' },
    { key: 'characters', label: '角色分析', icon: '👥' },
    { key: 'scenes', label: '分镜分析', icon: '🎬' },
  ] as const

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 mb-4">
        配置 LLM 分析剧本时使用的提示词模板。支持变量替换，如 {'{{script_text}}'}, {'{{chunk_index}}'} 等。
      </p>

      {sections.map(({ key, label, icon }) => (
        <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpandedSection(expandedSection === key ? null : key)}
            className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
          >
            <span className="font-medium flex items-center gap-2">
              <span>{icon}</span>
              <span>{label}</span>
            </span>
            <span className="text-gray-400">{expandedSection === key ? '▼' : '▶'}</span>
          </button>

          {expandedSection === key && (
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  系统提示 (System)
                </label>
                <input
                  type="text"
                  value={data[key].system}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      [key]: { ...data[key], system: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  提示词模板 (Template)
                </label>
                <textarea
                  value={data[key].template}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      [key]: { ...data[key], template: e.target.value },
                    })
                  }
                  rows={12}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                />
              </div>

              {key === 'characters' && data.characters.existing_hint_template && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    已有角色提示模板
                  </label>
                  <textarea
                    value={data.characters.existing_hint_template}
                    onChange={(e) =>
                      onChange({
                        ...data,
                        characters: { ...data.characters, existing_hint_template: e.target.value },
                      })
                    }
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ============ 角色图提示词编辑器 ============
function CharacterPromptsEditor({
  data,
  onChange,
}: {
  data: CharacterPromptsConfig
  onChange: (data: CharacterPromptsConfig) => void
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 mb-4">
        配置生成角色图像时的提示词模板和风格预设。
      </p>

      {/* 基础配置 */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-800 mb-4">基础配置</h4>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              质量后缀 (Quality Suffix)
            </label>
            <textarea
              value={data.character_portrait.quality_suffix}
              onChange={(e) =>
                onChange({
                  ...data,
                  character_portrait: { ...data.character_portrait, quality_suffix: e.target.value },
                })
              }
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              负面提示词 (Negative Prompt)
            </label>
            <textarea
              value={data.character_portrait.negative_prompt}
              onChange={(e) =>
                onChange({
                  ...data,
                  character_portrait: { ...data.character_portrait, negative_prompt: e.target.value },
                })
              }
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
            />
          </div>
        </div>
      </div>

      {/* 性别映射 */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-800 mb-4">性别映射</h4>
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(data.gender_mapping).map(([key, value]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{key}</label>
              <input
                type="text"
                value={value}
                onChange={(e) =>
                  onChange({
                    ...data,
                    gender_mapping: { ...data.gender_mapping, [key]: e.target.value },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 风格预设 */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-800 mb-4">风格预设</h4>
        <div className="space-y-4">
          {Object.entries(data.style_presets).map(([name, preset]) => (
            <div key={name} className="p-3 bg-gray-50 rounded-lg">
              <div className="font-medium text-gray-700 mb-2">{name}</div>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-500">质量后缀</label>
                  <input
                    type="text"
                    value={preset.quality_suffix}
                    onChange={(e) =>
                      onChange({
                        ...data,
                        style_presets: {
                          ...data.style_presets,
                          [name]: { ...preset, quality_suffix: e.target.value },
                        },
                      })
                    }
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">负面提示词</label>
                  <input
                    type="text"
                    value={preset.negative_prompt}
                    onChange={(e) =>
                      onChange({
                        ...data,
                        style_presets: {
                          ...data.style_presets,
                          [name]: { ...preset, negative_prompt: e.target.value },
                        },
                      })
                    }
                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============ 场景图提示词编辑器 ============
function ScenePromptsEditor({
  data,
  onChange,
}: {
  data: ScenePromptsConfig
  onChange: (data: ScenePromptsConfig) => void
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 mb-4">
        配置生成场景图像时的提示词模板。
      </p>

      {/* 基础配置 */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-800 mb-4">基础配置</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">角色模板</label>
            <input
              type="text"
              value={data.scene_image.character_template}
              onChange={(e) =>
                onChange({
                  ...data,
                  scene_image: { ...data.scene_image, character_template: e.target.value },
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">质量后缀</label>
            <textarea
              value={data.scene_image.quality_suffix}
              onChange={(e) =>
                onChange({
                  ...data,
                  scene_image: { ...data.scene_image, quality_suffix: e.target.value },
                })
              }
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">负面提示词</label>
            <textarea
              value={data.scene_image.negative_prompt}
              onChange={(e) =>
                onChange({
                  ...data,
                  scene_image: { ...data.scene_image, negative_prompt: e.target.value },
                })
              }
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
            />
          </div>
        </div>
      </div>

      {/* 时间映射 */}
      <MappingEditor
        title="时间映射"
        data={data.time_of_day_mapping}
        onChange={(mapping) => onChange({ ...data, time_of_day_mapping: mapping })}
      />

      {/* 氛围增强 */}
      <MappingEditor
        title="氛围增强"
        data={data.atmosphere_enhancements}
        onChange={(mapping) => onChange({ ...data, atmosphere_enhancements: mapping })}
      />
    </div>
  )
}

// ============ 视频动作提示词编辑器 ============
function ActionPromptsEditor({
  data,
  onChange,
}: {
  data: ActionPromptsConfig
  onChange: (data: ActionPromptsConfig) => void
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 mb-4">
        配置生成视频时的动作提示词模板。
      </p>

      {/* 基础配置 */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-800 mb-4">基础配置</h4>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">默认动作</label>
            <input
              type="text"
              value={data.default_action}
              onChange={(e) => onChange({ ...data, default_action: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">质量后缀</label>
            <input
              type="text"
              value={data.video_action.quality_suffix}
              onChange={(e) =>
                onChange({
                  ...data,
                  video_action: { ...data.video_action, quality_suffix: e.target.value },
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">负面提示词</label>
            <input
              type="text"
              value={data.video_action.negative_prompt}
              onChange={(e) =>
                onChange({
                  ...data,
                  video_action: { ...data.video_action, negative_prompt: e.target.value },
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
            />
          </div>
        </div>
      </div>

      {/* 镜头运动映射 */}
      <MappingEditor
        title="镜头运动映射"
        data={data.camera_movement_mapping}
        onChange={(mapping) => onChange({ ...data, camera_movement_mapping: mapping })}
      />

      {/* 动作增强 */}
      <MappingEditor
        title="动作增强"
        data={data.action_enhancements}
        onChange={(mapping) => onChange({ ...data, action_enhancements: mapping })}
      />
    </div>
  )
}

// ============ 分块配置编辑器 ============
function ChunkConfigEditor({
  data,
  onChange,
}: {
  data: ChunkConfig
  onChange: (data: ChunkConfig) => void
}) {
  const [newDelimiter, setNewDelimiter] = useState('')

  const addDelimiter = () => {
    if (newDelimiter.trim() && !data.chapter_delimiters.includes(newDelimiter.trim())) {
      onChange({
        ...data,
        chapter_delimiters: [...data.chapter_delimiters, newDelimiter.trim()],
      })
      setNewDelimiter('')
    }
  }

  const removeDelimiter = (index: number) => {
    onChange({
      ...data,
      chapter_delimiters: data.chapter_delimiters.filter((_, i) => i !== index),
    })
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 mb-4">
        配置剧本分块方式。支持按章节标记分块或按字符数分块。
      </p>

      {/* 分块模式 */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-800 mb-4">分块模式</h4>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="chunk_mode"
              value="chapter"
              checked={data.chunk_mode === 'chapter'}
              onChange={() => onChange({ ...data, chunk_mode: 'chapter' })}
              className="w-4 h-4 text-purple-600"
            />
            <span>按章节分块</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="chunk_mode"
              value="size"
              checked={data.chunk_mode === 'size'}
              onChange={() => onChange({ ...data, chunk_mode: 'size' })}
              className="w-4 h-4 text-purple-600"
            />
            <span>按字符数分块</span>
          </label>
        </div>
      </div>

      {/* 章节分隔符 */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-800 mb-4">章节分隔符（支持正则表达式）</h4>
        <div className="flex flex-wrap gap-2 mb-4">
          {data.chapter_delimiters.map((delimiter, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 text-sm rounded-lg"
            >
              <code className="font-mono">{delimiter}</code>
              <button
                onClick={() => removeDelimiter(index)}
                className="ml-1 text-purple-500 hover:text-red-500"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newDelimiter}
            onChange={(e) => setNewDelimiter(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDelimiter()}
            placeholder="添加分隔符..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
          />
          <button
            onClick={addDelimiter}
            className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
          >
            添加
          </button>
        </div>
      </div>

      {/* 大小配置 */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-800 mb-4">分块大小配置</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              回退分块大小
            </label>
            <input
              type="number"
              value={data.fallback_chunk_size}
              onChange={(e) =>
                onChange({ ...data, fallback_chunk_size: parseInt(e.target.value) || 8000 })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              最小分块大小
            </label>
            <input
              type="number"
              value={data.min_chunk_size}
              onChange={(e) =>
                onChange({ ...data, min_chunk_size: parseInt(e.target.value) || 1000 })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              最大分块大小
            </label>
            <input
              type="number"
              value={data.max_chunk_size}
              onChange={(e) =>
                onChange({ ...data, max_chunk_size: parseInt(e.target.value) || 16000 })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ 通用映射编辑器 ============
function MappingEditor({
  title,
  data,
  onChange,
}: {
  title: string
  data: Record<string, string>
  onChange: (data: Record<string, string>) => void
}) {
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  const addMapping = () => {
    if (newKey.trim() && newValue.trim()) {
      onChange({ ...data, [newKey.trim()]: newValue.trim() })
      setNewKey('')
      setNewValue('')
    }
  }

  const removeMapping = (key: string) => {
    const newData = { ...data }
    delete newData[key]
    onChange(newData)
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h4 className="font-medium text-gray-800 mb-4">{title}</h4>
      <div className="space-y-2 mb-4">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex gap-2 items-center">
            <input
              type="text"
              value={key}
              readOnly
              className="w-1/4 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-sm"
            />
            <span className="text-gray-400">→</span>
            <input
              type="text"
              value={value}
              onChange={(e) => onChange({ ...data, [key]: e.target.value })}
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
            />
            <button
              onClick={() => removeMapping(key)}
              className="text-red-500 hover:text-red-700 px-2"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="键"
          className="w-1/4 px-2 py-1 border border-gray-300 rounded text-sm"
        />
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="值"
          className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
        />
        <button
          onClick={addMapping}
          className="px-3 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 text-sm"
        >
          添加
        </button>
      </div>
    </div>
  )
}

// ============ 工作流配置编辑器 ============
function WorkflowConfigEditor({
  data,
  onChange,
}: {
  data: WorkflowConfig
  onChange: (data: WorkflowConfig) => void
}) {
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null)

  const workflowTypes: { key: keyof Pick<WorkflowConfig, 'character_workflows' | 'scene_workflows' | 'video_workflows'>; label: string; icon: string }[] = [
    { key: 'character_workflows', label: '角色图工作流', icon: '👤' },
    { key: 'scene_workflows', label: '场景图工作流', icon: '🖼️' },
    { key: 'video_workflows', label: '视频工作流', icon: '🎬' },
  ]

  const updateWorkflow = (
    type: keyof Pick<WorkflowConfig, 'character_workflows' | 'scene_workflows' | 'video_workflows'>,
    index: number,
    updatedWorkflow: WorkflowItem
  ) => {
    const workflows = [...data[type]]
    workflows[index] = updatedWorkflow
    onChange({ ...data, [type]: workflows })
  }

  const setDefaultWorkflow = (
    type: keyof Pick<WorkflowConfig, 'character_workflows' | 'scene_workflows' | 'video_workflows'>,
    index: number
  ) => {
    const workflows = data[type].map((wf, i) => ({
      ...wf,
      default: i === index,
    }))
    onChange({ ...data, [type]: workflows })
  }

  const addWorkflow = (
    type: keyof Pick<WorkflowConfig, 'character_workflows' | 'scene_workflows' | 'video_workflows'>
  ) => {
    const newWorkflow: WorkflowItem = {
      id: `new_${Date.now()}`,
      name: '新工作流',
      description: '请配置工作流描述',
      workflow_file: '',
      default: data[type].length === 0,
      params: {},
    }
    onChange({ ...data, [type]: [...data[type], newWorkflow] })
  }

  const removeWorkflow = (
    type: keyof Pick<WorkflowConfig, 'character_workflows' | 'scene_workflows' | 'video_workflows'>,
    index: number
  ) => {
    const workflows = data[type].filter((_, i) => i !== index)
    // 如果删除的是默认工作流，将第一个设为默认
    if (data[type][index].default && workflows.length > 0) {
      workflows[0] = { ...workflows[0], default: true }
    }
    onChange({ ...data, [type]: workflows })
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 mb-4">
        配置 ComfyUI 工作流文件和参数。每种类型可配置多个工作流，选择一个作为默认。
      </p>

      {/* 工作流目录 */}
      <div className="border border-gray-200 rounded-lg p-4">
        <h4 className="font-medium text-gray-800 mb-2">工作流目录</h4>
        <input
          type="text"
          value={data.workflow_directory}
          onChange={(e) => onChange({ ...data, workflow_directory: e.target.value })}
          placeholder="comfyui_workflows"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">
          ComfyUI 工作流 JSON 文件所在的目录（相对于后端工作目录）
        </p>
      </div>

      {/* 各类型工作流 */}
      {workflowTypes.map(({ key, label, icon }) => (
        <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
            <span className="font-medium flex items-center gap-2">
              <span>{icon}</span>
              <span>{label}</span>
              <span className="text-sm text-gray-500">({data[key].length} 个)</span>
            </span>
            <button
              onClick={() => addWorkflow(key)}
              className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-sm"
            >
              + 添加工作流
            </button>
          </div>

          <div className="p-4 space-y-3">
            {data[key].length === 0 ? (
              <div className="text-center py-4 text-gray-400">
                暂无工作流配置，点击上方按钮添加
              </div>
            ) : (
              data[key].map((workflow, index) => (
                <WorkflowItemEditor
                  key={workflow.id}
                  workflow={workflow}
                  isExpanded={expandedWorkflow === `${key}-${index}`}
                  onToggle={() =>
                    setExpandedWorkflow(
                      expandedWorkflow === `${key}-${index}` ? null : `${key}-${index}`
                    )
                  }
                  onChange={(updated) => updateWorkflow(key, index, updated)}
                  onSetDefault={() => setDefaultWorkflow(key, index)}
                  onRemove={() => removeWorkflow(key, index)}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ============ 单个工作流编辑器 ============
function WorkflowItemEditor({
  workflow,
  isExpanded,
  onToggle,
  onChange,
  onSetDefault,
  onRemove,
}: {
  workflow: WorkflowItem
  isExpanded: boolean
  onToggle: () => void
  onChange: (workflow: WorkflowItem) => void
  onSetDefault: () => void
  onRemove: () => void
}) {
  const [newParamKey, setNewParamKey] = useState('')
  const [newParamValue, setNewParamValue] = useState('')

  const addParam = () => {
    if (newParamKey.trim()) {
      const value = isNaN(Number(newParamValue)) ? newParamValue : Number(newParamValue)
      onChange({
        ...workflow,
        params: { ...workflow.params, [newParamKey.trim()]: value },
      })
      setNewParamKey('')
      setNewParamValue('')
    }
  }

  const removeParam = (key: string) => {
    const params = { ...workflow.params }
    delete params[key]
    onChange({ ...workflow, params })
  }

  const updateParam = (key: string, value: string) => {
    const numValue = isNaN(Number(value)) ? value : Number(value)
    onChange({
      ...workflow,
      params: { ...workflow.params, [key]: numValue },
    })
  }

  return (
    <div className={`border rounded-lg ${workflow.default ? 'border-purple-300 bg-purple-50/50' : 'border-gray-200'}`}>
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {workflow.default && (
            <span className="px-2 py-0.5 bg-purple-600 text-white text-xs rounded-full">
              默认
            </span>
          )}
          <span className="font-medium">{workflow.name}</span>
          <span className="text-sm text-gray-500">{workflow.workflow_file || '(未配置文件)'}</span>
        </div>
        <div className="flex items-center gap-2">
          {!workflow.default && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onSetDefault()
              }}
              className="px-2 py-1 text-xs text-purple-600 hover:bg-purple-100 rounded"
            >
              设为默认
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded"
          >
            删除
          </button>
          <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 py-3 border-t border-gray-200 space-y-4">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID</label>
              <input
                type="text"
                value={workflow.id}
                onChange={(e) => onChange({ ...workflow, id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
              <input
                type="text"
                value={workflow.name}
                onChange={(e) => onChange({ ...workflow, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
            <input
              type="text"
              value={workflow.description}
              onChange={(e) => onChange({ ...workflow, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">工作流文件</label>
            <input
              type="text"
              value={workflow.workflow_file}
              onChange={(e) => onChange({ ...workflow, workflow_file: e.target.value })}
              placeholder="例如: character_portrait_flux2.json"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm font-mono"
            />
          </div>

          {/* 参数 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">工作流参数</label>
            <div className="space-y-2 mb-3">
              {Object.entries(workflow.params).map(([key, value]) => (
                <div key={key} className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={key}
                    readOnly
                    className="w-1/3 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-sm font-mono"
                  />
                  <span className="text-gray-400">=</span>
                  <input
                    type="text"
                    value={String(value ?? '')}
                    onChange={(e) => updateParam(key, e.target.value)}
                    className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                  />
                  <button
                    onClick={() => removeParam(key)}
                    className="text-red-500 hover:text-red-700 px-2"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newParamKey}
                onChange={(e) => setNewParamKey(e.target.value)}
                placeholder="参数名"
                className="w-1/3 px-2 py-1 border border-gray-300 rounded text-sm font-mono"
              />
              <input
                type="text"
                value={newParamValue}
                onChange={(e) => setNewParamValue(e.target.value)}
                placeholder="值（数字或字符串）"
                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm font-mono"
              />
              <button
                onClick={addParam}
                className="px-3 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 text-sm"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
