import { useState, useRef, useCallback } from 'react'

interface StreamState {
  isStreaming: boolean
  output: string[]
  error: string | null
}

export function useLLMStream() {
  const [state, setState] = useState<StreamState>({
    isStreaming: false,
    output: [],
    error: null,
  })
  const eventSourceRef = useRef<EventSource | null>(null)

  const startStream = useCallback(
    (
      projectId: string,
      analysisType: string,
      onComplete?: (response: string) => void
    ) => {
      // 清空之前的输出
      setState({
        isStreaming: true,
        output: [`> 开始${analysisType === 'characters' ? '角色' : analysisType === 'scenes' ? '场景' : '简介'}分析...`, ''],
        error: null,
      })

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
            setState((prev) => ({
              ...prev,
              output: [
                ...prev.output,
                `[${new Date().toLocaleTimeString()}] LLM 开始响应...`,
                '',
              ],
            }))
          } else if (data.type === 'chunk') {
            setState((prev) => {
              const newOutput = [...prev.output]
              newOutput[newOutput.length - 1] += data.content
              return { ...prev, output: newOutput }
            })
          } else if (data.type === 'done') {
            setState((prev) => ({
              ...prev,
              isStreaming: false,
              output: [
                ...prev.output,
                '',
                `[${new Date().toLocaleTimeString()}] 分析完成`,
              ],
            }))
            eventSource.close()
            onComplete?.(data.full_response)
          } else if (data.type === 'error') {
            setState((prev) => ({
              ...prev,
              isStreaming: false,
              error: data.message,
              output: [...prev.output, '', `[错误] ${data.message}`],
            }))
            eventSource.close()
          }
        } catch (e) {
          console.error('Parse SSE data failed:', e)
        }
      }

      eventSource.onerror = () => {
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          output: [...prev.output, '', '[连接断开]'],
        }))
        eventSource.close()
      }
    },
    []
  )

  const stopStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setState((prev) => ({
      ...prev,
      isStreaming: false,
      output: [...prev.output, '', '[已停止]'],
    }))
  }, [])

  const clearOutput = useCallback(() => {
    setState({
      isStreaming: false,
      output: [],
      error: null,
    })
  }, [])

  return {
    ...state,
    startStream,
    stopStream,
    clearOutput,
  }
}
