import React from "react"

import { SearchIcon } from "~components/icons"
import { useSettingsStore } from "~stores/settings-store"
import { t } from "~utils/i18n"

import { PageTitle, SettingCard, SettingRow } from "../components"

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
