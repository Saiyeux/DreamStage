import { useState } from 'react'
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core'
import { useProjectStore } from '@/stores/projectStore'
import { fileUrl } from '@/api/client'
import { analysisApi } from '@/api'

// ------------------------------------------------------------------
// Draggable Asset Component
// ------------------------------------------------------------------

function DraggableAsset({ id, type, data, children }: { id: string, type: 'character' | 'scene', data: any, children: React.ReactNode }) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `${type}-${id}`,
        data: { type, item: data }
    })

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={`cursor-move transition-opacity ${isDragging ? 'opacity-50' : 'opacity-100'}`}
        >
            {children}
        </div>
    )
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

export function ActContent({ projectId }: { projectId: string }) {
    const { characters, scenes, currentProject, setScenes } = useProjectStore()

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

    const handleUpdateScene = async (field: string, value: string) => {
        if (!activeStageSceneId || !projectId) return

        // Optimistic update
        setScenes(scenes.map(s => s.id === activeStageSceneId ? { ...s, [field]: value } : s))

        try {
            await analysisApi.updateScene(projectId, activeStageSceneId, { [field]: value })
        } catch (err) {
            console.error('Failed to update scene:', err)
            // Revert on error (optional, or just alert)
        }
    }

    return (
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex h-full w-full overflow-hidden bg-slate-50">

                {/* LEFT COLUMN: Library + Reference */}
                <aside className="w-64 shrink-0 border-r border-slate-200 flex flex-col">
                    {/* Library Section */}
                    <div className="h-1/2 border-b border-slate-200 flex flex-col min-h-0 bg-white">
                        {/* Fixed Header */}
                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 shrink-0">
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Library</span>
                        </div>

                        {/* Split Scrollable Content */}
                        <div className="flex-1 flex flex-col min-h-0">
                            {/* Characters (Top Half) */}
                            <div className="flex-1 flex flex-col min-h-0 border-b border-slate-200">
                                <div className="px-3 py-1 bg-white border-b border-slate-200 shrink-0">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cast</span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 bg-white">
                                    <div className="space-y-2">
                                        {characters.map(char => (
                                            <DraggableAsset key={char.id} id={char.id} type="character" data={char}>
                                                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing">
                                                    <div className="w-8 h-8 rounded bg-slate-200 overflow-hidden shrink-0 border border-slate-100">
                                                        {char.images?.[0] ? (
                                                            <img src={fileUrl.image(char.images[0].imagePath)} alt={char.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                                                                {char.gender?.includes('Female') ? '👩' : '👨'}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className="text-xs font-medium text-slate-700 truncate">{char.name}</span>
                                                </div>
                                            </DraggableAsset>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Scenes (Bottom Half) */}
                            <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
                                <div className="px-3 py-1 bg-slate-50 border-b border-slate-200 shrink-0">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Sets</span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3">
                                    <div className="space-y-2">
                                        {scenes.map(scene => (
                                            <DraggableAsset key={scene.id} id={scene.id} type="scene" data={scene}>
                                                <div className="flex items-center gap-2 p-2 bg-white rounded border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing">
                                                    <div className="w-12 h-8 rounded bg-slate-200 overflow-hidden shrink-0 border border-slate-100">
                                                        {scene.sceneImage ? (
                                                            <img src={fileUrl.image(scene.sceneImage.imagePath)} alt={scene.location} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">🎬</div>
                                                        )}
                                                    </div>
                                                    <span className="text-xs font-medium text-slate-700 truncate">{scene.location}</span>
                                                </div>
                                            </DraggableAsset>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Reference Section */}
                    <div className="h-1/2 overflow-y-auto p-4 bg-slate-50">
                        <div className="text-sm font-semibold mb-2 text-slate-700 flex justify-between items-center">
                            <span>Act Analysis</span>
                            <span className="text-[10px] text-slate-400 font-normal">Editable Reference</span>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                            {currentProject?.actAnalysis && currentProject.actAnalysis.length > 0 ? (
                                <div className="space-y-2">
                                    {currentProject.actAnalysis.map((beat, index) => (
                                        <div key={beat.id || index} className="p-2 bg-white rounded border border-slate-200 text-xs">
                                            <div className="font-bold text-slate-700 mb-1">Beat {index + 1}</div>
                                            <div className="text-slate-600 mb-1">{beat.action}</div>
                                            {beat.dialogue && (
                                                <div className="pl-2 border-l-2 border-slate-300 text-slate-500 italic">
                                                    {beat.dialogue}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-xs text-slate-600 whitespace-pre-wrap font-mono leading-relaxed p-4">
                                    {currentProject?.scriptText || "No script content available."}
                                </div>
                            )}
                        </div>
                    </div>
                </aside>

                {/* MAIN CONTENT AREA */}
                {/* MAIN CONTENT AREA */}
                <main className="flex-1 min-w-0 bg-slate-50 p-6 overflow-y-auto flex flex-col gap-6">

                    {/* TOP SECTION: Stage + Video Split */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[400px]">

                        {/* STAGE AREA (Left Half) */}
                        <div className="card bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                            {/* Header */}
                            <div className="h-12 border-b border-slate-100 flex items-center justify-between px-4 bg-white shrink-0">
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

                            {/* Scene Controls Toolbar (Shot & Camera) */}
                            {currentStageScene && (
                                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 grid grid-cols-2 gap-3 shrink-0">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Shot Type</label>
                                        <input
                                            type="text"
                                            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 text-slate-700 bg-white shadow-sm transition-all"
                                            value={currentStageScene.shotType || ''}
                                            onChange={(e) => handleUpdateScene('shotType', e.target.value)}
                                            placeholder="e.g. Medium Shot"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Camera</label>
                                        <input
                                            type="text"
                                            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 text-slate-700 bg-white shadow-sm transition-all"
                                            value={currentStageScene.cameraMovement || ''}
                                            onChange={(e) => handleUpdateScene('cameraMovement', e.target.value)}
                                            placeholder="e.g. Pan Left"
                                        />
                                    </div>
                                </div>
                            )}

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
                                        disabled={isGenerating}
                                        className="btn btn-primary text-xs px-3 py-1.5 shadow-lg shadow-indigo-500/20"
                                    >
                                        {isGenerating ? 'Generating...' : '▶ Generate Channel'}
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

                    {/* BOTTOM SECTION: Lines */}
                    <div
                        ref={setLinesRef}
                        className={`card bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 min-h-[300px] transition-all duration-300 ${isOverLines ? 'ring-2 ring-indigo-400 ring-inset shadow-indigo-100' : ''}`}
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

            </div>
        </DndContext>
    )
}
