/**
 * Chain 图标选择器 - 简洁实用版
 *
 * 特点：
 * - 40 个精选预设图标，按 5 个分类组织
 * - 支持搜索（中文/英文）
 * - 网格显示，点击即选
 * - 无复杂依赖，纯 SVG
 */

import React, { useState, useMemo } from "react"
import { CHAIN_ICON_PRESETS, type ChainIconPreset } from "~constants/chain-icons"

interface ChainIconPickerProps {
  value?: string // 当前选中的图标 ID
  onChange: (iconId: string, svg: string) => void
  onClose: () => void
}

const CATEGORIES = [
  { id: "all", label: "全部" },
  { id: "common", label: "常用" },
  { id: "work", label: "工作" },
  { id: "learning", label: "学习" },
  { id: "creative", label: "创意" },
  { id: "analysis", label: "分析" },
]

export function ChainIconPicker({ value, onChange, onClose }: ChainIconPickerProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")

  // 过滤图标
  const filteredIcons = useMemo(() => {
    let icons = CHAIN_ICON_PRESETS

    // 按分类过滤
    if (selectedCategory !== "all") {
      icons = icons.filter((icon) => icon.category === selectedCategory)
    }

    // 按搜索词过滤（支持中文/英文）
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      icons = icons.filter(
        (icon) =>
          icon.label.includes(query) ||
          icon.labelEn.toLowerCase().includes(query) ||
          icon.id.includes(query),
      )
    }

    return icons
  }, [selectedCategory, searchQuery])

  return (
    <div className="gh-chain-icon-picker">
      {/* 头部：搜索 + 关闭 */}
      <div className="gh-chain-icon-picker-header">
        <input
          type="text"
          placeholder="搜索图标... (如: 翻译, translate)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="gh-chain-icon-picker-search"
          autoFocus
        />
        <button onClick={onClose} className="gh-chain-icon-picker-close">
          关闭
        </button>
      </div>

      {/* 分类标签 */}
      <div className="gh-chain-icon-picker-categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`gh-chain-icon-picker-category${selectedCategory === cat.id ? " active" : ""}`}
            onClick={() => setSelectedCategory(cat.id)}>
            {cat.label}
          </button>
        ))}
      </div>

      {/* 图标网格 */}
      <div className="gh-chain-icon-picker-grid">
        {filteredIcons.length === 0 ? (
          <div className="gh-chain-icon-picker-empty">未找到匹配的图标</div>
        ) : (
          filteredIcons.map((icon) => (
            <button
              key={icon.id}
              className={`gh-chain-icon-picker-item${value === icon.svg ? " active" : ""}`}
              onClick={() => onChange(icon.id, icon.svg)}
              title={`${icon.label} (${icon.labelEn})`}>
              <div
                className="gh-chain-icon-picker-icon"
                dangerouslySetInnerHTML={{ __html: icon.svg }}
              />
              <span className="gh-chain-icon-picker-label">{icon.label}</span>
            </button>
          ))
        )}
      </div>

      {/* 底部信息 */}
      <div className="gh-chain-icon-picker-footer">
        显示 {filteredIcons.length} / {CHAIN_ICON_PRESETS.length} 个图标
      </div>
    </div>
  )
}
