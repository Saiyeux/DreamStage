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

  // Configuration Data
  const [analysisPrompts, setAnalysisPrompts] = useState<AnalysisPromptsConfig | null>(null)
  const [characterPrompts, setCharacterPrompts] = useState<CharacterPromptsConfig | null>(null)
  const [scenePrompts, setScenePrompts] = useState<ScenePromptsConfig | null>(null)
  const [actionPrompts, setActionPrompts] = useState<ActionPromptsConfig | null>(null)
  const [chunkConfig, setChunkConfig] = useState<ChunkConfig | null>(null)
  const [workflowConfig, setWorkflowConfig] = useState<WorkflowConfig | null>(null)

  // Load Config
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
      setMessage({ type: 'error', text: 'Failed to load configuration' })
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
      setMessage({ type: 'success', text: 'Configuration saved successfully' })
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save configuration' })
      console.error('Save config failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const tabs: { id: ConfigTab; label: string; icon: string }[] = [
    { id: 'analysis', label: 'Analysis Prompts', icon: '🤖' },
    { id: 'character', label: 'Character Prompts', icon: '👤' },
    { id: 'scene', label: 'Scene Prompts', icon: '🖼️' },
    { id: 'action', label: 'Action Prompts', icon: '🎬' },
    { id: 'chunk', label: 'Chunking Config', icon: '📄' },
    { id: 'workflow', label: 'Workflow Config', icon: '🔧' },
  ]

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="card p-6 border-l-4 border-primary-500">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <span className="p-2 bg-primary-50 rounded-lg text-2xl">⚙️</span>
          Settings & Configuration
        </h2>
        <p className="text-sm text-slate-500 mt-1 pl-14">
          Manage system prompts, workflow templates, and global parameters.
        </p>
      </div>

      {/* Tabs */}
      <div className="card shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50/50">
          <div className="flex gap-2 p-2 overflow-x-auto scrollbar-thin">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === tab.id
                    ? 'bg-white text-primary-700 shadow-sm ring-1 ring-primary-100'
                    : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                  }`}
              >
                <span className="flex items-center gap-2">
                  <span className="opacity-75">{tab.icon}</span>
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
              className={`mb-6 p-4 rounded-xl text-sm flex items-center gap-3 border ${message.type === 'success'
                  ? 'bg-green-50 text-green-700 border-green-100'
                  : 'bg-red-50 text-red-700 border-red-100'
                }`}
            >
              <span className="text-xl">{message.type === 'success' ? '✅' : '❌'}</span>
              <span className="font-medium">{message.text}</span>
            </div>
          )}

          {loading ? (
            <div className="text-center py-16">
              <div className="w-12 h-12 border-4 border-primary-100 border-t-primary-500 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-500 font-medium">Loading configuration...</p>
            </div>
          ) : (
            <>
              <div className="animate-fade-in">
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
              </div>

              {/* Save Button */}
              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                <button
                  onClick={saveConfig}
                  disabled={saving}
                  className="btn btn-primary px-8 py-3 shadow-lg shadow-primary-500/20"
                >
                  {saving ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ============ Analysis Prompts Editor ============
function AnalysisPromptsEditor({
  data,
  onChange,
}: {
  data: AnalysisPromptsConfig
  onChange: (data: AnalysisPromptsConfig) => void
}) {
  const [expandedSection, setExpandedSection] = useState<string | null>('summary')

  const sections = [
    { key: 'summary', label: 'Summary Analysis', icon: '📝' },
    { key: 'characters', label: 'Character Analysis', icon: '👥' },
    { key: 'scenes', label: 'Scene Analysis', icon: '🎬' },
  ] as const

  return (
    <div className="space-y-6">
      <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg border border-slate-200">
        Templates for LLM analysis. Supports variables like <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-700 mx-1">{'{script_text}'}</code>, <code className="bg-white px-1 py-0.5 rounded border border-slate-200 text-slate-700 mx-1">{'{chunk_index}'}</code>.
      </div>

      {sections.map(({ key, label, icon }) => (
        <div key={key} className={`border rounded-xl transition-all duration-200 ${expandedSection === key ? 'border-primary-200 shadow-sm bg-white' : 'border-slate-200 bg-slate-50/30'}`}>
          <button
            onClick={() => setExpandedSection(expandedSection === key ? null : key)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-xl"
          >
            <span className="font-semibold text-slate-800 flex items-center gap-3">
              <span className="text-xl">{icon}</span>
              <span>{label}</span>
            </span>
            <span className={`text-slate-400 transform transition-transform ${expandedSection === key ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {expandedSection === key && (
            <div className="p-5 border-t border-slate-100 space-y-5 bg-white rounded-b-xl">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  System Prompt
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
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Prompt Template
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
                  className="input w-full font-mono text-xs leading-relaxed"
                />
              </div>

              {key === 'characters' && data.characters.existing_hint_template && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Existing Characters Hint Template
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
                    className="input w-full font-mono text-xs leading-relaxed"
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

// ============ Character Prompts Editor ============
function CharacterPromptsEditor({
  data,
  onChange,
}: {
  data: CharacterPromptsConfig
  onChange: (data: CharacterPromptsConfig) => void
}) {
  return (
    <div className="space-y-8">
      <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg border border-slate-200">
        Configuration for character image generation prompts and style presets.
      </div>

      {/* Basic Config */}
      <div className="card p-5">
        <h4 className="font-bold text-slate-900 mb-5 pb-3 border-b border-slate-100">Basic Configuration</h4>

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Quality Suffix
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
              className="input w-full font-mono text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Negative Prompt
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
              className="input w-full font-mono text-xs"
            />
          </div>
        </div>
      </div>

      {/* Gender Mapping */}
      <div className="card p-5">
        <h4 className="font-bold text-slate-900 mb-5 pb-3 border-b border-slate-100">Gender Mapping</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {Object.entries(data.gender_mapping).map(([key, value]) => (
            <div key={key}>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{key}</label>
              <input
                type="text"
                value={value}
                onChange={(e) =>
                  onChange({
                    ...data,
                    gender_mapping: { ...data.gender_mapping, [key]: e.target.value },
                  })
                }
                className="input w-full"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Style Presets */}
      <div className="card p-5">
        <h4 className="font-bold text-slate-900 mb-5 pb-3 border-b border-slate-100">Style Presets</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(data.style_presets).map(([name, preset]) => (
            <div key={name} className="p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-slate-300 transition-colors">
              <div className="font-bold text-slate-800 mb-3">{name}</div>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Quality Suffix</label>
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
                    className="input w-full text-xs py-1.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Negative Prompt</label>
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
                    className="input w-full text-xs py-1.5"
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

// ============ Scene Prompts Editor ============
function ScenePromptsEditor({
  data,
  onChange,
}: {
  data: ScenePromptsConfig
  onChange: (data: ScenePromptsConfig) => void
}) {
  return (
    <div className="space-y-8">
      <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg border border-slate-200">
        Configuration for scene image generation prompts.
      </div>

      {/* Basic Config */}
      <div className="card p-5">
        <h4 className="font-bold text-slate-900 mb-5 pb-3 border-b border-slate-100">Basic Configuration</h4>
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Character Template</label>
            <textarea
              value={data.scene_image.character_template}
              onChange={(e) =>
                onChange({
                  ...data,
                  scene_image: { ...data.scene_image, character_template: e.target.value },
                })
              }
              rows={2}
              className="input w-full font-mono text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Quality Suffix</label>
            <textarea
              value={data.scene_image.quality_suffix}
              onChange={(e) =>
                onChange({
                  ...data,
                  scene_image: { ...data.scene_image, quality_suffix: e.target.value },
                })
              }
              rows={2}
              className="input w-full font-mono text-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Negative Prompt</label>
            <textarea
              value={data.scene_image.negative_prompt}
              onChange={(e) =>
                onChange({
                  ...data,
                  scene_image: { ...data.scene_image, negative_prompt: e.target.value },
                })
              }
              rows={2}
              className="input w-full font-mono text-xs"
            />
          </div>
        </div>
      </div>

      {/* Mappings */}
      <MappingEditor
        title="Time of Day Mapping"
        data={data.time_of_day_mapping}
        onChange={(mapping) => onChange({ ...data, time_of_day_mapping: mapping })}
      />

      <MappingEditor
        title="Atmosphere Enhancement"
        data={data.atmosphere_enhancements}
        onChange={(mapping) => onChange({ ...data, atmosphere_enhancements: mapping })}
      />
    </div>
  )
}

// ============ Action Prompts Editor ============
function ActionPromptsEditor({
  data,
  onChange,
}: {
  data: ActionPromptsConfig
  onChange: (data: ActionPromptsConfig) => void
}) {
  return (
    <div className="space-y-8">
      <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg border border-slate-200">
        Configuration for video generation prompts.
      </div>

      {/* Basic Config */}
      <div className="card p-5">
        <h4 className="font-bold text-slate-900 mb-5 pb-3 border-b border-slate-100">Basic Configuration</h4>
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Default Action</label>
            <input
              type="text"
              value={data.default_action}
              onChange={(e) => onChange({ ...data, default_action: e.target.value })}
              className="input w-full font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Quality Suffix</label>
            <input
              type="text"
              value={data.video_action.quality_suffix}
              onChange={(e) =>
                onChange({
                  ...data,
                  video_action: { ...data.video_action, quality_suffix: e.target.value },
                })
              }
              className="input w-full font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Negative Prompt</label>
            <input
              type="text"
              value={data.video_action.negative_prompt}
              onChange={(e) =>
                onChange({
                  ...data,
                  video_action: { ...data.video_action, negative_prompt: e.target.value },
                })
              }
              className="input w-full font-mono text-sm"
            />
          </div>
        </div>
      </div>

      <MappingEditor
        title="Camera Movement Mapping"
        data={data.camera_movement_mapping}
        onChange={(mapping) => onChange({ ...data, camera_movement_mapping: mapping })}
      />

      <MappingEditor
        title="Action Enhancement"
        data={data.action_enhancements}
        onChange={(mapping) => onChange({ ...data, action_enhancements: mapping })}
      />
    </div>
  )
}

// ============ Chunk Config Editor ============
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
    <div className="space-y-8">
      <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg border border-slate-200">
        Configure script chunking strategy. Supports chunking by chapter markers or character count.
      </div>

      {/* Mode */}
      <div className="card p-5">
        <h4 className="font-bold text-slate-900 mb-5 pb-3 border-b border-slate-100">Chunking Mode</h4>
        <div className="flex gap-6">
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${data.chunk_mode === 'chapter' ? 'border-primary-500 bg-primary-50' : 'border-slate-300'}`}>
              {data.chunk_mode === 'chapter' && <div className="w-2.5 h-2.5 rounded-full bg-primary-500"></div>}
            </div>
            <input
              type="radio"
              name="chunk_mode"
              value="chapter"
              checked={data.chunk_mode === 'chapter'}
              onChange={() => onChange({ ...data, chunk_mode: 'chapter' })}
              className="hidden"
            />
            <span className="font-medium text-slate-700 group-hover:text-primary-600 transition-colors">By Chapter</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer group">
            <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${data.chunk_mode === 'size' ? 'border-primary-500 bg-primary-50' : 'border-slate-300'}`}>
              {data.chunk_mode === 'size' && <div className="w-2.5 h-2.5 rounded-full bg-primary-500"></div>}
            </div>
            <input
              type="radio"
              name="chunk_mode"
              value="size"
              checked={data.chunk_mode === 'size'}
              onChange={() => onChange({ ...data, chunk_mode: 'size' })}
              className="hidden"
            />
            <span className="font-medium text-slate-700 group-hover:text-primary-600 transition-colors">By Size</span>
          </label>
        </div>
      </div>

      {/* Chapter Delimiters */}
      <div className="card p-5">
        <h4 className="font-bold text-slate-900 mb-5 pb-3 border-b border-slate-100">Chapter Delimiters (Regex Supported)</h4>
        <div className="flex flex-wrap gap-2 mb-4">
          {data.chapter_delimiters.map((delimiter, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-sm rounded-lg border border-slate-200"
            >
              <code className="font-mono text-xs">{delimiter}</code>
              <button
                onClick={() => removeDelimiter(index)}
                className="text-slate-400 hover:text-red-500 transition-colors"
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
            placeholder="Add delimiter regex..."
            className="input flex-1 font-mono text-sm"
          />
          <button
            onClick={addDelimiter}
            className="btn btn-secondary"
          >
            Add
          </button>
        </div>
      </div>

      {/* Size Config */}
      <div className="card p-5">
        <h4 className="font-bold text-slate-900 mb-5 pb-3 border-b border-slate-100">Size Configuration</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Fallback Chunk Size
            </label>
            <input
              type="number"
              value={data.fallback_chunk_size}
              onChange={(e) =>
                onChange({ ...data, fallback_chunk_size: parseInt(e.target.value) || 8000 })
              }
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Min Chunk Size
            </label>
            <input
              type="number"
              value={data.min_chunk_size}
              onChange={(e) =>
                onChange({ ...data, min_chunk_size: parseInt(e.target.value) || 1000 })
              }
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Max Chunk Size
            </label>
            <input
              type="number"
              value={data.max_chunk_size}
              onChange={(e) =>
                onChange({ ...data, max_chunk_size: parseInt(e.target.value) || 16000 })
              }
              className="input w-full"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ Mapping Editor ============
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
    <div className="card p-5">
      <h4 className="font-bold text-slate-900 mb-5 pb-3 border-b border-slate-100">{title}</h4>
      <div className="space-y-3 mb-5">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex gap-3 items-center group">
            <input
              type="text"
              value={key}
              readOnly
              className="w-1/3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600"
            />
            <span className="text-slate-300">→</span>
            <input
              type="text"
              value={value}
              onChange={(e) => onChange({ ...data, [key]: e.target.value })}
              className="flex-1 input text-sm"
            />
            <button
              onClick={() => removeMapping(key)}
              className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-3 p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="New Key"
          className="input w-1/3 text-sm bg-white"
        />
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="New Value"
          className="input flex-1 text-sm bg-white"
        />
        <button
          onClick={addMapping}
          className="btn btn-secondary text-sm px-4"
        >
          Add
        </button>
      </div>
    </div>
  )
}

// ============ Workflow Config Editor ============
function WorkflowConfigEditor({
  data,
  onChange,
}: {
  data: WorkflowConfig
  onChange: (data: WorkflowConfig) => void
}) {
  const [expandedWorkflow, setExpandedWorkflow] = useState<string | null>(null)

  const workflowTypes: { key: keyof Pick<WorkflowConfig, 'character_workflows' | 'scene_workflows' | 'video_workflows'>; label: string; icon: string }[] = [
    { key: 'character_workflows', label: 'Character Workflows', icon: '👤' },
    { key: 'scene_workflows', label: 'Scene Workflows', icon: '🖼️' },
    { key: 'video_workflows', label: 'Video Workflows', icon: '🎬' },
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
      name: 'New Workflow',
      description: 'Workflow description',
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
    if (data[type][index].default && workflows.length > 0) {
      workflows[0] = { ...workflows[0], default: true }
    }
    onChange({ ...data, [type]: workflows })
  }

  return (
    <div className="space-y-8">
      <div className="text-sm text-slate-500 bg-slate-50 p-4 rounded-lg border border-slate-200">
        Configure ComfyUI workflow files and parameters.
      </div>

      {/* Workflow Directory */}
      <div className="card p-5">
        <h4 className="font-bold text-slate-900 mb-2">Workflow Directory</h4>
        <input
          type="text"
          value={data.workflow_directory}
          onChange={(e) => onChange({ ...data, workflow_directory: e.target.value })}
          placeholder="comfyui_workflows"
          className="input w-full font-mono text-sm"
        />
        <p className="text-xs text-slate-500 mt-2">
          Directory containing ComfyUI workflow JSON files (relative to backend).
        </p>
      </div>

      {/* Workflow Types */}
      {workflowTypes.map(({ key, label, icon }) => (
        <div key={key} className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <span className="font-bold text-slate-800 flex items-center gap-2">
              <span className="text-xl">{icon}</span>
              <span>{label}</span>
              <span className="text-sm font-normal text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200 shadow-sm ml-2">{data[key].length}</span>
            </span>
            <button
              onClick={() => addWorkflow(key)}
              className="btn btn-secondary text-xs py-1.5"
            >
              + Add Workflow
            </button>
          </div>

          <div className="p-5 space-y-4">
            {data[key].length === 0 ? (
              <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No workflows configured.
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

// ============ Workflow Item Editor ============
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
    <div className={`border rounded-xl transition-all duration-200 ${workflow.default ? 'border-primary-300 ring-4 ring-primary-50 bg-white' : 'border-slate-200 bg-white'}`}>
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 rounded-xl transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          {workflow.default && (
            <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-[10px] font-bold uppercase tracking-wider rounded-full border border-primary-200">
              Default
            </span>
          )}
          <span className="font-semibold text-slate-800 truncate">{workflow.name}</span>
          <span className="text-xs text-slate-400 font-mono hidden sm:inline-block truncate max-w-[200px]">{workflow.workflow_file || '(No File)'}</span>
        </div>
        <div className="flex items-center gap-2">
          {!workflow.default && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onSetDefault()
              }}
              className="px-2 py-1 text-xs font-medium text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
            >
              Set Default
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="px-2 py-1 text-xs font-medium text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            Remove
          </button>
          <span className={`text-slate-300 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-5 py-5 border-t border-slate-100 space-y-5 bg-slate-50/50 rounded-b-xl">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">ID</label>
              <input
                type="text"
                value={workflow.id}
                onChange={(e) => onChange({ ...workflow, id: e.target.value })}
                className="input w-full font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Name</label>
              <input
                type="text"
                value={workflow.name}
                onChange={(e) => onChange({ ...workflow, name: e.target.value })}
                className="input w-full text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Description</label>
            <input
              type="text"
              value={workflow.description}
              onChange={(e) => onChange({ ...workflow, description: e.target.value })}
              className="input w-full text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Workflow File.json</label>
            <input
              type="text"
              value={workflow.workflow_file}
              onChange={(e) => onChange({ ...workflow, workflow_file: e.target.value })}
              placeholder="e.g., character_portrait_flux2.json"
              className="input w-full font-mono text-sm"
            />
          </div>

          {/* Parameters */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Workflow Parameters</label>
            <div className="space-y-3 mb-4">
              {Object.entries(workflow.params).map(([key, value]) => (
                <div key={key} className="flex gap-3 items-center group">
                  <input
                    type="text"
                    value={key}
                    readOnly
                    className="w-1/3 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded text-xs font-mono text-slate-600"
                  />
                  <span className="text-slate-300">=</span>
                  <input
                    type="text"
                    value={String(value ?? '')}
                    onChange={(e) => updateParam(key, e.target.value)}
                    className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-xs font-mono focus:border-primary-400 outline-none transition-colors"
                  />
                  <button
                    onClick={() => removeParam(key)}
                    className="text-slate-300 hover:text-red-500 px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-3 pt-3 border-t border-slate-100">
              <input
                type="text"
                value={newParamKey}
                onChange={(e) => setNewParamKey(e.target.value)}
                placeholder="Param Name"
                className="w-1/3 px-2 py-1.5 border border-slate-200 rounded text-xs font-mono focus:border-primary-400 outline-none"
              />
              <input
                type="text"
                value={newParamValue}
                onChange={(e) => setNewParamValue(e.target.value)}
                placeholder="Value"
                className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-xs font-mono focus:border-primary-400 outline-none"
              />
              <button
                onClick={addParam}
                className="btn btn-secondary text-xs py-1 px-3"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
