import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="fixed inset-0 z-[9999] bg-hud-bg flex flex-col items-center justify-center gap-4">
        <div className="w-1 h-8 bg-hud-red rounded-full" />
        <div className="font-mono text-hud-red text-sm tracking-widest">
          SYSTEM FAULT
        </div>
        <div className="font-mono text-hud-dim text-[10px] tracking-wider max-w-md text-center px-4">
          {this.state.error?.message || 'An unexpected error occurred'}
        </div>
        <button
          onClick={() => this.setState({ hasError: false, error: null })}
          className="mt-4 px-4 py-2 rounded border border-hud-cyan/30 font-mono text-[10px] tracking-widest text-hud-cyan hover:bg-hud-cyan/10 transition-colors"
        >
          REINITIALIZE
        </button>
      </div>
    )
  }
}
