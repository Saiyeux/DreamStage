import { useState, useEffect, useRef } from 'react'

interface LLMTerminalProps {
  projectId: string | null
  analysisType: 'summary' | 'characters' | 'scenes' | null
  onComplete?: (response: string) => void
  onError?: (error: string) => void
}

export function LLMTerminal({
  projectId,
  analysisType,
  onComplete,
  onError,
}: LLMTerminalProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [output, setOutput] = useState<string[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  // 开始流式分析
  const startStream = () => {
    if (!projectId || !analysisType) return

    // 清空之前的输出
    setOutput([`> 开始分析 ${analysisType}...`, ''])
    setIsStreaming(true)
    setIsExpanded(true)

    // 关闭之前的连接
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const url = `/api/projects/${projectId}/analyze/${analysisType}/stream`
    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'start') {
          setOutput((prev) => [...prev, `[${new Date().toLocaleTimeString()}] LLM 开始响应...`, ''])
        } else if (data.type === 'chunk') {
          // 追加内容到最后一行
          setOutput((prev) => {
            const newOutput = [...prev]
            newOutput[newOutput.length - 1] += data.content
            return newOutput
          })
        } else if (data.type === 'done') {
          setOutput((prev) => [
            ...prev,
            '',
            `[${new Date().toLocaleTimeString()}] 分析完成`,
          ])
          setIsStreaming(false)
          eventSource.close()
          onComplete?.(data.full_response)
        } else if (data.type === 'error') {
          setOutput((prev) => [...prev, '', `[错误] ${data.message}`])
          setIsStreaming(false)
          eventSource.close()
          onError?.(data.message)
        }
      } catch (e) {
        console.error('Parse SSE data failed:', e)
      }
    }

    eventSource.onerror = () => {
      setOutput((prev) => [...prev, '', '[连接断开]'])
      setIsStreaming(false)
      eventSource.close()
    }
  }

  // 清理
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  // 当 analysisType 变化且有效时自动开始
  useEffect(() => {
    if (projectId && analysisType) {
      startStream()
    }
  }, [projectId, analysisType])

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 bg-gray-800 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-green-400">$</span>
          <span className="text-gray-300 text-sm font-mono">LLM Output</span>
          {isStreaming && (
            <span className="text-yellow-400 text-xs animate-pulse">
              streaming...
            </span>
          )}
        </div>
        <button className="text-gray-400 hover:text-white">
          {isExpanded ? '▼' : '▲'}
        </button>
      </div>

      {/* Output */}
      {isExpanded && (
        <div
          ref={outputRef}
          className="p-4 font-mono text-sm text-green-400 max-h-64 overflow-y-auto"
        >
          {output.length === 0 ? (
            <p className="text-gray-500">等待分析任务...</p>
          ) : (
            output.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {line || '\u00A0'}
              </div>
            ))
          )}
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-green-400 animate-pulse ml-1" />
          )}
        </div>
      )}
    </div>
  )
}

// 简化版：独立的终端组件，手动控制
export function LLMTerminalManual() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [output, setOutput] = useState<string[]>(['等待分析任务...'])
  const [isStreaming, setIsStreaming] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  // 暴露方法给父组件
  const appendLine = (line: string) => {
    setOutput((prev) => [...prev, line])
  }

  const appendChunk = (chunk: string) => {
    setOutput((prev) => {
      const newOutput = [...prev]
      newOutput[newOutput.length - 1] += chunk
      return newOutput
    })
  }

  const clear = () => {
    setOutput([])
  }

  const setStreaming = (streaming: boolean) => {
    setIsStreaming(streaming)
    if (streaming) {
      setIsExpanded(true)
    }
  }

  // 通过 window 暴露方法（简单方案）
  useEffect(() => {
    (window as any).__llmTerminal = {
      appendLine,
      appendChunk,
      clear,
      setStreaming,
    }
    return () => {
      delete (window as any).__llmTerminal
    }
  }, [])

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-2 bg-gray-800 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-green-400">$</span>
          <span className="text-gray-300 text-sm font-mono">LLM Output</span>
          {isStreaming && (
            <span className="text-yellow-400 text-xs animate-pulse">
              streaming...
            </span>
          )}
        </div>
        <button className="text-gray-400 hover:text-white">
          {isExpanded ? '▼' : '▲'}
        </button>
      </div>

      {isExpanded && (
        <div
          ref={outputRef}
          className="p-4 font-mono text-sm text-green-400 max-h-64 overflow-y-auto"
        >
          {output.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">
              {line || '\u00A0'}
            </div>
          ))}
          {isStreaming && (
            <span className="inline-block w-2 h-4 bg-green-400 animate-pulse ml-1" />
          )}
        </div>
      )}
    </div>
  )
}
