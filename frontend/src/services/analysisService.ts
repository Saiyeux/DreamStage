/**
 * LLM 分析服务 - 管理 EventSource 连接
 * 独立于组件生命周期，防止页面切换时连接中断
 */

type AnalysisType = 'characters' | 'scenes'

interface AnalysisCallbacks {
  onStart: () => void
  onChunk: (content: string) => void
  onSaved: (count: number) => void
  onParseError: (message: string) => void
  onDone: (savedCount: number) => Promise<void>
  onError: (message: string) => void
  onConnectionLost: () => void
}

class AnalysisService {
  private eventSource: EventSource | null = null
  private currentProjectId: string | null = null
  private currentAnalysisType: AnalysisType | null = null
  private callbacks: AnalysisCallbacks | null = null

  /**
   * 检查是否有正在进行的分析
   */
  isAnalyzing(): boolean {
    return this.eventSource !== null && this.eventSource.readyState !== EventSource.CLOSED
  }

  /**
   * 获取当前分析的项目ID
   */
  getCurrentProjectId(): string | null {
    return this.currentProjectId
  }

  /**
   * 获取当前分析类型
   */
  getCurrentAnalysisType(): AnalysisType | null {
    return this.currentAnalysisType
  }

  /**
   * 开始分析
   */
  start(
    projectId: string,
    analysisType: AnalysisType,
    callbacks: AnalysisCallbacks
  ): boolean {
    // 如果已有分析在进行，不允许启动新任务
    if (this.isAnalyzing()) {
      console.warn('Analysis already in progress')
      return false
    }

    this.currentProjectId = projectId
    this.currentAnalysisType = analysisType
    this.callbacks = callbacks

    const url = `/api/projects/${projectId}/analyze/${analysisType}/stream`
    this.eventSource = new EventSource(url)

    this.eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'start') {
          this.callbacks?.onStart()
        } else if (data.type === 'chunk') {
          this.callbacks?.onChunk(data.content)
        } else if (data.type === 'saved') {
          this.callbacks?.onSaved(data.count)
        } else if (data.type === 'parse_error') {
          this.callbacks?.onParseError(data.message)
        } else if (data.type === 'done') {
          await this.callbacks?.onDone(data.saved_count)
          this.cleanup()
        } else if (data.type === 'error') {
          this.callbacks?.onError(data.message)
          this.cleanup()
        }
      } catch (e) {
        console.error('Parse SSE data failed:', e)
      }
    }

    this.eventSource.onerror = () => {
      this.callbacks?.onConnectionLost()
      this.cleanup()
    }

    return true
  }

  /**
   * 停止分析
   */
  stop(): void {
    if (this.eventSource) {
      this.eventSource.close()
    }
    this.cleanup()
  }

  /**
   * 清理状态
   */
  private cleanup(): void {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    this.currentProjectId = null
    this.currentAnalysisType = null
    this.callbacks = null
  }

  /**
   * 更新回调函数（用于组件重新挂载时恢复连接）
   */
  updateCallbacks(callbacks: AnalysisCallbacks): void {
    this.callbacks = callbacks
  }
}

// 导出单例
export const analysisService = new AnalysisService()
