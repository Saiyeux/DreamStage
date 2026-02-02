import { NavLink, Outlet } from 'react-router-dom'
import { useProjectStore } from '@/stores/projectStore'

export function Layout() {
  const { currentProject, reset } = useProjectStore()

  // 根据是否有当前项目，生成带参数的导航路径
  const getNavPath = (basePath: string) => {
    if (!currentProject?.id) return basePath
    if (basePath === '/' || basePath === '/upload') return basePath
    return `${basePath}?project=${currentProject.id}`
  }

  const navItems = [
    { path: '/', label: '首页', icon: '🏠' },
    { path: '/upload', label: '剧本上传', icon: '📄' },
    { path: '/analysis', label: '剧本分析', icon: '📊' },
    { path: '/generation', label: '生成中心', icon: '🎨' },
    { path: '/config', label: '配置管理', icon: '⚙️' },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 relative isolation-isolate">
      {/* Ambient Background - fixed position */}
      <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/20 rounded-full blur-[100px] opacity-80 animate-pulse-slow" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-orange-400/20 rounded-full blur-[100px] opacity-70 animate-pulse-slow" style={{ animationDelay: '1s' }} />
        <div className="absolute top-[40%] left-[30%] w-[30%] h-[40%] bg-blue-400/20 rounded-full blur-[120px] opacity-50 animate-pulse-slow" style={{ animationDelay: '2s' }} />
      </div>

      {/* Modern Header */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl backdrop-saturate-150 border-b border-white/20 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-600 to-primary-500 flex items-center justify-center shadow-lg shadow-primary-500/30 ring-1 ring-white/50">
                <span className="text-white font-bold text-lg">AI</span>
              </div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                AI Short Drama
              </h1>
            </div>

            {/* Current Project & Actions */}
            <div className="flex items-center gap-4">
              {currentProject ? (
                <div className="flex items-center gap-3 px-3 py-1.5 bg-white/50 backdrop-blur-sm border border-primary-100/50 rounded-full shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] animate-pulse"></span>
                  <span className="text-xs font-medium text-slate-500">
                    Project: <span className="text-primary-700 font-semibold">{currentProject.name}</span>
                  </span>
                  <button
                    onClick={reset}
                    className="ml-1 w-5 h-5 flex items-center justify-center rounded-full hover:bg-white text-slate-400 hover:text-red-500 transition-colors"
                    title="Close Project"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="text-xs font-medium text-slate-400">
                  No project active
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="border-t border-white/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-1 overflow-x-auto scrollbar-hide py-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={getNavPath(item.path)}
                  className={({ isActive }) =>
                    `relative px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap ${isActive
                      ? 'text-primary-700 bg-primary-50/50 shadow-sm ring-1 ring-primary-100'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className="flex items-center gap-2">
                        <span className={`text-base transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'}`}>{item.icon}</span>
                        <span>{item.label}</span>
                      </span>
                      {isActive && (
                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-0.5 bg-primary-500 rounded-full mb-1 shadow-[0_0_6px_rgba(99,102,241,0.6)]"></span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in relative z-0">
        <Outlet />
      </main>
    </div>
  )
}
