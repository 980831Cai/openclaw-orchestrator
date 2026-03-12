import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional fallback UI to show when an error occurs */
  fallback?: ReactNode
  /** Optional callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Error Boundary component that catches JavaScript errors in its child component tree.
 * Prevents a single component crash from bringing down the entire application.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-8 text-center">
          <div className="text-4xl mb-4">😵</div>
          <h2 className="text-lg font-semibold text-white/80 mb-2">出了点问题</h2>
          <p className="text-sm text-white/50 mb-4 max-w-md">
            {this.state.error?.message || '发生了一个未知错误'}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm transition-colors"
          >
            重试
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Specialized ErrorBoundary for 3D/Canvas scenes with a scene-specific fallback.
 */
export function SceneErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-black/20 rounded-xl border border-white/5">
          <div className="text-3xl mb-3">🏢</div>
          <h3 className="text-sm font-medium text-white/60 mb-1">场景加载失败</h3>
          <p className="text-xs text-white/40">请刷新页面重试</p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}
