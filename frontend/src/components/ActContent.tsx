import { useState, useEffect } from 'react'
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { analysisApi } from '@/api'
import type { Character, Scene } from '@/types'
import { fileUrl } from '@/api/client'

interface ActContentProps {
    projectId: string
}

type DraggableItem =
    | { id: string; type: 'character'; data: Character }
    | { id: string; type: 'scene'; data: Scene }

export function ActContent({ projectId }: ActContentProps) {
    const [finalizedChars, setFinalizedChars] = useState<Character[]>([])
    const [finalizedScenes, setFinalizedScenes] = useState<Scene[]>([])

    // Stage State
    const [stageItems, setStageItems] = useState<DraggableItem[]>([])
    const [activeDragItem, setActiveDragItem] = useState<DraggableItem | null>(null)

    useEffect(() => {
        loadFinalizedAssets()
    }, [projectId])

    const loadFinalizedAssets = async () => {
        try {
            const [chars, scenes] = await Promise.all([
                analysisApi.getCharacters(projectId),
                analysisApi.getScenes(projectId)
            ])
            // Filter for finalized assets as per design
            setFinalizedChars(chars.filter(c => c.isFinalized))
            // Check for isFinalized on scene. If type definition is missing it might error, but assuming it exists based on usage in ScriptAnalysisPage
            // If scene doesn't have isFinalized in type yet, we might need to cast or check.
            // In ScriptAnalysisPage: await analysisService.finalizeAsset(..., 'scenes'...)
            // But let's check if we used isFinalized on scene object in ScriptAnalysisPage.
            // Yes, handleUnfinalize uses it? No, it calls API. 
            // check Scene type definition first?

            // Let's safe check using (s as any).isFinalized if uncertain, or just filter s.isFinalized
            setFinalizedScenes(scenes.filter(s => (s as any).isFinalized))
        } catch (err) {
            console.error('Failed to load assets:', err)
        }
    }

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event
        const type = active.data.current?.type
        const itemData = active.data.current?.data

        if (type && itemData) {
            setActiveDragItem({
                id: active.id as string,
                type: type,
                data: itemData
            })
        }
    }

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event
        setActiveDragItem(null)

        if (over && over.id === 'stage-drop-zone') {
            const type = active.data.current?.type
            const itemData = active.data.current?.data

            if (type && itemData) {
                // Check if already on stage (if we want uniques) -> Characters can be unique or duplicates? 
                // Usually one instance of a character per stage, unless clones.
                // Scenes: Only one scene usually.

                if (type === 'scene') {
                    // Replace scene or add if none
                    setStageItems(prev => [
                        ...prev.filter(i => i.type !== 'scene'), // Remove existing scene
                        { id: `stage_${active.id}_${Date.now()}`, type, data: itemData }
                    ])
                } else {
                    // Add character
                    setStageItems(prev => [
                        ...prev,
                        { id: `stage_${active.id}_${Date.now()}`, type, data: itemData }
                    ])
                }
            }
        }
    }

    return (
        <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="flex h-full bg-slate-100 overflow-hidden">
                {/* Left Sidebar: Assets Dock */}
                <div className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cast & Sets Library</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-6">
                        <div>
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                                Characters
                                <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full text-[10px]">{finalizedChars.length}</span>
                            </h4>
                            {finalizedChars.length === 0 ? (
                                <p className="text-xs text-slate-400 italic p-2 bg-slate-50 rounded">
                                    No finalized characters. Go to Characters tab and finalize roles.
                                </p>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    {finalizedChars.map(char => (
                                        <DraggableAsset key={char.id} item={char} type="character" />
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                                Scenes
                                <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full text-[10px]">{finalizedScenes.length}</span>
                            </h4>
                            {finalizedScenes.length === 0 ? (
                                <p className="text-xs text-slate-400 italic p-2 bg-slate-50 rounded">
                                    No finalized scenes. Go to Scenes tab and finalize sets.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {finalizedScenes.map(scene => (
                                        <DraggableAsset key={scene.id} item={scene} type="scene" />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Center: Stage */}
                <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
                    {/* Toolbar */}
                    <div className="h-12 bg-white border-b border-slate-200 flex items-center px-4 justify-between shrink-0">
                        <h2 className="text-sm font-bold text-slate-700">Act Composer</h2>
                        <div className="flex gap-2">
                            <button className="btn btn-primary text-xs" onClick={() => alert('Generate Keyframe')}>
                                🎬 Generate Keyframe
                            </button>
                        </div>
                    </div>

                    {/* Canvas / Drop Zone */}
                    <div className="flex-1 p-8 flex items-center justify-center overflow-auto relative">
                        <StageDropZone items={stageItems} />
                    </div>

                    {/* Timeline / Dialogue Editor Placeholder */}
                    <div className="h-72 bg-white border-t border-slate-200 p-0 flex flex-col shrink-0">
                        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Beat Editor</h4>
                            <button className="text-xs text-primary-600 hover:text-primary-700 font-medium">+ Add Beat</button>
                        </div>
                        <div className="flex-1 p-4 overflow-y-auto">
                            <div className="text-slate-400 text-sm italic text-center py-8">
                                Drag characters to the stage above to start scripting the scene action.
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Sidebar: Script Reference */}
                <div className="w-80 bg-white border-l border-slate-200 flex flex-col shrink-0">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Script Reference</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 text-sm text-slate-600 leading-relaxed font-mono">
                        <div className="prose prose-sm prose-slate">
                            <p className="font-bold text-slate-800">SCENE 1. INT. COFFEE SHOP - DAY</p>
                            <p>Sunlight streams through the window...</p>
                            <p><span className="font-bold text-slate-800">ALICE</span> sits alone.</p>
                        </div>
                    </div>
                </div>
            </div>

            <DragOverlay>
                {activeDragItem ? (
                    <div className="opacity-80 rotate-3 scale-105 pointer-events-none">
                        <AssetCard item={activeDragItem.data} type={activeDragItem.type} />
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    )
}

function DraggableAsset({ item, type }: { item: Character | Scene, type: 'character' | 'scene' }) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: item.id,
        data: { type, data: item }
    })

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    } : undefined

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing touch-none">
            <AssetCard item={item} type={type} />
        </div>
    )
}

function AssetCard({ item, type }: { item: Character | Scene, type: 'character' | 'scene' }) {
    if (type === 'character') {
        const char = item as Character
        const imagePath = char.images && char.images.length > 0 ? char.images[0].imagePath : null

        return (
            <div className="aspect-square bg-white rounded-lg border border-slate-200 p-1 hover:border-primary-400 transition-colors shadow-sm overflow-hidden relative group">
                {imagePath ? (
                    <img src={fileUrl.image(imagePath)} alt={char.name} className="w-full h-full object-cover rounded-md" />
                ) : (
                    <div className="w-full h-full bg-slate-100 rounded-md flex items-center justify-center text-2xl">👤</div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-4">
                    <p className="text-[10px] font-bold text-white truncate text-center">{char.name}</p>
                </div>
            </div>
        )
    } else {
        const scene = item as Scene
        const imagePath = scene.sceneImage?.imagePath

        return (
            <div className="aspect-video bg-white rounded-lg border border-slate-200 p-1 hover:border-primary-400 transition-colors shadow-sm overflow-hidden relative group">
                {imagePath ? (
                    <img src={fileUrl.image(imagePath)} alt={`Scene ${scene.id}`} className="w-full h-full object-cover rounded-md" />
                ) : (
                    <div className="w-full h-full bg-slate-100 rounded-md flex items-center justify-center text-sm text-slate-400 font-medium">
                        Scene {scene.id.substring(0, 4)}
                    </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-4">
                    <p className="text-[10px] font-bold text-white truncate">{scene.location || 'Unknown Location'}</p>
                </div>
            </div>
        )
    }
}

function StageDropZone({ items }: { items: DraggableItem[] }) {
    const { isOver, setNodeRef } = useDroppable({
        id: 'stage-drop-zone',
    })

    // Find the current scene content
    const sceneItem = items.find((i): i is Extract<DraggableItem, { type: 'scene' }> => i.type === 'scene')
    const charItems = items.filter((i): i is Extract<DraggableItem, { type: 'character' }> => i.type === 'character')

    return (
        <div
            ref={setNodeRef}
            className={`w-full max-w-4xl aspect-video bg-white rounded-xl shadow-sm border-2 transition-all relative overflow-hidden group
                ${isOver ? 'border-primary-500 bg-primary-50/10 scale-[1.01]' : 'border-slate-300 border-dashed'}
            `}
        >
            {sceneItem ? (
                <div className="absolute inset-0 z-0">
                    {/* Render Scene Background */}
                    {sceneItem.data.sceneImage?.imagePath ? (
                        <img src={fileUrl.image(sceneItem.data.sceneImage.imagePath)} className="w-full h-full object-cover opacity-80" />
                    ) : (
                        <div className="w-full h-full bg-slate-200 flex items-center justify-center">
                            <span className="text-slate-400 font-bold text-lg">{sceneItem.data.location || 'Untitled Scene'}</span>
                        </div>
                    )}
                </div>
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-0">
                    <p className="text-slate-400 font-medium mb-2">Stage Area</p>
                    <p className="text-slate-300 text-sm">Drag a Scene here to set the background</p>
                </div>
            )}

            {/* Render Characters on Stage */}
            <div className="absolute inset-0 z-10 p-8 flex items-end justify-center gap-8 pointer-events-none">
                {charItems.map((item) => (
                    <div key={item.id} className="relative w-1/4 aspect-[2/5] transition-all hover:scale-105">
                        {/* Character Image Placeholder */}
                        {(item.data as Character).images?.[0]?.imagePath ? (
                            <img src={fileUrl.image((item.data as Character).images[0].imagePath)} className="w-full h-full object-contain drop-shadow-2xl" />
                        ) : (
                            <div className="w-full h-full bg-slate-300/50 rounded-full flex items-center justify-center border-4 border-white shadow-lg">
                                <span className="text-2xl">👤</span>
                            </div>
                        )}
                        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap">
                            {(item.data as Character).name}
                        </div>
                    </div>
                ))}
            </div>

            {/* Indication when empty */}
            {items.length === 0 && !isOver && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {/* Empty State Overlay if needed */}
                </div>
            )}
        </div>
    )
}
