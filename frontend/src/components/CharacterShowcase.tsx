import { useState, useEffect } from 'react'
import type { Character } from '@/types'
import { fileUrl } from '@/api/client'

interface CharacterShowcaseProps {
  characters: Character[]
  initialIndex?: number
  onClose: () => void
  onGenerate?: (characterId: string) => void
  onUpdate?: (characterId: string, updates: Partial<Character>) => void
}

export function CharacterShowcase({
  characters,
  initialIndex = 0,
  onClose,
  onGenerate,
  onUpdate
}: CharacterShowcaseProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState<Partial<Character>>({})
  const currentCharacter = characters[currentIndex]

  // 重置编辑状态
  useEffect(() => {
    setIsEditing(false)
    setEditData({})
  }, [currentIndex])

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

  const goToNext = () => {
    if (isAnimating) return
    setIsAnimating(true)
    setCurrentIndex((prev) => (prev + 1) % characters.length)
    setTimeout(() => setIsAnimating(false), 500)
  }

  const goToPrevious = () => {
    if (isAnimating) return
    setIsAnimating(true)
    setCurrentIndex((prev) => (prev - 1 + characters.length) % characters.length)
    setTimeout(() => setIsAnimating(false), 500)
  }

  const selectCharacter = (index: number) => {
    if (isAnimating || index === currentIndex) return
    setIsAnimating(true)
    setCurrentIndex(index)
    setTimeout(() => setIsAnimating(false), 500)
  }

  const avatar = currentCharacter.gender?.includes('女') ? '👩' : currentCharacter.gender?.includes('男') ? '👨' : '👤'
  const bgGradient = currentCharacter.gender?.includes('女')
    ? 'from-pink-500/20 via-rose-500/20 to-purple-500/20'
    : currentCharacter.gender?.includes('男')
    ? 'from-blue-500/20 via-indigo-500/20 to-purple-500/20'
    : 'from-gray-500/20 via-slate-500/20 to-gray-600/20'

  // 获取主要角色图
  const mainImage = currentCharacter.images?.[0]
  const hasImage = !!mainImage

  // 保存编辑
  const handleSave = () => {
    if (onUpdate && Object.keys(editData).length > 0) {
      onUpdate(currentCharacter.id, editData)
    }
    setIsEditing(false)
    setEditData({})
  }

  // 取消编辑
  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditData({})
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm">
      {/* 背景渐变 */}
      <div className={`absolute inset-0 bg-gradient-to-br ${bgGradient} transition-all duration-1000`} />

      {/* 中央角色展示区域 */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        {hasImage ? (
          // 显示角色图
          <div className={`relative w-[500px] h-[700px] transition-all duration-700 ${isAnimating ? 'scale-110 opacity-0' : 'scale-100 opacity-100'}`}>
            <img
              src={fileUrl.image(mainImage.imagePath)}
              alt={currentCharacter.name}
              className="w-full h-full object-contain drop-shadow-2xl"
              style={{
                filter: 'drop-shadow(0 0 60px rgba(0,0,0,0.5))',
              }}
            />
          </div>
        ) : (
          // 待生成状态
          <div className={`relative transition-all duration-700 ${isAnimating ? 'scale-110 opacity-0' : 'scale-100 opacity-100'}`}>
            <div className="w-96 h-[500px] bg-gradient-to-br from-white/5 to-white/10 backdrop-blur-sm rounded-3xl border-2 border-dashed border-white/30 flex flex-col items-center justify-center p-8 relative overflow-hidden">
              {/* 装饰性背景 */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10" />

              {/* 内容 */}
              <div className="relative z-10 text-center">
                <div className="text-8xl mb-6 opacity-30">{avatar}</div>
                <h3 className="text-3xl font-bold text-white mb-4">待生成角色图</h3>
                <p className="text-white/70 mb-8">点击下方按钮生成该角色的参考图</p>

                {onGenerate && (
                  <button
                    onClick={() => onGenerate(currentCharacter.id)}
                    className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-bold text-lg shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 hover:scale-105"
                  >
                    🎨 生成角色图
                  </button>
                )}

                {/* 提示信息 */}
                <div className="mt-8 text-xs text-white/50">
                  <p>基于AI分析的角色特征生成</p>
                  <p className="mt-1">生成后可用于保持场景一致性</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 关闭按钮 */}
      <button
        onClick={onClose}
        className="absolute top-8 right-8 z-50 w-12 h-12 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white text-2xl transition-all duration-300 hover:rotate-90 hover:scale-110 border border-white/20"
      >
        ✕
      </button>

      {/* 左侧信息面板 */}
      <div className="absolute left-8 top-1/2 -translate-y-1/2 z-10 w-96 space-y-4">
        {/* 角色名称 */}
        <div className={`transition-all duration-700 ${isAnimating ? 'translate-x-[-100px] opacity-0' : 'translate-x-0 opacity-100'}`}>
          <h1 className="text-6xl font-bold text-white mb-3 drop-shadow-2xl" style={{ textShadow: '0 0 40px rgba(0,0,0,0.8)' }}>
            {currentCharacter.name}
          </h1>
          <div className="flex items-center gap-3 mb-4">
            <div className="text-5xl drop-shadow-lg">{avatar}</div>
            <div className="text-white/90">
              <div className="text-xs uppercase tracking-wider opacity-70">Character</div>
              <div className="text-lg font-bold">{currentCharacter.roleType}</div>
            </div>
          </div>

          {/* 角色图状态 */}
          <div className="flex items-center gap-2">
            {hasImage ? (
              <span className="px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-sm border border-green-500/30">
                ✓ 已生成 {currentCharacter.images?.length || 0} 张图
              </span>
            ) : (
              <span className="px-3 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-sm border border-yellow-500/30">
                ⏳ 待生成
              </span>
            )}
          </div>
        </div>

        {/* 基本信息卡片 */}
        <div className={`bg-white/10 backdrop-blur-lg rounded-2xl p-5 border border-white/20 shadow-2xl transition-all duration-700 delay-100 ${isAnimating ? 'translate-x-[-100px] opacity-0' : 'translate-x-0 opacity-100'}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-bold">基本信息</h3>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-white text-xs transition-all"
            >
              {isEditing ? '✕ 取消' : '✏️ 编辑'}
            </button>
          </div>
          <div className="space-y-2 text-white">
            <InfoRow icon="👤" label="性别" value={currentCharacter.gender || '-'} editable={isEditing} />
            <InfoRow icon="🎂" label="年龄" value={currentCharacter.age || '-'} editable={isEditing} />
            <InfoRow icon="🎭" label="角色类型" value={currentCharacter.roleType || '-'} editable={isEditing} />
            <InfoRow icon="📍" label="出场次数" value={`${currentCharacter.sceneNumbers?.length || 0} 场`} />
          </div>

          {isEditing && (
            <div className="mt-4 pt-4 border-t border-white/20 flex gap-2">
              <button
                onClick={handleCancelEdit}
                className="flex-1 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-all"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white text-sm transition-all"
              >
                保存
              </button>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        {!hasImage && onGenerate && (
          <div className={`transition-all duration-700 delay-200 ${isAnimating ? 'translate-x-[-100px] opacity-0' : 'translate-x-0 opacity-100'}`}>
            <button
              onClick={() => onGenerate(currentCharacter.id)}
              className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-bold shadow-2xl hover:shadow-purple-500/50 transition-all duration-300 hover:scale-105"
            >
              🎨 生成角色图
            </button>
          </div>
        )}
      </div>

      {/* 右侧详细信息 */}
      <div className="absolute right-8 top-1/2 -translate-y-1/2 z-10 w-96 space-y-4">
        {/* 外貌特征 */}
        <DetailPanel
          title="外貌特征"
          icon="✨"
          isAnimating={isAnimating}
          delay={0}
          editable={isEditing}
        >
          {isEditing ? (
            <div className="space-y-2">
              <EditableField label="发型" defaultValue={currentCharacter.hair} />
              <EditableField label="脸型" defaultValue={currentCharacter.face} />
              <EditableField label="身材" defaultValue={currentCharacter.body} />
              <EditableField label="肤色" defaultValue={currentCharacter.skin} />
            </div>
          ) : (
            <>
              <DetailItem label="发型" value={currentCharacter.hair} />
              <DetailItem label="脸型" value={currentCharacter.face} />
              <DetailItem label="身材" value={currentCharacter.body} />
              <DetailItem label="肤色" value={currentCharacter.skin} />
            </>
          )}
        </DetailPanel>

        {/* 性格特点 */}
        <DetailPanel
          title="性格特点"
          icon="💫"
          isAnimating={isAnimating}
          delay={100}
          editable={isEditing}
        >
          {isEditing ? (
            <textarea
              defaultValue={currentCharacter.personality}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-purple-500 transition-colors resize-none"
              rows={4}
              placeholder="描述角色性格..."
            />
          ) : (
            <p className="text-white/90 leading-relaxed text-sm">{currentCharacter.personality || '暂无描述'}</p>
          )}
        </DetailPanel>

        {/* 服装风格 */}
        <DetailPanel
          title="服装风格"
          icon="👔"
          isAnimating={isAnimating}
          delay={200}
          editable={isEditing}
        >
          {isEditing ? (
            <textarea
              defaultValue={currentCharacter.clothingStyle}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-purple-500 transition-colors resize-none"
              rows={3}
              placeholder="描述服装风格..."
            />
          ) : (
            <p className="text-white/90 leading-relaxed text-sm">{currentCharacter.clothingStyle || '暂无描述'}</p>
          )}
        </DetailPanel>
      </div>

      {/* 左右切换按钮 */}
      <button
        onClick={goToPrevious}
        disabled={isAnimating}
        className="absolute left-8 top-1/2 -translate-y-1/2 z-20 w-16 h-16 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white text-3xl transition-all duration-300 hover:scale-110 border border-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ‹
      </button>
      <button
        onClick={goToNext}
        disabled={isAnimating}
        className="absolute right-8 top-1/2 -translate-y-1/2 z-20 w-16 h-16 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white text-3xl transition-all duration-300 hover:scale-110 border border-white/20 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ›
      </button>

      {/* 底部角色选择器 - 精致版 */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 w-full max-w-5xl px-8">
        <div className="bg-gradient-to-r from-white/5 via-white/10 to-white/5 backdrop-blur-xl rounded-3xl p-6 border border-white/20 shadow-2xl">
          {/* 标题栏 */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-white/80 text-sm font-medium">
              角色列表 <span className="text-white/50">({currentIndex + 1}/{characters.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevious}
                disabled={isAnimating}
                className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white transition-all disabled:opacity-30"
              >
                ‹
              </button>
              <button
                onClick={goToNext}
                disabled={isAnimating}
                className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center text-white transition-all disabled:opacity-30"
              >
                ›
              </button>
            </div>
          </div>

          {/* 角色缩略图列表 */}
          <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {characters.map((char, index) => {
              const charAvatar = char.gender?.includes('女') ? '👩' : char.gender?.includes('男') ? '👨' : '👤'
              const isActive = index === currentIndex
              const charHasImage = char.images?.[0]

              return (
                <button
                  key={char.id}
                  onClick={() => selectCharacter(index)}
                  disabled={isAnimating}
                  className={`flex-shrink-0 group relative transition-all duration-300 ${
                    isActive ? 'scale-100' : 'scale-90 opacity-50 hover:opacity-100 hover:scale-95'
                  }`}
                >
                  {/* 选中光环 */}
                  {isActive && (
                    <div className="absolute -inset-1.5 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 rounded-2xl blur-md animate-pulse" />
                  )}

                  {/* 头像卡片 */}
                  <div className={`relative bg-gradient-to-br from-white/10 to-white/5 rounded-xl border-2 overflow-hidden shadow-xl transition-all ${
                    isActive ? 'border-white w-24 h-28' : 'border-white/20 w-20 h-24'
                  }`}>
                    {charHasImage ? (
                      // 显示角色图缩略图
                      <img
                        src={fileUrl.image(char.images![0].imagePath)}
                        alt={char.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      // 显示emoji占位
                      <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${
                        char.gender?.includes('女') ? 'from-pink-500/30 to-rose-500/30' :
                        char.gender?.includes('男') ? 'from-blue-500/30 to-indigo-500/30' :
                        'from-gray-500/30 to-gray-600/30'
                      }`}>
                        <span className={isActive ? 'text-4xl' : 'text-3xl'}>{charAvatar}</span>
                      </div>
                    )}

                    {/* 状态指示器 */}
                    <div className="absolute top-1 right-1">
                      {charHasImage ? (
                        <div className="w-3 h-3 bg-green-500 rounded-full border border-white/50" />
                      ) : (
                        <div className="w-3 h-3 bg-yellow-500 rounded-full border border-white/50" />
                      )}
                    </div>

                    {/* 渐变遮罩 */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                    {/* 名字标签 */}
                    <div className="absolute bottom-0 left-0 right-0 px-2 py-1">
                      <div className={`text-white font-medium truncate text-center transition-all ${
                        isActive ? 'text-xs' : 'text-[10px]'
                      }`}>
                        {char.name}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* 提示文字 */}
          <div className="mt-3 text-center text-white/40 text-xs">
            点击切换角色 • 使用键盘 ← → 快速浏览
          </div>
        </div>
      </div>

      {/* 进度指示器 */}
      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 flex gap-2">
        {characters.map((_, index) => (
          <div
            key={index}
            className={`h-1 rounded-full transition-all duration-300 ${
              index === currentIndex ? 'w-8 bg-white' : 'w-1 bg-white/30'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

// 辅助组件
function InfoRow({
  icon,
  label,
  value,
  editable
}: {
  icon: string
  label: string
  value: string
  editable?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/10 last:border-0">
      <div className="flex items-center gap-2 text-white/70 text-sm">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      {editable ? (
        <input
          type="text"
          defaultValue={value}
          className="bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-sm text-right outline-none focus:border-purple-500 transition-colors"
        />
      ) : (
        <div className="font-medium text-sm">{value}</div>
      )}
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/10 last:border-0">
      <span className="text-white/70 text-sm">{label}</span>
      <span className="text-white font-medium text-sm">{value || '-'}</span>
    </div>
  )
}

function EditableField({ label, defaultValue }: { label: string; defaultValue?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-white/70 text-sm w-12 flex-shrink-0">{label}</span>
      <input
        type="text"
        defaultValue={defaultValue}
        className="flex-1 bg-white/10 border border-white/20 rounded px-3 py-1.5 text-white text-sm outline-none focus:border-purple-500 transition-colors"
        placeholder={`输入${label}...`}
      />
    </div>
  )
}

function DetailPanel({
  title,
  icon,
  children,
  isAnimating,
  delay,
  editable,
}: {
  title: string
  icon: string
  children: React.ReactNode
  isAnimating: boolean
  delay: number
  editable?: boolean
}) {
  return (
    <div
      className={`bg-white/10 backdrop-blur-lg rounded-2xl p-5 border border-white/20 shadow-2xl transition-all duration-700 ${isAnimating ? 'translate-x-[100px] opacity-0' : 'translate-x-0 opacity-100'}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <h3 className="text-white font-bold">{title}</h3>
        </div>
        {editable && (
          <span className="text-xs text-purple-300 bg-purple-500/20 px-2 py-1 rounded-full">
            编辑中
          </span>
        )}
      </div>
      <div>{children}</div>
    </div>
  )
}
