import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./ui";

interface Props {
  children: ReactNode;
  /** 兜底页标题；compact 用于页面级（保留侧栏与导航） */
  title?: string;
  compact?: boolean;
  /** 注入重新加载动作（测试用；默认整页 reload） */
  onReload?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * 渲染异常兜底：替代「整页白屏」。
 * 说明：本项目用声明式 <Routes>（非 createBrowserRouter），没有 errorElement 可挂，
 * 因此渲染期异常只能靠 error boundary 接住——App 顶层一份，AppShell 的 Outlet 一份。
 * 页面级实例由 AppShell 用 pathname 作 key，切换路由即自动复位。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 渲染错误留在浏览器控制台：当前只审计服务端业务 mutation，不上报前端栈
    console.error("render error:", error, info.componentStack);
  }

  private reload = () => {
    if (this.props.onReload) this.props.onReload();
    else window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { compact = false, title } = this.props;
    const box = compact
      ? "w-full rounded-card border border-line bg-surface-1 p-8 text-center"
      : "glass relative z-content w-full max-w-md rounded-card p-8 text-center";
    return (
      <div role="alert" className={compact ? "py-8" : "relative flex min-h-dvh items-center justify-center p-6"}>
        {!compact && <div className="glow-radial" aria-hidden />}
        <div className={box}>
          <h1 className="font-display text-2xl font-bold text-ink">{title ?? "页面出错了"}</h1>
          <p className="mt-2 text-sm text-ink-2">界面遇到未预期的问题，你的文件没有受到影响。</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button onClick={this.reload}>重新加载</Button>
            <Button variant="ghost" onClick={() => window.location.assign("/")}>
              返回首页
            </Button>
          </div>
          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-xs text-ink-3">错误详情</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2 p-3 text-2xs text-ink-3">
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
