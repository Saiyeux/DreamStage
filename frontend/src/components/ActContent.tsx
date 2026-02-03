import { useState, useEffect, useRef } from 'react'
import {
    DndContext,
    DragOverlay,
    useDraggable,
    useDroppable,
    pointerWithin,
    rectIntersection,
    useSensor,
    useSensors,
    PointerSensor,
    MouseSensor,
} from '@dnd-kit/core'
import type { CollisionDetection } from '@dnd-kit/core'
import { useProjectStore } from '@/stores/projectStore'
import { fileUrl } from '@/api/client'

// Custom collision detection that combines multiple strategies
const customCollisionDetection: CollisionDetection = (args) => {
    // First try pointerWithin for precise detection
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) {
        return pointerCollisions
    }
    // Fallback to rectIntersection
    return rectIntersection(args)
}

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

function DroppableCharacterTag({ id, children, disabled }: { id: string, children: React.ReactNode, disabled?: boolean }) {
    const { setNodeRef, isOver } = useDroppable({
        id: id,
        data: { accept: 'character' },
        disabled
    })

    return (
        <div ref={setNodeRef} className={`relative transition-all ${isOver ? 'ring-2 ring-indigo-500 rounded-full scale-110 z-10' : ''}`}>
            {children}
        </div>
    )
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

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
    } = useProjectStore()

    // Local UI state
    const [isGenerating, setIsGenerating] = useState(false)
    const [activeDragItem, setActiveDragItem] = useState<{ type: 'character' | 'scene', item: any } | null>(null)
    const [editingActId, setEditingActId] = useState<string | null>(null)

    // Get current act
    const currentAct = acts.find(a => a.id === selectedActId)
    const timelineBeats = currentAct?.dialogueLines || []

    // Configure sensors for better drag detection
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // 5px movement to start drag
            },
        }),
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 5,
            },
        })
    )

    // Droppable Hooks
    const { setNodeRef: setStageRef, isOver: isOverStage } = useDroppable({
        id: 'stage-drop',
        data: { accept: 'scene' }
    })

    const { setNodeRef: setLinesRef, isOver: isOverLines, node: linesNode } = useDroppable({
        id: 'lines-drop',
        data: { accept: 'character' }
    })

    // Debug: check if droppable is registered
    useEffect(() => {
        console.log('Lines droppable node ref:', linesNode)
        console.log('Lines droppable node.current:', linesNode?.current)
        console.log('isOverLines:', isOverLines)
        console.log('selectedActId:', selectedActId)
    }, [linesNode, isOverLines, selectedActId])

    // Additional debug ref
    const debugLinesRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        console.log('Debug lines ref:', debugLinesRef.current)
    }, [selectedActId])

    // DnD Handlers
    const handleDragStart = (event: any) => {
        console.log('=== Drag Start ===')
        console.log('active:', event.active)
        setActiveDragItem(event.active.data.current)
    }

    const handleDragOver = (event: any) => {
        console.log('=== Drag Over ===')
        console.log('over:', event.over)
    }

    const handleDragEnd = (event: any) => {
        const { active, over } = event
        setActiveDragItem(null)

        console.log('=== Drag End ===')
        console.log('over:', over)
        console.log('over.id:', over?.id)
        console.log('selectedActId:', selectedActId)
        console.log('active.data.current:', active.data.current)

        if (!over || !selectedActId) {
            console.log('Early return: over=', over, 'selectedActId=', selectedActId)
            return
        }

        const itemType = active.data.current?.type
        const itemData = active.data.current?.item

        console.log('itemType:', itemType, 'itemData:', itemData)

        if (over.id === 'stage-drop' && itemType === 'scene') {
            console.log('Dropping scene on stage')
            updateAct(selectedActId, { stageSceneId: itemData.id })
        }

        // Handle dropping onto a specific line's character tag
        if (typeof over.id === 'string' && over.id.startsWith('line-char-') && itemType === 'character') {
            const beatId = over.id.replace('line-char-', '')
            console.log('Dropping character on existing line:', beatId)
            updateDialogueLine(selectedActId, beatId, { characterId: itemData.id })
            return
        }

        if (over.id === 'lines-drop' && itemType === 'character') {
            console.log('Dropping character on lines panel - adding new line')
            const newLine = {
                id: `line-${Date.now()}`,
                characterId: itemData.id,
                text: ''
            }
            addDialogueLine(selectedActId, newLine)
        }
    }

    // Act management handlers
    const handleAddAct = () => {
        const newAct = {
            id: `act-${Date.now()}`,
            projectId,
            name: `Act ${acts.length + 1}`,
            stageSceneId: null,
            dialogueLines: []
        }
        addAct(newAct)
        setSelectedActId(newAct.id)
        setEditingActId(newAct.id)
    }

    const handleDeleteAct = (actId: string) => {
        removeAct(actId)
    }

    const handleRenameAct = (actId: string, newName: string) => {
        updateAct(actId, { name: newName })
        setEditingActId(null)
    }

    const currentStageScene = scenes.find(s => s.id === currentAct?.stageSceneId)

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={customCollisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
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
                                        <DraggableAsset key={char.id} id={char.id} type="character" data={char} disabled={!selectedActId}>
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
                                    <DraggableAsset key={scene.id} id={scene.id} type="scene" data={scene} disabled={!selectedActId}>
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

                    {/* 3. ACT Section */}
                    <div className="card bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col flex-1 min-h-[200px]">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white rounded-t-xl">
                            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                                <span>🎭</span> Act
                            </span>
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">
                                {acts.length}
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col">
                            {acts.length > 0 ? (
                                <div className="space-y-2 flex-1">
                                    {acts.map((act) => (
                                        <div
                                            key={act.id}
                                            onClick={() => setSelectedActId(act.id)}
                                            className={`group relative flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${selectedActId === act.id
                                                ? 'bg-indigo-50 border-indigo-300 shadow-sm'
                                                : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
                                                }`}
                                        >
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${selectedActId === act.id ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                <span className="text-[10px] font-bold">
                                                    {acts.indexOf(act) + 1}
                                                </span>
                                            </div>
                                            {editingActId === act.id ? (
                                                <input
                                                    type="text"
                                                    className="flex-1 text-xs font-medium bg-white border border-indigo-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                    defaultValue={act.name}
                                                    autoFocus
                                                    onBlur={(e) => handleRenameAct(act.id, e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            handleRenameAct(act.id, (e.target as HTMLInputElement).value)
                                                        }
                                                        if (e.key === 'Escape') {
                                                            setEditingActId(null)
                                                        }
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            ) : (
                                                <span
                                                    className="flex-1 text-xs font-medium text-slate-700 truncate"
                                                    onDoubleClick={(e) => {
                                                        e.stopPropagation()
                                                        setEditingActId(act.id)
                                                    }}
                                                >
                                                    {act.name}
                                                </span>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDeleteAct(act.id)
                                                }}
                                                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 p-1 transition-all"
                                                title="Delete Act"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : null}

                            {/* Add Act Button - Always visible in center when empty, at bottom otherwise */}
                            <button
                                onClick={handleAddAct}
                                className={`border-2 border-dashed border-slate-200 rounded-lg text-xs text-slate-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-all flex items-center justify-center gap-1 ${acts.length === 0
                                    ? 'flex-1 min-h-[100px]'
                                    : 'py-2 mt-2'
                                    }`}
                            >
                                <span className="text-lg">+</span>
                                {acts.length === 0 && <span>New Act</span>}
                            </button>
                        </div>
                    </div>
                </aside>

                {/* MAIN CONTENT AREA */}
                <main className="flex-1 min-w-0 bg-transparent p-6 overflow-y-auto flex flex-col gap-6">

                    {/* Empty state when no act selected */}
                    <div className={`flex-1 flex flex-col items-center justify-center text-slate-400 gap-4 ${selectedActId ? 'hidden' : ''}`}>
                        <div className="w-24 h-24 rounded-3xl bg-slate-100 border-2 border-dashed border-slate-200 flex items-center justify-center">
                            <span className="text-4xl opacity-30">🎭</span>
                        </div>
                        <div className="text-center">
                            <h3 className="text-lg font-bold text-slate-600 mb-1">No Act Selected</h3>
                            <p className="text-sm">Create and select an act from the left panel to start editing</p>
                        </div>
                    </div>

                    {/* Content - always rendered, hidden when no act selected */}
                    <div className={`flex flex-col gap-6 flex-1 ${!selectedActId ? 'hidden' : ''}`}>
                            {/* TOP SECTION: Stage + Video Split */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[400px]">

                                {/* STAGE AREA (Left Half) */}
                                <div className="card overflow-hidden flex flex-col">
                                    {/* Header */}
                                    <div className="h-12 border-b border-amber-200/50 flex items-center justify-between px-4 bg-amber-100/30 shrink-0">
                                        <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                            <span>🎭</span> Stage
                                        </span>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => selectedActId && updateAct(selectedActId, { stageSceneId: null })}
                                                className="text-xs px-2 py-1 text-slate-400 hover:text-red-500 transition-colors"
                                                title="Clear Stage"
                                            >
                                                Clear
                                            </button>
                                            <button
                                                onClick={() => console.log('Generate Keyframe clicked - Todo')}
                                                disabled={!selectedActId}
                                                className="text-xs px-2 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                title={!selectedActId ? 'Select an Act first' : 'Generate Keyframe'}
                                            >
                                                ✨ Generate
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
                                                    if (selectedActId && confirm('Clear entire Act?')) {
                                                        updateAct(selectedActId, { stageSceneId: null, dialogueLines: [] })
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
                                                disabled={isGenerating || !healthStatus?.comfyui?.connected || !selectedActId}
                                                title={!selectedActId ? 'Select an Act first' : !healthStatus?.comfyui?.connected ? 'Please check ComfyUI service' : ''}
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

                            {/* BOTTOM SECTION: Lines & Script */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-[400px]">

                                {/* LEFT: Dialogue Lines */}
                                <div
                                    className="card bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col transition-all duration-300"
                                >
                                    <div className="h-12 border-b border-slate-100 flex items-center px-6 bg-white shrink-0">
                                        <span className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                            <span>💬</span> Dialogue Lines
                                        </span>
                                        <div className="ml-auto flex items-center gap-2">
                                            <span className="text-xs text-slate-400">
                                                {timelineBeats.length} lines
                                            </span>
                                        </div>
                                    </div>

                                    <div
                                        ref={(node) => {
                                            setLinesRef(node)
                                            debugLinesRef.current = node
                                            console.log('Setting lines ref to:', node)
                                        }}
                                        className={`flex-1 overflow-y-auto p-6 space-y-3 bg-slate-50/30 flex flex-col min-h-[200px] transition-all duration-300 ${isOverLines ? 'bg-indigo-50 ring-2 ring-indigo-400 ring-inset' : ''}`}
                                    >
                                        {timelineBeats.length === 0 ? (
                                            <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-3">
                                                <button
                                                    onClick={() => {
                                                        if (!selectedActId) return
                                                        const finalizedChars = characters.filter(c => c.isFinalized)
                                                        if (finalizedChars.length === 0) return
                                                        const newLine = {
                                                            id: `line-${Date.now()}`,
                                                            characterId: finalizedChars[0].id,
                                                            text: ''
                                                        }
                                                        addDialogueLine(selectedActId, newLine)
                                                    }}
                                                    disabled={characters.filter(c => c.isFinalized).length === 0}
                                                    className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-500 transition-all text-3xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:bg-slate-50 disabled:hover:text-slate-300"
                                                    title={characters.filter(c => c.isFinalized).length === 0 ? 'Please finalize cast' : 'Add Line'}
                                                >
                                                    +
                                                </button>
                                                <span className="text-sm">
                                                    {characters.filter(c => c.isFinalized).length === 0
                                                        ? 'Please finalize cast'
                                                        : 'Add dialogue or drag characters here'}
                                                </span>
                                            </div>
                                        ) : (
                                            timelineBeats.map((beat) => {
                                                const char = characters.find(c => c.id === beat.characterId)
                                                return (
                                                    <div key={beat.id} className="group flex gap-4 items-start p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 hover:shadow-md transition-all">
                                                        <DroppableCharacterTag id={`line-char-${beat.id}`}>
                                                            <div className="relative group/char cursor-pointer">
                                                                <div className={`w-10 h-10 rounded-full bg-slate-100 overflow-hidden shrink-0 border-2 shadow-sm flex items-center justify-center ${char?.gender?.includes('Female') ? 'border-pink-400' : 'border-blue-400'}`}>
                                                                    {char?.images?.[0] ? (
                                                                        <img src={fileUrl.image(char.images[0].imagePath)} alt={char.name} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <span className="text-xs">{char?.gender?.includes('Female') ? '👩' : '👨'}</span>
                                                                    )}
                                                                </div>
                                                                <select
                                                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                                                    value={beat.characterId}
                                                                    onChange={(e) => {
                                                                        if (selectedActId) {
                                                                            updateDialogueLine(selectedActId, beat.id, { characterId: e.target.value })
                                                                        }
                                                                    }}
                                                                >
                                                                    {characters.filter(c => c.isFinalized).map(c => (
                                                                        <option key={c.id} value={c.id}>{c.gender?.includes('Female') ? '♀ ' : '♂ '}{c.name}</option>
                                                                    ))}
                                                                    {!characters.filter(c => c.isFinalized).find(c => c.id === beat.characterId) && <option value={beat.characterId}>Unknown</option>}
                                                                </select>
                                                                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border flex items-center justify-center shadow-sm pointer-events-none ${char?.gender?.includes('Female') ? 'bg-pink-50 border-pink-300' : 'bg-blue-50 border-blue-300'}`}>
                                                                    <span className="text-[8px]">▼</span>
                                                                </div>
                                                            </div>
                                                        </DroppableCharacterTag>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between mb-1.5">
                                                                <div className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block ${char?.gender?.includes('Female') ? 'text-pink-700 bg-pink-50' : 'text-blue-700 bg-blue-50'}`}>
                                                                    {char?.name || 'Unknown'}
                                                                </div>
                                                                <button
                                                                    onClick={() => selectedActId && removeDialogueLine(selectedActId, beat.id)}
                                                                    className="text-slate-300 hover:text-red-500 p-1 transition-all opacity-0 group-hover:opacity-100"
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
                                                                    if (selectedActId) {
                                                                        updateDialogueLine(selectedActId, beat.id, { text: e.target.value })
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                )
                                            })
                                        )}
                                        {timelineBeats.length > 0 && (
                                            <button
                                                onClick={() => {
                                                    if (!selectedActId) return
                                                    const finalizedChars = characters.filter(c => c.isFinalized)
                                                    if (finalizedChars.length === 0) return
                                                    const newLine = {
                                                        id: `line-${Date.now()}`,
                                                        characterId: finalizedChars[0].id,
                                                        text: ''
                                                    }
                                                    addDialogueLine(selectedActId, newLine)
                                                }}
                                                disabled={characters.filter(c => c.isFinalized).length === 0}
                                                className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 transition-all flex items-center justify-center text-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-slate-400 disabled:hover:border-slate-200 disabled:hover:bg-transparent"
                                                title={characters.filter(c => c.isFinalized).length === 0 ? 'Please finalize cast' : 'Add Line'}
                                            >
                                                +
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* RIGHT: Script Preview */}
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
