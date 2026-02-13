import React from "react"

import { SearchIcon } from "~components/icons"

import type { GlobalSearchSyntaxSuggestionItem } from "./types"

interface GlobalSearchFilterChipItem {
  id: string
  label: string
}

interface GlobalSearchSyntaxHelpItem {
  id: string
  token: string
  description: string
}

interface GlobalSearchSyntaxDiagnosticItem {
  id: string
  code: string
  operator: string
  value?: string
  suggestion?: string
}

interface GlobalSearchCategoryTab<TCategoryId extends string> {
  id: TCategoryId
  label: string
  count: number
}

interface GlobalSearchContextInfo {
  label: string
  meta: string
}

interface GlobalSearchGroupedResult<TItem, TCategoryId extends string> {
  category: TCategoryId
  items: TItem[]
  totalCount: number
  hasMore: boolean
  isExpanded: boolean
  remainingCount: number
}

interface GlobalSearchEmptyGuideExample {
  id: string
  token: string
  onClick: () => void
}

interface GlobalSearchOverlayProps<TItem, TCategoryId extends string> {
  isOpen: boolean
  onClose: () => void
  inputRef: React.RefObject<HTMLInputElement>
  resultsRef: React.RefObject<HTMLDivElement>
  activeOptionId?: string
  inputValue: string
  inputPlaceholder: string
  onInputChange: (nextValue: string) => void
  hotkeyLabel: string
  fuzzySearchToggleLabel: string
  fuzzySearchToggleAriaLabel: string
  isFuzzySearchEnabled: boolean
  onToggleFuzzySearch: () => void
  syntaxHelpTriggerRef: React.RefObject<HTMLButtonElement>
  syntaxHelpPopoverRef: React.RefObject<HTMLDivElement>
  showSyntaxHelp: boolean
  onToggleSyntaxHelp: () => void
  syntaxHelpTriggerAriaLabel: string
  syntaxHelpTitle: string
  syntaxHelpDescription: string
  syntaxHelpItems: GlobalSearchSyntaxHelpItem[]
  onApplySyntaxHelpItem: (item: GlobalSearchSyntaxHelpItem) => void
  activeFilterChips: GlobalSearchFilterChipItem[]
  hasOverflowFilterChips: boolean
  overflowFilterChipText: string
  filterChipRemoveTitle: string
  clearFiltersLabel: string
  onRemoveFilterChip: (chipId: string) => void
  onClearAllFilterChips: () => void
  shouldShowSyntaxSuggestions: boolean
  syntaxSuggestions: GlobalSearchSyntaxSuggestionItem[]
  activeSyntaxSuggestionIndex: number
  onHoverSyntaxSuggestion: (index: number) => void
  onApplySyntaxSuggestion: (item: GlobalSearchSyntaxSuggestionItem) => void
  syntaxDiagnostics: GlobalSearchSyntaxDiagnosticItem[]
  resolveSyntaxDiagnosticTitle: (code: string) => string
  showShortcutNudge: boolean
  shortcutNudgeMessage: string
  closeLabel: string
  dismissShortcutNudgeLabel: string
  onHideShortcutNudge: () => void
  onDismissShortcutNudgeForever: () => void
  categoriesLabel: string
  categories: GlobalSearchCategoryTab<TCategoryId>[]
  activeCategoryId: TCategoryId
  onSelectCategory: (categoryId: TCategoryId) => void
  activeContext: GlobalSearchContextInfo | null
  listboxId: string
  listboxLabel: string
  onResultsWheel: () => void
  visibleResults: TItem[]
  groupedResults: GlobalSearchGroupedResult<TItem, TCategoryId>[]
  getGroupLabel: (categoryId: TCategoryId) => string
  allCategoryItemLimit: number
  isAllCategory: boolean
  emptyText: string
  emptyGuideTitle: string
  emptyGuideDescription: string
  emptyGuideExamples: GlobalSearchEmptyGuideExample[]
  renderSearchResultItem: (item: TItem, index: number) => React.ReactNode
  resolveVisibleResultIndex: (item: TItem, fallbackIndex: number) => number
  collapseLabel: string
  moreLabel: string
  onToggleCategoryGroup: (categoryId: TCategoryId) => void
  footerTips: string
  promptPreview?: React.ReactNode
}

export const GlobalSearchOverlay = <TItem, TCategoryId extends string>(
  props: GlobalSearchOverlayProps<TItem, TCategoryId>,
) => {
  const {
    isOpen,
    onClose,
    inputRef,
    resultsRef,
    activeOptionId,
    inputValue,
    inputPlaceholder,
    onInputChange,
    hotkeyLabel,
    fuzzySearchToggleLabel,
    fuzzySearchToggleAriaLabel,
    isFuzzySearchEnabled,
    onToggleFuzzySearch,
    syntaxHelpTriggerRef,
    syntaxHelpPopoverRef,
    showSyntaxHelp,
    onToggleSyntaxHelp,
    syntaxHelpTriggerAriaLabel,
    syntaxHelpTitle,
    syntaxHelpDescription,
    syntaxHelpItems,
    onApplySyntaxHelpItem,
    activeFilterChips,
    hasOverflowFilterChips,
    overflowFilterChipText,
    filterChipRemoveTitle,
    clearFiltersLabel,
    onRemoveFilterChip,
    onClearAllFilterChips,
    shouldShowSyntaxSuggestions,
    syntaxSuggestions,
    activeSyntaxSuggestionIndex,
    onHoverSyntaxSuggestion,
    onApplySyntaxSuggestion,
    syntaxDiagnostics,
    resolveSyntaxDiagnosticTitle,
    showShortcutNudge,
    shortcutNudgeMessage,
    closeLabel,
    dismissShortcutNudgeLabel,
    onHideShortcutNudge,
    onDismissShortcutNudgeForever,
    categoriesLabel,
    categories,
    activeCategoryId,
    onSelectCategory,
    activeContext,
    listboxId,
    listboxLabel,
    onResultsWheel,
    visibleResults,
    groupedResults,
    getGroupLabel,
    allCategoryItemLimit,
    isAllCategory,
    emptyText,
    emptyGuideTitle,
    emptyGuideDescription,
    emptyGuideExamples,
    renderSearchResultItem,
    resolveVisibleResultIndex,
    collapseLabel,
    moreLabel,
    onToggleCategoryGroup,
    footerTips,
    promptPreview,
  } = props

  if (!isOpen) {
    return null
  }

  return (
    <div className="settings-search-overlay gh-interactive" onClick={onClose}>
      <div className="settings-search-modal" onClick={(event) => event.stopPropagation()}>
        <div className="settings-search-input-wrap">
          <SearchIcon size={16} />
          <button
            type="button"
            className={`settings-search-fuzzy-toggle ${isFuzzySearchEnabled ? "active" : ""}`}
            aria-pressed={isFuzzySearchEnabled}
            aria-label={fuzzySearchToggleAriaLabel}
            onClick={onToggleFuzzySearch}>
            {fuzzySearchToggleLabel}
          </button>
          <input
            ref={inputRef}
            className="settings-search-input"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={true}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            value={inputValue}
            onChange={(event) => {
              onInputChange(event.target.value)
            }}
            placeholder={inputPlaceholder}
          />
          <span className="settings-search-hotkey">⌨ {hotkeyLabel}</span>
          <div className="settings-search-help">
            <button
              ref={syntaxHelpTriggerRef}
              type="button"
              className={`settings-search-help-trigger ${showSyntaxHelp ? "active" : ""}`}
              aria-expanded={showSyntaxHelp}
              aria-label={syntaxHelpTriggerAriaLabel}
              onClick={onToggleSyntaxHelp}>
              ?
            </button>
            {showSyntaxHelp ? (
              <div
                ref={syntaxHelpPopoverRef}
                className="settings-search-help-popover"
                role="dialog"
                aria-label={syntaxHelpTitle}>
                <div className="settings-search-help-title">{syntaxHelpTitle}</div>
                <div className="settings-search-help-tip">{syntaxHelpDescription}</div>
                <div className="settings-search-help-items">
                  {syntaxHelpItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="settings-search-help-item"
                      onClick={() => onApplySyntaxHelpItem(item)}>
                      <span className="settings-search-help-token">{item.token}</span>
                      <span className="settings-search-help-desc">{item.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {activeFilterChips.length > 0 ? (
          <div className="settings-search-filter-chips" aria-label="active search filters">
            {activeFilterChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="settings-search-filter-chip"
                onClick={() => onRemoveFilterChip(chip.id)}
                title={filterChipRemoveTitle}>
                <span className="settings-search-filter-chip-label">{chip.label}</span>
                <span className="settings-search-filter-chip-close" aria-hidden>
                  ×
                </span>
              </button>
            ))}
            {hasOverflowFilterChips ? (
              <span className="settings-search-filter-chip-overflow">{overflowFilterChipText}</span>
            ) : null}
            <button
              type="button"
              className="settings-search-filter-chip-clear-all"
              onClick={onClearAllFilterChips}>
              {clearFiltersLabel}
            </button>
          </div>
        ) : null}

        {shouldShowSyntaxSuggestions ? (
          <div className="settings-search-syntax-suggestions" role="listbox">
            {syntaxSuggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                type="button"
                role="option"
                aria-selected={activeSyntaxSuggestionIndex === index}
                className={`settings-search-syntax-suggestion ${
                  activeSyntaxSuggestionIndex === index ? "active" : ""
                }`}
                onMouseEnter={() => onHoverSyntaxSuggestion(index)}
                onClick={() => onApplySyntaxSuggestion(suggestion)}>
                <span className="settings-search-syntax-suggestion-token">{suggestion.label}</span>
                <span className="settings-search-syntax-suggestion-desc">
                  {suggestion.description}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {syntaxDiagnostics.length > 0 ? (
          <div className="settings-search-syntax-diagnostics" role="status" aria-live="polite">
            {syntaxDiagnostics.map((diagnostic) => (
              <div key={diagnostic.id} className="settings-search-syntax-diagnostic">
                <span className="settings-search-syntax-diagnostic-title">
                  {resolveSyntaxDiagnosticTitle(diagnostic.code)}
                </span>
                <span className="settings-search-syntax-diagnostic-detail">
                  {diagnostic.operator}
                  {diagnostic.value ? `:${diagnostic.value}` : ""}
                  {diagnostic.suggestion ? ` → ${diagnostic.suggestion}:` : ""}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {showShortcutNudge && shortcutNudgeMessage ? (
          <div className="settings-search-shortcut-nudge" role="status" aria-live="polite">
            <span className="settings-search-shortcut-nudge-text">{shortcutNudgeMessage}</span>
            <button
              type="button"
              className="settings-search-shortcut-nudge-action"
              onClick={onHideShortcutNudge}>
              {closeLabel}
            </button>
            <button
              type="button"
              className="settings-search-shortcut-nudge-action"
              onClick={onDismissShortcutNudgeForever}>
              {dismissShortcutNudgeLabel}
            </button>
          </div>
        ) : null}

        <div className="settings-search-categories" role="tablist" aria-label={categoriesLabel}>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              role="tab"
              aria-selected={activeCategoryId === category.id}
              className={`settings-search-category ${activeCategoryId === category.id ? "active" : ""}`}
              onClick={() => onSelectCategory(category.id)}>
              <span>{category.label}</span>
              <span className="settings-search-category-count">{category.count}</span>
            </button>
          ))}
        </div>

        {activeContext ? (
          <div className="settings-search-context-bar">
            <span className="settings-search-context-label">{activeContext.label}</span>
            <span className="settings-search-context-meta">{activeContext.meta}</span>
          </div>
        ) : null}

        <div
          id={listboxId}
          className="settings-search-results"
          role="listbox"
          aria-label={listboxLabel}
          ref={resultsRef}
          onWheel={onResultsWheel}>
          {visibleResults.length === 0 ? (
            <div className="settings-search-empty">
              <div>{emptyText}</div>
              <div className="settings-search-empty-guide-title">{emptyGuideTitle}</div>
              <div className="settings-search-empty-guide-desc">{emptyGuideDescription}</div>
              <div className="settings-search-empty-guide-examples">
                {emptyGuideExamples.map((example) => (
                  <button
                    key={example.id}
                    type="button"
                    className="settings-search-empty-guide-example"
                    onClick={example.onClick}>
                    {example.token}
                  </button>
                ))}
              </div>
            </div>
          ) : isAllCategory ? (
            groupedResults.map((group) => (
              <section key={group.category} className="settings-search-group">
                <div className="settings-search-group-title">
                  <span>{getGroupLabel(group.category)}</span>
                  {group.totalCount > allCategoryItemLimit ? (
                    <span className="settings-search-group-count">
                      {group.items.length}/{group.totalCount}
                    </span>
                  ) : null}
                </div>
                {group.items.map((item, index) =>
                  renderSearchResultItem(item, resolveVisibleResultIndex(item, index)),
                )}
                {group.hasMore || group.isExpanded ? (
                  <button
                    type="button"
                    className="settings-search-group-more"
                    onClick={() => onToggleCategoryGroup(group.category)}>
                    {group.isExpanded ? collapseLabel : `${moreLabel} (+${group.remainingCount})`}
                  </button>
                ) : null}
              </section>
            ))
          ) : (
            visibleResults.map((item, index) => renderSearchResultItem(item, index))
          )}
        </div>

        <div className="settings-search-footer">{footerTips}</div>
      </div>

      {promptPreview}
    </div>
  )
}
