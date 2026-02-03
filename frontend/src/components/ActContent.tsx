import { useState } from 'react'
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core'
import { useProjectStore } from '@/stores/projectStore'
import { fileUrl } from '@/api/client'

// ------------------------------------------------------------------
// Draggable Asset Component
// ------------------------------------------------------------------

function DraggableAsset({ id, type, data, disabled, children }: { id: string, type: 'character' | 'scene', data: any, disabled?: boolean, children: React.ReactNode }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `${type}-${id}`,
        data: { type, item: data },
        disabled
    })

    if (disabled) {
        return <div className="opacity-50 grayscale cursor-not-allowed">{children}</div>
    }

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={`cursor-move transition-all ${isDragging ? 'opacity-50 scale-95' : 'opacity-100 hover:scale-105'}`}
        >
            {children}
        </div>
    )
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

export function ActContent({ projectId: _projectId }: { projectId: string }) {
    const { characters, scenes, currentProject, healthStatus } = useProjectStore()

    // State
    const [activeStageSceneId, setActiveStageSceneId] = useState<string | null>(null)
    const [timelineBeats, setTimelineBeats] = useState<Array<{ id: string, characterId: string, text: string }>>([])
    const [isGenerating, setIsGenerating] = useState(false)
    const [activeDragItem, setActiveDragItem] = useState<{ type: 'character' | 'scene', item: any } | null>(null)

    // Droppable Hooks
    const { setNodeRef: setStageRef, isOver: isOverStage } = useDroppable({
        id: 'stage-drop',
        data: { accept: 'scene' }
    })

    const { setNodeRef: setLinesRef, isOver: isOverLines } = useDroppable({
        id: 'lines-drop',
        data: { accept: 'character' }
    })

    // DnD Handlers
    const handleDragStart = (event: any) => {
        setActiveDragItem(event.active.data.current)
    }

    const handleDragEnd = (event: any) => {
        const { active, over } = event
        setActiveDragItem(null)

        if (!over) return

        const itemType = active.data.current?.type
        const itemData = active.data.current?.item

        if (over.id === 'stage-drop' && itemType === 'scene') {
            setActiveStageSceneId(itemData.id)
        }

        if (over.id === 'lines-drop' && itemType === 'character') {
            const newBeat = {
                id: `beat-${Date.now()}`,
                characterId: itemData.id,
                text: ''
            }
            setTimelineBeats(prev => [...prev, newBeat])
        }
    }

    const currentStageScene = scenes.find(s => s.id === activeStageSceneId)

    return (
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex h-full w-full overflow-hidden bg-transparent">

                {/* LEFT COLUMN: Unified Library */}
                {/* LEFT COLUMN: Unified Library */}
                <aside className="w-80 shrink-0 border-r border-amber-200/50 flex flex-col bg-white/50 backdrop-blur-md p-4 gap-4 overflow-y-auto custom-scrollbar">

                    {/* Header - Now just a visual title or removed since cards have headers */}
                    <div className="flex items-center gap-2 px-1">
                        <span className="text-xl">📚</span>
                        <h2 className="text-sm font-extrabold text-slate-800 tracking-tight">Library</h2>
                    </div>

                    {/* 1. CAST Section - Uses global .card (Amber-50) */}
                    <div className="card flex flex-col shrink-0 max-h-[300px]">
                        <div className="px-4 py-3 border-b border-amber-200/50 flex items-center justify-between shrink-0 bg-amber-100/30 rounded-t-xl">
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                <span>👤</span> Cast
                            </span>
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">
                                {characters.filter(c => c.isFinalized).length}
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 grid grid-cols-3 gap-2 content-start min-h-[100px]">
                            {characters.filter(c => c.isFinalized).length > 0 ? (
                                characters.filter(c => c.isFinalized).map(char => {
                                    const mainImage = char.images?.find(img => img.id === char.mainImageId) || char.images?.[0]
                                    return (
                                        <DraggableAsset key={char.id} id={char.id} type="character" data={char}>
                                            <div className="group relative aspect-square rounded-lg overflow-hidden border border-amber-200 bg-white hover:border-amber-400 hover:shadow-md transition-all cursor-grab active:cursor-grabbing">
                                                {mainImage ? (
                                                    <img src={fileUrl.image(mainImage.imagePath)} alt={char.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-slate-50">
                                                        <span className="text-xl">{char.gender?.includes('Female') ? '👩' : '👨'}</span>
                                                    </div>
                                                )}
                                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1">
                                                    <span className="text-[9px] font-bold text-white truncate block text-center leading-tight shadow-black/50 drop-shadow-sm">{char.name}</span>
                                                </div>
                                            </div>
                                        </DraggableAsset>
                                    )
                                })
                            ) : (
                                <div className="col-span-3 flex flex-col items-center justify-center py-6 text-slate-300 gap-2">
                                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                                        <span className="text-lg opacity-30">👤</span>
                                    </div>
                                    <span className="text-[10px]">No finalized cast</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. STAGE Section (Sets) */}
                    <div className="card flex flex-col shrink-0 max-h-[300px]">
                        <div className="px-4 py-3 border-b border-amber-200/50 flex items-center justify-between shrink-0 bg-amber-100/30 rounded-t-xl">
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                <span>🎬</span> Sets
                            </span>
                            <span className="text-[10px] bg-amber-200/50 text-amber-900 px-1.5 py-0.5 rounded-full font-medium">
                                {scenes.filter(s => s.isFinalized).length}
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 min-h-[100px]">
                            {scenes.filter(s => s.isFinalized).length > 0 ? (
                                scenes.filter(s => s.isFinalized).map(scene => (
                                    <DraggableAsset key={scene.id} id={scene.id} type="scene" data={scene}>
                                        <div className="flex items-center gap-3 p-1.5 rounded-lg border border-amber-200 hover:border-amber-400 hover:shadow-sm transition-all bg-white group cursor-grab active:cursor-grabbing">
                                            <div className="w-10 h-7 rounded bg-amber-50 overflow-hidden shrink-0 border border-amber-100 relative">
                                                {scene.sceneImage ? (
                                                    <img src={fileUrl.image(scene.sceneImage.imagePath)} alt={scene.location} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-300">🎬</div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[10px] font-bold text-slate-800 truncate group-hover:text-amber-700 transition-colors">{scene.location}</div>
                                                <div className="text-[9px] text-slate-500 truncate">{scene.timeOfDay} • {scene.atmosphere}</div>
                                            </div>
                                        </div>
                                    </DraggableAsset>
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center py-6 text-slate-300 gap-2">
                                    <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                                        <span className="text-lg opacity-30">🎬</span>
                                    </div>
                                    <span className="text-[10px]">No finalized sets</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 3. ACT Section (Analysis) */}
                    <div className="card bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 min-h-[200px]">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white rounded-t-xl">
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                <span>🎭</span> Act Analysis
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 relative">
                            {currentProject?.actAnalysis && currentProject.actAnalysis.length > 0 ? (
                                <div className="space-y-4 relative before:absolute before:left-3.5 before:top-2 before:bottom-0 before:w-0.5 before:bg-amber-200">
                                    {currentProject.actAnalysis.map((beat, index) => (
                                        <div key={beat.id || index} className="relative z-0 pl-8 group">
                                            <div className="absolute left-1.5 top-1.5 w-4 h-4 rounded-full bg-amber-400 border-2 border-amber-600 group-hover:border-amber-500 group-hover:scale-110 transition-all z-10 shadow-sm"></div>
                                            <div className="bg-white rounded-lg border border-amber-200 p-2.5 hover:border-amber-400 hover:shadow-md transition-all cursor-default">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Beat {index + 1}</span>
                                                    {beat.characterName && <span className="text-[9px] font-bold text-slate-500 bg-white border border-slate-100 px-1.5 rounded">{beat.characterName}</span>}
                                                </div>
                                                <p className="text-[10px] text-slate-600 leading-relaxed font-medium mb-1">{beat.action}</p>
                                                {beat.dialogue && (
                                                    <div className="text-[10px] text-slate-500 italic pl-2 border-l-2 border-indigo-100">
                                                        "{beat.dialogue}"
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center p-4">
                                    <div className="w-12 h-12 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-center mb-3 shadow-sm">
                                        <span className="text-2xl opacity-30">🎭</span>
                                    </div>
                                    <h3 className="text-xs font-bold text-slate-700 mb-1">No Analysis</h3>
                                    <p className="text-[10px] text-slate-400">Run "Act Analysis" to generate beats.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </aside>

                {/* MAIN CONTENT AREA */}
                {/* MAIN CONTENT AREA */}
                <main className="flex-1 min-w-0 bg-transparent p-6 overflow-y-auto flex flex-col gap-6">

                    {/* TOP SECTION: Stage + Video Split */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[400px]">

                        {/* STAGE AREA (Left Half) */}
                        <div className="card overflow-hidden flex flex-col">
                            {/* Header */}
                            <div className="h-12 border-b border-amber-200/50 flex items-center justify-between px-4 bg-amber-100/30 shrink-0">
                                <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                    <span>🎭</span> Stage
                                </span>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => setActiveStageSceneId(null)}
                                        className="text-xs px-2 py-1 text-slate-400 hover:text-red-500 transition-colors"
                                        title="Clear Stage"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>

                            {/* Preview */}
                            <div
                                ref={setStageRef}
                                className={`flex-1 flex items-center justify-center bg-slate-50/50 relative transition-all duration-300 ${isOverStage ? 'bg-indigo-50/50 ring-2 ring-indigo-400 ring-inset' : ''}`}
                            >
                                {currentStageScene?.sceneImage ? (
                                    <div className="relative w-full h-full p-6 flex items-center justify-center">
                                        <img
                                            src={fileUrl.image(currentStageScene.sceneImage.imagePath)}
                                            alt="Stage"
                                            className="max-w-full max-h-full object-contain drop-shadow-lg rounded-lg"
                                        />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-3 text-slate-300">
                                        <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center">
                                            <span className="text-2xl opacity-50">🎬</span>
                                        </div>
                                        <div className="text-sm font-medium text-slate-400">Stage Preview</div>
                                        <span className="text-xs px-3 py-1 bg-slate-100 rounded-full text-slate-400">Drag scene here</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* VIDEO AREA (Right Half) */}
                        <div className="card bg-slate-900 rounded-xl shadow-lg border border-slate-800 overflow-hidden flex flex-col">
                            {/* Header */}
                            <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4 bg-slate-900 shrink-0">
                                <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
                                    <span>🎥</span> Video Output
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            if (confirm('Clear entire Act?')) {
                                                setActiveStageSceneId(null)
                                                setTimelineBeats([])
                                            }
                                        }}
                                        className="text-xs px-2 py-1 text-slate-500 hover:text-white transition-colors"
                                    >
                                        Reset
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsGenerating(true)
                                            setTimeout(() => setIsGenerating(false), 3000)
                                        }}
                                        disabled={isGenerating || !healthStatus?.comfyui?.connected}
                                        title={!healthStatus?.comfyui?.connected ? 'Please check ComfyUI service' : ''}
                                        className="btn btn-primary text-xs px-3 py-1.5 shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isGenerating ? 'Generating...' : '▶ Generate'}
                                    </button>
                                </div>
                            </div>

                            {/* Preview */}
                            <div className="flex-1 flex items-center justify-center bg-black/50">
                                {isGenerating ? (
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                        <div className="text-indigo-400 text-xs animate-pulse">Processing Video...</div>
                                    </div>
                                ) : (
                                    <div className="text-slate-700 text-sm flex flex-col items-center gap-2">
                                        <span className="text-4xl opacity-20">🎞️</span>
                                        <span>Video Preview</span>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* BOTTOM SECTION: Script & Lines */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[400px]">

                        {/* LEFT: Script Preview */}
                        <div className="card bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                            <div className="h-12 border-b border-slate-100 flex items-center px-6 bg-white shrink-0 justify-between">
                                <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                    <span>📄</span> Script Preview
                                </span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 font-mono text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                                {currentStageScene?.scriptContent ? (
                                    currentStageScene.scriptContent
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                                        <span className="text-4xl opacity-20">📝</span>
                                        <span className="text-xs">No script content available for this scene.</span>
                                        <span className="text-[10px] text-slate-400 max-w-[200px] text-center">Try re-analyzing scenes with the latest version.</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT: Dialogue Lines */}
                        <div
                            ref={setLinesRef}
                            className={`card bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col transition-all duration-300 ${isOverLines ? 'ring-2 ring-indigo-400 ring-inset shadow-indigo-100' : ''}`}
                        >
                            <div className="h-12 border-b border-slate-100 flex items-center px-6 bg-white shrink-0">
                                <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                    <span>💬</span> Dialogue Lines
                                </span>
                                <span className="ml-auto text-xs text-slate-400">
                                    {timelineBeats.length} lines
                                </span>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50/30">
                                {timelineBeats.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-3">
                                        <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                                            <span className="text-2xl opacity-50">🗣️</span>
                                        </div>
                                        <span className="text-sm">Drag characters here to add dialogue lines</span>
                                    </div>
                                ) : (
                                    timelineBeats.map((beat) => {
                                        const char = characters.find(c => c.id === beat.characterId)
                                        return (
                                            <div key={beat.id} className="group flex gap-4 items-start p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 hover:shadow-md transition-all">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden shrink-0 border border-slate-200 shadow-sm">
                                                    {char?.images?.[0] ? (
                                                        <img src={fileUrl.image(char.images[0].imagePath)} alt={char.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-xs">
                                                            {char?.gender?.includes('Female') ? '👩' : '👨'}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <div className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full inline-block">
                                                            {char?.name || 'Unknown'}
                                                        </div>
                                                        <button
                                                            onClick={() => setTimelineBeats(prev => prev.filter(b => b.id !== beat.id))}
                                                            className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all"
                                                            title="Remove line"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                    <textarea
                                                        className="w-full text-sm border border-slate-200 rounded-lg p-3 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none bg-slate-50 focus:bg-white leading-relaxed"
                                                        rows={2}
                                                        placeholder="Type dialogue..."
                                                        value={beat.text}
                                                        onChange={(e) => {
                                                            setTimelineBeats(prev => prev.map(b => b.id === beat.id ? { ...b, text: e.target.value } : b))
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                </main>

                {/* Drag Overlay */}
                <DragOverlay>
                    {activeDragItem ? (
                        <div className="bg-white p-2 rounded shadow-xl border-2 border-indigo-500 opacity-90 scale-105">
                            {activeDragItem.type === 'character' ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-slate-200 rounded overflow-hidden">
                                        {activeDragItem.item.images?.[0] && (
                                            <img src={fileUrl.image(activeDragItem.item.images[0].imagePath)} className="w-full h-full object-cover" />
                                        )}
                                    </div>
                                    <span className="text-sm font-semibold">{activeDragItem.item.name}</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <div className="w-12 h-8 bg-slate-200 rounded overflow-hidden">
                                        {activeDragItem.item.sceneImage && (
                                            <img src={fileUrl.image(activeDragItem.item.sceneImage.imagePath)} className="w-full h-full object-cover" />
                                        )}
                                    </div>
                                    <span className="text-sm font-semibold">{activeDragItem.item.location}</span>
                                </div>
                            )}
                        </div>
                    ) : null}
                </DragOverlay>

            </div >
        </DndContext >
    )
}
