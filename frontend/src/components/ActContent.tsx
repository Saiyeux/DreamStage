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
            <div className="flex h-full w-full overflow-hidden bg-white">

                {/* LEFT COLUMN: Library + Reference */}
                <aside className="w-64 shrink-0 border-r border-slate-300 flex flex-col">
                    {/* Library Section */}
                    <div className="h-1/2 border-b border-slate-300 flex flex-col min-h-0 bg-white">
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
                        <div className="text-sm font-semibold mb-2 text-slate-700">reference</div>
                        <div className="text-xs text-slate-600 whitespace-pre-wrap font-mono leading-relaxed">
                            {currentProject?.scriptText || "No script content available."}
                        </div>
                    </div>
                </aside>

                {/* MAIN CONTENT AREA */}
                <main className="flex-1 flex flex-col min-w-0">

                    {/* TOP SECTION: Stage + Video Split */}
                    <div className="flex-1 flex flex-row min-h-0">

                        {/* STAGE AREA (Left Half) */}
                        <div className="flex-1 flex flex-col border-r border-slate-300">
                            {/* Header */}
                            <div className="h-10 border-b border-slate-300 flex items-center justify-between px-3 bg-white shrink-0">
                                <span className="text-xs font-semibold text-slate-600">STAGE</span>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => setActiveStageSceneId(null)}
                                        className="text-[10px] px-2 py-0.5 border border-slate-200 rounded hover:bg-slate-50 text-slate-500"
                                    >
                                        clear
                                    </button>
                                </div>
                            </div>

                            {/* Scene Controls Toolbar (Shot & Camera) */}
                            {currentStageScene && (
                                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 grid grid-cols-2 gap-2 shrink-0">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Shot Type</label>
                                        <input
                                            type="text"
                                            className="w-full text-xs border border-slate-300 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-slate-700 bg-white"
                                            value={currentStageScene.shotType || ''}
                                            onChange={(e) => handleUpdateScene('shotType', e.target.value)}
                                            placeholder="e.g. Medium Shot"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Camera</label>
                                        <input
                                            type="text"
                                            className="w-full text-xs border border-slate-300 rounded px-2 py-1 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-slate-700 bg-white"
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
                                className={`flex-1 flex items-center justify-center bg-slate-100 relative ${isOverStage ? 'ring-2 ring-indigo-400' : ''}`}
                            >
                                {currentStageScene?.sceneImage ? (
                                    <img
                                        src={fileUrl.image(currentStageScene.sceneImage.imagePath)}
                                        alt="Stage"
                                        className="max-w-full max-h-full object-contain"
                                    />
                                ) : (
                                    <div className="text-slate-400 text-sm flex flex-col items-center gap-1">
                                        <span>Stage Preview</span>
                                        <span className="text-xs opacity-50">Drag scene here</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* VIDEO AREA (Right Half) */}
                        <div className="flex-1 flex flex-col bg-slate-900">
                            {/* Header */}
                            <div className="h-10 border-b border-slate-700 flex items-center justify-between px-3 bg-slate-800 shrink-0">
                                <span className="text-xs font-semibold text-slate-300">VIDEO</span>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => {
                                            if (confirm('Clear entire Act?')) {
                                                setActiveStageSceneId(null)
                                                setTimelineBeats([])
                                            }
                                        }}
                                        className="text-[10px] px-2 py-0.5 border border-slate-600 rounded hover:bg-slate-700 text-slate-400"
                                    >
                                        reset
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsGenerating(true)
                                            setTimeout(() => setIsGenerating(false), 3000)
                                        }}
                                        disabled={isGenerating}
                                        className="text-[10px] px-2 py-0.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        {isGenerating ? 'generating...' : 'generate'}
                                    </button>
                                </div>
                            </div>

                            {/* Preview */}
                            <div className="flex-1 flex items-center justify-center">
                                {isGenerating ? (
                                    <div className="text-indigo-400 text-sm animate-pulse">Generating Video...</div>
                                ) : (
                                    <div className="text-slate-600 text-sm">Video Preview</div>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* BOTTOM SECTION: Lines */}
                    <div
                        ref={setLinesRef}
                        className={`h-72 border-t border-slate-300 flex flex-col bg-white shrink-0 ${isOverLines ? 'ring-2 ring-indigo-400 ring-inset' : ''}`}
                    >
                        <div className="h-8 border-b border-slate-100 flex items-center px-4 bg-slate-50 shrink-0">
                            <span className="text-xs font-semibold text-slate-600">LINES / TIMELINE</span>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {timelineBeats.length === 0 ? (
                                <div className="h-full flex items-center justify-center text-slate-300 text-xs">
                                    Drag characters here to add dialogue lines
                                </div>
                            ) : (
                                timelineBeats.map((beat) => {
                                    const char = characters.find(c => c.id === beat.characterId)
                                    return (
                                        <div key={beat.id} className="flex gap-3 items-start p-3 bg-white rounded border border-slate-200 shadow-sm hover:border-slate-300 transition-colors">
                                            <div className="w-8 h-8 rounded-full bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                                                {char?.images?.[0] ? (
                                                    <img src={fileUrl.image(char.images[0].imagePath)} alt={char.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-xs">
                                                        {char?.gender?.includes('Female') ? '👩' : '👨'}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-bold text-slate-700 mb-1">{char?.name || 'Unknown'}</div>
                                                <textarea
                                                    className="w-full text-sm border border-slate-200 rounded p-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none bg-slate-50 focus:bg-white"
                                                    rows={2}
                                                    placeholder="Type dialogue..."
                                                    value={beat.text}
                                                    onChange={(e) => {
                                                        setTimelineBeats(prev => prev.map(b => b.id === beat.id ? { ...b, text: e.target.value } : b))
                                                    }}
                                                />
                                            </div>
                                            <button
                                                onClick={() => setTimelineBeats(prev => prev.filter(b => b.id !== beat.id))}
                                                className="text-slate-300 hover:text-red-500 p-1"
                                                title="Remove line"
                                            >
                                                ✕
                                            </button>
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
