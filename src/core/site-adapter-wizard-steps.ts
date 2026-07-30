export const SITE_ADAPTER_WIZARD_STEPS = [
  {
    id: "textarea",
    optional: false,
    expectsUnique: true,
    titleKey: "siteAdapterWizardStepTextareaTitle",
    descriptionKey: "siteAdapterWizardStepTextareaDesc",
  },
  {
    id: "submitButton",
    optional: false,
    expectsUnique: true,
    titleKey: "siteAdapterWizardStepSubmitTitle",
    descriptionKey: "siteAdapterWizardStepSubmitDesc",
  },
  {
    id: "responseContainer",
    optional: false,
    expectsUnique: true,
    titleKey: "siteAdapterWizardStepContainerTitle",
    descriptionKey: "siteAdapterWizardStepContainerDesc",
  },
  {
    id: "userQuery",
    optional: false,
    expectsUnique: false,
    titleKey: "siteAdapterWizardStepUserTitle",
    descriptionKey: "siteAdapterWizardStepUserDesc",
  },
  {
    id: "assistantResponse",
    optional: false,
    expectsUnique: false,
    titleKey: "siteAdapterWizardStepAssistantTitle",
    descriptionKey: "siteAdapterWizardStepAssistantDesc",
  },
  {
    id: "conversationItem",
    optional: true,
    expectsUnique: false,
    titleKey: "siteAdapterWizardStepConversationTitle",
    descriptionKey: "siteAdapterWizardStepConversationDesc",
  },
  {
    id: "newChatButton",
    optional: true,
    expectsUnique: true,
    titleKey: "siteAdapterWizardStepNewChatTitle",
    descriptionKey: "siteAdapterWizardStepNewChatDesc",
  },
] as const

export type SiteAdapterWizardStepId = (typeof SITE_ADAPTER_WIZARD_STEPS)[number]["id"]
