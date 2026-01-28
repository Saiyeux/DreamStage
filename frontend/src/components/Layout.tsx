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
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="glass-effect sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
              🎬 AI短剧制作系统
            </h1>

            {/* 当前项目指示 */}
            {currentProject && (
              <div className="flex items-center gap-3 bg-gradient-to-r from-purple-50 to-indigo-50 px-4 py-2 rounded-full">
                <span className="text-sm text-gray-600">
                  当前项目: <span className="font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">{currentProject.name}</span>
                </span>
                <button
                  onClick={reset}
                  className="text-xs text-gray-400 hover:text-red-500 hover:rotate-90 transition-transform duration-300"
                  title="关闭项目"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-2">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={getNavPath(item.path)}
                className={({ isActive }) =>
                  `px-5 py-3 text-sm font-medium rounded-t-lg transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg transform scale-105'
                      : 'text-gray-600 hover:bg-white/50 hover:text-purple-600'
                  }`
                }
              >
                <span className="flex items-center gap-2">
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.label}</span>
                </span>
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 py-8 animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
