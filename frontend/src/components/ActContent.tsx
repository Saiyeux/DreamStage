import { useState, useEffect } from 'react'
import { useProjectStore } from '@/stores/projectStore'
import { fileUrl } from '@/api/client'
import { generationApi } from '@/api/generation'

const isFemale = (gender?: string) => {
    if (!gender) return false
    const g = gender.toLowerCase()
    return g.includes('female') || g.includes('woman') || g.includes('女')
}

export function ActContent({ projectId }: { projectId: string }) {
    const {
        characters,
        scenes,
        healthStatus,
        acts,
        selectedActId,
        addAct,
        updateAct,
        removeAct,
        setSelectedActId,
        addDialogueLine,
        updateDialogueLine,
        removeDialogueLine,
        addStageCharacter,
        removeStageCharacter,
        updateScene,
    } = useProjectStore()

    const [editingActId, setEditingActId] = useState<string | null>(null)
    // Stage keyframe
    const [stagePrompt, setStagePrompt] = useState('')
    const [stageTaskId, setStageTaskId] = useState<string | null>(null)
    const [isGeneratingStage, setIsGeneratingStage] = useState(false)
    const [stageImagePath, setStageImagePath] = useState<string | null>(null)
    // Act video
    const [actVideoTaskId, setActVideoTaskId] = useState<string | null>(null)
    const [isGeneratingVideo, setIsGeneratingVideo] = useState(false)
    const [actVideoPath, setActVideoPath] = useState<string | null>(null)


    const currentAct = acts.find(a => a.id === selectedActId)
    const timelineBeats = currentAct?.dialogueLines || []
    const currentStageScene = scenes.find(s => s.id === currentAct?.stageSceneId)

    const finalizedScenes = scenes.filter(s => s.isFinalized)
    const finalizedChars = characters.filter(c => c.isFinalized)

    const selectedCharIds = new Set(currentAct?.stageCharacters?.map(sc => sc.characterId) ?? [])

    const handleAddAct = () => {
        const newAct = {
            id: `act-${Date.now()}`,
            projectId,
            name: `Act ${acts.length + 1}`,
            stageSceneId: null,
            stageCharacters: [],
            dialogueLines: []
        }
        addAct(newAct)
        setSelectedActId(newAct.id)
        setEditingActId(newAct.id)
    }

    const handleRenameAct = (actId: string, newName: string) => {
        updateAct(actId, { name: newName })
        setEditingActId(null)
    }

    const toggleCharacter = (charId: string) => {
        if (!selectedActId) return
        if (selectedCharIds.has(charId)) {
            removeStageCharacter(selectedActId, charId)
        } else {
            addStageCharacter(selectedActId, { characterId: charId, position: '', action: '', expression: '' })
        }
    }

    // Auto-fill stage prompt when scene/cast selection changes
    useEffect(() => {
        const charNames = currentAct?.stageCharacters?.map(sc => {
            const char = characters.find(c => c.id === sc.characterId)
            return char?.name
        }).filter(Boolean).join('和') || ''
        const sceneStagePrompt = currentStageScene?.stagePrompt || ''
        const location = currentStageScene?.location || ''
        // Auto-fill stage prompt
        if (charNames && sceneStagePrompt) {
            setStagePrompt(`${charNames}${sceneStagePrompt}`)
        } else if (charNames && location) {
            setStagePrompt(`${charNames}站在${location}`)
        } else if (sceneStagePrompt) {
            setStagePrompt(sceneStagePrompt)
        } else if (location) {
            setStagePrompt(`场景：${location}`)
        }

        // Auto-fill narration into dialogue if empty
        if (selectedActId && currentStageScene?.narration && currentAct?.dialogueLines.length === 0) {
            addDialogueLine(selectedActId, {
                id: `narration-${Date.now()}`,
                characterId: 'narrator', // Use a special ID or just dummy
                text: currentStageScene.narration
            })
        }

        // Reset generated assets when selection changes
        setStageImagePath(null)
        setActVideoPath(null)
    }, [selectedActId, currentAct?.stageSceneId, currentAct?.stageCharacters?.length])

    // Poll task status for stage keyframe generation
    useEffect(() => {
        if (!stageTaskId) return
        const interval = setInterval(async () => {
            try {
                const status = await generationApi.getTaskStatus(stageTaskId)
                if (status.status === 'completed') {
                    const result = status.result as { image_path?: string } | null
                    if (result?.image_path && currentAct?.stageSceneId) {
                        const newPath = result.image_path
                        setStageImagePath(newPath)
                        // Also update the global scene state so the "Set" library and other views reflect the composite
                        const scene = scenes.find(s => s.id === currentAct.stageSceneId)
                        if (scene) {
                            updateScene(scene.id, {
                                sceneImage: scene.sceneImage 
                                    ? { ...scene.sceneImage, imagePath: newPath }
                                    : { id: `img-${Date.now()}`, imagePath: newPath, sceneId: scene.id, promptUsed: '', isApproved: true } as any
                            })
                        }
                    }
                    setIsGeneratingStage(false)
                    setStageTaskId(null)
                } else if (status.status === 'failed') {
                    setIsGeneratingStage(false)
                    setStageTaskId(null)
                }
            } catch {
                // ignore transient errors
            }
        }, 2000)
        return () => clearInterval(interval)
    }, [stageTaskId, currentAct?.stageSceneId, scenes, updateScene])

    // Poll task status for act video generation
    useEffect(() => {
        if (!actVideoTaskId) return
        const interval = setInterval(async () => {
            try {
                const status = await generationApi.getTaskStatus(actVideoTaskId)
                if (status.status === 'completed') {
                    const result = status.result as { video_path?: string } | null
                    if (result?.video_path) setActVideoPath(result.video_path)
                    setIsGeneratingVideo(false)
                    setActVideoTaskId(null)
                } else if (status.status === 'failed') {
                    setIsGeneratingVideo(false)
                    setActVideoTaskId(null)
                }
            } catch {
                // ignore transient errors
            }
        }, 3000)
        return () => clearInterval(interval)
    }, [actVideoTaskId])

    const handleGenerateActVideo = async () => {
        const imagePath = stageImagePath || currentStageScene?.sceneImage?.imagePath
        const narration = currentAct?.dialogueLines.map(l => l.text).join('\n') || currentStageScene?.narration || currentStageScene?.dialogue || ''
        if (!imagePath || !narration) return
        setIsGeneratingVideo(true)
        setActVideoPath(null)
        try {
            const response = await generationApi.generateActVideo(projectId, imagePath, narration)
            setActVideoTaskId(response.task_id)
        } catch (e) {
            console.error('Act video generation failed', e)
            setIsGeneratingVideo(false)
        }
    }

    const handleGenerateKeyframe = async () => {
        if (!selectedActId || !currentAct?.stageSceneId) return
        
        const characterIds = currentAct.stageCharacters?.map(sc => sc.characterId) || []
        if (characterIds.length === 0) {
            alert('请先在上方 CAST 中选择至少一位角色，才能使用图像融合合成工作流。')
            return
        }

        setIsGeneratingStage(true)
        setStageImagePath(null)
        try {
            const response = await generationApi.generateStageKeyframe(
                projectId,
                currentAct.stageSceneId,
                characterIds,
                stagePrompt,
            )
            setStageTaskId(response.task_id)
        } catch (e: any) {
            console.error('Stage keyframe generation failed', e)
            alert(`Stage keyframe generation failed: ${e.message || 'Unknown error'}`)
            setIsGeneratingStage(false)
        }
    }

    return (
        <div className="flex h-full w-full overflow-hidden bg-transparent">

            {/* LEFT COLUMN: Library */}
            <aside className="w-72 shrink-0 border-r border-amber-200/50 flex flex-col bg-white/50 backdrop-blur-md p-4 gap-4 overflow-y-auto custom-scrollbar">
                <div className="flex items-center gap-2 px-1">
                    <span className="text-xl">📚</span>
                    <h2 className="text-sm font-extrabold text-slate-800 tracking-tight">Library</h2>
                </div>

                {/* Cast */}
                <div className="card flex flex-col shrink-0 max-h-[280px]">
                    <div className="px-4 py-2.5 border-b border-amber-200/50 flex items-center justify-between shrink-0 bg-amber-100/30 rounded-t-xl">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                            <span>👤</span> Cast
                        </span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">
                            {finalizedChars.length}
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 grid grid-cols-3 gap-2 content-start min-h-[80px]">
                        {finalizedChars.length > 0 ? finalizedChars.map(char => {
                            const mainImage = char.images?.find(img => img.id === char.mainImageId) || char.images?.[0]
                            return (
                                <div key={char.id} className="relative aspect-square rounded-lg overflow-hidden border border-amber-200 bg-white">
                                    {mainImage ? (
                                        <img src={fileUrl.image(mainImage.imagePath)} alt={char.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-50">
                                            <span className="text-xl">{isFemale(char.gender) ? '👩' : '👨'}</span>
                                        </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                                        <span className="text-[9px] font-bold text-white truncate block text-center">{char.name}</span>
                                    </div>
                                </div>
                            )
                        }) : (
                            <div className="col-span-3 flex flex-col items-center justify-center py-6 text-slate-300 gap-1">
                                <span className="text-lg opacity-30">👤</span>
                                <span className="text-[10px]">No finalized cast</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sets */}
                <div className="card flex flex-col shrink-0 max-h-[280px]">
                    <div className="px-4 py-2.5 border-b border-amber-200/50 flex items-center justify-between shrink-0 bg-amber-100/30 rounded-t-xl">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                            <span>🎬</span> Sets
                        </span>
                        <span className="text-[10px] bg-amber-200/50 text-amber-900 px-1.5 py-0.5 rounded-full font-medium">
                            {finalizedScenes.length}
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1.5 min-h-[80px]">
                        {finalizedScenes.length > 0 ? finalizedScenes.map(scene => (
                            <div key={scene.id} className="flex items-center gap-2 p-1.5 rounded-lg border border-amber-200 bg-white">
                                <div className="w-10 h-7 rounded bg-amber-50 overflow-hidden shrink-0 border border-amber-100">
                                    {scene.sceneImage ? (
                                        <img src={fileUrl.image(scene.sceneImage.imagePath)} alt={scene.location} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-300">🎬</div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[10px] font-bold text-slate-800 truncate">{scene.location}</div>
                                    <div className="text-[9px] text-slate-500 truncate">{scene.timeOfDay}</div>
                                </div>
                            </div>
                        )) : (
                            <div className="flex flex-col items-center justify-center py-6 text-slate-300 gap-1">
                                <span className="text-lg opacity-30">🎬</span>
                                <span className="text-[10px]">No finalized sets</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Act List */}
                <div className="card bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 min-h-[160px]">
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white rounded-t-xl">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                            <span>🎭</span> Act
                        </span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">{acts.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col">
                        {acts.length > 0 && (
                            <div className="space-y-2 flex-1">
                                {acts.map((act) => (
                                    <div
                                        key={act.id}
                                        onClick={() => setSelectedActId(act.id)}
                                        className={`group relative flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${selectedActId === act.id
                                            ? 'bg-indigo-50 border-indigo-300 shadow-sm'
                                            : 'bg-white border-slate-200 hover:border-slate-300'}`}
                                    >
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${selectedActId === act.id ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                            {acts.indexOf(act) + 1}
                                        </div>
                                        {editingActId === act.id ? (
                                            <input
                                                type="text"
                                                className="flex-1 text-xs font-medium bg-white border border-indigo-300 rounded px-2 py-1 focus:outline-none"
                                                defaultValue={act.name}
                                                autoFocus
                                                onBlur={e => handleRenameAct(act.id, e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleRenameAct(act.id, (e.target as HTMLInputElement).value)
                                                    if (e.key === 'Escape') setEditingActId(null)
                                                }}
                                                onClick={e => e.stopPropagation()}
                                            />
                                        ) : (
                                            <span
                                                className="flex-1 text-xs font-medium text-slate-700 truncate"
                                                onDoubleClick={e => { e.stopPropagation(); setEditingActId(act.id) }}
                                            >
                                                {act.name}
                                            </span>
                                        )}
                                        <button
                                            onClick={e => { e.stopPropagation(); removeAct(act.id) }}
                                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 p-1 transition-all"
                                        >✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <button
                            onClick={handleAddAct}
                            className={`border-2 border-dashed border-slate-200 rounded-lg text-xs text-slate-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-all flex items-center justify-center gap-1 ${acts.length === 0 ? 'flex-1 min-h-[80px]' : 'py-2 mt-2'}`}
                        >
                            <span className="text-lg">+</span>
                            {acts.length === 0 && <span>New Act</span>}
                        </button>
                    </div>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main className="flex-1 min-w-0 bg-transparent p-6 overflow-y-auto flex flex-col gap-6">

                {/* Empty state */}
                {!selectedActId && (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
                        <div className="w-24 h-24 rounded-3xl bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center">
                            <span className="text-4xl opacity-30">🎭</span>
                        </div>
                        <div className="text-center">
                            <h3 className="text-lg font-bold text-slate-600 mb-1">No Act Selected</h3>
                            <p className="text-sm">Create and select an act from the left panel</p>
                        </div>
                    </div>
                )}

                {selectedActId && (
                    <div className="flex flex-col gap-6 flex-1">

                        {/* TOP: Stage + Video */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[400px]">

                            {/* STAGE */}
                            <div className="card overflow-hidden flex flex-col">
                                <div className="h-12 border-b border-amber-200/50 flex items-center justify-between px-4 bg-amber-100/30 shrink-0">
                                    <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                        <span>🎭</span> Stage
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => updateAct(selectedActId, { stageSceneId: null, stageCharacters: [] })}
                                            className="text-xs px-2 py-1 text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                            Clear
                                        </button>
                                        <button
                                            onClick={handleGenerateKeyframe}
                                            disabled={isGeneratingStage || !currentAct?.stageSceneId || !currentAct.stageCharacters?.length}
                                            title={!currentAct?.stageCharacters?.length ? "请选择角色" : ""}
                                            className="text-xs px-2 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                        >
                                            {isGeneratingStage ? (
                                                <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> Generating...</>
                                            ) : <><span className={isGeneratingStage ? "animate-spin" : ""}>✨</span> Generate</>}
                                        </button>
                                    </div>
                                </div>

                                {/* Scene selector */}
                                <div className="px-4 py-2.5 border-b border-amber-100 bg-amber-50/40 flex items-center gap-2">
                                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide shrink-0">Scene</span>
                                    <select
                                        value={currentAct?.stageSceneId ?? ''}
                                        onChange={e => updateAct(selectedActId, { stageSceneId: e.target.value || null })}
                                        className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:border-amber-400"
                                    >
                                        <option value="">— No scene selected —</option>
                                        {finalizedScenes.map(s => (
                                            <option key={s.id} value={s.id}>
                                                #{s.sceneNumber} {s.location}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Character selector */}
                                <div className="px-4 py-2.5 border-b border-amber-100 bg-amber-50/20 flex items-start gap-2">
                                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide shrink-0 mt-1">Cast</span>
                                    <div className="flex flex-wrap gap-1.5 flex-1">
                                        {finalizedChars.length === 0 ? (
                                            <span className="text-xs text-slate-400 italic">No finalized characters</span>
                                        ) : finalizedChars.map(char => {
                                            const selected = selectedCharIds.has(char.id)
                                            const mainImage = char.images?.find(img => img.id === char.mainImageId) || char.images?.[0]
                                            return (
                                                <button
                                                    key={char.id}
                                                    onClick={() => toggleCharacter(char.id)}
                                                    className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium border transition-all ${
                                                        selected
                                                            ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm'
                                                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                                                    }`}
                                                >
                                                    <div className="w-4 h-4 rounded-full overflow-hidden bg-slate-200 shrink-0">
                                                        {mainImage ? (
                                                            <img src={fileUrl.image(mainImage.imagePath)} alt={char.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="text-[8px] flex items-center justify-center h-full">{isFemale(char.gender) ? '👩' : '👨'}</span>
                                                        )}
                                                    </div>
                                                    {char.name}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Stage Prompt */}
                                <div className="px-4 py-2.5 border-b border-amber-100 bg-amber-50/10 flex items-start gap-2">
                                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide shrink-0 mt-1.5">Prompt</span>
                                    <textarea
                                        value={stagePrompt}
                                        onChange={e => setStagePrompt(e.target.value)}
                                        placeholder="Describe the scene, e.g. 角色站在背景中..."
                                        rows={2}
                                        className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:border-indigo-400 resize-none leading-relaxed"
                                    />
                                </div>

                                {/* Preview */}
                                <div className="flex-1 flex items-center justify-center bg-slate-50/50 relative">
                                    {isGeneratingStage ? (
                                        <div className="flex flex-col items-center gap-3 text-slate-400">
                                            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                            <span className="text-xs animate-pulse">Compositing keyframe...</span>
                                        </div>
                                    ) : stageImagePath ? (
                                        <div className="relative w-full h-full p-4 flex items-center justify-center">
                                            <img
                                                src={fileUrl.image(stageImagePath)}
                                                alt="Stage Keyframe"
                                                className="max-w-full max-h-full object-contain drop-shadow-lg rounded-lg"
                                            />
                                        </div>
                                    ) : currentStageScene?.sceneImage ? (
                                        <div className="relative w-full h-full p-4 flex items-center justify-center">
                                            <img
                                                src={fileUrl.image(currentStageScene.sceneImage.imagePath)}
                                                alt="Stage"
                                                className="max-w-full max-h-full object-contain drop-shadow-lg rounded-lg"
                                            />
                                            {/* Selected character avatars overlay */}
                                            {currentAct!.stageCharacters?.length > 0 && (
                                                <div className="absolute bottom-3 left-3 flex gap-1.5">
                                                    {currentAct!.stageCharacters.map(sc => {
                                                        const char = characters.find(c => c.id === sc.characterId)
                                                        const img = char?.images?.find(i => i.id === char.mainImageId) || char?.images?.[0]
                                                        return char ? (
                                                            <div key={sc.characterId} className="relative group">
                                                                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-md bg-slate-200">
                                                                    {img ? <img src={fileUrl.image(img.imagePath)} alt={char.name} className="w-full h-full object-cover" /> : <span className="text-base flex items-center justify-center h-full">{isFemale(char.gender) ? '👩' : '👨'}</span>}
                                                                </div>
                                                                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-white drop-shadow whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">{char.name}</div>
                                                            </div>
                                                        ) : null
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-3 text-slate-300">
                                            <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center">
                                                <span className="text-2xl opacity-50">🎬</span>
                                            </div>
                                            <div className="text-sm font-medium text-slate-400">Stage Preview</div>
                                            <span className="text-xs text-slate-400">Select a scene above</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* VIDEO */}
                            <div className="card bg-slate-900 rounded-xl shadow-lg border border-slate-800 overflow-hidden flex flex-col">
                                <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900 shrink-0">
                                    <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
                                        <span>🎥</span> Video Output
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => { if (confirm('Clear entire Act?')) updateAct(selectedActId, { stageSceneId: null, stageCharacters: [], dialogueLines: [] }) }}
                                            className="text-xs px-2 py-1 text-slate-500 hover:text-white transition-colors"
                                        >Reset</button>
                                        <button
                                            onClick={handleGenerateActVideo}
                                            disabled={isGeneratingVideo || !healthStatus?.comfyui?.connected || !(stageImagePath || currentStageScene?.sceneImage) || !currentStageScene?.dialogue}
                                            className="btn btn-primary text-xs px-3 py-1.5 shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                        >
                                            {isGeneratingVideo ? (
                                                <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> Generating...</>
                                            ) : '▶ Generate'}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 flex items-center justify-center bg-black/50">
                                    {isGeneratingVideo ? (
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                            <div className="text-indigo-400 text-xs animate-pulse">TTS → Video → Merge...</div>
                                        </div>
                                    ) : actVideoPath ? (
                                        <video
                                            key={actVideoPath}
                                            src={`/files/${actVideoPath}`}
                                            controls
                                            className="w-full h-full object-contain"
                                        />
                                    ) : (
                                        <div className="text-slate-700 text-sm flex flex-col items-center gap-2">
                                            <span className="text-4xl opacity-20">🎞️</span>
                                            <span>Video Preview</span>
                                            {!currentStageScene?.dialogue && currentStageScene && (
                                                <span className="text-xs text-slate-600 mt-1">Narration needed to generate video</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* BOTTOM: Dialogue + Script */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[400px]">

                            {/* Dialogue Lines */}
                            <div className="card bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
                                <div className="h-12 border-b border-slate-100 flex items-center px-6 bg-white shrink-0">
                                    <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                        <span>💬</span> Dialogue Lines
                                    </span>
                                    <span className="ml-auto text-xs text-slate-400">{timelineBeats.length} lines</span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50/30 flex flex-col min-h-[200px]">
                                    {timelineBeats.length === 0 ? (
                                        <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-3">
                                            <button
                                                onClick={() => {
                                                    if (!selectedActId || finalizedChars.length === 0) return
                                                    addDialogueLine(selectedActId, { id: `line-${Date.now()}`, characterId: finalizedChars[0].id, text: '' })
                                                }}
                                                disabled={finalizedChars.length === 0}
                                                className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-500 transition-all text-3xl disabled:opacity-50 disabled:cursor-not-allowed"
                                            >+</button>
                                            <span className="text-sm">{finalizedChars.length === 0 ? 'Please finalize cast' : 'Add dialogue lines'}</span>
                                        </div>
                                    ) : (
                                        timelineBeats.map(beat => {
                                            const isNarrator = beat.characterId === 'narrator'
                                            const char = characters.find(c => c.id === beat.characterId)
                                            return (
                                                <div key={beat.id} className={`group flex gap-4 items-start p-4 bg-white rounded-xl border shadow-sm hover:shadow-md transition-all ${isNarrator ? 'border-amber-200 bg-amber-50/20' : 'border-slate-200 hover:border-slate-300'}`}>
                                                    <div className="relative shrink-0 group/char cursor-pointer">
                                                        <div className={`w-10 h-10 rounded-full bg-slate-100 overflow-hidden border-2 shadow-sm flex items-center justify-center ${isNarrator ? 'border-amber-400 bg-amber-100' : isFemale(char?.gender) ? 'border-pink-300' : 'border-blue-300'}`}>
                                                            {isNarrator ? (
                                                                <span className="text-xl">🎙️</span>
                                                            ) : char?.images?.[0] ? (
                                                                <img src={fileUrl.image(char.images[0].imagePath)} alt={char.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="text-xs">{isFemale(char?.gender) ? '👩' : '👨'}</span>
                                                            )}
                                                        </div>
                                                        <select
                                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                            value={beat.characterId}
                                                            onChange={e => selectedActId && updateDialogueLine(selectedActId, beat.id, { characterId: e.target.value })}
                                                        >
                                                            <option value="narrator">🎙️ Narrator</option>
                                                            {finalizedChars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                            {!finalizedChars.find(c => c.id === beat.characterId) && !isNarrator && <option value={beat.characterId}>Unknown</option>}
                                                        </select>
                                                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border flex items-center justify-center shadow-sm pointer-events-none ${isNarrator ? 'bg-amber-50 border-amber-200' : isFemale(char?.gender) ? 'bg-pink-50 border-pink-200' : 'bg-blue-50 border-blue-200'}`}>
                                                            <span className="text-[8px]">▼</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <div className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block ${isNarrator ? 'text-amber-700 bg-amber-100' : isFemale(char?.gender) ? 'text-pink-600 bg-pink-50' : 'text-blue-600 bg-blue-50'}`}>
                                                                {isNarrator ? 'Narrator' : char?.name || 'Unknown'}
                                                            </div>
                                                            <button
                                                                onClick={() => selectedActId && removeDialogueLine(selectedActId, beat.id)}
                                                                className="text-slate-300 hover:text-red-500 p-1 transition-all opacity-0 group-hover:opacity-100"
                                                            >✕</button>
                                                        </div>
                                                        <textarea
                                                            className={`w-full text-sm border rounded-lg p-3 focus:ring-1 transition-all resize-none leading-relaxed ${isNarrator ? 'border-amber-200 bg-amber-50/30 focus:border-amber-400 focus:ring-amber-400' : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500 focus:ring-indigo-500'}`}
                                                            rows={2}
                                                            placeholder={isNarrator ? "Type narrator text..." : "Type dialogue..."}
                                                            value={beat.text}
                                                            onChange={e => selectedActId && updateDialogueLine(selectedActId, beat.id, { text: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                            )
                                        })
                                    )}
                                    {timelineBeats.length > 0 && (
                                        <button
                                            onClick={() => {
                                                if (!selectedActId || finalizedChars.length === 0) return
                                                addDialogueLine(selectedActId, { id: `line-${Date.now()}`, characterId: finalizedChars[0].id, text: '' })
                                            }}
                                            disabled={finalizedChars.length === 0}
                                            className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-all flex items-center justify-center text-xl disabled:opacity-50"
                                        >+</button>
                                    )}
                                </div>
                            </div>

                            {/* Script Preview */}
                            <div className="card bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                                <div className="h-12 border-b border-slate-100 flex items-center px-6 bg-white shrink-0">
                                    <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                        <span>📄</span> Script Preview
                                    </span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 font-mono text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                                    {currentStageScene?.scriptContent ? currentStageScene.scriptContent : (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                                            <span className="text-4xl opacity-20">📝</span>
                                            <span className="text-xs">No script content available</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}
