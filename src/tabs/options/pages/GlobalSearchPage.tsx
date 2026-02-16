import React from "react"

import { SearchIcon } from "~components/icons"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"
import { DEFAULT_SETTINGS } from "~utils/storage"

import { PageTitle, SettingCard, SettingRow, ToggleRow } from "../components"

interface GlobalSearchPageProps {
  siteId: string
}

const getLocalizedText = (key: string, fallback: string): string => {
  const localized = t(key)
  return localized === key ? fallback : localized
}

const GlobalSearchPage: React.FC<GlobalSearchPageProps> = ({ siteId: _siteId }) => {
  const { settings, updateNestedSetting } = useSettingsStore()

  if (!settings) {
    return null
  }

  const promptEnterBehavior = settings.globalSearch?.promptEnterBehavior || "smart"
  const doubleShiftToSearch =
    settings.globalSearch?.doubleShift ?? DEFAULT_SETTINGS.globalSearch.doubleShift
  const enableFuzzySearch = settings.globalSearch?.enableFuzzySearch ?? false

  return (
    <div>
      <PageTitle title={getLocalizedText("navGlobalSearch", "Global Search")} Icon={SearchIcon} />
      <p className="settings-page-desc">
        {`${getLocalizedText(
          "globalSearchPageDesc",
          "Configure Search Everywhere behavior and interaction details",
        )} · ${getLocalizedText(
          "globalSearchTriggerHint",
          "Trigger: double-press Shift or Ctrl/Cmd + K",
        )}`}
      </p>

      <SettingCard
        title={getLocalizedText("globalSearchMatchingSettingsTitle", "Search Matching")}
        description={getLocalizedText(
          "globalSearchMatchingSettingsDesc",
          "Configure how Search Everywhere matches search results",
        )}>
        <ToggleRow
          label={getLocalizedText("doubleShiftToSearch", "Double Shift to open Global Search")}
          description={getLocalizedText(
            "doubleShiftToSearchDesc",
            "Press Shift twice quickly to open Global Search",
          )}
          checked={doubleShiftToSearch}
          onChange={() => updateNestedSetting("globalSearch", "doubleShift", !doubleShiftToSearch)}
          settingId="global-search-double-shift"
        />
        <ToggleRow
          label={getLocalizedText("globalSearchEnableFuzzySearchLabel", "Enable fuzzy search")}
          description={getLocalizedText(
            "globalSearchEnableFuzzySearchDesc",
            "When enabled, Search Everywhere uses fuzzy matching for title, folder, tag, prompt content, and setting identifiers.",
          )}
          checked={enableFuzzySearch}
          onChange={() =>
            updateNestedSetting("globalSearch", "enableFuzzySearch", !enableFuzzySearch)
          }
          settingId="global-search-fuzzy-search"
        />
      </SettingCard>

      <SettingCard
        title={getLocalizedText("globalSearchPromptSettingsTitle", "Prompt Behavior")}
        description={getLocalizedText(
          "globalSearchPromptSettingsDesc",
          "Choose what happens when pressing Enter on a prompt result in Search Everywhere",
        )}>
        <SettingRow
          label={getLocalizedText(
            "globalSearchPromptEnterBehaviorLabel",
            "Search Everywhere prompt Enter behavior",
          )}
          description={getLocalizedText(
            "globalSearchPromptEnterBehaviorDesc",
            "Smart: insert directly when no variable, open variable dialog when needed; Locate only: switch to Prompts and locate the item.",
          )}
          settingId="global-search-prompt-enter-behavior">
          <select
            className="settings-select"
            value={promptEnterBehavior}
            onChange={(e) =>
              updateNestedSetting(
                "globalSearch",
                "promptEnterBehavior",
                e.target.value as "smart" | "locate",
              )
            }>
            <option value="smart">
              {getLocalizedText("globalSearchPromptEnterBehaviorSmart", "Smart (Recommended)")}
            </option>
            <option value="locate">
              {getLocalizedText("globalSearchPromptEnterBehaviorLocate", "Locate Only")}
            </option>
          </select>
        </SettingRow>
      </SettingCard>
    </div>
  )
}

export default GlobalSearchPage
