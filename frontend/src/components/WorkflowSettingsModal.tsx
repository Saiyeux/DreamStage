import { useState, useEffect } from 'react'
import type { WorkflowConfig } from '@/api/config'

interface WorkflowSettingsModalProps {
    visible: boolean
    onClose: () => void
    onSave: (params: Record<string, any>) => void
    initialParams: Record<string, any>
    title: string
}

export function WorkflowSettingsModal({
    visible,
    onClose,
    onSave,
    initialParams,
    title
}: WorkflowSettingsModalProps) {
    const [params, setParams] = useState<Record<string, any>>({})

    useEffect(() => {
        if (visible) {
            setParams(initialParams || {})
        }
    }, [visible, initialParams])

    if (!visible) return null

    const handleChange = (key: string, value: any) => {
        setParams(prev => ({ ...prev, [key]: value }))
    }

    const handleSave = () => {
        onSave(params)
        onClose()
    }

    // Get keys to display, filtering out internal ones if needed
    const keys = Object.keys(params)
    const sortedKeys = keys.sort()

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[85vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800">{title}</h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto space-y-4 flex-1">
                    {sortedKeys.length === 0 ? (
                        <p className="text-sm text-slate-500 italic text-center py-4">
                            No configurable parameters found for this workflow.
                        </p>
                    ) : (
                        sortedKeys.map(key => {
                            const value = params[key]
                            const type = typeof value

                            if (type === 'object') return null // skip nested objects for now

                            return (
                                <div key={key} className="space-y-1.5">
                                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                                        {key.replace(/_/g, ' ')}
                                    </label>
                                    {type === 'boolean' ? (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleChange(key, !value)}
                                                className={`w-10 h-5 rounded-full transition-colors relative ${value ? 'bg-primary-500' : 'bg-slate-200'}`}
                                            >
                                                <span className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
                                            </button>
                                            <span className="text-xs text-slate-600">{value ? 'Enabled' : 'Disabled'}</span>
                                        </div>
                                    ) : type === 'number' ? (
                                        <input
                                            type="number"
                                            value={value}
                                            onChange={e => handleChange(key, Number(e.target.value))}
                                            className="w-full input text-sm"
                                        />
                                    ) : (
                                        <input
                                            type="text"
                                            value={value}
                                            onChange={e => handleChange(key, e.target.value)}
                                            className="w-full input text-sm"
                                        />
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="btn btn-secondary text-xs"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="btn btn-primary text-xs"
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    )
}
