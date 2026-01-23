import { NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { path: '/', label: '首页', icon: '🏠' },
  { path: '/upload', label: '剧本上传', icon: '📄' },
  { path: '/analysis', label: '剧本分析', icon: '📊' },
  { path: '/generation', label: '生成中心', icon: '🎨' },
]

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl font-bold text-gray-800">
              🎬 AI短剧制作系统
            </h1>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-1">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`
                }
              >
                {item.icon} {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
