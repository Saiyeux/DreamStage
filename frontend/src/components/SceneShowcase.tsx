import { useState, useEffect } from 'react'
import type { Scene } from '@/types'
import { fileUrl } from '@/api/client'

interface SceneShowcaseProps {
  scenes: Scene[]
  initialIndex?: number
  onClose: () => void
}

export function SceneShowcase({ scenes, initialIndex = 0, onClose }: SceneShowcaseProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [isAnimating, setIsAnimating] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const currentScene = scenes[currentIndex]

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goToPrevious()
      if (e.key === 'ArrowRight') goToNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex])

  // 重置图片加载状态
  useEffect(() => {
    setImageLoaded(false)
  }, [currentIndex])

  const goToNext = () => {
    if (isAnimating) return
    setIsAnimating(true)
    setCurrentIndex((prev) => (prev + 1) % scenes.length)
    setTimeout(() => setIsAnimating(false), 600)
  }

  const goToPrevious = () => {
    if (isAnimating) return
    setIsAnimating(true)
    setCurrentIndex((prev) => (prev - 1 + scenes.length) % scenes.length)
    setTimeout(() => setIsAnimating(false), 600)
  }

  const selectScene = (index: number) => {
    if (isAnimating || index === currentIndex) return
    setIsAnimating(true)
    setCurrentIndex(index)
    setTimeout(() => setIsAnimating(false), 600)
  }

  const hasSceneImage = currentScene.sceneImage?.imagePath

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* 背景图片 */}
      {hasSceneImage ? (
        <div className="absolute inset-0">
          <img
            src={fileUrl.image(currentScene.sceneImage!.imagePath)}
            alt={`场景 ${currentScene.sceneNumber}`}
            className={`w-full h-full object-cover transition-all duration-1000 ${isAnimating ? 'scale-110 opacity-0 blur-sm' : 'scale-100 opacity-100'
              }`}
            onLoad={() => setImageLoaded(true)}
          />
          {/* 渐变遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/60" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/60" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
          <div className="text-8xl opacity-20">🎬</div>
        </div>
      )}

      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-50 w-14 h-14 bg-black/30 hover:bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white text-2xl transition-all duration-300 hover:rotate-90 hover:scale-110 border border-white/20"
      >
        ✕
      </button>

      {/* 场景编号标识 */}
      <div className={`absolute top-6 left-6 z-10 transition-all duration-700 ${isAnimating ? 'translate-y-[-50px] opacity-0' : 'translate-y-0 opacity-100'}`}>
        <div className="bg-black/30 backdrop-blur-lg rounded-2xl px-6 py-3 border border-white/20">
          <div className="text-white/70 text-xs uppercase tracking-wider mb-1">Scene</div>
          <div className="text-white text-3xl font-bold">#{currentScene.sceneNumber}</div>
        </div>
      </div>

      {/* 左侧场景信息 */}
      <div className="absolute left-6 top-1/2 -translate-y-1/2 z-10 w-96 space-y-4">
        {/* 场景标题 */}
        <div className={`transition-all duration-700 ${isAnimating ? 'translate-x-[-100px] opacity-0' : 'translate-x-0 opacity-100'}`}>
          <h1 className="text-5xl font-bold text-white mb-3 drop-shadow-2xl" style={{ textShadow: '0 0 40px rgba(0,0,0,0.9)' }}>
            {currentScene.location}
          </h1>
          <div className="flex items-center gap-3 text-white/90">
            <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm font-medium border border-white/30">
              {currentScene.timeOfDay}
            </span>
            <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm font-medium border border-white/30">
              {currentScene.durationSeconds}秒
            </span>
          </div>
        </div>

        {/* 环境描述 */}
        <div className={`bg-black/30 backdrop-blur-lg rounded-2xl p-5 border border-white/20 transition-all duration-700 delay-100 ${isAnimating ? 'translate-x-[-100px] opacity-0' : 'translate-x-0 opacity-100'}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">🌄</span>
            <h3 className="text-white font-bold">环境氛围</h3>
          </div>
          <p className="text-white/90 text-sm leading-relaxed">
            {currentScene.atmosphere}
          </p>
          {currentScene.environmentDesc && (
            <p className="text-white/80 text-xs mt-2 pt-2 border-t border-white/20">
              {currentScene.environmentDesc}
            </p>
          )}
        </div>


      </div>

      {/* 右侧角色与对白 */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 z-10 w-96 space-y-4">
        {/* 角色列表 */}
        {currentScene.characters && currentScene.characters.length > 0 && (
          <div className={`bg-black/30 backdrop-blur-lg rounded-2xl p-5 border border-white/20 transition-all duration-700 ${isAnimating ? 'translate-x-[100px] opacity-0' : 'translate-x-0 opacity-100'}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">👥</span>
              <h3 className="text-white font-bold">出场角色</h3>
            </div>
            <div className="space-y-2">
              {currentScene.characters.map((char, index) => (
                <div key={index} className="bg-white/10 rounded-lg p-3">
                  <div className="text-white font-medium mb-1">{char.characterName}</div>
                  <div className="text-white/70 text-xs space-y-1">
                    <div>位置: {char.position}</div>
                    <div>动作: {char.action}</div>
                    <div>表情: {char.expression}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 对白 */}
        {currentScene.dialogue && (
          <div className={`bg-black/30 backdrop-blur-lg rounded-2xl p-5 border border-white/20 transition-all duration-700 delay-100 ${isAnimating ? 'translate-x-[100px] opacity-0' : 'translate-x-0 opacity-100'}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">💬</span>
              <h3 className="text-white font-bold">对白</h3>
            </div>
            <p className="text-white/90 text-sm leading-relaxed whitespace-pre-line max-h-40 overflow-y-auto">
              {currentScene.dialogue}
            </p>
          </div>
        )}
      </div>

      {/* 左右切换按钮 */}
      <button
        onClick={goToPrevious}
        disabled={isAnimating}
        className="absolute left-6 top-1/2 -translate-y-1/2 z-20 w-16 h-16 bg-black/30 hover:bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white text-3xl transition-all duration-300 hover:scale-110 border border-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ‹
      </button>
      <button
        onClick={goToNext}
        disabled={isAnimating}
        className="absolute right-6 top-1/2 -translate-y-1/2 z-20 w-16 h-16 bg-black/30 hover:bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white text-3xl transition-all duration-300 hover:scale-110 border border-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ›
      </button>

      {/* 底部场景缩略图选择器 */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-full max-w-5xl px-6">
        <div className="bg-black/30 backdrop-blur-lg rounded-2xl p-4 border border-white/20">
          <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={goToPrevious}
              disabled={isAnimating}
              className="flex-shrink-0 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all disabled:opacity-30"
            >
              ‹
            </button>

            {scenes.map((scene, index) => {
              const isActive = index === currentIndex
              const hasImage = scene.sceneImage?.imagePath

              return (
                <button
                  key={scene.id}
                  onClick={() => selectScene(index)}
                  disabled={isAnimating}
                  className={`flex-shrink-0 group relative transition-all duration-300 ${isActive ? 'scale-110' : 'scale-90 opacity-60 hover:opacity-100 hover:scale-95'
                    }`}
                >
                  {/* 选中指示器 */}
                  {isActive && (
                    <div className="absolute -inset-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl blur-sm" />
                  )}

                  {/* 缩略图容器 */}
                  <div className={`relative w-28 h-20 bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg overflow-hidden shadow-lg border-2 ${isActive ? 'border-white' : 'border-white/30'
                    }`}>
                    {hasImage ? (
                      <img
                        src={fileUrl.image(scene.sceneImage!.imagePath)}
                        alt={`场景 ${scene.sceneNumber}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/50 text-2xl">
                        🎬
                      </div>
                    )}

                    {/* 场景编号覆盖层 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end justify-start p-2">
                      <span className="text-white text-xs font-bold">#{scene.sceneNumber}</span>
                    </div>
                  </div>

                  {/* 场景名称标签 */}
                  <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-medium transition-all ${isActive ? 'text-white opacity-100' : 'text-white/70 opacity-0 group-hover:opacity-100'
                    }`}>
                    {scene.location}
                  </div>
                </button>
              )
            })}

            <button
              onClick={goToNext}
              disabled={isAnimating}
              className="flex-shrink-0 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {/* 进度指示器 */}
      <div className="absolute bottom-28 left-1/2 -translate-x-1/2 flex gap-2">
        {scenes.map((_, index) => (
          <div
            key={index}
            className={`h-1 rounded-full transition-all duration-300 ${index === currentIndex ? 'w-8 bg-white' : 'w-1 bg-white/30'
              }`}
          />
        ))}
      </div>

      {/* 图片加载提示 */}
      {hasSceneImage && !imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-30">
          <div className="text-white text-lg flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>加载场景图片中...</span>
          </div>
        </div>
      )}
    </div>
  )
}
