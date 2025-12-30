// ==UserScript==
// @name         gemini-helper
// @name:zh-cn   Gemini 助手
// @name:zh-tw   Gemini 助手
// @name:en      Gemini Helper
// @name:ja      Gemini ヘルパー
// @name:ko      Gemini 도우미
// @name:de      Gemini Helfer
// @name:fr      Gemini Helper
// @name:es      Gemini Helper
// @name:pt      Gemini Helper
// @name:ru      Gemini Помощник
// @namespace    http://tampermonkey.net/
// @version      1.11.3
// @description  Gemini 助手：会话管理与导出、对话大纲、提示词管理、标签页增强（状态/隐私模式/通知）、阅读历史记录与恢复、双向/手动锚点、图片水印移除、加粗修复、公式/表格复制、模型锁定、页面美化、主题切换、智能暗色模式（适配 Gemini 标准版/企业版）
// @description:zh-cn Gemini 助手：会话管理与导出、对话大纲、提示词管理、标签页增强（状态/隐私模式/通知）、阅读历史记录与恢复、双向/手动锚点、图片水印移除、加粗修复、公式/表格复制、模型锁定、页面美化、主题切换、智能暗色模式（适配 Gemini 标准版/企业版）
// @description:zh-tw Gemini 助手：會話管理與匯出、對話大綱、提示詞管理、標籤頁增強（狀態/隱私模式/通知）、閱讀歷史記錄與恢復、雙向/手動錨點、圖片浮水印移除、粗體修復、公式/表格複製、模型鎖定、頁面美化、主題切換、智慧暗色模式（適配 Gemini 標準版/企業版）
// @description:en Gemini Helper: Conversation management & export, outline navigation, prompt management, tab enhancements (status/privacy/notification), reading history & restore, bidirectional/manual anchor, image watermark removal, bold fix, formula/table copy, model lock, page beautification, theme toggle, smart dark mode (Gemini/Gemini Enterprise)
// @description:ja Gemini ヘルパー：会話管理とエクスポート、アウトラインナビ、プロンプト管理、タブ拡張（ステータス/プライバシー/通知）、閲覧履歴と復元、双方向/手動アンカー、画像透かし除去、太字修正、数式/テーブルコピー、モデルロック、ページ美化、テーマ切替、スマートダークモード（Gemini/Gemini Enterprise対応）
// @description:ko Gemini 도우미: 대화 관리 및 내보내기, 개요 탐색, 프롬프트 관리, 탭 향상(상태/개인정보/알림), 읽기 기록 및 복원, 양방향/수동 앵커, 이미지 워터마크 제거, 굵게 수정, 수식/표 복사, 모델 잠금, 페이지 미화, 테마 전환, 스마트 다크 모드(Gemini/Gemini Enterprise 지원)
// @description:de Gemini Helfer: Konversationsverwaltung & Export, Gliederungsnavigation, Prompt-Verwaltung, Tab-Erweiterungen (Status/Datenschutz/Benachrichtigung), Leseverlauf & Wiederherstellung, bidirektionaler/manueller Anker, Bildwasserzeichen-Entfernung, Fettschrift-Fix, Formel/Tabellen-Kopie, Modellsperre, Seitenverschönerung, Theme-Wechsel, Smart Dark Mode (Gemini/Gemini Enterprise)
// @description:fr Gemini Helper : Gestion et export des conversations, navigation par plan, gestion des prompts, améliorations des onglets (statut/confidentialité/notification), historique de lecture et restauration, ancre bidirectionnelle/manuelle, suppression du filigrane, correction du gras, copie formule/tableau, verrouillage de modèle, embellissement de page, changement de thème, mode sombre intelligent (Gemini/Gemini Enterprise)
// @description:es Gemini Helper: Gestión y exportación de conversaciones, navegación por esquema, gestión de prompts, mejoras de pestañas (estado/privacidad/notificación), historial de lectura y restauración, ancla bidireccional/manual, eliminación de marca de agua, corrección de negritas, copia de fórmulas/tablas, bloqueo de modelo, embellecimiento de página, cambio de tema, modo oscuro inteligente (Gemini/Gemini Enterprise)
// @description:pt Gemini Helper: Gerenciamento e exportação de conversas, navegação por esboço, gerenciamento de prompts, melhorias de abas (status/privacidade/notificação), histórico de leitura e restauração, âncora bidirecional/manual, remoção de marca d'água, correção de negrito, cópia de fórmulas/tabelas, bloqueio de modelo, embelezamento de página, alternância de tema, modo escuro inteligente (Gemini/Gemini Enterprise)
// @description:ru Gemini Помощник: Управление и экспорт диалогов, навигация по структуре, управление промптами, улучшения вкладок (статус/конфиденциальность/уведомления), история чтения и восстановление, двунаправленный/ручной якорь, удаление водяных знаков, исправление жирного текста, копирование формул/таблиц, блокировка модели, украшение страницы, переключение темы, умный тёмный режим (Gemini/Gemini Enterprise)
// @author       urzeye
// @homepage     https://github.com/urzeye
// @note         参考 https://linux.do/t/topic/925110 的代码与UI布局拓展实现
// @match        https://gemini.google.com/*
// @match        https://business.gemini.google/*
// @icon         https://raw.githubusercontent.com/gist/urzeye/8d1d3afbbcd0193dbc8a2019b1ba54d3/raw/f7113d329a259963ed1b1ab8cb981e8f635d4cea/gemini.svg
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @grant        window.focus
// @grant        window.onurlchange
// @connect      v0.app
// @connect      googleusercontent.com
// @run-at       document-idle
// @noframes
// @supportURL   https://github.com/urzeye/tampermonkey-scripts/issues
// @homepageURL  https://github.com/urzeye/tampermonkey-scripts
// @require      https://update.greasyfork.org/scripts/559089/1714656/background-keep-alive.js
// @require      https://update.greasyfork.org/scripts/559176/1722655/domToolkit.js
// @license      GPL-3.0-or-later
// @downloadURL https://update.greasyfork.org/scripts/558318/gemini-helper.user.js
// @updateURL https://update.greasyfork.org/scripts/558318/gemini-helper.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // 防止在 iframe 中执行（图文并茂模式等场景）
    if (window.top !== window.self) {
        return;
    }

    // 防止重复初始化
    if (window.geminiHelperInitialized) {
        return;
    }
    window.geminiHelperInitialized = true;

    // ==================== 设置项与多语言 ====================

    const SETTING_KEYS = {
        CLEAR_TEXTAREA_ON_SEND: 'gemini_business_clear_on_send',
        LANGUAGE: 'gemini_language',
        PAGE_WIDTH: 'gemini_page_width',
        OUTLINE: 'gemini_outline_settings',
        TAB_ORDER: 'gemini_tab_order',
        MODEL_LOCK: 'gemini_model_lock',
        PROMPTS_SETTINGS: 'gemini_prompts_settings',
        READING_HISTORY: 'gemini_reading_history_settings',
        TAB_SETTINGS: 'gemini_tab_settings',
        CONVERSATIONS: 'gemini_conversations',
        CONVERSATIONS_SETTINGS: 'gemini_conversations_settings',
        DEFAULT_PANEL_STATE: 'gemini_default_panel_state',
        AUTO_HIDE_PANEL: 'gemini_default_auto_hide',
        THEME_MODE: 'gemini_theme_mode', // 'light' | 'dark' | null
        COLLAPSED_BUTTONS_ORDER: 'gemini_collapsed_buttons_order',
        MARKDOWN_FIX: 'gemini_markdown_fix',
    };

    // 默认 Tab 顺序
    const DEFAULT_TAB_ORDER = ['prompts', 'outline', 'conversations'];
    const DEFAULT_PROMPTS_SETTINGS = { enabled: true };
    const DEFAULT_READING_HISTORY_SETTINGS = {
        persistence: true,
        autoRestore: false,
        cleanupDays: 30,
    };
    const DEFAULT_TAB_SETTINGS = {
        openInNewTab: true, // 新标签页打开新对话
        autoRenameTab: true, // 自动重命名标签页
        renameInterval: 3, // 检测频率(秒)
        showStatus: true, // 显示生成状态图标 (⏳/✅)
        showNotification: false, // 发送桌面通知
        notificationSound: false, // 通知声音（默认关闭）
        notificationVolume: 0.5, // 通知声音音量 (0.1-1.0)
        notifyWhenFocused: false, // 前台时也通知（默认关闭）
        autoFocus: false, // 生成完成后自动将窗口置顶
        privacyMode: false, // 隐私模式
        privacyTitle: 'Google', // 隐私模式下的伪装标题
        titleFormat: '{status}{title}-{model}', // 自定义标题格式，支持 {status}、{title}、{model}
    };

    // 默认会话数据结构
    const DEFAULT_CONVERSATION_DATA = {
        folders: [{ id: 'inbox', name: '📥 收件箱', icon: '📥', isDefault: true }],
        tags: [], // 标签定义数组 { id, name, color }
        conversations: {}, // 会话数据，key 为 conversationId
        lastUsedFolderId: 'inbox',
    };

    // Markdown 渲染修复设置
    const DEFAULT_MARKDOWN_FIX_SETTINGS = {
        enabled: true, // 默认开启（仅在 Gemini 普通版生效）
    };

    // 预设标签颜色 (30色 - 中国传统色精选 - 优化对比度)
    const TAG_COLORS = [
        '#ff461f', // 朱
        '#e35c64', // 桃夭
        '#db5a6b', // 海棠红
        '#f2481b', // 榴花红
        '#9d2933', // 胭脂
        '#ffa631', // 杏黄
        '#d6a01d', // 姜黄
        '#f0c239', // 缃色
        '#d9b611', // 秋香色
        '#8cc540', // 柳绿
        '#0eb83a', // 葱绿
        '#227d51', // 官绿
        '#789262', // 竹青
        '#29b7cb', // 湖蓝
        '#177cb0', // 靛蓝
        '#1685a9', // 石青
        '#4b5cc4', // 宝蓝
        '#2e4e7e', // 藏蓝
        '#b088d1', // 丁香
        '#b359ab', // 雪青
        '#8d4bbb', // 紫罗兰
        '#4c221b', // 紫檀
        '#a88462', // 驼色
        '#ca6924', // 琥珀
        '#845a33', // 赭石
        '#75878a', // 苍色
        '#57c3c2', // 天水碧
        '#ce97a8', // 藕荷
        '#5d513c', // 墨灰
        '#9b95c9', // 长春花
    ];

    // Tab 定义（用于渲染和显示）
    const TAB_DEFINITIONS = {
        prompts: { id: 'prompts', labelKey: 'tabPrompts', icon: '✏️' },
        outline: { id: 'outline', labelKey: 'tabOutline', icon: '📋' },
        conversations: { id: 'conversations', labelKey: 'tabConversations', icon: '💬' },
        settings: { id: 'settings', labelKey: 'tabSettings', icon: '⚙️' },
    };

    // 折叠面板按钮定义
    // isPanelOnly: true 表示仅在面板折叠时显示，false 表示常显
    const COLLAPSED_BUTTON_DEFS = {
        scrollTop: { icon: '⬆', labelKey: 'scrollTop', canToggle: false, isPanelOnly: false },
        panel: { icon: '✨', labelKey: 'panelTitle', canToggle: false, isPanelOnly: true },
        anchor: { icon: '⚓', labelKey: 'showCollapsedAnchorLabel', canToggle: true, isPanelOnly: true },
        theme: { icon: '☀', labelKey: 'showCollapsedThemeLabel', canToggle: true, isPanelOnly: true },
        manualAnchor: { icon: '📍', labelKey: 'manualAnchorLabel', canToggle: true, isPanelOnly: false, isGroup: true },
        scrollBottom: { icon: '⬇', labelKey: 'scrollBottom', canToggle: false, isPanelOnly: false },
    };
    const DEFAULT_COLLAPSED_BUTTONS_ORDER = [
        { id: 'scrollTop', enabled: true },
        { id: 'panel', enabled: true },
        { id: 'anchor', enabled: true },
        { id: 'theme', enabled: true },
        { id: 'manualAnchor', enabled: true },
        { id: 'scrollBottom', enabled: true },
    ];

    const I18N = {
        'zh-CN': {
            panelTitle: 'Gemini 助手',
            tabPrompts: '提示词',
            tabSettings: '设置',
            searchPlaceholder: '搜索提示词...',
            addPrompt: '添加新提示词',
            allCategory: '全部',
            manageCategory: '⚙ 管理',
            currentPrompt: '当前提示词：',
            scrollTop: '顶部',
            scrollBottom: '底部',
            refresh: '刷新',
            collapse: '收起',
            edit: '编辑',
            delete: '删除',
            copy: '复制',
            drag: '拖动',
            save: '保存',
            cancel: '取消',
            add: '添加',
            anchorPoint: '锚点',
            updateAnchor: '更新锚点',
            title: '标题',
            category: '分类',
            categoryPlaceholder: '例如：编程、翻译',
            content: '提示词内容',
            editPrompt: '编辑提示词',
            addNewPrompt: '添加新提示词',
            fillTitleContent: '请填写标题和内容',
            promptUpdated: '提示词已更新',
            promptAdded: '提示词已添加',
            deleted: '已删除',
            copied: '已复制到剪贴板',
            cleared: '已清除内容',
            refreshed: '已刷新',
            orderUpdated: '已更新排序',
            inserted: '已插入提示词',
            scrolling: '页面正在滚动，请稍后...',
            noTextarea: '未找到输入框，请点击输入框后重试',
            confirmDelete: '确定删除?',
            // 设置面板
            settingsTitle: '通用设置',
            panelSettingsTitle: '面板设置',
            clearOnSendLabel: '发送后自动修复中文输入',
            clearOnSendDesc: '发送消息后插入零宽字符，修复下次输入首字母问题（仅 Gemini Business）',
            settingOn: '开',
            settingOff: '关',
            // 模型锁定
            modelLockTitle: '模型锁定',
            modelLockLabel: '自动锁定模型',
            modelLockDesc: '进入页面后自动切换到指定模型',
            modelKeywordLabel: '模型关键字',
            modelKeywordPlaceholder: '例如：3 Pro',
            modelKeywordDesc: '用于匹配目标模型名称',
            // 分类管理
            categoryManage: '分类管理',
            categoryEmpty: '暂无分类，添加提示词时会自动创建分类',
            rename: '重命名',
            newCategoryName: '请输入新的分类名称：',
            categoryRenamed: '分类已重命名',
            confirmDeleteCategory: '确定删除该分类吗？关联的提示词将移至"未分类"',
            categoryDeleted: '分类已删除',
            // 语言设置
            languageLabel: '界面语言',
            languageDesc: '设置面板显示语言，即时生效',
            languageAuto: '跟随系统',
            languageZhCN: '简体中文',
            languageZhTW: '繁體中文',
            languageEn: 'English',
            // 页面宽度设置
            pageWidthLabel: '页面宽度',
            pageWidthDesc: '调整聊天页面的宽度，即时生效',
            enablePageWidth: '启用页面加宽',
            widthValue: '宽度值',
            widthUnit: '单位',
            unitPx: '像素 (px)',
            unitPercent: '百分比 (%)',
            // 标签页设置
            tabSettingsTitle: '标签页设置',
            openNewTabLabel: '新标签页打开新对话',
            openNewTabDesc: '在面板顶部添加按钮，点击后在新标签页打开新对话',
            newTabTooltip: '新标签页开启对话',
            autoRenameTabLabel: '自动重命名标签页',
            autoRenameTabDesc: '将浏览器标签页名称改为当前对话名称',
            renameIntervalLabel: '检测频率',
            renameIntervalDesc: '检测对话名称变化的间隔时间',
            secondsSuffix: '秒',
            showStatusLabel: '显示生成状态',
            toggleTheme: '切换亮/暗主题',
            // 面板设置
            showStatusDesc: '在标签页标题中显示生成状态图标（⏳/✅）',
            showNotificationLabel: '发送桌面通知',
            showNotificationDesc: '生成完成时发送系统通知',
            notificationSoundLabel: '通知声音',
            notificationSoundDesc: '生成完成时播放提示音',
            notificationVolumeLabel: '声音音量',
            notifyWhenFocusedLabel: '前台时也通知',
            notifyWhenFocusedDesc: '当前页面可见时也发送通知，而不仅在后台时',
            autoFocusLabel: '自动窗口置顶',
            autoFocusDesc: '生成完成时自动将窗口带回前台',
            privacyModeLabel: '隐私模式',
            privacyModeDesc: '隐藏真实对话标题，显示伪装标题（双击面板标题可快速切换）',
            privacyTitleLabel: '伪装标题',
            privacyTitlePlaceholder: '如：Google、工作文档',
            titleFormatLabel: '标题格式',
            titleFormatDesc: '自定义标题格式，支持占位符：{status}、{title}、{model}',
            notificationTitle: '✅ {site} 生成完成',
            notificationBody: '点击查看结果',
            // 大纲功能
            tabOutline: '大纲',
            outlineEmpty: '暂无大纲内容',
            outlineRefresh: '刷新',
            outlineSettings: '大纲设置',
            enableOutline: '启用大纲',
            outlineMaxLevel: '显示标题级别',
            outlineLevelAll: '全部 (1-6级)',
            outlineLevel1: '仅 1 级',
            outlineLevel2: '至 2 级',
            outlineLevel3: '至 3 级',
            refreshPrompts: '刷新提示词',
            refreshOutline: '刷新大纲',
            refreshSettings: '刷新设置',
            jumpToAnchor: '返回跳转前位置',
            anchorUpdated: '锚点已更新',
            // 大纲高级工具栏
            outlineScrollBottom: '滚动到底部',
            outlineScrollTop: '滚动到顶部',
            outlineExpandAll: '展开全部',
            outlineCollapseAll: '折叠全部',
            outlineLocateCurrent: '定位到当前位置',
            outlineSearch: '搜索大纲...',
            outlineSearchResult: '个结果',
            outlineLevelHint: '级标题',
            // Tab 顺序设置
            tabOrderSettings: '界面排版',
            tabOrderDesc: '调整面板 Tab 的显示顺序',
            moveUp: '上移',
            moveDown: '下移',
            // 阅读导航设置
            readingNavigationSettings: '阅读导航',
            readingHistorySettings: '阅读历史',
            readingHistoryPersistence: '启用阅读历史',
            readingHistoryPersistenceDesc: '自动记录阅读位置，下次打开时恢复',
            autoRestore: '自动跳转',
            autoRestoreDesc: '打开页面时自动跳转到上次位置',
            readingHistoryCleanup: '历史保留时间',
            readingHistoryCleanupDesc: '只保留最近几天的阅读进度 (-1 为永久)',
            daysSuffix: '天',
            cleanupInfinite: '永久',
            restoredPosition: '已恢复上次阅读位置',
            cleanupDone: '已清理过期数据',
            // 大纲高级设置
            outlineAutoUpdateLabel: '对话期间自动更新大纲',
            outlineAutoUpdateDesc: 'AI 生成内容时自动刷新目录结构',
            outlineUpdateIntervalLabel: '更新检测间隔 (秒)',
            outlineShowUserQueries: '展示用户提问',
            outlineShowUserQueriesTooltip: '展示用户提问',
            outlineOnlyUserQueries: '提问',
            outlineIntervalUpdated: '间隔已设为 {val} 秒',
            outlineSyncScrollLabel: '同步滚动',
            outlineSyncScrollDesc: '页面滚动时自动高亮对应的大纲项',
            // 页面显示设置
            pageDisplaySettings: '页面显示',
            // 其他设置
            otherSettingsTitle: '其他设置',
            showCollapsedAnchorLabel: '锚点',
            showCollapsedAnchorDesc: '当面板收起时，在侧边浮动条中显示锚点按钮',
            showCollapsedThemeLabel: '主题',
            showCollapsedThemeDesc: '当面板收起时，在侧边浮动条中显示主题切换按钮',
            collapsedButtonsOrderDesc: '调整折叠面板按钮的显示顺序',
            preventAutoScrollLabel: '防止自动滚动',
            preventAutoScrollDesc: '当 AI 生成长内容时，阻止页面自动滚动到底部，方便阅读上文',
            markdownFixLabel: 'Markdown 加粗修复',
            markdownFixDesc: '修复 Gemini 响应中未正确渲染的 **加粗** 语法',
            // 界面排版开关
            defaultPanelStateLabel: '默认显示面板',
            defaultPanelStateDesc: '刷新页面后面板默认保持展开状态',
            autoHidePanelLabel: '自动隐藏面板',
            autoHidePanelDesc: '点击面板外部（如左侧侧边栏、聊天区、输入框）时自动隐藏',

            // 界面排版开关
            disableOutline: '禁用大纲',
            togglePrompts: '启用/禁用提示词',
            toggleConversations: '启用/禁用会话',
            // 会话功能
            tabConversations: '会话',
            conversationsEmpty: '暂无会话数据',
            conversationsEmptyHint: '点击上方同步按钮从侧边栏导入会话',
            conversationsSync: '同步会话',
            conversationsSyncing: '正在同步...',
            conversationsSynced: '同步完成',
            conversationsAddFolder: '新建文件夹',
            conversationsRename: '重命名',
            conversationsDelete: '删除',
            conversationsDeleteConfirm: '确定删除此文件夹吗？其中的会话将移到收件箱。',
            conversationsFolderCreated: '文件夹已创建',
            conversationsFolderRenamed: '文件夹已重命名',
            conversationsFolderDeleted: '文件夹已删除',
            conversationsCannotDeleteDefault: '无法删除默认文件夹',
            conversationsIcon: '图标',
            conversationsFolderName: '名称',
            conversationsFolderNamePlaceholder: '输入文件夹名称',
            confirm: '确定',
            conversationsSyncEmpty: '未找到会话',
            conversationsSyncNoChange: '无新会话',
            conversationsLocate: '定位当前对话',
            conversationsLocateSuccess: '已定位到当前对话',
            conversationsLocateNotFound: '当前对话未收录，正在同步...',
            conversationsLocateNewChat: '当前是新对话，尚未保存',
            conversationsLocateSyncFailed: '同步后仍未找到该对话',
            justNow: '刚刚',
            minutesAgo: '分钟前',
            hoursAgo: '小时前',
            daysAgo: '天前',
            conversationsSelectFolder: '选择同步目标文件夹',
            conversationsMoveTo: '移动到...',
            conversationsMoved: '已移动到',
            conversationsSyncDeleteTitle: '同步删除',
            conversationsSyncDeleteMsg: '检测到 {count} 个会话已在云端删除，是否同步删除本地记录？',
            conversationsDeleted: '已移除',
            // 会话设置
            conversationsSettingsTitle: '会话设置',
            conversationsSyncUnpinLabel: '同步时更新取消置顶',
            conversationsSyncUnpinDesc: '同步时，将云端未置顶的会话在本地也取消置顶',
            folderRainbowLabel: '文件夹彩虹色',
            folderRainbowDesc: '为每个文件夹分配不同的背景颜色，关闭后使用统一纯色',
            conversationsSyncDeleteLabel: '删除时同步删除云端',
            conversationsSyncDeleteDesc: '删除本地会话记录时，同时从 {site} 云端删除',
            conversationsSyncRenameLabel: '重命名时同步云端',
            conversationsSyncRenameDesc: '修改会话标题时，同时在 {site} 侧边栏更新标题',
            conversationsCustomIcon: '自定义图标',
            batchSelected: '已选 {n} 个',
            batchMove: '移动',
            batchDelete: '删除',
            batchExit: '退出',
            batchExport: '导出',
            exportToMarkdown: 'Markdown',
            exportToJSON: 'JSON',
            exportLoading: '正在加载对话历史...',
            exportSuccess: '导出成功',
            exportFailed: '导出失败',
            exportNoContent: '未找到对话内容',
            copySuccess: '已复制到剪贴板',
            exportNeedOpenFirst: '请先打开要导出的会话',
            exportUserLabel: '用户',
            exportMetaTitle: '导出信息',
            exportMetaConvTitle: '会话标题',
            exportMetaTime: '导出时间',
            exportMetaSource: '来源',
            exportNotSupported: '当前站点不支持导出',
            exportToTXT: 'TXT',
            exportMetaUrl: '链接',
            exportToClipboard: '复制 Markdown',
            conversationsRefresh: '刷新会话列表',
            conversationsSearchPlaceholder: '搜索会话...',
            conversationsSearchResult: '个结果',
            conversationsNoSearchResult: '未找到匹配结果',
            conversationsSetTags: '设置标签',
            conversationsNewTag: '新建标签',
            conversationsTagName: '标签名称',
            conversationsTagColor: '标签颜色',
            conversationsFilterByTags: '按标签筛选',
            conversationsClearTags: '清除筛选',
            conversationsTagCreated: '标签已创建',
            conversationsTagUpdated: '标签已更新',
            conversationsTagDeleted: '标签已删除',
            conversationsTagExists: '标签名称已存在',
            conversationsUpdateTag: '更新标签',
            conversationsNoTags: '暂无标签',
            conversationsManageTags: '管理标签',
            conversationsPin: '置顶📌',
            conversationsUnpin: '取消置顶',
            conversationsPinned: '已置顶',
            conversationsUnpinned: '已取消置顶',
            conversationsFilterPinned: '筛选置顶',
            conversationsClearAll: '清除所有筛选',
            conversationsBatchMode: '批量操作',
            // 历史加载
            loadingHistory: '正在加载历史记录...',
            historyLoaded: '历史记录加载完成',
            stopLoading: '停止加载',
            loadingHint: '保持页面静止，完成后将自动停留在顶部',
            // 边缘吸附
            edgeSnapHideLabel: '边缘吸附隐藏',
            edgeSnapHideDesc: '拖动面板到屏幕边缘时自动隐藏，悬停显示',
            // 手动锚点
            setAnchor: '设置锚点',
            setAnchorToast: '已设置锚点',
            backToAnchor: '返回锚点',
            noAnchor: '暂无锚点',
            clearAnchor: '清除锚点',
            clearAnchorToast: '已清除锚点',
            manualAnchorLabel: '手动锚点',
            manualAnchorDesc: '在快捷工具栏显示手动锚点按钮',
            // 水印移除
            watermarkRemovalLabel: '移除图片水印',
            watermarkRemovalDesc: '自动移除 Gemini AI 生成图像中的 NanoBanana 水印',
            watermarkProcessing: '正在处理图片...',
            watermarkProcessed: '水印已移除',
            watermarkFailed: '处理失败',
            // 内容设置
            contentExportSettingsTitle: '内容设置',
            exportImagesToBase64Label: '导出时图片转 Base64',
            exportImagesToBase64Desc: '将对话中的图片转换为 Base64 编码嵌入 Markdown，方便离线查看',
            formulaCopyLabel: '双击复制公式',
            formulaCopyDesc: '双击数学公式可复制 LaTeX 源码（仅 Gemini 标准版）',
            formulaCopied: '公式已复制',
            formulaDelimiterLabel: '复制时添加分隔符',
            formulaDelimiterDesc: '根据公式类型自动添加 $ 或 $$ 分隔符',
            tableCopyLabel: '表格复制 Markdown',
            tableCopyDesc: '在表格右上角添加复制按钮，直接复制 Markdown 格式',
            tableCopied: '表格已复制',
        },
        'zh-TW': {
            panelTitle: 'Gemini 助手',
            tabPrompts: '提示詞',
            tabSettings: '設置',
            searchPlaceholder: '搜尋提示詞...',
            addPrompt: '新增提示詞',
            allCategory: '全部',
            manageCategory: '⚙ 管理',
            currentPrompt: '當前提示詞：',
            scrollTop: '頂部',
            scrollBottom: '底部',
            refresh: '刷新',
            collapse: '收起',
            edit: '編輯',
            delete: '刪除',
            copy: '複製',
            drag: '拖動',
            save: '保存',
            cancel: '取消',
            add: '新增',
            title: '標題',
            category: '分類',
            categoryPlaceholder: '例如：程式設計、翻譯',
            content: '提示詞內容',
            editPrompt: '編輯提示詞',
            addNewPrompt: '新增提示詞',
            fillTitleContent: '請填寫標題和內容',
            promptUpdated: '提示詞已更新',
            promptAdded: '提示詞已新增',
            deleted: '已刪除',
            copied: '已複製到剪貼簿',
            cleared: '已清除內容',
            refreshed: '已刷新',
            orderUpdated: '已更新排序',
            inserted: '已插入提示詞',
            scrolling: '頁面正在捲動，請稍後...',
            noTextarea: '未找到輸入框，請點擊輸入框後重試',
            confirmDelete: '確定刪除?',
            // 設置面板
            settingsTitle: '通用設置',
            panelSettingsTitle: '面板設置',
            clearOnSendLabel: '發送後自動修復中文輸入',
            clearOnSendDesc: '發送訊息後插入零寬字元，修復下次輸入首字母問題（僅 Gemini Business）',
            settingOn: '開',
            settingOff: '關',
            // 模型鎖定
            modelLockTitle: '模型鎖定',
            modelLockLabel: '自動鎖定模型',
            modelLockDesc: '進入頁面後自動切換到指定模型',
            modelKeywordLabel: '模型關鍵字',
            modelKeywordPlaceholder: '例如：3 Pro',
            modelKeywordDesc: '用於匹配目標模型名稱',
            // 分類管理
            categoryManage: '分類管理',
            categoryEmpty: '暫無分類，新增提示詞時會自動建立分類',
            rename: '重新命名',
            newCategoryName: '請輸入新的分類名稱：',
            categoryRenamed: '分類已重新命名',
            confirmDeleteCategory: '確定刪除該分類嗎？關聯的提示詞將移至「未分類」',
            categoryDeleted: '分類已刪除',
            // 語言設置
            languageLabel: '介面語言',
            languageDesc: '設定面板顯示語言，即時生效',
            languageAuto: '跟隨系統',
            languageZhCN: '简体中文',
            languageZhTW: '繁體中文',
            languageEn: 'English',
            // 頁面寬度設置
            pageWidthLabel: '頁面寬度',
            pageWidthDesc: '調整聊天頁面的寬度，即時生效',
            enablePageWidth: '啟用頁面加寬',
            widthValue: '寬度值',
            widthUnit: '單位',
            unitPx: '像素 (px)',
            unitPercent: '百分比 (%)',
            // 標籤頁設置
            tabSettingsTitle: '標籤頁設置',
            openNewTabLabel: '新分頁開啟新對話',
            openNewTabDesc: '在面板頂部新增按鈕，點擊後在新分頁開啟新對話',
            newTabTooltip: '新分頁開啟對話',
            autoRenameTabLabel: '自動重新命名標籤頁',
            autoRenameTabDesc: '將瀏覽器標籤頁名稱改為當前對話名稱',
            renameIntervalLabel: '檢測頻率',
            renameIntervalDesc: '檢測對話名稱變化的間隔時間',
            secondsSuffix: '秒',
            showStatusLabel: '顯示生成狀態',
            showStatusDesc: '在標籤頁標題中顯示生成狀態圖示（⏳/✅）',
            showNotificationLabel: '傳送桌面通知',
            showNotificationDesc: '生成完成時傳送系统通知',
            notificationSoundLabel: '通知聲音',
            notificationSoundDesc: '生成完成時播放提示音',
            notificationVolumeLabel: '聲音音量',
            notifyWhenFocusedLabel: '前台時也通知',
            notifyWhenFocusedDesc: '當前頁面可見時也發送通知，而不僅在後台時',
            autoFocusLabel: '自動視窗置頂',
            autoFocusDesc: '生成完成時自動將視窗帶回前台',
            privacyModeLabel: '隱私模式',
            privacyModeDesc: '隱藏真實對話標題，顯示偽裝標題（雙擊面板標題可快速切換）',
            privacyTitleLabel: '偽裝標題',
            privacyTitlePlaceholder: '如：Google、工作文件',
            titleFormatLabel: '標題格式',
            titleFormatDesc: '自訂標題格式，支援佔位符：{status}、{title}、{model}',
            notificationTitle: '✅ {site} 生成完成',
            notificationBody: '點擊查看結果',
            // 大綱功能
            tabOutline: '大綱',
            outlineEmpty: '暫無大綱內容',
            outlineRefresh: '刷新',
            outlineSettings: '大綱設置',
            enableOutline: '啟用大綱',
            outlineMaxLevel: '顯示標題級別',
            outlineLevelAll: '全部 (1-6級)',
            outlineLevel1: '僅 1 級',
            outlineLevel2: '至 2 級',
            outlineLevel3: '至 3 級',
            // 刷新按鈕提示
            refreshPrompts: '刷新提示詞',
            refreshOutline: '刷新大綱',
            refreshSettings: '刷新設置',
            jumpToAnchor: '返回跳轉前位置',
            // 大綱高級工具欄
            outlineScrollBottom: '滾動到底部',
            outlineScrollTop: '滾動到頂部',
            outlineExpandAll: '展開全部',
            outlineCollapseAll: '折疊全部',
            outlineLocateCurrent: '定位到當前位置',
            outlineSearch: '搜尋大綱...',
            outlineSearchResult: '個結果',
            outlineLevelHint: '級標題',
            // Tab 顺序设置
            tabOrderSettings: '介面排版',
            tabOrderDesc: '調整面板 Tab 的顯示順序',
            moveUp: '上移',
            moveDown: '下移',
            // 阅读导航設置
            readingNavigationSettings: '閱讀導航',
            readingHistorySettings: '閱讀歷史',
            readingHistoryPersistence: '啟用閱讀歷史',
            readingHistoryPersistenceDesc: '自動記錄閱讀位置，下次開啟時恢復',
            autoRestore: '自動跳轉',
            autoRestoreDesc: '開啟頁面時自動跳轉到上次位置',
            readingHistoryCleanup: '歷史保留時間',
            readingHistoryCleanupDesc: '只保留最近幾天的閱讀進度 (-1 為永久)',
            daysSuffix: '天',
            cleanupInfinite: '永久',
            restoredPosition: '已恢復上次閱讀位置',
            cleanupDone: '已清理過期數據',
            // 大綱高級設置
            outlineAutoUpdateLabel: '對話期間自動更新大綱',
            outlineAutoUpdateDesc: 'AI 生成內容時自動刷新目錄結構',
            outlineUpdateIntervalLabel: '更新檢測間隔 (秒)',
            outlineShowUserQueries: '展示用戶提問',
            outlineShowUserQueriesTooltip: '展示用戶提問',
            outlineOnlyUserQueries: '提問',
            outlineIntervalUpdated: '間隔已設為 {val} 秒',
            outlineSyncScrollLabel: '同步滾動',
            outlineSyncScrollDesc: '頁面滾動時自動高亮對應的大綱項',
            // 頁面顯示設置
            pageDisplaySettings: '頁面顯示',
            // 其他設置
            otherSettingsTitle: '其他設置',
            showCollapsedAnchorLabel: '錨點',
            showCollapsedAnchorDesc: '當面板收起時，在側邊浮動條中顯示錨點按鈕',
            showCollapsedThemeLabel: '主題',
            showCollapsedThemeDesc: '當面板收起時，在側邊浮動條中顯示主題切換按鈕',
            collapsedButtonsOrderDesc: '調整折疊面板按鈕的顯示順序',
            preventAutoScrollLabel: '防止自動滾動',
            preventAutoScrollDesc: '當 AI 生成長內容時，阻止頁面自動滾動到底部，方便閱讀上文',
            markdownFixLabel: 'Markdown 加粗修復',
            markdownFixDesc: '修復 Gemini 響應中未正確渲染的 **加粗** 語法',
            // 面板設置
            defaultPanelStateLabel: '預設顯示面板',
            defaultPanelStateDesc: '重新整理頁面後面板預設保持展開狀態',
            autoHidePanelLabel: '自動隱藏面板',
            autoHidePanelDesc: '點擊面板外部（如左側側邊欄、聊天區、輸入框）時自動隱藏',
            // 介面排版開關
            disableOutline: '禁用大綱',
            togglePrompts: '啟用/禁用提示詞',
            toggleConversations: '啟用/禁用會話',
            // 會話功能
            tabConversations: '會話',
            conversationsEmpty: '暫無會話數據',
            conversationsEmptyHint: '點擊上方同步按鈕從側邊欄導入會話',
            conversationsSync: '同步會話',
            conversationsSyncing: '正在同步...',
            conversationsSynced: '同步完成',
            conversationsAddFolder: '新建資料夾',
            conversationsRename: '重命名',
            conversationsDelete: '刪除',
            conversationsDeleteConfirm: '確定刪除此資料夾嗎？其中的會話將移到收件箱。',
            conversationsFolderCreated: '資料夾已創建',
            conversationsFolderRenamed: '資料夾已重命名',
            conversationsFolderDeleted: '資料夾已刪除',
            conversationsCannotDeleteDefault: '無法刪除預設資料夾',
            conversationsIcon: '圖標',
            conversationsFolderName: '名稱',
            conversationsFolderNamePlaceholder: '輸入資料夾名稱',
            confirm: '確定',
            conversationsSyncEmpty: '未找到會話',
            conversationsSyncNoChange: '無新會話',
            conversationsLocate: '定位當前對話',
            conversationsLocateSuccess: '已定位到當前對話',
            conversationsLocateNotFound: '當前對話未收錄，正在同步...',
            conversationsLocateNewChat: '當前是新對話，尚未保存',
            conversationsLocateSyncFailed: '同步後仍未找到該對話',
            justNow: '剛剛',
            minutesAgo: '分鐘前',
            hoursAgo: '小時前',
            daysAgo: '天前',
            conversationsSelectFolder: '選擇同步目標資料夾',
            conversationsMoveTo: '移動到...',
            conversationsMoved: '已移動到',
            conversationsSyncDeleteTitle: '同步刪除',
            conversationsSyncDeleteMsg: '檢測到 {count} 個會話已在雲端刪除，是否同步刪除本地記錄？',
            conversationsDeleted: '已移除',
            // 會話設置
            conversationsSettingsTitle: '會話設置',
            conversationsSyncUnpinLabel: '同步時更新取消置頂',
            conversationsSyncUnpinDesc: '同步時，將雲端未置頂的會話在本地也取消置頂',
            folderRainbowLabel: '資料夾彩虹色',
            folderRainbowDesc: '為每個資料夾分配不同的背景顏色，關閉後使用統一純色',
            conversationsSyncDeleteLabel: '刪除時同步刪除雲端',
            conversationsSyncDeleteDesc: '刪除本地會話記錄時，同時從 {site} 雲端刪除',
            conversationsSyncRenameLabel: '重命名時同步雲端',
            conversationsSyncRenameDesc: '修改會話標題時，同時在 {site} 側邊欄更新標題',
            conversationsCustomIcon: '自定義圖示',
            batchSelected: '已選 {n} 個',
            batchMove: '移動',
            batchDelete: '刪除',
            batchExit: '退出',
            batchExport: '匯出',
            exportToMarkdown: 'Markdown',
            exportToJSON: 'JSON',
            exportLoading: '正在載入對話歷史...',
            exportSuccess: '匯出成功',
            exportFailed: '匯出失敗',
            exportNoContent: '未找到對話內容',
            copySuccess: '已複製到剪貼簿',
            exportNeedOpenFirst: '請先打開要匯出的會話',
            exportUserLabel: '用戶',
            exportMetaTitle: '匯出資訊',
            exportMetaConvTitle: '會話標題',
            exportMetaTime: '匯出時間',
            exportMetaSource: '來源',
            exportNotSupported: '目前站點不支援匯出',
            exportToTXT: 'TXT',
            exportMetaUrl: '連結',
            exportToClipboard: '複製 Markdown',
            conversationsRefresh: '刷新會話列表',
            conversationsSearchPlaceholder: '搜尋會話...',
            conversationsSearchResult: '個結果',
            conversationsNoSearchResult: '未找到匹配結果',
            conversationsSetTags: '設定標籤',
            conversationsNewTag: '新建標籤',
            conversationsTagName: '標籤名稱',
            conversationsTagColor: '標籤顏色',
            conversationsFilterByTags: '按標籤篩選',
            conversationsClearTags: '清除篩選',
            conversationsTagCreated: '標籤已建立',
            conversationsTagUpdated: '標籤已更新',
            conversationsTagDeleted: '標籤已刪除',
            conversationsTagExists: '標籤名稱已存在',
            conversationsUpdateTag: '更新標籤',
            conversationsNoTags: '暫無標籤',
            conversationsManageTags: '管理標籤',
            conversationsPin: '置頂📌',
            conversationsUnpin: '取消置頂',
            conversationsPinned: '已置頂',
            conversationsUnpinned: '已取消置頂',
            conversationsFilterPinned: '篩選置頂',
            conversationsClearAll: '清除所有篩選',
            conversationsBatchMode: '批次操作',
            // 歷史載入
            loadingHistory: '正在載入歷史記錄...',
            historyLoaded: '歷史記錄載入完成',
            stopLoading: '停止載入',
            loadingHint: '保持頁面靜止，完成後將自動停留在頂部',
            // 邊緣吸附
            edgeSnapHideLabel: '邊緣吸附隱藏',
            edgeSnapHideDesc: '拖動面板到螢幕邊緣時自動隱藏，懸停顯示',
            // 手動錨點
            setAnchor: '設置錨點',
            setAnchorToast: '已設置錨點',
            backToAnchor: '返回錨點',
            noAnchor: '暫無錨點',
            clearAnchor: '清除錨點',
            clearAnchorToast: '已清除錨點',
            manualAnchorLabel: '手動錨點',
            manualAnchorDesc: '在快捷工具欄顯示手動錨點按鈕',
            // 浮水印移除
            watermarkRemovalLabel: '移除圖片浮水印',
            watermarkRemovalDesc: '自動移除 Gemini AI 生成圖像中的 NanoBanana 浮水印',
            watermarkProcessing: '正在處理圖片...',
            watermarkProcessed: '浮水印已移除',
            watermarkFailed: '處理失敗',
            // 內容設置
            contentExportSettingsTitle: '內容設置',
            exportImagesToBase64Label: '匯出時圖片轉 Base64',
            exportImagesToBase64Desc: '將對話中的圖片轉換為 Base64 編碼嵌入 Markdown，方便離線查看',
            formulaCopyLabel: '雙擊複製公式',
            formulaCopyDesc: '雙擊數學公式可複製 LaTeX 原始碼（僅 Gemini 標準版）',
            formulaCopied: '公式已複製',
            formulaDelimiterLabel: '複製時添加分隔符',
            formulaDelimiterDesc: '根據公式類型自動添加 $ 或 $$ 分隔符',
            tableCopyLabel: '表格複製 Markdown',
            tableCopyDesc: '在表格右上角添加複製按鈕，直接複製 Markdown 格式',
            tableCopied: '表格已複製',
        },
        en: {
            panelTitle: 'Gemini Helper',
            tabPrompts: 'Prompts',
            tabSettings: 'Settings',
            searchPlaceholder: 'Search prompts...',
            addPrompt: 'Add New Prompt',
            allCategory: 'All',
            manageCategory: '⚙ Manage',
            currentPrompt: 'Current: ',
            scrollTop: 'Top',
            scrollBottom: 'Bottom',
            refresh: 'Refresh',
            collapse: 'Collapse',
            edit: 'Edit',
            delete: 'Delete',
            copy: 'Copy',
            drag: 'Drag',
            save: 'Save',
            cancel: 'Cancel',
            add: 'Add',
            title: 'Title',
            category: 'Category',
            categoryPlaceholder: 'e.g., Coding, Translation',
            content: 'Prompt Content',
            editPrompt: 'Edit Prompt',
            addNewPrompt: 'Add New Prompt',
            fillTitleContent: 'Please fill in title and content',
            promptUpdated: 'Prompt updated',
            promptAdded: 'Prompt added',
            deleted: 'Deleted',
            copied: 'Copied to clipboard',
            cleared: 'Content cleared',
            refreshed: 'Refreshed',
            orderUpdated: 'Order updated',
            inserted: 'Prompt inserted',
            scrolling: 'Page is scrolling, please wait...',
            noTextarea: 'Input not found, please click the input area first',
            confirmDelete: 'Delete this prompt?',
            // Settings panel
            settingsTitle: 'General Settings',
            panelSettingsTitle: 'Panel Settings',
            clearOnSendLabel: 'Auto-fix Chinese input after send',
            clearOnSendDesc: 'Insert zero-width char after send to fix first letter issue (Gemini Business only)',
            settingOn: 'ON',
            settingOff: 'OFF',
            // Model Lock
            modelLockTitle: 'Model Lock',
            modelLockLabel: 'Auto Lock Model',
            modelLockDesc: 'Automatically switch to specified model upon entry',
            modelKeywordLabel: 'Model Keyword',
            modelKeywordPlaceholder: 'e.g., 3 Pro',
            modelKeywordDesc: 'Used to match target model name',
            // Category management
            categoryManage: 'Category Management',
            categoryEmpty: 'No categories yet. Categories are created when you add prompts.',
            rename: 'Rename',
            newCategoryName: 'Enter new category name:',
            categoryRenamed: 'Category renamed',
            confirmDeleteCategory: 'Delete this category? Associated prompts will be moved to "Uncategorized"',
            categoryDeleted: 'Category deleted',
            // Language settings
            languageLabel: 'Language',
            languageDesc: 'Set panel display language, takes effect immediately',
            languageAuto: 'Auto',
            languageZhCN: '简体中文',
            languageZhTW: '繁體中文',
            languageEn: 'English',
            // Page width settings
            pageWidthLabel: 'Page Width',
            pageWidthDesc: 'Adjust chat page width, takes effect immediately',
            enablePageWidth: 'Enable Page Widening',
            widthValue: 'Width Value',
            widthUnit: 'Unit',
            unitPx: 'Pixels (px)',
            unitPercent: 'Percentage (%)',
            // Tab Settings
            tabSettingsTitle: 'Tab Settings',
            openNewTabLabel: 'Open New Chat in New Tab',
            openNewTabDesc: 'Add a button to the panel header to open a new chat in a new tab',
            newTabTooltip: 'New Chat in New Tab',
            autoRenameTabLabel: 'Auto Rename Tab',
            autoRenameTabDesc: 'Change browser tab title to current conversation name',
            renameIntervalLabel: 'Detection Interval',
            renameIntervalDesc: 'Interval for detecting conversation name changes',
            secondsSuffix: 's',
            showStatusLabel: 'Show Status',
            showStatusDesc: 'Display generation status icon in tab title (⏳/✅)',
            showNotificationLabel: 'Desktop Notification',
            showNotificationDesc: 'Send system notification when generation completes',
            notificationSoundLabel: 'Notification Sound',
            notificationSoundDesc: 'Play a sound when generation completes',
            notificationVolumeLabel: 'Sound Volume',
            notifyWhenFocusedLabel: 'Notify When Focused',
            notifyWhenFocusedDesc: 'Send notifications even when the current page is visible',
            autoFocusLabel: 'Auto Focus Window',
            autoFocusDesc: 'Bring window to front when generation completes',
            privacyModeLabel: 'Privacy Mode',
            privacyModeDesc: 'Hide real conversation title, show decoy title (double-click panel header to toggle)',
            privacyTitleLabel: 'Decoy Title',
            privacyTitlePlaceholder: 'e.g., Google, Work Document',
            titleFormatLabel: 'Title Format',
            titleFormatDesc: 'Custom title format, supports placeholders: {status}, {title}, {model}',
            notificationTitle: '✅ {site} Generation Complete',
            notificationBody: 'Click to view results',
            tabOutline: 'Outline',
            outlineEmpty: 'No outline content',
            outlineRefresh: 'Refresh',
            outlineSettings: 'Outline Settings',
            enableOutline: 'Enable Outline',
            outlineMaxLevel: 'Heading Levels',
            outlineLevelAll: 'All (1-6)',
            outlineLevel1: 'Level 1 only',
            outlineLevel2: 'Up to Level 2',
            outlineLevel3: 'Up to Level 3',
            // Refresh button hints
            refreshPrompts: 'Refresh Prompts',
            refreshOutline: 'Refresh Outline',
            refreshSettings: 'Refresh Settings',
            jumpToAnchor: 'Go back to previous position',
            // Outline advanced toolbar
            outlineScrollBottom: 'Scroll to bottom',
            outlineScrollTop: 'Scroll to top',
            outlineExpandAll: 'Expand all',
            outlineCollapseAll: 'Collapse all',
            outlineLocateCurrent: 'Locate current position',
            outlineSearch: 'Search outline...',
            outlineSearchResult: 'result(s)',
            outlineLevelHint: 'headings',
            // Tab Order Settings
            tabOrderSettings: 'Interface Layout',
            tabOrderDesc: 'Adjust the display order of panel tabs',
            moveUp: 'Move Up',
            moveDown: 'Move Down',
            // Reading Navigation Settings
            readingNavigationSettings: 'Reading Navigation',
            anchorSettings: 'Reading History',
            anchorPersistence: 'Enable Reading History',
            anchorPersistenceDesc: 'Automatically remember reading position',
            anchorAutoRestore: 'Auto-Resume',
            anchorAutoRestoreDesc: 'Jump to last position on load',
            anchorCleanup: 'Retention Period',
            anchorCleanupDesc: 'Keep reading progress for days (-1 for infinite)',
            daysSuffix: 'Days',
            cleanupInfinite: 'Infinite',
            restoredPosition: 'Resumed last position',
            cleanupDone: 'Expired data cleaned',
            // Outline Advanced Settings
            outlineAutoUpdateLabel: 'Auto-update outline during conversation',
            outlineAutoUpdateDesc: 'Automatically refresh outline when AI generates content',
            outlineUpdateIntervalLabel: 'Update interval (seconds)',
            outlineShowUserQueries: 'Show user queries',
            outlineShowUserQueriesTooltip: 'Show user queries',
            outlineOnlyUserQueries: 'Queries',
            outlineIntervalUpdated: 'Interval set to {val} seconds',
            outlineSyncScrollLabel: 'Sync scroll',
            outlineSyncScrollDesc: 'Auto-highlight outline item when page scrolls',
            // Page Display Settings
            pageDisplaySettings: 'Page Display',
            // Other Settings
            otherSettingsTitle: 'Other Settings',
            showCollapsedAnchorLabel: 'Anchor',
            showCollapsedAnchorDesc: 'Display anchor button in sidebar when panel is collapsed',
            showCollapsedThemeLabel: 'Theme',
            showCollapsedThemeDesc: 'Display theme toggle button in sidebar when panel is collapsed',
            collapsedButtonsOrderDesc: 'Adjust the display order of collapsed panel buttons',
            preventAutoScrollLabel: 'Prevent auto-scroll',
            preventAutoScrollDesc: 'Stop page from auto-scrolling to bottom during AI generation',
            markdownFixLabel: 'Markdown Bold Fix',
            markdownFixDesc: 'Fix unrendered **bold** syntax in Gemini responses',
            // Panel Settings
            defaultPanelStateLabel: 'Show Panel by Default',
            defaultPanelStateDesc: 'Keep panel expanded after page refresh',
            autoHidePanelLabel: 'Auto-hide Panel',
            autoHidePanelDesc: 'Hide panel when clicking outside (sidebar, chat area, input box)',
            // Interface Toggle
            disableOutline: 'Disable Outline',
            togglePrompts: 'Toggle Prompts',
            toggleConversations: 'Toggle Conversations',
            // Conversations
            tabConversations: 'Conversations',
            conversationsEmpty: 'No conversations yet',
            conversationsEmptyHint: 'Click sync button above to import from sidebar',
            conversationsSync: 'Sync',
            conversationsSyncing: 'Syncing...',
            conversationsSynced: 'Synced',
            conversationsAddFolder: 'New Folder',
            conversationsRename: 'Rename',
            conversationsDelete: 'Delete',
            conversationsDeleteConfirm: 'Delete this folder? Conversations will be moved to Inbox.',
            conversationsFolderCreated: 'Folder created',
            conversationsFolderRenamed: 'Folder renamed',
            conversationsFolderDeleted: 'Folder deleted',
            conversationsCannotDeleteDefault: 'Cannot delete default folder',
            conversationsIcon: 'Icon',
            conversationsFolderName: 'Name',
            conversationsFolderNamePlaceholder: 'Enter folder name',
            confirm: 'Confirm',
            conversationsSyncEmpty: 'No conversations found',
            conversationsSyncNoChange: 'No new conversations',
            conversationsLocate: 'Locate current chat',
            conversationsLocateSuccess: 'Located current conversation',
            conversationsLocateNotFound: 'Chat not indexed, syncing...',
            conversationsLocateNewChat: 'This is a new chat, not saved yet',
            conversationsLocateSyncFailed: 'Chat still not found after sync',
            justNow: 'Just now',
            minutesAgo: 'm ago',
            hoursAgo: 'h ago',
            daysAgo: 'd ago',
            conversationsSelectFolder: 'Select sync folder',
            conversationsMoveTo: 'Move to...',
            conversationsMoved: 'Moved to',
            conversationsSyncDeleteTitle: 'Sync Deletion',
            conversationsSyncDeleteMsg: '{count} conversation(s) have been deleted from cloud. Remove local records?',
            conversationsDeleted: 'Removed',
            // Conversation settings
            conversationsSettingsTitle: 'Conversation Settings',
            conversationsSyncUnpinLabel: 'Sync unpin on sync',
            conversationsSyncUnpinDesc: 'Update local pin status when conversation is unpinned in cloud',
            folderRainbowLabel: 'Folder Rainbow Colors',
            folderRainbowDesc: 'Assign different background colors to folders, disable for uniform color',
            conversationsSyncDeleteLabel: 'Sync delete to cloud',
            conversationsSyncDeleteDesc: 'When deleting local record, also delete from {site} cloud',
            conversationsSyncRenameLabel: 'Sync rename to cloud',
            conversationsSyncRenameDesc: 'When renaming conversation, also update title in {site} sidebar',
            conversationsCustomIcon: 'Custom Icon',
            batchSelected: 'Selected {n}',
            batchMove: 'Move',
            batchDelete: 'Delete',
            batchExit: 'Exit',
            batchExport: 'Export',
            exportToMarkdown: 'Markdown',
            exportToJSON: 'JSON',
            exportLoading: 'Loading conversation history...',
            exportSuccess: 'Export successful',
            exportFailed: 'Export failed',
            exportNoContent: 'No conversation content found',
            copySuccess: 'Copied to clipboard',
            exportNeedOpenFirst: 'Please open the conversation first',
            exportUserLabel: 'User',
            exportMetaTitle: 'Export Info',
            exportMetaConvTitle: 'Conversation Title',
            exportMetaTime: 'Export Time',
            exportMetaSource: 'Source',
            exportNotSupported: 'Export not supported for this site',
            exportToTXT: 'TXT',
            exportMetaUrl: 'URL',
            exportToClipboard: 'Copy Markdown',
            conversationsRefresh: 'Refresh List',
            conversationsSearchPlaceholder: 'Search conversations...',
            conversationsSearchResult: 'result(s)',
            conversationsNoSearchResult: 'No matching results',
            conversationsSetTags: 'Set Tags',
            conversationsNewTag: 'New Tag',
            conversationsTagName: 'Tag Name',
            conversationsTagColor: 'Tag Color',
            conversationsFilterByTags: 'Filter by Tags',
            conversationsClearTags: 'Clear Filter',
            conversationsTagCreated: 'Tag Created',
            conversationsTagUpdated: 'Tag Updated',
            conversationsTagDeleted: 'Tag Deleted',
            conversationsTagExists: 'Tag name already exists',
            conversationsUpdateTag: 'Update Tag',
            conversationsNoTags: 'No Tags',
            conversationsPin: 'Pin📌',
            conversationsUnpin: 'Unpin',
            conversationsPinned: 'Pinned',
            conversationsUnpinned: 'Unpinned',
            conversationsFilterPinned: 'Filter Pinned',
            conversationsClearAll: 'Clear all filters',
            conversationsBatchMode: 'Batch Mode',
            // History loading
            loadingHistory: 'Loading history...',
            historyLoaded: 'History loaded',
            stopLoading: 'Stop loading',
            loadingHint: 'Keep page still, will scroll to top when done',
            // Edge Snap
            edgeSnapHideLabel: 'Edge Snap Hide',
            edgeSnapHideDesc: 'Auto-hide panel when dragged to screen edge, hover to show',
            // Manual Anchor
            setAnchor: 'Set Anchor',
            setAnchorToast: 'Anchor set',
            backToAnchor: 'Back to Anchor',
            noAnchor: 'No anchor',
            clearAnchor: 'Clear Anchor',
            clearAnchorToast: 'Anchor cleared',
            manualAnchorLabel: 'Manual Anchor',
            manualAnchorDesc: 'Show manual anchor buttons in quick toolbar',
            // Watermark Removal
            watermarkRemovalLabel: 'Remove Image Watermark',
            watermarkRemovalDesc: 'Automatically remove NanoBanana watermark from Gemini AI generated images',
            watermarkProcessing: 'Processing image...',
            watermarkProcessed: 'Watermark removed',
            watermarkFailed: 'Processing failed',
            // Content Settings
            contentExportSettingsTitle: 'Content',
            exportImagesToBase64Label: 'Export Images as Base64',
            exportImagesToBase64Desc: 'Convert images to Base64 in exported Markdown for offline viewing',
            formulaCopyLabel: 'Double-Click Copy Formula',
            formulaCopyDesc: 'Copy LaTeX source on double-click (Gemini Standard only)',
            formulaCopied: 'Formula copied',
            formulaDelimiterLabel: 'Add Delimiters on Copy',
            formulaDelimiterDesc: 'Automatically add $ or $$ delimiters based on formula type',
            tableCopyLabel: 'Table Copy Markdown',
            tableCopyDesc: 'Add copy button to tables for direct Markdown copy',
            tableCopied: 'Table copied',
        },
    };

    // ============= 默认提示词库 =============
    const DEFAULT_PROMPTS = [
        {
            id: 'default_1',
            title: '代码优化',
            content: '请帮我优化以下代码，提高性能和可读性：\n\n',
            category: '编程',
        },
        {
            id: 'default_2',
            title: '翻译助手',
            content: '请将以下内容翻译成中文，保持专业术语的准确性：\n\n',
            category: '翻译',
        },
    ];

    // ============= 页面宽度默认配置 =============
    const DEFAULT_WIDTH_SETTINGS = {
        gemini: { enabled: false, value: '70', unit: '%' },
        'gemini-business': { enabled: false, value: '1600', unit: 'px' },
    };

    // ============= 大纲功能默认配置 =============
    const DEFAULT_OUTLINE_SETTINGS = {
        enabled: true,
        maxLevel: 6, // 显示到几级标题 (1-6)
        autoUpdate: true,
        updateInterval: 3,
        showUserQueries: false, // 展示用户提问，按对话轮次分组
        syncScroll: true, // 页面滚动时自动高亮大纲项
    };

    // ================ i18n方法 ==================
    // 语言检测函数（支持手动设置）
    function detectLanguage() {
        // 优先使用用户手动设置的语言
        const savedLang = GM_getValue(SETTING_KEYS.LANGUAGE, 'auto');
        if (savedLang !== 'auto' && I18N[savedLang]) {
            return savedLang;
        }
        // 自动检测
        const lang = navigator.language || navigator.userLanguage || 'en';
        if (lang.startsWith('zh-TW') || lang.startsWith('zh-HK') || lang.startsWith('zh-Hant')) {
            return 'zh-TW';
        }
        if (lang.startsWith('zh')) {
            return 'zh-CN';
        }
        return 'en';
    }

    // 全局 i18n 翻译函数
    // 缓存语言检测结果，避免每次调用都重新检测
    let _cachedLang = null;

    function t(key) {
        if (!_cachedLang) {
            _cachedLang = detectLanguage();
        }
        return I18N[_cachedLang]?.[key] || I18N['en']?.[key] || key;
    }

    // 语言变更时需要调用此函数清除缓存
    function resetLanguageCache() {
        _cachedLang = null;
    }

    // ==================== 站点适配器模式 (Site Adapter Pattern) ====================

    /**
     * 站点适配器基类
     * 添加新站点时，继承此类并实现所有抽象方法
     */
    class SiteAdapter {
        constructor() {
            this.textarea = null;
        }

        /**
         * 检测当前页面是否匹配该站点
         * @returns {boolean}
         */
        match() {
            throw new Error('必须实现 match()');
        }

        /**
         * 返回站点标识符(用于配置存储)
         * @returns {string}
         */
        getSiteId() {
            throw new Error('必须实现 getSiteId()');
        }

        /**
         * 返回站点显示名称
         * @returns {string}
         */
        getName() {
            throw new Error('必须实现 getName()');
        }

        /**
         * 获取当前会话ID (用于锚点持久化)
         * @returns {string} Session ID
         */
        getSessionId() {
            // 优化实现：先去除 URL 中的查询参数 (?及后面内容)，再获取最后一段
            const urlWithoutQuery = window.location.href.split('?')[0];
            const parts = urlWithoutQuery.split('/').filter((p) => p);
            return parts.length > 0 ? parts[parts.length - 1] : 'default';
        }

        /**
         * 是否支持在新标签页打开新对话
         * @returns {boolean}
         */
        supportsNewTab() {
            return true;
        }

        /**
         * 获取新标签页打开的 URL
         * @returns {string}
         */
        getNewTabUrl() {
            return window.location.origin;
        }

        /**
         * 是否支持标签页重命名
         * @returns {boolean}
         */
        supportsTabRename() {
            return true;
        }

        /**
         * 获取当前会话/对话名称（用于标签页重命名）
         * @returns {string|null}
         */
        getSessionName() {
            // 默认实现：尝试从 document.title 中提取
            const title = document.title;
            if (title) {
                // 去除站点名称后缀，如 "对话标题 - Gemini"
                const parts = title.split(' - ');
                if (parts.length > 1) {
                    return parts.slice(0, -1).join(' - ').trim();
                }
                return title.trim();
            }
            return null;
        }

        /**
         * 判断当前是否处于新对话页面（未发起任何对话）
         * 新对话页面不应使用旧会话标题更新标签页、不应记录阅读历史
         * @returns {boolean}
         */
        isNewConversation() {
            return false;
        }

        /**
         * 获取侧边栏会话列表
         * 子类应覆盖此方法从站点 DOM 提取会话数据
         * @returns {Array<{id: string, title: string, url: string, isActive: boolean}>}
         */
        getConversationList() {
            return [];
        }

        /**
         * 获取侧边栏可滚动容器
         * 子类应覆盖此方法返回侧边栏的可滚动容器元素
         * @returns {Element|null}
         */
        getSidebarScrollContainer() {
            return null;
        }

        /**
         * 获取会话观察器配置（用于侧边栏实时监听）
         * 子类应覆盖此方法提供站点特定的配置
         * @returns {{
         *   selector: string,                    // 会话元素 CSS 选择器
         *   shadow: boolean,                     // 是否需要 Shadow DOM 穿透
         *   extractInfo: function(Element): Object|null, // 从元素提取会话信息
         *   getTitleElement: function(Element): Element  // 获取标题元素（用于监听变化）
         * }|null} 返回 null 表示不支持
         */
        getConversationObserverConfig() {
            return null;
        }

        /**
         * 滚动加载全部会话
         * 模拟滚动侧边栏到底部，直到所有会话都加载完成
         * @returns {Promise<void>}
         */
        async loadAllConversations() {
            const container = this.getSidebarScrollContainer();
            if (!container) return;

            let lastCount = 0;
            let stableRounds = 0;
            const maxStableRounds = 3; // 连续3次无新增则停止

            while (stableRounds < maxStableRounds) {
                container.scrollTop = container.scrollHeight;
                await new Promise((r) => setTimeout(r, 500));

                // 使用 DOMToolkit 穿透 Shadow DOM 查询会话数量
                const conversations = DOMToolkit.query('.conversation', { all: true, shadow: true }) || [];
                const currentCount = conversations.length;
                if (currentCount === lastCount) {
                    stableRounds++;
                } else {
                    lastCount = currentCount;
                    stableRounds = 0;
                }
            }
        }

        /**
         * 检测 AI 是否正在生成响应
         * @returns {boolean}
         */
        isGenerating() {
            // 默认实现：子类应覆盖此方法
            return false;
        }

        /**
         * 获取当前使用的模型名称
         * @returns {string|null}
         */
        getModelName() {
            // 默认实现：子类应覆盖此方法
            return null;
        }

        /**
         * 获取网络监控配置（用于后台任务完成检测）
         * 子类可覆盖此方法提供站点特定的配置
         * @returns {{
         *   urlPatterns: string[],      // 要监控的 URL 模式（包含匹配）
         *   silenceThreshold: number    // 静默判定时间（毫秒）
         * }|null} 返回 null 表示不启用网络监控
         */
        getNetworkMonitorConfig() {
            return null;
        }

        /**
         * 返回站点主题色
         * @returns {{primary: string, secondary: string}}
         */
        getThemeColors() {
            throw new Error('必须实现 getThemeColors()');
        }

        /**
         * 返回需要加宽的CSS选择器列表
         * @returns {Array<{selector: string, property: string}>}
         */
        getWidthSelectors() {
            return [];
        }

        /**
         * 返回输入框选择器列表
         * @returns {string[]}
         */
        getTextareaSelectors() {
            return [];
        }

        /**
         * 获取提交按钮选择器，可以匹配ID、类名、属性等选择器
         *
         * @returns 提交按钮选择器
         */
        getSubmitButtonSelectors() {
            return [];
        }

        /**
         * 查找输入框元素
         * 默认实现：遍历选择器查找
         * @returns {HTMLElement|null}
         */
        findTextarea() {
            for (const selector of this.getTextareaSelectors()) {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    if (this.isValidTextarea(element)) {
                        this.textarea = element;
                        return element;
                    }
                }
            }
            return null;
        }

        /**
         * 验证输入框是否有效
         * @param {HTMLElement} element
         * @returns {boolean}
         */
        isValidTextarea(element) {
            return element.offsetParent !== null;
        }

        /**
         * 向输入框插入内容
         * @param {string} content
         * @returns {Promise<boolean>|boolean}
         */
        insertPrompt(content) {
            throw new Error('必须实现 insertPrompt()');
        }

        /**
         * 清空输入框内容
         */
        clearTextarea() {
            if (this.textarea) {
                this.textarea.value = '';
                this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }

        /**
         * 获取滚动容器
         * @returns {HTMLElement}
         */
        getScrollContainer() {
            // 精确匹配滚动容器，找不到就返回 null（不 fallback 到 body）
            // 这对于同步滚动很重要：必须绑定到正确的容器
            const selectors = [
                'infinite-scroller.chat-history', // Gemini 主对话滚动容器
                '.chat-mode-scroller',
                'main',
                '[role="main"]',
                '.conversation-container',
                '.chat-container',
                'div.content-container', // Gemini 分享页面滚动容器
            ];
            for (const selector of selectors) {
                const container = document.querySelector(selector);
                if (container && container.scrollHeight > container.clientHeight) {
                    // 如果找到普通容器，清除 Flutter 容器缓存
                    this._cachedFlutterScrollContainer = null;
                    return container;
                }
            }

            // 检查缓存的 Flutter 容器是否仍然有效
            if (this._cachedFlutterScrollContainer && this._cachedFlutterScrollContainer.isConnected) {
                return this._cachedFlutterScrollContainer;
            }

            // 尝试在 iframe 中查找（Gemini 图文并茂模式）
            // iframe 有 allow-same-origin，可以跨域访问其内部 DOM
            const iframes = document.querySelectorAll('iframe[sandbox*="allow-same-origin"]');
            for (const iframe of iframes) {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                        // 在 flutter-view 内查找滚动容器
                        const scrollContainer = iframeDoc.querySelector('flt-semantics[style*="overflow-y: scroll"]:not([style*="overflow-x: scroll"])');
                        if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
                            // 缓存找到的 Flutter 容器
                            this._cachedFlutterScrollContainer = scrollContainer;
                            return scrollContainer;
                        }
                    }
                } catch (e) {
                    // 跨域 iframe 会抛出错误，忽略
                    console.warn('[GeminiHelper] Failed to access iframe:', e.message);
                }
            }

            // 容器可能还未加载（SPA 动态渲染），返回 null 让调用者决定重试
            return null;
        }

        /**
         * 获取当前视口中可见的锚点元素信息 (用于精准定位)
         * @returns {Object|null} { selector, offset, index }
         */
        getVisibleAnchorElement() {
            const container = this.getScrollContainer();
            if (!container) return null;

            const scrollTop = container.scrollTop;
            const selectors = this.getChatContentSelectors();
            if (!selectors.length) return null;

            // 查找所有候选元素
            const candidates = Array.from(container.querySelectorAll(selectors.join(', ')));
            if (!candidates.length) return null;

            let bestElement = null;

            for (let i = 0; i < candidates.length; i++) {
                const el = candidates[i];
                const top = el.offsetTop;

                // 策略：找到最后一个"顶部"位于视口上方(或刚露出)的元素 = 用户当前正在阅读的起始元素
                if (top <= scrollTop + 100) {
                    bestElement = el;
                } else {
                    // 后续元素都在视口下方，停止
                    break;
                }
            }

            if (!bestElement && candidates.length > 0) bestElement = candidates[0];

            if (bestElement) {
                const offset = scrollTop - bestElement.offsetTop;
                let selector = '';
                let id = bestElement.getAttribute('data-message-id') || bestElement.id;

                if (id) {
                    selector = `[data-message-id="${id}"]`;
                    if (!bestElement.matches(selector)) selector = `#${id}`;
                    return { type: 'selector', selector: selector, offset: offset };
                } else {
                    const globalIndex = candidates.indexOf(bestElement);
                    if (globalIndex !== -1) {
                        // 增强：记录文本指纹，防止历史加载导致索引偏移
                        const textSignature = (bestElement.textContent || '').trim().substring(0, 50);
                        return { type: 'index', index: globalIndex, offset: offset, textSignature: textSignature };
                    }
                }
            }
            return null;
        }

        /**
         * 根据保存的锚点信息恢复滚动
         * @param {Object} anchorData
         * @returns {boolean} 是否成功恢复
         */
        restoreScroll(anchorData) {
            const container = this.getScrollContainer();
            if (!container || !anchorData) return false;

            let targetElement = null;

            if (anchorData.type === 'selector' && anchorData.selector) {
                targetElement = container.querySelector(anchorData.selector);
            } else if (anchorData.type === 'index' && typeof anchorData.index === 'number') {
                const selectors = this.getChatContentSelectors();
                const candidates = Array.from(container.querySelectorAll(selectors.join(', ')));

                // 优先尝试使用索引
                if (candidates[anchorData.index]) {
                    targetElement = candidates[anchorData.index];

                    // 如果有文本指纹，进行校验
                    if (anchorData.textSignature) {
                        const currentText = (targetElement.textContent || '').trim().substring(0, 50);
                        // 如果文本不匹配，说明索引可能偏移了（例如加载了历史消息）
                        // 此时尝试全列表搜索
                        if (currentText !== anchorData.textSignature) {
                            // console.log('Anchor index mismatch, searching by text signature...');
                            const found = candidates.find((c) => (c.textContent || '').trim().substring(0, 50) === anchorData.textSignature);
                            if (found) targetElement = found;
                        }
                    }
                } else {
                    // 索引越界（可能消息被删了？），尝试文本搜索
                    if (anchorData.textSignature) {
                        const found = candidates.find((c) => (c.textContent || '').trim().substring(0, 50) === anchorData.textSignature);
                        if (found) targetElement = found;
                    }
                }
            }

            if (targetElement) {
                const targetTop = targetElement.offsetTop + (anchorData.offset || 0);
                container.scrollTo({ top: targetTop, behavior: 'instant' });
                return true;
            }
            return false;
        }

        /**
         * 页面加载完成后执行
         * @param {Object} options - 配置项 { clearOnInit: boolean, lockModel: boolean }
         */
        afterPropertiesSet(options = {}) {
            const { modelLockConfig } = options;
            // 默认初始化逻辑：如果有模型锁定配置且启用，尝试锁定模型
            if (modelLockConfig && modelLockConfig.enabled) {
                console.log(`[${this.getName()}] Triggering auto model lock:`, modelLockConfig.keyword);
                this.lockModel(modelLockConfig.keyword);
            }
        }

        /**
         * 判断是否应该将样式注入到指定的 Shadow Host 中
         * 用于解决 Shadow DOM 样式污染问题
         */
        shouldInjectIntoShadow(host) {
            return true;
        }

        /**
         * 获取对话历史容器的选择器
         * @returns {string} CSS 选择器
         */
        getResponseContainerSelector() {
            return '';
        }

        /**
         * 获取聊天内容元素的选择器列表
         * 用于 MutationObserver 检测新消息，配合滚动锁定功能
         * @returns {string[]} CSS 选择器列表
         */
        getChatContentSelectors() {
            return [];
        }

        /**
         * 获取用户提问元素的选择器（用于大纲分组功能）
         * @returns {string|null} CSS 选择器，返回 null 表示不支持
         */
        getUserQuerySelector() {
            return null;
        }

        /**
         * 从用户提问元素中提取文本（用于大纲分组功能）
         * @param {Element} element 用户提问的 DOM 元素
         * @returns {string} 用户提问的文本内容
         */
        extractUserQueryText(element) {
            return element.textContent?.trim() || '';
        }

        /**
         * 从页面提取大纲（标题列表）
         * @param {number} maxLevel 最大标题级别 (1-6)
         * @param {boolean} includeUserQueries 是否包含用户提问（作为 level 0 节点）
         * @returns {Array<{level: number, text: string, element: Element|null, isUserQuery?: boolean}>}
         */
        extractOutline(maxLevel = 6, includeUserQueries = false) {
            return [];
        }

        /**
         * 是否支持滚动锁定功能
         * @returns {boolean}
         */
        supportsScrollLock() {
            return false; // 默认不支持，除非子类明确声明
        }

        /**
         * 获取导出配置（用于会话导出功能）
         * 子类应覆盖此方法提供站点特定的配置
         * @returns {{
         *   userQuerySelector: string,      // 用户提问元素选择器
         *   assistantResponseSelector: string, // AI回复元素选择器
         *   turnSelector: string|null,      // 对话轮次容器选择器（可选）
         *   useShadowDOM: boolean           // 是否需要穿透 Shadow DOM
         * }|null} 返回 null 表示不支持导出
         */
        getExportConfig() {
            return null;
        }

        // ============= 新对话监听 =============

        /**
         * 获取“新对话”按钮的选择器列表
         * @returns {string[]}
         */
        getNewChatButtonSelectors() {
            return [];
        }

        /**
         * 绑定新对话触发事件（点击按钮或快捷键）
         * @param {Function} callback - 触发时的回调函数
         */
        bindNewChatListeners(callback) {
            // 1. 快捷键监听 (Ctrl + Shift + O)
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.shiftKey && (e.key === 'o' || e.key === 'O')) {
                    console.log(`[${this.getName()}] New chat shortcut detected.`);
                    // 给予一点延迟等待页面响应
                    setTimeout(callback, 500);
                }
            });

            // 2. 按钮点击监听
            document.addEventListener(
                'click',
                (e) => {
                    const selectors = this.getNewChatButtonSelectors();
                    if (selectors.length === 0) return;

                    // 使用 composedPath() 以支持 Shadow DOM 中的元素匹配
                    const path = e.composedPath();
                    for (const target of path) {
                        if (target === document || target === window) break;

                        for (const selector of selectors) {
                            if (target.matches && target.matches(selector)) {
                                console.log(`[${this.getName()}] New chat button clicked.`);
                                setTimeout(callback, 500);
                                return;
                            }
                        }
                    }
                },
                true,
            ); // 使用捕获阶段确保捕获
        }

        // ============= 模型锁定功能（抽象接口） =============

        /**
         * 获取默认的模型锁定设置（每个站点可覆盖）
         * @returns {{ enabled: boolean, keyword: string }}
         */
        getDefaultLockSettings() {
            return { enabled: false, keyword: '' };
        }

        /**
         * 获取模型锁定配置
         * 子类需要覆盖此方法提供具体配置
         * @param {string} keyword - 目标模型关键字（由设置传入）
         * @returns {{
         *   targetModelKeyword: string,          // 目标模型名称关键字（用于匹配）
         *   selectorButtonSelectors: string[],   // 模型选择器按钮的 CSS 选择器列表
         *   menuItemSelector: string,            // 菜单项的 CSS 选择器
         *   checkInterval: number,               // 检查间隔（毫秒）
         *   maxAttempts: number,                 // 最大尝试次数
         *   menuRenderDelay: number              // 菜单渲染等待时间（毫秒）
         * }|null}
         */
        getModelSwitcherConfig(keyword) {
            return null;
        }

        /**
         /**
         * 通用模型锁定实现
         * 基于 getModelSwitcherConfig() 返回的配置执行锁定逻辑
         * @param {string} keyword - 目标模型关键字
         * @param {Function} onSuccess 成功后的回调（可选）
         */
        lockModel(keyword, onSuccess = null) {
            const config = this.getModelSwitcherConfig(keyword);
            if (!config) return;

            const { targetModelKeyword, selectorButtonSelectors, menuItemSelector, checkInterval = 1500, maxAttempts = 20, menuRenderDelay = 500 } = config;

            let attempts = 0;
            let isSelecting = false;
            // 辅助函数：标准化文本（小写 + 去空）
            const normalize = (str) => (str || '').toLowerCase().trim();
            const target = normalize(targetModelKeyword);

            const timer = setInterval(() => {
                attempts++;
                if (attempts > maxAttempts) {
                    console.warn(`Gemini Helper: Model lock timed out for "${targetModelKeyword}"`);
                    clearInterval(timer);
                    return;
                }

                if (isSelecting) return;

                // 1. 查找模型选择器按钮
                const selectorBtn = this.findElementBySelectors(selectorButtonSelectors);
                if (!selectorBtn) return;

                // 2. 检查当前是否已经是目标模型（不区分大小写）
                const currentText = selectorBtn.textContent || selectorBtn.innerText || '';
                if (normalize(currentText).includes(target)) {
                    console.log(`Gemini Helper: Model is already locked to "${targetModelKeyword}"`);
                    clearInterval(timer);
                    if (onSuccess) onSuccess();
                    return;
                }

                // 3. 标记正在选择
                isSelecting = true;

                // 4. 点击展开菜单
                selectorBtn.click();

                // 5. 等待菜单渲染后查找并点击目标项
                setTimeout(() => {
                    const menuItems = this.findAllElementsBySelector(menuItemSelector);

                    // 如果找到了菜单项，说明菜单已渲染
                    if (menuItems.length > 0) {
                        let found = false;

                        for (const item of menuItems) {
                            const itemText = item.textContent || item.innerText || '';
                            // 不区分大小写匹配
                            if (normalize(itemText).includes(target)) {
                                item.click();
                                found = true;
                                clearInterval(timer);
                                console.log(`Gemini Helper: Switched to model "${targetModelKeyword}"`);
                                // 延迟关闭菜单面板
                                setTimeout(() => {
                                    document.body.click();
                                    if (onSuccess) onSuccess();
                                }, 100);
                                break;
                            }
                        }

                        if (!found) {
                            // 菜单已打开但没有找到目标模型，停止重试以避免死循环闪烁
                            console.warn(`Gemini Helper: Target model "${targetModelKeyword}" not found in menu. Aborting.`);
                            clearInterval(timer); // 关键：停止定时器
                            document.body.click(); // 关闭菜单
                            isSelecting = false;
                        }
                    } else {
                        // 菜单可能未渲染或选择器不匹配，允许重试（直到超时）
                        isSelecting = false;
                        document.body.click(); // 尝试关闭以重置状态
                    }
                }, menuRenderDelay);
            }, checkInterval);
        }

        /**
         * 通过选择器列表查找单个元素（支持 Shadow DOM）
         * @param {string[]} selectors
         * @returns {Element|null}
         */
        findElementBySelectors(selectors) {
            // 使用 DOMToolkit 进行 Shadow DOM 穿透查找
            return DOMToolkit.query(selectors, { shadow: true });
        }

        /**
         * 通过选择器查找所有元素（支持 Shadow DOM）
         * @param {string} selector
         * @returns {Element[]}
         */
        findAllElementsBySelector(selector) {
            // 使用 DOMToolkit 进行 Shadow DOM 穿透查找（返回所有匹配）
            return DOMToolkit.query(selector, { all: true, shadow: true });
        }
    }

    /**
     * Gemini 适配器（gemini.google.com）
     */
    class GeminiAdapter extends SiteAdapter {
        match() {
            return window.location.hostname.includes('gemini.google') && !window.location.hostname.includes('business.gemini.google');
        }

        getSiteId() {
            return 'gemini';
        }

        getName() {
            return 'Gemini';
        }

        getThemeColors() {
            return { primary: '#4285f4', secondary: '#34a853' };
        }

        getNewTabUrl() {
            return 'https://gemini.google.com/app';
        }

        isNewConversation() {
            const path = window.location.pathname;
            return path === '/app' || path === '/app/';
        }

        /**
         * 检测是否为分享页面（只读）
         * @returns {boolean}
         */
        isSharePage() {
            return window.location.pathname.startsWith('/share/');
        }

        /**
         * 从侧边栏提取会话列表
         * @returns {Array<{id: string, title: string, url: string, isActive: boolean}>}
         */
        getConversationList() {
            const items = DOMToolkit.query('.conversation', { all: true }) || [];
            return Array.from(items)
                .map((el) => {
                    // 从 jslog 属性中提取会话 ID (Use safer regex that allows dashes/underscores)
                    const jslog = el.getAttribute('jslog') || '';
                    const idMatch = jslog.match(/\["c_([^"]+)"/);
                    const id = idMatch ? idMatch[1] : '';
                    const title = el.querySelector('.conversation-title')?.textContent?.trim() || '';

                    // 检测是否为云端置顶会话（检测实际的 push_pin 图标，而非容器）
                    const isPinned = !!el.querySelector('mat-icon[fonticon="push_pin"]');

                    return {
                        id: id,
                        title: title,
                        url: id ? `https://gemini.google.com/app/${id}` : '',
                        isActive: el.classList.contains('selected'),
                        isPinned: isPinned,
                    };
                })
                .filter((c) => c.id); // 过滤掉没有 ID 的项
        }

        /**
         * 获取侧边栏可滚动容器
         * @returns {Element|null}
         */
        getSidebarScrollContainer() {
            return DOMToolkit.query('infinite-scroller[scrollable="true"]') || DOMToolkit.query('infinite-scroller');
        }

        /**
         * 获取会话观察器配置（用于侧边栏实时监听）
         */
        getConversationObserverConfig() {
            return {
                selector: '.conversation',
                shadow: false,
                extractInfo: (el) => {
                    const jslog = el.getAttribute('jslog') || '';
                    const idMatch = jslog.match(/\["c_([^"]+)"/);
                    const id = idMatch ? idMatch[1] : '';
                    if (!id) return null;
                    // 使用精确选择器提取标题，避免包含"固定的对话"等隐藏文字
                    const title = el.querySelector('.conversation-title')?.textContent?.trim() || '';
                    // 检测是否为云端置顶会话
                    const isPinned = !!el.querySelector('mat-icon[fonticon="push_pin"]');
                    return {
                        id,
                        title,
                        url: `https://gemini.google.com/app/${id}`,
                        isPinned,
                    };
                },
                getTitleElement: (el) => el.querySelector('.conversation-title') || el,
            };
        }

        getSessionName() {
            // 从侧边栏活动对话标题获取
            const titleEl = document.querySelector('.conversation-title');
            if (titleEl) {
                const name = titleEl.textContent?.trim();
                if (name) return name;
            }
            // 回退到基类默认实现（从 document.title 提取）
            return super.getSessionName();
        }

        getNewChatButtonSelectors() {
            return [
                '.new-chat-button',
                '.chat-history-new-chat-button',
                '[aria-label="New chat"]',
                '[aria-label="新对话"]',
                '[aria-label="发起新对话"]',
                '[data-testid="new-chat-button"]',
                '[data-test-id="new-chat-button"]',
                '[data-test-id="expanded-button"]',
                // 临时对话按钮
                '[data-test-id="temp-chat-button"]',
                'button[aria-label="临时对话"]',
            ];
        }

        getWidthSelectors() {
            return [
                { selector: '.conversation-container', property: 'max-width' },
                { selector: '.input-area-container', property: 'max-width' },
                // 用户消息右对齐
                {
                    selector: 'user-query',
                    property: 'max-width',
                    value: '100%',
                    noCenter: true,
                    extraCss: 'display: flex !important; justify-content: flex-end !important;',
                },
                {
                    selector: '.user-query-container',
                    property: 'max-width',
                    value: '100%',
                    noCenter: true,
                    extraCss: 'justify-content: flex-end !important;',
                },
            ];
        }

        getTextareaSelectors() {
            return ['div[contenteditable="true"].ql-editor', 'div[contenteditable="true"]', '[role="textbox"]', '[aria-label*="Enter a prompt"]'];
        }

        getSubmitButtonSelectors() {
            return ['button[aria-label*="Send"]', 'button[aria-label*="发送"]', '.send-button', '[data-testid*="send"]'];
        }

        isValidTextarea(element) {
            // 必须是可见的 contenteditable 元素
            if (element.offsetParent === null) return false;
            const isContentEditable = element.getAttribute('contenteditable') === 'true';
            const isTextbox = element.getAttribute('role') === 'textbox';
            // 排除脚本自身的 UI
            if (element.closest('#gemini-helper-panel')) return false;

            return isContentEditable || isTextbox || element.classList.contains('ql-editor');
        }

        insertPrompt(content) {
            const editor = this.textarea;
            if (!editor) return false;

            // 验证元素仍在 DOM 中
            if (!editor.isConnected) {
                this.textarea = null;
                return false;
            }

            editor.focus();
            // 验证 focus 是否成功（防止在 textarea 失效时 selectAll 选中整个文档）
            if (document.activeElement !== editor && !editor.contains(document.activeElement)) {
                console.warn('[GeminiHelper] insertPrompt: focus failed, skipping execCommand');
                return false;
            }

            try {
                // 先全选
                document.execCommand('selectAll', false, null);
                // 然后插入新内容
                const success = document.execCommand('insertText', false, content);
                if (!success) {
                    throw new Error('execCommand returned false');
                }
            } catch (e) {
                // 降级方案：直接替换内容，不叠加
                editor.textContent = content;
                editor.dispatchEvent(new Event('input', { bubbles: true }));
                editor.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return true;
        }

        clearTextarea() {
            if (!this.textarea) return;

            // 验证元素仍在 DOM 中
            if (!this.textarea.isConnected) {
                this.textarea = null;
                return;
            }

            this.textarea.focus();
            // 验证 focus 是否成功（防止在 textarea 失效时 selectAll 选中整个文档）
            if (document.activeElement !== this.textarea && !this.textarea.contains(document.activeElement)) {
                console.warn('[GeminiHelper] clearTextarea: focus failed, skipping execCommand');
                return;
            }

            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
        }

        getResponseContainerSelector() {
            // 分享页面使用不同的容器
            if (this.isSharePage()) {
                return 'div.content-container';
            }
            return 'infinite-scroller.chat-history';
        }

        getChatContentSelectors() {
            return ['.model-response-container', 'model-response', '.response-container', '[data-message-id]', 'message-content'];
        }

        getUserQuerySelector() {
            return 'user-query';
        }

        extractUserQueryText(element) {
            // 从 user-query 元素中提取 .query-text 的文本
            const queryText = element.querySelector('.query-text');
            if (queryText) {
                return queryText.textContent?.trim() || '';
            }
            return element.textContent?.trim() || '';
        }

        getExportConfig() {
            return {
                userQuerySelector: 'user-query',
                assistantResponseSelector: 'model-response, .model-response-container .markdown',
                turnSelector: '.conversation-turn',
                useShadowDOM: false,
            };
        }

        extractOutline(maxLevel = 6, includeUserQueries = false) {
            const outline = [];
            const container = document.querySelector(this.getResponseContainerSelector());
            if (!container) return outline;

            // 如果不需要用户提问，走原有逻辑
            if (!includeUserQueries) {
                const headingSelectors = [];
                for (let i = 1; i <= maxLevel; i++) {
                    headingSelectors.push(`h${i}`);
                }

                const headings = container.querySelectorAll(headingSelectors.join(', '));
                headings.forEach((heading) => {
                    const level = parseInt(heading.tagName.charAt(1), 10);
                    if (level <= maxLevel) {
                        outline.push({
                            level,
                            text: heading.textContent.trim(),
                            element: heading,
                        });
                    }
                });

                return outline;
            }

            // 开启用户提问分组模式：按 DOM 顺序遍历
            const userQuerySelector = this.getUserQuerySelector();
            const headingSelectors = [];
            for (let i = 1; i <= maxLevel; i++) {
                headingSelectors.push(`h${i}`);
            }

            // 构建合并选择器
            const combinedSelector = `${userQuerySelector}, ${headingSelectors.join(', ')}`;

            // 使用 querySelectorAll 按 DOM 顺序获取所有匹配元素
            const allElements = container.querySelectorAll(combinedSelector);

            allElements.forEach((element) => {
                const tagName = element.tagName.toLowerCase();

                if (tagName === 'user-query') {
                    // 提取用户提问文本
                    let queryText = this.extractUserQueryText(element);

                    // 截断长文本（最多 30 字符）
                    let isTruncated = false;
                    if (queryText.length > 30) {
                        queryText = queryText.substring(0, 30) + '...';
                        isTruncated = true;
                    }

                    // 添加用户提问节点（即使没有后续标题也显示）
                    outline.push({
                        level: 0,
                        text: queryText,
                        element: element,
                        isUserQuery: true,
                        isTruncated: isTruncated,
                    });
                } else if (/^h[1-6]$/.test(tagName)) {
                    // 标题元素
                    const level = parseInt(tagName.charAt(1), 10);
                    if (level <= maxLevel) {
                        outline.push({
                            level,
                            text: element.textContent.trim(),
                            element: element,
                        });
                    }
                }
            });

            return outline;
        }

        /**
         * 检测 AI 是否正在生成响应
         * Gemini 标准版：检查输入框右下角是否显示停止图标
         * @returns {boolean}
         */
        isGenerating() {
            // 检查是否存在 fonticon="stop" 的 mat-icon（停止按钮）
            const stopIcon = document.querySelector('mat-icon[fonticon="stop"]');
            return stopIcon && stopIcon.offsetParent !== null;
        }

        /**
         * 获取当前使用的模型名称
         * Gemini 标准版：从页面 UI 中提取模型名称
         * @returns {string|null}
         */
        getModelName() {
            // 从 .input-area-switch-label 的第一个 span 获取模型名称
            const switchLabel = document.querySelector('.input-area-switch-label');
            if (switchLabel) {
                const firstSpan = switchLabel.querySelector('span');
                if (firstSpan && firstSpan.textContent) {
                    const text = firstSpan.textContent.trim();
                    if (text.length > 0 && text.length <= 20) {
                        return text;
                    }
                }
            }
            return null;
        }

        // ============= 网络监控配置（用于后台任务完成检测） =============

        /**
         * Gemini 普通版的网络监控配置
         * 由于浏览器对后台标签页的 DOM 渲染节流，需要通过 Hook Fetch 从网络层检测任务完成
         */
        getNetworkMonitorConfig() {
            return {
                // 注意：不要使用 batchexecute，它是通用 RPC 方法，会在后台频繁调用
                urlPatterns: ['BardFrontendService', 'StreamGenerate'],
                silenceThreshold: 3000,
            };
        }

        // ============= 模型锁定配置 =============
        getDefaultLockSettings() {
            return { enabled: false, keyword: '' };
        }

        getModelSwitcherConfig(keyword) {
            return {
                targetModelKeyword: keyword,
                // 尝试匹配 Gemini 普通版的模型选择器
                selectorButtonSelectors: ['.input-area-switch-label', '.model-selector', '[data-test-id="model-selector"]', '[aria-label*="model"]', 'button[aria-haspopup="menu"]'],
                menuItemSelector: '.mode-title, [role="menuitem"], [role="option"]',
                checkInterval: 1000,
                maxAttempts: 15,
                menuRenderDelay: 300,
            };
        }
    }

    /**
     * Gemini Business 适配器（business.gemini.google）
     */
    class GeminiBusinessAdapter extends SiteAdapter {
        match() {
            return window.location.hostname.includes('business.gemini.google');
        }

        getSiteId() {
            return 'gemini-business';
        }

        getName() {
            return 'Enterprise';
        }

        getThemeColors() {
            return { primary: '#4285f4', secondary: '#34a853' };
        }

        getNewTabUrl() {
            return 'https://business.gemini.google';
        }

        supportsTabRename() {
            return true;
        }

        isNewConversation() {
            return !window.location.pathname.includes('/session/');
        }

        /**
         * 获取当前会话名称（用于标签页重命名）
         * 从 Shadow DOM 中的侧边栏获取当前活动会话的标题
         * @returns {string|null}
         */
        getSessionName() {
            // DOMToolkit 在 Shadow DOM 穿透时，复杂后代选择器可能不生效
            // 所以遍历所有会话，找到活动的那个
            const conversations = DOMToolkit.query('.conversation', { all: true, shadow: true });

            for (const conv of conversations) {
                const button = conv.querySelector('button.list-item') || conv.querySelector('button');
                if (!button) continue;

                // 检查是否为活动会话
                const isActive = button.classList.contains('selected') || button.classList.contains('active') || button.getAttribute('aria-selected') === 'true';

                if (isActive) {
                    const titleEl = button.querySelector('.conversation-title');
                    if (titleEl) {
                        const name = titleEl.textContent?.trim();
                        if (name) return name;
                    }
                }
            }

            // 回退到基类默认实现（从 document.title 提取）
            return super.getSessionName();
        }

        /**
         * 获取当前的团队
         */
        getCurrentCid() {
            const currentPath = window.location.pathname;
            const cidMatch = currentPath.match(/\/home\/cid\/([^\/]+)/);
            return cidMatch ? cidMatch[1] : '';
        }

        /**
         * 从侧边栏提取会话列表
         * @returns {Array<{id: string, title: string, url: string, isActive: boolean}>}
         */
        getConversationList() {
            // 1. 获取当前 Team ID (CID)
            let cid = this.getCurrentCid();

            // 2. 查找会话列表
            // 注意：DOMToolkit 在 Shadow DOM 穿透时，后代选择器可能不生效
            // 所以使用简单选择器 + 后续过滤来排除智能体
            const items = DOMToolkit.query('.conversation', { all: true, shadow: true });

            return Array.from(items)
                .map((el) => {
                    // 注意：DOMToolkit.query 使用 parent 参数，不是 root
                    const button = el.querySelector('button.list-item') || el.querySelector('button');
                    if (!button) return null;

                    // 从操作菜单按钮 ID 提取 Session ID
                    // 会话格式: menu-8823153884416423953 (纯数字)
                    // 智能体格式: menu-deep_research (包含字母/下划线)
                    const menuBtn = button.querySelector('.conversation-action-menu-button');
                    let id = '';
                    if (menuBtn && menuBtn.id && menuBtn.id.startsWith('menu-')) {
                        id = menuBtn.id.replace('menu-', '');
                    }

                    // 关键过滤：真正的会话 ID 是纯数字，智能体 ID 包含字母
                    // 例如：会话 ID = "452535969834780805"，智能体 ID = "deep_research"
                    if (!id || !/^\d+$/.test(id)) return null;

                    // 获取标题
                    const titleEl = button.querySelector('.conversation-title');
                    const title = titleEl ? titleEl.textContent.trim() : '';

                    const isActive = button.classList.contains('selected') || button.classList.contains('active') || button.getAttribute('aria-selected') === 'true';

                    // 构建完整 URL
                    // 格式: https://business.gemini.google/home/cid/{cid}/r/session/{id}
                    let url = `https://business.gemini.google/session/${id}`; // 默认(如果没 cid)
                    if (cid) {
                        url = `https://business.gemini.google/home/cid/${cid}/r/session/${id}`;
                    }

                    return {
                        id: id,
                        title: title,
                        url: url,
                        isActive: isActive,
                        cid: cid,
                    };
                })
                .filter((c) => c); // 过滤掉 null
        }

        /**
         * 获取侧边栏可滚动容器
         * @returns {Element|null}
         */
        getSidebarScrollContainer() {
            return DOMToolkit.query('.conversation-list', { shadow: true }) || DOMToolkit.query('mat-sidenav', { shadow: true });
        }

        /**
         * 获取主内容区滚动容器 (Gemini Business)
         * 重写基类方法，避免与侧边栏混淆
         * @returns {HTMLElement}
         */
        getScrollContainer() {
            // 使用 .chat-mode-scroller 精确选择器，排除侧边栏
            const container = DOMToolkit.query('.chat-mode-scroller', { shadow: true });

            if (container && container.scrollHeight > container.clientHeight) {
                return container;
            }

            // 回退到基类
            return super.getScrollContainer();
        }

        /**
         * 获取会话观察器配置（用于侧边栏实时监听）
         */
        getConversationObserverConfig() {
            const self = this;
            return {
                selector: '.conversation',
                shadow: true,
                extractInfo: (el) => {
                    const button = el.querySelector('button.list-item') || el.querySelector('button');
                    if (!button) return null;

                    const menuBtn = button.querySelector('.conversation-action-menu-button');
                    if (!menuBtn || !menuBtn.id?.startsWith('menu-')) return null;

                    const id = menuBtn.id.replace('menu-', '');
                    if (!/^\d+$/.test(id)) return null; // 排除智能体

                    const titleEl = button.querySelector('.conversation-title');
                    const title = titleEl?.textContent?.trim() || '';

                    const cid = self.getCurrentCid();
                    let url = `https://business.gemini.google/home/cid/${cid}/r/session/${id}`;

                    return { id, title, url, cid };
                },
                getTitleElement: (el) => {
                    const button = el.querySelector('button.list-item') || el.querySelector('button');
                    return button?.querySelector('.conversation-title') || el;
                },
            };
        }

        /**
         * 加载所有会话
         * 通过点击"展开"按钮来加载更多会话，而不是滚动
         * @returns {Promise<void>}
         */
        async loadAllConversations() {
            let expandedCount = 0;
            const maxIterations = 20; // 防止无限循环

            for (let i = 0; i < maxIterations; i++) {
                // 查找所有按钮（穿透 Shadow DOM）
                const allBtns = DOMToolkit.query('button.show-more', { all: true, shadow: true }) || [];

                // 过滤出未展开的按钮（icon 没有 more-visible class）
                const expandBtns = allBtns.filter((btn) => {
                    const icon = btn.querySelector('.show-more-icon');
                    // 已展开的按钮 icon 有 more-visible class
                    return icon && !icon.classList.contains('more-visible');
                });

                if (expandBtns.length === 0) {
                    break; // 没有更多需要展开的按钮
                }

                // 点击所有展开按钮
                for (const btn of expandBtns) {
                    btn.click();
                    expandedCount++;
                }

                // 等待会话加载
                await new Promise((r) => setTimeout(r, 300));
            }

            if (expandedCount > 0) {
                console.log(`[GeminiBusinessAdapter] 展开了 ${expandedCount} 个会话分组`);
            }
        }

        // 排除侧边栏 (mat-sidenav, mat-drawer) 中的 Shadow DOM
        shouldInjectIntoShadow(host) {
            return !(host.closest('mat-sidenav') || host.closest('mat-drawer') || host.closest('[class*="bg-sidebar"]'));
        }

        getNewChatButtonSelectors() {
            return ['.chat-button.list-item', 'button[aria-label="New chat"]', 'button[aria-label="新对话"]'];
        }

        getWidthSelectors() {
            // 辅助函数：生成带 scoped globalSelector 的配置
            // noCenter: 不添加 margin-left/right: auto（用于容器类元素）
            const config = (selector, value, extraCss, noCenter = false) => ({
                selector,
                globalSelector: `mat-sidenav-content ${selector}`, // 全局样式只针对主内容区
                property: 'max-width',
                value,
                extraCss,
                noCenter,
            });

            return [
                // 容器强制 100%，不需要居中（它们应该填充可用空间）
                config('mat-sidenav-content', '100%', undefined, true),
                config('.main.chat-mode', '100%', undefined, true),

                // 内容区域跟随配置（需要居中）
                config('ucs-summary'),
                config('ucs-conversation'),
                config('ucs-search-bar'),
                config('.summary-container.expanded'),
                config('.conversation-container'),

                // 输入框容器：不居中，使用 left/right 定位
                config('.input-area-container', undefined, 'left: 0 !important; right: 0 !important;', true),
            ];
        }

        getTextareaSelectors() {
            return ['div.ProseMirror', '.ProseMirror', '[contenteditable="true"]:not([type="search"])', '[role="textbox"]', 'textarea:not([type="search"])'];
        }

        getSubmitButtonSelectors() {
            return ['button[aria-label*="Submit"]', 'button[aria-label*="提交"]', '.send-button', '[data-testid*="send"]'];
        }

        isValidTextarea(element) {
            // 排除搜索框
            if (element.type === 'search') return false;
            if (element.classList.contains('main-input')) return false;
            if (element.getAttribute('aria-label')?.includes('搜索')) return false;
            if (element.placeholder?.includes('搜索')) return false;
            // 排除脚本自己的 UI
            if (element.classList.contains('prompt-search-input')) return false;
            if (element.id === 'prompt-search') return false;
            if (element.closest('#gemini-helper-panel')) return false;

            // 必须是 contenteditable 或者 ProseMirror
            const isVisible = element.offsetParent !== null;
            const isContentEditable = element.getAttribute('contenteditable') === 'true';
            const isProseMirror = element.classList.contains('ProseMirror');
            return isVisible && (isContentEditable || isProseMirror || element.tagName === 'TEXTAREA');
        }

        findTextarea() {
            // 使用 DOMToolkit.query + filter 在 Shadow DOM 中查找
            // filter 参数实现了 isValidTextarea 的验证逻辑
            const element = DOMToolkit.query(this.getTextareaSelectors(), {
                shadow: true,
                filter: (el) => this.isValidTextarea(el),
            });

            if (element) {
                this.textarea = element;
                return element;
            }
            return super.findTextarea();
        }

        insertPrompt(content) {
            return new Promise((resolve) => {
                const tryInsert = () => {
                    // 重新获取一下，以防切页面后元素失效
                    const editor = this.textarea || this.findTextarea();

                    if (!editor) {
                        console.warn('GeminiBusinessAdapter: Editor not found during insert.');
                        resolve(false);
                        return;
                    }

                    this.textarea = editor; // 更新引用
                    editor.click();
                    editor.focus();

                    // 等待一小段时间后尝试插入
                    setTimeout(() => {
                        try {
                            // 先全选
                            document.execCommand('selectAll', false, null);
                            // 插入新内容
                            const success = document.execCommand('insertText', false, content);
                            if (!success) throw new Error('execCommand returned false');
                            resolve(true);
                        } catch (e) {
                            // 方法2: 直接操作 DOM (降级方案)
                            let p = editor.querySelector('p');
                            if (!p) {
                                p = document.createElement('p');
                                editor.appendChild(p);
                            }

                            p.textContent = content;

                            // 触发各种事件以通知 ProseMirror 更新
                            const inputEvent = new InputEvent('input', {
                                bubbles: true,
                                cancelable: true,
                                inputType: 'insertText',
                                data: content,
                            });
                            editor.dispatchEvent(inputEvent);
                            editor.dispatchEvent(new Event('change', { bubbles: true }));

                            // 尝试触发 keyup 事件
                            editor.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                            resolve(true);
                        }
                    }, 100);
                };

                if (this.textarea && document.body.contains(this.textarea)) {
                    tryInsert();
                } else {
                    // 轮询等待元素出现
                    let attempts = 0;
                    const maxAttempts = 15;
                    const checkInterval = setInterval(() => {
                        attempts++;
                        if (this.findTextarea()) {
                            clearInterval(checkInterval);
                            tryInsert();
                        } else if (attempts >= maxAttempts) {
                            clearInterval(checkInterval);
                            resolve(false);
                        }
                    }, 500);
                }
            });
        }

        clearTextarea() {
            if (!this.textarea) return;

            // 验证元素仍在 DOM 中
            if (!this.textarea.isConnected) {
                this.textarea = null;
                return;
            }

            this.textarea.focus();
            // Shadow DOM 场景：不做严格的焦点检查，只检查元素是否仍在 DOM 中
            // isConnected 已经检查过，直接执行

            document.execCommand('selectAll', false, null);
            // 插入零宽空格替换旧内容（修复中文输入首字母问题）
            document.execCommand('insertText', false, '\u200B');
        }

        // 普通清空（不插入零宽字符）
        clearTextareaNormal() {
            if (!this.textarea) return;

            // 验证元素仍在 DOM 中
            if (!this.textarea.isConnected) {
                this.textarea = null;
                return;
            }

            this.textarea.focus();
            // Shadow DOM 场景：不做严格的焦点检查，只检查元素是否仍在 DOM 中
            // isConnected 已经检查过，直接执行

            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
        }

        afterPropertiesSet(options = {}) {
            // 保存配置状态供其他方法使用
            this.clearOnInit = options.clearOnInit;

            // 1. 调用基类通用逻辑（处理模型锁定）
            super.afterPropertiesSet(options);

            // 2. 处理企业版特有的初始化清除（如果未启用模型锁定或模型已锁定，这里先执行一次以防万一）
            // 注意：如果 trigger 了 lockModel，lockModel 回调里会再次执行。
            if (this.clearOnInit) {
                this.clearTextarea();
            }
        }

        // 覆盖 lockModel 以处理锁定后的清理
        lockModel(keyword, onSuccess = null) {
            super.lockModel(keyword, () => {
                // 执行传入的回调
                if (onSuccess) onSuccess();

                // 执行企业版特定的清理：锁定模型后，重新插入零宽字符修复中文输入
                // 这里的延迟是为了等待 UI 刷新（切换模型会导致输入框重建或重置）
                if (this.clearOnInit) {
                    setTimeout(() => this.clearTextarea(), 300);
                }
            });
        }

        /**
         * 检测 AI 是否正在生成响应
         * Gemini Business：检查 Shadow DOM 中的 "Stop" 按钮或 loading 指示器
         * @returns {boolean}
         */
        isGenerating() {
            // 递归在 Shadow DOM 中搜索
            const findInShadow = (root, depth = 0) => {
                if (depth > 10) return false;

                // 检查当前层级
                const stopButton = root.querySelector('button[aria-label*="Stop"], button[aria-label*="停止"], ' + '[data-test-id="stop-button"], .stop-button, md-icon-button[aria-label*="Stop"]');
                if (stopButton && stopButton.offsetParent !== null) {
                    return true;
                }

                const spinner = root.querySelector('mat-spinner, md-spinner, .loading-spinner, [role="progressbar"], ' + '.generating-indicator, .response-loading');
                if (spinner && spinner.offsetParent !== null) {
                    return true;
                }

                // 递归搜索 Shadow DOM
                const elements = root.querySelectorAll('*');
                for (const el of elements) {
                    if (el.shadowRoot) {
                        if (findInShadow(el.shadowRoot, depth + 1)) {
                            return true;
                        }
                    }
                }
                return false;
            };

            return findInShadow(document);
        }

        /**
         * 获取当前使用的模型名称
         * Gemini Business：从 Shadow DOM 中提取模型名称
         * @returns {string|null}
         */
        getModelName() {
            // 递归在 Shadow DOM 中搜索模型选择器
            const findInShadow = (root, depth = 0) => {
                if (depth > 10) return null;

                // 检查模型选择器
                const modelSelectors = ['#model-selector-menu-anchor', '.action-model-selector', '.model-selector', '[data-test-id="model-selector"]', '.current-model'];

                for (const selector of modelSelectors) {
                    const el = root.querySelector(selector);
                    if (el && el.textContent) {
                        const text = el.textContent.trim();
                        // 提取模型关键字（支持带版本号的如"2.5 Pro"，也支持不带版本号的如"自动"）
                        const modelMatch = text.match(/(\d+\.?\d*\s*)?(Pro|Flash|Ultra|Nano|Gemini|auto|自动)/i);
                        if (modelMatch) {
                            return modelMatch[0].trim();
                        }
                        if (text.length <= 20 && text.length > 0) {
                            return text;
                        }
                    }
                }

                // 递归搜索 Shadow DOM
                const elements = root.querySelectorAll('*');
                for (const el of elements) {
                    if (el.shadowRoot) {
                        const result = findInShadow(el.shadowRoot, depth + 1);
                        if (result) return result;
                    }
                }
                return null;
            };

            return findInShadow(document);
        }

        // ============= 模型锁定配置 =============

        getDefaultLockSettings() {
            return { enabled: true, keyword: '3 Pro' };
        }

        getModelSwitcherConfig(keyword) {
            return {
                targetModelKeyword: keyword || '3 Pro',
                selectorButtonSelectors: ['#model-selector-menu-anchor', '.action-model-selector'],
                menuItemSelector: 'md-menu-item',
                checkInterval: 1500,
                maxAttempts: 20,
                menuRenderDelay: 500,
            };
        }

        getResponseContainerSelector() {
            // Gemini Business 使用 Shadow DOM，返回空字符串表示需要特殊处理
            return '';
        }

        getChatContentSelectors() {
            return [
                '.model-response-container',
                '.message-content',
                '[data-message-id]', // 常见消息标识
                'ucs-conversation-message', // 企业版特定
                '.conversation-message',
            ];
        }

        /**
         * 获取导出配置
         * Gemini Business 使用 Shadow DOM，需要特殊处理
         */
        getExportConfig() {
            return {
                userQuerySelector: '.question-block',
                assistantResponseSelector: 'ucs-summary',
                turnSelector: '.turn',
                useShadowDOM: true,
                // 自定义提取函数（因为 Shadow DOM 嵌套结构复杂）
                extractUserText: (el) => this.extractUserQueryText(el),
                extractAssistantContent: (el) => this.extractSummaryContent(el),
            };
        }

        /**
         * 从 ucs-summary 元素中提取可用于 htmlToMarkdown 的 DOM 元素
         * Gemini Business 使用多层 Shadow DOM，需要递归查找
         * @param {Element} ucsSummary - ucs-summary 元素
         * @returns {Element|null} - 可用于 htmlToMarkdown 的 DOM 元素
         */
        extractSummaryContent(ucsSummary) {
            // 递归在 Shadow DOM 中查找 .markdown-document
            const findMarkdownDocument = (root, depth = 0) => {
                if (depth > 10 || !root) return null;

                // 如果 root 本身有 shadowRoot，先进入它
                const shadowRoot = root.shadowRoot || (root.nodeType === 11 ? root : null);
                const searchRoot = shadowRoot || root;

                // 在当前层级查找 .markdown-document
                if (searchRoot.querySelector) {
                    const markdownDoc = searchRoot.querySelector('.markdown-document');
                    if (markdownDoc) return markdownDoc;
                }

                // 递归搜索子元素的 Shadow DOM
                const elements = searchRoot.querySelectorAll?.('*') || [];
                for (const el of elements) {
                    if (el.shadowRoot) {
                        const found = findMarkdownDocument(el.shadowRoot, depth + 1);
                        if (found) return found;
                    }
                }

                return null;
            };

            return findMarkdownDocument(ucsSummary);
        }

        /**
         * 获取用户提问元素的选择器
         * Gemini Business: .question-block 是用户提问的容器
         */
        getUserQuerySelector() {
            return '.question-block';
        }

        /**
         * 从用户提问元素中提取文本
         * Gemini Business: 文本在 ucs-fast-markdown 的 Shadow DOM 中
         * @param {Element} element .question-block 元素
         * @returns {string}
         */
        extractUserQueryText(element) {
            // 查找 ucs-fast-markdown 元素
            const markdown = element.querySelector('ucs-fast-markdown');
            if (!markdown || !markdown.shadowRoot) {
                return element.textContent?.trim() || '';
            }

            // 在 Shadow DOM 中查找完整文本
            // 结构: <div><div class="markdown-document"><p><span>文本</span></p>...</div></div>
            // 注意：用户问题可能包含多个 <p> 段落，需要获取所有文本
            const markdownDoc = markdown.shadowRoot.querySelector('.markdown-document');
            if (markdownDoc) {
                return markdownDoc.textContent?.trim() || '';
            }

            return element.textContent?.trim() || '';
        }

        /**
         * 从页面提取大纲（标题列表）
         * @param {number} maxLevel 最大标题级别 (1-6)
         * @param {boolean} includeUserQueries 是否包含用户提问
         * @returns {Array<{level: number, text: string, element: Element|null, isUserQuery?: boolean}>}
         */
        extractOutline(maxLevel = 6, includeUserQueries = false) {
            const outline = [];

            if (!includeUserQueries) {
                // 原有逻辑：只提取标题
                this.findHeadingsInShadowDOM(document, outline, maxLevel, 0);
                return outline;
            }

            // 开启用户提问分组模式
            // 策略：按轮次遍历。结构为 ucs-conversation -> shadowRoot -> .main -> .turn
            // 每个 .turn 包含 .question-block（用户提问）和 ucs-summary（AI 回复）

            // 1. 找到 ucs-conversation 元素
            const ucsConversation = DOMToolkit.query('ucs-conversation', { shadow: true });
            if (!ucsConversation || !ucsConversation.shadowRoot) {
                // 回退：如果找不到 ucs-conversation，使用原有逻辑
                this.findHeadingsInShadowDOM(document, outline, maxLevel, 0);
                return outline;
            }

            // 2. 在 ucs-conversation 的 Shadow Root 中查找 .main 下的所有 .turn
            const main = ucsConversation.shadowRoot.querySelector('.main');
            if (!main) {
                this.findHeadingsInShadowDOM(document, outline, maxLevel, 0);
                return outline;
            }

            const turnContainers = main.querySelectorAll('.turn');

            // 3. 遍历每个轮次
            turnContainers.forEach((turn) => {
                // 3.1 在轮次中查找用户提问 (.question-block)
                const questionBlock = turn.querySelector('.question-block');
                if (questionBlock) {
                    let queryText = this.extractUserQueryText(questionBlock);
                    let isTruncated = false;
                    if (queryText.length > 30) {
                        queryText = queryText.substring(0, 30) + '...';
                        isTruncated = true;
                    }
                    outline.push({
                        level: 0,
                        text: queryText,
                        element: questionBlock,
                        isUserQuery: true,
                        isTruncated: isTruncated,
                    });
                }

                // 3.2 在轮次的 ucs-summary 中查找标题（递归进入 Shadow DOM）
                const ucsSummary = turn.querySelector('ucs-summary');
                if (ucsSummary) {
                    const turnHeadings = [];
                    this.findHeadingsInShadowDOM(ucsSummary, turnHeadings, maxLevel, 0);
                    turnHeadings.forEach((h) => outline.push(h));
                }
            });

            return outline;
        }

        // 在 Shadow DOM 中递归查找标题
        findHeadingsInShadowDOM(root, outline, maxLevel, depth) {
            if (depth > 15) return;

            // 如果传入的是一个有 shadowRoot 的元素（如 ucs-summary），先进入其 Shadow Root
            if (root.shadowRoot) {
                this.findHeadingsInShadowDOM(root.shadowRoot, outline, maxLevel, depth);
                return; // 已经在 shadowRoot 中递归，不需要再处理 root 本身
            }

            // 在当前层级查找标题（h1-h6）
            if (root !== document) {
                const headingSelector = Array.from({ length: maxLevel }, (_, i) => `h${i + 1}`).join(', ');
                try {
                    const headings = root.querySelectorAll(headingSelector);
                    headings.forEach((heading) => {
                        // 只匹配包含 data-markdown-start-index 的标题（排除 logo 等非 AI 回复内容）
                        // 标题内可能包含多个 span，需要遍历所有 span 并拼接文本
                        const spans = heading.querySelectorAll('span[data-markdown-start-index]');
                        if (spans.length > 0) {
                            const level = parseInt(heading.tagName[1], 10);
                            const text = Array.from(spans)
                                .map((s) => s.textContent.trim())
                                .join('');
                            if (text) {
                                outline.push({ level, text, element: heading });
                            }
                        }
                    });
                } catch (e) {
                    // 忽略选择器错误
                }
            }

            // 递归查找 Shadow DOM
            const allElements = root.querySelectorAll('*');
            for (const el of allElements) {
                if (el.shadowRoot) {
                    this.findHeadingsInShadowDOM(el.shadowRoot, outline, maxLevel, depth + 1);
                }
            }
        }

        /**
         * 模拟点击原生设置切换主题 (针对 Gemini Business)
         * @param {'light'|'dark'} targetMode
         */
        async toggleTheme(targetMode) {
            console.log(`[GeminiBusinessAdapter] Attempting to switch theme to: ${targetMode}`);

            // 1. 启动暴力隐身模式 (JS 每一帧强制隐藏)
            // CSS 注入可能因优先级或 Shadow DOM 隔离失效，JS 强制修改内联样式是最稳妥的
            let stopSuppression = false;
            const suppressMenu = () => {
                if (stopSuppression) return;

                // 查找所有可能的菜单容器
                try {
                    const menus = DOMToolkit.query('.menu[popover], md-menu-surface, .mat-menu-panel, [role="menu"]', {
                        all: true,
                        shadow: true,
                    });
                    menus.forEach((el) => {
                        // 强制隐藏，不留余地
                        if (el.style.opacity !== '0') {
                            el.style.setProperty('opacity', '0', 'important');
                            el.style.setProperty('visibility', 'hidden', 'important');
                            el.style.setProperty('pointer-events', 'none', 'important');
                        }
                    });
                } catch (e) {
                    // Ignore errors during suppression
                }

                requestAnimationFrame(suppressMenu);
            };
            suppressMenu();

            // 全局也加一个保险
            document.body.classList.add('gh-stealth-mode');

            try {
                // 2. 找到并点击设置按钮
                const settingsBtn = DOMToolkit.query('#settings-menu-anchor', { shadow: true });

                if (!settingsBtn) {
                    console.error('[GeminiBusinessAdapter] Settings button not found (#settings-menu-anchor)');
                    const fallbackBtn = DOMToolkit.query('.setting-btn', { shadow: true });
                    if (fallbackBtn) {
                        if (typeof fallbackBtn.click === 'function') fallbackBtn.click();
                        else
                            fallbackBtn.dispatchEvent(
                                new MouseEvent('click', {
                                    bubbles: true,
                                    cancelable: true,
                                    view: window,
                                }),
                            );
                    } else {
                        return false;
                    }
                } else {
                    if (typeof settingsBtn.click === 'function') {
                        settingsBtn.click();
                    } else {
                        settingsBtn.dispatchEvent(
                            new MouseEvent('click', {
                                bubbles: true,
                                cancelable: true,
                                view: window,
                            }),
                        );
                    }
                }

                // 3. 等待菜单弹出并点击目标
                let attempts = 0;
                const findAndClickOption = () => {
                    const targetIcon = targetMode === 'dark' ? 'dark_mode' : 'light_mode';

                    // Query all md-primary-tab in the document
                    const tabs = DOMToolkit.query('md-primary-tab', { all: true, shadow: true });

                    for (const tab of tabs) {
                        const icon =
                            tab.querySelector('md-icon') ||
                            DOMToolkit.query('md-icon', {
                                root: tab,
                                shadow: true,
                            });
                        if (icon && icon.textContent.trim() === targetIcon) {
                            console.log(`[GeminiBusinessAdapter] Found target option: ${targetIcon}`);
                            tab.click();
                            return true;
                        }
                    }
                    return false;
                };

                return await new Promise((resolve) => {
                    const interval = setInterval(() => {
                        attempts++;
                        if (findAndClickOption()) {
                            clearInterval(interval);
                            resolve(true);
                        } else if (attempts > 20) {
                            // Timeout 2s
                            clearInterval(interval);
                            console.error('[GeminiBusinessAdapter] Target theme option not found');
                            resolve(false);
                            // Try clicking settings again to close if failed
                            if (settingsBtn && typeof settingsBtn.click === 'function') settingsBtn.click();
                        }
                    }, 100);
                });
            } finally {
                // 停止暴力抑制
                stopSuppression = true;
                // 延迟移除隐身模式
                setTimeout(() => {
                    document.body.classList.remove('gh-stealth-mode');
                }, 200);
            }
        }
    }

    /**
     * 标签页重命名管理器
     * 根据当前对话名称自动更新浏览器标签页标题
     */
    class TabRenameManager {
        constructor(adapter, settings, i18nFunc = null) {
            this.adapter = adapter;
            this.settings = settings;
            this.t = i18nFunc || ((key) => key);
            this.lastSessionName = null;
            this.intervalId = null;
            this.networkMonitor = null;
            this.isRunning = false;

            // AI 生成状态（简化的状态机）
            // 'idle' | 'generating' | 'completed'
            this._aiState = 'idle';
            this._lastAiState = 'idle';

            // 用户是否在前台看到过生成完成（用于避免误发通知）
            this._userSawCompletion = false;
            this._boundVisibilityHandler = this._onVisibilityChange.bind(this);
        }

        /**
         * 启动自动重命名
         */
        start() {
            if (this.isRunning) return;
            if (!this.adapter.supportsTabRename()) return;

            this.isRunning = true;
            this.updateTabName();

            // 启动网络监控（用于后台检测）
            this._networkConfig = this.adapter.getNetworkMonitorConfig?.();
            if (typeof NetworkMonitor !== 'undefined' && this._networkConfig) {
                this._initNetworkMonitor();
                // 监听页面可见性变化，用于追踪用户是否看到完成状态
                document.addEventListener('visibilitychange', this._boundVisibilityHandler);
            }

            // 定时更新标签页标题
            const intervalMs = (this.settings.tabSettings?.renameInterval || 5) * 1000;
            this.intervalId = setInterval(() => this.updateTabName(), intervalMs);
        }

        /**
         * 初始化网络监控
         */
        _initNetworkMonitor() {
            if (this.networkMonitor || !this._networkConfig) return;

            this.networkMonitor = new NetworkMonitor({
                urlPatterns: this._networkConfig.urlPatterns,
                silenceThreshold: this._networkConfig.silenceThreshold || 3000,
                onStart: () => this._setAiState('generating'),
                onComplete: () => this._onAiComplete(),
            });
            this.networkMonitor.start();
        }

        /**
         * 设置 AI 状态
         */
        _setAiState(state) {
            this._lastAiState = this._aiState;
            this._aiState = state;
        }

        /**
         * 页面可见性变化处理
         * 用于追踪用户是否在前台看到过生成完成
         */
        _onVisibilityChange() {
            // 用户切换页面时（无论进入还是离开），检查 DOM 状态
            // 如果正在生成但 DOM 显示已完成，说明用户看到了完成状态
            if (this._aiState === 'generating' && !this.adapter.isGenerating()) {
                this._userSawCompletion = true;
            }
        }

        /**
         * AI 任务完成处理（由 NetworkMonitor 触发）
         */
        _onAiComplete() {
            const wasGenerating = this._aiState === 'generating';
            this._setAiState('completed');

            // 检查是否应当发送通知
            // 1. 必须是从生成状态完成
            // 2. 用户没有在前台看到过完成状态
            // 3. 要么在后台，要么开启了「前台时也通知」
            const notifyWhenFocused = this.settings.tabSettings?.notifyWhenFocused;
            const shouldNotify = wasGenerating && !this._userSawCompletion && (document.hidden || notifyWhenFocused);
            if (shouldNotify) {
                this._sendCompletionNotification();
            }

            // 重置状态
            this._userSawCompletion = false;

            // 强制更新标签页标题
            this.updateTabName(true);
        }

        /**
         * 发送完成通知
         */
        _sendCompletionNotification() {
            const tabSettings = this.settings.tabSettings || {};

            if (tabSettings.showNotification && typeof GM_notification !== 'undefined') {
                GM_notification({
                    title: this.t('notificationTitle').replace('{site}', this.adapter.getName()),
                    text: this.lastSessionName || this.t('notificationBody'),
                    timeout: 5000,
                    highlight: true,
                    silent: true, // 禁用系统通知声音，由"通知声音"开关单独控制
                    onclick: () => window.focus(),
                });
            }

            // 播放通知声音（独立于桌面通知，即时生效无需刷新）
            if (tabSettings.notificationSound) {
                this._playNotificationSound();
            }

            if (tabSettings.autoFocus) {
                window.focus();
            }
        }

        /**
         * 播放通知声音
         * 使用 GM_xmlhttpRequest 绕过 CSP 限制
         */
        _playNotificationSound() {
            const SOUND_URL = 'https://v0.app/chat-static/assets/sfx/streaming-complete-v2.mp3';

            // 如果已有缓存的 Blob URL，直接播放
            if (this._notificationAudioBlobUrl) {
                this._playAudioFromUrl(this._notificationAudioBlobUrl);
                return;
            }

            // 首次：使用 GM_xmlhttpRequest 下载音频绕过 CSP
            if (typeof GM_xmlhttpRequest !== 'undefined') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: SOUND_URL,
                    responseType: 'blob',
                    onload: (response) => {
                        if (response.status === 200 && response.response) {
                            // 创建 Blob URL 并缓存
                            this._notificationAudioBlobUrl = URL.createObjectURL(response.response);
                            this._playAudioFromUrl(this._notificationAudioBlobUrl);
                        }
                    },
                    onerror: () => {
                        // 下载失败，静默处理
                    },
                });
            }
        }

        /**
         * 从 URL 播放音频
         */
        _playAudioFromUrl(url) {
            try {
                if (!this._notificationAudio) {
                    this._notificationAudio = new Audio();
                }
                // 使用用户设置的音量，默认 0.5
                const volume = this.settings.tabSettings?.notificationVolume ?? 0.5;
                this._notificationAudio.volume = Math.max(0.1, Math.min(1.0, volume));
                this._notificationAudio.src = url;
                this._notificationAudio.currentTime = 0;
                this._notificationAudio.play().catch(() => {
                    // 忽略播放失败
                });
            } catch (e) {
                // 忽略错误
            }
        }

        /**
         * 获取当前是否正在生成
         */
        _isGenerating() {
            // 如果已确认完成，返回 false
            if (this._aiState === 'completed') return false;
            // 否则结合网络状态和 DOM 检测
            return this._aiState === 'generating' || this.adapter.isGenerating();
        }

        /**
         * 停止网络监控
         */
        _stopNetworkMonitor() {
            if (this.networkMonitor) {
                this.networkMonitor.stop();
                this.networkMonitor = null;
            }
        }

        /**
         * 停止自动重命名
         */
        stop() {
            if (!this.isRunning) return;

            this.isRunning = false;

            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }

            // 移除可见性监听
            document.removeEventListener('visibilitychange', this._boundVisibilityHandler);

            this._stopNetworkMonitor();
        }

        /**
         * 更新检测频率
         */
        setInterval(intervalSeconds) {
            if (!this.isRunning) return;

            const intervalMs = intervalSeconds * 1000;
            if (this.intervalId) {
                clearInterval(this.intervalId);
            }
            this.intervalId = setInterval(() => this.updateTabName(), intervalMs);
        }

        /**
         * 切换隐私模式
         */
        togglePrivacyMode() {
            const tabSettings = this.settings.tabSettings || {};
            tabSettings.privacyMode = !tabSettings.privacyMode;
            this.settings.tabSettings = tabSettings;
            this.updateTabName(true);
            return tabSettings.privacyMode;
        }

        /**
         * 更新标签页名称
         */
        updateTabName(force = false) {
            if (!this.adapter.supportsTabRename()) return;

            const tabSettings = this.settings.tabSettings || {};

            // 隐私模式
            if (tabSettings.privacyMode) {
                document.title = tabSettings.privacyTitle || 'Google';
                return;
            }

            // 获取会话名称（防止读取被污染的 title）
            const sessionName = this._getCleanSessionName(tabSettings);

            // 检查生成状态
            const isGenerating = this._isGenerating();

            // DOM 检测的状态变更通知（仅用于没有网络监控的站点）
            if (this._lastAiState === 'generating' && !isGenerating && document.hidden && this._aiState !== 'completed') {
                this._sendCompletionNotification();
            }
            this._lastAiState = isGenerating ? 'generating' : 'idle';

            // 构建标题
            const statusPrefix = tabSettings.showStatus !== false ? (isGenerating ? '⏳ ' : '✅ ') : '';

            const format = tabSettings.titleFormat || '{status}{title}';
            const modelName = format.includes('{model}') ? this.adapter.getModelName() || '' : '';

            let finalTitle = format
                .replace('{status}', statusPrefix)
                .replace('{title}', sessionName || this.adapter.getName())
                .replace('{model}', modelName ? `[${modelName}] ` : '')
                .replace(/\s+/g, ' ')
                .trim();

            if (finalTitle && (force || finalTitle !== document.title)) {
                document.title = finalTitle;
            }
        }

        /**
         * 获取干净的会话名称（过滤被污染的标题）
         */
        _getCleanSessionName(tabSettings) {
            // 新对话页面：清除旧会话标题，避免使用之前的标题
            if (this.adapter.isNewConversation()) {
                this.lastSessionName = null;
                return null;
            }

            let sessionName = this.adapter.getSessionName();

            // 检测污染
            const isPolluted = (name) => {
                if (!name) return false;
                if (/^[⏳✅]/.test(name)) return true;
                if (/\[[\w\s.]+\]/.test(name)) return true;
                if (name === (tabSettings.privacyTitle || 'Google')) return true;
                return false;
            };

            // 如果获取到有效且非污染的标题，更新缓存并返回
            if (sessionName && !isPolluted(sessionName)) {
                this.lastSessionName = sessionName;
                return sessionName;
            }

            // 否则返回缓存的标题（可能为 null）
            return this.lastSessionName;
        }

        /**
         * 获取当前状态
         */
        isActive() {
            return this.isRunning;
        }
    }

    /**
     * 站点注册表
     * 管理所有站点适配器，提供统一的访问接口
     */
    class SiteRegistry {
        constructor() {
            this.adapters = [];
            this.currentAdapter = null;
        }

        // 注册适配器
        register(adapter) {
            this.adapters.push(adapter);
        }

        // 检测并返回匹配的适配器
        detect() {
            for (const adapter of this.adapters) {
                if (adapter.match()) {
                    this.currentAdapter = adapter;
                    return adapter;
                }
            }
            return null;
        }

        // 获取当前适配器
        getCurrent() {
            return this.currentAdapter;
        }
    }

    // ==================== 核心逻辑 ====================

    // HTML 创建函数 (使用 DOMToolkit)
    function createElement(tag, properties = {}, textContent = '') {
        return DOMToolkit.create(tag, properties, textContent);
    }

    // 清空元素内容 (使用 DOMToolkit)
    function clearElement(element) {
        DOMToolkit.clear(element);
    }

    /**
     * 全局 Toast 提示函数
     * @param {string} message 提示信息
     * @param {number} duration 显示时长 (ms)
     */
    function showToast(message, duration = 2000) {
        const existing = document.querySelector('.gemini-toast');
        if (existing) existing.remove();
        const toast = createElement('div', { className: 'gemini-toast' }, message);
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'toastSlideIn 0.3s reverse';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    /**
     * 页面宽度样式管理器
     * 负责动态注入和移除页面宽度样式，支持 Shadow DOM
     */
    class WidthStyleManager {
        constructor(siteAdapter, widthConfig) {
            this.siteAdapter = siteAdapter;
            this.widthConfig = widthConfig;
            this.styleElement = null;
            this.processedShadowRoots = new WeakSet();
            this.observer = null;
            this.shadowCheckInterval = null;
        }

        apply() {
            // 1. 处理主文档样式
            if (this.styleElement) {
                this.styleElement.remove();
                this.styleElement = null;
            }

            const css = this.generateCSS();

            if (this.widthConfig && this.widthConfig.enabled) {
                this.styleElement = document.createElement('style');
                this.styleElement.id = 'gemini-helper-width-styles';
                this.styleElement.textContent = css;
                document.head.appendChild(this.styleElement);

                // 启动 Shadow DOM 注入逻辑
                this.startShadowInjection(css);
            } else {
                // 如果禁用了，也要清理 Shadow DOM 中的样式
                this.stopShadowInjection();
                this.clearShadowStyles();
            }
        }

        generateCSS() {
            const globalWidth = `${this.widthConfig.value}${this.widthConfig.unit}`;
            const selectors = this.siteAdapter.getWidthSelectors();
            return selectors
                .map((config) => {
                    const { selector, globalSelector, property, value, extraCss, noCenter } = config;
                    const params = {
                        finalWidth: value || globalWidth,
                        targetSelector: globalSelector || selector, // 优先使用全局特定选择器
                        property,
                        extra: extraCss || '',
                        centerCss: noCenter ? '' : 'margin-left: auto !important; margin-right: auto !important;',
                    };
                    return `${params.targetSelector} { ${params.property}: ${params.finalWidth} !important; ${params.centerCss} ${params.extra} }`;
                })
                .join('\n');
        }

        updateConfig(widthConfig) {
            this.widthConfig = widthConfig;
            this.apply();
        }

        // ============= Shadow DOM 支持 =============

        startShadowInjection(css) {
            // Shadow CSS 需要重新生成，因为不能使用带 ancestor 的 globalSelector
            // Shadow DOM 内部必须使用原始 selector，但包含同样的样式规则
            const shadowCss = this.generateShadowCSS();

            // 立即执行一次全量检查
            this.injectToAllShadows(shadowCss);

            // 使用定时器定期检查
            if (this.shadowCheckInterval) clearInterval(this.shadowCheckInterval);
            this.shadowCheckInterval = setInterval(() => {
                this.injectToAllShadows(shadowCss);
            }, 1000);
        }

        generateShadowCSS() {
            const globalWidth = `${this.widthConfig.value}${this.widthConfig.unit}`;
            const selectors = this.siteAdapter.getWidthSelectors();
            return selectors
                .map((config) => {
                    const { selector, property, value, extraCss, noCenter } = config;
                    // Shadow DOM 中只使用原始 selector (不带父级限定)，靠 JS 过滤来保证安全
                    const finalWidth = value || globalWidth;
                    const extra = extraCss || '';
                    const centerCss = noCenter ? '' : 'margin-left: auto !important; margin-right: auto !important;';
                    return `${selector} { ${property}: ${finalWidth} !important; ${centerCss} ${extra} }`;
                })
                .join('\n');
        }

        stopShadowInjection() {
            if (this.shadowCheckInterval) {
                clearInterval(this.shadowCheckInterval);
                this.shadowCheckInterval = null;
            }
        }

        injectToAllShadows(css) {
            if (!document.body) return;

            const siteAdapter = this.siteAdapter;
            const processedShadowRoots = this.processedShadowRoots;

            // 使用 DOMToolkit.walkShadowRoots 遍历所有 Shadow Root
            DOMToolkit.walkShadowRoots((shadowRoot, host) => {
                // 检查是否应该注入到该 Shadow DOM（通过 Adapter 过滤，例如排除侧边栏）
                if (host && !siteAdapter.shouldInjectIntoShadow(host)) {
                    return;
                }

                // 使用 DOMToolkit.cssToShadow 注入样式
                DOMToolkit.cssToShadow(shadowRoot, css, 'gemini-helper-width-shadow-style');
                processedShadowRoots.add(shadowRoot);
            });
        }

        clearShadowStyles() {
            if (!document.body) return;

            const processedShadowRoots = this.processedShadowRoots;

            // 使用 DOMToolkit.walkShadowRoots 遍历所有 Shadow Root
            DOMToolkit.walkShadowRoots((shadowRoot) => {
                const style = shadowRoot.getElementById('gemini-helper-width-shadow-style');
                if (style) style.remove();
                processedShadowRoots.delete(shadowRoot);
            });
        }
    }

    // ==================== Markdown 渲染修复器 ====================
    /**
     * Markdown 加粗渲染修复器
     * 修复 Gemini 普通版响应中 **text** 未正确渲染为加粗的问题
     * 使用 DOM API 操作 TextNode
     */
    class MarkdownFixer {
        #processedNodes = new WeakSet();
        #stopObserver = null;
        #enabled = false;

        constructor() {}

        /**
         * 启动修复器
         * 1. 修复所有已存在的段落（历史消息）
         * 2. 监听新增的段落（新消息/流式输出）
         */
        start() {
            if (this.#enabled) return;
            this.#enabled = true;

            // 修复所有已存在的段落
            const paragraphs = DOMToolkit.query('message-content p', { all: true });
            paragraphs.forEach((p) => this.fixParagraph(p));

            // 监听新增的段落
            this.#stopObserver = DOMToolkit.each('message-content p', (p, isNew) => {
                if (isNew) this.fixParagraph(p);
            });
        }

        /**
         * 停止修复器
         */
        stop() {
            if (!this.#enabled) return;
            this.#enabled = false;
            if (this.#stopObserver) {
                this.#stopObserver();
                this.#stopObserver = null;
            }
        }

        /**
         * 修复单个段落
         * @param {HTMLElement} p 段落元素
         */
        fixParagraph(p) {
            if (this.#processedNodes.has(p)) return;
            this.#processedNodes.add(p);

            // 先尝试跨节点修复（处理 ** 跨越 <b> 标签的情况）
            this.fixCrossNodeBold(p);

            // 再处理单节点内的加粗（未被跨节点处理的部分）
            const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null, false);
            const nodesToProcess = [];

            while (walker.nextNode()) {
                const textNode = walker.currentNode;
                if (this.shouldSkip(textNode)) continue;
                if (textNode.textContent.includes('**')) {
                    nodesToProcess.push(textNode);
                }
            }

            nodesToProcess.forEach((node) => this.processTextNode(node));
        }

        /**
         * 修复跨节点加粗
         * 策略1：将 <b>text</b> 展开为 **text**
         * 策略2：处理 **<span>text</span>** 这种跨元素的加粗标记
         * @param {HTMLElement} p 段落元素
         */
        fixCrossNodeBold(p) {
            // 策略1: 查找段落中所有的 <b> 标签，展开为 **text**
            const boldTags = Array.from(p.querySelectorAll('b'));
            boldTags.forEach((bTag) => {
                // 跳过 code/pre 内的 <b> 标签
                if (this.isInsideProtectedArea(bTag)) return;

                try {
                    // 创建文档片段: ** + 原内容 + **
                    const fragment = document.createDocumentFragment();
                    fragment.appendChild(document.createTextNode('**'));

                    // 将 <b> 的所有子节点移到片段中
                    while (bTag.firstChild) {
                        fragment.appendChild(bTag.firstChild);
                    }

                    fragment.appendChild(document.createTextNode('**'));

                    // 用片段替换 <b> 标签
                    bTag.parentNode.replaceChild(fragment, bTag);
                } catch (e) {
                    console.warn('[MarkdownFixer] Failed to unwrap <b> tag:', e);
                }
            });

            // 规范化段落，合并相邻的文本节点
            p.normalize();

            // 策略2: 处理 **<span>text</span>** 这种跨元素的加粗标记
            this.fixCrossElementBold(p);
        }

        /**
         * 处理跨元素的加粗标记
         * 通用策略：扫描所有 ** 标记位置，按顺序配对并包裹
         * @param {HTMLElement} p 段落元素
         */
        fixCrossElementBold(p) {
            let modified = true;
            let iterations = 0;
            const maxIterations = 50;

            while (modified && iterations < maxIterations) {
                modified = false;
                iterations++;

                // 收集所有 ** 标记的位置
                const markers = this.collectBoldMarkers(p);
                if (markers.length < 2) break;

                // 按顺序配对处理
                for (let i = 0; i < markers.length - 1; i += 2) {
                    const start = markers[i];
                    const end = markers[i + 1];

                    if (!start || !end) break;

                    // 检查是否可以包裹
                    if (this.canWrapMarkers(start, end, p)) {
                        if (this.wrapBoldMarkers(start, end, p)) {
                            modified = true;
                            break;
                        }
                    }
                }
            }
        }

        /**
         * 收集段落中所有 ** 标记的位置
         * @returns {Array<{node: Text, offset: number}>}
         */
        collectBoldMarkers(p) {
            const markers = [];
            const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT, null, false);

            while (walker.nextNode()) {
                const node = walker.currentNode;
                if (this.shouldSkip(node)) continue;

                const text = node.textContent;
                let pos = 0;

                while ((pos = text.indexOf('**', pos)) !== -1) {
                    markers.push({ node, offset: pos });
                    pos += 2;
                }
            }

            return markers;
        }

        /**
         * 检查两个标记之间是否可以包裹
         */
        canWrapMarkers(start, end, container) {
            // 同一节点内的情况交给 processTextNode 处理
            if (start.node === end.node) {
                return false;
            }

            // 检查两个标记之间是否只有内联元素
            try {
                const range = document.createRange();
                range.setStart(start.node, start.offset + 2);
                range.setEnd(end.node, end.offset);

                const fragment = range.cloneContents();
                const inlineTags = ['span', 'a', 'em', 'i', 'strong', 'b', 'code', 'mark', 'cite'];

                // 检查片段中是否只有内联元素
                const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT, null, false);
                while (walker.nextNode()) {
                    const tag = walker.currentNode.tagName?.toLowerCase();
                    if (!inlineTags.includes(tag)) {
                        return false;
                    }
                }

                return true;
            } catch (e) {
                return false;
            }
        }

        /**
         * 包裹两个 ** 标记之间的内容
         */
        wrapBoldMarkers(start, end, container) {
            try {
                const startNode = start.node;
                const endNode = end.node;
                const startOffset = start.offset;
                const endOffset = end.offset;

                // 分割开始节点：[前面的文本][**][后面的文本]
                const startText = startNode.textContent;
                const beforeStart = startText.slice(0, startOffset);
                const afterStart = startText.slice(startOffset + 2);

                // 分割结束节点：[前面的文本][**][后面的文本]
                const endText = endNode.textContent;
                const beforeEnd = endText.slice(0, endOffset);
                const afterEnd = endText.slice(endOffset + 2);

                // 创建 Range 选中要加粗的内容
                const range = document.createRange();

                // 更新开始节点内容并设置 range 起点
                if (afterStart) {
                    // 开始节点在 ** 后面还有内容
                    startNode.textContent = beforeStart;
                    const afterStartNode = document.createTextNode(afterStart);
                    startNode.parentNode.insertBefore(afterStartNode, startNode.nextSibling);
                    range.setStartBefore(afterStartNode);
                } else {
                    // ** 在开始节点末尾
                    startNode.textContent = beforeStart;
                    range.setStartAfter(startNode);
                }

                // 更新结束节点内容并设置 range 终点
                if (beforeEnd) {
                    // 结束节点在 ** 前面还有内容
                    endNode.textContent = afterEnd;
                    const beforeEndNode = document.createTextNode(beforeEnd);
                    endNode.parentNode.insertBefore(beforeEndNode, endNode);
                    range.setEndAfter(beforeEndNode);
                } else {
                    // ** 在结束节点开头
                    endNode.textContent = afterEnd;
                    range.setEndBefore(endNode);
                }

                // 提取内容
                const contents = range.extractContents();

                // 展开提取内容中的 <b> 标签（只保留其内容）
                this.unwrapBoldTags(contents);

                // 创建 <strong> 元素
                const strong = document.createElement('strong');
                strong.dataset.originalMarkdown = '**';
                strong.appendChild(contents);

                // 插入 <strong>
                range.insertNode(strong);

                // 清理空节点
                if (startNode.textContent === '') {
                    startNode.parentNode?.removeChild(startNode);
                }
                if (endNode.textContent === '') {
                    endNode.parentNode?.removeChild(endNode);
                }

                // 规范化
                container.normalize();

                return true;
            } catch (e) {
                console.warn('[MarkdownFixer] Failed to wrap bold markers:', e);
                return false;
            }
        }

        /**
         * 展开片段中的 <b> 标签，只保留其子内容
         */
        unwrapBoldTags(fragment) {
            const boldTags = fragment.querySelectorAll('b');
            boldTags.forEach((b) => {
                const parent = b.parentNode;
                while (b.firstChild) {
                    parent.insertBefore(b.firstChild, b);
                }
                parent.removeChild(b);
            });
        }

        /**
         * 检查两个文本节点之间是否可以被包裹为加粗
         * 只允许内联元素（span, a, em, i, code 等）
         */
        canWrapBetween(startNode, endNode, container) {
            // 简单检查：两个节点必须在同一父容器内（直接或通过内联元素嵌套）
            // 获取从 startNode 到 endNode 之间的所有节点
            const startParent = startNode.parentNode;
            const endParent = endNode.parentNode;

            // 如果在同一父节点下，检查中间是否只有内联元素
            if (startParent === endParent) {
                return this.hasOnlyInlinesBetween(startNode, endNode);
            }

            // 复杂情况：不同父节点时，需要检查是否都在同一行内
            // 这里简化处理，只处理父节点是内联元素的情况
            const inlineTags = ['span', 'a', 'em', 'i', 'strong', 'b', 'code', 'mark', 'cite'];
            const startParentTag = startParent.tagName?.toLowerCase();
            const endParentTag = endParent.tagName?.toLowerCase();

            if (inlineTags.includes(startParentTag) || inlineTags.includes(endParentTag)) {
                // 检查两个父节点是否相邻或只有内联元素间隔
                return this.areNodesClose(startNode, endNode, container);
            }

            return false;
        }

        /**
         * 检查同一父节点下两个节点之间是否只有内联元素
         */
        hasOnlyInlinesBetween(startNode, endNode) {
            const inlineTags = ['span', 'a', 'em', 'i', 'strong', 'b', 'code', 'mark', 'cite', '#text'];
            let current = startNode.nextSibling;

            while (current && current !== endNode) {
                const tag = current.nodeName.toLowerCase();
                if (!inlineTags.includes(tag)) {
                    return false;
                }
                current = current.nextSibling;
            }

            return current === endNode;
        }

        /**
         * 检查两个节点是否足够"接近"可以被视为一对
         */
        areNodesClose(startNode, endNode, container) {
            // 使用 Range 检查两个节点之间的内容
            try {
                const range = document.createRange();
                range.setStartAfter(startNode);
                range.setEndBefore(endNode);

                const fragment = range.cloneContents();
                const inlineTags = ['span', 'a', 'em', 'i', 'strong', 'b', 'code', 'mark', 'cite', '#text'];

                // 检查片段中是否只有内联元素
                const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT, null, false);
                while (walker.nextNode()) {
                    const tag = walker.currentNode.tagName?.toLowerCase();
                    if (!inlineTags.includes(tag)) {
                        return false;
                    }
                }

                return true;
            } catch (e) {
                return false;
            }
        }

        /**
         * 检查元素是否在受保护区域内（code/pre/MathJax）
         * @param {HTMLElement} element 要检查的元素
         * @returns {boolean}
         */
        isInsideProtectedArea(element) {
            let parent = element.parentNode;
            while (parent && parent !== document.body) {
                const tag = parent.tagName?.toLowerCase();
                if (tag === 'code' || tag === 'pre' || parent.classList?.contains('MathJax')) {
                    return true;
                }
                parent = parent.parentNode;
            }
            return false;
        }

        /**
         * 判断是否应该跳过该节点
         * 保护 code/pre/MathJax 等区域
         * @param {Text} textNode
         * @returns {boolean}
         */
        shouldSkip(textNode) {
            let parent = textNode.parentNode;
            while (parent && parent !== document.body) {
                const tag = parent.tagName?.toLowerCase();
                // 跳过 code/pre 标签和 MathJax 区域
                if (tag === 'code' || tag === 'pre' || parent.classList?.contains('MathJax')) {
                    return true;
                }
                // 已经是加粗元素，跳过
                if (tag === 'strong' || tag === 'b') {
                    return true;
                }
                parent = parent.parentNode;
            }
            return false;
        }

        /**
         * 处理单个 TextNode，拆分并包裹加粗部分
         * @param {Text} textNode
         */
        processTextNode(textNode) {
            const text = textNode.textContent;
            const regex = /\*\*(.+?)\*\*/g;

            if (!regex.test(text)) return;
            regex.lastIndex = 0; // 重置正则状态

            const fragment = document.createDocumentFragment();
            let lastIndex = 0;
            let match;

            while ((match = regex.exec(text)) !== null) {
                // 添加匹配前的普通文本
                if (match.index > lastIndex) {
                    fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
                }

                // 创建加粗元素
                const strong = document.createElement('strong');
                strong.textContent = match[1]; // 去掉 **
                strong.dataset.originalMarkdown = match[0]; // 保留原始格式，用于导出还原
                fragment.appendChild(strong);

                lastIndex = regex.lastIndex;
            }

            // 添加剩余文本
            if (lastIndex < text.length) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
            }

            // 替换原节点
            textNode.parentNode.replaceChild(fragment, textNode);
        }
    }

    // ==================== 水印移除引擎 ====================
    /**
     * NanoBanana 水印移除引擎
     * 基于 journey-ad 的 Gemini NanoBanana Watermark Remover 脚本
     * https://greasyfork.org/scripts/559574
     */
    class WatermarkRemover {
        // 水印背景图片 Base64 (48x48)
        static BG_48 =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAGVElEQVR4nMVYvXIbNxD+FvKMWInXmd2dK7MTO7sj9QKWS7qy/Ab2o/gNmCp0JyZ9dHaldJcqTHfnSSF1R7kwlYmwKRYA93BHmkrseMcjgzgA++HbH2BBxhhmBiB/RYgo+hkGSFv/ZOY3b94w89u3b6HEL8JEYCYATCAi2JYiQ8xMDADGWsvMbfVagm6ZLxKGPXr0qN/vJ0mSpqn0RzuU//Wu9MoyPqxmtqmXJYwxxpiAQzBF4x8/fiyN4XDYoZLA5LfEhtg0+glMIGZY6wABMMbs4CaiR8brkYIDwGg00uuEMUTQ1MYqPBRRYZjZ+q42nxEsaYiV5VOapkmSSLvX62VZprUyM0DiQACIGLCAESIAEINAAAEOcQdD4a+2FJqmhDd/YEVkMpmEtrU2igCocNHW13swRBQYcl0enxbHpzEhKo0xSZJEgLIsC4Q5HJaJ2Qg7kKBjwMJyCDciBBcw7fjSO4tQapdi5vF43IZ+cnISdh9Y0At2RoZWFNtLsxr8N6CUTgCaHq3g+Pg4TVO1FACSaDLmgMhYC8sEQzCu3/mQjNEMSTvoDs4b+nXny5cvo4lBJpNJmKj9z81VrtNhikCgTsRRfAklmurxeKx9JZIsy548eeITKJgAQwzXJlhDTAwDgrXkxxCD2GfqgEPa4rnBOlApFUC/39fR1CmTyWQwGAQrR8TonMRNjjYpTmPSmUnC8ODgQHqSJDk7O9uNBkCv15tOp4eHh8SQgBICiCGu49YnSUJOiLGJcG2ydmdwnRcvXuwwlpYkSabTaZS1vyimc7R2Se16z58/f/jw4Z5LA8iy7NmzZ8J76CQ25F2UGsEAJjxo5194q0fn9unp6fHx8f5oRCQ1nJ+fbxtA3HAjAmCMCaGuAQWgh4eH0+k0y7LGvPiU3CVXV1fz+by+WQkCJYaImKzL6SEN6uMpjBVMg8FgOp3GfnNPQADqup79MLv59AlWn75E/vAlf20ibmWg0Pn06dPJZNLr9e6nfLu8//Ahv/gFAEdcWEsgZnYpR3uM9KRpOplMGmb6SlLX9Ww2q29WyjH8+SI+pD0GQJIkJycn/8J/I4mWjaQoijzPb25uJJsjmAwqprIsG4/HbVZ2L/1fpCiKoijKqgTRBlCWZcPhcDQafUVfuZfUdb1cLpfL5cePf9Lr16/3zLz/g9T1quNy+F2FiYjSNB0Oh8Ph8HtRtV6vi6JYLpdVVbmb8t3dnSAbjUbRNfmbSlmWeZ6XHytEUQafEo0xR0dHUdjvG2X3Sd/Fb0We56t6BX8l2mTq6BCVnqOjo7Ozs29hRGGlqqrOr40CIKqeiGg8Hn/xcri/rG/XeZ7/evnrjjGbC3V05YC/BSRJ8urVq36/3zX7Hjaq63o+n19fX/upUqe5VxFok7UBtQ+T6XQ6GAz2Vd6Ssizn8/nt7a3ay1ZAYbMN520XkKenpx0B2E2SLOo+FEWxWPwMgMnC3/adejZMYLLS42r7oH4LGodpsVgURdHQuIcURbFYLDYlVKg9sCk5wpWNiHym9pUAEQGG6EAqSxhilRQWi0VZVmrz23yI5cPV1dX5TwsmWGYrb2TW36OJGjdXhryKxEeHvjR2Fgzz+bu6XnVgaHEmXhytEK0W1aUADJPjAL6CtPZv5rsGSvUKtv7r8/zdj+v1uoOUpsxms7qunT6+g1/TvTQCxE6XR2kBqxjyZo6K66gsAXB1fZ3neQdJSvI8X61WpNaMWCFuKNrkGuGGmMm95fhpvPkn/f6lAgAuLy/LstyGpq7r9+8d4rAr443qaln/ehHt1siv3dvt2B/RDpJms5lGE62gEy9az0XGcQCK3DL4DTPr0pPZEjPAZVlusoCSoihWqzpCHy7ODRXhbUTJly9oDr4fKDaV9NZJUrszPOjsI0a/FzfwNt4eHH+BSyICqK7rqqo0u0VRrFYridyN87L3pBYf7qvq3wqc3DMldJmiK06pgi8uLqQjAAorRG+p+zLUxks+z7rOkOzlIUy8yrAcQFVV3a4/ywBPmJsVMcTM3l/h9xDlLga4I1PDGaD7UNBPuCKBleUfy2gd+DOrPWubGHJJyD+L+LCTjEXEgH//2uSxhu1/Xzocy+VSL+2cUhrqLVZ/jTYL0IMtQEklT3/iWCutzUljDDNXVSVHRFWW7SOtccHag6V/AF1/slVRyOkZAAAAAElFTkSuQmCC';

        // 水印背景图片 Base64 (96x96)
        static BG_96 =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAAfrElEQVR4nJV9zXNc15Xf75zXIuBUjG45M7GyEahFTMhVMUEvhmQqGYJeRPTG1mokbUL5v5rsaM/CkjdDr4b2RqCnKga9iIHJwqCyMCgvbG/ibparBGjwzpnF+bjnvm7Q9isU2Hj93r3nno/f+bgfJOaZqg4EJfglSkSXMtLAKkRETKqqRMM4jmC1Z5hZVZEXEylUiYgAISKBf8sgiKoqDayqIkJEKBeRArh9++7BwcHn558/+8XRz//30cDDOI7WCxGBCYCIZL9EpKoKEKCqzFzpr09aCzZAb628DjAAggBin5UEBCPfuxcRiIpIG2+On8TuZ9Ot9eg+Pxt9+TkIIDBZL9lU/yLv7Czeeeedra2txWLxzv948KXtL9WxGWuS1HzRvlKAFDpKtm8yGMfRPmc7diVtRcA+8GEYGqMBEDEgIpcABKqkSiIMgYoIKQjCIACqojpmQ+v8IrUuRyVJ9pk2qY7Gpon0AIAAJoG+8Z/eaGQp9vb2UloCFRWI6igQJQWEmGbeCBGI7DMpjFpmBhPPBh/zbAATRCEKZSgn2UzEpGyM1iZCKEhBopzq54IiqGqaWw5VtXAkBl9V3dlUpG2iMD7Yncpcex7eIO/tfb3IDbu7u9kaFTv2Xpi1kMUAmJi5ERDWnZprJm/jomCohjJOlAsFATjJVcIwzFgZzNmKqIg29VNVIiW2RkLD1fGo2hoRQYhBAInAmBW/Z0SD9y9KCmJ9663dVB8o3n77bSJ7HUQ08EBEzMxGFyuxjyqErwLDt1FDpUzfBU6n2w6JYnRlrCCljpXMDFUEv9jZFhDoRAYo8jDwMBiVYcwAYI0Y7xuOAvW3KS0zM7NB5jAMwdPR/jSx77555ny+qGqytbV1/fr11Oscnph+a1PDqphErjnGqqp0eYfKlc1mIz4WdStxDWJms8+0IITdyeWoY2sXgHFalQBiEClctswOBETqPlEASXAdxzGG5L7JsA/A/q1bQDEkAoAbN27kDbN6/1FVHSFjNyS3LKLmW1nVbd9NHsRwxBCoYaKqmpyUREl65IYzKDmaVo1iO0aEccHeGUdXnIo4CB+cdpfmrfHA5eVlEXvzdNd3dxtF4V/39/cFKujIJSIaWMmdReqFjGO2ZpaCUGRXc1COvIIOhbNL3acCQDb2Es5YtIIBI3SUgZw7Ah1VBKpQmH0RlCAQ81noVd16UnKMpOBa93twRbvx9t5ivnC1MQ4Rwaxsd7eyu36wUQzkxDMxmd9Rl6uxyaU+du6/sEBERkMrUmSgY97DyGN7pwlc4UqUuq1q0Cgi6LlrHtY0yNQnv5qMZ/23iHexf/OmhXr5ajZycHC/oklqsT1BAYK1lxy/RtCUNphW0uDCZUdJP3UBCgAwmEYVoiEBmyBEauFJ0w4JnGdWSvCHJHK5TimY3BW5hUqNnoxpNkYiWuzM927sdWakjUfXd3cX83mMzBVcRaAGgo0wOA5YvGZdiMjo5sZEA4NLMK2SKAZpumZDViWMgBjgFoHXq0p7YpberAgA5iC0iMgF7r4fKX/nZDSmqvfu3attrne0f+tWCsmxdhhSlao/yp5SkZkpoj6dtN/rshANptFVfZgtsHAJSKYmREqkDNWxSYM5GjWvpIAoGIJIgkR1lPBrEQCqQiwzM91G+ACGYLHz+q39W5UlTkC5c/f2nWvXrjnQBLKk3WlkdqRQESIGKPwdjxp4Fw4XmaVYKKUQqKE+GEqw4COIIZHwYqkpqtpsLeJOs50ItFpgYoJJL1Dl74lEoobLChbqARiGYX9/XzHV3OzU/tza2rp7925VE44rlcJlTi2VqcplXWeQMfVTmg63Cak+UIIXVQXzbHAzjywnHhsQTtSkoapE3GJiu6Tpp/VYs1PjkcHBl+c7+/v7BKoaQ2SOCCDNb27fuX1t65qJmgYWBIIw0eDphRJM8lr426ROMABSQs3FwAB5EDMMM+ZZlXc+gprFQDnMm2salYFGdQEosU+2aFmuMdX+ybdM8kb3/YP788WihUONJiViTVgnbG9/6c7du0Q0ljCKIoJvFBY3VEU2USuQELdMkJhNhKZiGmlTY5CZTyZyImLGLlBNpRUikKmRB2/mHUM7Mj50iYWXcUMI6YmKBX47Ozs3b36jKg4oYgKFNUupWap3bt+Z7+xYDigiSiygcRyppNkM0lHM1ZICMjJUVCz4NtlbVcfZqgohHaEQwUgtlyoYJ9KKT6lKIpLp/LpbMV3wBKIm0OKZoaq/raOM/3qJgkQUEj44OLCRh4ynvjLU2f/c3tp68OBBakcx2FYkMDmJiNmIB3PULjT1j7ciQKnxXQ2UeBgYUHMzAEQvFSNYlYQwQFrEGVA1dE2IQERMAgMEYjCRDzPPKmX2+e0be/vfuBkKktgIoqaGwbMmmL29vTff3I1xewUqC0Cq5nOK6TFqrquqyqoOUi11hPnZsUV8FLHiQAxRRoG0asNExMNg+XdVv57TbQAWR4hLz6Dh0kJEVU0LB/BO6MJEObuakY2td3Hvfvfd7e1t6omMyAUAtBaOyxUm1hHfY5NbwBClC2Sg51qmYJANzx2JjtAxogZk7uspj3PNQx6DYCJmmmkEqESkKqZlKfaDeweL+VxrvFwGktwBoAnU4c4W88X9gwNS8TqBR+3+UGW4KQcR7GGyorcIhyKnETAzgxkDqZKKoZiqZNbUkm/K8K5wfRIUVAiotfcUiKpSqwB6Vqnq6PPVr3713r17zfLXL+rvR9ICdSC/ffvO7u51J52b+mdklLDNnNoRH/q6lUZoHmQjm2UmzUpGhElehIZ0fHE8F4XoQDOGFRXJ80e28iKrEmGQEYl/RMqzGZhFHC/mX955/72/s8jMR7+RR21U8bV9DA159913t7f/HdEAZVI2s4o40Avno14Gs9j9aY1CGth7nsjMEX+LYIQQKUcVqahAKkhyN0EhYajoUfMpLWpwf+/Ba7mDg4OD+c7CzCgUr5MwjCkGF9IqCl0pjTBfLL77ne8YiQ0uu8C6hdfVRWRMv24Wlo4F9Gg+Q0RliqMRMdjT1fWYfKxCmDcBj1kAWADmwAYmZfMCYFXC3x7cu7l/s3aSvxQgTutWr5umi4sPYWoAsHdj787f3CZS1bFiykAzCBGxjKo0jIFKqqPIZdR61GZZmBkggM39JdYyD9mmiLAqVDDhKFFXh88Xwr6iqoQWQVRWpg4CgOj169cP7h1URdCsKJKDVGOcexxMwoCJur3zzjtvvvlmEWpTZx3B/BplfBQSjVG0cC+RyzNEbSqGzPtIiSnQziom7AVgcJ+2mYoSaPAqTxbx3PGJVtS3Mtt8/vr7f/felWijUFFMHFpGiRWzC2Db9f7777/++rwW5y/FFEqho1uHKBMDnGhrHj39jE8ujqqqIMdsq4VZENfGU6UBQGS0e7XMXJ9J866/VTNphkB3dnYePny4tbVV360aMf1btUEzrX3f5+vb29sPH364mM9TZw1rndpWq3HK1wsAOQoeuijRO7Q2lUSQDlut7mPqbNZYp5KJyGZfqjVx5Htl1ghgnr8+//B7Hy4WiylrvK3yO3lAoLCyyENexdT54vXvffi9+Zd3krzWPCmjhoJUw+6cNVNVUlYlJcEwad7wNN8n8vpGIr/VSqg9AAf5Rk1KI8DbMkVsb29/+DC4c7U77741gK55WSIRNXY2ZbTocbH44IMPtra2mNnTV3fBha/FRyNYv0mp1+4ARAOriAXDSqIK5kEtrFQwD5k0O/sJsNS5xARtxYUCTPPXd95/7/2v/sc3oo/SNSHgxP5qk/QETy+d1sI4f4DQyiB5RwFguVz94B9+sFwumVkuPd2hCBpVRxXYDGiUotlm7pQ8MRAoiAY0F6SjqcXANjBVtaUtEQwrs8fvlgTGMwT48pc6Z5D8ev311x9++HA+n1OIpDGIHEpy6M6g6uJTa6x8BlKrqCO8WyffxrXVavXo0aPVapVZVap/zBrYSNtnJWmCV62fAZByA+nIGxiIUiBskYy7ZGtLCb5GoiS3KOoa3FkAJXGpHrrVEBUTPbcgsY83jF+K9dpspmz+13w+//Dhhzs7O4YGCYh1MqrhdLzV1i6VycUasvgaEcN80ybEjBUNHDBkDnxQ7bhjgsolI2+99dZ77723tbUVaw7Mhf8lFxUdydBR+/trPKJ4CsD5+fnHH398dnZm34dTK1ojwp57kJJHaomzFafYqoLD7Jqqyviv5iOTQV3oSMX02yxeV/S8fef2tx98GxvB7y+6NvJigkf9Y+Ytar+Hh4eHP3uao1ARtnRd1Tz1RschyGURREQDzVSViGeqHllVDVJV046CTVZAaBUr++e1115799139/b2/oIB/5nf+3dmlpFuxFfUMwW9ChyfHB8+fbparXzsANEACKACxxq7HD3JEk57nckKzRRrEOr0rk+o2qPsXPeyb/gvr5Ardnd3v/Pud82dV/q6QeJP8GjKkfyNeHddg9Y4st77arX64ccf/f73v4cID1CBxMIdtizMWSMI7xzYxMmBzFAasqShWdBd4uP2GoBr167dPzi4fefOnzvsyajSneczsAC8Wk7vuSjuqm7UoI3COPzZ039+eig2HUDwWg+8dgxEEkIWqDqDEJ6deDYQKcTr8LGMzCbsWwJBRKphVord3d3vfue788V8M3HNbVOSEXyJxyYMqhxZG2TXxeSP3g9ufHH1cvlPT56cnp5G+JmFSDe9EqmIGVchakDeyuds2seZyTyOl4AHkPOdnQcPvr1344ZFfH0E6ExxRhRV8BrN1CG194nR0qwW9BbDqdwpZjjVIwoaqvYRYKj0yeHy5UvYmuVSFOw6goeOnq/Nrr3WKo9j1ZqWyAhGAFuvbd+9e/f2ndvb29ubHA2Zs82eJpy6Mthr/KXmrjc/ENyZ3J+E6Y2hrsDEbfAnJ8efHD5dLpdMM1UFCW2EToB8RqPN0rj9ZyUo37y2de3u3Tt3bt/1GOcV+l+tqR+AM+iqd5uou/rQn8GgK9halcsTDn9/uVwdnxwf//JfVqsVD6gFE9iyX26RdHPtlkZYSgHAErSdxfyb3/zm7dt/s7W1vWlkV4/zFWpy1firt9qoTVfx6CpyOvPsX1aAcHJ8cnh4uFqtmFnkkpkrr+CxDDvuGu6kHu2++ebBwf3d67vxKLDuNeqw1z3OVfHeK4Zn6sCEUcG2WGYtpvuL4tA1oytNOGT/6lenJycnn356CkDEc4OEFwJ7+AdAFbu71/f29m7d2u9UpoYnVw3sFXrRkRufuupUfEFrjVwdBF3ZC2LsiKrAelSl3TvM/Ic//OHs7Ozk5P+enZ3lYigzMWxtbb99Y+/69et7e3tXmhKV1oMEb4XNvF2DpgBUjSX5EP62Mah5/U2hzSsYtNFsJ8C0Rnx8pUmMmkmKrlarFy/Onj9//tvf/na5XNKd/3rnwTsPGgUdCnh+0cF87SZ1ta2gaBR2JE/AuwsCE8ZfwQWahpT55JW2TNMQqQ6qNexfhKQ6Mf/0pz/lO7dbKFwmgaxbLVyaEFy7105lJhFyzyqvJKxHwGVSrNKdXXR8mejZ5FnP4LXeL2sl2jYDiqmaYE0Tvjnxe/fuzba3m02VMnCIND53I6qmUc1nSjQBWise6WiNYi39IZEh6JtyhLLmuHZV9TRnIvF6amqngGZPhgzkAiZE+wbJpIrPzy/48OnTJpM1BEAKk6b369gmH6+6GXpBU4doItA11KgtaNPojV2o1yK5GW8PfOtXgE+17q7jo6NnRAN/5Stf+ev/8Fdf//rXd3enm0omUeYr/Nhffl0BORS68oqoEuXVDS5s7ZWNnNoI4UrnFxfPT391dnZ2enp6cXER6yBdD8fd3es3b+6/9dZb8/l8I+VY49qfc00z1Y6u9ac3RxUdmmn/cG1yveUJg7Sgftw8Pz8/Pjk+PX3+4uw3sdRHPZImanXZTMG+duNrt27t3/jaXhJxZbmno6/knzUXWwvSYClSK25c4Yw6gIdepcSb4G/DY5PnCQDOzl4cPj08++zXICLL46XlsV6Trjuw/GJV1fmXF/fv379586bfs2nDnBhZj32ok0/mX5EuUoQejJgNmPJi3aP/ycG/ysSom0FC082Li4ufPzs6OTlZLpeAwFKuEcaNnA0lWxgdjQ0gYZBqrIwQArCzmO/v79+6ub9YLCpTYOFPDuwqkitY2AjDH13hl4IxtBbLKCZhgze6ITQl0HqmQoCen58/Ozo6Ojq6uDi3u5ZmCSmJTe359AQREc+GtqJFGSQQJfKikk2ejSrMvPPvv3z//v2b+zfTrVYoVcvjwoF0SlyVCx3FmxiU4fb6yHsG1cFr90wPN63li4vznx/9/Ojo6PKLL2SSmDIJKSuRwnbrkA9zKLPPZWrQ9gXaQit7wOrQO/Odb33rW9/4L9+oGjSpARGzqnS2UEOVdW5sMCKsffEnUKWZ/BXX6enzJz958vLlS1X1FQheWeS0GFtCZ3X3WIo5+KKY5stiupaI6opMz3GZANz4z1978ODBYrFoeUKfgmX9xW+/gkEbsXnCkbU7V3iM4v+K7qxWy388/Pizz37TrwwE9X3ABoheurcimRtXaJBnEiWf4GSQ1Wvd58XmGYQ23bt3r+1n2ui101w2lUr6Ofu+KDEpg1IkhH0jU/ZuigmPnh09fXp4fn6eKzU2XsoKUQjIdkBlyZVn4c/iVkxoxzrNXL9xOdb5eHvrjTfe+OCDDyp4b2SQm6F/bgtLu2pHA/5N0L0mgA0S6Rm0XC4f//jxixdnceNKBhGR2L567eaWYRoEoJ/0aK95Md+wRpQAHmw7kACggSG6WCwODg5u7u9vcM9XaRCF9+3jvaicYN15rcfWVzDIGz09ff74x48vLi4A9FseNzNLWZNB1KHqAIqDSMLq6mDK/pmOr6Q2ly+qqsMw/Le//e8H9w4azYRalNow9+AimUxaxCsVa9KR2/Kq0Pe4vcYz4MmTJ89+8YtCrU4MPKew2h0SU6QEk4yk850oWnmtk0EEjHmmi/VRS/q5CMaM8vr16++/957PeRBitdhVCzNcI7qAux+nZ4/UsQxTEXZQdH5+/tGPPn7x4oWq5GxwQQ+NhWXJoDjxhe2Ui6G0HBPWRCTSlpo7BCkTs+olgG4e0rkZGsfJaVLVxWLx8H8+XMznyEmFcCydEoW+ELKy8cqSGLCBy0hccxnYEqHly1UObxPuCMfydj91Bc2LDTSrs/CqI2EGYFMtmOx+S2VhSUZZ4u9QLQS2A1QEwM7O3BffrYWF6YIzBdkQ2uGK53WNWzViUl2ulo++/2i5XKLUQNOOTIQiYqbEakstxRb2JINIbXkU5wrGXGmPbAgZJdcVMOl3y0Ly/M3lWJ9VEkrTMJ84Qu0WW1MutfBV7dO3+ue7y5RTAf3d73//6PuPVqsl+c4aSiKnjdTRZgUvky3/t+zUj09TmjBFNcc5W31suyL8RCHKw3B8N81yufz7//X3v/vd79aGWWq36zqbVW2DHu0fs5ps7GktjdByufqHH/zgjy//qLEsNVdC2+4dKqXV2oCtb23jL1LPq+UZlUrPRAqDc7N0ZVY04SqtfpKJEuHi4vyjH320XC2nbGj+qTXXfdW7+ahBxsq9CMqT0cvl8tH3H33++YWI5BkYuTbQ9rvVrQGq+SFsIltTtYAmFwnDViSWJasEMCnn+o/c/7O+oc46U4UgVGno9GK1XD569Gi5XPYimVgdHGK1vFt4qCV8d0ii6JuwXK3MnAVj2TuWg9dRR49gYhE086BKNVMloE1Lw/fca9jWZJ10YAqocrrpZ2RYkQAUi7EZ2u78L1qtlo8ePfr88/PKlLoDeO3qgc9/ty4pC+SE8/PzR99/9PLly/SheS5FwWYQkc2419XubaRxpd1pH0O0fQwASGEnvqgqg9HtAnEzti0yOQoiUoIyUZyhkZdt0lwtlx9/9BEZpqjz28ZNayq5XpmncFXFLJxzH/3wRy9Xf6y8HmjI0AwA0WDrEicupfQ2ilzqeGknGZF6WFwpKkd0qdoJQxOZNlQKh1/QqY1wcpiGxoJGIrx4cfbkyZP1Nifkls/Ni657Hvv+8PDwsxcv1llsM+vWRJtij73y651edeUzTCozbh5RMAqUZ4PtpFcdY3NGxKDEqcLKUKaBZmzbHdqPeZA2tl8cPXt+ejrhjmqBmG5uVpsfy3XVoYBQHP/yl08PnyLO74PFYoCq2lqvcpnDFekPb/SKDw2qJJ1c/SQT1VFVBlsK3JxixIe2/WCC9iJQ6jCrEqL98QLsx9IN7tmZ/vHx4+VyOZGSa3QN+Vro539NnOZqtfrZz35GsRLOVDt3E0a/1K3QoC4di3NrbPd4t0esrSVXEEFE2OM7AdFA4ExG1NYMeZ1ogLRtjxZIqCorsfp+USJqG/YNgFiVxM4bEugXX3zx+PHjwh7TIMkAoxO8OlxXL2aG98OPP1q+XNnhlVHbU8VIZPu8eojlmalJ4qwL2z2vY/BAea7MyGz5w8DMEWUrQCSxtb1qR9TSNFfJUnDHuCCSu+3HtSCgk7wSPvvss2fPnrW/C+iU9xqUhsdsPvjw6WGNP3PxYI58EkOPl7a6su2P7i9XpWyHSlo7jgrf9MJ22EoXCnpQBLYzUbrWc9QM2DlDMqqVckQYHnl5A/aGuK89PDy06JGyJOQA07kYNbCpnRKtVsunh/88EA/E0QsZPtr+2BybBXuqo51t1vsZCtJtpKNvs40f5pkveGYCD75OkcrG4Xq5JKk75mEiCe9U1SBIPaPoQIqIbLnkxcXF4x//GBQ1HXRtBkpXvrTf//Tkie10HscxZ2JUDZvrTrHkVAviaqSS4p1koFouS/dlHNk2/ChBMJop+k876ETJjpKFxQm2J3qwmDsxi5RFkpUAQCqx9wgqlyFJefHrs+enzwGN0zO7ALlX0XYdnxx/+umnNEQXwyw5q6o0wE5wycsLOHYOCakhDhHleYl+PlnQ7D9gUX/G9rt2WpMMrla9LoHq3aoEXC6bAmWeDRqbEYnoyZMn5+clvHY3EcoySU0IAA4/+aSBURwYpKWGV0liP/CttNLTHF4vM7/UJQGVPd0A2zG/REqkdi6inT4QN4nIj5AzjTBtyvOk1eq4QhAdiAEWOy3DXBwx+dFhY+44U8Ly5erZs6OOhZG71KSMfFETjk9OVqs/QuPssHIsj/q2d/LN3d6bbXGiyBNINY7osfMa1N8gZtsCh/YT3AQrnNNpqE2iVV9SPnX/Uy1RZ0K/rlP+LkesF/WaOvNL7Jm69vhj7S2Xq6dPn5psiwV1dfjCL53NZgapWYGwr7rTZXoie4WX2jjXpzUOJwzAUyUZ9dJ0x2S1TpOI5L4FirMw86AuWPBZKl7G988vzn9+dGQG1ZG9hkLHx79cLv+/siprFKFaO86XEYhzPBKnS17aVMPxxVro9mQ0r+L+SkeCdBhERDU7GwbWmKrLYwZrpBCPDQlSE1fIE9nUkA84enbUIdHkCh6d/Mux1vSvBPf5mW2XUwQ1Odqr9LoqeK24Z+SVLbTxiHSFIiWMowBkx1dmKXNUyd0L1p4hgB/22icc4eDayKwr1ZGBL87PjwyJJl6rGNrxyfFqtWImUmYvALIhZh9JiOrY7acFkba9uDl7wxgMNEnZbFbgAbMQyI9pkIx789gYSz1aME7M5Afx+AL9DZYfR12lrDJCSe5svPKb4+NjoAt2Jn8eHh5WfcmcK1WDqK3+Sl02SiZHLayTRJlzAwrGpm85lMrYDFX4nP5ovPAT4jTP/kIjCAZAZZ6kqnRV2u6ID3CcKc4vly9fnL3oyon+Mgg4PT19+XIVMS6SNZE65MYJrsgdWqyqY0bYSR5EGWTxkZNqft1nt9rJs65B9kdh9rQqmNdEbtXOq21TXwN2ppe0oz4J4JNPPuk1p0XVx8fH6TRblWf0//7AQJB51o7RXkvNxnL8Y3XKG7V7ctOMI3IQ0ZhBHcAzRVffWX/Z74jmUXTrWFjY5xFtHMLWziFSwovffHZ+cR4ZmbMGhOVydfr/Ts1DEClIBaPIZZFfqFU4xzykzjggInZOq/HOUQk6qV4nUJLC4MlwygWAUB8ugOLlPO6CgGwxFSo9yEQyhcrW/bpw0iKOT46zn+AQXrx4kTcA+LKuiVeMRLQ5nYghM5LOqvNGEebYs5HJk8FysjMiRxHBCBKCHUQIAH7y+ERFs3UpR20nFjYbDIBnxH9+ArZKQtJ6evo8JZpx0Mnx/4Hk+fmceUGG4wz1gmHQlrGPqsLOktI4KiKQiJllHHWU/CFVHS8l0heL4DJA4RSy/VscZ5V2A51kSnLBGjUFro4jPgAS/jGqSxM3d3Z2dn5+UaeqV6vl2dlZfdi/KuR5Hk1NHimk6jqqXsOKpakvDg5O8ETq4cVKZEl21LglbDqa9O0ANCOl7vSdzWZZu0SEHhmJ+JKPPINXAIniKwXeNBPW0+e/qkHlr389FosuOs/o+Q3Zrv8WYRANFHBhg7RgbRgGK/INQwisnAOJQC6jqtkBtUUZXcmiqFLnsCYHu6U2orr52NTpZxFwpyP5n3mkVKuSEuHs12f1zumnz52zExQzhBRHfrMA0qYmteWkTbU7T7o9Foe4V12bqN5MR2Do4y772ghXVgiYRUfyVRCggWNWgDRiVq0g2tkp217+MtfsJ+ygDOn09LQG0L/77W+pLSrxBIIpAMGgnAReEgUgtovFqLLsUMNSfAkCQ3IFK1GS6px3LhtIj83iiHydXWVt8wHBzDijwqcE8j9eco+WI1ZLm6zM7RP2Whxfrzit34svzn/ykyfLPyzPz8+f/OTJ6uVLNLrF9qsbd2owXSWan6U73q47YXrioeqVEF4fBvBvwZvfB2giLLAAAAAASUVORK5CYII=';

        static ALPHA_THRESHOLD = 0.002;
        static MAX_ALPHA = 0.99;
        static LOGO_VALUE = 255;

        constructor() {
            this.alphaMaps = {};
            this.bgImages = {};
            this.processingQueue = new Set();
            this.enabled = false;
            this.stopObserver = null;
        }

        /**
         * 计算 Alpha Map
         */
        calculateAlphaMap(imageData) {
            const { width, height, data } = imageData;
            const alphaMap = new Float32Array(width * height);
            for (let i = 0; i < alphaMap.length; i++) {
                const idx = i * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const maxChannel = Math.max(r, g, b);
                alphaMap[i] = maxChannel / 255;
            }
            return alphaMap;
        }

        /**
         * 移除水印核心算法
         */
        removeWatermark(imageData, alphaMap, position) {
            const { x, y, width, height } = position;
            for (let row = 0; row < height; row++) {
                for (let col = 0; col < width; col++) {
                    const imgIdx = ((y + row) * imageData.width + (x + col)) * 4;
                    const alphaIdx = row * width + col;
                    let alpha = alphaMap[alphaIdx];
                    if (alpha < WatermarkRemover.ALPHA_THRESHOLD) continue;
                    alpha = Math.min(alpha, WatermarkRemover.MAX_ALPHA);
                    const oneMinusAlpha = 1 - alpha;
                    for (let c = 0; c < 3; c++) {
                        const watermarked = imageData.data[imgIdx + c];
                        const original = (watermarked - alpha * WatermarkRemover.LOGO_VALUE) / oneMinusAlpha;
                        imageData.data[imgIdx + c] = Math.max(0, Math.min(255, Math.round(original)));
                    }
                }
            }
        }

        /**
         * 检测水印配置
         */
        detectWatermarkConfig(imageWidth, imageHeight) {
            if (imageWidth > 1024 && imageHeight > 1024) {
                return { logoSize: 96, marginRight: 64, marginBottom: 64 };
            }
            return { logoSize: 48, marginRight: 32, marginBottom: 32 };
        }

        /**
         * 计算水印位置
         */
        calculateWatermarkPosition(imageWidth, imageHeight, config) {
            const { logoSize, marginRight, marginBottom } = config;
            return {
                x: imageWidth - marginRight - logoSize,
                y: imageHeight - marginBottom - logoSize,
                width: logoSize,
                height: logoSize,
            };
        }

        /**
         * 加载背景图片
         */
        async loadBgImage(size) {
            if (this.bgImages[size]) return this.bgImages[size];
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    this.bgImages[size] = img;
                    resolve(img);
                };
                img.onerror = reject;
                img.src = size === 48 ? WatermarkRemover.BG_48 : WatermarkRemover.BG_96;
            });
        }

        /**
         * 获取 Alpha Map
         */
        async getAlphaMap(size) {
            if (this.alphaMaps[size]) return this.alphaMaps[size];
            const bgImage = await this.loadBgImage(size);
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bgImage, 0, 0);
            const imageData = ctx.getImageData(0, 0, size, size);
            const alphaMap = this.calculateAlphaMap(imageData);
            this.alphaMaps[size] = alphaMap;
            return alphaMap;
        }

        /**
         * 处理图片移除水印
         */
        async processImage(image) {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const config = this.detectWatermarkConfig(canvas.width, canvas.height);
            const position = this.calculateWatermarkPosition(canvas.width, canvas.height, config);
            const alphaMap = await this.getAlphaMap(config.logoSize);
            this.removeWatermark(imageData, alphaMap, position);
            ctx.putImageData(imageData, 0, 0);
            return canvas;
        }

        /**
         * 替换为原始尺寸 URL
         */
        replaceWithNormalSize(src) {
            return src.replace(/=s\d+(?=[-?#]|$)/, '=s0');
        }

        /**
         * 加载图片
         */
        loadImage(src) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            });
        }

        /**
         * Canvas 转 Blob
         */
        canvasToBlob(canvas, type = 'image/png') {
            return new Promise((resolve) => canvas.toBlob(resolve, type));
        }

        /**
         * 判断是否是有效的 Gemini 生成图片
         */
        isValidGeminiImage(img) {
            return img.closest('generated-image,.generated-image-container') !== null;
        }

        /**
         * 查找所有 Gemini 生成的图片
         */
        findGeminiImages() {
            return [...document.querySelectorAll('img[src*="googleusercontent.com"]')].filter(
                (img) => this.isValidGeminiImage(img) && img.dataset.watermarkProcessed !== 'true' && img.dataset.watermarkProcessed !== 'processing',
            );
        }

        /**
         * 通过 GM_xmlhttpRequest 获取图片 Blob
         */
        fetchBlob(url) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    responseType: 'blob',
                    headers: {
                        Referer: 'https://gemini.google.com/',
                        Origin: 'https://gemini.google.com',
                    },
                    onload: (response) => resolve(response.response),
                    onerror: reject,
                });
            });
        }

        /**
         * 处理单个图片元素
         */
        async processImageElement(imgElement) {
            if (this.processingQueue.has(imgElement)) return;
            this.processingQueue.add(imgElement);
            imgElement.dataset.watermarkProcessed = 'processing';
            const originalSrc = imgElement.src;

            try {
                imgElement.src = '';
                const normalSizeBlob = await this.fetchBlob(this.replaceWithNormalSize(originalSrc));
                const normalSizeBlobUrl = URL.createObjectURL(normalSizeBlob);
                const normalSizeImg = await this.loadImage(normalSizeBlobUrl);
                const processedCanvas = await this.processImage(normalSizeImg);
                const processedBlob = await this.canvasToBlob(processedCanvas);
                URL.revokeObjectURL(normalSizeBlobUrl);
                imgElement.src = URL.createObjectURL(processedBlob);
                imgElement.dataset.watermarkProcessed = 'true';
                console.log('[Gemini Helper] Watermark removed from image');
            } catch (error) {
                console.warn('[Gemini Helper] Failed to remove watermark:', error);
                imgElement.dataset.watermarkProcessed = 'failed';
                imgElement.src = originalSrc;
            } finally {
                this.processingQueue.delete(imgElement);
            }
        }

        /**
         * 处理所有图片
         */
        processAllImages() {
            const images = this.findGeminiImages();
            if (images.length === 0) return;
            console.log(`[Gemini Helper] Found ${images.length} images to process for watermark removal`);
            images.forEach((img) => this.processImageElement(img));
        }

        /**
         * 启动水印移除
         */
        start() {
            if (this.enabled) return;
            this.enabled = true;
            console.log('[Gemini Helper] Watermark Remover started');

            // 处理已有图片
            this.processAllImages();

            // 监听新增图片
            const debounce = (func, wait) => {
                let timeout;
                return (...args) => {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => func(...args), wait);
                };
            };

            const observer = new MutationObserver(debounce(() => this.processAllImages(), 100));
            observer.observe(document.body, { childList: true, subtree: true });
            this.stopObserver = () => observer.disconnect();
        }

        /**
         * 停止水印移除
         */
        stop() {
            if (!this.enabled) return;
            this.enabled = false;
            if (this.stopObserver) {
                this.stopObserver();
                this.stopObserver = null;
            }
            console.log('[Gemini Helper] Watermark Remover stopped');
        }
    }

    // ==================== 滚动锁定管理器 ====================
    /**
     * 滚动锁定管理器
     * 通过劫持原生滚动 API 和 MutationObserver 修正来实现防自动滚动
     */
    class ScrollLockManager {
        constructor(siteAdapter) {
            this.siteAdapter = siteAdapter;
            this.enabled = false;
            this.originalApis = null;
            this.observer = null;
            this.cleanupInterval = null;
            this.lastScrollY = window.scrollY;
        }

        setEnabled(enabled) {
            if (this.enabled === enabled) return;
            this.enabled = enabled;

            if (enabled) {
                this.enable();
            } else {
                this.disable();
            }
        }

        enable() {
            console.log('Gemini Helper: Enabling Scroll Lock System');
            this.hijackApis();
            this.startObserver();
            this.startScrollListener();
        }

        disable() {
            console.log('Gemini Helper: Disabling Scroll Lock System');
            this.restoreApis();
            this.stopObserver();
            this.stopScrollListener();
        }

        hijackApis() {
            if (this.originalApis) return; // 已经劫持

            // 保存原始 API
            this.originalApis = {
                scrollIntoView: Element.prototype.scrollIntoView,
                scrollTo: window.scrollTo,
                // 保存属性描述符以便恢复
                scrollTopDescriptor: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop') || Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop'),
            };

            const self = this;

            // 1. 劫持 Element.prototype.scrollIntoView
            Element.prototype.scrollIntoView = function (options) {
                // 检查是否包含绕过锁定的标志 (即使是 boolean or object)
                const shouldBypass = options && typeof options === 'object' && options.__bypassLock;

                if (self.enabled && self.shouldBlockScroll() && !shouldBypass) {
                    // console.log('Gemini Helper: Blocked scrollIntoView');
                    return;
                }
                // 移除自定义属性以防传给原生 API 报错（虽然通常不会）
                if (shouldBypass) {
                    // 克隆 options 以免修改原对象，或者直接删除 key
                    // 原生 scrollIntoView 会忽略未知属性
                }
                return self.originalApis.scrollIntoView.call(this, options);
            };

            // 2. 劫持 window.scrollTo
            window.scrollTo = function (x, y) {
                // 有时 y 可能是 options 对象
                let targetY = y;
                if (typeof x === 'object' && x !== null) {
                    targetY = x.top;
                }

                // 只有当向下大幅滚动时才拦截 (防止系统自动拉到底)
                // 阈值设为 50px，避免误杀微小调整
                if (self.enabled && self.shouldBlockScroll() && typeof targetY === 'number' && targetY > window.scrollY + 50) {
                    // console.log('Gemini Helper: Blocked window.scrollTo (Auto-scroll attempt)');
                    return;
                }
                return self.originalApis.scrollTo.apply(this, arguments);
            };

            // 3. 劫持 scrollTop setter (许多框架通过设置 scrollTop 来滚动)
            if (this.originalApis.scrollTopDescriptor) {
                Object.defineProperty(Element.prototype, 'scrollTop', {
                    get: function () {
                        return self.originalApis.scrollTopDescriptor.get ? self.originalApis.scrollTopDescriptor.get.call(this) : this.files; // fallback (impossible normally)
                    },
                    set: function (value) {
                        if (self.enabled && self.shouldBlockScroll() && value > this.scrollTop + 50) {
                            // console.log('Gemini Helper: Blocked scrollTop setter');
                            return;
                        }
                        if (self.originalApis.scrollTopDescriptor.set) {
                            self.originalApis.scrollTopDescriptor.set.call(this, value);
                        }
                    },
                    configurable: true,
                });
            }
        }

        restoreApis() {
            if (!this.originalApis) return;

            Element.prototype.scrollIntoView = this.originalApis.scrollIntoView;
            window.scrollTo = this.originalApis.scrollTo;

            if (this.originalApis.scrollTopDescriptor) {
                Object.defineProperty(Element.prototype, 'scrollTop', this.originalApis.scrollTopDescriptor);
            }

            this.originalApis = null;
        }

        // 判断是否应该阻止滚动
        // 核心逻辑：虽然功能开启，但如果用户已经滚到底部了，我们其实应该允许跟随（就像终端一样）
        // 不过根据用户需求，既然叫 "防止自动滚动"，还是激进一点：只要开启就尽量阻止非用户触发的大幅向下滚动
        shouldBlockScroll() {
            // 只有当我们不在底部时，才强力阻止？或者一直阻止？
            // 为了最好的体验：如果用户已经在底部，应该允许新内容把页面撑长，但不应该发生"跳跃"
            // 用户的脚本逻辑很简单：开启就阻止。我们保持一致。
            return true;
        }

        startScrollListener() {
            // 记录用户最后滚动位置，用于自动修正
            const onScroll = () => {
                // 如果是用户手动滚动（或者未被劫持的滚动），更新位置
                // 这里很难区分，但我们主要通过 MutationObserver 来回滚异常位置
                if (this.enabled) {
                    // 只有在未被拦截的情况下，我们才认为这是"合法"的位置更新
                    // 在 scroll 事件中很难拦截，只能事后修正
                    // 这里我们只更新 lastScrollY，具体修正在 Observer 中
                    this.lastScrollY = window.scrollY;
                }
            };
            window.addEventListener('scroll', onScroll, { passive: true });
            this.onScrollHandler = onScroll;
        }

        stopScrollListener() {
            if (this.onScrollHandler) {
                window.removeEventListener('scroll', this.onScrollHandler);
                this.onScrollHandler = null;
            }
        }

        startObserver() {
            // 监听 DOM 变化，如果发现非用户意图的滚动跳变，强制回滚
            this.observer = new MutationObserver((mutations) => {
                if (!this.enabled) return;

                let hasNewContent = false;
                const contentSelectors = this.siteAdapter.getChatContentSelectors();
                if (contentSelectors.length === 0) return;

                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        // 检查是否有新消息节点
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === 1) {
                                // Element
                                // 使用适配器提供的选择器判断
                                for (const sel of contentSelectors) {
                                    if ((node.matches && node.matches(sel)) || (node.querySelector && node.querySelector(sel))) {
                                        hasNewContent = true;
                                        break;
                                    }
                                }
                            }
                            if (hasNewContent) break;
                        }
                    }
                });

                if (hasNewContent) {
                    // 如果有新内容插入，立刻检查滚动位置是否发生了非预期的改变
                    // 这里的逻辑是：如果当前位置比记录的 lastScrollY 大了很多，说明发生了自动滚动
                    // 我们强制滚回去
                    const currentScroll = window.scrollY;
                    // 阈值 100px
                    if (currentScroll > this.lastScrollY + 100) {
                        // console.log('Gemini Helper: Detected unblocked auto-scroll, changing back.');
                        window.scrollTo(this.lastScrollY, 0); // 使用原始 API 已经被劫持，这里需要 bypass 吗？
                        // 实际上我们的劫持逻辑里 window.scrollTo 会调用 apply(this, arguments)，
                        // 但我们的劫持逻辑是阻止"向下"滚动。如果是"向上"回滚 (current > last, so set to last is moving up)，是被允许的。
                        // 稍微解释：lastScrollY 是 1000，current 是 2000。window.scrollTo(1000) 是向上，允许。
                        // 所以直接调用 window.scrollTo 即可。
                    }
                }
            });

            this.observer.observe(document.body, {
                childList: true,
                subtree: true,
            });

            // 定时器保底
            this.cleanupInterval = setInterval(() => {
                if (this.enabled) {
                    const current = window.scrollY;
                    if (current > this.lastScrollY + 200) {
                        // 大幅跳变，回滚
                        window.scrollTo(this.lastScrollY, 0);
                    } else {
                        // 小幅变动，认为是合法阅读，更新基准（防止页面慢慢变长后滚不下去）
                        this.lastScrollY = current;
                    }
                }
            }, 500);
        }

        stopObserver() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
            }
        }
    }

    // ==================== 核心管理类 ====================

    /**
     * 滚动管理器
     * 抽象不同站点的滚动容器差异
     */
    class ScrollManager {
        constructor(siteAdapter) {
            this.siteAdapter = siteAdapter;
        }

        get container() {
            // 确保获取的是最新的容器实例
            return this.siteAdapter.getScrollContainer();
        }

        get scrollTop() {
            return this.container ? this.container.scrollTop : 0;
        }

        set scrollTop(val) {
            if (this.container) this.container.scrollTop = val;
        }

        get scrollHeight() {
            return this.container ? this.container.scrollHeight : 0;
        }

        get clientHeight() {
            return this.container ? this.container.clientHeight : 0;
        }

        scrollTo(options) {
            if (this.container) {
                try {
                    this.container.scrollTo(options);
                } catch (e) {
                    // 兼容部分旧浏览器不支持 options 对象
                    if (options.top !== undefined) {
                        this.container.scrollTop = options.top;
                    }
                }
            }
        }

        // 检查是否在底部区域
        isAtBottom(threshold = 100) {
            const c = this.container;
            if (!c) return false;
            return c.scrollHeight - c.scrollTop - c.clientHeight <= threshold;
        }
    }

    /**
     * 历史加载管理器
     * 负责加载全部历史记录并滚动到真正顶部
     */
    class HistoryLoader {
        constructor(scrollManager, i18nFunc) {
            this.scrollManager = scrollManager;
            this.t = i18nFunc;
            this.isLoading = false;
            this.aborted = false;
            this.overlay = null;
            this.overlayTimeout = null;
        }

        /**
         * 核心方法：加载全部历史并滚动到顶部
         * 采用延迟显示遮罩策略：前 2 轮（约 2.4 秒）不显示遮罩
         */
        async loadAllAndScrollTop() {
            if (this.isLoading) {
                showToast(this.t('loadingHistory'));
                return;
            }

            const container = this.scrollManager.container;
            if (!container) {
                showToast('未找到滚动容器');
                return;
            }

            this.isLoading = true;
            this.aborted = false;

            // 配置参数
            const WAIT_MS = 800; // 每轮等待时间（从 1200ms 降到 800ms）
            const MAX_NO_CHANGE_ROUNDS = 3; // 连续 N 次无变化判定完成（从 5 降到 3）
            const MAX_TOTAL_ROUNDS = 50; // 超时保护：最多 50 轮（约 40 秒）
            const OVERLAY_DELAY_MS = 1600; // 遮罩延迟显示时间（约 2 轮）

            const initialHeight = container.scrollHeight;
            let lastHeight = initialHeight;
            let noChangeCount = 0;
            let loopCount = 0;

            // 快速检测：如果已经在顶部附近，先跳到顶部看看有没有更多内容
            container.scrollTop = 0;

            // 延迟显示遮罩的定时器
            this.overlayTimeout = setTimeout(() => {
                if (this.isLoading && !this.aborted) {
                    this.showOverlay();
                }
            }, OVERLAY_DELAY_MS);

            const loadLoop = () => {
                if (this.aborted) {
                    this.finish(false);
                    return;
                }

                loopCount++;

                // 超时保护：防止无限循环
                if (loopCount >= MAX_TOTAL_ROUNDS) {
                    console.warn('HistoryLoader: max rounds reached, force completing');
                    this.finish(true);
                    return;
                }

                // 跳到顶部
                container.scrollTop = 0;
                // 触发 wheel 事件以激活懒加载
                container.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));

                setTimeout(() => {
                    if (this.aborted) {
                        this.finish(false);
                        return;
                    }

                    const currentHeight = container.scrollHeight;

                    if (currentHeight > lastHeight) {
                        // 高度增加，说明还在加载
                        lastHeight = currentHeight;
                        noChangeCount = 0;
                        this.updateOverlayText(`${this.t('loadingHistory')} (${Math.round(currentHeight / 1000)}k)`);
                        loadLoop();
                    } else {
                        noChangeCount++;
                        // 首轮就没变化且已在顶部，快速完成（短对话优化）
                        const isAtTop = container.scrollTop < 10;
                        const isFirstRoundNoChange = loopCount === 1 && currentHeight === initialHeight;

                        if (isFirstRoundNoChange && isAtTop) {
                            // 短对话，直接完成，不显示完成 toast
                            this.finish(false, true); // silent = true
                        } else if (noChangeCount >= MAX_NO_CHANGE_ROUNDS) {
                            // 加载完成
                            this.finish(true);
                        } else {
                            // 继续确认
                            this.updateOverlayText(`${this.t('loadingHistory')} (${noChangeCount}/${MAX_NO_CHANGE_ROUNDS})`);
                            loadLoop();
                        }
                    }
                }, WAIT_MS);
            };

            // 开始加载循环
            loadLoop();
        }

        /**
         * 完成加载
         * @param {boolean} success - 是否成功
         * @param {boolean} silent - 是否静默（不显示 toast）
         */
        finish(success, silent = false) {
            this.isLoading = false;
            this.aborted = false;

            // 清除遮罩延迟定时器
            if (this.overlayTimeout) {
                clearTimeout(this.overlayTimeout);
                this.overlayTimeout = null;
            }

            this.hideOverlay();

            if (success && !silent) {
                showToast(this.t('historyLoaded'));
            }
        }

        /**
         * 中止加载
         */
        abort() {
            this.aborted = true;
        }

        /**
         * 显示加载遮罩
         */
        showOverlay() {
            if (this.overlay) return;

            const overlay = document.createElement('div');
            overlay.id = 'gemini-helper-loading-overlay';

            // 使用 DOM API 创建元素，避免 innerHTML
            const spinner = document.createElement('div');
            spinner.className = 'loading-spinner';
            spinner.textContent = '⏳';

            const text = document.createElement('div');
            text.className = 'loading-text';
            text.id = 'gemini-helper-loading-text';
            text.textContent = this.t('loadingHistory');

            const hint = document.createElement('div');
            hint.className = 'loading-hint';
            hint.textContent = this.t('loadingHint');

            const stopBtn = document.createElement('button');
            stopBtn.className = 'loading-stop-btn';
            stopBtn.id = 'gemini-helper-stop-btn';
            stopBtn.textContent = this.t('stopLoading');
            stopBtn.addEventListener('click', () => {
                this.abort();
            });

            overlay.appendChild(spinner);
            overlay.appendChild(text);
            overlay.appendChild(hint);
            overlay.appendChild(stopBtn);

            document.body.appendChild(overlay);
            this.overlay = overlay;
        }

        /**
         * 隐藏加载遮罩
         */
        hideOverlay() {
            if (this.overlay) {
                this.overlay.remove();
                this.overlay = null;
            }
        }

        /**
         * 更新遮罩文本
         */
        updateOverlayText(text) {
            if (this.overlay) {
                const textEl = this.overlay.querySelector('#gemini-helper-loading-text');
                if (textEl) textEl.textContent = text;
            }
        }
    }

    /**
     * 阅读进度管理器 (Auto-Resume)
     * 负责自动保存和恢复阅读位置
     */
    class ReadingProgressManager {
        constructor(settings, scrollManager, i18nFunc) {
            this.settings = settings; // 引用传递，保持最新
            this.scrollManager = scrollManager;
            this.t = i18nFunc;
            this.lastSaveTime = 0;
            this.isRecording = false; // 默认为 false，通过 startRecording 开启
        }

        startRecording() {
            if (this.isRecording) return;
            this.isRecording = true;

            this.scrollHandler = () => this.handleScroll();

            // 监听真正的滚动容器（各站点通过 SiteAdapter 适配）
            const container = this.scrollManager.container;
            if (container) {
                container.addEventListener('scroll', this.scrollHandler, { passive: true });
                this.listeningContainer = container; // 保存引用以便移除
            }
            // 同时保留 window 监听作为兜底（某些站点可能用 window 滚动）
            window.addEventListener('scroll', this.scrollHandler, { capture: true, passive: true });
        }

        stopRecording() {
            if (!this.isRecording) return;
            this.isRecording = false;
            if (this.scrollHandler) {
                // 移除容器监听
                if (this.listeningContainer) {
                    this.listeningContainer.removeEventListener('scroll', this.scrollHandler);
                    this.listeningContainer = null;
                }
                // 移除 window 监听
                window.removeEventListener('scroll', this.scrollHandler, { capture: true });
                this.scrollHandler = null;
            }
        }

        /**
         * 重启记录（用于会话切换时重新绑定滚动容器）
         */
        restartRecording() {
            this.stopRecording();
            this.startRecording();
        }

        handleScroll() {
            if (!this.settings || !this.settings.readingHistory || !this.settings.readingHistory.persistence) return;

            const now = Date.now();
            if (now - this.lastSaveTime > 1000) {
                this.saveProgress();
                this.lastSaveTime = now;
            }
        }

        getKey() {
            // 使用 siteAdapter 提供的统一 Session ID，保持 Key 简洁且与其他功能逻辑一致
            const sessionId = this.scrollManager.siteAdapter.getSessionId();
            const siteId = this.scrollManager.siteAdapter.getSiteId();
            return `${siteId}:${sessionId}`;
        }

        saveProgress() {
            if (!this.isRecording) return;
            // 新对话页面不记录阅读历史
            if (this.scrollManager.siteAdapter.isNewConversation()) return;

            const scrollTop = this.scrollManager.scrollTop;
            if (scrollTop < 0) return;

            const key = this.getKey();

            // 获取基于内容的锚点信息 (增强准确性)
            let anchorInfo = {};
            try {
                if (this.scrollManager.siteAdapter.getVisibleAnchorElement) {
                    anchorInfo = this.scrollManager.siteAdapter.getVisibleAnchorElement();
                }
            } catch (err) {
                // console.error('Error getting visible anchor element:', err);
            }

            const data = {
                top: scrollTop,
                ts: Date.now(),
                ...(anchorInfo ? anchorInfo : {}),
            };

            const allData = GM_getValue('gemini_reading_progress', {});
            allData[key] = data;
            GM_setValue('gemini_reading_progress', allData);
        }

        /**
         * 恢复阅读进度 (包含智能回溯逻辑)
         * @param {Function} showToastFunc - 用于显示进度提示的回调
         * @returns {Promise<boolean>} 是否恢复成功
         */
        async restoreProgress(showToastFunc) {
            if (!this.settings.readingHistory.autoRestore) return false;

            const key = this.getKey();
            const allData = GM_getValue('gemini_reading_progress', {});
            const data = allData[key];

            if (!data) return false;

            // scrollManager.container 是 getter，每次访问自动获取最新容器
            const scrollContainer = this.scrollManager.container;
            if (!scrollContainer) return false;

            // 智能回溯恢复逻辑
            return new Promise((resolve) => {
                let historyLoadAttempts = 0;
                const maxHistoryLoadAttempts = 5;
                let lastScrollHeight = 0; // 用于检测历史是否加载成功

                const tryScroll = (attempts = 0) => {
                    if (attempts > 30) {
                        // 超过最大尝试次数，使用像素位置作为最终降级
                        if (data.top !== undefined && scrollContainer.scrollHeight >= data.top) {
                            this.scrollManager.scrollTo({ top: data.top, behavior: 'instant' });
                            this.restoredTop = data.top;
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                        return;
                    }

                    // 1. 尝试基于内容的精准恢复
                    let contentRestored = false;
                    try {
                        if (data.type && this.scrollManager.siteAdapter.restoreScroll) {
                            contentRestored = this.scrollManager.siteAdapter.restoreScroll(data);
                        }
                    } catch (err) {
                        console.error('Error restoring content anchor:', err);
                    }

                    if (contentRestored) {
                        // 内容恢复成功
                        this.restoredTop = scrollContainer.scrollTop;
                        resolve(true);
                        return;
                    }

                    // 2. 内容恢复失败，需要尝试加载更多历史
                    const currentScrollHeight = scrollContainer.scrollHeight;
                    const heightChanged = currentScrollHeight !== lastScrollHeight;
                    lastScrollHeight = currentScrollHeight;

                    // 判断是否需要/可以继续加载历史
                    const hasContentAnchor = data.type && (data.textSignature || data.selector);
                    const needsMoreHistory = hasContentAnchor || (data.top !== undefined && currentScrollHeight < data.top);
                    const canLoadMore = historyLoadAttempts < maxHistoryLoadAttempts;

                    if (needsMoreHistory && canLoadMore) {
                        // 触发历史加载
                        if (showToastFunc) showToastFunc(`正在加载历史会话 (${historyLoadAttempts + 1}/${maxHistoryLoadAttempts})...`);

                        // 滚动到顶部触发懒加载
                        this.scrollManager.scrollTo({ top: 0, behavior: 'instant' });

                        historyLoadAttempts++;
                        // 等待页面加载新内容
                        setTimeout(() => tryScroll(attempts + 1), 2000);
                    } else if (data.top !== undefined && currentScrollHeight >= data.top) {
                        // 没有内容锚点或已用尽回溯机会，但像素位置可用
                        this.scrollManager.scrollTo({ top: data.top, behavior: 'instant' });
                        this.restoredTop = data.top;
                        resolve(true);
                    } else if (!canLoadMore && hasContentAnchor) {
                        // 回溯机会用尽但仍有内容锚点，尝试最后一次快速重试
                        setTimeout(() => tryScroll(attempts + 1), 500);
                    } else {
                        // 无法恢复
                        resolve(false);
                    }
                };

                tryScroll();
            });
        }

        // 清理逻辑
        cleanup() {
            const lastRun = GM_getValue('gemini_progress_cleanup_last_run', 0);
            const now = Date.now();
            if (now - lastRun < 24 * 60 * 60 * 1000) return; // 每天一次

            const days = this.settings.readingHistory.cleanupDays || 7;
            if (days === -1) return;

            const expireTime = days * 24 * 60 * 60 * 1000;
            const allData = GM_getValue('gemini_reading_progress', {});
            let changed = false;

            Object.keys(allData).forEach((k) => {
                if (now - allData[k].ts > expireTime) {
                    delete allData[k];
                    changed = true;
                }
            });

            if (changed) GM_setValue('gemini_reading_progress', allData);
            GM_setValue('gemini_progress_cleanup_last_run', now);
        }
    }

    /**
     * 智能锚点管理器 (Smart Session Anchor)
     * 负责会话内的临时跳转锚点
     */
    /**
     * 智能锚点管理器 (Smart Session Anchor)
     * 负责会话内的临时跳转锚点
     */
    class AnchorManager {
        constructor(scrollManager, i18nFunc) {
            this.scrollManager = scrollManager;
            this.t = i18nFunc;
            // 双位置交换：类似 git switch -
            this.previousAnchor = null; // 上一个位置（跳转前）
            this.currentAnchor = null; // 当前锚点（跳转目标）
            this.onAnchorChange = null; // UI 更新回调
        }

        // 设置回调
        bindUI(callback) {
            this.onAnchorChange = callback;
        }

        // 获取当前位置的完整锚点信息
        _captureCurrentPosition() {
            let anchorInfo = {};
            try {
                if (this.scrollManager.siteAdapter.getVisibleAnchorElement) {
                    anchorInfo = this.scrollManager.siteAdapter.getVisibleAnchorElement();
                }
            } catch (err) {}

            return {
                top: this.scrollManager.scrollTop,
                ts: Date.now(),
                ...anchorInfo,
            };
        }

        // 记录锚点 (跳转前调用，保存当前位置)
        setAnchor(top) {
            let anchorInfo = {};
            try {
                if (this.scrollManager.siteAdapter.getVisibleAnchorElement) {
                    anchorInfo = this.scrollManager.siteAdapter.getVisibleAnchorElement();
                }
            } catch (err) {}

            // 保存当前位置为"上一个锚点"
            this.previousAnchor = {
                top: top,
                ts: Date.now(),
                ...anchorInfo,
            };

            if (this.onAnchorChange) this.onAnchorChange(true);
        }

        // 跳转到锚点（同时实现位置交换，支持来回跳转）
        backToAnchor() {
            if (!this.previousAnchor) return false;

            const scrollContainer = this.scrollManager.container;
            if (!scrollContainer) return false;

            // 1. 先保存当前位置（跳转后可以再跳回来）
            const currentPos = this._captureCurrentPosition();

            // 2. 尝试跳转到 previousAnchor
            let jumped = false;

            // 2.1 尝试基于内容的精准恢复
            try {
                if (this.previousAnchor.type && this.scrollManager.siteAdapter.restoreScroll) {
                    jumped = this.scrollManager.siteAdapter.restoreScroll(this.previousAnchor);
                }
            } catch (err) {
                console.error('Error restoring anchor:', err);
            }

            // 2.2 降级：像素位置
            if (!jumped && this.previousAnchor.top !== undefined) {
                this.scrollManager.scrollTo({ top: this.previousAnchor.top, behavior: 'instant' });
                jumped = true;
            }

            if (jumped) {
                // 3. 交换位置：实现来回跳转
                // 原来的 previousAnchor 变成 currentAnchor（备用）
                // 刚才的位置变成新的 previousAnchor（下次跳回去）
                this.currentAnchor = this.previousAnchor;
                this.previousAnchor = currentPos;
            }

            return jumped;
        }

        // 检查是否有锚点
        hasAnchor() {
            return this.previousAnchor !== null;
        }

        // 重置锚点（用于会话切换）
        reset() {
            this.previousAnchor = null;
            this.currentAnchor = null;
            if (this.onAnchorChange) this.onAnchorChange(false);
        }
    }

    /**
     * 通用会话管理器
     * 负责会话列表的 UI 渲染、文件夹管理和交互
     * Phase 1: 骨架版本，仅显示占位内容
     */
    class ConversationManager {
        constructor(config) {
            this.container = config.container;
            this.settings = config.settings;
            this.siteAdapter = config.siteAdapter;
            this.t = config.i18n || ((k) => k);
            this.isActive = false;
            this.data = null; // 会话数据
            this.expandedFolderId = null; // 记忆当前展开的文件夹（手风琴模式，只展开一个）
            this.selectedIds = new Set(); // 批量选中的会话 ID
            this.batchMode = false; // 批量模式开关
            this.searchQuery = ''; // 搜索关键词
            this.searchResult = null; // 搜索结果 { folderMatches, conversationMatches, totalCount }

            this.init();
        }

        init() {
            this.loadData();
            this.createUI();
            this.startSidebarObserver();
        }

        /**
         * 启动侧边栏实时监听
         * 使用 DOMToolkit.each 监听新会话添加
         */
        startSidebarObserver() {
            if (this.sidebarObserverStop) return; // 已经在监听

            // 获取适配器提供的配置
            const config = this.siteAdapter.getConversationObserverConfig();
            if (!config) return; // 站点不支持侧边栏监听

            // 保存配置供其他方法使用
            this.observerConfig = config;

            // 延迟启动函数（等待侧边栏 DOM 加载完成）
            const startObserver = (retryCount = 0) => {
                const maxRetries = 5; // 最多重试5次
                const retryDelay = 1000; // 每次重试间隔1秒

                // 确定监听起点：始终使用最精确的容器，让 Observer 能监听 Shadow DOM 内部的变化
                const sidebarContainer = this.siteAdapter.getSidebarScrollContainer() || document;

                // 对于需要 Shadow DOM 穿透的站点，检查侧边栏容器是否已加载
                // 如果返回的是 document，说明没找到特定容器，可能还要等待 (除非原本就是 document)
                if (config.shadow && retryCount < maxRetries) {
                    const foundContainer = this.siteAdapter.getSidebarScrollContainer();
                    if (!foundContainer) {
                        // 侧边栏还未加载，延迟重试
                        setTimeout(() => startObserver(retryCount + 1), retryDelay);
                        return;
                    }
                }

                // 保存当前从属的容器，用于后续存活检测 (Zombie Check)
                this.observerContainer = sidebarContainer;

                // 侧边栏已加载或达到最大重试次数，开始监听
                this.sidebarObserverStop = DOMToolkit.each(
                    config.selector,
                    (el, isNew) => {
                        // 尝试提取 ID，如果失败则重试（因为新会话可能属性延迟生成）
                        const tryAdd = (retries = 5) => {
                            const info = config.extractInfo(el);

                            if (info?.id) {
                                const existing = this.data.conversations[info.id];
                                // 仅对新发现的元素尝试添加到数据（如果是全新的会话）
                                if (isNew && !existing) {
                                    // 自动添加新会话到当前选中文件夹
                                    const folderId = this.data.lastUsedFolderId || 'inbox';
                                    this.data.conversations[info.id] = {
                                        id: info.id,
                                        siteId: this.siteAdapter.getSiteId(),
                                        cid: info.cid || null,
                                        title: info.title || 'New Conversation',
                                        url: info.url,
                                        folderId: folderId,
                                        pinned: info.isPinned || false, // 同步云端置顶状态
                                        createdAt: Date.now(),
                                        updatedAt: Date.now(),
                                    };
                                    this.saveData();
                                    // 轻量级更新计数（避免重建整个 UI 丢失展开状态）
                                    this.updateFolderCount(folderId);
                                } else if (existing) {
                                    // 对已存在的会话，同步 pinned 状态变化
                                    if (info.isPinned && !existing.pinned) {
                                        // 云端置顶 -> 本地也置顶
                                        existing.pinned = true;
                                        existing.updatedAt = Date.now();
                                        this.saveData();
                                        this.createUI();
                                    } else if (!info.isPinned && existing.pinned && this.settings?.conversations?.syncUnpin) {
                                        // 云端取消置顶且开启了 syncUnpin -> 本地也取消置顶
                                        existing.pinned = false;
                                        existing.updatedAt = Date.now();
                                        this.saveData();
                                        this.createUI();
                                    }
                                }

                                // 对所有会话（无论新旧）启动标题变更监听
                                this.monitorConversationTitle(el, info.id);
                            } else if (retries > 0) {
                                setTimeout(() => tryAdd(retries - 1), 500);
                            }
                        };

                        tryAdd();
                    },
                    { parent: sidebarContainer, shadow: config.shadow },
                );
            };

            // 启动观察器
            startObserver();

            // 补充：仅对 Shadow DOM 站点启用轮询（Observer 可能因 DOM 复用/替换而失效）
            // 普通站点的 Observer 工作正常，无需轮询
            if (config.shadow) {
                this.pollNewConversations();
            }
        }

        /**
         * 检查侧边栏监听器是否仍然有效 (Zombie Check)
         * 如果容器被销毁（Detached），则重启监听器
         */
        checkObserverStatus() {
            // 如果监听器已停止，不需要检查
            if (!this.sidebarObserverStop) return;

            // 如果容器存在但已失去连接 (isConnected === false)，说明变成了僵尸监听器
            if (this.observerContainer && !this.observerContainer.isConnected) {
                console.log('Gemini Helper: Sidebar container detached. Restarting observer...');
                this.stopSidebarObserver();
                // 给予一点延迟等待新容器就绪
                setTimeout(() => this.startSidebarObserver(), 500);
            }
        }

        /**
         * 轮询检测新会话
         * 作为 MutationObserver 的补充机制
         */
        pollNewConversations() {
            if (this.pollInterval) return; // 已在轮询

            this.pollInterval = setInterval(() => {
                if (!this.observerConfig) return;

                const config = this.observerConfig;
                const elements = DOMToolkit.query(config.selector, { all: true, shadow: config.shadow });

                elements.forEach((el) => {
                    const info = config.extractInfo(el);
                    if (info?.id && !this.data.conversations[info.id]) {
                        // 发现未记录的会话
                        const folderId = this.data.lastUsedFolderId || 'inbox';
                        this.data.conversations[info.id] = {
                            id: info.id,
                            siteId: this.siteAdapter.getSiteId(),
                            cid: info.cid || null,
                            title: info.title || 'New Conversation',
                            url: info.url,
                            folderId: folderId,
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                        };
                        this.saveData();
                        this.updateFolderCount(folderId);
                        // 启动标题监听
                        this.monitorConversationTitle(el, info.id);
                    }
                });
            }, 3000);
        }

        /**
         * 停止轮询
         */
        stopPolling() {
            if (this.pollInterval) {
                clearInterval(this.pollInterval);
                this.pollInterval = null;
            }
        }

        /**
         * 监听会话标题和 pin 状态变化
         * 使用共享的 watchMultiple 减少 Observer 数量
         * @param {HTMLElement} el 会话元素
         * @param {string} id 会话ID
         */
        monitorConversationTitle(el, id) {
            // 防止重复监听
            if (el.dataset.ghTitleObserver) return;
            el.dataset.ghTitleObserver = 'true';

            // 确保共享 watcher 已初始化
            if (!this.titleWatcher) {
                const container = this.siteAdapter.getSidebarScrollContainer() || document.body;
                this.titleWatcher = DOMToolkit.watchMultiple(container, { debounce: 500 });
            }

            // 监听整个会话元素（以便检测标题和 pin 状态变化）
            this.titleWatcher.add(el, () => {
                // 每次回调时重新从元素提取信息，确保 ID 匹配
                const currentInfo = this.observerConfig?.extractInfo?.(el);
                const currentId = currentInfo?.id;

                if (!currentId || currentId !== id) {
                    // ID 不匹配则跳过（防止元素被复用时错误更新）
                    return;
                }

                const stored = this.data.conversations[currentId];
                if (!stored) return;

                let needsSave = false;
                let needsUIRefresh = false;

                // 检测标题变化
                const currentTitle = currentInfo?.title;
                if (currentTitle && stored.title !== currentTitle) {
                    console.log(`[Gemini Helper] Title changed for ${currentId}: "${stored.title}" -> "${currentTitle}". Updating local copy.`);
                    stored.title = currentTitle;
                    stored.updatedAt = Date.now();
                    needsSave = true;
                    needsUIRefresh = true;
                }

                // 检测 pin 状态变化
                const currentPinned = currentInfo?.isPinned || false;
                if (currentPinned && !stored.pinned) {
                    // 云端置顶 -> 本地也置顶
                    console.log(`[Gemini Helper] Pinned status changed for ${currentId}: unpinned -> pinned. Updating local copy.`);
                    stored.pinned = true;
                    stored.updatedAt = Date.now();
                    needsSave = true;
                    needsUIRefresh = true;
                } else if (!currentPinned && stored.pinned && this.settings?.conversations?.syncUnpin) {
                    // 云端取消置顶且开启了 syncUnpin -> 本地也取消置顶
                    console.log(`[Gemini Helper] Pinned status changed for ${currentId}: pinned -> unpinned. Updating local copy (syncUnpin enabled).`);
                    stored.pinned = false;
                    stored.updatedAt = Date.now();
                    needsSave = true;
                    needsUIRefresh = true;
                }

                if (needsSave) {
                    this.saveData();
                }
                if (needsUIRefresh) {
                    this.createUI();
                }
            });
        }

        /**
         * 停止侧边栏监听
         */
        stopSidebarObserver() {
            if (this.sidebarObserverStop) {
                this.sidebarObserverStop();
                this.sidebarObserverStop = null;
            }
            // 清理容器引用
            this.observerContainer = null;

            // 清理共享的标题监听器
            if (this.titleWatcher) {
                this.titleWatcher.stop();
                this.titleWatcher = null;
            }
            // 清理轮询
            this.stopPolling();
        }

        /**
         * 轻量级更新文件夹计数（不重建 UI）
         * 同时刷新已展开文件夹的会话列表
         */
        updateFolderCount(folderId) {
            const folderItem = this.container?.querySelector(`.conversations-folder-item[data-folder-id="${folderId}"]`);
            if (folderItem) {
                // 获取当前 CID（仅 Gemini Business 有效）
                const currentCid = this.siteAdapter.getCurrentCid ? this.siteAdapter.getCurrentCid() : null;
                const count = Object.values(this.data.conversations).filter((c) => c.folderId === folderId && this.matchesCid(c, currentCid)).length;
                const countSpan = folderItem.querySelector('.conversations-folder-count');
                if (countSpan) countSpan.textContent = `(${count})`;

                // 如果该文件夹已展开，同时刷新会话列表
                if (folderItem.classList.contains('expanded')) {
                    const conversationList = this.container?.querySelector(`.conversations-list[data-folder-id="${folderId}"]`);
                    if (conversationList) {
                        this.renderConversationList(folderId, conversationList);
                    }
                }
            }
        }

        /**
         * 激活会话 Tab 时调用
         */
        activate() {
            this.isActive = true;
            this.syncConversations(null, true); // 切换进来时静默同步一次
            this.createUI();
        }

        /**
         * 停用会话 Tab 时调用
         */
        deactivate() {
            this.isActive = false;
        }

        /**
         * 获取全局存储键
         * 注意：文件夹和标签全局共用，会话通过 cid 字段区分不同团队
         */
        getStorageKey() {
            return SETTING_KEYS.CONVERSATIONS;
        }

        /**
         * 加载会话数据
         */
        loadData() {
            const key = this.getStorageKey();
            const saved = GM_getValue(key, null);
            if (saved) {
                this.data = { ...DEFAULT_CONVERSATION_DATA, ...saved };
            } else {
                this.data = JSON.parse(JSON.stringify(DEFAULT_CONVERSATION_DATA));
            }
        }

        /**
         * 保存会话数据
         */
        saveData() {
            const key = this.getStorageKey();
            GM_setValue(key, this.data);
        }

        /**
         * 上移文件夹
         * @param {string} folderId 文件夹 ID
         */
        moveFolderUp(folderId) {
            const index = this.data.folders.findIndex((f) => f.id === folderId);
            // index 0 是收件箱（固定），index 1 是第一个可移动的
            if (index <= 1) return;
            // 与上一个交换位置
            [this.data.folders[index - 1], this.data.folders[index]] = [this.data.folders[index], this.data.folders[index - 1]];
            this.saveData();
            this.createUI();
        }

        /**
         * 下移文件夹
         * @param {string} folderId 文件夹 ID
         */
        moveFolderDown(folderId) {
            const index = this.data.folders.findIndex((f) => f.id === folderId);
            if (index <= 0 || index >= this.data.folders.length - 1) return;
            // 与下一个交换位置
            [this.data.folders[index], this.data.folders[index + 1]] = [this.data.folders[index + 1], this.data.folders[index]];
            this.saveData();
            this.createUI();
        }

        /**
         * 创建文件夹
         * @param {string} name 文件夹名称
         * @param {string} icon 图标 emoji
         * @returns {object} 新创建的文件夹
         */
        createFolder(name, icon = '📁') {
            const folder = {
                id: 'folder_' + Date.now(),
                name: `${icon} ${name}`,
                icon: icon,
                isDefault: false,
            };
            this.data.folders.push(folder);
            this.saveData();
            return folder;
        }

        /**
         * 重命名文件夹
         * @param {string} folderId 文件夹 ID
         * @param {string} newName 新名称
         * @param {string} newIcon 新图标
         */
        renameFolder(folderId, newName, newIcon = null) {
            const folder = this.data.folders.find((f) => f.id === folderId);
            if (folder && !folder.isDefault) {
                folder.name = newIcon ? `${newIcon} ${newName}` : newName;
                if (newIcon) folder.icon = newIcon;
                this.saveData();
                return true;
            }
            return false;
        }

        /**
         * 删除文件夹
         * @param {string} folderId 文件夹 ID
         * @returns {boolean} 是否删除成功
         */
        deleteFolder(folderId) {
            const folder = this.data.folders.find((f) => f.id === folderId);
            if (!folder || folder.isDefault) {
                showToast(this.t('conversationsCannotDeleteDefault') || '无法删除默认文件夹');
                return false;
            }
            // 将文件夹内的会话移到收件箱
            Object.values(this.data.conversations).forEach((conv) => {
                if (conv.folderId === folderId) {
                    conv.folderId = 'inbox';
                }
            });
            this.data.folders = this.data.folders.filter((f) => f.id !== folderId);
            this.saveData();
            return true;
        }

        /**
         * 从侧边栏同步会话（增量）
         * @param {string} targetFolderId 可选，指定目标文件夹
         * @param {boolean} silent 是否静默同步（不显示 Toast）
         * @param {boolean} checkForDeletions 是否检查并删除失效会话（仅全量同步时启用）
         */
        syncConversations(targetFolderId = null, silent = false, checkForDeletions = false) {
            const sidebarItems = this.siteAdapter.getConversationList();

            if (!sidebarItems || sidebarItems.length === 0) {
                if (!silent) showToast(this.t('conversationsSyncEmpty') || '未找到会话');
                return;
            }

            // 获取当前 CID（仅 Gemini Business 有效）
            const currentCid = sidebarItems[0]?.cid || null;

            // 检查是否有已保存的会话（初次同步判断）
            // 注意：需要按当前 CID 过滤，避免其他团队的数据干扰判断
            const existingConvCount = Object.values(this.data.conversations).filter((c) => this.matchesCid(c, currentCid)).length;
            const isFirstSync = existingConvCount === 0;

            // 初次同步且未指定目标文件夹：弹窗让用户选择
            if (isFirstSync && !targetFolderId) {
                if (!silent) {
                    this.showFolderSelectDialog((selectedFolderId) => {
                        this.syncConversations(selectedFolderId, false);
                    });
                }
                return;
            }

            let newCount = 0;
            let updatedCount = 0;
            const now = Date.now();
            const folderId = targetFolderId || this.data.lastUsedFolderId || 'inbox';

            sidebarItems.forEach((item) => {
                // Key 始终用 sessionId（cid 和 siteId 存储在对象属性中）
                const storageKey = item.id;

                const existing = this.data.conversations[storageKey];
                if (existing) {
                    // 更新已有会话的标题（可能被用户修改）
                    if (existing.title !== item.title) {
                        existing.title = item.title;
                        existing.updatedAt = now;
                        updatedCount++;
                    }
                    // 同步云端置顶状态
                    if (item.isPinned && !existing.pinned) {
                        // 云端置顶 -> 本地也置顶
                        existing.pinned = true;
                        existing.updatedAt = now;
                        updatedCount++;
                    } else if (!item.isPinned && existing.pinned && this.settings?.conversations?.syncUnpin) {
                        // 云端未置顶且开启了 syncUnpin -> 本地取消置顶
                        existing.pinned = false;
                        existing.updatedAt = now;
                        updatedCount++;
                    }
                    // 确保 siteId 和 cid 是最新的
                    if (!existing.siteId) existing.siteId = this.siteAdapter.getSiteId();
                    if (item.cid && !existing.cid) existing.cid = item.cid;
                } else {
                    // 新会话：添加到指定文件夹
                    this.data.conversations[storageKey] = {
                        id: item.id,
                        siteId: this.siteAdapter.getSiteId(), // 记录所属站点
                        cid: item.cid || null, // 记录所属团队（Gemini Business）
                        title: item.title,
                        url: item.url,
                        folderId: folderId,
                        pinned: item.isPinned || false, // 同步云端置顶状态
                        createdAt: now,
                        updatedAt: now,
                    };
                    newCount++;
                }
            });

            // 记住用户选择
            if (targetFolderId) {
                this.data.lastUsedFolderId = targetFolderId;
            }

            // 有变更才保存和刷新
            if (newCount > 0 || updatedCount > 0) {
                this.saveData();
                this.createUI();
            }

            // 检查已删除的会话（仅检查当前站点+CID 下的会话）
            if (checkForDeletions) {
                // 远程会话的 ID 集合
                const remoteIds = new Set(sidebarItems.map((item) => item.id));

                // 本地当前站点+CID 的会话 ID（通过对象属性过滤）
                const localIdsForCurrentContext = Object.entries(this.data.conversations)
                    .filter(([, conv]) => this.matchesCid(conv, currentCid))
                    .map(([key]) => key);

                // 找出本地有但远程没有的（当前站点+CID 范围内）
                const missingIds = localIdsForCurrentContext.filter((id) => !remoteIds.has(id));

                if (missingIds.length > 0) {
                    const msg = (this.t('conversationsSyncDeleteMsg') || '检测到 {count} 个会话已在云端删除，是否同步删除本地记录？').replace('{count}', missingIds.length);
                    this.showConfirmDialog(this.t('conversationsSyncDeleteTitle') || '同步删除', msg, () => {
                        missingIds.forEach((id) => delete this.data.conversations[id]);
                        this.saveData();
                        this.createUI();
                        showToast(`${this.t('conversationsDeleted') || '已移除'} ${missingIds.length}`);
                    });
                }
            }

            if (!silent) {
                if (newCount > 0 || updatedCount > 0) {
                    showToast(`${this.t('conversationsSynced') || '同步完成'}：+${newCount} ↻${updatedCount}`);
                } else {
                    showToast(this.t('conversationsSyncNoChange') || '无新会话');
                }
            }
        }

        /**
         * 检查会话是否属于当前站点和团队
         * @param {Object} conv 会话对象
         * @param {string|null} currentCid 当前团队 ID (Gemini Business)
         * @returns {boolean}
         */
        matchesCid(conv, currentCid) {
            // 1. 首先检查站点匹配
            const currentSiteId = this.siteAdapter.getSiteId();
            // 如果会话有 siteId 且不匹配当前站点，排除
            if (conv.siteId && conv.siteId !== currentSiteId) {
                return false;
            }

            // 2. 检查 CID 匹配
            // 如果当前无 CID（非 Gemini Business 或无团队），显示无 CID 的会话和旧数据
            if (!currentCid) return !conv.cid;
            // 如果会话没有 cid（旧数据），显示它
            if (!conv.cid) return true;
            // 否则严格匹配 CID
            return conv.cid === currentCid;
        }

        /**
         * 显示文件夹选择对话框
         */
        showFolderSelectDialog(onSelect) {
            const overlay = createElement('div', { className: 'conversations-dialog-overlay' });

            const dialog = createElement('div', { className: 'conversations-dialog' });
            dialog.appendChild(createElement('div', { className: 'conversations-dialog-title' }, this.t('conversationsSelectFolder') || '选择同步目标文件夹'));

            // 文件夹列表
            const list = createElement('div', { className: 'conversations-folder-select-list' });
            this.data.folders.forEach((folder) => {
                const item = createElement(
                    'div',
                    {
                        className: 'conversations-folder-select-item',
                        'data-folder-id': folder.id,
                    },
                    `${folder.icon} ${folder.name}`,
                );
                item.addEventListener('click', () => {
                    overlay.remove();
                    onSelect(folder.id);
                });
                list.appendChild(item);
            });
            dialog.appendChild(list);

            // 取消按钮
            const btns = createElement('div', { className: 'conversations-dialog-buttons' });
            const cancelBtn = createElement('button', { className: 'conversations-dialog-btn cancel' }, this.t('cancel') || '取消');
            cancelBtn.addEventListener('click', () => overlay.remove());
            btns.appendChild(cancelBtn);
            dialog.appendChild(btns);

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
        }

        /**
         * 显示确认对话框
         */
        showConfirmDialog(title, message, onConfirm) {
            const overlay = createElement('div', { className: 'conversations-dialog-overlay' });

            const dialog = createElement('div', { className: 'conversations-dialog' });
            dialog.appendChild(createElement('div', { className: 'conversations-dialog-title' }, title));

            const msgDiv = createElement('div', { className: 'conversations-dialog-message' }, message);
            dialog.appendChild(msgDiv);

            // 按钮
            const btns = createElement('div', { className: 'conversations-dialog-buttons' });

            const cancelBtn = createElement('button', { className: 'conversations-dialog-btn cancel' }, this.t('cancel') || '取消');
            cancelBtn.addEventListener('click', () => overlay.remove());
            btns.appendChild(cancelBtn);

            const confirmBtn = createElement('button', { className: 'conversations-dialog-btn confirm' }, this.t('confirm') || '确定');
            confirmBtn.addEventListener('click', () => {
                overlay.remove();
                onConfirm();
            });
            btns.appendChild(confirmBtn);

            dialog.appendChild(btns);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
        }

        /**
         * 创建会话面板 UI
         */
        createUI() {
            const container = this.container;
            clearElement(container);

            // 注入样式修复
            const fixStyle = createElement('style');
            fixStyle.textContent = `
                .conversations-folder-item.expanded {
                    border-bottom-left-radius: 0 !important;
                    border-bottom-right-radius: 0 !important;
                    border-bottom: none !important;
                }
                .conversations-list {
                    width: 100% !important;
                    box-sizing: border-box !important;
                    margin: 0 !important;
                    border-top-left-radius: 0 !important;
                    border-top-right-radius: 0 !important;
                    border-top: none !important;
                }

                /* 统一工具栏按钮风格 (Ghost Button - 仿大纲 Tab) */
                .conversations-toolbar-btn {
                    background: transparent !important;
                    border: 1px solid transparent !important;
                    box-shadow: none !important;
                    color: var(--gh-text-secondary, #6b7280) !important;
                    border-radius: 6px !important;
                    transition: all 0.2s ease !important;
                    min-width: 28px !important; /* 更紧凑的尺寸 */
                    height: 28px !important;
                    margin: 0 !important; /* 移除额外间距 */
                    padding: 0 !important;
                }
                .conversations-toolbar-btn:hover {
                    background: rgba(127, 127, 127, 0.15) !important; /* 通用半透明背景，适配深浅色 */
                    color: var(--gh-text, #374151) !important;
                }
                .conversations-toolbar-btn.active {
                    background: var(--gh-primary, #3b82f6) !important;
                    color: white !important;
                    border-color: var(--gh-primary, #3b82f6) !important;
                }
                /* 修复 SVG 颜色 */
                .conversations-toolbar-btn svg {
                    fill: currentColor !important;
                    width: 16px !important; /* 稍微调小图标以适配紧凑按钮 */
                    height: 16px !important;
                }
            `;
            container.appendChild(fixStyle);

            const content = createElement('div', { className: 'conversations-content' });

            // 工具栏
            const toolbar = createElement('div', { className: 'conversations-toolbar' });

            // 1. 同步目标选择 (左侧)
            const folderSelect = createElement('select', {
                className: 'conversations-folder-select',
                id: 'conversations-folder-select',
                title: this.t('conversationsSelectFolder') || 'Select folder',
            });
            this.data.folders.forEach((folder) => {
                // 截断过长的文件夹名称，避免下拉菜单溢出
                const truncatedName = folder.name.length > 20 ? folder.name.slice(0, 20) + '...' : folder.name;
                const option = createElement('option', { value: folder.id, title: folder.name }, truncatedName);
                if (folder.id === (this.data.lastUsedFolderId || 'inbox')) {
                    option.selected = true;
                }
                folderSelect.appendChild(option);
            });
            folderSelect.addEventListener('change', () => {
                this.data.lastUsedFolderId = folderSelect.value;
                this.saveData();
            });
            toolbar.appendChild(folderSelect);

            // 定义局部 helper 创建 SVG
            const createSVG = (pathData) => {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('viewBox', '0 0 24 24');
                svg.setAttribute('fill', 'currentColor');
                svg.setAttribute('width', '18');
                svg.setAttribute('height', '18');
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', pathData);
                svg.appendChild(path);
                return svg;
            };

            const SYNC_PATH =
                'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z';
            const HOURGLASS_PATH = 'M6 2v6h.01L6 8.01 10 12l-4 4 .01.01H6V22h12v-5.99h-.01L18 16l-4-4 4-3.99-.01-.01H18V2H6zm10 14.5V20H8v-3.5l4-4 4 4zm-4-5l-4-4V4h8v3.5l-4 4z';
            const CHECK_BOX_PATH = 'M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z';
            const LOCATE_PATH =
                'M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z';
            const ADD_FOLDER_PATH = 'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z';

            // 2. 同步按钮
            const syncBtn = createElement('button', {
                className: 'conversations-toolbar-btn sync',
                id: 'conversations-sync-btn',
                title: this.t('conversationsSync'),
                style: 'display: flex; align-items: center; justify-content: center;',
            });
            syncBtn.appendChild(createSVG(SYNC_PATH));
            syncBtn.addEventListener('click', async () => {
                syncBtn.disabled = true;
                clearElement(syncBtn);
                syncBtn.appendChild(createSVG(HOURGLASS_PATH));

                await this.siteAdapter.loadAllConversations();
                this.syncConversations(folderSelect.value, false, true);

                syncBtn.disabled = false;
                clearElement(syncBtn);
                syncBtn.appendChild(createSVG(SYNC_PATH));
            });
            toolbar.appendChild(syncBtn);

            // 3. 定位当前对话按钮
            const locateBtn = createElement('button', {
                className: 'conversations-toolbar-btn locate',
                id: 'conversations-locate-btn',
                title: this.t('conversationsLocate'),
                style: 'display: flex; align-items: center; justify-content: center;',
            });
            locateBtn.appendChild(createSVG(LOCATE_PATH));
            locateBtn.addEventListener('click', () => this.locateCurrentConversation());
            toolbar.appendChild(locateBtn);

            // 4. 批量模式按钮
            const batchModeBtn = createElement('button', {
                className: 'conversations-toolbar-btn batch-mode' + (this.batchMode ? ' active' : ''),
                title: this.t('conversationsBatchMode') || '批量操作',
                id: 'conversations-batch-mode-btn',
                style: 'display: flex; align-items: center; justify-content: center;',
            });
            batchModeBtn.appendChild(createSVG(CHECK_BOX_PATH));
            batchModeBtn.addEventListener('click', () => this.toggleBatchMode());
            toolbar.appendChild(batchModeBtn);

            // 5. 新建文件夹按钮
            const addFolderBtn = createElement('button', {
                className: 'conversations-toolbar-btn add-folder',
                title: this.t('conversationsAddFolder') || 'New Folder',
                style: 'display: flex; align-items: center; justify-content: center;',
            });
            addFolderBtn.appendChild(createSVG(ADD_FOLDER_PATH));
            addFolderBtn.addEventListener('click', () => this.showCreateFolderDialog());
            toolbar.appendChild(addFolderBtn);

            content.appendChild(toolbar);

            // 搜索栏
            const searchBar = createElement('div', { className: 'conversations-search-bar' });
            const searchWrapper = createElement('div', { className: 'conversations-search-wrapper' });

            const searchInput = createElement('input', {
                type: 'text',
                className: 'conversations-search-input',
                id: 'conversations-search-input',
                placeholder: this.t('conversationsSearchPlaceholder') || '搜索会话...',
                value: this.searchQuery || '',
            });

            // 注入 placeholder 防选中样式
            const placeholderStyle = document.createElement('style');
            placeholderStyle.textContent = `
                .conversations-search-input::-webkit-input-placeholder { user-select: none; }
                .conversations-search-input::placeholder { user-select: none; }
            `;
            searchWrapper.appendChild(placeholderStyle);

            // 搜索输入防抖处理
            let searchTimeout = null;
            searchInput.addEventListener('input', () => {
                updateClearBtn();
                if (searchTimeout) clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.handleSearch(searchInput.value.trim());
                }, 150);
            });

            // Input Group (Input Only)
            const inputGroup = createElement('div', { className: 'conversations-search-input-group' });
            inputGroup.appendChild(searchInput);
            searchWrapper.appendChild(inputGroup);

            // 置顶筛选按钮
            const pinFilterBtn = createElement(
                'div',
                {
                    className: 'conversations-pin-filter-btn' + (this.filterPinned ? ' active' : ''),
                    title: this.t('conversationsFilterPinned') || '筛选置顶',
                    style: 'user-select: none;',
                },
                '📌',
            );
            pinFilterBtn.addEventListener('click', () => {
                this.filterPinned = !this.filterPinned;
                pinFilterBtn.classList.toggle('active', this.filterPinned);
                this.handleSearch(this.searchQuery || '');
                updateClearBtn();
            });
            searchWrapper.appendChild(pinFilterBtn);

            // 标签筛选按钮
            const isTagFiltering = this.filterTagIds && this.filterTagIds.size > 0;
            const tagFilterBtn = createElement(
                'div',
                {
                    className: 'conversations-tag-search-btn' + (this.data.tags && this.data.tags.length > 0 ? '' : ' empty') + (isTagFiltering ? ' active' : ''),
                    title: this.t('conversationsFilterByTags') || '按标签筛选',
                    style: 'user-select: none;',
                },
                '🏷️',
            );

            // ... tag filter event listener ...

            tagFilterBtn.addEventListener('click', (e) => {
                // ... existing implementation ...
                e.stopPropagation();

                const existingMenu = document.querySelector('.conversations-tag-filter-menu');
                if (existingMenu) {
                    existingMenu.remove();
                    return;
                }

                const menu = createElement('div', {
                    className: 'conversations-tag-filter-menu',
                    'data-trigger': 'search-filter',
                });
                const list = createElement('div', { className: 'conversations-tag-filter-list' }); // Scrollable area

                // 清除选项
                if (this.filterTagIds && this.filterTagIds.size > 0) {
                    const clearItem = createElement('div', { className: 'conversations-tag-filter-item' });
                    clearItem.textContent = this.t('conversationsClearTags') || '清除筛选';
                    clearItem.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.filterTagIds.clear();
                        tagFilterBtn.classList.remove('active');
                        menu.remove();
                        this.handleSearch(this.searchQuery);
                        updateClearBtn();
                    });
                    list.appendChild(clearItem);
                }

                if (this.data.tags) {
                    this.data.tags.forEach((tag) => {
                        const item = createElement('div', { className: 'conversations-tag-filter-item' });
                        if (this.filterTagIds && this.filterTagIds.has(tag.id)) {
                            item.classList.add('selected');
                        }

                        const dot = createElement('span', {
                            className: 'conversations-tag-dot',
                            style: `background-color: ${tag.color}`,
                        });
                        item.appendChild(dot);

                        // Tag Name Span
                        const nameSpan = createElement('span');
                        nameSpan.textContent = tag.name;
                        item.appendChild(nameSpan);

                        item.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (!this.filterTagIds) this.filterTagIds = new Set();

                            if (this.filterTagIds.has(tag.id)) {
                                this.filterTagIds.delete(tag.id);
                                item.classList.remove('selected');
                            } else {
                                this.filterTagIds.add(tag.id);
                                item.classList.add('selected');
                            }

                            if (this.filterTagIds.size > 0) tagFilterBtn.classList.add('active');
                            else tagFilterBtn.classList.remove('active');

                            this.handleSearch(this.searchQuery);
                            updateClearBtn();
                        });
                        list.appendChild(item);
                    });
                } else {
                    const emptyItem = createElement('div', {
                        className: 'conversations-tag-filter-item',
                        style: 'color:#9ca3af; cursor:default;',
                    });
                    emptyItem.textContent = this.t('conversationsNoTags') || '暂无标签';
                    list.appendChild(emptyItem);
                }

                menu.appendChild(list);

                // Footer Area
                const footer = createElement('div', { className: 'conversations-tag-filter-footer' });

                const manageItem = createElement('div', { className: 'conversations-tag-filter-item conversations-tag-filter-action' });
                manageItem.textContent = this.t('conversationsManageTags') || '管理标签';
                manageItem.addEventListener('click', () => {
                    menu.remove();
                    this.showTagManagerDialog();
                });
                footer.appendChild(manageItem);
                menu.appendChild(footer);

                // IMPORTANT: Append to wrapper for relative positioning
                searchWrapper.appendChild(menu);

                // Click outside to close
                const closeMenu = (e) => {
                    if (!menu.contains(e.target) && e.target !== tagFilterBtn) {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                };
                setTimeout(() => document.addEventListener('click', closeMenu), 0);
            });
            searchWrapper.appendChild(tagFilterBtn);

            // 清空按钮 (Global Clear) - Moved to far right
            // Re-use clearBtn but change its element type/class logic
            const clearBtn = createElement(
                'div',
                {
                    className: 'conversations-search-clear', // Style updated in CSS
                    id: 'conversations-search-clear',
                    title: this.t('conversationsClearAll') || '清除所有筛选',
                },
                '×',
            );

            clearBtn.addEventListener('click', () => {
                if (clearBtn.classList.contains('disabled')) return;
                searchInput.value = '';
                if (this.filterTagIds) this.filterTagIds.clear();
                this.filterPinned = false;
                tagFilterBtn.classList.remove('active');
                pinFilterBtn.classList.remove('active');
                this.handleSearch('');
                updateClearBtn();
            });
            searchWrapper.appendChild(clearBtn);

            // Update clear button visibility helper
            const updateClearBtn = () => {
                const hasText = searchInput.value.length > 0;
                const hasTags = this.filterTagIds && this.filterTagIds.size > 0;
                const hasPinFilter = this.filterPinned;
                const hasFilter = hasText || hasTags || hasPinFilter;

                // Always visible but disabled if no filter
                clearBtn.classList.toggle('disabled', !hasFilter);
            };
            // Check initial state
            updateClearBtn();

            searchBar.appendChild(searchWrapper);

            // 搜索结果计数条
            const resultBar = createElement('div', {
                className: 'conversations-result-bar',
                id: 'conversations-result-bar',
            });
            if (this.searchQuery && this.searchResult) {
                resultBar.textContent = `${this.searchResult.totalCount} ${this.t('conversationsSearchResult') || '个结果'}`;
                resultBar.classList.add('visible');
            }
            searchBar.appendChild(resultBar);

            content.appendChild(searchBar);

            // 文件夹列表
            const folderList = this.createFolderListUI();
            content.appendChild(folderList);

            // 底部批量操作栏（仅批量模式下显示）
            if (this.batchMode) {
                const batchBar = createElement('div', {
                    className: 'conversations-batch-bar',
                    id: 'conversations-batch-bar',
                });
                // 根据选中数量决定是否显示
                batchBar.style.display = this.selectedIds.size > 0 ? 'flex' : 'none';

                const batchInfo = createElement(
                    'span',
                    { className: 'conversations-batch-info', id: 'conversations-batch-info' },
                    (this.t('batchSelected') || '已选 {n} 个').replace('{n}', this.selectedIds.size),
                );
                batchBar.appendChild(batchInfo);

                const batchBtns = createElement('div', { className: 'conversations-batch-btns' });

                // 统一的图标按钮样式
                const iconBtnStyle = 'padding: 4px 6px; min-width: auto; margin-left: 4px;';

                // 1. 复制 Markdown (高频、安全)
                const batchCopyBtn = createElement(
                    'button',
                    {
                        className: 'conversations-batch-btn',
                        title: this.t('exportToClipboard') || '复制 Markdown',
                        style: iconBtnStyle,
                    },
                    '📋',
                );
                batchCopyBtn.addEventListener('click', () => this.exportConversations('clipboard'));
                batchBtns.appendChild(batchCopyBtn);

                // 2. 导出菜单 (高频、安全)
                const batchExportBtn = createElement(
                    'button',
                    {
                        className: 'conversations-batch-btn',
                        title: this.t('batchExport') || '导出',
                        style: iconBtnStyle,
                    },
                    '📤',
                );
                batchExportBtn.addEventListener('click', (e) => this.showExportMenu(e.target));
                batchBtns.appendChild(batchExportBtn);

                // 3. 移动 (管理)
                const batchMoveBtn = createElement(
                    'button',
                    {
                        className: 'conversations-batch-btn',
                        title: this.t('batchMove') || '移动',
                        style: iconBtnStyle,
                    },
                    '📂',
                );
                batchMoveBtn.addEventListener('click', () => this.batchMove());
                batchBtns.appendChild(batchMoveBtn);

                // 4. 删除
                const batchDeleteBtn = createElement(
                    'button',
                    {
                        className: 'conversations-batch-btn danger',
                        title: this.t('batchDelete') || '删除',
                        style: iconBtnStyle,
                    },
                    '🗑️',
                );
                batchDeleteBtn.addEventListener('click', () => this.batchDelete());
                batchBtns.appendChild(batchDeleteBtn);

                // 退出按钮
                const batchCancelBtn = createElement(
                    'button',
                    {
                        className: 'conversations-batch-btn cancel',
                        title: this.t('batchExit') || '退出',
                        style: iconBtnStyle,
                    },
                    '❌',
                );
                batchCancelBtn.addEventListener('click', () => this.clearSelection());
                batchBtns.appendChild(batchCancelBtn);

                batchBar.appendChild(batchBtns);
                content.appendChild(batchBar);
            }

            container.appendChild(content);
        }

        /**
         * 创建文件夹列表 UI
         */
        createFolderListUI() {
            const container = createElement('div', { className: 'conversations-folder-list' });

            if (!this.data || !this.data.folders || this.data.folders.length === 0) {
                const empty = createElement('div', { className: 'conversations-empty' }, this.t('conversationsEmpty'));
                container.appendChild(empty);
                return container;
            }

            // 搜索模式下的过滤逻辑
            const isSearching = !!this.searchResult;
            const { folderMatches, conversationMatches, conversationFolderMap } = this.searchResult || {};

            // 计算搜索时哪些文件夹有匹配的会话（需要展开父级）
            const foldersWithMatchedConversations = new Set();
            if (isSearching && conversationFolderMap) {
                conversationFolderMap.forEach((folderId) => {
                    foldersWithMatchedConversations.add(folderId);
                });
            }

            let hasVisibleItems = false;

            this.data.folders.forEach((folder, index) => {
                // 搜索过滤：判断文件夹是否应该显示
                if (isSearching) {
                    const folderDirectMatch = folderMatches?.has(folder.id);
                    const hasMatchedChildren = foldersWithMatchedConversations.has(folder.id);
                    if (!folderDirectMatch && !hasMatchedChildren) {
                        return; // 跳过不匹配的文件夹
                    }
                }

                hasVisibleItems = true;

                // 文件夹项
                const folderItem = this.createFolderItem(folder, index);
                container.appendChild(folderItem);

                // 搜索时：如果有匹配的会话则自动展开，否则只显示文件夹
                const hasMatchedConvs = isSearching && foldersWithMatchedConversations.has(folder.id);
                const shouldExpand = isSearching ? hasMatchedConvs : this.expandedFolderId === folder.id;

                // 会话列表容器
                const conversationList = createElement('div', {
                    className: 'conversations-list',
                    'data-folder-id': folder.id,
                    style: shouldExpand ? 'display: block;' : 'display: none;',
                });
                container.appendChild(conversationList);

                // 如果需要展开，渲染会话列表
                if (shouldExpand) {
                    folderItem.classList.add('expanded');
                    this.renderConversationList(folder.id, conversationList);
                }

                // 绑定展开逻辑（非搜索模式下或搜索结果中点击可切换）
                folderItem.addEventListener('click', (e) => {
                    if (e.target.closest('button')) return; // 避免点击按钮触发

                    // 折叠其他文件夹，并更新记忆
                    container.querySelectorAll('.conversations-folder-item.expanded').forEach((el) => {
                        if (el !== folderItem) {
                            el.classList.remove('expanded');
                            const otherList = container.querySelector(`.conversations-list[data-folder-id="${el.dataset.folderId}"]`);
                            if (otherList) otherList.style.display = 'none';
                        }
                    });

                    const isExpanded = folderItem.classList.toggle('expanded');
                    // 记忆展开状态
                    this.expandedFolderId = isExpanded ? folder.id : null;

                    if (isExpanded) {
                        // 刷新计数（确保与实际会话数一致，按站点+CID 过滤）
                        const currentCid = this.siteAdapter.getCurrentCid ? this.siteAdapter.getCurrentCid() : null;
                        const count = Object.values(this.data.conversations).filter((c) => c.folderId === folder.id && this.matchesCid(c, currentCid)).length;
                        const countSpan = folderItem.querySelector('.conversations-folder-count');
                        if (countSpan) countSpan.textContent = `(${count})`;

                        this.renderConversationList(folder.id, conversationList);
                        conversationList.style.display = 'block';
                    } else {
                        conversationList.style.display = 'none';
                    }
                });
            });

            // 搜索无结果显示
            if (isSearching && !hasVisibleItems) {
                const noResult = createElement('div', { className: 'conversations-empty' }, this.t('conversationsNoSearchResult') || '未找到匹配结果');
                container.appendChild(noResult);
            }

            return container;
        }

        /**
         * 创建单个文件夹项
         * @param {number} index 文件夹在数组中的索引
         */
        createFolderItem(folder, index) {
            // 使用 CSS 变量以支持暗色模式
            // 彩虹色开关：默认开启，关闭后使用统一纯色 (--gh-bg)
            const useRainbow = this.settings.conversations?.folderRainbow !== false;
            const bgVar = folder.isDefault ? 'var(--gh-folder-bg-default)' : useRainbow ? `var(--gh-folder-bg-${index % 8})` : 'var(--gh-bg)';

            const item = createElement('div', {
                className: 'conversations-folder-item' + (folder.isDefault ? ' default' : ''),
                'data-folder-id': folder.id,
                style: `background: ${bgVar};`,
            });

            // 文件夹信息（图标 + 名称）
            const folderName = folder.name.replace(folder.icon, '').trim();
            const info = createElement('div', { className: 'conversations-folder-info' });

            // 全选复选框（仅批量模式下显示）
            if (this.batchMode) {
                // 获取当前 CID（仅 Gemini Business 有效）
                const currentCid = this.siteAdapter.getCurrentCid ? this.siteAdapter.getCurrentCid() : null;
                // 搜索模式下只处理匹配的会话（同时按 CID 过滤）
                let conversationsInFolder = Object.values(this.data.conversations).filter((c) => c.folderId === folder.id && this.matchesCid(c, currentCid));
                if (this.searchResult) {
                    conversationsInFolder = conversationsInFolder.filter((c) => this.searchResult.conversationMatches?.has(c.id));
                }

                const allSelected = conversationsInFolder.length > 0 && conversationsInFolder.every((c) => this.selectedIds.has(c.id));
                const someSelected = !allSelected && conversationsInFolder.some((c) => this.selectedIds.has(c.id));

                const checkbox = createElement('input', {
                    type: 'checkbox',
                    className: 'conversations-folder-checkbox',
                });
                checkbox.checked = allSelected;
                if (someSelected) checkbox.indeterminate = true;

                checkbox.addEventListener('click', (e) => e.stopPropagation());
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) {
                        // 全选（仅匹配项）
                        conversationsInFolder.forEach((c) => this.selectedIds.add(c.id));
                    } else {
                        // 全不选（仅匹配项）
                        conversationsInFolder.forEach((c) => this.selectedIds.delete(c.id));
                    }
                    this.createUI(); // 使用 createUI 重绘以更新状态
                });
                info.appendChild(checkbox);
            }

            info.appendChild(
                createElement(
                    'span',
                    {
                        className: 'conversations-folder-icon',
                        style: 'user-select: none;',
                    },
                    folder.icon,
                ),
            );

            // 文件夹名称（支持搜索高亮）
            const nameSpan = createElement('span', {
                className: 'conversations-folder-name',
                title: folderName,
            });
            if (this.searchQuery && this.searchResult?.folderMatches?.has(folder.id)) {
                nameSpan.appendChild(this.highlightText(folderName, this.searchQuery));
            } else {
                nameSpan.textContent = folderName;
            }
            info.appendChild(nameSpan);

            // 上下排序按钮（悬浮时在名称区域右侧显示，不占空间）
            if (!folder.isDefault) {
                const orderBtns = createElement('div', {
                    className: 'conversations-folder-order-btns',
                    style: 'user-select: none;',
                });

                const upBtn = createElement(
                    'button',
                    {
                        className: 'conversations-folder-order-btn',
                        title: this.t('moveUp') || '上移',
                    },
                    '↑',
                );
                if (index <= 1) upBtn.disabled = true;
                upBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!upBtn.disabled) this.moveFolderUp(folder.id);
                });

                const downBtn = createElement(
                    'button',
                    {
                        className: 'conversations-folder-order-btn',
                        title: this.t('moveDown') || '下移',
                    },
                    '↓',
                );
                if (index >= this.data.folders.length - 1) downBtn.disabled = true;
                downBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (!downBtn.disabled) this.moveFolderDown(folder.id);
                });

                orderBtns.appendChild(upBtn);
                orderBtns.appendChild(downBtn);
                info.appendChild(orderBtns);
            }

            item.appendChild(info);

            // 右侧控制区域（计数 + 菜单按钮）
            const controls = createElement('div', { className: 'conversations-folder-controls' });

            // 获取当前 CID（仅 Gemini Business 有效）- 复用上面的变量或重新获取
            const cidForCount = this.siteAdapter.getCurrentCid ? this.siteAdapter.getCurrentCid() : null;
            // 会话计数（搜索模式下显示匹配数量，同时按 CID 过滤）
            let count = Object.values(this.data.conversations).filter((c) => c.folderId === folder.id && this.matchesCid(c, cidForCount)).length;
            if (this.searchResult) {
                count = Object.values(this.data.conversations).filter((c) => c.folderId === folder.id && this.matchesCid(c, cidForCount) && this.searchResult.conversationMatches?.has(c.id)).length;
            }
            controls.appendChild(createElement('span', { className: 'conversations-folder-count' }, `(${count})`));

            // 操作菜单按钮（始终渲染以保持对齐，默认文件夹隐藏）
            const menuBtn = createElement(
                'button',
                {
                    className: 'conversations-folder-menu-btn',
                    style: 'user-select: none;',
                },
                '⋯',
            );
            if (folder.isDefault) {
                menuBtn.style.visibility = 'hidden';
                menuBtn.style.pointerEvents = 'none'; // 避免阻挡点击
            } else {
                menuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showFolderMenu(folder, menuBtn);
                });
            }
            controls.appendChild(menuBtn);

            item.appendChild(controls);

            return item;
        }

        /**
         * 获取侧边栏会话顺序
         * @returns {Array<string>} 会话 ID 数组，按侧边栏 DOM 顺序排列
         */
        getSidebarConversationOrder() {
            const config = this.siteAdapter.getConversationObserverConfig?.();
            if (!config) return [];

            const elements = DOMToolkit.query(config.selector, { all: true, shadow: config.shadow });
            return Array.from(elements)
                .map((el) => config.extractInfo?.(el)?.id)
                .filter(Boolean);
        }

        /**
         * 渲染文件夹下的会话列表
         */
        renderConversationList(folderId, container) {
            clearElement(container);

            // 获取当前 CID（仅 Gemini Business 有效）
            const currentCid = this.siteAdapter.getCurrentCid ? this.siteAdapter.getCurrentCid() : null;

            // 获取该文件夹下的会话（按 CID 过滤）
            let conversations = Object.values(this.data.conversations).filter((c) => c.folderId === folderId && this.matchesCid(c, currentCid));

            // 搜索模式下过滤不匹配的会话
            const isSearching = !!this.searchResult;
            if (isSearching) {
                const { conversationMatches } = this.searchResult;
                conversations = conversations.filter((c) => conversationMatches?.has(c.id));
            }

            if (conversations.length === 0) {
                const empty = createElement('div', { className: 'conversations-list-empty' }, this.t('conversationsEmpty') || '暂无会话');
                container.appendChild(empty);
                return;
            }

            // 获取侧边栏顺序
            const sidebarOrder = this.getSidebarConversationOrder();

            // 排序：置顶优先，其余按侧边栏顺序
            conversations.sort((a, b) => {
                // 置顶优先
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;

                // 按侧边栏顺序
                const indexA = sidebarOrder.indexOf(a.id);
                const indexB = sidebarOrder.indexOf(b.id);
                // 不在侧边栏的放到最后
                if (indexA === -1 && indexB === -1) return (b.updatedAt || 0) - (a.updatedAt || 0);
                if (indexA === -1) return 1;
                if (indexB === -1) return -1;
                return indexA - indexB;
            });

            conversations.forEach((conv) => {
                const item = this.createConversationItem(conv);
                container.appendChild(item);
            });
        }

        /**
         * 创建单个会话项
         */
        createConversationItem(conv) {
            const item = createElement('div', { className: 'conversations-item', 'data-id': conv.id });
            // New Layout: Flex Column
            // Row 1: Content (Title + Checkbox) ----- Actions (Time + Menu)
            // Row 2: Tags

            // Container for Row 1

            // Checkbox
            if (this.batchMode) {
                const checkbox = createElement('input', {
                    type: 'checkbox',
                    className: 'conversations-item-checkbox',
                });
                checkbox.checked = this.selectedIds.has(conv.id);
                checkbox.addEventListener('click', (e) => e.stopPropagation());
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) this.selectedIds.add(conv.id);
                    else this.selectedIds.delete(conv.id);
                    this.updateBatchActionBar();
                });
                item.appendChild(checkbox);
            }

            // Title
            const title = createElement('span', {
                className: 'conversations-item-title',
                title: conv.title,
                style: 'user-select: none;',
            });
            // 置顶标识
            const displayTitle = conv.pinned ? `📌 ${conv.title || '无标题'}` : conv.title || '无标题';
            if (this.searchQuery && this.searchResult?.conversationMatches?.has(conv.id)) {
                if (conv.pinned) title.appendChild(document.createTextNode('📌 '));
                title.appendChild(this.highlightText(conv.title || '无标题', this.searchQuery));
            } else {
                title.textContent = displayTitle;
            }
            title.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.batchMode) {
                    const checkbox = item.querySelector('.conversations-item-checkbox');
                    if (checkbox) {
                        checkbox.click();
                    }
                    return;
                }
                // 尝试在侧边栏中查找并点击（支持 Shadow DOM 穿透）
                // 方法1: 通过 jslog 属性查找（Gemini 标准版）
                let sidebarItem = DOMToolkit.query(`.conversation[jslog*="${conv.id}"]`, { shadow: true });
                // 方法2: 遍历所有会话元素，通过菜单按钮 ID 匹配（Gemini Business）
                // 注意：closest() 在 Shadow DOM 中可能失效，所以需要遍历
                if (!sidebarItem) {
                    const conversations = DOMToolkit.query('.conversation', { all: true, shadow: true });
                    for (const convEl of conversations) {
                        const menuBtn = convEl.querySelector(`#menu-${conv.id}`) || convEl.querySelector(`.conversation-action-menu-button[id="menu-${conv.id}"]`);
                        if (menuBtn) {
                            sidebarItem = convEl;
                            break;
                        }
                    }
                }
                if (sidebarItem) {
                    const btn = sidebarItem.querySelector('button.list-item') || sidebarItem.querySelector('button');
                    if (btn) btn.click();
                    else sidebarItem.click();
                } else if (conv.url) {
                    window.location.href = conv.url;
                }
            });
            item.appendChild(title);

            // Tags (Insert after title)
            if (conv.tagIds && conv.tagIds.length > 0 && this.data.tags) {
                const tagList = createElement('div', {
                    className: 'conversations-tag-list',
                    style: 'user-select: none;',
                });
                conv.tagIds.forEach((tagId) => {
                    const tagDef = this.data.tags.find((t) => t.id === tagId);
                    if (tagDef) {
                        const tagEl = createElement(
                            'span',
                            {
                                className: 'conversations-tag',
                                style: `background-color: ${tagDef.color || '#9ca3af'}`,
                            },
                            tagDef.name,
                        );
                        tagList.appendChild(tagEl);
                    }
                });
                if (tagList.children.length > 0) {
                    item.appendChild(tagList);
                }
            }

            // Right side of Top Row: Time + Menu
            const metaContainer = createElement('div', { className: 'conversations-item-meta' });

            const time = createElement('span', { className: 'conversations-item-time' }, this.formatTime(conv.updatedAt));
            metaContainer.appendChild(time);

            const menuBtn = createElement(
                'button',
                {
                    className: 'conversations-item-menu-btn',
                    style: 'user-select: none;',
                },
                '⋯',
            );
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showConversationMenu(conv, menuBtn);
            });
            metaContainer.appendChild(menuBtn);
            item.appendChild(metaContainer);

            return item;
        }

        /**
         * 显示会话操作菜单
         */
        showConversationMenu(conv, anchorEl) {
            // 移除已有菜单
            document.querySelectorAll('.conversations-item-menu').forEach((m) => m.remove());

            const menu = createElement('div', { className: 'conversations-item-menu' });

            // 重命名
            const renameBtn = createElement('button', {}, this.t('conversationsRename') || '重命名');
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.remove();
                this.showRenameConversationDialog(conv);
            });
            menu.appendChild(renameBtn);

            // 置顶/取消置顶
            const pinText = conv.pinned ? this.t('conversationsUnpin') || '取消置顶' : this.t('conversationsPin') || '📌 置顶';
            const pinBtn = createElement('button', {}, pinText);
            pinBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.remove();
                this.toggleConversationPin(conv);
            });
            menu.appendChild(pinBtn);

            // 设置标签
            const tagBtn = createElement('button', {}, this.t('conversationsSetTags') || '设置标签');
            tagBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.remove();
                this.showTagManagerDialog(conv);
            });
            menu.appendChild(tagBtn);

            // 移动到...
            const moveBtn = createElement('button', {}, this.t('conversationsMoveTo') || '移动到...');
            moveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.remove();
                this.showMoveToFolderDialog(conv);
            });
            menu.appendChild(moveBtn);

            // 删除
            const deleteBtn = createElement('button', { className: 'danger' }, this.t('conversationsDelete') || '删除');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.remove();
                this.confirmDeleteConversation(conv);
            });
            menu.appendChild(deleteBtn);

            // 定位菜单
            const rect = anchorEl.getBoundingClientRect();
            menu.style.position = 'fixed';
            menu.style.top = `${rect.bottom + 4}px`;
            menu.style.right = `${window.innerWidth - rect.right}px`;

            document.body.appendChild(menu);

            // 点击外部关闭
            const closeHandler = (e) => {
                if (!menu.contains(e.target) && e.target !== anchorEl) {
                    menu.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 0);
        }

        /**
         * 切换会话置顶状态
         */
        toggleConversationPin(conv) {
            const stored = this.data.conversations[conv.id];
            if (!stored) return;

            stored.pinned = !stored.pinned;
            stored.updatedAt = Date.now();
            this.saveData();

            // 刷新 UI
            this.createUI();

            // 显示提示
            const message = stored.pinned ? this.t('conversationsPinned') || '已置顶' : this.t('conversationsUnpinned') || '已取消置顶';
            showToast(message);
        }

        /**
         * 显示重命名会话对话框
         */
        showRenameConversationDialog(conv) {
            const overlay = createElement('div', { className: 'conversations-dialog-overlay' });
            const dialog = createElement('div', { className: 'conversations-dialog' });

            // 标题
            dialog.appendChild(createElement('div', { className: 'conversations-dialog-title' }, this.t('conversationsRename') || '重命名'));

            // 输入框区域
            const inputSection = createElement('div', { className: 'conversations-dialog-section' });
            inputSection.appendChild(createElement('label', {}, this.t('conversationsFolderName') || '名称'));
            const nameInput = createElement('input', {
                type: 'text',
                className: 'conversations-dialog-input',
                value: conv.title || '',
                placeholder: this.t('conversationsFolderNamePlaceholder') || '输入会话标题',
            });
            inputSection.appendChild(nameInput);
            dialog.appendChild(inputSection);

            // 按钮
            const buttons = createElement('div', { className: 'conversations-dialog-buttons' });
            const cancelBtn = createElement('button', { className: 'conversations-dialog-btn cancel' }, this.t('cancel') || '取消');
            cancelBtn.addEventListener('click', () => overlay.remove());

            const confirmBtn = createElement('button', { className: 'conversations-dialog-btn confirm' }, this.t('confirm') || '确定');
            confirmBtn.addEventListener('click', () => {
                const newTitle = nameInput.value.trim();
                if (newTitle && newTitle !== conv.title) {
                    this.renameConversation(conv.id, newTitle);
                }
                overlay.remove();
            });

            buttons.appendChild(cancelBtn);
            buttons.appendChild(confirmBtn);
            dialog.appendChild(buttons);

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            // 聚焦并全选
            nameInput.focus();
            nameInput.select();

            // ESC 关闭
            overlay.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') overlay.remove();
                if (e.key === 'Enter') confirmBtn.click();
            });
        }

        /**
         * 重命名会话
         */
        renameConversation(convId, newTitle) {
            const conv = this.data.conversations[convId];
            if (!conv) return;

            const oldTitle = conv.title;
            conv.title = newTitle;
            conv.updatedAt = Date.now();
            this.saveData();
            this.createUI();
            showToast(this.t('conversationsFolderRenamed') || '已重命名');

            // 根据设置决定是否同步云端
            if (this.settings?.conversations?.syncRenameToCloud) {
                this.syncRenameToCloud(convId, newTitle, oldTitle);
            }
        }

        /**
         * 同步重命名到云端（侧边栏）
         */
        syncRenameToCloud(convId, newTitle, oldTitle) {
            // 尝试在侧边栏找到对应会话并触发重命名
            const sidebarItem = DOMToolkit.query(`.conversation[jslog*="${convId}"]`);
            if (sidebarItem) {
                // 尝试模拟右键菜单或编辑操作
                // 由于侧边栏结构复杂，这里暂时只打印提示
                console.log(`[ConversationManager] 云端同步重命名：${oldTitle} -> ${newTitle}`);
                // TODO: 实现实际的侧边栏重命名操作
            }
        }

        /**
         * 确认删除会话
         */
        confirmDeleteConversation(conv) {
            this.showConfirmDialog(this.t('conversationsDelete') || '删除', `确定删除会话 "${conv.title}" 吗？`, () => this.deleteConversation(conv.id));
        }

        /**
         * 删除会话
         */
        deleteConversation(convId) {
            const conv = this.data.conversations[convId];
            if (!conv) return;

            delete this.data.conversations[convId];
            this.saveData();
            this.createUI();
            showToast(this.t('conversationsDeleted') || '已删除');

            // 根据设置决定是否同步云端删除
            if (this.settings?.conversations?.syncDeleteToCloud) {
                this.syncDeleteToCloud(convId);
            }
        }

        /**
         * 同步删除到云端（侧边栏）
         */
        syncDeleteToCloud(convId) {
            // 尝试在侧边栏找到对应会话并触发删除
            const sidebarItem = DOMToolkit.query(`.conversation[jslog*="${convId}"]`);
            if (sidebarItem) {
                console.log(`[ConversationManager] 云端同步删除会话：${convId}`);
                // TODO: 实现实际的侧边栏删除操作
            }
        }

        /**
         * 更新底部批量操作栏状态
         */
        updateBatchActionBar() {
            const batchBar = document.getElementById('conversations-batch-bar');
            const batchInfo = document.getElementById('conversations-batch-info');
            if (!batchBar || !batchInfo) return;

            const count = this.selectedIds.size;
            if (count > 0) {
                batchBar.style.display = 'flex';
                batchInfo.textContent = (this.t('batchSelected') || '已选 {n} 个').replace('{n}', count);
            } else {
                batchBar.style.display = 'none';
            }
        }

        /**
         * 定位当前对话
         * 从 URL 获取 sessionId，在会话列表中找到对应项并高亮
         */
        async locateCurrentConversation() {
            // 1. 获取当前会话 ID
            const sessionId = this.siteAdapter.getSessionId();
            if (!sessionId || sessionId === 'default' || sessionId === 'app') {
                showToast(this.t('conversationsLocateNewChat'));
                return;
            }

            // 2. 获取当前 CID（仅 Business）
            const currentCid = this.siteAdapter.getCurrentCid?.() || null;

            // 3. 在数据中查找
            let conv = this.data.conversations[sessionId];

            // 4. 如果没找到，尝试自动同步
            if (!conv) {
                showToast(this.t('conversationsLocateNotFound'));

                // 获取定位按钮并显示 loading 状态
                const locateBtn = this.container.querySelector('#conversations-locate-btn');
                const LOCATE_PATH =
                    'M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z';
                const HOURGLASS_PATH = 'M6 2v6h.01L6 8.01 10 12l-4 4 .01.01H6V22h12v-5.99h-.01L18 16l-4-4 4-3.99-.01-.01H18V2H6zm10 14.5V20H8v-3.5l4-4 4 4zm-4-5l-4-4V4h8v3.5l-4 4z';

                if (locateBtn) {
                    locateBtn.disabled = true;
                    clearElement(locateBtn);
                    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.setAttribute('viewBox', '0 0 24 24');
                    svg.setAttribute('fill', 'currentColor');
                    svg.setAttribute('width', '18');
                    svg.setAttribute('height', '18');
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', HOURGLASS_PATH);
                    svg.appendChild(path);
                    locateBtn.appendChild(svg);
                }

                // 执行同步
                const folderSelect = this.container.querySelector('#conversations-folder-select');
                const targetFolderId = folderSelect?.value || 'inbox';
                await this.siteAdapter.loadAllConversations();
                this.syncConversations(targetFolderId, true, false); // silent sync

                // 恢复按钮状态
                if (locateBtn) {
                    locateBtn.disabled = false;
                    clearElement(locateBtn);
                    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    svg.setAttribute('viewBox', '0 0 24 24');
                    svg.setAttribute('fill', 'currentColor');
                    svg.setAttribute('width', '18');
                    svg.setAttribute('height', '18');
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', LOCATE_PATH);
                    svg.appendChild(path);
                    locateBtn.appendChild(svg);
                }

                // 再次查找
                conv = this.data.conversations[sessionId];
                if (!conv) {
                    showToast(this.t('conversationsLocateSyncFailed'));
                    return;
                }
            }

            // 5. 检查 CID 是否匹配（Business 多团队场景）
            // 注意：如果会话没有 cid（旧数据），或者当前不在团队模式，则跳过检查
            if (currentCid && conv.cid && conv.cid !== currentCid) {
                showToast(this.t('conversationsLocateWrongTeam') || '该对话属于其他团队');
                return;
            }

            // 6. 展开对应文件夹（仅在需要时重建 UI，避免抖动）
            const targetFolderId = conv.folderId || 'inbox';
            const needsExpand = this.expandedFolderId !== targetFolderId;

            if (needsExpand) {
                this.expandedFolderId = targetFolderId;
                this.createUI();
            }

            // 7. 延迟执行滚动和高亮（等待 DOM 渲染完成）
            const doHighlight = () => {
                const item = this.container.querySelector(`.conversations-item[data-id="${sessionId}"]`);
                if (item) {
                    // 1. 找到会话所在的内层滚动容器 (.conversations-list)
                    const conversationsList = item.closest('.conversations-list');
                    if (conversationsList) {
                        // 滚动内层容器使会话项居中
                        const itemRect = item.getBoundingClientRect();
                        const listRect = conversationsList.getBoundingClientRect();
                        const scrollOffset = itemRect.top - listRect.top - listRect.height / 2 + itemRect.height / 2;
                        conversationsList.scrollBy({ top: scrollOffset, behavior: 'smooth' });
                    }

                    // 2. 同时确保外层文件夹列表也滚动到正确位置
                    const folderList = this.container.querySelector('.conversations-folder-list');
                    const folderItem = item.closest('.conversations-folder-item');
                    if (folderList && folderItem) {
                        const folderRect = folderItem.getBoundingClientRect();
                        const outerRect = folderList.getBoundingClientRect();
                        // 如果文件夹不在可视区域内，滚动到可见位置
                        if (folderRect.top < outerRect.top || folderRect.bottom > outerRect.bottom) {
                            const scrollOffset = folderRect.top - outerRect.top - 20; // 顶部留20px边距
                            folderList.scrollBy({ top: scrollOffset, behavior: 'smooth' });
                        }
                    }

                    // 高亮效果
                    item.classList.add('locate-highlight');
                    setTimeout(() => item.classList.remove('locate-highlight'), 2000);
                    showToast(this.t('conversationsLocateSuccess'));
                }
            };

            // 如果重建了 UI，等待下一帧；否则直接执行
            if (needsExpand) {
                requestAnimationFrame(doHighlight);
            } else {
                doHighlight();
            }
        }

        /**
         * 切换批量模式
         */
        toggleBatchMode() {
            this.batchMode = !this.batchMode;
            if (!this.batchMode) {
                this.selectedIds.clear();
            }
            this.createUI();
            // 恢复之前展开的文件夹
            if (this.expandedFolderId) {
                const folderHeader = this.container.querySelector(`.conversations-folder-header[data-folder-id="${this.expandedFolderId}"]`);
                if (folderHeader) folderHeader.click();
            }
        }

        /**
         * 清除选中状态并退出批量模式
         */
        clearSelection() {
            this.selectedIds.clear();
            this.batchMode = false;
            this.createUI();
            // 恢复之前展开的文件夹
            if (this.expandedFolderId) {
                const folderHeader = this.container.querySelector(`.conversations-folder-header[data-folder-id="${this.expandedFolderId}"]`);
                if (folderHeader) folderHeader.click();
            }
        }

        /**
         * 批量移动会话
         */
        batchMove() {
            if (this.selectedIds.size === 0) return;

            const overlay = createElement('div', { className: 'conversations-dialog-overlay' });
            const dialog = createElement('div', { className: 'conversations-dialog' });
            dialog.appendChild(createElement('div', { className: 'conversations-dialog-title' }, `移动 ${this.selectedIds.size} 个会话到...`));

            // 搜索框 + 新建文件夹按钮
            const searchRow = createElement('div', {
                style: 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;',
            });
            const searchInput = createElement('input', {
                type: 'text',
                className: 'conversations-dialog-search',
                placeholder: '搜索文件夹...',
                style: 'flex: 1; padding: 8px; border: 1px solid var(--gh-input-border, #d1d5db); border-radius: 4px; box-sizing: border-box; font-size: 13px;',
            });
            const addFolderBtn = createElement('button', {
                className: 'conversations-dialog-add-folder-btn',
                title: this.t('conversationsAddFolder') || '新建文件夹',
                style: 'width: 36px; height: 36px; border: 1px solid var(--gh-input-border, #d1d5db); border-radius: 4px; background: var(--gh-bg, white); cursor: pointer; display: flex; align-items: center; justify-content: center;',
            });
            const addSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            addSvg.setAttribute('viewBox', '0 0 24 24');
            addSvg.setAttribute('fill', 'var(--gh-text-secondary, #6b7280)');
            addSvg.setAttribute('width', '18');
            addSvg.setAttribute('height', '18');
            const addPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            addPath.setAttribute('d', 'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z');
            addSvg.appendChild(addPath);
            addFolderBtn.appendChild(addSvg);
            addFolderBtn.addEventListener('click', () => {
                overlay.remove();
                this.showCreateFolderDialog();
            });
            searchRow.appendChild(searchInput);
            searchRow.appendChild(addFolderBtn);
            dialog.appendChild(searchRow);

            // 文件夹列表容器
            const list = createElement('div', { className: 'conversations-folder-select-list' });

            // 渲染列表函数
            const renderList = (filter = '') => {
                clearElement(list);
                this.data.folders.forEach((folder) => {
                    const folderName = folder.name.replace(folder.icon, '').trim();
                    if (filter && !folderName.toLowerCase().includes(filter.toLowerCase())) return;

                    const item = createElement('div', { className: 'conversations-folder-select-item' }, `${folder.icon} ${folderName}`);
                    item.addEventListener('click', () => {
                        // 批量移动
                        this.selectedIds.forEach((convId) => {
                            if (this.data.conversations[convId]) {
                                this.data.conversations[convId].folderId = folder.id;
                                this.data.conversations[convId].updatedAt = Date.now();
                            }
                        });
                        this.saveData();
                        overlay.remove();
                        showToast(`已移动 ${this.selectedIds.size} 个会话到 ${folder.name}`);
                        this.clearSelection();
                        this.createUI();
                    });
                    list.appendChild(item);
                });
            };

            // 初始渲染
            renderList();

            // 搜索事件
            searchInput.addEventListener('input', (e) => {
                renderList(e.target.value);
            });

            dialog.appendChild(list);

            // 取消按钮
            const btns = createElement('div', { className: 'conversations-dialog-buttons' });
            const cancelBtn = createElement('button', { className: 'conversations-dialog-btn cancel' }, this.t('cancel') || '取消');
            cancelBtn.addEventListener('click', () => overlay.remove());
            btns.appendChild(cancelBtn);
            dialog.appendChild(btns);

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            searchInput.focus();
        }

        /**
         * 批量删除会话
         */
        batchDelete() {
            if (this.selectedIds.size === 0) return;

            this.showConfirmDialog('批量删除', `确定删除选中的 ${this.selectedIds.size} 个会话吗？`, () => {
                const count = this.selectedIds.size;
                this.selectedIds.forEach((convId) => {
                    delete this.data.conversations[convId];
                });
                this.saveData();
                showToast(`已删除 ${count} 个会话`);
                this.clearSelection();
                this.createUI();
            });
        }

        /**
         * 显示导出格式选择菜单
         * @param {HTMLElement} anchorEl 锚点元素
         */
        showExportMenu(anchorEl) {
            // 移除已有菜单
            document.querySelectorAll('.conversations-export-menu').forEach((m) => m.remove());

            const menu = createElement('div', { className: 'conversations-export-menu' });
            // 菜单样式
            Object.assign(menu.style, {
                position: 'absolute',
                background: 'var(--gh-bg, white)',
                border: '1px solid var(--gh-border, #e5e7eb)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                padding: '4px',
                minWidth: '140px',
                zIndex: '100',
            });

            // 按钮通用样式
            const btnStyle = {
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                color: 'var(--gh-text, #374151)',
            };

            // Markdown 选项
            const mdBtn = createElement('button', {}, '📝 ' + (this.t('exportToMarkdown') || 'Markdown'));
            Object.assign(mdBtn.style, btnStyle);
            mdBtn.addEventListener('mouseenter', () => (mdBtn.style.background = 'var(--gh-bg-hover, #f3f4f6)'));
            mdBtn.addEventListener('mouseleave', () => (mdBtn.style.background = 'none'));
            mdBtn.addEventListener('click', async () => {
                menu.remove();
                await this.exportConversations('markdown');
            });
            menu.appendChild(mdBtn);

            // JSON 选项
            const jsonBtn = createElement('button', {}, '📋 ' + (this.t('exportToJSON') || 'JSON'));
            Object.assign(jsonBtn.style, btnStyle);
            jsonBtn.addEventListener('mouseenter', () => (jsonBtn.style.background = 'var(--gh-bg-hover, #f3f4f6)'));
            jsonBtn.addEventListener('mouseleave', () => (jsonBtn.style.background = 'none'));
            jsonBtn.addEventListener('click', async () => {
                menu.remove();
                await this.exportConversations('json');
            });
            menu.appendChild(jsonBtn);

            // TXT 选项
            const txtBtn = createElement('button', {}, '📄 ' + (this.t('exportToTXT') || 'TXT'));
            Object.assign(txtBtn.style, btnStyle);
            txtBtn.addEventListener('mouseenter', () => (txtBtn.style.background = 'var(--gh-bg-hover, #f3f4f6)'));
            txtBtn.addEventListener('mouseleave', () => (txtBtn.style.background = 'none'));
            txtBtn.addEventListener('click', async () => {
                menu.remove();
                await this.exportConversations('txt');
            });
            menu.appendChild(txtBtn);

            // 定位菜单（相对于按钮向上弹出）
            const parentRect = this.container.getBoundingClientRect();
            const btnRect = anchorEl.getBoundingClientRect();
            menu.style.bottom = `${parentRect.bottom - btnRect.top + 4}px`;
            menu.style.left = `${btnRect.left - parentRect.left}px`;

            this.container.appendChild(menu);

            // 点击外部关闭
            const closeHandler = (e) => {
                if (!menu.contains(e.target) && e.target !== anchorEl) {
                    menu.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 0);
        }

        /**
         * 导出选中的会话
         * @param {'markdown'|'json'} format 导出格式
         */
        async exportConversations(format) {
            if (this.selectedIds.size === 0) return;

            // 目前只支持单个会话导出
            const convId = [...this.selectedIds][0];
            const conv = this.data.conversations[convId];
            if (!conv) {
                showToast(this.t('exportNoContent') || '未找到对话内容');
                return;
            }

            // 检查是否为当前会话
            const currentSessionId = this.siteAdapter.getSessionId();
            if (currentSessionId !== convId) {
                showToast(this.t('exportNeedOpenFirst') || '请先打开要导出的会话');
                return;
            }

            try {
                showToast(this.t('exportLoading') || '正在加载对话历史...');

                // 加载完整历史（滚动到顶部触发加载）
                const scrollContainer = this.siteAdapter.getScrollContainer?.();
                if (scrollContainer) {
                    let prevHeight = 0;
                    let retries = 0;
                    const maxRetries = 50;

                    while (retries < maxRetries) {
                        scrollContainer.scrollTop = 0;
                        await new Promise((resolve) => setTimeout(resolve, 500));

                        const currentHeight = scrollContainer.scrollHeight;
                        if (currentHeight === prevHeight) {
                            retries++;
                            if (retries >= 3) break;
                        } else {
                            retries = 0;
                            prevHeight = currentHeight;
                        }
                    }
                }

                // 提取对话内容
                const messages = this.extractConversationMessages();
                if (messages.length === 0) {
                    showToast(this.t('exportNoContent') || '未找到对话内容');
                    return;
                }

                // 格式化并下载
                let content, filename, mimeType;
                const safeTitle = (conv.title || 'conversation').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);

                if (format === 'clipboard') {
                    content = this.formatToMarkdown(conv, messages);
                    // 处理 blob 图片 (复制时也需要转换为 Base64)
                    if (content.includes('](blob:')) {
                        try {
                            showToast(this.t('exportProcessingImages') || '正在处理图片...');
                            content = await this.processMarkdownImages(content);
                        } catch (e) {
                            console.error('Base64 image processing failed:', e);
                        }
                    }
                    await navigator.clipboard.writeText(content);
                    showToast(this.t('copySuccess') || '已复制到剪贴板');
                    return;
                } else if (format === 'markdown') {
                    content = this.formatToMarkdown(conv, messages);

                    // 处理 Base64 图片导出 (如果设置开启，或者检测到 blob 图片)
                    if (this.settings.conversations?.exportImagesToBase64 || content.includes('](blob:')) {
                        try {
                            showToast(this.t('exportProcessingImages') || '正在处理图片...');
                            content = await this.processMarkdownImages(content);
                        } catch (e) {
                            console.error('Base64 image processing failed:', e);
                            showToast('图片处理失败，将使用原始链接导出');
                        }
                    }

                    filename = `${safeTitle}.md`;
                    mimeType = 'text/markdown;charset=utf-8';
                } else if (format === 'json') {
                    content = this.formatToJSON(conv, messages);
                    filename = `${safeTitle}.json`;
                    mimeType = 'application/json;charset=utf-8';
                } else {
                    content = this.formatToTXT(conv, messages);
                    filename = `${safeTitle}.txt`;
                    mimeType = 'text/plain;charset=utf-8';
                }

                this.downloadFile(content, filename, mimeType);
                showToast(this.t('exportSuccess') || '导出成功');
            } catch (error) {
                console.error('[ConversationManager] Export failed:', error);
                showToast(this.t('exportFailed') || '导出失败');
            }
        }

        /**
         * 提取当前页面的对话消息
         * @returns {Array<{role: 'user'|'assistant', content: string}>}
         */
        extractConversationMessages() {
            const messages = [];

            // 从 siteAdapter 获取配置
            const config = this.siteAdapter.getExportConfig?.();
            if (!config) {
                console.warn('[ConversationManager] Export config not available for this site');
                return messages;
            }

            const { userQuerySelector, assistantResponseSelector, useShadowDOM, extractUserText, extractAssistantContent } = config;
            const queryOpts = { all: true, shadow: useShadowDOM };

            // 方案：分别提取用户和 AI 消息
            const userMessages = DOMToolkit.query(userQuerySelector, queryOpts) || [];
            const aiMessages = DOMToolkit.query(assistantResponseSelector, queryOpts) || [];

            const maxLen = Math.max(userMessages.length, aiMessages.length);
            for (let i = 0; i < maxLen; i++) {
                if (userMessages[i]) {
                    // 使用自定义提取函数（如果有），否则使用 textContent
                    const userContent = extractUserText ? extractUserText(userMessages[i]) : userMessages[i].textContent?.trim() || '';
                    messages.push({ role: 'user', content: userContent });
                }
                if (aiMessages[i]) {
                    // 使用自定义提取函数获取目标元素（如果有）
                    let targetEl = aiMessages[i];
                    if (extractAssistantContent) {
                        targetEl = extractAssistantContent(aiMessages[i]) || aiMessages[i];
                    }
                    messages.push({
                        role: 'assistant',
                        content: this.htmlToMarkdown(targetEl) || targetEl.textContent?.trim() || '',
                    });
                }
            }

            return messages;
        }

        /**
         * HTML 转 Markdown
         * @param {HTMLElement} el
         * @returns {string}
         */
        htmlToMarkdown(el) {
            if (!el) return '';

            const processNode = (node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    return node.textContent;
                }

                if (node.nodeType !== Node.ELEMENT_NODE) {
                    return '';
                }

                // ============================================================
                // 1. 优先处理特殊标签：这些标签不需要递归处理子节点
                //    或者需要完全自定义子节点的处理方式
                // ============================================================

                // 处理数学公式块（从 data-math 属性提取 LaTeX 源码）
                if (node.classList?.contains('math-block')) {
                    const latex = node.getAttribute('data-math');
                    if (latex) return `\n$$${latex}$$\n`;
                }

                // 处理行内数学公式
                if (node.classList?.contains('math-inline')) {
                    const latex = node.getAttribute('data-math');
                    if (latex) return `$${latex}$`;
                }

                const tag = node.tagName.toLowerCase();

                // 图片：直接生成 Markdown，不需要子节点
                if (tag === 'img') {
                    const alt = node.alt || node.getAttribute('alt') || '图片';
                    const src = node.src || node.getAttribute('src') || '';
                    return `![${alt}](${src})`;
                }

                // 代码块容器 (Gemini 特有)：手动提取语言和内容，忽略内部结构（避免输出 "Copy" 按钮文本）
                if (tag === 'code-block') {
                    const decoration = node.querySelector('.code-block-decoration');
                    const lang = decoration?.querySelector('span')?.textContent?.trim()?.toLowerCase() || '';
                    const codeEl = node.querySelector('pre code');
                    const text = codeEl?.textContent || node.querySelector('pre')?.textContent || '';
                    return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`;
                }

                // 预格式化块：手动提取 code 内容，忽略子节点递归结果（code-block内的pre会被上面的逻辑拦截，这里处理独立的pre）
                if (tag === 'pre') {
                    const code = node.querySelector('code');
                    // 尝试多种方式获取语言
                    let lang = code?.className.match(/language-(\w+)/)?.[1] || '';

                    if (!lang) {
                        // 方式2: 向上遍历兄弟元素查找 .code-block-decoration
                        let sibling = node.previousElementSibling;
                        while (sibling && !lang) {
                            if (sibling.classList?.contains('code-block-decoration')) {
                                lang = sibling.querySelector('span')?.textContent?.trim()?.toLowerCase() || '';
                                break;
                            }
                            sibling = sibling.previousElementSibling;
                        }
                    }

                    if (!lang) {
                        // 方式3: 在父容器中查找 .code-block-decoration
                        const parent = node.parentElement;
                        const decoration = parent?.querySelector('.code-block-decoration');
                        if (decoration) {
                            lang = decoration.querySelector('span')?.textContent?.trim()?.toLowerCase() || '';
                        }
                    }

                    const text = code?.textContent || node.textContent;
                    return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`;
                }

                // 内联代码：简单包裹，忽略子元素（通常没子元素，或者是高亮span）
                if (tag === 'code') {
                    // 如果父元素是 pre，返回空字符串（因为内容已被 pre 处理，且我们即将返回 children 拼接结果）
                    // 但这里我们在计算 children 之前就拦截了。
                    // 修正逻辑：如果父元素是 pre，则该 code 节点不需要再输出（因为父 pre 已经提取了它的 textContent）
                    if (node.parentElement?.tagName.toLowerCase() === 'pre') return '';
                    return `\`${node.textContent}\``;
                }

                // 表格：完全自定义子节点处理逻辑
                if (tag === 'table') {
                    const rows = [];
                    const thead = node.querySelector('thead');
                    const tbody = node.querySelector('tbody');

                    // 辅助函数：从单元格提取内容（处理 Shadow DOM）
                    const getCellContent = (cell) => {
                        // 如果单元格有 Shadow DOM，递归处理
                        if (cell.shadowRoot) {
                            return Array.from(cell.shadowRoot.childNodes).map(processNode).join('').replace(/\n/g, ' ').trim();
                        }
                        // 尝试用 htmlToMarkdown 处理
                        const md = this.htmlToMarkdown(cell);
                        if (md && md.trim()) {
                            return md.replace(/\n/g, ' ').trim();
                        }
                        // 回退：使用 textContent
                        return cell.textContent?.trim() || '';
                    };

                    // 处理表头
                    if (thead) {
                        const headerRow = thead.querySelector('tr');
                        if (headerRow) {
                            const headers = Array.from(headerRow.querySelectorAll('td, th')).map(getCellContent);
                            if (headers.some((h) => h)) {
                                rows.push('| ' + headers.join(' | ') + ' |');
                                rows.push('| ' + headers.map(() => '---').join(' | ') + ' |');
                            }
                        }
                    }

                    // 处理表体
                    if (tbody) {
                        const bodyRows = tbody.querySelectorAll('tr');
                        bodyRows.forEach((tr) => {
                            const cells = Array.from(tr.querySelectorAll('td, th')).map(getCellContent);
                            if (cells.some((c) => c)) {
                                rows.push('| ' + cells.join(' | ') + ' |');
                            }
                        });
                    }

                    // 如果没有 thead/tbody，直接遍历所有 tr
                    if (!thead && !tbody) {
                        const allRows = node.querySelectorAll('tr');
                        let isFirst = true;
                        allRows.forEach((tr) => {
                            const cells = Array.from(tr.querySelectorAll('td, th')).map(getCellContent);
                            if (cells.some((c) => c)) {
                                rows.push('| ' + cells.join(' | ') + ' |');
                                if (isFirst) {
                                    rows.push('| ' + cells.map(() => '---').join(' | ') + ' |');
                                    isFirst = false;
                                }
                            }
                        });
                    }

                    return rows.length > 0 ? '\n' + rows.join('\n') + '\n' : '';
                }

                // Gemini 表格容器：直接处理内部表格，忽略其他可能的装饰元素
                if (tag === 'table-block') {
                    const innerTable = node.querySelector('table');
                    if (innerTable) {
                        return processNode(innerTable);
                    }
                    // 如果没找到 table，则退化为处理所有子节点
                }

                // Gemini Business 表格容器
                if (tag === 'ucs-markdown-table') {
                    const innerTable = node.querySelector('table');
                    if (innerTable) {
                        return processNode(innerTable);
                    }
                    // 如果没找到 table，则退化为处理所有子节点
                }

                // 表格内部标签：由于 table 已经手动处理了 thead/tbody/tr/td，
                // 如果递归遍历到了这些标签（例如 table-block 没有拦截住，或者非标准结构的表格），
                // 我们应该只返回子节点内容，或者什么都不做以免破坏表格结构。
                // 暂时按返回子节点内容处理。
                if (['thead', 'tbody', 'tr', 'td', 'th'].includes(tag)) {
                    // 这些通常在 table 的处理逻辑中被 htmlToMarkdown(cell) 调用
                    // 这里只需要返回 children 拼接结果即可（保留内部格式如 b/i）
                }

                // ============================================================
                // 2. 常规标签：递归处理子节点，然后包裹格式
                // ============================================================
                const children = Array.from(node.childNodes).map(processNode).join('');

                switch (tag) {
                    case 'h1':
                        return `\n# ${children}\n`;
                    case 'h2':
                        return `\n## ${children}\n`;
                    case 'h3':
                        return `\n### ${children}\n`;
                    case 'h4':
                        return `\n#### ${children}\n`;
                    case 'h5':
                        return `\n##### ${children}\n`;
                    case 'h6':
                        return `\n###### ${children}\n`;
                    case 'strong':
                    case 'b':
                        return `**${children}**`;
                    case 'em':
                    case 'i':
                        return `*${children}*`;
                    case 'a':
                        return `[${children}](${node.href || ''})`;
                    case 'img':
                        return `![${node.alt || 'image'}](${node.src || ''})`;
                    case 'li':
                        return `- ${children}\n`;
                    case 'p':
                        return `${children}\n\n`;
                    case 'br':
                        return '\n';
                    case 'ul':
                    case 'ol':
                        return `\n${children}`;
                    default:
                        // 处理带 Shadow DOM 的自定义元素（如 Gemini Business 的 ucs-* 组件）
                        if (node.shadowRoot) {
                            return Array.from(node.shadowRoot.childNodes).map(processNode).join('');
                        }
                        // 对于不匹配的标签（如 div, span, table-block 等），直接返回内容
                        return children;
                }
            };

            return processNode(el).trim();
        }

        /**
         * 格式化为 Markdown
         */
        formatToMarkdown(conv, messages) {
            const lines = [];
            const now = new Date().toLocaleString();
            const userLabel = this.t('exportUserLabel') || '用户';

            // 元数据头
            lines.push('---');
            lines.push(`# 📤 ${this.t('exportMetaTitle') || '导出信息'}`);
            lines.push(`- **${this.t('exportMetaConvTitle') || '会话标题'}**: ${conv.title || '未命名'}`);
            lines.push(`- **${this.t('exportMetaTime') || '导出时间'}**: ${now}`);
            lines.push(`- **${this.t('exportMetaSource') || '来源'}**: ${this.siteAdapter.getName()}`);
            lines.push(`- **${this.t('exportMetaUrl') || '链接'}**: ${window.location.href}`);
            lines.push('---');
            lines.push('');

            // 对话内容
            messages.forEach((msg) => {
                if (msg.role === 'user') {
                    lines.push(`## 🙋 ${userLabel}`);
                    lines.push('');
                    lines.push(msg.content);
                    lines.push('');
                    lines.push('---');
                    lines.push('');
                } else {
                    lines.push(`## 🤖 ${this.siteAdapter.getName()}`);
                    lines.push('');
                    lines.push(msg.content);
                    lines.push('');
                    lines.push('---');
                    lines.push('');
                }
            });

            return lines.join('\n');
        }

        /**
         * 格式化为 JSON
         */
        formatToJSON(conv, messages) {
            const data = {
                metadata: {
                    title: conv.title || '未命名',
                    id: conv.id,
                    url: window.location.href,
                    exportTime: new Date().toISOString(),
                    source: this.siteAdapter.getName(),
                },
                messages: messages.map((msg) => ({
                    role: msg.role,
                    content: msg.content,
                })),
            };
            return JSON.stringify(data, null, 2);
        }

        /**
         * 格式化为 TXT（纯文本）
         */
        formatToTXT(conv, messages) {
            const lines = [];
            const now = new Date().toLocaleString();
            const userLabel = this.t('exportUserLabel') || '用户';

            // 元数据
            lines.push(`${this.t('exportMetaConvTitle') || '会话标题'}: ${conv.title || '未命名'}`);
            lines.push(`${this.t('exportMetaTime') || '导出时间'}: ${now}`);
            lines.push(`${this.t('exportMetaSource') || '来源'}: ${this.siteAdapter.getName()}`);
            lines.push(`${this.t('exportMetaUrl') || '链接'}: ${window.location.href}`);
            lines.push('');
            lines.push('='.repeat(50));
            lines.push('');

            // 对话内容
            messages.forEach((msg) => {
                if (msg.role === 'user') {
                    lines.push(`[${userLabel}]`);
                } else {
                    lines.push(`[${this.siteAdapter.getName()}]`);
                }
                lines.push(msg.content);
                lines.push('');
                lines.push('-'.repeat(50));
                lines.push('');
            });

            return lines.join('\n');
        }

        /**
         * 处理 Markdown 中的图片链接，转换为 Base64
         * @param {string} markdownContent
         * @returns {Promise<string>}
         */
        async processMarkdownImages(markdownContent) {
            const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
            const matches = [...markdownContent.matchAll(imgRegex)];

            if (matches.length === 0) return markdownContent;

            let newContent = markdownContent;

            // 使用并行处理加快速度
            const processingPromises = matches.map(async (match) => {
                const [fullMatch, alt, url] = match;

                // 跳过已经是 Base64 的图片
                if (url.startsWith('data:image')) return { fullMatch, base64: null };

                const isBlob = url.startsWith('blob:');

                // 如果不是 blob 且未开启 Base64 导出，则跳过
                if (!isBlob && !this.settings.conversations?.exportImagesToBase64) {
                    return { fullMatch, base64: null };
                }

                try {
                    let blob;
                    if (isBlob) {
                        // Blob URL: 从 DOM 中找到已加载的图片，用 canvas 提取数据
                        const imgEl = document.querySelector(`img[src="${url}"]`);
                        if (!imgEl || !imgEl.complete || imgEl.naturalWidth === 0) {
                            console.warn(`Image not found or not loaded: ${url}`);
                            return { fullMatch, base64: null };
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = imgEl.naturalWidth;
                        canvas.height = imgEl.naturalHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(imgEl, 0, 0);
                        const base64 = canvas.toDataURL('image/png');
                        return { fullMatch, base64, alt };
                    } else {
                        // 远程 URL: 使用 GM_xmlhttpRequest 跨域获取图片
                        const response = await new Promise((resolve, reject) => {
                            GM_xmlhttpRequest({
                                method: 'GET',
                                url: url,
                                responseType: 'blob',
                                onload: (res) => {
                                    if (res.status === 200) resolve(res.response);
                                    else reject(new Error(`HTTP ${res.status}`));
                                },
                                onerror: (err) => reject(err),
                            });
                        });
                        blob = response;
                    }

                    // Blob 转 Base64
                    const base64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });

                    return { fullMatch, base64, alt };
                } catch (error) {
                    // console.warn(`Failed to convert image ${url}:`, error);
                    return { fullMatch, base64: null };
                }
            });

            const results = await Promise.all(processingPromises);

            // 替换内容
            results.forEach(({ fullMatch, base64, alt }) => {
                if (base64) {
                    // 使用 split/join 替换所有相同的匹配项（处理同一图片多次引用）
                    newContent = newContent.split(fullMatch).join(`![${alt}](${base64})`);
                }
            });

            return newContent;
        }

        /**
         * 下载文件
         */
        downloadFile(content, filename, mimeType) {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        /**
         * 创建标签
         * @param {string} name 标签名称
         * @param {string} color 标签颜色
         */
        createTag(name, color) {
            if (!this.data.tags) this.data.tags = [];

            // Check duplicate
            const exists = this.data.tags.some((t) => t.name.toLowerCase() === name.toLowerCase());
            if (exists) {
                showToast(this.t('conversationsTagExists') || '标签名称已存在');
                return null;
            }

            const tag = {
                id: 'tag_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                name,
                color,
            };
            this.data.tags.push(tag);
            this.saveData();
            return tag;
        }

        /**
         * 更新标签
         * @param {string} tagId 标签ID
         * @param {string} name 标签名称
         * @param {string} color 标签颜色
         */
        updateTag(tagId, name, color) {
            if (!this.data.tags) return null;

            // Check duplicate (exclude self)
            const exists = this.data.tags.some((t) => t.id !== tagId && t.name.toLowerCase() === name.toLowerCase());
            if (exists) {
                showToast(this.t('conversationsTagExists') || '标签名称已存在');
                return null;
            }

            const tag = this.data.tags.find((t) => t.id === tagId);
            if (tag) {
                tag.name = name;
                tag.color = color;
                this.saveData();
            }
            return tag;
        }

        /**
         * 删除标签
         * @param {string} tagId 标签ID
         */
        deleteTag(tagId) {
            if (!this.data.tags) return;
            // 1. 删除标签定义
            this.data.tags = this.data.tags.filter((t) => t.id !== tagId);

            // 2. 从所有会话中移除该标签引用
            Object.values(this.data.conversations).forEach((conv) => {
                if (conv.tagIds) {
                    conv.tagIds = conv.tagIds.filter((id) => id !== tagId);
                    if (conv.tagIds.length === 0) delete conv.tagIds;
                }
            });

            this.saveData();
        }

        /**
         * 设置会话标签
         * @param {string} convId 会话ID
         * @param {Array<string>} tagIds 标签ID数组
         */
        setConversationTags(convId, tagIds) {
            if (this.data.conversations[convId]) {
                if (tagIds && tagIds.length > 0) {
                    this.data.conversations[convId].tagIds = tagIds;
                } else {
                    delete this.data.conversations[convId].tagIds;
                }
                this.saveData();
            }
        }

        /**
         * 显示移动到文件夹对话框
         */
        showMoveToFolderDialog(conv) {
            const overlay = createElement('div', { className: 'conversations-dialog-overlay' });

            const dialog = createElement('div', { className: 'conversations-dialog' });
            dialog.appendChild(createElement('div', { className: 'conversations-dialog-title' }, this.t('conversationsMoveTo') || '移动到...'));

            // 搜索框 + 新建文件夹按钮
            const searchRow = createElement('div', {
                style: 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;',
            });
            const searchInput = createElement('input', {
                type: 'text',
                className: 'conversations-dialog-search',
                placeholder: '搜索文件夹...',
                style: 'flex: 1; padding: 8px; border: 1px solid var(--gh-input-border, #d1d5db); border-radius: 4px; box-sizing: border-box; font-size: 13px;',
            });
            const addFolderBtn = createElement('button', {
                className: 'conversations-dialog-add-folder-btn',
                title: this.t('conversationsAddFolder') || '新建文件夹',
                style: 'width: 36px; height: 36px; border: 1px solid var(--gh-input-border, #d1d5db); border-radius: 4px; background: var(--gh-bg, white); cursor: pointer; display: flex; align-items: center; justify-content: center;',
            });
            const addSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            addSvg.setAttribute('viewBox', '0 0 24 24');
            addSvg.setAttribute('fill', 'var(--gh-text-secondary, #6b7280)');
            addSvg.setAttribute('width', '18');
            addSvg.setAttribute('height', '18');
            const addPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            addPath.setAttribute('d', 'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z');
            addSvg.appendChild(addPath);
            addFolderBtn.appendChild(addSvg);
            addFolderBtn.addEventListener('click', () => {
                overlay.remove();
                this.showCreateFolderDialog();
            });
            searchRow.appendChild(searchInput);
            searchRow.appendChild(addFolderBtn);
            dialog.appendChild(searchRow);

            // 文件夹列表
            const list = createElement('div', { className: 'conversations-folder-select-list' });

            // 渲染列表函数
            const renderList = (filter = '') => {
                clearElement(list);
                this.data.folders.forEach((folder) => {
                    // 排除当前所在文件夹
                    if (folder.id === conv.folderId) return;

                    const folderName = folder.name.replace(folder.icon, '').trim();
                    if (filter && !folderName.toLowerCase().includes(filter.toLowerCase())) return;

                    const item = createElement(
                        'div',
                        {
                            className: 'conversations-folder-select-item',
                            'data-folder-id': folder.id,
                        },
                        `${folder.icon} ${folderName}`,
                    );
                    item.addEventListener('click', () => {
                        // 移动会话
                        this.data.conversations[conv.id].folderId = folder.id;
                        this.data.conversations[conv.id].updatedAt = Date.now();
                        this.saveData();
                        this.createUI();
                        overlay.remove();
                        showToast((this.t('conversationsMoved') || '已移动到') + ` ${folder.name}`);
                    });
                    list.appendChild(item);
                });
            };

            // 初始渲染
            renderList();

            // 搜索事件
            searchInput.addEventListener('input', (e) => {
                renderList(e.target.value);
            });

            dialog.appendChild(list);

            // 取消按钮
            const btns = createElement('div', { className: 'conversations-dialog-buttons' });
            const cancelBtn = createElement('button', { className: 'conversations-dialog-btn cancel' }, this.t('cancel') || '取消');
            cancelBtn.addEventListener('click', () => overlay.remove());
            btns.appendChild(cancelBtn);
            dialog.appendChild(btns);

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            searchInput.focus();
        }

        /**
         * 格式化时间显示
         */
        formatTime(timestamp) {
            if (!timestamp) return '';
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;

            if (diff < 60000) return this.t('justNow') || '刚刚';
            if (diff < 3600000) return Math.floor(diff / 60000) + (this.t('minutesAgo') || '分钟前');
            if (diff < 86400000) return Math.floor(diff / 3600000) + (this.t('hoursAgo') || '小时前');
            if (diff < 604800000) return Math.floor(diff / 86400000) + (this.t('daysAgo') || '天前');

            return date.toLocaleDateString();
        }

        /**
         * 显示文件夹操作菜单
         */
        showFolderMenu(folder, anchorEl) {
            // 移除已有菜单
            document.querySelectorAll('.conversations-folder-menu').forEach((m) => m.remove());

            const menu = createElement('div', { className: 'conversations-folder-menu' });

            const renameBtn = createElement('button', {}, this.t('conversationsRename') || '重命名');
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.remove();
                this.showRenameFolderDialog(folder);
            });

            const deleteBtn = createElement('button', { style: 'color: #ef4444;' }, this.t('conversationsDelete') || '删除');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.remove();
                this.confirmDeleteFolder(folder);
            });

            menu.appendChild(renameBtn);
            menu.appendChild(deleteBtn);

            // 定位菜单
            const rect = anchorEl.getBoundingClientRect();
            menu.style.position = 'fixed';
            menu.style.top = `${rect.bottom + 4}px`;
            menu.style.left = `${rect.left}px`;

            document.body.appendChild(menu);

            // 点击外部关闭
            const closeMenu = (e) => {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            };
            setTimeout(() => document.addEventListener('click', closeMenu), 0);
        }

        /**
         * 显示新建文件夹对话框
         */
        showCreateFolderDialog() {
            this.showFolderDialog({
                title: this.t('conversationsAddFolder') || '新建文件夹',
                icon: '📁',
                name: '',
                onConfirm: (name, icon) => {
                    if (name.trim()) {
                        this.createFolder(name.trim(), icon);
                        this.createUI(); // 刷新 UI
                        showToast(this.t('conversationsFolderCreated') || '文件夹已创建');
                    }
                },
            });
        }

        /**
         * 显示重命名文件夹对话框
         */
        showRenameFolderDialog(folder) {
            const currentName = folder.name.replace(folder.icon, '').trim();
            this.showFolderDialog({
                title: this.t('conversationsRename') || '重命名文件夹',
                icon: folder.icon,
                name: currentName,
                onConfirm: (name, icon) => {
                    if (name.trim()) {
                        this.renameFolder(folder.id, name.trim(), icon);
                        this.createUI(); // 刷新 UI
                        showToast(this.t('conversationsFolderRenamed') || '文件夹已重命名');
                    }
                },
            });
        }

        /**
         * 确认删除文件夹
         */
        confirmDeleteFolder(folder) {
            this.showConfirmDialog(this.t('conversationsDelete') || '删除', this.t('conversationsDeleteConfirm') || `确定删除文件夹 "${folder.name}" 吗？其中的会话将移到收件箱。`, () => {
                if (this.deleteFolder(folder.id)) {
                    this.createUI(); // 刷新 UI
                    showToast(this.t('conversationsFolderDeleted') || '文件夹已删除');
                }
            });
        }

        /**
         * 通用文件夹对话框（新建/重命名复用）
         */
        showFolderDialog({ title, icon, name, onConfirm }) {
            const overlay = createElement('div', { className: 'conversations-dialog-overlay' });
            const dialog = createElement('div', { className: 'conversations-dialog' });

            // 标题
            dialog.appendChild(createElement('div', { className: 'conversations-dialog-title' }, title));

            // Emoji 选择器
            const emojiSection = createElement('div', { className: 'conversations-dialog-section' });
            emojiSection.appendChild(createElement('label', {}, this.t('conversationsIcon') || '图标'));
            const emojiPicker = this.createEmojiPicker(icon);
            emojiSection.appendChild(emojiPicker);
            dialog.appendChild(emojiSection);

            // 名称输入
            const nameSection = createElement('div', { className: 'conversations-dialog-section' });
            nameSection.appendChild(createElement('label', {}, this.t('conversationsFolderName') || '名称'));
            const nameInput = createElement('input', {
                type: 'text',
                className: 'conversations-dialog-input',
                value: name,
                placeholder: this.t('conversationsFolderNamePlaceholder') || '输入文件夹名称',
            });
            nameSection.appendChild(nameInput);
            dialog.appendChild(nameSection);

            // 按钮
            const buttons = createElement('div', { className: 'conversations-dialog-buttons' });
            const cancelBtn = createElement('button', { className: 'conversations-dialog-btn cancel' }, this.t('cancel') || '取消');
            const confirmBtn = createElement('button', { className: 'conversations-dialog-btn confirm' }, this.t('confirm') || '确定');

            cancelBtn.addEventListener('click', () => overlay.remove());
            confirmBtn.addEventListener('click', () => {
                const customInput = emojiPicker.querySelector('input');
                const selectedIcon = customInput ? customInput.value : emojiPicker.querySelector('.selected')?.textContent || icon;
                onConfirm(nameInput.value, selectedIcon);
                overlay.remove();
            });

            buttons.appendChild(cancelBtn);
            buttons.appendChild(confirmBtn);
            dialog.appendChild(buttons);

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            // 聚焦输入框
            nameInput.focus();

            // 点击遮罩关闭 (智能行为：有输入则保存，无输入则关闭)
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    const name = nameInput.value.trim();
                    // 这里我们复用 confirmBtn 的逻辑，因为 confirmBtn 里也只是调用 onConfirm
                    // 但我们需要判断是否有效。
                    // 用户的要求：输入了->新建/编辑；没有输入->关闭
                    if (name) {
                        confirmBtn.click();
                    } else {
                        overlay.remove();
                    }
                }
            });

            // ESC 关闭，Enter 确定
            overlay.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') overlay.remove();
                if (e.key === 'Enter') confirmBtn.click();
            });
        }

        /**
         * 创建 Emoji 选择器 (增强版)
         */
        createEmojiPicker(selectedEmoji = '📁') {
            const container = createElement('div', {
                className: 'conversations-emoji-picker',
                style: 'display: flex; flex-direction: column; gap: 8px;',
            });

            // 1. 自定义输入区域
            const customRow = createElement('div', {
                className: 'conversations-emoji-custom-row',
                style: 'display: flex; align-items: center; gap: 8px; padding: 4px; background: var(--gh-bg-secondary, #f9fafb); border-radius: 4px; border: 1px solid var(--gh-border, #e5e7eb);',
            });

            const customLabel = createElement('span', { style: 'font-size: 12px; color: var(--gh-text-secondary, #6b7280); flex-shrink: 0;' }, this.t('conversationsCustomIcon') || '自定义:');

            const customInput = createElement('input', {
                type: 'text',
                className: 'conversations-emoji-custom-input',
                value: selectedEmoji,
                maxLength: 4, // 稍微放宽长度
                placeholder: '☺',
                style: 'width: 60px; text-align: center; border: 1px solid var(--gh-input-border, #d1d5db); border-radius: 4px; padding: 2px; font-size: 16px; background: var(--gh-input-bg, #ffffff); color: var(--gh-text, #1f2937);',
            });

            customRow.appendChild(customLabel);
            customRow.appendChild(customInput);
            container.appendChild(customRow);

            // 2. 预设列表区域
            const listContainer = createElement('div', {
                className: 'conversations-emoji-list',
                style: 'display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; max-height: 120px; overflow-y: auto; padding: 2px; scrollbar-width: none; -ms-overflow-style: none;',
            });
            // Hide scrollbar style
            const hideScrollStyle = document.createElement('style');
            hideScrollStyle.textContent = `.conversations-emoji-list::-webkit-scrollbar { display: none; }`;
            listContainer.appendChild(hideScrollStyle);

            // 扩充的预设 Emoji 库 (64个)
            const presetEmojis = [
                // 📂 基础文件夹
                '📁',
                '📂',
                '📥',
                '🗂️',
                '📊',
                '📈',
                '📉',
                '📋',
                // 💼 办公/工作
                '💼',
                '📅',
                '📌',
                '📎',
                '📝',
                '✒️',
                '🔍',
                '💡',
                // 💻 编程/技术
                '💻',
                '⌨️',
                '🖥️',
                '🖱️',
                '🐛',
                '🔧',
                '🔨',
                '⚙️',
                // 🤖 AI/机器人
                '🤖',
                '👾',
                '🧠',
                '⚡',
                '🔥',
                '✨',
                '🎓',
                '📚',
                // 🎨 创意/艺术
                '🎨',
                '🎭',
                '🎬',
                '🎹',
                '🎵',
                '📷',
                '🖌️',
                '🖍️',
                // 🏠 生活/日常
                '🏠',
                '🛒',
                '✈️',
                '🎮',
                '⚽',
                '🍔',
                '☕',
                '❤️',
                // 🌈 颜色/标记
                '🔴',
                '🟠',
                '🟡',
                '🟢',
                '🔵',
                '🟣',
                '⚫',
                '⚪',
                // ⭐ 其他
                '⭐',
                '🌟',
                '🎉',
                '🔒',
                '🔑',
                '🚫',
                '✅',
                '❓',
            ];

            // 选中状态管理
            let currentSelectedBtn = null;

            presetEmojis.forEach((emoji) => {
                const btn = createElement(
                    'button',
                    {
                        className: 'conversations-emoji-btn' + (emoji === selectedEmoji ? ' selected' : ''),
                        style: 'width: 24px; height: 24px; padding: 0; display: flex; align-items: center; justify-content: center; border: none; background: transparent; cursor: pointer; border-radius: 4px; font-size: 16px;',
                    },
                    emoji,
                );

                if (emoji === selectedEmoji) currentSelectedBtn = btn;

                btn.addEventListener('click', (e) => {
                    e.preventDefault(); // 防止触发表单提交等意外行为

                    // 更新按钮选中状态
                    if (currentSelectedBtn) {
                        currentSelectedBtn.classList.remove('selected');
                        currentSelectedBtn.style.backgroundColor = 'transparent';
                    }
                    btn.classList.add('selected');
                    btn.style.backgroundColor = '#dbeafe'; // 浅蓝背景表示选中
                    currentSelectedBtn = btn;

                    // 同步到自定义输入框
                    customInput.value = emoji;
                    // 标记为用户手动选择的 (通过 class，供外部获取值时优先使用输入框的值)
                    customInput.classList.add('selected');
                });

                // Hover 效果
                btn.onmouseenter = () => {
                    if (!btn.classList.contains('selected')) btn.style.backgroundColor = 'var(--gh-hover, #f3f4f6)';
                };
                btn.onmouseleave = () => {
                    if (!btn.classList.contains('selected')) btn.style.backgroundColor = 'transparent';
                };

                listContainer.appendChild(btn);
            });

            container.appendChild(listContainer);

            // 自定义输入监听
            customInput.addEventListener('input', (e) => {
                let val = e.target.value;

                // 简单的 Emoji 校验：利用 Unicode 属性 \p{Extended_Pictographic}
                const emojiRegex = /[^\p{Extended_Pictographic}\u200d\ufe0f]/gu;
                if (val && emojiRegex.test(val)) {
                    val = val.replace(emojiRegex, '');
                    e.target.value = val;
                }

                // 清除按钮选中状态，因为现在是自定义的
                if (currentSelectedBtn) {
                    currentSelectedBtn.classList.remove('selected');
                    currentSelectedBtn.style.backgroundColor = 'transparent';
                    currentSelectedBtn = null;
                }

                // 尝试反向匹配：如果输入的内容刚好在预设里，把那个按钮高亮
                const matchBtn = Array.from(listContainer.children).find((b) => b.textContent === val);
                if (matchBtn) {
                    matchBtn.classList.add('selected');
                    matchBtn.style.backgroundColor = '#dbeafe';
                    currentSelectedBtn = matchBtn;
                }

                // 给 input 加个标记类
                customInput.classList.add('selected');
            });

            // 初始高亮颜色
            if (currentSelectedBtn) {
                currentSelectedBtn.style.backgroundColor = '#dbeafe';
            }

            return container;
        }

        /**
         * 设置激活状态
         * 激活时刷新所有文件夹计数和展开的文件夹
         */
        setActive(active) {
            const wasActive = this.isActive;
            this.isActive = active;

            // 从非激活变为激活时，刷新所有文件夹计数和展开的文件夹
            if (!wasActive && active) {
                this.refreshAllFolderCounts();
            }
        }

        /**
         * 刷新所有文件夹的计数和展开的文件夹会话列表
         */
        refreshAllFolderCounts() {
            if (!this.data || !this.data.folders) return;

            this.data.folders.forEach((folder) => {
                this.updateFolderCount(folder.id);
            });
        }

        /**
         * 刷新会话列表
         */
        refresh() {
            this.loadData();
            this.createUI();
        }

        /**
         * 处理搜索输入
         * @param {string} query 搜索关键词
         */
        handleSearch(query) {
            this.searchQuery = query;
            if (!query && (!this.filterTagIds || this.filterTagIds.size === 0) && !this.filterPinned) {
                // 清空搜索时重置（无关键词、无标签筛选、无置顶筛选）
                this.searchResult = null;
                this.refreshAfterSearch();
                return;
            }

            // 执行搜索
            this.searchResult = this.performSearch(query);
            this.refreshAfterSearch();
        }

        /**
         * 执行搜索
         * @param {string} query 搜索关键词
         * @returns {{ folderMatches: Set, conversationMatches: Set, conversationFolderMap: Map, totalCount: number }}
         */
        performSearch(query) {
            const lowerQuery = query.toLowerCase();
            const folderMatches = new Set(); // 直接匹配的文件夹 ID
            const conversationMatches = new Set(); // 匹配的会话 ID
            const conversationFolderMap = new Map(); // 会话 ID -> 所属文件夹 ID（用于展开父级）

            // 获取当前 CID（仅 Gemini Business 有效）
            const currentCid = this.siteAdapter.getCurrentCid ? this.siteAdapter.getCurrentCid() : null;

            // 1. 遍历文件夹，匹配名称
            if (this.data && this.data.folders && lowerQuery) {
                this.data.folders.forEach((folder) => {
                    if (folder.name.toLowerCase().includes(lowerQuery)) {
                        folderMatches.add(folder.id);
                    }
                });
            }

            // 2. 遍历会话，匹配标题（按 CID 过滤）
            if (this.data && this.data.conversations) {
                Object.values(this.data.conversations).forEach((conv) => {
                    // 先按 CID 过滤
                    if (!this.matchesCid(conv, currentCid)) return;

                    // 逻辑整合：关键词 AND 标签 AND 置顶
                    const matchQuery = !lowerQuery || (conv.title && conv.title.toLowerCase().includes(lowerQuery));
                    const matchTags = !this.filterTagIds || this.filterTagIds.size === 0 || (conv.tagIds && conv.tagIds.some((id) => this.filterTagIds.has(id)));
                    const matchPinned = !this.filterPinned || conv.pinned;

                    if (matchQuery && matchTags && matchPinned) {
                        conversationMatches.add(conv.id);
                        conversationFolderMap.set(conv.id, conv.folderId);
                    }
                });
            }

            return {
                folderMatches,
                conversationMatches,
                conversationFolderMap,
                totalCount: folderMatches.size + conversationMatches.size,
            };
        }

        /**
         * 搜索后刷新 UI（不重建整个面板，只更新列表和结果条）
         */
        refreshAfterSearch() {
            // 更新结果条
            const resultBar = document.getElementById('conversations-result-bar');
            if (resultBar) {
                if (this.searchResult) {
                    resultBar.textContent = `${this.searchResult.totalCount} ${this.t('conversationsSearchResult') || '个结果'}`;
                    resultBar.classList.add('visible');
                } else {
                    resultBar.textContent = '';
                    resultBar.classList.remove('visible');
                }
            }

            // 重建文件夹列表（带搜索过滤）
            const container = this.container?.querySelector('.conversations-content');
            const oldFolderList = container?.querySelector('.conversations-folder-list');
            if (container && oldFolderList) {
                const newFolderList = this.createFolderListUI();
                container.replaceChild(newFolderList, oldFolderList);
            }
        }

        /**
         * 高亮文本中的关键词
         * @param {string} text 原始文本
         * @param {string} query 搜索关键词
         * @returns {DocumentFragment} 带高亮的文档片段
         */
        highlightText(text, query) {
            const fragment = document.createDocumentFragment();
            if (!query) {
                fragment.appendChild(document.createTextNode(text));
                return fragment;
            }

            try {
                const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(${escapedQuery})`, 'gi');
                const parts = text.split(regex);

                parts.forEach((part) => {
                    if (part.toLowerCase() === query.toLowerCase()) {
                        const mark = document.createElement('mark');
                        mark.textContent = part;
                        mark.style.backgroundColor = 'rgba(255, 235, 59, 0.5)';
                        mark.style.color = 'inherit';
                        mark.style.padding = '0 2px';
                        mark.style.borderRadius = '2px';
                        fragment.appendChild(mark);
                    } else {
                        fragment.appendChild(document.createTextNode(part));
                    }
                });
            } catch (e) {
                fragment.appendChild(document.createTextNode(text));
            }
            return fragment;
        }

        /**
         * 显示标签管理对话框
         */
        showTagManagerDialog(conv = null) {
            const overlay = createElement('div', { className: 'conversations-dialog-overlay' });
            const dialog = createElement('div', { className: 'conversations-dialog conversations-dialog-tag-manager' });

            // 标题
            // 标题栏 (含关闭按钮)
            const titleRow = createElement('div', {
                className: 'conversations-dialog-title',
                style: 'display:flex; justify-content:space-between; align-items:center;',
            });
            titleRow.textContent = this.t('conversationsManageTags') || '管理标签';

            const closeIcon = createElement(
                'span',
                {
                    className: 'conversations-close-icon',
                    style: 'cursor:pointer; padding:4px; font-size:20px; color:#9ca3af; line-height:1; width:24px; height:24px; display:flex; align-items:center; justify-content:center; border-radius:4px;',
                    title: this.t('close') || '关闭',
                },
                '×',
            );
            closeIcon.addEventListener('click', () => overlay.remove());
            closeIcon.addEventListener('mouseenter', () => (closeIcon.style.backgroundColor = 'var(--gh-hover, #f3f4f6)'));
            closeIcon.addEventListener('mouseleave', () => (closeIcon.style.backgroundColor = 'transparent'));

            titleRow.appendChild(closeIcon);
            dialog.appendChild(titleRow);

            const content = createElement('div', { className: 'conversations-dialog-content' });

            // 标签列表容器 (隐藏滚动条)
            const listContainer = createElement('div', {
                className: 'conversations-tag-manager-list',
                style: 'scrollbar-width: none; -ms-overflow-style: none;', // Firefox, IE
            });
            // 注入隐藏 scrollbar 的样式 (Chrome/Safari)
            const hideScrollStyle = document.createElement('style');
            hideScrollStyle.textContent = `.conversations-tag-manager-list::-webkit-scrollbar { display: none; }`;
            listContainer.appendChild(hideScrollStyle);

            const renderList = () => {
                clearElement(listContainer);
                if (!this.data.tags || this.data.tags.length === 0) {
                    listContainer.appendChild(createElement('div', { className: 'conversations-empty' }, this.t('conversationsNoTags') || '暂无标签'));
                    return;
                }

                this.data.tags.forEach((tag) => {
                    const item = createElement('div', { className: 'conversations-tag-manager-item' });

                    // 左侧：勾选框（如果有会话上下文）+ 预览
                    const left = createElement('div', { style: 'display:flex; align-items:center; gap:8px;' });

                    let checkbox = null;
                    if (conv) {
                        checkbox = createElement('input', { type: 'checkbox' });
                        checkbox.checked = conv.tagIds && conv.tagIds.includes(tag.id);
                        checkbox.addEventListener('change', () => {
                            let newTags = conv.tagIds || [];
                            if (checkbox.checked) {
                                if (!newTags.includes(tag.id)) newTags.push(tag.id);
                            } else {
                                newTags = newTags.filter((id) => id !== tag.id);
                            }
                            this.setConversationTags(conv.id, newTags);
                            this.saveData();
                            const list = this.container.querySelector(`.conversations-list[data-folder-id="${conv.folderId}"]`);
                            if (list) this.renderConversationList(conv.folderId, list);
                        });
                        checkbox.addEventListener('click', (e) => e.stopPropagation()); // 防止点击 checkbox 触发行点击
                        left.appendChild(checkbox);
                    }

                    const preview = createElement(
                        'span',
                        {
                            className: 'conversations-tag-preview',
                            style: `background-color: ${tag.color}`,
                        },
                        tag.name,
                    );
                    left.appendChild(preview);
                    item.appendChild(left);

                    // 右侧：编辑/删除按钮
                    const actions = createElement('div', { className: 'conversations-tag-actions' });

                    // 编辑逻辑简化：点击填充到底部输入框，暂不实现行内编辑
                    const editBtn = createElement(
                        'button',
                        {
                            className: 'conversations-tag-btn edit',
                            title: this.t('edit'),
                        },
                        '✎',
                    );
                    editBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); // 防止触发行点击
                        nameInput.value = tag.name;
                        updateColorSelection(tag.color);
                        editingId = tag.id;
                        addBtn.textContent = this.t('conversationsUpdateTag') || '更新标签';
                    });
                    actions.appendChild(editBtn);

                    const delBtn = createElement(
                        'button',
                        {
                            className: 'conversations-tag-btn delete',
                            title: this.t('delete'),
                        },
                        '×',
                    );
                    delBtn.addEventListener('click', (e) => {
                        e.stopPropagation(); // 防止触发行点击
                        if (confirm(this.t('confirmDelete') || '确定删除?')) {
                            this.deleteTag(tag.id);
                            renderList();
                            // 刷新所有可见的会话列表
                            this.container.querySelectorAll('.conversations-list').forEach((list) => {
                                const fid = list.dataset.folderId;
                                if (fid) this.renderConversationList(fid, list);
                            });
                        }
                    });
                    actions.appendChild(delBtn);

                    item.appendChild(actions);

                    // 整行点击切换 checkbox（仅在有会话上下文时）
                    if (conv && checkbox) {
                        item.style.cursor = 'pointer';
                        item.addEventListener('click', () => {
                            checkbox.checked = !checkbox.checked;
                            checkbox.dispatchEvent(new Event('change')); // 触发 change 事件更新数据
                        });
                    }

                    listContainer.appendChild(item);
                });
            };

            content.appendChild(listContainer);

            // 新建/编辑区域
            const formSection = createElement('div', {
                className: 'conversations-dialog-section',
                style: 'border-top:1px solid #eee; padding-top:10px;',
            });

            let editingId = null;

            const nameInput = createElement('input', {
                type: 'text',
                className: 'conversations-dialog-input',
                placeholder: this.t('conversationsTagName') || '标签名称',
                style: 'flex:1; margin-bottom: 8px;',
            });
            // Enter 提交
            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') addBtn.click();
            });
            formSection.appendChild(nameInput);

            const colorPicker = createElement('div', { className: 'conversations-color-picker' });
            let selectedColor = TAG_COLORS[0];

            // 1. 渲染 30 色预设网格
            const updateColorSelection = (color, source = 'click') => {
                if (!color.startsWith('#')) color = '#' + color;
                selectedColor = color;

                // 更新 Hex 输入框
                if (source !== 'input') {
                    hexInput.value = color;
                    hexInput.style.borderColor = '#ddd'; // Reset error state
                }

                // 更新选中状态
                // 检查是否在预设中
                const presetMatch = Array.from(colorPicker.children).find((c) => c.dataset.color && c.dataset.color.toLowerCase() === color.toLowerCase());

                Array.from(colorPicker.children).forEach((c) => c.classList.remove('selected'));

                if (presetMatch) {
                    presetMatch.classList.add('selected');
                    // 重置自定义按钮
                    customBtnInner.style.background = 'conic-gradient(from 180deg, red, yellow, lime, aqua, blue, magenta, red)';
                    customBtn.classList.remove('active-custom');
                } else {
                    // 自定义颜色选中
                    customBtnInner.style.background = color;
                    customBtn.classList.add('active-custom');
                }
            };

            TAG_COLORS.forEach((color) => {
                const colorItem = createElement('div', {
                    className: 'conversations-color-item',
                    style: `background-color: ${color}`,
                    'data-color': color,
                });
                if (color === selectedColor) colorItem.classList.add('selected');
                colorItem.addEventListener('click', () => updateColorSelection(color));
                colorPicker.appendChild(colorItem);
            });
            formSection.appendChild(colorPicker);

            // 2. 自定义颜色行 (彩虹按钮 + Hex 输入框)
            const customRow = createElement('div', {
                style: 'display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 0 4px;',
            });

            // 彩虹按钮容器
            const customBtn = createElement('div', {
                className: 'conversations-color-item custom-btn-wrapper',
                title: '自定义颜色',
                style: 'position: relative; cursor: pointer; border: 2px solid transparent; width: 32px; height: 32px; border-radius: 50%; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);',
            });
            // 选中样式 CSS (通过 class 控制 border)
            const customBtnStyle = document.createElement('style');
            customBtnStyle.textContent = `
                .active-custom { border-color: #666 !important; transform: scale(1.1); }
            `;
            customRow.appendChild(customBtnStyle);

            const customBtnInner = createElement('div', {
                style: 'width: 100%; height: 100%; background: conic-gradient(from 180deg, red, yellow, lime, aqua, blue, magenta, red);',
            });

            const nativePicker = createElement('input', {
                type: 'color',
                style: 'position: absolute; left: -50%; top: -50%; width: 200%; height: 200%; opacity: 0; cursor: pointer;',
            });
            nativePicker.addEventListener('input', (e) => updateColorSelection(e.target.value, 'picker'));

            customBtn.appendChild(customBtnInner);
            customBtn.appendChild(nativePicker);
            customRow.appendChild(customBtn);

            // Hex 输入区域
            const hexWrapper = createElement('div', {
                style: 'display: flex; align-items: center; gap: 8px; flex: 1;',
            });
            hexWrapper.appendChild(createElement('span', { style: 'font-size: 13px; color: #666;' }, 'HEX:'));

            const hexInput = createElement('input', {
                type: 'text',
                className: 'conversations-dialog-input',
                value: selectedColor,
                placeholder: '#RRGGBB',
                style: 'flex: 1; font-family: monospace; text-transform: uppercase;',
            });

            hexInput.addEventListener('input', (e) => {
                const val = e.target.value;
                // 正则校验: #后面跟3或6位16进制字符
                const hexRegex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
                if (hexRegex.test(val)) {
                    hexInput.style.borderColor = '#ddd'; // Valid
                    // 补全3位到6位
                    let expandVal = val;
                    if (val.length === 4) {
                        expandVal = '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
                    }
                    updateColorSelection(expandVal, 'input');
                } else {
                    hexInput.style.borderColor = '#ef4444'; // Invalid
                }
            });

            // 失去焦点时如果无效则恢复
            hexInput.addEventListener('blur', () => {
                if (hexInput.style.borderColor === 'rgb(239, 68, 68)' || hexInput.style.borderColor === '#ef4444') {
                    hexInput.value = selectedColor;
                    hexInput.style.borderColor = '#ddd';
                }
            });

            hexWrapper.appendChild(hexInput);
            customRow.appendChild(hexWrapper);

            formSection.appendChild(customRow);

            // 初始化颜色选择状态
            updateColorSelection(selectedColor, 'init');

            const addBtn = createElement(
                'button',
                {
                    className: 'conversations-dialog-btn confirm',
                    style: 'width:100%; margin-top:8px;',
                },
                this.t('conversationsNewTag') || '新建标签',
            );

            addBtn.addEventListener('click', () => {
                const name = nameInput.value.trim();
                if (!name) return;

                let result;
                if (editingId) {
                    result = this.updateTag(editingId, name, selectedColor);
                } else {
                    result = this.createTag(name, selectedColor);
                }

                if (result) {
                    // Success
                    if (editingId) {
                        editingId = null;
                        addBtn.textContent = this.t('conversationsNewTag') || '新建标签';
                    }
                    nameInput.value = '';
                    // Reset color selection? Maybe keep it.
                    renderList();

                    // 刷新所有可见的会话列表 (因为标签修改会影响所有使用了该标签的会话)
                    this.container.querySelectorAll('.conversations-list').forEach((list) => {
                        const fid = list.dataset.folderId;
                        if (fid) this.renderConversationList(fid, list);
                    });
                }
                // If result is null, validation failed (toast already shown), keep input for user to fix
            });

            formSection.appendChild(addBtn);
            content.appendChild(formSection);
            dialog.appendChild(content);

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            // 渲染列表
            renderList();

            // 点击遮罩关闭
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.remove();
            });

            // ESC 关闭
            overlay.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') overlay.remove();
            });

            // Focus input
            nameInput.focus();
        }
    }

    /**
     * 通用大纲管理器
     * 负责大纲的 UI 渲染、交互和状态管理
     * 数据源由外部适配器提供
     */
    class OutlineManager {
        constructor(config) {
            this.container = config.container;
            this.settings = config.settings;
            this.siteAdapter = config.siteAdapter; // 用于获取滚动容器等
            this.onSettingsChange = config.onSettingsChange;
            this.onJumpBefore = config.onJumpBefore; // 跳转前回调，用于保存锚点
            this.t = config.i18n || ((k) => k);

            this.state = {
                tree: null,
                treeKey: '',
                minLevel: 1,
                expandLevel: this.settings.outline?.maxLevel ?? 6,
                includeUserQueries: this.settings.outline?.showUserQueries ?? false, // 是否展示用户提问
                levelCounts: {},
                isAllExpanded: false,
                rawOutline: [],
                // 搜索相关状态
                searchQuery: '',
                searchLevelManual: false, // 标记用户是否在搜索时手动调整了层级
                searchResults: null, // 存储搜索匹配信息 { matchedIds: Set, relevantIds: Set }
                preSearchState: null, // 搜索前的状态快照
            };

            // 自动更新相关
            this.observer = null;
            this.updateDebounceTimer = null;
            this.isActive = false; // 标记 Tab 是否激活

            // 同步滚动相关
            this.syncScrollHandler = null;
            this.syncScrollThrottleTimer = null;
            this.currentHighlightedItem = null;

            this.init();
        }

        init() {
            this.createUI();
            this.updateAutoUpdateState();
        }

        setActive(active) {
            this.isActive = active;
            this.updateAutoUpdateState();
            this.updateSyncScrollState();
        }

        updateAutoUpdateState() {
            // 只有当：大纲功能开启 AND 自动更新开启 AND Tab处于激活状态 时才启用 Observer
            const shouldEnable = this.settings.outline?.enabled && this.settings.outline?.autoUpdate && this.isActive;

            if (shouldEnable) {
                this.startObserver();
            } else {
                this.stopObserver();
            }
        }

        // ========== 同步滚动功能 ==========
        updateSyncScrollState() {
            const shouldEnable = this.settings.outline?.enabled && this.settings.outline?.syncScroll && this.isActive;
            if (shouldEnable) {
                this.startSyncScroll();
            } else {
                this.stopSyncScroll();
            }
        }

        startSyncScroll(retryCount = 0) {
            if (this.syncScrollHandler) return;
            if (!this.siteAdapter) return;

            const scrollContainer = this.siteAdapter.getScrollContainer();
            if (!scrollContainer) {
                // 滚动容器可能还没准备好，最多重试 10 次，每次间隔 300ms（共 3 秒）
                if (retryCount < 10) {
                    setTimeout(() => {
                        if (this.settings.outline?.syncScroll && this.isActive && !this.syncScrollHandler) {
                            this.startSyncScroll(retryCount + 1);
                        }
                    }, 300);
                }
                return;
            }

            this.syncScrollHandler = () => {
                // 搜索模式下暂停同步
                if (this.state.searchQuery) return;

                // 节流：200ms
                if (this.syncScrollThrottleTimer) return;
                this.syncScrollThrottleTimer = setTimeout(() => {
                    this.syncScrollThrottleTimer = null;
                    this.handleSyncScroll();
                }, 200);
            };

            scrollContainer.addEventListener('scroll', this.syncScrollHandler, { passive: true });
        }

        stopSyncScroll() {
            if (!this.syncScrollHandler) return;
            if (!this.siteAdapter) return;

            const scrollContainer = this.siteAdapter.getScrollContainer();
            if (scrollContainer) {
                scrollContainer.removeEventListener('scroll', this.syncScrollHandler);
            }
            this.syncScrollHandler = null;

            // 清除节流计时器
            if (this.syncScrollThrottleTimer) {
                clearTimeout(this.syncScrollThrottleTimer);
                this.syncScrollThrottleTimer = null;
            }

            // 移除当前高亮
            if (this.currentHighlightedItem) {
                this.currentHighlightedItem.classList.remove('sync-highlight');
                this.currentHighlightedItem = null;
            }
        }

        handleSyncScroll() {
            if (!this.state.tree || this.state.tree.length === 0) return;
            if (!this.siteAdapter) return;

            const scrollContainer = this.siteAdapter.getScrollContainer();
            if (!scrollContainer) return;

            // 展平树结构
            const flattenTree = (items) => {
                const result = [];
                items.forEach((item) => {
                    result.push(item);
                    if (item.children && item.children.length > 0) {
                        result.push(...flattenTree(item.children));
                    }
                });
                return result;
            };
            const allItems = flattenTree(this.state.tree);

            // 找到当前可视区域的第一个大纲元素
            const containerRect = scrollContainer.getBoundingClientRect();
            const viewportTop = containerRect.top;
            const viewportBottom = containerRect.bottom;

            let currentItem = null;
            for (const item of allItems) {
                if (!item.element || !item.element.isConnected) continue;
                const rect = item.element.getBoundingClientRect();
                if (rect.top >= viewportTop && rect.top < viewportBottom) {
                    currentItem = item;
                    break;
                }
                if (rect.top < viewportTop && rect.bottom > viewportTop) {
                    currentItem = item;
                    break;
                }
            }

            if (!currentItem) return;

            // 移除旧高亮
            if (this.currentHighlightedItem) {
                this.currentHighlightedItem.classList.remove('sync-highlight');
            }

            // 找到大纲面板中对应的 DOM 元素
            const outlineList = document.getElementById('outline-list');
            if (!outlineList) return;

            let outlineItem = outlineList.querySelector(`.outline-item[data-index="${currentItem.index}"]`);
            if (!outlineItem) return;

            // 如果目标项被隐藏（折叠），向上找可见的父级
            if (outlineItem.classList.contains('outline-hidden')) {
                let parent = outlineItem.previousElementSibling;
                while (parent) {
                    if (parent.classList.contains('outline-item') && !parent.classList.contains('outline-hidden')) {
                        // 找到可见的父级，检查它的 data-level 是否比当前项小（确保是父级而非同级）
                        const parentLevel = parseInt(parent.dataset.level, 10);
                        const currentLevel = parseInt(outlineItem.dataset.level, 10);
                        if (parentLevel < currentLevel) {
                            outlineItem = parent;
                            break;
                        }
                    }
                    parent = parent.previousElementSibling;
                }
                // 如果还是隐藏的，放弃高亮
                if (outlineItem.classList.contains('outline-hidden')) return;
            }

            // 添加高亮
            outlineItem.classList.add('sync-highlight');
            this.currentHighlightedItem = outlineItem;

            // 轻微滚动大纲面板使高亮项可见（如果超出视口）
            const wrapper = document.getElementById('outline-list-wrapper');
            if (wrapper) {
                const wrapperRect = wrapper.getBoundingClientRect();
                const itemRect = outlineItem.getBoundingClientRect();
                // 如果高亮项在可视区域外，滚动使其可见
                if (itemRect.top < wrapperRect.top || itemRect.bottom > wrapperRect.bottom) {
                    const scrollOffset = itemRect.top - wrapperRect.top - wrapperRect.height / 2 + itemRect.height / 2;
                    wrapper.scrollBy({ top: scrollOffset, behavior: 'smooth' });
                }
            }
        }

        startObserver() {
            if (this.observer) return;

            // 找到聊天记录容器作为观察目标
            // 既然我们增加了 getChatContentSelectors，也许可以用那个？
            // 但对于大纲来说，只要 DOM 变了就可能产生新标题。观察 body 可能最稳妥但性能最差。
            // 观察聊天容器是折中方案。
            // 复用 SiteAdapter 的 getScrollContainer 得到的通常是主滚动容器，
            // 或者用 getResponseContainerSelector
            // 鉴于 Gemini Business 返回空，我们尝试观察 document.body，加上防抖，性能应该可控。

            this.observer = new MutationObserver(() => {
                this.triggerAutoUpdate();
            });

            this.observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true, // 标题文字变化也要检测
            });
            console.log('Gemini Helper: Outline Auto-Update Started');
        }

        stopObserver() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
                console.log('Gemini Helper: Outline Auto-Update Stopped');
            }
            if (this.updateDebounceTimer) {
                clearTimeout(this.updateDebounceTimer);
                this.updateDebounceTimer = null;
            }
        }

        triggerAutoUpdate() {
            const interval = (this.settings.outline?.updateInterval || 5) * 1000;

            // 如果已经在等待更新，不需要重置定时器（这是 throttle/debounce 的关键区别）
            // 我们希望：只要有请求，就确保在未来某个时刻执行，但不要频繁执行
            // 策略：如果 timer 存在，说明已经安排了更新，什么都不做（让它在原定时间触发）
            // 只有 timer 不存在时，才设置一个新的
            if (!this.updateDebounceTimer) {
                this.updateDebounceTimer = setTimeout(() => {
                    this.executeAutoUpdate();
                }, interval);
            }
        }

        executeAutoUpdate() {
            if (this.updateDebounceTimer) {
                clearTimeout(this.updateDebounceTimer);
                this.updateDebounceTimer = null;
            }

            // 触发更新回调（在 GeminiHelper 中定义，实际调用 refreshOutline）
            if (this.config && this.config.onAutoUpdate) {
                this.config.onAutoUpdate();
            }

            // 发送自定义事件通知外部刷新
            window.dispatchEvent(new CustomEvent('gemini-helper-outline-auto-refresh'));
        }

        createUI() {
            const container = this.container;
            clearElement(container);

            const content = createElement('div', { className: 'outline-content' });

            // 固定工具栏
            const toolbar = createElement('div', { className: 'outline-fixed-toolbar' });

            // 第一行：按钮和搜索占位
            const row1 = createElement('div', { className: 'outline-toolbar-row' });

            // 用户提问分组按钮
            const groupBtn = createElement(
                'button',
                {
                    className: 'outline-toolbar-btn' + (this.settings.outline?.showUserQueries ? ' active' : ''),
                    id: 'outline-group-btn',
                    title: this.t('outlineShowUserQueriesTooltip'),
                },
                '🙋',
            );
            groupBtn.addEventListener('click', () => this.toggleGroupMode());
            row1.appendChild(groupBtn);

            // 创建展开/折叠 SVG 图标的辅助函数
            const createExpandIcon = () => {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('viewBox', '0 0 16 16');
                svg.setAttribute('fill', 'none');
                svg.setAttribute('stroke', 'currentColor');
                svg.setAttribute('stroke-width', '2');
                svg.style.width = '14px';
                svg.style.height = '14px';
                // 圆圈
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', '8');
                circle.setAttribute('cy', '8');
                circle.setAttribute('r', '6.5');
                svg.appendChild(circle);
                // 横线
                const h = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                h.setAttribute('x1', '4');
                h.setAttribute('y1', '8');
                h.setAttribute('x2', '12');
                h.setAttribute('y2', '8');
                svg.appendChild(h);
                // 竖线 (⊕ 独有)
                const v = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                v.setAttribute('x1', '8');
                v.setAttribute('y1', '4');
                v.setAttribute('x2', '8');
                v.setAttribute('y2', '12');
                svg.appendChild(v);
                return svg;
            };
            const createCollapseIcon = () => {
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('viewBox', '0 0 16 16');
                svg.setAttribute('fill', 'none');
                svg.setAttribute('stroke', 'currentColor');
                svg.setAttribute('stroke-width', '2');
                svg.style.width = '14px';
                svg.style.height = '14px';
                // 圆圈
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', '8');
                circle.setAttribute('cy', '8');
                circle.setAttribute('r', '6.5');
                svg.appendChild(circle);
                // 横线
                const h = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                h.setAttribute('x1', '4');
                h.setAttribute('y1', '8');
                h.setAttribute('x2', '12');
                h.setAttribute('y2', '8');
                svg.appendChild(h);
                return svg;
            };
            // 保存到类实例以便后续切换使用
            this._createExpandIcon = createExpandIcon;
            this._createCollapseIcon = createCollapseIcon;

            // 展开/折叠按钮 (使用 SVG 图标确保跨平台一致性)
            const expandBtn = createElement('button', {
                className: 'outline-toolbar-btn',
                id: 'outline-expand-btn',
                title: this.t('outlineExpandAll'),
            });
            expandBtn.appendChild(createExpandIcon());
            expandBtn.addEventListener('click', () => this.toggleExpandAll());
            row1.appendChild(expandBtn);

            // 定位当前位置按钮 (使用 SVG 图标确保跨平台一致性)
            const locateBtn = createElement('button', {
                className: 'outline-toolbar-btn',
                id: 'outline-locate-btn',
                title: this.t('outlineLocateCurrent'),
            });
            // 创建定位图标 SVG (crosshair/target 风格)
            const locateSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            // 使用较小的 viewBox 让图形内容占据更大比例
            locateSvg.setAttribute('viewBox', '0 0 18 18');
            locateSvg.setAttribute('fill', 'none');
            locateSvg.setAttribute('stroke', 'currentColor');
            locateSvg.setAttribute('stroke-width', '2');
            locateSvg.setAttribute('stroke-linecap', 'round');
            locateSvg.setAttribute('stroke-linejoin', 'round');
            locateSvg.style.width = '18px';
            locateSvg.style.height = '18px';
            // 圆圈 (中心9,9 半径4.5)
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', '9');
            circle.setAttribute('cy', '9');
            circle.setAttribute('r', '4.5');
            locateSvg.appendChild(circle);
            // 十字准线 (从边缘到圆圈)
            const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line1.setAttribute('x1', '9');
            line1.setAttribute('y1', '1');
            line1.setAttribute('x2', '9');
            line1.setAttribute('y2', '3.5');
            locateSvg.appendChild(line1);
            const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line2.setAttribute('x1', '9');
            line2.setAttribute('y1', '14.5');
            line2.setAttribute('x2', '9');
            line2.setAttribute('y2', '17');
            locateSvg.appendChild(line2);
            const line3 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line3.setAttribute('x1', '1');
            line3.setAttribute('y1', '9');
            line3.setAttribute('x2', '3.5');
            line3.setAttribute('y2', '9');
            locateSvg.appendChild(line3);
            const line4 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line4.setAttribute('x1', '14.5');
            line4.setAttribute('y1', '9');
            line4.setAttribute('x2', '17');
            line4.setAttribute('y2', '9');
            locateSvg.appendChild(line4);
            locateBtn.appendChild(locateSvg);
            locateBtn.addEventListener('click', () => this.locateCurrentPosition());
            row1.appendChild(locateBtn);

            // 滚动按钮
            const scrollBtn = createElement(
                'button',
                {
                    className: 'outline-toolbar-btn',
                    id: 'outline-scroll-btn',
                    title: this.t('outlineScrollBottom'),
                },
                '⬇',
            );
            scrollBtn.addEventListener('click', () => this.scrollList());
            row1.appendChild(scrollBtn);

            // 搜索框区域
            const searchWrapper = createElement('div', { className: 'outline-search-wrapper' });

            const searchInput = createElement('input', {
                type: 'text',
                className: 'outline-search-input',
                placeholder: this.t('outlineSearch'),
                value: this.state.searchQuery,
            });

            const clearBtn = createElement(
                'button',
                {
                    className: 'outline-search-clear hidden',
                    title: this.t('clear'),
                },
                '×',
            );

            // 搜索事件处理
            let debounceTimer;
            searchInput.addEventListener('input', (e) => {
                const val = e.target.value;
                clearBtn.classList.toggle('hidden', !val);

                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.handleSearch(val.trim());
                }, 300);
            });

            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    clearBtn.classList.add('hidden');
                    this.handleSearch('');
                    searchInput.blur();
                }
            });

            clearBtn.addEventListener('click', () => {
                searchInput.value = '';
                clearBtn.classList.add('hidden');
                this.handleSearch('');
                searchInput.focus();
            });

            searchWrapper.appendChild(searchInput);
            searchWrapper.appendChild(clearBtn);
            row1.appendChild(searchWrapper);

            toolbar.appendChild(row1);

            // 第二行：层级滑块
            const row2 = createElement('div', { className: 'outline-toolbar-row' });
            const sliderContainer = createElement('div', { className: 'outline-level-slider-container' });

            // 层级节点
            const dotsContainer = createElement('div', { className: 'outline-level-dots', id: 'outline-level-dots' });
            const levelLine = createElement('div', { className: 'outline-level-line' });
            const levelProgress = createElement('div', {
                className: 'outline-level-progress',
                id: 'outline-level-progress',
            });
            levelLine.appendChild(levelProgress);
            dotsContainer.appendChild(levelLine);

            // 创建 6 个层级节点（0 表示不展开，1-6 表示层级）
            for (let i = 0; i <= 6; i++) {
                const dot = createElement('div', {
                    className: `outline-level-dot ${i <= this.state.expandLevel ? 'active' : ''}`,
                    'data-level': i,
                });
                const tooltip = createElement('div', { className: 'outline-level-dot-tooltip' });
                if (i === 0) {
                    tooltip.textContent = '⊖'; // 不展开
                } else {
                    tooltip.textContent = `H${i}: 0`;
                }
                dot.appendChild(tooltip);
                dot.addEventListener('click', () => this.setLevel(i));
                dotsContainer.appendChild(dot);
            }

            sliderContainer.appendChild(dotsContainer);
            row2.appendChild(sliderContainer);
            toolbar.appendChild(row2);
            content.appendChild(toolbar);

            // 搜索结果统计条 (插入在工具栏和列表之间)
            const resultBar = createElement('div', {
                className: 'outline-result-bar hidden',
                id: 'outline-result-bar',
            });
            content.appendChild(resultBar);

            // 大纲列表包装器（可滚动）
            const listWrapper = createElement('div', { className: 'outline-list-wrapper', id: 'outline-list-wrapper' });
            const list = createElement('div', { className: 'outline-list', id: 'outline-list' });
            listWrapper.appendChild(list);
            content.appendChild(listWrapper);

            container.appendChild(content);
        }

        // 刷新数据
        update(outlineData) {
            const listContainer = document.getElementById('outline-list');
            if (!listContainer) return;

            clearElement(listContainer);

            if (!outlineData || outlineData.length === 0) {
                listContainer.appendChild(createElement('div', { className: 'outline-empty' }, this.t('outlineEmpty')));
                return;
            }

            // 保存原始大纲
            this.state.rawOutline = outlineData;

            // 统计各层级数量
            this.state.levelCounts = {};
            outlineData.forEach((item) => {
                this.state.levelCounts[item.level] = (this.state.levelCounts[item.level] || 0) + 1;
            });
            this.updateTooltips();

            // 智能缩进：检测最高层级（排除用户提问节点，只考虑 AI 回复的标题）
            const headingLevels = outlineData.filter((item) => !item.isUserQuery).map((item) => item.level);
            const minLevel = headingLevels.length > 0 ? Math.min(...headingLevels) : 1;
            this.state.minLevel = minLevel;

            // 在重构树之前，捕获当前的折叠状态
            const currentStateMap = {};
            if (this.state.tree) {
                this.captureTreeState(this.state.tree, currentStateMap);
            }

            // 构建树形结构
            const outlineKey = outlineData.map((i) => i.text).join('|');
            // 只要 key 变了，或者是首次构建，都重新构建树
            // 注意：实时更新时 key 会不断变化，所以必须每次都重建树以包含新节点
            // 但我们需要保持用户的折叠状态
            if (this.state.treeKey !== outlineKey || !this.state.tree) {
                this.state.tree = this.buildTree(outlineData, minLevel);
                this.state.treeKey = outlineKey;
            }
            const tree = this.state.tree;

            // 恢复折叠状态
            // 策略：先根据 displayLevel 初始化所有节点的折叠状态，再恢复用户手动操作的状态
            const displayLevel = this.state.expandLevel ?? 6;
            // 根据是否开启用户提问动态调整最小有效层级
            const minDisplayLevel = this.state.includeUserQueries ? 0 : 1;
            const effectiveDisplayLevel = displayLevel < minDisplayLevel ? minDisplayLevel : displayLevel;

            // 1. 先按默认规则初始化所有节点（包括新节点）
            this.initializeCollapsedState(tree, effectiveDisplayLevel);

            // 2. 再恢复用户之前的手动操作（只影响旧节点，新节点保持初始化状态）
            if (Object.keys(currentStateMap).length > 0) {
                this.restoreTreeState(tree, currentStateMap);
            }

            // 如果在搜索模式，需要重新应用搜索标记
            if (this.state.searchQuery) {
                this.performSearch(this.state.searchQuery, false); // false = 不触发额外刷新
            }

            // 渲染
            this.refreshCurrent();
        }

        // 处理搜索输入
        handleSearch(query) {
            if (!query) {
                // === 结束搜索 ===
                // 1. 清理搜索状态
                this.state.searchQuery = '';
                this.state.searchResults = null;
                this.state.searchLevelManual = false;

                // 2. 隐藏结果条
                const resultBar = document.getElementById('outline-result-bar');
                if (resultBar) resultBar.classList.add('hidden');

                // 3. 恢复折叠状态
                if (this.state.tree) {
                    // 3.1 先重置为全局设定的层级状态（兜底）
                    const displayLevel = this.state.expandLevel ?? 6;
                    this.clearForceExpandedState(this.state.tree, displayLevel);

                    // 3.2 如果有搜索前的状态快照，则恢复它（覆盖默认状态）
                    if (this.state.preSearchState) {
                        this.restoreTreeState(this.state.tree, this.state.preSearchState);
                        this.state.preSearchState = null; // 恢复后清除快照
                    }
                }

                this.refreshCurrent();
                return;
            }

            // === 开始或更新搜索 ===

            // 如果是从无搜索状态进入搜索状态，保存当前快照
            if (!this.state.searchQuery && this.state.tree) {
                this.state.preSearchState = {};
                this.captureTreeState(this.state.tree, this.state.preSearchState);

                // Fix Issue 2: 搜索前重置所有状态（折叠所有 + 清除手动展开标记）
                // 这样搜索结果就只展示匹配的路径，不会受之前手动展开的干扰
                this.clearForceExpandedState(this.state.tree, 0);
            }

            this.state.searchQuery = query;
            this.state.searchLevelManual = false; // 重置手动层级标记
            this.performSearch(query);
            this.refreshCurrent();
        }

        // 执行搜索计算
        performSearch(query, updateUI = true) {
            if (!this.state.tree) return;

            const normalize = (str) => str.toLowerCase();
            const normalizedQuery = normalize(query);
            let matchCount = 0;

            // 递归标记树
            // 返回值: { isMatch: boolean, hasMatchedDescendant: boolean }
            const traverse = (nodes) => {
                let hasAnyMatch = false;
                nodes.forEach((node) => {
                    const isMatch = normalize(node.text).includes(normalizedQuery);
                    if (isMatch) matchCount++;

                    node.isMatch = isMatch;

                    if (node.children && node.children.length > 0) {
                        const childResult = traverse(node.children);
                        node.hasMatchedDescendant = childResult;
                    } else {
                        node.hasMatchedDescendant = false;
                    }

                    // 如果有匹配子项，自动展开
                    if (node.hasMatchedDescendant) {
                        node.collapsed = false;
                        // node.forceExpanded = true; // 可选：是否强制标记为展开? 暂时不需要，只要 collapsed=false 即可
                    }

                    if (isMatch || node.hasMatchedDescendant) {
                        hasAnyMatch = true;
                    }
                });
                return hasAnyMatch;
            };

            traverse(this.state.tree);

            // 更新结果条
            if (updateUI) {
                const resultBar = document.getElementById('outline-result-bar');
                if (resultBar) {
                    resultBar.textContent = `${matchCount} ${this.t('outlineSearchResult')}`;
                    resultBar.classList.remove('hidden');
                }
            }
        }

        // 获取用户问题节点在所有用户问题中的序号（从1开始）
        getUserQueryIndex(targetIndex) {
            if (!this.state.tree) return 0;
            let count = 0;
            const countInTree = (items) => {
                for (const item of items) {
                    if (item.isUserQuery) {
                        count++;
                        if (item.index === targetIndex) return count;
                    }
                    if (item.children && item.children.length > 0) {
                        const result = countInTree(item.children);
                        if (result > 0) return result;
                    }
                }
                return 0;
            };
            return countInTree(this.state.tree);
        }

        // 内部刷新（用于交互更新）
        refreshCurrent() {
            const listContainer = document.getElementById('outline-list');
            if (this.state.tree && listContainer) {
                clearElement(listContainer);

                // 确定当前的显示层级上限
                // 如果在搜索模式且未手动调整，显示所有层级 (Infinity)
                // 否则使用设定的 expandLevel
                let displayLevel;
                if (this.state.searchQuery && !this.state.searchLevelManual) {
                    displayLevel = 100; // 足够大以显示所有
                } else {
                    displayLevel = this.state.expandLevel ?? 6;
                }

                // 根据是否开启用户提问动态调整最小有效层级
                // - 开启用户提问时：displayLevel = 0 有意义（只显示用户提问）
                // - 未开启用户提问时：displayLevel 最小为 1（因为 AI 标题最低为 H1）
                const minDisplayLevel = this.state.includeUserQueries ? 0 : 1;
                if (displayLevel < minDisplayLevel) {
                    displayLevel = minDisplayLevel;
                }

                this.renderItems(listContainer, this.state.tree, this.state.minLevel, displayLevel);
            }
        }

        // 构建树形结构
        buildTree(outline, minLevel) {
            const tree = [];
            const stack = [];

            outline.forEach((item, index) => {
                // 用户提问节点固定 relativeLevel = 0
                // AI 标题节点使用 level - minLevel + 1（实现层级提升）
                const relativeLevel = item.isUserQuery ? 0 : item.level - minLevel + 1;
                const node = {
                    ...item,
                    relativeLevel,
                    index,
                    children: [],
                    collapsed: false,
                };

                // 找到父节点
                while (stack.length > 0 && stack[stack.length - 1].relativeLevel >= relativeLevel) {
                    stack.pop();
                }

                if (stack.length === 0) {
                    tree.push(node);
                } else {
                    stack[stack.length - 1].children.push(node);
                }

                stack.push(node);
            });

            return tree;
        }

        // 渲染大纲项
        // 注意：使用 relativeLevel 判断层级，与视觉层级保持一致
        // - 用户提问节点 relativeLevel = 0
        // - AI 标题节点 relativeLevel = 1, 2, 3...（已经过智能提升）
        renderItems(container, items, minLevel, displayLevel, parentCollapsed = false, parentForceExpanded = false) {
            // 根据是否开启用户提问，确定根节点的 relativeLevel
            // - 开启用户提问：根节点是用户提问节点，relativeLevel = 0
            // - 不开启用户提问：根节点是最高级 AI 标题，relativeLevel = 1
            const minRelativeLevel = this.state.includeUserQueries ? 0 : 1;

            items.forEach((item) => {
                const hasChildren = item.children && item.children.length > 0;
                // 使用 relativeLevel 判断是否为根节点（用户提问或顶层标题）
                const isRootNode = item.relativeLevel === minRelativeLevel;

                let shouldShow;

                // 计算可见性：使用 relativeLevel 与 displayLevel 比较
                const isLevelAllowed = item.relativeLevel <= displayLevel || parentForceExpanded;

                if (isRootNode) {
                    // 顶层节点逻辑
                    if (this.state.searchQuery) {
                        // Fix: 搜索模式下严控顶层显示，无论是否有手动层级操作
                        // 确保 Expand All 不会将不相关的顶层节点展示出来
                        shouldShow = item.isMatch || item.hasMatchedDescendant;
                    } else {
                        // 普通模式：只需存在即可
                        shouldShow = true;
                    }
                } else {
                    // 非顶层节点
                    const isRelevant = !this.state.searchQuery || item.isMatch || item.hasMatchedDescendant || parentForceExpanded;
                    // 注意：parentForceExpanded 意味着父级被手动点开了，此时应该显示子级（即使不匹配）

                    // 综合判断
                    if (this.state.searchQuery && !this.state.searchLevelManual) {
                        // 纯搜索模式：相关即显示，忽略层级
                        // 但如果 parentForceExpanded，也显示
                        shouldShow = isRelevant && !parentCollapsed;
                    } else if (this.state.searchQuery && this.state.searchLevelManual) {
                        // 搜索且有层级限制
                        // 必须相关 AND 层级允许
                        shouldShow = isRelevant && isLevelAllowed && !parentCollapsed;
                    } else {
                        // 普通模式
                        shouldShow = isLevelAllowed && !parentCollapsed;
                    }
                }

                // 如果父级折叠了，那肯定看不到
                if (parentCollapsed) shouldShow = false;

                // 构建 CSS 类名
                // 用户提问节点用 relativeLevel (0)
                // 标题节点统一用 relativeLevel，这样层级会自动提升（如 H2 变成 level 1）
                let cssLevel = item.relativeLevel;

                let itemClassName = `outline-item outline-level-${cssLevel}`;
                if (item.isUserQuery) {
                    itemClassName += ' user-query-node';
                }

                const itemEl = createElement('div', {
                    className: itemClassName,
                    'data-index': item.index,
                    'data-level': item.relativeLevel,
                });

                const isExpanded = hasChildren && !item.collapsed;
                const toggle = createElement(
                    'span',
                    {
                        className: `outline-item-toggle ${hasChildren ? (isExpanded ? 'expanded' : '') : 'invisible'}`,
                    },
                    '▸',
                );

                if (hasChildren) {
                    toggle.addEventListener('click', (e) => {
                        e.stopPropagation();
                        item.collapsed = !item.collapsed;
                        if (!item.collapsed) {
                            item.forceExpanded = true;
                        }
                        toggle.classList.toggle('expanded', !item.collapsed);
                        this.refreshCurrent();
                    });
                }
                itemEl.appendChild(toggle);

                // 用户提问节点添加序号徽章（图标+角标数字）
                if (item.isUserQuery) {
                    const queryNumber = this.getUserQueryIndex(item.index);
                    const badge = createElement('span', { className: 'user-query-badge' });
                    const icon = createElement('span', { className: 'user-query-badge-icon' }, '💬');
                    const number = createElement('span', { className: 'user-query-badge-number' }, `${queryNumber}`);
                    badge.appendChild(icon);
                    badge.appendChild(number);
                    itemEl.appendChild(badge);
                }

                const textEl = createElement('span', { className: 'outline-item-text' });

                // 高亮处理
                if (this.state.searchQuery && item.isMatch) {
                    try {
                        const query = this.state.searchQuery;
                        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(`(${escapedQuery})`, 'gi');
                        const parts = item.text.split(regex);

                        clearElement(textEl);
                        parts.forEach((part) => {
                            if (part.toLowerCase() === query.toLowerCase()) {
                                const mark = document.createElement('mark');
                                mark.textContent = part;
                                mark.style.backgroundColor = 'rgba(255, 235, 59, 0.5)';
                                mark.style.color = 'inherit';
                                mark.style.padding = '0';
                                mark.style.borderRadius = '2px';
                                textEl.appendChild(mark);
                            } else {
                                textEl.appendChild(document.createTextNode(part));
                            }
                        });
                    } catch (e) {
                        textEl.textContent = item.text;
                        textEl.title = item.text; // Add tooltip
                    }
                } else {
                    textEl.textContent = item.text;
                    textEl.title = item.text; // Add tooltip
                }
                itemEl.appendChild(textEl);

                // 用户提问添加复制按钮
                if (item.isUserQuery) {
                    const copyBtn = createElement('span', { className: 'outline-item-copy-btn' });
                    copyBtn.title = 'Copy';

                    // 使用 DOM API 创建 SVG（避免 innerHTML 的 CSP 问题）
                    const createCopyIcon = () => {
                        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        svg.setAttribute('viewBox', '0 0 24 24');
                        svg.setAttribute('fill', 'none');
                        svg.setAttribute('stroke', 'currentColor');
                        svg.setAttribute('stroke-width', '2');
                        svg.setAttribute('stroke-linecap', 'round');
                        svg.setAttribute('stroke-linejoin', 'round');

                        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        rect.setAttribute('x', '9');
                        rect.setAttribute('y', '9');
                        rect.setAttribute('width', '13');
                        rect.setAttribute('height', '13');
                        rect.setAttribute('rx', '2');
                        rect.setAttribute('ry', '2');

                        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                        path.setAttribute('d', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1');

                        svg.appendChild(rect);
                        svg.appendChild(path);
                        return svg;
                    };

                    const createCheckIcon = () => {
                        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        svg.setAttribute('viewBox', '0 0 24 24');
                        svg.setAttribute('fill', 'none');
                        svg.setAttribute('stroke', '#10b981');
                        svg.setAttribute('stroke-width', '2');
                        svg.setAttribute('stroke-linecap', 'round');
                        svg.setAttribute('stroke-linejoin', 'round');

                        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                        polyline.setAttribute('points', '20 6 9 17 4 12');

                        svg.appendChild(polyline);
                        return svg;
                    };

                    copyBtn.appendChild(createCopyIcon());

                    copyBtn.addEventListener('click', async (e) => {
                        e.stopPropagation(); // 阻止跳转
                        try {
                            // 智能获取文本：短文本直接用缓存，长文本（被截断）从 DOM 重新提取
                            let textToCopy = item.text;
                            if (item.isTruncated && item.element && item.element.isConnected) {
                                // 文本被截断，从 DOM 提取完整文本
                                textToCopy = this.siteAdapter.extractUserQueryText(item.element) || item.text;
                            }
                            await navigator.clipboard.writeText(textToCopy);
                            // 临时变成对号反馈
                            copyBtn.replaceChildren(createCheckIcon());
                            setTimeout(() => {
                                copyBtn.replaceChildren(createCopyIcon());
                            }, 1500);
                        } catch (err) {
                            console.error('Failed to copy: ', err);
                        }
                    });
                    itemEl.appendChild(copyBtn);
                }

                itemEl.addEventListener('click', () => {
                    let targetElement = item.element;

                    // 1. 检查元素是否有效
                    if (!targetElement || !targetElement.isConnected) {
                        // 尝试重新查找
                        // 简单的重新查找策略：在文档中根据文本内容找一个最相似的 H? 标签
                        // 这是一个兜底，Gemini 动态渲染可能会导致元素重建
                        const headings = document.querySelectorAll(`h${item.level}`);
                        for (const h of headings) {
                            if (h.textContent.trim() === item.text) {
                                targetElement = h;
                                break;
                            }
                        }
                    }

                    if (targetElement && targetElement.isConnected) {
                        // 跳转前回调（用于保存当前位置为锚点）
                        if (this.onJumpBefore) {
                            this.onJumpBefore();
                        }
                        // 传入 __bypassLock: true 以绕过 ScrollLockManager 的拦截
                        // 恢复 behavior: 'smooth'，因为我们已经处理了元素重新查找，应该可以兼容
                        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start', __bypassLock: true });
                        targetElement.classList.add('outline-highlight');
                        setTimeout(() => targetElement.classList.remove('outline-highlight'), 2000);
                    } else {
                        console.warn('Gemini Helper: Outline item element lost and not found:', item.text);
                    }
                });

                if (!shouldShow) {
                    itemEl.classList.add('outline-hidden');
                }

                container.appendChild(itemEl);

                if (hasChildren) {
                    const childParentCollapsed = item.collapsed || parentCollapsed;
                    this.renderItems(container, item.children, minLevel, displayLevel, childParentCollapsed, item.forceExpanded || parentForceExpanded);
                }
            });
        }

        // 初始化树的折叠状态
        // 使用 relativeLevel 判断，与视觉层级保持一致
        initializeCollapsedState(items, displayLevel) {
            items.forEach((item) => {
                if (item.children && item.children.length > 0) {
                    // 使用 relativeLevel 判断所有子节点是否都超过显示层级
                    const allChildrenHidden = item.children.every((child) => child.relativeLevel > displayLevel);
                    item.collapsed = allChildrenHidden;
                    this.initializeCollapsedState(item.children, displayLevel);
                } else {
                    item.collapsed = false;
                }
            });
        }

        // 滚动列表
        scrollList() {
            const wrapper = document.getElementById('outline-list-wrapper');
            const btn = document.getElementById('outline-scroll-btn');
            if (!wrapper || !btn) return;

            const isAtBottom = wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 10;
            if (isAtBottom) {
                wrapper.scrollTo({ top: 0, behavior: 'smooth' });
                btn.textContent = '⬇';
                btn.title = this.t('outlineScrollBottom');
            } else {
                wrapper.scrollTo({ top: wrapper.scrollHeight, behavior: 'smooth' });
                btn.textContent = '⬆';
                btn.title = this.t('outlineScrollTop');
            }
        }

        // 定位到当前页面位置对应的大纲项
        locateCurrentPosition() {
            if (!this.state.tree || this.state.tree.length === 0) return;
            if (!this.siteAdapter) return;

            // 0. 如果在搜索模式，先清除搜索（确保目标项能显示）
            if (this.state.searchQuery) {
                this.handleSearch('');
                // 清除搜索框内容
                const searchInput = document.querySelector('.outline-search-input');
                const clearBtn = document.querySelector('.outline-search-clear');
                if (searchInput) searchInput.value = '';
                if (clearBtn) clearBtn.classList.add('hidden');
            }

            // 1. 获取页面滚动容器
            const scrollContainer = this.siteAdapter.getScrollContainer();
            if (!scrollContainer) return;

            // 2. 收集所有大纲项的 element（展平树结构）
            const flattenTree = (items) => {
                const result = [];
                items.forEach((item) => {
                    result.push(item);
                    if (item.children && item.children.length > 0) {
                        result.push(...flattenTree(item.children));
                    }
                });
                return result;
            };
            const allItems = flattenTree(this.state.tree);

            // 3. 找到当前可视区域中的第一个大纲元素
            const containerRect = scrollContainer.getBoundingClientRect();
            const viewportTop = containerRect.top;
            const viewportBottom = containerRect.bottom;

            let currentItem = null;
            for (const item of allItems) {
                if (!item.element || !item.element.isConnected) continue;

                const rect = item.element.getBoundingClientRect();
                // 判断元素是否在可视区域内（上边缘在视口内或元素跨越视口顶部）
                if (rect.top >= viewportTop && rect.top < viewportBottom) {
                    currentItem = item;
                    break;
                }
                // 如果元素跨越视口顶部（元素底部在视口内，顶部在视口上方）
                if (rect.top < viewportTop && rect.bottom > viewportTop) {
                    currentItem = item;
                    break;
                }
            }

            if (!currentItem) {
                // 如果没找到，尝试找最接近视口顶部的元素
                let minDistance = Infinity;
                for (const item of allItems) {
                    if (!item.element || !item.element.isConnected) continue;
                    const rect = item.element.getBoundingClientRect();
                    const distance = Math.abs(rect.top - viewportTop);
                    if (distance < minDistance) {
                        minDistance = distance;
                        currentItem = item;
                    }
                }
            }

            if (!currentItem) return;

            // 4. 展开目标项的所有父级节点（确保目标可见）
            const expandParents = (items, targetIndex, parents = []) => {
                for (const item of items) {
                    if (item.index === targetIndex) {
                        // 找到目标，展开所有父级
                        parents.forEach((p) => {
                            p.collapsed = false;
                            p.forceExpanded = true;
                        });
                        return true;
                    }
                    if (item.children && item.children.length > 0) {
                        if (expandParents(item.children, targetIndex, [...parents, item])) {
                            return true;
                        }
                    }
                }
                return false;
            };
            expandParents(this.state.tree, currentItem.index);

            // 5. 刷新显示（展开父级后需要重新渲染）
            this.refreshCurrent();

            // 6. 延迟执行滚动和高亮（等待 DOM 更新）
            setTimeout(() => {
                const outlineList = document.getElementById('outline-list');
                if (!outlineList) return;

                // 通过 data-index 找到对应的大纲项
                const outlineItem = outlineList.querySelector(`.outline-item[data-index="${currentItem.index}"]`);
                if (!outlineItem) return;

                // 滚动大纲面板到该项
                const wrapper = document.getElementById('outline-list-wrapper');
                if (wrapper) {
                    const wrapperRect = wrapper.getBoundingClientRect();
                    const itemRect = outlineItem.getBoundingClientRect();

                    // 计算需要滚动的距离，使目标元素居中
                    const scrollOffset = itemRect.top - wrapperRect.top - wrapperRect.height / 2 + itemRect.height / 2;
                    wrapper.scrollBy({ top: scrollOffset, behavior: 'smooth' });
                }

                // 高亮该大纲项
                outlineItem.classList.add('highlight');
                setTimeout(() => outlineItem.classList.remove('highlight'), 2000);
            }, 50);
        }

        // 展开/折叠全部
        toggleExpandAll() {
            const btn = document.getElementById('outline-expand-btn');
            if (!btn) return;

            if (this.state.isAllExpanded) {
                // 如果开启了"只显示用户提问"，收起时应折叠到 Level 0 (只显示提问)
                // 否则折叠到最小标题层级 (通常是 1)
                const targetLevel = this.settings.outline?.showUserQueries ? 0 : this.state.minLevel || 1;
                this.setLevel(targetLevel);
            } else {
                const maxActualLevel = Math.max(...Object.keys(this.state.levelCounts).map(Number), 1);
                this.setLevel(maxActualLevel);
            }
        }

        // 切换用户提问分组模式
        toggleGroupMode() {
            const btn = document.getElementById('outline-group-btn');
            if (!this.settings.outline) return;

            // 切换设置
            this.settings.outline.showUserQueries = !this.settings.outline.showUserQueries;
            // 同步到 state（用于 minDisplayLevel 计算）
            this.state.includeUserQueries = this.settings.outline.showUserQueries;

            // 更新按钮状态
            if (btn) {
                btn.classList.toggle('active', this.settings.outline.showUserQueries);
            }

            // 保存设置
            if (this.onSettingsChange) this.onSettingsChange();

            // 触发大纲刷新
            window.dispatchEvent(new CustomEvent('gemini-helper-outline-auto-refresh'));
        }

        // 设置层级
        setLevel(level) {
            this.state.expandLevel = level;
            // 更新外部设置
            if (this.settings.outline) {
                this.settings.outline.maxLevel = level;
                if (this.onSettingsChange) this.onSettingsChange();
            }

            // 清除强制展开状态
            if (this.state.tree) {
                this.clearForceExpandedState(this.state.tree, level);
            }

            // 更新 UI
            const dots = document.querySelectorAll('.outline-level-dot');
            dots.forEach((dot) => {
                const dotLevel = parseInt(dot.dataset.level, 10);
                dot.classList.toggle('active', dotLevel <= level);
            });

            const progress = document.getElementById('outline-level-progress');
            if (progress) {
                progress.style.width = `${(level / 6) * 100}%`;
            }

            // 如果在搜索状态下调整了 Slider，标记为手动
            if (this.state.searchQuery) {
                this.state.searchLevelManual = true;
                this.refreshCurrent();
            } else {
                // 非搜索状态，这里可能不需要 refreshCurrent，因为 updateTooltips 或其他地方可能触发？
                // 原有逻辑似乎没有显式调用 refreshCurrent，可能是 toggleExpnadAll 调用的？
                // 不，setLevel 是被点击调用的。所以必须刷新。
                this.refreshCurrent();
            }

            const btn = document.getElementById('outline-expand-btn');
            const maxActualLevel = Math.max(...Object.keys(this.state.levelCounts).map(Number), 1);
            if (btn) {
                if (level >= maxActualLevel) {
                    btn.replaceChildren(this._createCollapseIcon ? this._createCollapseIcon() : document.createTextNode('⊖'));
                    btn.title = this.t('outlineCollapseAll');
                    this.state.isAllExpanded = true;
                } else {
                    btn.replaceChildren(this._createExpandIcon ? this._createExpandIcon() : document.createTextNode('⊕'));
                    btn.title = this.t('outlineExpandAll');
                    this.state.isAllExpanded = false;
                }
            }

            this.refreshCurrent();
        }

        // 清除强制展开状态
        clearForceExpandedState(items, displayLevel) {
            items.forEach((item) => {
                item.forceExpanded = false;
                if (item.children && item.children.length > 0) {
                    const allChildrenHidden = item.children.every((child) => child.level > displayLevel);
                    item.collapsed = allChildrenHidden;
                    this.clearForceExpandedState(item.children, displayLevel);
                } else {
                    item.collapsed = false;
                }
            });
        }

        // 更新提示
        updateTooltips() {
            const dots = document.querySelectorAll('.outline-level-dot');
            const showUserQueries = this.settings.outline?.showUserQueries || false;

            dots.forEach((dot) => {
                const level = parseInt(dot.dataset.level, 10);
                const tooltip = dot.querySelector('.outline-level-dot-tooltip');
                if (!tooltip) return;

                if (level === 0) {
                    // Level 0: 分组模式下显示"只显示用户提问"，否则显示折叠符号
                    tooltip.textContent = showUserQueries ? this.t('outlineOnlyUserQueries') : '⊖';
                } else {
                    const count = this.state.levelCounts[level] || 0;
                    tooltip.textContent = `H${level}: ${count}`;
                }
            });
        }

        // 捕获树的状态（expanded/collapsed）
        captureTreeState(nodes, stateMap) {
            nodes.forEach((node) => {
                // 使用 level + text 作为 key
                // 注意：如果有完全相同的标题在同一级，可能会冲突，但在当前场景下可以接受
                const key = `${node.level}_${node.text}`;
                const hasChildren = node.children && node.children.length > 0;
                stateMap[key] = {
                    collapsed: node.collapsed,
                    forceExpanded: node.forceExpanded,
                    hadChildren: hasChildren, // 记录当时是否有子节点，用于判断结构变化
                };

                if (hasChildren) {
                    this.captureTreeState(node.children, stateMap);
                }
            });
        }

        // 恢复树的状态
        // 策略：只有当节点结构未发生「无子节点→有子节点」变化时才恢复折叠状态
        // 这是为了避免：用户提问刚发出时无子节点(collapsed=false)，AI回复后有子节点
        // 此时应该尊重 initializeCollapsedState 基于 displayLevel 计算的新值
        restoreTreeState(nodes, stateMap) {
            nodes.forEach((node) => {
                const key = `${node.level}_${node.text}`;
                const state = stateMap[key];
                if (state) {
                    const hasChildrenNow = node.children && node.children.length > 0;
                    const hadChildrenBefore = state.hadChildren;

                    // 只有当「之前有子节点 或 现在没有子节点」时才恢复 collapsed 状态
                    // 即：如果从「无子节点」变为「有子节点」，不恢复（保持 initializeCollapsedState 的结果）
                    if (hadChildrenBefore || !hasChildrenNow) {
                        node.collapsed = state.collapsed;
                    }

                    // forceExpanded 可以无条件恢复（这是用户手动操作的标记）
                    if (state.forceExpanded !== undefined) {
                        node.forceExpanded = state.forceExpanded;
                    }
                }

                if (node.children && node.children.length > 0) {
                    this.restoreTreeState(node.children, stateMap);
                }
            });
        }
    }

    /**
     * 设置管理器
     * 负责所有设置的加载、保存和默认值合并
     */
    class SettingsManager {
        /**
         * 兼容性处理：确保 collapsedButtonsOrder 包含所有默认按钮
         * 新增的按钮会自动插入到 scrollBottom 之前
         * @param {Array} savedOrder 保存的按钮顺序
         * @returns {Array} 处理后的按钮顺序
         */
        _migrateCollapsedButtonsOrder(savedOrder) {
            if (!savedOrder || savedOrder.length === 0) {
                return DEFAULT_COLLAPSED_BUTTONS_ORDER;
            }

            const savedIds = savedOrder.map((b) => b.id);
            const defaultIds = DEFAULT_COLLAPSED_BUTTONS_ORDER.map((b) => b.id);

            // 找出缺失的按钮
            const missingIds = defaultIds.filter((id) => !savedIds.includes(id));

            if (missingIds.length === 0) {
                return savedOrder;
            }

            // 复制一份，避免修改原数组
            let result = [...savedOrder];

            // 在 scrollBottom 之前插入缺失的按钮
            const scrollBottomIndex = result.findIndex((b) => b.id === 'scrollBottom');
            const insertIndex = scrollBottomIndex !== -1 ? scrollBottomIndex : result.length;

            missingIds.forEach((id) => {
                const defaultConfig = DEFAULT_COLLAPSED_BUTTONS_ORDER.find((b) => b.id === id);
                if (defaultConfig) {
                    result.splice(insertIndex, 0, { ...defaultConfig });
                }
            });

            // 保存更新后的配置
            GM_setValue(SETTING_KEYS.COLLAPSED_BUTTONS_ORDER, result);

            return result;
        }

        /**
         * 加载设置
         * @param {SiteRegistry} registry 站点注册表
         * @param {SiteAdapter} currentAdapter 当前适配器
         * @returns {Object} 完整的设置对象
         */
        load(registry, currentAdapter) {
            const widthSettings = GM_getValue(SETTING_KEYS.PAGE_WIDTH, DEFAULT_WIDTH_SETTINGS);
            const outlineSettings = GM_getValue(SETTING_KEYS.OUTLINE, DEFAULT_OUTLINE_SETTINGS);
            const promptsSettings = GM_getValue(SETTING_KEYS.PROMPTS_SETTINGS, DEFAULT_PROMPTS_SETTINGS);
            let tabOrder = GM_getValue(SETTING_KEYS.TAB_ORDER, DEFAULT_TAB_ORDER);

            // 兼容老用户：确保所有默认 Tab 都在 tabOrder 中
            // 如果有新增的 Tab（如 conversations），自动添加到 settings 之前
            const missingTabs = DEFAULT_TAB_ORDER.filter((tab) => !tabOrder.includes(tab));
            if (missingTabs.length > 0) {
                const settingsIndex = tabOrder.indexOf('settings');
                if (settingsIndex !== -1) {
                    // 在 settings 之前插入缺失的 Tab
                    tabOrder = [...tabOrder.slice(0, settingsIndex), ...missingTabs, ...tabOrder.slice(settingsIndex)];
                } else {
                    // 如果没有 settings，直接追加
                    tabOrder = [...tabOrder, ...missingTabs];
                }
                // 保存更新后的 tabOrder
                GM_setValue(SETTING_KEYS.TAB_ORDER, tabOrder);
            }

            // 加载模型锁定设置（按站点隔离，但一次性加载所有站点的配置）
            const savedModelLockSettings = GM_getValue(SETTING_KEYS.MODEL_LOCK, {});
            const mergedModelLockConfig = {};

            // 兼容旧的单一适配器模式（防御性代码）
            const currentSiteId = currentAdapter ? currentAdapter.getSiteId() : 'unknown';

            // 遍历所有注册的适配器，合并默认配置和保存的配置
            if (registry && registry.adapters) {
                registry.adapters.forEach((adapter) => {
                    const siteId = adapter.getSiteId();
                    const defaults = adapter.getDefaultLockSettings();
                    mergedModelLockConfig[siteId] = { ...defaults, ...(savedModelLockSettings[siteId] || {}) };
                });
            } else if (currentAdapter) {
                const defaults = currentAdapter.getDefaultLockSettings();
                mergedModelLockConfig[currentSiteId] = { ...defaults, ...(savedModelLockSettings[currentSiteId] || {}) };
            }

            // 确保大纲设置有默认值 (合并默认配置与保存的配置)
            const mergedOutlineSettings = { ...DEFAULT_OUTLINE_SETTINGS, ...outlineSettings };

            return {
                clearTextareaOnSend: GM_getValue(SETTING_KEYS.CLEAR_TEXTAREA_ON_SEND, false), // 默认关闭
                modelLockConfig: mergedModelLockConfig,
                pageWidth: widthSettings[currentSiteId] || DEFAULT_WIDTH_SETTINGS[currentSiteId],
                outline: mergedOutlineSettings,
                prompts: promptsSettings,
                tabOrder: tabOrder,
                preventAutoScroll: GM_getValue('gemini_prevent_auto_scroll', false),
                collapsedButtonsOrder: this._migrateCollapsedButtonsOrder(GM_getValue(SETTING_KEYS.COLLAPSED_BUTTONS_ORDER, DEFAULT_COLLAPSED_BUTTONS_ORDER)),
                tabSettings: { ...DEFAULT_TAB_SETTINGS, ...GM_getValue(SETTING_KEYS.TAB_SETTINGS, {}) },
                readingHistory: { ...DEFAULT_READING_HISTORY_SETTINGS, ...GM_getValue(SETTING_KEYS.READING_HISTORY, {}) },
                conversations: {
                    enabled: true,
                    syncUnpin: false,
                    ...GM_getValue(SETTING_KEYS.CONVERSATIONS_SETTINGS, {}),
                },
                // 默认面板状态
                defaultPanelState: GM_getValue(SETTING_KEYS.DEFAULT_PANEL_STATE, true),
                // 自动隐藏面板
                autoHidePanel: GM_getValue(SETTING_KEYS.AUTO_HIDE_PANEL, false),
                // 主题模式 (null=跟随系统/默认, 'light', 'dark')
                themeMode: GM_getValue(`gemini_theme_mode_${currentAdapter ? currentAdapter.getSiteId() : 'default'}`, null),
                // 边缘吸附隐藏功能
                edgeSnapHide: GM_getValue('gemini_edge_snap_hide', false),
                // 水印移除功能
                watermarkRemoval: GM_getValue('gemini_watermark_removal', false),
            };
        }

        /**
         * 保存设置
         * @param {Object} settings 当前设置对象
         * @param {SiteAdapter} currentAdapter 当前适配器
         */
        save(settings, currentAdapter) {
            GM_setValue(SETTING_KEYS.CLEAR_TEXTAREA_ON_SEND, settings.clearTextareaOnSend);

            // 保存模型锁定设置（保存整个字典）
            GM_setValue(SETTING_KEYS.MODEL_LOCK, settings.modelLockConfig);

            // 保存标签页设置
            GM_setValue(SETTING_KEYS.TAB_SETTINGS, settings.tabSettings);

            // 保存页面宽度设置
            const allWidthSettings = GM_getValue(SETTING_KEYS.PAGE_WIDTH, DEFAULT_WIDTH_SETTINGS);
            if (currentAdapter) {
                allWidthSettings[currentAdapter.getSiteId()] = settings.pageWidth;
            }
            GM_setValue(SETTING_KEYS.PAGE_WIDTH, allWidthSettings);
            // 保存大纲设置
            GM_setValue(SETTING_KEYS.OUTLINE, settings.outline);
            // 保存提示词设置
            GM_setValue(SETTING_KEYS.PROMPTS_SETTINGS, settings.prompts);
            // 保存 Tab 顺序
            GM_setValue(SETTING_KEYS.TAB_ORDER, settings.tabOrder);
            // 保存防滚动设置
            GM_setValue('gemini_prevent_auto_scroll', settings.preventAutoScroll);
            // 保存阅读历史设置
            GM_setValue(SETTING_KEYS.READING_HISTORY, settings.readingHistory);
            // 保存会话设置
            if (settings.conversations) {
                GM_setValue(SETTING_KEYS.CONVERSATIONS_SETTINGS, settings.conversations);
            }
            GM_setValue('gemini_default_panel_state', settings.defaultPanelState);
            GM_setValue('gemini_default_auto_hide', settings.autoHidePanel);
            // 保存主题模式 (使用站点特有的 Key)
            if (currentAdapter) {
                GM_setValue(`gemini_theme_mode_${currentAdapter.getSiteId()}`, settings.themeMode);
            } else {
                GM_setValue('gemini_theme_mode_default', settings.themeMode);
            }
            // 保存折叠面板按钮顺序
            GM_setValue(SETTING_KEYS.COLLAPSED_BUTTONS_ORDER, settings.collapsedButtonsOrder);
            // 保存边缘吸附隐藏设置
            GM_setValue('gemini_edge_snap_hide', settings.edgeSnapHide);
            // 保存水印移除设置
            GM_setValue('gemini_watermark_removal', settings.watermarkRemoval);
        }
    }

    /**
     * 复制管理器
     * 负责公式双击复制、表格 Markdown 复制等功能
     */
    class CopyManager {
        #settings;
        #formulaCopyInitialized = false;
        #tableCopyInitialized = false;
        #formulaDblClickHandler = null;
        #stopTableWatch = null; // DOMToolkit.each 返回的停止函数
        #injectTableButton = null;

        constructor(settings) {
            this.#settings = settings;
        }

        // ==================== Formula Copy ====================

        /**
         * 初始化公式双击复制功能
         * 禁用公式文字选择，双击复制 LaTeX 源码
         */
        initFormulaCopy() {
            if (this.#formulaCopyInitialized) return;
            this.#formulaCopyInitialized = true;

            // 注入 CSS
            const styleId = 'gh-formula-copy-style';
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = `
                    .math-block, .math-inline {
                        user-select: none !important;
                        cursor: pointer !important;
                    }
                    .math-block:hover, .math-inline:hover {
                        outline: 2px solid var(--gh-primary, #4285f4);
                        outline-offset: 2px;
                        border-radius: 4px;
                    }
                `;
                document.head.appendChild(style);
            }

            // 双击事件委托处理
            this.#formulaDblClickHandler = (e) => {
                const mathEl = e.target.closest('.math-block, .math-inline');
                if (!mathEl) return;

                const latex = mathEl.getAttribute('data-math');
                if (!latex) {
                    console.warn('[FormulaCopy] No data-math attribute found');
                    return;
                }

                let copyText = latex;
                if (this.#settings.formulaDelimiterEnabled) {
                    const isBlock = mathEl.classList.contains('math-block');
                    copyText = isBlock ? `$$${latex}$$` : `$${latex}$`;
                }

                navigator.clipboard
                    .writeText(copyText)
                    .then(() => showToast(t('formulaCopied') || '公式已复制'))
                    .catch((err) => {
                        console.error('[FormulaCopy] Copy failed:', err);
                        showToast('复制失败');
                    });

                e.preventDefault();
                e.stopPropagation();
            };

            document.addEventListener('dblclick', this.#formulaDblClickHandler, true);
        }

        /**
         * 销毁公式双击复制功能
         */
        destroyFormulaCopy() {
            this.#formulaCopyInitialized = false;

            const style = document.getElementById('gh-formula-copy-style');
            if (style) style.remove();

            if (this.#formulaDblClickHandler) {
                document.removeEventListener('dblclick', this.#formulaDblClickHandler, true);
                this.#formulaDblClickHandler = null;
            }
        }

        // ==================== Table Copy ====================

        /**
         * 初始化表格 Markdown 复制功能
         */
        initTableCopy() {
            if (this.#tableCopyInitialized) return;
            this.#tableCopyInitialized = true;

            // 注入 CSS
            const styleId = 'gh-table-copy-style';
            if (!document.getElementById(styleId)) {
                const style = document.createElement('style');
                style.id = styleId;
                style.textContent = `
                    .gh-table-copy-btn {
                        position: absolute;
                        top: 4px;
                        right: 4px;
                        width: 28px;
                        height: 28px;
                        border: none;
                        border-radius: 6px;
                        background: var(--gh-bg-secondary, rgba(255,255,255,0.9));
                        color: var(--gh-text, #374151);
                        cursor: pointer;
                        font-size: 14px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        opacity: 0.7;
                        transition: opacity 0.2s, background 0.2s;
                        z-index: 10;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    }
                    .gh-table-container:hover .gh-table-copy-btn,
                    table-block:hover .gh-table-copy-btn {
                        opacity: 1;
                    }
                    .gh-table-copy-btn:hover {
                        background: var(--gh-primary, #4285f4);
                        color: white;
                    }
                `;
                document.head.appendChild(style);
            }

            // 按钮注入函数
            this.#injectTableButton = (table) => {
                if (table.dataset.ghTableCopy) return;
                table.dataset.ghTableCopy = 'true';

                try {
                    // 尝试找到原生表格容器：
                    // - Gemini 普通版: table-block
                    // - Gemini Business: ucs-markdown-table (在 Shadow DOM 内部，closest 可能找不到)
                    // 如果都没有，使用 table 的父元素（不创建 wrapper 以避免破坏流式渲染）
                    let container = table.closest('table-block, ucs-markdown-table');
                    if (!container) {
                        container = table.parentNode;
                        if (!container) return;
                        // 添加标记类以便 CSS 选择器可以匹配
                        container.classList.add('gh-table-container');
                    }
                    container.style.position = 'relative';

                    const btn = document.createElement('button');
                    btn.className = 'gh-table-copy-btn';
                    btn.textContent = '📋';
                    btn.title = t('tableCopyLabel') || 'Copy Markdown';
                    // 检测是否在 Gemini Business 容器中（有原生按钮），调整位置避免遮挡
                    const isGeminiBusiness =
                        container.tagName?.toLowerCase() === 'ucs-markdown-table' || container.closest?.('ucs-markdown-table') || container.classList?.contains('gh-table-container');
                    const rightOffset = isGeminiBusiness ? '80px' : '4px';
                    // 使用内联样式确保定位正确（CSS 可能无法穿透 Shadow DOM）
                    Object.assign(btn.style, {
                        position: 'absolute',
                        top: '4px',
                        right: rightOffset,
                        width: '28px',
                        height: '28px',
                        border: 'none',
                        borderRadius: '6px',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: '0.6',
                        transition: 'opacity 0.2s, transform 0.2s',
                        zIndex: '10',
                    });
                    // hover 效果
                    btn.addEventListener('mouseenter', () => {
                        btn.style.opacity = '1';
                        btn.style.transform = 'scale(1.1)';
                    });
                    btn.addEventListener('mouseleave', () => {
                        btn.style.opacity = '0.6';
                        btn.style.transform = 'scale(1)';
                    });

                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        const markdown = this.tableToMarkdown(table);
                        navigator.clipboard
                            .writeText(markdown)
                            .then(() => {
                                showToast(t('tableCopied') || '表格已复制');
                                btn.textContent = '✓';
                                setTimeout(() => {
                                    btn.textContent = '📋';
                                }, 1000);
                            })
                            .catch((err) => {
                                console.error('[TableCopy] Copy failed:', err);
                                showToast('复制失败');
                            });
                    });

                    container.appendChild(btn);
                } catch (err) {
                    console.error('[TableCopy] Error injecting button:', err);
                }
            };

            // 使用 DOMToolkit.each 持续监听表格（支持 Shadow DOM 穿透）
            // 这比 MutationObserver 更适合 Gemini Business 的深层 Shadow DOM 结构
            this.#stopTableWatch = DOMToolkit.each(
                'table',
                (table) => {
                    this.#injectTableButton(table);
                },
                { shadow: true },
            );
        }

        /**
         * 表格转 Markdown
         */
        tableToMarkdown(table) {
            const rows = table.querySelectorAll('tr');
            if (rows.length === 0) return '';

            const lines = [];
            let headerProcessed = false;

            const getCellContent = (cell) => {
                if (this.#settings.formulaCopyEnabled) {
                    const clone = cell.cloneNode(true);
                    clone.querySelectorAll('.math-block, .math-inline').forEach((mathEl) => {
                        const latex = mathEl.getAttribute('data-math');
                        if (latex) {
                            const isBlock = mathEl.classList.contains('math-block');
                            let replacement;
                            if (this.#settings.formulaDelimiterEnabled) {
                                replacement = isBlock ? `$$${latex}$$` : `$${latex}$`;
                            } else {
                                replacement = latex;
                            }
                            mathEl.replaceWith(document.createTextNode(replacement));
                        }
                    });
                    return clone.innerText?.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ') || '';
                }
                return cell.innerText?.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ') || '';
            };

            rows.forEach((row, rowIndex) => {
                const cells = row.querySelectorAll('th, td');
                const cellTexts = Array.from(cells).map(getCellContent);
                lines.push('| ' + cellTexts.join(' | ') + ' |');

                if (!headerProcessed && (row.querySelector('th') || rowIndex === 0)) {
                    const alignments = Array.from(cells).map((cell) => {
                        return cell.classList.contains('align-center') ? ':---:' : cell.classList.contains('align-right') ? '---:' : '---';
                    });
                    lines.push('| ' + alignments.join(' | ') + ' |');
                    headerProcessed = true;
                }
            });

            return lines.join('\n');
        }

        /**
         * 销毁表格复制功能
         */
        destroyTableCopy() {
            this.#tableCopyInitialized = false;

            // 停止 DOMToolkit.each 的监听
            if (this.#stopTableWatch) {
                this.#stopTableWatch();
                this.#stopTableWatch = null;
            }

            const style = document.getElementById('gh-table-copy-style');
            if (style) style.remove();

            // 使用 DOMToolkit 清理 Shadow DOM 中的元素
            DOMToolkit.query('.gh-table-copy-btn', { all: true, shadow: true })?.forEach((btn) => btn.remove());
            DOMToolkit.query('[data-gh-table-copy]', { all: true, shadow: true })?.forEach((el) => {
                delete el.dataset.ghTableCopy;
            });
            // 清理添加的容器类名
            DOMToolkit.query('.gh-table-container', { all: true, shadow: true })?.forEach((el) => {
                el.classList.remove('gh-table-container');
            });
        }
    }

    /**
     * Gemini 助手核心类
     * 管理提示词、设置和 UI 界面
     */
    class GeminiHelper {
        constructor(siteRegistry) {
            this.prompts = this.loadPrompts();
            this.registry = siteRegistry;
            // 保持 siteAdapter 引用以便兼容旧代码，指向当前匹配的站点
            this.siteAdapter = siteRegistry.getCurrent();
            this.selectedPrompt = null;
            this.isScrolling = false; // 滚动状态锁
            this.lang = detectLanguage(); // 当前语言
            this.i18n = I18N[this.lang]; // 当前语言文本
            this.settingsManager = new SettingsManager();
            this.settings = this.loadSettings(); // 加载设置
            this.copyManager = new CopyManager(this.settings); // 复制管理器

            // Restore saved theme preference if exists
            if (this.settings.themeMode) {
                this.applyTheme(this.settings.themeMode);
            }

            // 根据设置初始化面板折叠状态 (默认显示面板 -> !collapsed)
            this.isCollapsed = !this.settings.defaultPanelState;

            // 初始化当前 Tab：优先使用设置的第一个 Tab
            this.currentTab = this.settings.tabOrder && this.settings.tabOrder.length > 0 ? this.settings.tabOrder[0] : 'prompts';

            // 兜底：如果首个 Tab 被禁用，则回退到 safe tab
            const isOutlineDisabled = this.currentTab === 'outline' && !this.settings.outline?.enabled;
            const isPromptsDisabled = this.currentTab === 'prompts' && !this.settings.prompts?.enabled;

            if (isOutlineDisabled || isPromptsDisabled) {
                // 尝试找一个可用的 tab
                const availableTab = this.settings.tabOrder.find((t) => {
                    if (t === 'outline') return this.settings.outline?.enabled;
                    if (t === 'prompts') return this.settings.prompts?.enabled;
                    return true; // settings always enabled
                });
                this.currentTab = availableTab || 'settings';
            }

            // 初始化核心功能管理器
            this.scrollManager = new ScrollManager(this.siteAdapter);
            this.readingProgressManager = new ReadingProgressManager(this.settings, this.scrollManager, (k) => this.t(k));
            this.anchorManager = new AnchorManager(this.scrollManager, (k) => this.t(k));
            this.historyLoader = new HistoryLoader(this.scrollManager, (k) => this.t(k));

            // 绑定锚点状态变化更新 UI
            this.anchorManager.bindUI((hasAnchor) => this.updateAnchorButtonState(hasAnchor));

            // 初始化滚动锁定管理器
            this.scrollLockManager = new ScrollLockManager(this.siteAdapter);
            // 根据设置初始化状态，前提是当前站点支持
            if (this.settings.preventAutoScroll && this.siteAdapter.supportsScrollLock()) {
                this.scrollLockManager.setEnabled(true);
            }

            this.outlineManager = null;
            this.markdownFixer = null; // Markdown 加粗修复器
            // 边缘吸附状态
            this.edgeSnapState = null; // null | 'left' | 'right'
            // 手动锚点位置
            this.savedAnchorTop = null;
            // 水印移除器
            this.watermarkRemover = new WatermarkRemover();
            if (this.settings.watermarkRemoval && this.siteAdapter instanceof GeminiAdapter) {
                this.watermarkRemover.start();
            }
            this.init();
        }

        // 获取翻译文本
        t(key) {
            return this.i18n[key] || key;
        }

        loadPrompts() {
            const saved = GM_getValue('universal_prompts', null);
            if (!saved) {
                GM_setValue('universal_prompts', DEFAULT_PROMPTS);
                return DEFAULT_PROMPTS;
            }
            return saved;
        }

        savePrompts() {
            GM_setValue('universal_prompts', this.prompts);
        }

        // 加载设置
        loadSettings() {
            return this.settingsManager.load(this.registry, this.siteAdapter);
        }

        // 保存设置
        saveSettings() {
            this.settingsManager.save(this.settings, this.siteAdapter);
        }

        addPrompt(prompt) {
            prompt.id = 'custom_' + Date.now();
            this.prompts.push(prompt);
            this.savePrompts();
            this.refreshPromptList();
            this.refreshCategories();
        }

        updatePrompt(id, updatedPrompt) {
            const index = this.prompts.findIndex((p) => p.id === id);
            if (index !== -1) {
                this.prompts[index] = { ...this.prompts[index], ...updatedPrompt };
                this.savePrompts();
                this.refreshPromptList();
                this.refreshCategories();
            }
        }

        deletePrompt(id) {
            this.prompts = this.prompts.filter((p) => p.id !== id);
            this.savePrompts();
            this.refreshPromptList();
            this.refreshCategories();
        }

        getCategories() {
            const categories = new Set();
            this.prompts.forEach((p) => {
                if (p.category) categories.add(p.category);
            });
            return Array.from(categories);
        }

        init() {
            this.createStyles();
            this.createUI();
            this.monitorTheme();
            this.bindEvents();
            // 初始化锚点按钮状态（初始时没有锚点，应置灰）
            this.updateAnchorButtonState(false);
            this.siteAdapter.findTextarea();
            // 对于 Gemini Business，根据设置决定是否在初始化时插入零宽字符
            const currentSiteId = this.siteAdapter.getSiteId();
            const adapterOptions = {
                clearOnInit: this.siteAdapter instanceof GeminiBusinessAdapter ? this.settings.clearTextareaOnSend : false,
                modelLockConfig: this.settings.modelLockConfig[currentSiteId], // 传递当前站点的配置
            };
            // 绑定新对话监听 (点击按钮或快捷键)
            this.siteAdapter.bindNewChatListeners(() => {
                console.log('Gemini Helper: New chat detected, re-initializing...');
                // 使用当前内存中的设置重新应用配置（无需重新加载）
                const currentSiteId = this.siteAdapter.getSiteId();
                const adapterOptions = {
                    clearOnInit: this.siteAdapter instanceof GeminiBusinessAdapter ? this.settings.clearTextareaOnSend : false,
                    modelLockConfig: this.settings.modelLockConfig[currentSiteId],
                };
                this.siteAdapter.afterPropertiesSet(adapterOptions);
                // 重新应用滚动锁定状态
                if (this.scrollLockManager) {
                    this.scrollLockManager.siteAdapter = this.siteAdapter; // 确保适配器更新
                    this.scrollLockManager.setEnabled(this.settings.preventAutoScroll);
                }

                // 重新应用宽度样式 (防止页面重置)
                if (this.widthStyleManager) {
                    this.widthStyleManager.apply();
                }
            });

            this.siteAdapter.afterPropertiesSet(adapterOptions);
            // 初始化时执行锚点恢复和清理
            if (this.settings.readingHistory.persistence) {
                // 延迟触发以确保页面加载完成
                setTimeout(() => {
                    this.restoreReadingProgress();
                    this.cleanupReadingHistory();
                }, 2000);
            }

            // 创建并应用页面宽度样式
            this.widthStyleManager = new WidthStyleManager(this.siteAdapter, this.settings.pageWidth);
            this.widthStyleManager.apply();

            // 初始化标签页重命名管理器
            this.tabRenameManager = new TabRenameManager(this.siteAdapter, this.settings, (key) => this.t(key));
            if (this.settings.tabSettings?.autoRenameTab) {
                this.tabRenameManager.start();
            }

            // 初始化 Markdown 加粗修复（仅 Gemini 普通版需要）
            const isStandardGemini = this.siteAdapter instanceof GeminiAdapter;
            const mdFixSettings = GM_getValue(SETTING_KEYS.MARKDOWN_FIX, DEFAULT_MARKDOWN_FIX_SETTINGS);
            if (isStandardGemini && mdFixSettings.enabled) {
                this.markdownFixer = new MarkdownFixer();
                this.markdownFixer.start();
            }

            // 初始化公式双击复制功能（仅 Gemini 普通版，且设置已开启）
            // 默认开启（首次使用时）
            if (isStandardGemini) {
                if (this.settings.formulaCopyEnabled === undefined) {
                    this.settings.formulaCopyEnabled = true;
                    this.saveSettings();
                }
                if (this.settings.formulaDelimiterEnabled === undefined) {
                    this.settings.formulaDelimiterEnabled = true;
                    this.saveSettings();
                }
                if (this.settings.formulaCopyEnabled) {
                    this.copyManager.initFormulaCopy();
                }
            }

            // 初始化表格复制功能（通用功能，两个版本都支持）
            // 默认开启（首次使用时）
            if (this.settings.tableCopyEnabled === undefined) {
                this.settings.tableCopyEnabled = true;
                this.saveSettings();
            }
            if (this.settings.tableCopyEnabled) {
                this.copyManager.initTableCopy();
            }

            // 监听自定义大纲自动刷新事件
            window.addEventListener('gemini-helper-outline-auto-refresh', () => {
                this.refreshOutline();
            });

            // 如果初始 Tab 是大纲，尽快刷新内容（用户体验）
            if (this.currentTab === 'outline') {
                setTimeout(() => this.refreshOutline(), 500);
            }

            // 延迟重新初始化当前 Tab 的功能，确保页面完全就绪后绑定到正确的滚动容器
            // 注意：必须先 stopSyncScroll 清除旧 handler，否则 startSyncScroll 会短路返回
            setTimeout(() => {
                if (this.currentTab === 'outline' && this.outlineManager) {
                    this.outlineManager.stopSyncScroll();
                }
                this.switchTab(this.currentTab);
            }, 1500);

            // SPA 导航监听：切换会话后重新初始化大纲和同步滚动
            if (window.onurlchange === null) {
                window.addEventListener('urlchange', (e) => {
                    // 延迟执行，等待新页面 DOM 渲染完成
                    setTimeout(() => {
                        if (this.currentTab === 'outline' && this.outlineManager) {
                            this.outlineManager.stopSyncScroll();
                            this.refreshOutline();
                            // 再次延迟启动同步滚动，确保大纲刷新完成
                            setTimeout(() => {
                                if (this.outlineManager && this.settings.outline?.syncScroll) {
                                    this.outlineManager.startSyncScroll();
                                }
                            }, 500);
                        }
                    }, 1000);
                });
            }
        }

        createStyles() {
            const existingStyle = document.getElementById('gemini-helper-styles');
            if (existingStyle) existingStyle.remove();

            const colors = this.siteAdapter.getThemeColors();
            const gradient = `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`;

            const style = document.createElement('style');
            style.id = 'gemini-helper-styles';
            style.textContent = `
                /* CSS Variables Definition (Global Scope) */
                :root {
                    --gh-bg: #ffffff;
                    --gh-bg-secondary: #f9fafb;
                    --gh-text: #1f2937;
                    --gh-text-secondary: #6b7280;
                    --gh-border: #e5e7eb;
                    --gh-hover: #f3f4f6;
                    --gh-shadow: 0 10px 40px rgba(0,0,0,0.15);
                    --gh-input-bg: #ffffff;
                    --gh-input-border: #d1d5db;
                    --gh-active-bg: #e5e7eb;
                    --gh-danger: #ef4444;
                    --gh-gradient: ${gradient};

                    /* Semantic Variables */
                    --gh-header-bg: ${gradient};
                    --gh-folder-bg-default: #e0f2fe;
                    --gh-folder-bg-expanded: #c7d2fe;
                    --gh-border-active: #6366f1;
                    --gh-tag-active-bg: ${colors.primary};
                    --gh-checkbox-bg: #4f46e5; /* Indigo 600 - Premium Light */

                    --gh-tag-active-bg: ${colors.primary};
            --gh-checkbox-bg: #4f46e5; /* Indigo 600 - Premium Light */

            /* Outline Highlight Colors (Light Mode) */
            --gh-outline-locate-bg: rgba(16, 185, 129, 0.25); /* Emerald 500 */
            --gh-outline-locate-border: #10b981;
            --gh-outline-locate-shadow: rgba(16, 185, 129, 0.5);
            --gh-outline-sync-bg: rgba(52, 211, 153, 0.10); /* Emerald 400 - Soft */
            --gh-outline-sync-border: #34d399;

            /* Folder Preset Colors */
                    --gh-folder-bg-0: #fef9e7;
                    --gh-folder-bg-1: #fdf2f8;
                    --gh-folder-bg-2: #eff6ff;
                    --gh-folder-bg-3: #ecfdf5;
                    --gh-folder-bg-4: #faf5ff;
                    --gh-folder-bg-5: #fefce8;
                    --gh-folder-bg-6: #ecfeff;
                    --gh-folder-bg-7: #fdf4ff;
                }

                body[data-gh-mode="dark"] {
                    --gh-bg: #1e1e1e;
                    --gh-bg-secondary: #0b0b0b;
                    --gh-text: #e3e3e3;
                    --gh-text-secondary: #a0a0a0;
                    --gh-border: #333333;
                    --gh-hover: #262626;
                    --gh-shadow: 0 10px 40px rgba(0,0,0,0.6);
                    --gh-input-bg: #262626;
                    --gh-input-border: #404040;
                    --gh-active-bg: #333333;

                    /* Dark Mode Semantic Overrides */
                    --gh-header-bg: #1e1e1e;
                    --gh-folder-bg-default: rgba(66, 133, 244, 0.15);
                    --gh-folder-bg-expanded: rgba(66, 133, 244, 0.3);
                    --gh-border-active: #818cf8;
                    --gh-tag-active-bg: rgba(66, 133, 244, 0.6);
                    --gh-checkbox-bg: #818cf8; /* Indigo 400 - Premium Dark */

                    --gh-tag-active-bg: rgba(66, 133, 244, 0.6);
            --gh-checkbox-bg: #818cf8; /* Indigo 400 - Premium Dark */

            /* Outline Highlight Colors (Dark Mode) */
            --gh-outline-locate-bg: rgba(52, 211, 153, 0.3); /* Emerald 400 */
            --gh-outline-locate-border: #34d399;
            --gh-outline-locate-shadow: rgba(52, 211, 153, 0.6);
            --gh-outline-sync-bg: rgba(16, 185, 129, 0.15); /* Emerald 500 - Soft */
            --gh-outline-sync-border: #10b981;

            /* Folder Preset Colors (Dark Mode Translucent) */
                    --gh-folder-bg-0: rgba(253, 224, 71, 0.15);
                    --gh-folder-bg-1: rgba(244, 114, 182, 0.15);
                    --gh-folder-bg-2: rgba(96, 165, 250, 0.15);
                    --gh-folder-bg-3: rgba(52, 211, 153, 0.15);
                    --gh-folder-bg-4: rgba(167, 139, 250, 0.15);
                    --gh-folder-bg-5: rgba(253, 224, 71, 0.1);
                    --gh-folder-bg-6: rgba(34, 211, 238, 0.15);
                    --gh-folder-bg-7: rgba(232, 121, 249, 0.15);
                    --gh-folder-bg-6: rgba(34, 211, 238, 0.15);
                    --gh-folder-bg-7: rgba(232, 121, 249, 0.15);
                }

                /* Dark Mode Tab Overrides */
                body[data-gh-mode="dark"] .prompt-panel-tab {
                    border-top: 3px solid transparent;
                    border-bottom: 1px solid transparent;
                    margin-bottom: -1px;
                }
                body[data-gh-mode="dark"] .prompt-panel-tab.active {
                    border-top-color: var(--gh-tag-active-bg);
                    border-bottom-color: var(--gh-bg);
                    background: var(--gh-bg);
                }

                /* 主面板样式 */
                #gemini-helper-panel {
                    position: fixed;
                    top: 50%;
                    right: 20px;
                    transform: translateY(-50%);
                    width: 320px;
                    height: 80vh;
                    min-height: 600px;
                    background: var(--gh-bg, white);
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
                    z-index: 999999;
                    display: flex;
                    flex-direction: column;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    transition: box-shadow 0.3s ease, border-color 0.3s ease;
                    border: 1px solid var(--gh-border, #e0e0e0);
                }
                #gemini-helper-panel.collapsed { display: none; }
                .prompt-panel-header {
                    padding: 12px 14px;
                    background: var(--gh-header-bg);
                    color: white;
                    border-radius: 12px 12px 0 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: move;
                    user-select: none;
                }
                .prompt-panel-title { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0; }
                .site-indicator { font-size: 10px; padding: 2px 5px; background: rgba(255,255,255,0.2); border-radius: 4px; margin-left: 4px; white-space: nowrap; }
                .prompt-panel-controls { display: flex; gap: 4px; align-items: center; }
                .prompt-panel-btn {
                    background: rgba(255,255,255,0.2); border: none; color: white; width: 28px; height: 28px;
                    border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;
                    transition: all 0.2s; font-size: 14px;
                }
                .prompt-panel-btn:hover { background: rgba(255,255,255,0.3); transform: scale(1.1); }
                .prompt-search-bar { padding: 12px; border-bottom: 1px solid var(--gh-border, #e5e7eb); background: var(--gh-bg-secondary, #f9fafb); }
                .prompt-search-input {
                    width: 100%; padding: 8px 12px; border: 1px solid var(--gh-input-border, #d1d5db); border-radius: 8px; font-size: 14px;
                    transition: all 0.2s; box-sizing: border-box;
                    background: var(--gh-input-bg, #ffffff); color: var(--gh-text, #1f2937);
                }
                .prompt-search-input:focus { outline: none; border-color: ${colors.primary}; }
                .prompt-categories { padding: 8px 12px; display: flex; gap: 6px; flex-wrap: wrap; background: var(--gh-bg, white); border-bottom: 1px solid var(--gh-border, #e5e7eb); }
                .category-tag {
                    padding: 4px 10px; background: var(--gh-hover, #f3f4f6); border-radius: 12px; font-size: 12px; color: #4b5563;
                    cursor: pointer; transition: all 0.2s; border: 1px solid transparent;
                }
                .category-tag:hover { background: var(--gh-border, #e5e7eb); }
                .category-tag.active {
                    background: var(--gh-tag-active-bg); color: white; border-color: var(--gh-tag-active-bg);
                }
                .prompt-list { flex: 1; overflow-y: auto; padding: 8px; }
                .prompt-item {
                    background: var(--gh-bg, white); border: 1px solid var(--gh-border, #e5e7eb); border-radius: 8px; padding: 12px; margin-bottom: 8px;
                    cursor: pointer; transition: all 0.2s; position: relative;
                }
                .prompt-item:hover {
                    border-color: ${colors.primary};
                    box-shadow: 0 4px 12px rgba(66,133,244,0.15);
                    transform: translateY(-2px);
                }
                .prompt-item.selected {
                    background: linear-gradient(135deg, #e8f0fe 0%, #f1f8e9 100%);
                    border-color: ${colors.primary};
                }
                body[data-gh-mode="dark"] .prompt-item.selected {
                    background: linear-gradient(135deg, rgba(66, 133, 244, 0.25) 0%, rgba(52, 211, 153, 0.15) 100%);
                    border-color: ${colors.primary};
                }
                .prompt-item-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
                .prompt-item-title { font-weight: 600; font-size: 14px; color: var(--gh-text, #1f2937); flex: 1; }
                .prompt-item-category { font-size: 11px; padding: 2px 6px; background: var(--gh-hover, #f3f4f6); border-radius: 4px; color: var(--gh-text-secondary, #6b7280); }
                .prompt-item-content { font-size: 13px; color: var(--gh-text-secondary, #6b7280); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
                .prompt-item-actions { position: absolute; top: 8px; right: 8px; display: none; gap: 4px; }
                .prompt-item:hover .prompt-item-actions { display: flex; }
                .prompt-action-btn {
                    width: 24px; height: 24px; border: none; background: var(--gh-bg, white); border-radius: 4px; cursor: pointer;
                    display: flex; align-items: center; justify-content: center; transition: all 0.2s;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-size: 12px;
                }
                .prompt-action-btn:hover { background: var(--gh-hover, #f3f4f6); transform: scale(1.1); }
                .prompt-item.dragging { opacity: 0.5; }
                .add-prompt-btn {
                    margin: 12px; padding: 10px; background: var(--gh-header-bg);
                    color: white; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;
                    transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;
                }
                .add-prompt-btn:hover { transform: translateY(-2px); }
                /* 模态框 */
                .prompt-modal {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5);
                    display: flex; align-items: center; justify-content: center; z-index: 1000000; animation: fadeIn 0.2s;
                }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
                .prompt-modal-content {
                    background: var(--gh-bg, white); border-radius: 12px; width: 90%; max-width: 500px; padding: 24px; animation: slideUp 0.3s;
                }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                .prompt-modal-header { font-size: 18px; font-weight: 600; margin-bottom: 20px; color: var(--gh-text, #1f2937); }
                .prompt-form-group { margin-bottom: 16px; }
                .prompt-form-label { display: block; font-size: 14px; font-weight: 500; color: var(--gh-text, #374151); margin-bottom: 6px; }
                .prompt-form-input, .prompt-form-textarea {
                    width: 100%; padding: 8px 12px; border: 1px solid var(--gh-input-border, #d1d5db); border-radius: 6px; font-size: 14px;
                    transition: all 0.2s; box-sizing: border-box;
                    background: var(--gh-input-bg, #ffffff); color: var(--gh-text, #1f2937);
                }
                .prompt-form-textarea { min-height: 100px; resize: vertical; font-family: inherit; }
                .prompt-form-input:focus, .prompt-form-textarea:focus { outline: none; border-color: ${colors.primary}; }
                .prompt-modal-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px; }
                .prompt-modal-btn { padding: 8px 16px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; border: none; }
                .prompt-modal-btn.primary { background: var(--gh-header-bg); color: white; border: 1px solid rgba(255,255,255,0.2); }
                .prompt-modal-btn.secondary { background: var(--gh-hover, #f3f4f6); color: #4b5563; }
                /* 选中的提示词显示栏 */
                .selected-prompt-bar {
                    position: fixed; bottom: 120px; left: 50%; transform: translateX(-50%); /* bottom 由 JS 动态控制 */
                    background: var(--gh-header-bg);
                    color: white; padding: 8px 16px; border-radius: 20px; font-size: 13px; display: none;
                    align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(66,133,244,0.3);
                    z-index: 999998; animation: slideInUp 0.3s;
                }
                @keyframes slideInUp { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
                .selected-prompt-bar.show { display: flex; }
                .selected-prompt-text { max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .clear-prompt-btn {
                    background: rgba(255,255,255,0.2); border: none; color: white; width: 20px; height: 20px;
                    border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;
                }
                .quick-prompt-btn {
                    width: 44px; height: 44px;
                    background: var(--gh-header-bg);
                    border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white;
                    font-size: 18px; cursor: pointer; box-shadow: 0 4px 12px rgba(66,133,244,0.3);
                    border: none; transition: transform 0.3s;
                }
                .quick-prompt-btn:hover { transform: scale(1.1); }
                /* 快捷按钮组（统一侧边按钮） */
                .quick-btn-group {
                    position: fixed; right: 16px; top: 50%;
                    transform: translateY(-50%);
                    display: flex; flex-direction: column; gap: 8px;
                    z-index: 999997; transition: opacity 0.3s;
                }
                .quick-btn-group .quick-prompt-btn {
                    width: 40px; height: 40px; font-size: 16px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                }
                .quick-btn-group .quick-prompt-btn.panel-only {
                    display: none;
                }
                .quick-btn-group.collapsed .quick-prompt-btn.panel-only {
                    display: flex;
                }
                .quick-btn-group .quick-prompt-btn.panel-only.btn-disabled {
                    display: none !important;
                }
                .quick-btn-group .quick-prompt-btn.manual-anchor-btn.back-btn {
                    opacity: 0.4;
                    cursor: default;
                }
                .quick-btn-group .quick-prompt-btn.manual-anchor-btn.back-btn.has-anchor {
                    opacity: 1;
                    cursor: pointer;
                }
                .quick-btn-group .quick-prompt-btn.manual-anchor-btn.btn-disabled {
                    display: none !important;
                }
                .quick-btn-group .quick-prompt-btn.manual-anchor-btn.clear-btn:hover {
                    background: #ef4444 !important;
                }
                .quick-btn-group .divider {
                    width: 24px; height: 1px;
                    background: rgba(255,255,255,0.3);
                    margin: 2px auto;
                }
                .quick-btn-group .divider.panel-only {
                    display: none;
                }
                .quick-btn-group.collapsed .divider.panel-only {
                    display: block;
                }

                /* ========== 边缘吸附隐藏功能样式 ========== */
                #gemini-helper-panel.edge-snapped-left {
                    left: -310px !important;
                    right: auto !important;
                    transition: left 0.3s ease, opacity 0.3s ease;
                }
                #gemini-helper-panel.edge-snapped-left:hover,
                #gemini-helper-panel.edge-snapped-left.edge-peek {
                    left: 0 !important;
                }
                #gemini-helper-panel.edge-snapped-right {
                    right: -310px !important;
                    left: auto !important;
                    transition: right 0.3s ease, opacity 0.3s ease;
                }
                #gemini-helper-panel.edge-snapped-right:hover,
                #gemini-helper-panel.edge-snapped-right.edge-peek {
                    right: 0 !important;
                }
                .edge-snap-trigger {
                    position: fixed;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 12px;
                    height: 80px;
                    background: var(--gh-header-bg);
                    border-radius: 0 8px 8px 0;
                    cursor: pointer;
                    z-index: 999998;
                    display: none;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 2px 0 8px rgba(0,0,0,0.15);
                    transition: width 0.2s ease;
                }
                .edge-snap-trigger.left {
                    left: 0;
                    border-radius: 0 8px 8px 0;
                }
                .edge-snap-trigger.right {
                    right: 0;
                    border-radius: 8px 0 0 8px;
                    box-shadow: -2px 0 8px rgba(0,0,0,0.15);
                }
                .edge-snap-trigger:hover {
                    width: 16px;
                }
                .edge-snap-trigger.visible {
                    display: flex;
                }
                .edge-snap-trigger::after {
                    content: '';
                    width: 4px;
                    height: 30px;
                    background: rgba(255,255,255,0.5);
                    border-radius: 2px;
                }


                /* 锚点标记 - 侧边小标记 */
                .manual-anchor-marker {
                    position: absolute;
                    left: 0;
                    width: 4px;
                    height: 24px;
                    background: var(--gh-header-bg);
                    border-radius: 0 4px 4px 0;
                    z-index: 999;
                    pointer-events: none;
                    box-shadow: 2px 0 4px rgba(0,0,0,0.1);
                }
                .manual-anchor-marker::before {
                    content: '📍';
                    position: absolute;
                    left: 8px;
                    top: 2px;
                    font-size: 14px;
                }

                .hidden { display: none !important; }
                .outline-hidden { display: none !important; }
                .gemini-toast {
                    position: fixed !important; top: 32px !important; left: 50% !important; transform: translateX(-50%) !important;
                    background: var(--gh-header-bg); /* 品牌渐变色 -> 动态主题色 */
                    color: white; /* 渐变色背景通常较深，配白字 */
                    padding: 10px 24px; border-radius: 9999px; font-size: 14px; font-weight: 500;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
                    z-index: 1000001 !important; animation: toastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                    border: 1px solid rgba(255, 255, 255, 0.15); /* 增加一点白色内描边提升精致感 */
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                    pointer-events: none;
                }
                @keyframes toastSlideIn {
                    from { transform: translate(-50%, -20px) scale(0.95); opacity: 0; }
                    to { transform: translate(-50%, 0) scale(1); opacity: 1; }
                }
                /* Theme Toggle Animation (View Transitions API) */
                ::view-transition-old(root),
                ::view-transition-new(root) {
                    animation: none;
                    mix-blend-mode: normal;
                }
                ::view-transition-old(root) {
                    z-index: 1;
                }
                ::view-transition-new(root) {
                    z-index: 9999;
                }
                .dark-theme::view-transition-old(root) {
                    z-index: 9999;
                }
                .dark-theme::view-transition-new(root) {
                    z-index: 1;
                }
                @keyframes themeReveal {
                    from { clip-path: circle(0% at var(--theme-x, 95%) var(--theme-y, 5%)); }
                    to { clip-path: circle(150% at var(--theme-x, 95%) var(--theme-y, 5%)); }
                }
                @keyframes themeShrink {
                    from { clip-path: circle(150% at var(--theme-x, 95%) var(--theme-y, 5%)); }
                    to { clip-path: circle(0% at var(--theme-x, 95%) var(--theme-y, 5%)); }
                }
                /* 快捷跳转按钮组（面板内） */
                .scroll-nav-container {
                    display: flex; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--gh-border, #e5e7eb);
                    background: var(--gh-bg-secondary);
                    border-radius: 0 0 12px 12px; justify-content: center;
                }
                .scroll-nav-btn {
                    flex: 1; max-width: 120px; height: 32px; border-radius: 8px; border: none; cursor: pointer;
                    display: flex; align-items: center; justify-content: center; font-size: 14px; color: white; gap: 4px;
                    background: var(--gh-header-bg);
                    box-shadow: 0 2px 6px rgba(0,0,0,0.15); transition: transform 0.2s, box-shadow 0.2s;
                }
                .scroll-nav-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
                .scroll-nav-btn.icon-only {
                    flex: 0 0 32px; width: 32px; border-radius: 50%; padding: 0;
                }
                .scroll-nav-btn.icon-only span {
                    display: inline-block; transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                .scroll-nav-btn.icon-only:hover span {
                    transform: rotate(360deg) scale(1.2);
                }

                /* ========== 会话面板样式 ========== */
                .conversations-content {
                    display: flex; flex-direction: column; flex: 1; min-height: 200px;
                    overflow-x: hidden; /* 隐藏横向滚动条 */
                }
                .conversations-toolbar {
                    display: flex; gap: 6px; padding: 10px 12px; border-bottom: 1px solid var(--gh-border, #e5e7eb); flex-shrink: 0;
                }
                .conversations-toolbar-btn {
                    padding: 5px 8px; border: 1px solid var(--gh-input-border, #d1d5db); border-radius: 6px; background: var(--gh-bg-secondary, #f9fafb);
                    font-size: 13px; color: var(--gh-text, #374151); cursor: pointer; transition: all 0.2s;
                    display: flex; align-items: center; justify-content: center;
                    min-width: 32px; height: 32px; flex-shrink: 0;
                }
                .conversations-toolbar-btn svg { width: 16px; height: 16px; }
                .conversations-toolbar-btn:hover { background: var(--gh-hover, #f3f4f6); border-color: #9ca3af; }
                .conversations-toolbar-btn.batch-mode.active { background: var(--gh-border-active); color: white; border-color: var(--gh-border-active); }
                .conversations-toolbar-btn:disabled { opacity: 0.6; cursor: wait; }
                .conversations-folder-select {
                    padding: 5px 8px; border: 1px solid var(--gh-input-border, #d1d5db); border-radius: 6px;
                    background: var(--gh-bg-secondary, #f9fafb); font-size: 13px; color: var(--gh-text, #374151); cursor: pointer;
                    flex: 1; min-width: 80px; height: 32px;
                }
                .conversations-folder-select:focus { outline: none; border-color: var(--gh-border-active); }
                .conversations-folder-list {
                    flex: 1; overflow-y: auto; padding: 8px;
                    scrollbar-width: none; /* Firefox */
                    -ms-overflow-style: none; /* IE/Edge */
                }
                .conversations-folder-list::-webkit-scrollbar { display: none; } /* Chrome */
                .conversations-folder-item {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 10px 12px; margin-bottom: 4px; border-radius: 8px;
                    background: var(--gh-bg-secondary, #f9fafb); cursor: pointer; transition: all 0.2s;
                    flex-wrap: wrap; /* 允许换行，会话列表在下方 */
                }
                .conversations-folder-item:hover { background: var(--gh-hover, #f3f4f6); }
                .conversations-folder-item.default { background: var(--gh-folder-bg-default); }
                .conversations-folder-item.expanded {
                    background: var(--gh-folder-bg-expanded) !important; /* 更深的紫蓝色 */
                    border: 2px solid var(--gh-border-active); /* 明显的边框 */
                    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
                    border-radius: 8px 8px 0 0; /* 展开时上方圆角 */
                }
                .conversations-folder-info {
                    display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;
                    position: relative; /* 为绝对定位的箭头提供参考 */
                }
                .conversations-folder-icon {
                    font-size: 18px; width: 24px; height: 24px;
                    display: flex; align-items: center; justify-content: center;
                    line-height: 1; flex-shrink: 0;
                }
                .conversations-folder-name {
                    font-size: 14px; font-weight: 500; color: var(--gh-text, #1f2937);
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                    user-select: none; /* 禁止选中 */
                }
                .conversations-folder-count { font-size: 12px; color: var(--gh-text-secondary, #6b7280); flex-shrink: 0; user-select: none; }
                .conversations-folder-menu-btn {
                    width: 24px; height: 24px; border: none; background: transparent;
                    color: var(--gh-text-secondary, #6b7280); cursor: pointer; border-radius: 4px; font-size: 14px;
                }
                .conversations-folder-menu-btn:hover { background: var(--gh-border, #e5e7eb); }
                .conversations-folder-controls {
                    display: flex; align-items: center; gap: 4px; flex-shrink: 0;
                }
                .conversations-folder-order-btns {
                    position: absolute; right: 0; top: 50%; transform: translateY(-50%);
                    display: flex; align-items: center; gap: 2px;
                    opacity: 0; transition: opacity 0.2s;
                    background: linear-gradient(to right, transparent, currentColor 8px); /* 渐变遮罩 */
                    background: inherit; padding-left: 8px;
                }
                .conversations-folder-item:hover .conversations-folder-order-btns {
                    opacity: 1;
                }
                .conversations-folder-order-btn {
                    width: 20px; height: 20px; border: 1px solid var(--gh-input-border, #d1d5db); border-radius: 4px;
                    background: var(--gh-bg, white); color: var(--gh-text-secondary, #6b7280); cursor: pointer; font-size: 11px;
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.15s;
                }
                .conversations-folder-order-btn:hover:not(:disabled) {
                    background: var(--gh-hover, #f3f4f6); border-color: #9ca3af; color: var(--gh-text, #374151);
                }
                .conversations-folder-order-btn:disabled {
                    opacity: 0.3; cursor: default;
                }
                .conversations-folder-menu {
                    background: var(--gh-bg, white); border: 1px solid var(--gh-border, #e5e7eb); border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000002; padding: 4px;
                    min-width: 100px;
                }
                .conversations-folder-menu button {
                    display: block; width: 100%; padding: 8px 12px; border: none; background: none;
                    text-align: left; font-size: 13px; color: var(--gh-text, #374151); cursor: pointer; border-radius: 4px;
                }
                .conversations-folder-menu button:hover { background: var(--gh-hover, #f3f4f6); }
                .conversations-empty {
                    text-align: center; padding: 40px 20px; color: #9ca3af; font-size: 14px;
                }

                /* 搜索栏样式 */
                .conversations-search-bar {
                    padding: 8px 12px;
                    border-bottom: 1px solid var(--gh-border, #e5e7eb);
                    background: var(--gh-bg-secondary, #f9fafb);
                }
                .conversations-search-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 0;
                    position: relative; /* For dropdown menu */
                }
                /* Has Filter State: Remove Tag Btn Radius */
                .conversations-search-wrapper.has-filter .conversations-tag-search-btn {
                    border-radius: 0;
                    border-right: none;
                }

                .conversations-search-input-group {
                    flex: 1;
                    position: relative;
                    height: 36px;
                    min-width: 0;
                }
                .conversations-search-input {
                    width: 100%;
                    height: 100%;
                    padding: 0 12px; /* Symmetric padding */
                    border: 1px solid var(--gh-input-border, #d1d5db);
                    border-radius: 8px 0 0 8px;
                    font-size: 14px;
                    box-sizing: border-box;
                    transition: all 0.2s;
                    background: var(--gh-input-bg, #ffffff); color: var(--gh-text, #1f2937);
                }
                .conversations-search-input:focus {
                    outline: none;
                    border-color: var(--gh-border-active);
                    z-index: 1;
                    position: relative;
                }

                /* Pin Button */
                .conversations-pin-filter-btn {
                    cursor: pointer; width: 36px; height: 36px; color: #9ca3af; font-size: 14px;
                    display: flex; align-items: center; justify-content: center;
                    border: 1px solid var(--gh-input-border, #d1d5db); border-left: none;
                    background: var(--gh-bg, white); box-sizing: border-box; transition: all 0.2s;
                }
                .conversations-pin-filter-btn:hover { background: var(--gh-hover, #f3f4f6); color: var(--gh-text, #374151); }
                .conversations-pin-filter-btn.active {
                    color: var(--gh-border-active); background: var(--gh-folder-bg-default);
                    box-shadow: inset 0 0 0 1px #818cf8;
                }

                .conversations-result-bar {
                    text-align: center;
                    padding: 6px;
                    color: #3b82f6;
                    font-size: 13px;
                    background: #eff6ff;
                    display: none;
                }
                .conversations-result-bar.visible { display: block; }

                /* 标签样式 */
                .conversations-tag {
                    display: inline-block; padding: 2px 6px; border-radius: 4px;
                    font-size: 11px; margin-right: 4px; margin-top: 4px;
                    color: white; background-color: #9ca3af; line-height: 1.2;
                    /* Fix 1: Max width and overflow */
                    max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle;
                }
                .conversations-tag-list {
                    margin-top: 2px; display: flex; flex-wrap: wrap; gap: 4px; border-top: 1px dashed #eee; padding-top: 2px;
                }
                .conversations-tag-list:empty { display: none; }

                /* 标签筛选按钮 */
                .conversations-tag-search-btn {
                    cursor: pointer; width: 36px; height: 36px; color: #9ca3af; font-size: 14px;
                    display: flex; align-items: center; justify-content: center;
                    border: 1px solid var(--gh-input-border, #d1d5db); border-left: none; border-radius: 0; /* Always 0 radius/square */
                    background: var(--gh-bg, white); box-sizing: border-box; transition: all 0.2s;
                }
                .conversations-tag-search-btn:hover { background: var(--gh-hover, #f3f4f6); color: var(--gh-text, #374151); }
                .conversations-tag-search-btn.active {
                    color: var(--gh-border-active); background: var(--gh-folder-bg-default);
                    box-shadow: inset 0 0 0 1px #818cf8; /* Fix 7: Distinct active border/shadow */
                }
                .conversations-tag-search-btn.empty { opacity: 0.5; }

                /* Clear Button - Restyled at far right */
                .conversations-search-clear {
                    cursor: pointer; width: 36px; height: 36px; color: #9ca3af; font-size: 18px;
                    display: flex; align-items: center; justify-content: center;
                    border: 1px solid var(--gh-input-border, #d1d5db); border-left: none; border-radius: 0 8px 8px 0;
                    background: var(--gh-bg, white); box-sizing: border-box; transition: all 0.2s;
                    user-select: none;
                }
                .conversations-search-clear:hover { background: #fef2f2; color: #ef4444; }
                .conversations-search-clear.disabled {
                    opacity: 0.3; cursor: default; background: var(--gh-bg-secondary, #f9fafb); pointer-events: none;
                }

                /* Removed old inner clear button styles */

                /* 标签筛选菜单 */
                .conversations-tag-filter-menu {
                    position: absolute;
                    top: calc(100% + 4px);
                    right: 0;
                    width: 200px;
                    background: var(--gh-bg, white);
                    border: 1px solid var(--gh-border, #e5e7eb);
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                    z-index: 1000;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    animation: fadeIn 0.2s;
                }
                .conversations-tag-filter-list {
                    overflow-y: auto; flex: 1; padding: 4px; display: flex; flex-direction: column; gap: 2px;
                }
                .conversations-tag-filter-footer {
                    padding: 4px; border-top: 1px solid #eee; background: var(--gh-bg-secondary, #f9fafb); flex-shrink: 0;
                }
                .conversations-tag-filter-item {
                    display: flex; align-items: center; gap: 8px; padding: 8px;
                    cursor: pointer; border-radius: 6px; font-size: 13px; color: var(--gh-text, #374151);
                    /* Fix overflow */
                    width: 100%; box-sizing: border-box; overflow: hidden;
                }
                .conversations-tag-filter-item span:not(.conversations-tag-dot) {
                     white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
                }
                .conversations-tag-filter-item:hover { background: var(--gh-hover, #f3f4f6); }
                .conversations-tag-filter-item.selected { background: var(--gh-folder-bg-default); color: #2563eb; font-weight: 500; }

                /* Checkmark for selected */
                .conversations-tag-filter-item.selected::after {
                    content: '✓'; margin-left: auto; font-size: 14px; font-weight: bold;
                }

                /* Ensure dot doesn't stretch */
                .conversations-tag-dot {
                    width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0;
                    border: 1px solid rgba(0,0,0,0.05); /* Subtle border */
                }

                .conversations-tag-filter-divider { height: 1px; background: #eee; margin: 4px 0; flex-shrink: 0; }
                .conversations-tag-filter-action { color: var(--gh-border-active); font-weight: 500; justify-content: center; }

                /* 标签管理弹窗 */
                .conversations-tag-manager-list {
                    max-height: 250px; overflow-y: auto; border: 1px solid var(--gh-border, #e5e7eb); border-radius: 4px; margin-bottom: 12px; padding: 4px;
                }
                .conversations-tag-manager-item {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 8px; border-bottom: 1px solid var(--gh-hover, #f3f4f6);
                }
                .conversations-tag-manager-item:last-child { border-bottom: none; }
                .conversations-tag-manager-item:hover { background: var(--gh-bg-secondary, #f9fafb); }
                .conversations-tag-preview {
                    padding: 2px 8px; border-radius: 4px; font-size: 12px; color: white;
                    /* Fix overflow */
                    max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; display: inline-block;
                }
                .conversations-tag-actions { display: flex; gap: 4px; flex-shrink: 0; }
                .conversations-tag-btn {
                    width: 24px; height: 24px; border: none; background: transparent; cursor: pointer;
                    display: flex; align-items: center; justify-content: center; color: #9ca3af; border-radius: 4px; transition: all 0.2s;
                }
                .conversations-tag-btn:hover { background: var(--gh-border, #e5e7eb); color: var(--gh-text, #374151); }
                .conversations-tag-btn:hover { background: #fee2e2; color: #ef4444; }
                .conversations-tag-btn.edit:hover { background: #e0f2fe; color: #3b82f6; }

                /* 颜色选择器 */
                .conversations-color-picker {
                    display: grid; grid-template-columns: repeat(10, 1fr); gap: 6px; margin: 12px 0;
                }
                .conversations-color-item {
                    width: 24px; height: 24px; border-radius: 4px; cursor: pointer;
                    border: 2px solid transparent; transition: transform 0.1s;
                }
                .conversations-color-item:hover { transform: scale(1.1); }
                .conversations-color-item.selected { border-color: var(--gh-text, #374151); transform: scale(1.1); box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
                .conversations-result-bar {
                    text-align: center;
                    padding: 6px;
                    color: var(--gh-border-active);
                    font-size: 13px;
                    background: var(--gh-folder-bg-default);
                    border-radius: 4px;
                    margin-top: 8px;
                    display: none;
                }
                .conversations-result-bar.visible { display: block; }

                /* 会话列表样式 */
                .conversations-list {
                    width: calc(100% - 8px); /* 留出边距给高亮效果 */
                    margin-left: 4px;
                    margin-right: 4px;
                    padding: 8px;
                    background: var(--gh-bg-secondary);
                    border: 2px solid var(--gh-border-active);
                    border-top: none;
                    border-radius: 0 0 8px 8px;
                    margin-top: -4px; /* 与文件夹项视觉连接 */
                    margin-bottom: 4px;
                    max-height: 300px;
                    overflow-y: auto;
                    overflow-x: hidden;
                    scrollbar-width: none; /* Firefox */
                    -ms-overflow-style: none; /* IE/Edge */
                }
                .conversations-list::-webkit-scrollbar { display: none; } /* Chrome */
                .conversations-list-empty {
                    padding: 12px; color: #9ca3af; font-size: 13px; text-align: center;
                }
                .conversations-item {
                    display: flex; align-items: center;
                    padding: 8px 12px;
                    margin-bottom: 4px; /* Card Layout: Spacing */
                    border-radius: 6px; /* Card Layout: Radius */
                    background: var(--gh-bg, white);  /* Card Layout: White Background */
                    cursor: pointer;
                    transition: all 0.2s;
                    gap: 8px;
                    position: relative;
                    /* border-bottom removed for card style */
                }
                .conversations-item:hover {
                    background: var(--gh-hover, #f3f4f6); /* Slightly darker on hover */
                }
                /* Rounded Blue Bar on Hover */
                .conversations-item::before {
                    content: '';
                    position: absolute;
                    left: 0;
                    top: 50%;
                    transform: translateY(-50%) scaleY(0);
                    width: 4px;
                    height: 80%;
                    background-color: #428cf1;
                    border-radius: 0 4px 4px 0; /* 右侧圆角，左侧贴边 */
                    transition: transform 0.2s;
                }
                .conversations-item:hover::before {
                    transform: translateY(-50%) scaleY(1);
                }

                .conversations-item-title {
                    flex: 1;
                    min-width: 0;
                    font-size: 14px; color: var(--gh-text, #374151);
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                /* Tags Container */
                .conversations-tag-list {
                    display: flex; gap: 4px; border: none; padding: 0; margin: 0;
                    flex-shrink: 0;
                    max-width: 35%;
                    overflow: hidden;
                }
                .conversations-item-meta {
                    display: flex; align-items: center; gap: 8px; flex-shrink: 0;
                    margin-left: auto;
                }
                .conversations-item-time {
                    font-size: 11px; color: #9ca3af; flex-shrink: 0;
                }
                .conversations-item-menu-btn {
                    width: 20px; height: 20px; border: none; background: transparent;
                    color: #9ca3af; cursor: pointer; border-radius: 4px; font-size: 12px;
                    opacity: 0; transition: opacity 0.2s; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
                }
                .conversations-item:hover .conversations-item-menu-btn { opacity: 1; }
                .conversations-item-menu-btn:hover { background: var(--gh-border, #e5e7eb); color: var(--gh-text, #374151); }
                .conversations-item-menu {
                    background: var(--gh-bg, white); border: 1px solid var(--gh-border, #e5e7eb); border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1000002; padding: 4px;
                    min-width: 120px;
                }
                .conversations-item-menu button {
                    display: block; width: 100%; padding: 8px 12px; border: none; background: none;
                    text-align: left; font-size: 13px; color: var(--gh-text, #374151); cursor: pointer; border-radius: 4px;
                }
                .conversations-item-menu button:hover { background: var(--gh-hover, #f3f4f6); }
                .conversations-item-menu button.danger { color: #dc2626; }
                .conversations-item-menu button.danger:hover { background: #fef2f2; }

                /* 定位高亮动画 */
                .conversations-item.locate-highlight {
                    background: var(--gh-outline-locate-bg) !important;
                    border: 2px solid var(--gh-outline-locate-border) !important;
                    border-radius: 6px;
                    box-shadow: inset 0 0 8px var(--gh-outline-locate-shadow);
                    animation: conversationsLocatePulse 0.6s ease-in-out 2;
                }
                @keyframes conversationsLocatePulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.01); }
                }

                /* 复选框样式 */
                .conversations-folder-checkbox {
                    margin-right: 8px; width: 16px; height: 16px; cursor: pointer;
                    accent-color: var(--gh-checkbox-bg, #4f46e5); flex-shrink: 0;
                }
                .conversations-item-checkbox {
                    width: 16px; height: 16px; margin-right: 8px; cursor: pointer;
                    accent-color: var(--gh-checkbox-bg, #4f46e5); flex-shrink: 0;
                }

                /* 底部批量操作栏 */
                .conversations-batch-bar {
                    position: sticky; bottom: 0; left: 0; right: 0;
                    background: var(--gh-bg, white);
                    padding: 8px 12px; display: flex; align-items: center; justify-content: space-between;
                    border-radius: 8px; margin-top: 8px;
                    border: 1px solid var(--gh-border, #e5e7eb);
                    box-shadow: 0 -2px 10px rgba(0,0,0,0.05);
                }
                .conversations-batch-info {
                    color: var(--gh-text, #374151); font-size: 13px; font-weight: 500;
                }
                .conversations-batch-btns {
                    display: flex; gap: 8px;
                }
                .conversations-batch-btn {
                    padding: 4px 10px; border: 1px solid var(--gh-input-border, #d1d5db); border-radius: 6px;
                    font-size: 12px; cursor: pointer; transition: all 0.2s;
                    background: var(--gh-hover, #f3f4f6); color: var(--gh-text, #374151);
                }
                .conversations-batch-btn:hover { background: var(--gh-border, #e5e7eb); border-color: #9ca3af; }
                .conversations-batch-btn.danger { background: #fee2e2; color: #dc2626; border-color: #fecaca; }
                .conversations-batch-btn.danger:hover { background: #fecaca; border-color: #f87171; }
                .conversations-batch-btn.cancel { background: transparent; border: none; color: var(--gh-text-secondary, #6b7280); }
                .conversations-batch-btn.cancel:hover { background: var(--gh-hover, #f3f4f6); color: var(--gh-text, #374151); border: none; }

                /* 会话对话框样式 */
                .conversations-dialog-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.5); z-index: 1000003;
                    display: flex; align-items: center; justify-content: center;
                }
                .conversations-dialog {
                    background: var(--gh-bg, white); border-radius: 12px; padding: 20px; min-width: 320px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                }
                .conversations-dialog-title {
                    font-size: 16px; font-weight: 600; color: var(--gh-text, #1f2937); margin-bottom: 16px;
                }
                .conversations-dialog-message {
                    font-size: 14px; color: #4b5563; margin-bottom: 20px; line-height: 1.5;
                    white-space: pre-line;
                }
                .conversations-dialog-section {
                    margin-bottom: 16px;
                }
                .conversations-dialog-section label {
                    display: block; font-size: 13px; color: var(--gh-text-secondary, #6b7280); margin-bottom: 8px;
                }
                .conversations-dialog-input {
                    width: 100%; padding: 10px 12px; border: 1px solid var(--gh-input-border, #d1d5db); border-radius: 8px;
                    font-size: 14px; box-sizing: border-box;
                    background: var(--gh-input-bg, #ffffff); color: var(--gh-text, #1f2937);
                }
                .conversations-dialog-input:focus {
                    outline: none; border-color: #4285f4; box-shadow: 0 0 0 2px rgba(66,133,244,0.1);
                }
                .conversations-dialog-buttons {
                    display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;
                }
                .conversations-dialog-btn {
                    padding: 8px 16px; border-radius: 8px; font-size: 14px; cursor: pointer; transition: all 0.2s;
                }
                .conversations-dialog-btn.cancel {
                    border: 1px solid var(--gh-input-border, #d1d5db); background: var(--gh-bg, white); color: var(--gh-text, #374151);
                }
                .conversations-dialog-btn.cancel:hover { background: var(--gh-hover, #f3f4f6); }
                .conversations-dialog-btn.confirm {
                    border: 1px solid rgba(255,255,255,0.2); background: var(--gh-header-bg); color: white;
                }
                .conversations-dialog-btn.confirm:hover { opacity: 0.9; }

                /* 文件夹选择列表 */
                .conversations-folder-select-list {
                    max-height: 250px; overflow-y: auto; margin: 12px 0;
                }
                .conversations-folder-select-item {
                    padding: 12px 16px; border-radius: 8px; cursor: pointer;
                    transition: all 0.2s; font-size: 14px;
                }
                .conversations-folder-select-item:hover {
                    background: var(--gh-hover, #f3f4f6);
                }

                /* Emoji 选择器 */
                .conversations-emoji-picker {
                    display: flex; flex-wrap: wrap; gap: 4px;
                }
                .conversations-emoji-btn {
                    width: 36px; height: 36px; border: 1px solid var(--gh-border, #e5e7eb); border-radius: 8px;
                    background: var(--gh-bg-secondary, #f9fafb); font-size: 18px; cursor: pointer; transition: all 0.2s;
                }
                .conversations-emoji-btn:hover { background: var(--gh-hover, #f3f4f6); border-color: var(--gh-input-border, #d1d5db); }
                .conversations-emoji-btn.selected {
                    background: #e0e7ff; border-color: #4285f4; box-shadow: 0 0 0 2px rgba(66,133,244,0.2);
                }

                /* 分类管理按钮 */
                .category-manage-btn {
                    padding: 4px 8px; background: transparent; border: 1px dashed #9ca3af; border-radius: 12px;
                    font-size: 12px; color: var(--gh-text-secondary, #6b7280); cursor: pointer; transition: all 0.2s; margin-left: 4px;
                }
                .category-manage-btn:hover { background: var(--gh-hover, #f3f4f6); border-color: var(--gh-text-secondary, #6b7280); color: var(--gh-text, #374151); }
                /* 分类管理弹窗 */
                .category-modal-content { max-height: 400px; }
                .category-list { max-height: 280px; overflow-y: auto; margin: 16px 0; }
                .category-item {
                    display: flex; align-items: center; justify-content: space-between; padding: 12px 16px;
                    background: var(--gh-bg-secondary, #f9fafb); border-radius: 8px; margin-bottom: 8px; transition: all 0.2s;
                }
                .category-item:hover { background: var(--gh-hover, #f3f4f6); }
                .category-item-info { display: flex; align-items: center; gap: 12px; flex: 1; }
                .category-item-name { font-weight: 500; color: var(--gh-text, #1f2937); font-size: 14px; }
                .category-item-count { font-size: 12px; color: var(--gh-text-secondary, #6b7280); background: var(--gh-border, #e5e7eb); padding: 2px 8px; border-radius: 10px; }
                .category-item-actions { display: flex; gap: 8px; }
                .category-action-btn {
                    padding: 4px 10px; border-radius: 4px; font-size: 12px; cursor: pointer; border: none; transition: all 0.2s;
                }
                .category-action-btn.rename { background: #dbeafe; color: #1d4ed8; }
                .category-action-btn.rename:hover { background: #bfdbfe; }
                .category-action-btn.delete { background: #fee2e2; color: #dc2626; }
                .category-action-btn.delete:hover { background: #fecaca; }
                .category-empty { text-align: center; color: #9ca3af; padding: 40px 0; font-size: 14px; }
                /* Tab 切换栏 */
                .prompt-panel-tabs {
                    display: flex; background: var(--gh-bg-secondary, #f9fafb); border-bottom: 1px solid var(--gh-border, #e5e7eb);
                }
                .prompt-panel-tab {
                    flex: 1; padding: 10px 16px; background: transparent; border: none;
                    font-size: 13px; font-weight: 500; color: var(--gh-text-secondary, #6b7280); cursor: pointer;
                    transition: all 0.2s; border-bottom: 2px solid transparent;
                }
                .prompt-panel-tab:hover { color: var(--gh-text, #374151); background: var(--gh-hover, #f3f4f6); }
                .prompt-panel-tab.active {
                    color: ${colors.primary}; border-bottom-color: ${colors.primary}; background: var(--gh-bg, white);
                }
                /* 面板内容区 */
                .prompt-panel-content { display: flex; flex-direction: column; flex: 1; overflow: hidden; min-height: 280px; }
                .prompt-panel-content.hidden { display: none; }
                /* 设置面板样式 - 合并优化 */
                .settings-content { padding: 16px; overflow-y: auto; flex: 1; scrollbar-width: none; -ms-overflow-style: none; }
                .settings-content::-webkit-scrollbar { display: none; }
                .settings-section { margin-bottom: 24px; }
                .settings-section-title {
                    font-size: 12px; font-weight: 600; color: var(--gh-text-secondary, #6b7280); margin-bottom: 8px;
                    text-transform: uppercase; letter-spacing: 0.5px; padding-left: 4px; border-bottom: none;
                }
                .setting-item {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 12px; background: var(--gh-bg-secondary, #f9fafb); border-radius: 8px; margin-bottom: 8px;
                    border: 1px solid var(--gh-hover, #f3f4f6); transition: all 0.2s;
                }
                .setting-item:hover { border-color: linear-gradient(135deg, #4285f4 0%, #34a853 100%); background: var(--gh-bg, white); box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .setting-item-info { flex: 1; margin-right: 12px; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
                .setting-item-label { font-size: 14px; font-weight: 500; color: var(--gh-text, #374151); margin-bottom: 2px; white-space: nowrap; }
                .setting-item-desc { font-size: 12px; color: #9ca3af; line-height: 1.3; }
                .setting-controls { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
                .setting-select {
                    padding: 6px 8px; border: 1px solid var(--gh-input-border, #d1d5db); border-radius: 6px; font-size: 13px;
                    color: var(--gh-text, #374151); background: var(--gh-bg, white); outline: none; transition: all 0.2s; height: 32px; box-sizing: border-box;
                    min-width: 100px;
                }
                .setting-select:focus { border-color: #4285f4; box-shadow: 0 0 0 2px rgba(66,133,244,0.1); }
                .setting-toggle {
                    width: 44px; height: 24px; background: var(--gh-input-border, #d1d5db); border-radius: 12px; position: relative;
                    cursor: pointer; transition: all 0.3s; flex-shrink: 0;
                }
                .setting-toggle::after {
                    content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
                    background: var(--gh-bg, white); border-radius: 50%; transition: all 0.3s; box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }
                .setting-toggle.active { background: #4285f4; } /* 默认蓝色，会被JS覆盖 */
                .setting-toggle.active::after { left: 22px; }

                /* 大纲面板样式 */
                .outline-content {
                    display: flex; flex-direction: column; flex: 1; min-height: 200px; user-select: none; overflow: hidden;
                }
                /* 大纲固定工具栏 */
                .outline-fixed-toolbar {
                    padding: 10px 12px; background: var(--gh-bg-secondary, #f9fafb); border-bottom: 1px solid var(--gh-border, #e5e7eb);
                    flex-shrink: 0; display: flex; flex-direction: column; gap: 8px;
                }
                .outline-toolbar-row {
                    display: flex; align-items: center; gap: 4px;
                }
                .outline-toolbar-btn {
                    width: 26px; height: 26px; border: 1px solid var(--gh-input-border, #d1d5db); border-radius: 6px;
                    background: var(--gh-bg, white); color: var(--gh-text-secondary, #6b7280); cursor: pointer; display: flex;
                    align-items: center; justify-content: center; font-size: 14px;
                    transition: all 0.2s; flex-shrink: 0;
                }
                .outline-toolbar-btn:hover { border-color: var(--gh-border-active); color: var(--gh-border-active); background: var(--gh-folder-bg-default); }
                .outline-toolbar-btn.active { border-color: var(--gh-tag-active-bg); color: white; background: var(--gh-tag-active-bg); }
                .outline-search-input {
                    flex: 1; height: 28px; padding: 0 10px; border: 1px solid var(--gh-input-border, #d1d5db); border-radius: 6px;
                    font-size: 13px; color: var(--gh-text, #374151); outline: none; transition: all 0.2s;
                    background: var(--gh-input-bg, #ffffff);
                }
                .outline-search-input:focus { border-color: var(--gh-border-active); box-shadow: 0 0 0 2px rgba(66,133,244,0.1); }
                .outline-search-input::placeholder { color: #9ca3af; }
                .outline-search-clear {
                    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
                    width: 16px; height: 16px; border: none; background: var(--gh-input-border, #d1d5db); color: white;
                    border-radius: 50%; cursor: pointer; font-size: 10px; line-height: 16px; text-align: center;
                }
                .outline-search-clear:hover { background: #9ca3af; }
                .outline-search-wrapper { position: relative; flex: 1; display: flex; align-items: center; }

                /* 隐身模式：隐藏 Gemini Business 设置菜单 (防止切换主题时闪烁) */
                body.gh-stealth-mode md-menu,
                body.gh-stealth-mode md-menu-surface,
                body.gh-stealth-mode .mat-menu-panel,
                body.gh-stealth-mode [role="menu"] {
                    opacity: 0 !important;
                    pointer-events: none !important;
                }
                .outline-search-result { font-size: 12px; color: var(--gh-text-secondary, #6b7280); margin-left: 8px; white-space: nowrap; }
                .outline-result-bar {
                    padding: 6px 12px; background: #eff6ff; color: #1d4ed8; font-size: 12px;
                    border-bottom: 1px solid #dbeafe; text-align: center; flex-shrink: 0;
                    transition: all 0.3s;
                }
                /* 层级滑块 */
                .outline-level-slider-container {
                    display: flex; align-items: center; gap: 6px; width: 100%;
                }
                .outline-level-slider {
                    flex: 1; height: 4px; -webkit-appearance: none; appearance: none;
                    background: var(--gh-border, #e5e7eb); border-radius: 2px; outline: none; cursor: pointer;
                }
                .outline-level-slider::-webkit-slider-thumb {
                    -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
                    background: var(--gh-tag-active-bg); cursor: pointer; border: 2px solid var(--gh-bg);
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                }
                .outline-level-slider::-moz-range-thumb {
                    width: 14px; height: 14px; border-radius: 50%;
                    background: var(--gh-tag-active-bg); cursor: pointer; border: 2px solid var(--gh-bg);
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                }
                .outline-level-dots {
                    display: flex; justify-content: space-between; align-items: center;
                    position: relative; flex: 1; height: 24px;
                }
                .outline-level-dot {
                    width: 12px; height: 12px; border-radius: 50%; background: var(--gh-input-border, #d1d5db);
                    cursor: pointer; transition: all 0.2s; position: relative; z-index: 2;
                    border: 2px solid var(--gh-bg); box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                }
                .outline-level-dot:hover { background: var(--gh-tag-active-bg); transform: scale(1.2); }
                .outline-level-dot.active { background: var(--gh-tag-active-bg); }
                .outline-level-dot-tooltip {
                    position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
                    background: var(--gh-text, #374151); color: var(--gh-bg, white); padding: 4px 8px; border-radius: 4px;
                    font-size: 11px; white-space: nowrap; opacity: 0; visibility: hidden;
                    transition: all 0.2s; pointer-events: none; margin-bottom: 4px;
                }
                /* 第一个 dot 的 tooltip 向右对齐，防止溢出 */
                .outline-level-dot:first-child .outline-level-dot-tooltip { left: 0; transform: none; }
                .outline-level-dot:hover .outline-level-dot-tooltip { opacity: 1; visibility: visible; }
                .outline-level-line {
                    position: absolute; left: 10px; right: 10px; top: 50%; height: 4px;
                    background: var(--gh-border, #e5e7eb); transform: translateY(-50%); z-index: 1; border-radius: 2px;
                }
                .outline-level-progress {
                    position: absolute; left: 0; top: 0; height: 100%; background: var(--gh-tag-active-bg);
                    border-radius: 2px; transition: width 0.2s;
                }
                /* 大纲列表区 */
                .outline-list-wrapper { flex: 1; overflow-y: auto; padding: 8px 12px; }
                .outline-list { display: flex; flex-direction: column; gap: 2px; }
                .outline-item {
                    padding: 6px 10px 6px 10px; border-radius: 6px; cursor: pointer;
                    background: transparent; border: 1px solid transparent;
                    font-size: 13px; color: var(--gh-text, #374151); transition: all 0.15s;
                    display: flex; align-items: center; position: relative;
                }
                .outline-item:hover { background: var(--gh-hover, #f3f4f6); }
                .outline-item.highlight {
                    background: var(--gh-outline-locate-bg) !important;
                    border: 2px solid var(--gh-outline-locate-border) !important;
                    box-shadow: 0 0 10px var(--gh-outline-locate-shadow);
                    animation: outlineLocatePulse 0.6s ease-in-out 2;
                }
                @keyframes outlineLocatePulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.02); }
                }
                /* 同步滚动高亮（使用右边框，与用户问题左边框区分） */
                .outline-item.sync-highlight {
                    background: var(--gh-outline-sync-bg) !important;
                    border-right: 3px solid var(--gh-outline-sync-border) !important;
                    border-radius: 4px 0 0 4px;
                }
				.outline-item-toggle {
					width: 24px; min-width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center;
					color: #9ca3af; cursor: pointer; transition: all 0.2s ease;
					font-size: 16px; flex-shrink: 0; margin-right: 2px; box-sizing: border-box; border-radius: 4px;
				}
				.outline-item-toggle:hover { color: var(--gh-border-active); background-color: rgba(0,0,0,0.05); }
				.outline-item-toggle.expanded { transform: rotate(90deg); color: var(--gh-border-active); }
				.outline-item-toggle.invisible { opacity: 0; cursor: default; pointer-events: none; visibility: visible !important; display: inline-flex !important; }
				.outline-item-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 24px; }
                .outline-item.collapsed-children { display: none; }
                /* 大纲层级缩进 - 箭头跟随缩进，文字保持左对齐 */
                .outline-level-0 { padding-left: 2px; font-weight: 500; } /* 用户提问节点向左突出 */
                .outline-level-1 { padding-left: 10px; font-weight: 600; font-size: 14px; }
                .outline-level-2 { padding-left: 28px; font-weight: 500; }
                .outline-level-3 { padding-left: 46px; }
                .outline-level-4 { padding-left: 64px; font-size: 12px; }
                .outline-level-5 { padding-left: 82px; font-size: 12px; color: var(--gh-text-secondary, #6b7280); }
                .outline-level-6 { padding-left: 100px; font-size: 12px; color: #9ca3af; }
                /* 用户提问节点（Level 0） */
                .outline-item.user-query-node {
                    background: var(--user-query-bg, rgba(66, 133, 244, 0.08));
                    border-left: 3px solid var(--gh-border-active);
                    font-weight: 500;
                    padding-left: 8px !important;
                    /* 复制按钮使用绝对定位悬浮在文字上方，不需要预留空间 */
                    margin-top: 8px;
                    border-radius: 4px;
                }
                .outline-item.user-query-node:first-child { margin-top: 0; }
                /* 用户问题徽章：图标+角标数字 */
                .outline-item.user-query-node .user-query-badge {
                    position: relative; display: inline-flex; align-items: center; justify-content: center;
                    width: 24px; height: 24px; margin-right: 4px; flex-shrink: 0;
                }
                .outline-item.user-query-node .user-query-badge-icon {
                    font-size: 15px; line-height: 1; color: #9ca3af; /* Gray 400 - Softer */
                }
                .outline-item.user-query-node .user-query-badge-number {
                    position: absolute; bottom: -2px; right: -4px;
                    /* Compact Pill Shape */
                    min-width: 12px; height: 12px; padding: 0 2px;
                    font-size: 8px; font-weight: 700; line-height: 12px; text-align: center;
                    color: #4b5563; background: #ffffff;
                    border: 1px solid #e5e7eb; border-radius: 99px; /* Max radius for round/pill shape */
                    /* Refined Faux Cutout */
                    box-shadow: 0 0 0 1.5px #ffffff;
                    z-index: 10;
                }
                /* Dark Mode 适配 */
                body[data-gh-mode="dark"] .outline-item.user-query-node .user-query-badge-icon {
                    color: #6b7280; /* Gray 500 */
                }
                body[data-gh-mode="dark"] .outline-item.user-query-node .user-query-badge-number {
                    color: #e5e7eb; background: #374151; border-color: #4b5563;
                    box-shadow: 0 0 0 1.5px #1f2937;
                }
                /* 用户提问复制按钮 - 悬浮在文字上方 */
                .outline-item-copy-btn {
                    position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
                    width: 24px; height: 24px;
                    display: flex; align-items: center; justify-content: center;
                    color: #6b7280; cursor: pointer; border-radius: 4px;
                    opacity: 0; transition: all 0.2s ease;
                    background: var(--gh-bg, white); /* 不透明背景遮住文字 */
                }
                .outline-item:hover .outline-item-copy-btn { opacity: 1; }
                .outline-item-copy-btn:hover { color: var(--gh-border-active); background: var(--gh-hover, #f3f4f6); }
                .outline-item-copy-btn svg { width: 14px; height: 14px; }

                body[data-gh-mode="dark"] .outline-item-copy-btn {
                    background: var(--gh-bg, #1f2937);
                    color: #9ca3af;
                }
                body[data-gh-mode="dark"] .outline-item-copy-btn:hover { background: var(--gh-hover, #374151); }

                .outline-item.user-query-node:hover { background: var(--user-query-hover-bg, rgba(66, 133, 244, 0.15)); }
                .outline-empty { text-align: center; color: #9ca3af; padding: 40px 20px; font-size: 14px; }
                /* 大纲高亮效果 */
                .outline-highlight { animation: outlineHighlight 2s ease-out; }
                @keyframes outlineHighlight {
                    0% { background: rgba(66, 133, 244, 0.3); }
                    100% { background: transparent; }
                }

                /* 历史加载遮罩 */
                #gemini-helper-loading-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(255, 255, 255, 0.95);
                    z-index: 99999;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 16px;
                    color: #333;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                body[data-gh-mode="dark"] #gemini-helper-loading-overlay {
                    background: rgba(30, 31, 32, 0.95);
                    color: #e3e3e3;
                }
                #gemini-helper-loading-overlay .loading-spinner {
                    font-size: 48px;
                    animation: spin-anim 2s linear infinite;
                }
                @keyframes spin-anim {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                #gemini-helper-loading-overlay .loading-text {
                    font-size: 18px;
                    font-weight: 500;
                }
                #gemini-helper-loading-overlay .loading-hint {
                    font-size: 14px;
                    color: #666;
                }
                body[data-gh-mode="dark"] #gemini-helper-loading-overlay .loading-hint {
                    color: #999;
                }
                #gemini-helper-loading-overlay .loading-stop-btn {
                    margin-top: 12px;
                    padding: 8px 24px;
                    border-radius: 18px;
                    border: 1px solid rgba(128,128,128,0.3);
                    background: transparent;
                    color: inherit;
                    cursor: pointer;
                    font-size: 14px;
                    transition: background 0.2s;
                }
                #gemini-helper-loading-overlay .loading-stop-btn:hover {
                    background: rgba(128,128,128,0.1);
                }
            `;
            document.head.appendChild(style);
        }

        /**
         * 启动主题监听器 (Auto Dark Mode)
         */
        monitorTheme() {
            const panel = document.getElementById('gemini-helper-panel');
            if (!panel) return;

            const checkTheme = () => {
                // Refined Detection Logic: Priority Class > Data > Style
                const bodyClass = document.body.className;
                const hasDarkClass = /\bdark-theme\b/i.test(bodyClass);
                const hasLightClass = /\blight-theme\b/i.test(bodyClass);

                // 1. Explicit Class (Gemini Standard uses this)
                let isDark = false;
                if (hasDarkClass) {
                    isDark = true;
                } else if (hasLightClass) {
                    isDark = false;
                } else {
                    // 2. Data Attribute
                    const dataTheme = document.body.dataset.theme || document.documentElement.dataset.theme;
                    if (dataTheme === 'dark') {
                        isDark = true;
                    } else if (dataTheme === 'light') {
                        isDark = false;
                    } else {
                        // 3. Style color-scheme (Gemini Business uses this)
                        isDark = document.body.style.colorScheme === 'dark';
                    }
                }

                // 2. Sync to Plugin UI (ghMode) and color-scheme
                if (isDark) {
                    document.body.dataset.ghMode = 'dark';
                    // 同步 color-scheme，确保原生控件（如 checkbox）颜色一致
                    document.body.style.colorScheme = 'dark';
                } else {
                    delete document.body.dataset.ghMode;
                    // 同步 color-scheme，确保原生控件（如 checkbox）颜色一致
                    document.body.style.colorScheme = 'light';
                }

                // 3. Sync to Settings (Persistence) & Button Icon
                // Only update if changed to avoid redundant saves
                const currentSavedMode = this.settings.themeMode;
                const detectedMode = isDark ? 'dark' : 'light';

                // Avoid saving on every check, only if truly changed from what we think it is
                // But we need to distinguish between "detected change" and "just checking"
                // Actually, just save it if it's different.
                if (currentSavedMode !== detectedMode) {
                    this.settings.themeMode = detectedMode;
                    this.saveSettings();
                    // GM_setValue handled in saveSettings with site-scoped key
                }

                const themeBtns = [document.getElementById('theme-toggle-btn'), document.getElementById('quick-theme-btn')];
                themeBtns.forEach((themeBtn) => {
                    if (themeBtn) {
                        // Update icon using DOM methods (avoid TrustedHTML error)
                        const svgNS = 'http://www.w3.org/2000/svg';
                        const svg = document.createElementNS(svgNS, 'svg');
                        svg.setAttribute('xmlns', svgNS);
                        svg.setAttribute('height', '20px');
                        svg.setAttribute('viewBox', '0 -960 960 960');
                        svg.setAttribute('width', '20px');
                        svg.setAttribute('fill', '#FFFFFF');

                        const path = document.createElementNS(svgNS, 'path');
                        path.setAttribute(
                            'd',
                            isDark
                                ? 'M480-280q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480q0 83-58.5 141.5T480-280ZM200-440H40v-80h160v80Zm720 0H760v-80h160v80ZM440-760v-160h80v160h-80Zm0 720v-160h80v160h-80ZM256-650l-101-97 57-59 96 100-52 56Zm492 496-97-101 53-55 101 97-57 59Zm-98-550 97-101 59 57-100 96-56-52ZM154-212l101-97 55 53-97 101-59-57Z'
                                : 'M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Z',
                        );
                        svg.appendChild(path);

                        themeBtn.textContent = ''; // clear
                        themeBtn.appendChild(svg);
                    }
                });
            };

            checkTheme();

            if (!this.themeObserver) {
                this.themeObserver = new MutationObserver((mutations) => {
                    checkTheme();
                });
                // Listen to class changes on body (primary method), dataset attributes AND style
                this.themeObserver.observe(document.body, {
                    attributes: true,
                    attributeFilter: ['class', 'data-theme', 'style'],
                });
                this.themeObserver.observe(document.documentElement, {
                    attributes: true,
                    attributeFilter: ['data-theme'],
                });
            }
        }

        // 应用主题 (Web -> DOM)
        applyTheme(targetMode) {
            const mode = targetMode || this.settings.themeMode;
            if (!mode) return;

            if (mode === 'dark') {
                document.body.classList.add('dark-theme');
                document.body.classList.remove('light-theme'); // For standard version consistency
                document.body.style.colorScheme = 'dark'; // Force color-scheme for Business
            } else {
                document.body.classList.remove('dark-theme');
                document.body.style.colorScheme = 'light'; // Force color-scheme for Business
                // Only add light-theme if we are likely on Standard version (based on url or adapter)
                // Gemini Business uses empty class for light. Standard uses 'light-theme'.
                if (window.location.host === 'gemini.google.com') {
                    document.body.classList.add('light-theme');
                }
            }
        }

        // 切换主题 (User Action) - 带圆形扩散动画
        toggleTheme(event) {
            const bodyClass = document.body.className;
            // Also check style for robustness
            const isDark = /\bdark-theme\b/i.test(bodyClass) || document.body.style.colorScheme === 'dark';
            const nextMode = isDark ? 'light' : 'dark';

            // 计算动画起点坐标（从点击位置或默认右上角）
            let x = 95,
                y = 5;
            if (event && event.clientX !== undefined) {
                x = (event.clientX / window.innerWidth) * 100;
                y = (event.clientY / window.innerHeight) * 100;
            } else {
                // 尝试从主题按钮位置获取
                const themeBtn = document.getElementById('theme-toggle-btn') || document.getElementById('quick-theme-btn');
                if (themeBtn) {
                    const rect = themeBtn.getBoundingClientRect();
                    x = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
                    y = ((rect.top + rect.height / 2) / window.innerHeight) * 100;
                }
            }

            // 设置 CSS 变量
            document.documentElement.style.setProperty('--theme-x', `${x}%`);
            document.documentElement.style.setProperty('--theme-y', `${y}%`);

            // 执行主题切换的核心逻辑
            const doToggle = () => {
                // 优先使用适配器的原生切换逻辑 (针对 Gemini Business)
                if (typeof this.siteAdapter.toggleTheme === 'function') {
                    return this.siteAdapter.toggleTheme(nextMode).then((success) => {
                        if (!success) {
                            showToast('自动切换主题失败，请尝试在网页设置中手动切换');
                        }
                    });
                }
                this.applyTheme(nextMode);
            };

            // 使用 View Transitions API（如果浏览器支持）
            if (document.startViewTransition) {
                const transition = document.startViewTransition(() => {
                    doToggle();
                });

                // 应用自定义动画
                transition.ready.then(() => {
                    const animation = isDark ? 'themeReveal' : 'themeShrink';
                    document.documentElement.animate(
                        {
                            clipPath: isDark
                                ? ['circle(0% at var(--theme-x) var(--theme-y))', 'circle(150% at var(--theme-x) var(--theme-y))']
                                : ['circle(150% at var(--theme-x) var(--theme-y))', 'circle(0% at var(--theme-x) var(--theme-y))'],
                        },
                        {
                            duration: 800,
                            easing: 'ease-in-out',
                            pseudoElement: isDark ? '::view-transition-new(root)' : '::view-transition-old(root)',
                        },
                    );
                });
            } else {
                // 降级：直接切换
                doToggle();
            }
        }

        createUI() {
            const existingPanel = document.getElementById('gemini-helper-panel');
            const existingBar = document.querySelector('.selected-prompt-bar');
            const existingBtnGroup = document.getElementById('quick-btn-group');

            if (existingPanel) existingPanel.remove();
            if (existingBar) existingBar.remove();
            if (existingBtnGroup) existingBtnGroup.remove();

            const panel = createElement('div', {
                id: 'gemini-helper-panel',
                className: this.isCollapsed ? 'collapsed' : '',
            });

            // Header
            const header = createElement('div', { className: 'prompt-panel-header' });
            const title = createElement('div', { className: 'prompt-panel-title' });
            title.appendChild(createElement('span', {}, '✨'));
            title.appendChild(createElement('span', {}, this.t('panelTitle')));

            const controls = createElement('div', { className: 'prompt-panel-controls' });

            // 主题切换按钮 (SVG Icon) - Moved to Controls
            const themeBtn = createElement('button', {
                id: 'theme-toggle-btn',
                className: 'prompt-panel-btn',
                title: this.t('toggleTheme'),
                style: '', // use class style
            });
            // Initial icon state (Default to Light mode -> Show Moon for toggle to dark)
            const svgNS = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNS, 'svg');
            svg.setAttribute('xmlns', svgNS);
            svg.setAttribute('height', '20px');
            svg.setAttribute('viewBox', '0 -960 960 960');
            svg.setAttribute('width', '20px');
            svg.setAttribute('fill', '#FFFFFF');
            const path = document.createElementNS(svgNS, 'path');
            // Default Moon Icon (for Light Mode)
            path.setAttribute(
                'd',
                'M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q14 0 27.5 1t26.5 3q-41 29-65.5 75.5T444-660q0 90 63 153t153 63q55 0 101-24.5t75-65.5q2 13 3 26.5t1 27.5q0 150-105 255T480-120Z',
            );
            svg.appendChild(path);
            themeBtn.appendChild(svg);

            themeBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止冒泡，防止触发 Header 双击（隐私模式）
                this.toggleTheme();
            });
            themeBtn.addEventListener('dblclick', (e) => e.stopPropagation()); // 阻止双击冒泡
            controls.appendChild(themeBtn);

            const refreshBtn = createElement(
                'button',
                {
                    className: 'prompt-panel-btn',
                    id: 'refresh-prompts',
                    title: this.t('refreshPrompts'),
                },
                '⟳',
            );
            refreshBtn.addEventListener('click', () => {
                refreshBtn.classList.add('loading');
                // 根据当前 Tab 智能刷新
                if (this.currentTab === 'outline') {
                    this.refreshOutline();
                    showToast(this.t('refreshed'));
                } else if (this.currentTab === 'prompts') {
                    this.refreshPromptList();
                    showToast(this.t('refreshed'));
                } else if (this.currentTab === 'conversations') {
                    // 只刷新 UI 显示，不执行侧边栏同步
                    this.conversationManager?.createUI();
                    showToast(this.t('refreshed'));
                } else {
                    showToast(this.t('refreshed'));
                }
                setTimeout(() => refreshBtn.classList.remove('loading'), 500);
            });
            const toggleBtn = createElement(
                'button',
                {
                    className: 'prompt-panel-btn',
                    id: 'toggle-panel',
                    title: this.t('collapse'),
                },

                this.isCollapsed ? '+' : '−', // 根据初始状态设置图标
            );
            // 注意：toggleBtn 的事件监听在 bindEvents 中统一绑定，避免重复绑定
            // 新建标签页按钮
            // 新标签页按钮 (只有在设置开启且站点支持时显示)
            if (this.settings.tabSettings?.openInNewTab && this.siteAdapter.supportsNewTab()) {
                const newTabBtn = createElement(
                    'button',
                    {
                        className: 'prompt-panel-btn',
                        id: 'new-tab-btn',
                        title: this.t('newTabTooltip'),
                        style: 'margin-right: 2px;',
                    },
                    '+',
                );
                newTabBtn.addEventListener('click', () => {
                    const url = this.siteAdapter.getNewTabUrl();
                    if (url) {
                        window.open(url, '_blank');
                    }
                });
                controls.appendChild(newTabBtn);
            }

            // 设置按钮（固定在header，不占用Tab位置）
            const settingsBtn = createElement(
                'button',
                {
                    className: 'prompt-panel-btn',
                    id: 'settings-btn',
                    title: this.t('tabSettings'),
                },
                '⚙',
            );
            settingsBtn.addEventListener('click', () => {
                if (this.currentTab === 'settings') {
                    // 已在设置页，返回上一个 Tab（默认提示词）
                    this.switchTab(this.previousTab || 'prompts');
                } else {
                    // 记住当前 Tab，进入设置
                    this.previousTab = this.currentTab;
                    this.switchTab('settings');
                }
            });

            controls.appendChild(settingsBtn);
            controls.appendChild(refreshBtn);
            controls.appendChild(toggleBtn);

            header.appendChild(title);
            header.appendChild(controls);

            // 双击面板标题切换隐私模式 (Boss Key)
            title.style.cursor = 'pointer';
            title.addEventListener('dblclick', () => {
                if (this.tabRenameManager) {
                    const isPrivate = this.tabRenameManager.togglePrivacyMode();
                    this.saveSettings();
                    // 同步设置面板中的隐私模式开关状态
                    const privacyToggle = document.getElementById('toggle-privacy-mode');
                    if (privacyToggle) {
                        privacyToggle.classList.toggle('active', isPrivate);
                    }
                    // 同步伪装标题输入框的禁用状态
                    const privacyTitleItem = privacyToggle?.closest('.setting-item')?.nextElementSibling;
                    if (privacyTitleItem && privacyTitleItem.classList.contains('setting-item')) {
                        const privacyTitleInput = privacyTitleItem.querySelector('input');
                        if (privacyTitleInput) {
                            privacyTitleInput.disabled = !isPrivate;
                            privacyTitleItem.style.opacity = isPrivate ? '1' : '0.5';
                            privacyTitleItem.style.pointerEvents = isPrivate ? 'auto' : 'none';
                        }
                    }
                    showToast(isPrivate ? '🔒 隐私模式已开启' : '🔓 隐私模式已关闭');
                }
            });

            // Tab 栏
            const tabs = createElement('div', { className: 'prompt-panel-tabs' });

            // 根据设置的顺序渲染 Tab
            const tabOrder = this.settings.tabOrder || DEFAULT_TAB_ORDER;

            // 确保所有 Tab 都存在（防止新版本新增 Tab 或配置丢失）
            const allTabs = new Set([...tabOrder, ...DEFAULT_TAB_ORDER]);
            // 过滤掉未定义的 Tab ID
            const validTabs = Array.from(allTabs).filter((id) => TAB_DEFINITIONS[id]);

            validTabs.forEach((tabId) => {
                const def = TAB_DEFINITIONS[tabId];

                // 特殊处理：如果大纲被禁用，添加 hidden 类，但仍然渲染（为了保持 DOM 结构一致性，或者稍后在 switchTab 处理可见性）
                // 这里稍微调整逻辑：创建 button，初始 class 根据状态决定
                let className = 'prompt-panel-tab';
                if (this.currentTab === tabId) className += ' active';

                // 大纲特殊显隐逻辑
                if (tabId === 'outline' && !this.settings.outline?.enabled) {
                    className += ' hidden';
                }
                // 提示词特殊显隐逻辑
                if (tabId === 'prompts' && !this.settings.prompts?.enabled) {
                    className += ' hidden';
                }
                // 会话特殊显隐逻辑
                if (tabId === 'conversations' && this.settings.conversations?.enabled === false) {
                    className += ' hidden';
                }

                // 设置 Tab 不在这里渲染（已移动到 header 按钮）
                if (tabId === 'settings') return;

                const btn = createElement('button', {
                    className: className,
                    'data-tab': tabId,
                    id: `${tabId}-tab`,
                });

                // 图标 + 文字
                btn.appendChild(createElement('span', { style: 'margin-right: 4px;' }, def.icon));
                btn.appendChild(document.createTextNode(this.t(def.labelKey)));
                // btn.appendChild(document.createTextNode(this.t(def.labelKey)));

                btn.addEventListener('click', () => this.switchTab(tabId));
                tabs.appendChild(btn);
            });

            panel.appendChild(header);
            panel.appendChild(tabs);

            // 内容容器需按固定顺序创建（DOM 结构不受 Tab 顺序影响，只影响 Tab 按钮顺序）
            // 1. 提示词面板内容区
            const promptsContent = createElement('div', {
                className: `prompt-panel-content${this.currentTab === 'prompts' ? '' : ' hidden'}`,
                id: 'prompts-content',
            });

            const searchBar = createElement('div', { className: 'prompt-search-bar' });
            const searchInput = createElement('input', {
                className: 'prompt-search-input',
                id: 'prompt-search',
                type: 'text',
                placeholder: this.t('searchPlaceholder'),
            });
            searchBar.appendChild(searchInput);

            const categories = createElement('div', { className: 'prompt-categories', id: 'prompt-categories' });
            const list = createElement('div', { className: 'prompt-list', id: 'prompt-list' });

            const addBtn = createElement('button', { className: 'add-prompt-btn', id: 'add-prompt' });
            addBtn.appendChild(createElement('span', {}, '+'));
            addBtn.appendChild(createElement('span', {}, this.t('addPrompt')));

            promptsContent.appendChild(searchBar);
            promptsContent.appendChild(categories);
            promptsContent.appendChild(list);
            promptsContent.appendChild(addBtn);

            // 2. 大纲面板内容区
            const outlineContent = createElement('div', {
                className: `prompt-panel-content${this.currentTab === 'outline' ? '' : ' hidden'}`,
                id: 'outline-content',
            });
            // 初始化大纲管理器
            this.outlineManager = new OutlineManager({
                container: outlineContent,
                settings: this.settings,
                siteAdapter: this.siteAdapter, // 传入 siteAdapter 用于定位功能
                onSettingsChange: () => this.saveSettings(),
                onJumpBefore: () => this.anchorManager.setAnchor(this.scrollManager.scrollTop),
                i18n: (k) => this.t(k),
            });
            // 如果大纲是当前激活的 tab，立即启用 Observer
            if (this.currentTab === 'outline') {
                this.outlineManager.setActive(true);
            }

            // 3. 会话面板内容区
            const conversationsContent = createElement('div', {
                className: `prompt-panel-content${this.currentTab === 'conversations' ? '' : ' hidden'}`,
                id: 'conversations-content',
            });
            // 初始化会话管理器
            this.conversationManager = new ConversationManager({
                container: conversationsContent,
                settings: this.settings,
                siteAdapter: this.siteAdapter,
                i18n: (k) => this.t(k),
            });
            // 如果会话是当前激活的 tab，立即启用
            if (this.currentTab === 'conversations') {
                this.conversationManager.setActive(true);
            }

            // 4. 设置面板内容区
            const settingsContent = createElement('div', {
                className: `prompt-panel-content${this.currentTab === 'settings' ? '' : ' hidden'}`,
                id: 'settings-content',
            });
            this.createSettingsContent(settingsContent);

            panel.appendChild(promptsContent);
            panel.appendChild(outlineContent);
            panel.appendChild(conversationsContent);
            panel.appendChild(settingsContent);

            document.body.appendChild(panel);

            // 选中提示词悬浮条
            const selectedBar = createElement('div', { className: 'selected-prompt-bar', style: 'user-select: none;' });
            selectedBar.appendChild(createElement('span', { style: 'user-select: none;' }, this.t('currentPrompt')));
            selectedBar.appendChild(
                createElement('span', {
                    className: 'selected-prompt-text',
                    id: 'selected-prompt-text',
                    style: 'user-select: none;',
                }),
            );
            const clearBtn = createElement('button', { className: 'clear-prompt-btn', id: 'clear-prompt' }, '×');
            selectedBar.appendChild(clearBtn);
            document.body.appendChild(selectedBar);

            // 统一侧边按钮组
            const quickBtnGroup = createElement('div', {
                className: 'quick-btn-group' + (this.isCollapsed ? ' collapsed' : ''),
                id: 'quick-btn-group',
            });

            // 按钮工厂函数
            const createQuickButton = (id, def, enabled, extraClass = '') => {
                // 禁用的按钮添加 btn-disabled 类（CSS 中设置 display: none !important）
                const disabledClass = enabled ? '' : ' btn-disabled';
                const btn = createElement(
                    'button',
                    {
                        className: 'quick-prompt-btn' + (extraClass ? ' ' + extraClass : '') + disabledClass,
                        id: id === 'anchor' ? 'quick-anchor-btn' : id === 'theme' ? 'quick-theme-btn' : undefined,
                        title: this.t(def.labelKey),
                    },
                    def.icon,
                );

                // 锚点按钮初始状态置灰
                if (id === 'anchor') {
                    btn.style.opacity = '0.4';
                    btn.style.cursor = 'default';
                    btn.title = '暂无锚点';
                }

                return btn;
            };

            // 创建手动锚点按钮组
            const createManualAnchorGroup = (enabled) => {
                const fragment = document.createDocumentFragment();
                const disabledClass = enabled ? '' : ' btn-disabled';

                const setAnchorBtn = createElement(
                    'button',
                    {
                        className: 'quick-prompt-btn manual-anchor-btn set-btn' + disabledClass,
                        id: 'manual-anchor-set-btn',
                        title: this.t('setAnchor'),
                    },
                    '📍',
                );
                setAnchorBtn.addEventListener('click', () => this.setAnchorManually());
                fragment.appendChild(setAnchorBtn);

                const backAnchorBtn = createElement(
                    'button',
                    {
                        className: 'quick-prompt-btn manual-anchor-btn back-btn' + disabledClass,
                        id: 'manual-anchor-back-btn',
                        title: this.t('noAnchor'),
                    },
                    '↩',
                );
                backAnchorBtn.addEventListener('click', () => {
                    if (this.savedAnchorTop !== null) {
                        this.backToManualAnchor();
                    }
                });
                fragment.appendChild(backAnchorBtn);

                const clearAnchorBtn = createElement(
                    'button',
                    {
                        className: 'quick-prompt-btn manual-anchor-btn clear-btn' + disabledClass,
                        id: 'manual-anchor-clear-btn',
                        title: this.t('clearAnchor'),
                    },
                    '✕',
                );
                clearAnchorBtn.addEventListener('click', () => {
                    if (this.savedAnchorTop !== null) {
                        this.clearAnchorManually();
                    }
                });
                fragment.appendChild(clearAnchorBtn);

                return fragment;
            };

            // 事件处理器
            const buttonActions = {
                scrollTop: () => this.scrollToTop(),
                scrollBottom: () => this.scrollToBottom(),
                panel: () => this.togglePanel(),
                anchor: () => this.handleAnchorClick(),
                theme: (e) => {
                    e.stopPropagation();
                    this.toggleTheme();
                },
            };

            // 保存按钮引用
            const quickButtons = {};

            // 根据配置动态创建按钮
            const btnOrder = this.settings.collapsedButtonsOrder || DEFAULT_COLLAPSED_BUTTONS_ORDER;

            // 智能分隔线逻辑
            // 跟踪上一个实际渲染的按钮（禁用的按钮不计入）
            let prevRenderedType = null; // 'panelOnly' | 'always' | null
            let prevRenderedId = null;
            let isFirstRendered = true;

            btnOrder.forEach((btnConfig, index) => {
                const def = COLLAPSED_BUTTON_DEFS[btnConfig.id];
                if (!def) return;

                const isEnabled = def.canToggle ? btnConfig.enabled : true;
                const currentType = def.isPanelOnly ? 'panelOnly' : 'always';

                // 如果按钮被禁用，跳过（不渲染，不更新状态）
                if (!isEnabled) {
                    return;
                }

                // === 智能分隔线插入 ===
                // 规则1: 当类型从 always 切换到 panelOnly 时，插入 panel-only 分隔线
                // 规则2: 当类型从 panelOnly 切换到 always 时，插入常显分隔线
                // 规则3: manualAnchor 特殊处理 - 上面需要分隔线（除非是第一个渲染的按钮）
                if (!isFirstRendered && prevRenderedType !== null) {
                    // manualAnchor 上方需要分隔线（始终是常显的，因为 manualAnchor 本身是常显按钮）
                    if (btnConfig.id === 'manualAnchor') {
                        quickBtnGroup.appendChild(createElement('div', { className: 'divider' }));
                    }
                    // 上一个是 manualAnchor，需要分隔线
                    else if (prevRenderedId === 'manualAnchor') {
                        // 分隔线类型取决于当前按钮
                        const dividerClass = currentType === 'panelOnly' ? 'divider panel-only' : 'divider';
                        quickBtnGroup.appendChild(createElement('div', { className: dividerClass }));
                    }
                    // 类型切换时插入分隔线
                    else if (prevRenderedType !== currentType) {
                        // 分隔线类型：如果下一个是 panelOnly 区域，分隔线也是 panel-only
                        const dividerClass = currentType === 'panelOnly' ? 'divider panel-only' : 'divider';
                        quickBtnGroup.appendChild(createElement('div', { className: dividerClass }));
                    }
                }

                // === 创建按钮 ===
                if (btnConfig.id === 'manualAnchor') {
                    // 手动锚点是一组按钮
                    quickBtnGroup.appendChild(createManualAnchorGroup(isEnabled));
                } else {
                    // 普通按钮
                    const extraClass = def.isPanelOnly ? 'panel-only' : '';
                    const btn = createQuickButton(btnConfig.id, def, isEnabled, extraClass);
                    quickButtons[btnConfig.id] = btn;
                    quickBtnGroup.appendChild(btn);
                }

                // 更新状态（仅对实际渲染的按钮）
                prevRenderedType = currentType;
                prevRenderedId = btnConfig.id;
                isFirstRendered = false;
            });

            // 绑定事件
            Object.keys(quickButtons).forEach((id) => {
                const btn = quickButtons[id];
                const action = buttonActions[id];
                if (action) {
                    btn.addEventListener('click', action);
                }
            });

            document.body.appendChild(quickBtnGroup);

            // 快捷跳转按钮组 - 放在面板底部
            const scrollNavContainer = createElement('div', {
                className: 'scroll-nav-container',
                id: 'scroll-nav-container',
            });
            const navScrollTopBtn = createElement('button', {
                className: 'scroll-nav-btn',
                id: 'scroll-top-btn',
                title: this.t('scrollTop'),
            });
            navScrollTopBtn.appendChild(createElement('span', {}, '⬆'));
            navScrollTopBtn.appendChild(createElement('span', {}, this.t('scrollTop')));

            const navAnchorBtn = createElement('button', {
                className: 'scroll-nav-btn icon-only',
                id: 'scroll-anchor-btn',
                title: '暂无锚点',
                style: 'opacity: 0.4; cursor: default;',
            });
            navAnchorBtn.appendChild(createElement('span', {}, '⚓'));

            const navScrollBottomBtn = createElement('button', {
                className: 'scroll-nav-btn',
                id: 'scroll-bottom-btn',
                title: this.t('scrollBottom'),
            });
            navScrollBottomBtn.appendChild(createElement('span', {}, '⬇'));
            navScrollBottomBtn.appendChild(createElement('span', {}, this.t('scrollBottom')));

            navScrollTopBtn.addEventListener('click', () => this.scrollToTop());
            navAnchorBtn.addEventListener('click', () => this.handleAnchorClick());
            navScrollBottomBtn.addEventListener('click', () => this.scrollToBottom());

            scrollNavContainer.appendChild(navScrollTopBtn);
            scrollNavContainer.appendChild(navAnchorBtn);
            scrollNavContainer.appendChild(navScrollBottomBtn);
            panel.appendChild(scrollNavContainer);

            this.refreshCategories();
            this.refreshPromptList();

            // 初始化锚点按钮状态
            setTimeout(() => {
                this.updateAnchorButtonState(this.anchorManager.hasAnchor());
                this.updateManualAnchorButtonState(this.savedAnchorTop !== null);
            }, 0);
        }

        // Tab 切换
        switchTab(tabName) {
            this.currentTab = tabName;

            // 更新 Tab 激活状态
            document.querySelectorAll('.prompt-panel-tab').forEach((tab) => {
                tab.classList.toggle('active', tab.dataset.tab === tabName);
            });

            // 更新设置按钮激活状态
            const settingsBtn = document.getElementById('settings-btn');
            if (settingsBtn) {
                settingsBtn.classList.toggle('active', tabName === 'settings');
            }

            // 切换内容区
            document.getElementById('prompts-content')?.classList.toggle('hidden', tabName !== 'prompts');
            document.getElementById('outline-content')?.classList.toggle('hidden', tabName !== 'outline');
            document.getElementById('conversations-content')?.classList.toggle('hidden', tabName !== 'conversations');
            document.getElementById('settings-content')?.classList.toggle('hidden', tabName !== 'settings');

            // 通知 OutlineManager 激活状态（用于控制自动更新显隐）
            if (this.outlineManager) {
                this.outlineManager.setActive(tabName === 'outline');
            }

            // 通知 ConversationManager 激活状态
            if (this.conversationManager) {
                this.conversationManager.setActive(tabName === 'conversations');
            }

            // 更新刷新按钮的提示
            const refreshBtn = document.getElementById('refresh-prompts');
            if (refreshBtn) {
                const titleMap = {
                    prompts: this.t('refreshPrompts'),
                    outline: this.t('refreshOutline'),
                    conversations: this.t('conversationsRefresh'),
                    settings: this.t('refreshSettings'),
                };
                refreshBtn.title = titleMap[tabName] || this.t('refresh');
            }

            // 切换到大纲时自动刷新
            if (tabName === 'outline') {
                this.refreshOutline();
            }
        }

        // 刷新大纲
        refreshOutline() {
            if (!this.settings.outline?.enabled) return;
            const showUserQueries = this.settings.outline?.showUserQueries || false;
            const outline = this.siteAdapter.extractOutline(6, showUserQueries);
            if (this.outlineManager) {
                this.outlineManager.update(outline);
            }
        }

        // 创建可折叠区域辅助方法
        createCollapsibleSection(title, content, options = {}) {
            const { defaultExpanded = false } = options;
            const section = createElement('div', { className: 'settings-section' });

            // 标题栏（可点击折叠/展开）
            const header = createElement('div', {
                className: 'settings-section-title',
                style: 'cursor: pointer; display: flex; justify-content: space-between; align-items: center; user-select: none;',
            });

            const headerLeft = createElement('div', { style: 'display: flex; align-items: center; gap: 6px;' });
            // 箭头
            const arrow = createElement(
                'span',
                {
                    style: 'font-size: 10px; color: #9ca3af; transition: transform 0.2s; display: inline-block;',
                    className: 'collapse-arrow',
                },
                '▶',
            );

            const headerTitle = createElement('span', {}, title);
            headerLeft.appendChild(arrow);
            headerLeft.appendChild(headerTitle);

            header.appendChild(headerLeft);
            // 如果有右侧元素（如开关状态提示等），可以扩展 options 传入，这里暂时留空

            section.appendChild(header);

            // 内容容器
            const contentContainer = createElement('div', {
                className: 'settings-accordion-content',
                style: `display: ${defaultExpanded ? 'block' : 'none'}; padding-top: 8px; animation: slideDown 0.2s;`,
            });
            contentContainer.appendChild(content);

            // 切换折叠状态
            let isExpanded = defaultExpanded;
            const updateState = () => {
                contentContainer.style.display = isExpanded ? 'block' : 'none';
                arrow.style.transform = isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
            };
            // 初始化状态
            if (defaultExpanded) arrow.style.transform = 'rotate(90deg)';

            header.addEventListener('click', () => {
                isExpanded = !isExpanded;
                updateState();
            });

            section.appendChild(contentContainer);
            return section;
        }

        // 创建设置面板内容
        createSettingsContent(container) {
            const content = createElement('div', { className: 'settings-content' });

            // 1. 语言设置 (保持在顶部)
            const langSection = createElement('div', { className: 'settings-section' });
            langSection.appendChild(createElement('div', { className: 'settings-section-title' }, this.t('settingsTitle')));

            const langItem = createElement('div', { className: 'setting-item' });
            const langInfo = createElement('div', { className: 'setting-item-info' });
            langInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('languageLabel')));
            langInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('languageDesc')));

            const langSelect = createElement('select', { className: 'setting-select', id: 'select-language' });
            const currentLang = GM_getValue(SETTING_KEYS.LANGUAGE, 'auto');
            [
                { value: 'auto', label: this.t('languageAuto') },
                { value: 'zh-CN', label: this.t('languageZhCN') },
                { value: 'zh-TW', label: this.t('languageZhTW') },
                { value: 'en', label: this.t('languageEn') },
            ].forEach((opt) => {
                const option = createElement('option', { value: opt.value }, opt.label);
                if (opt.value === currentLang) option.selected = true;
                langSelect.appendChild(option);
            });
            langSelect.addEventListener('change', () => {
                GM_setValue(SETTING_KEYS.LANGUAGE, langSelect.value);
                resetLanguageCache(); // 清除全局 t() 的语言缓存
                this.lang = detectLanguage();
                this.i18n = I18N[this.lang];
                this.createStyles();
                this.createUI();
                this.bindEvents();
                this.switchTab('settings');
                showToast(langSelect.value === 'auto' ? this.t('languageAuto') : langSelect.options[langSelect.selectedIndex].text);
            });

            langItem.appendChild(langInfo);
            langItem.appendChild(langSelect);
            langSection.appendChild(langItem);

            content.appendChild(langSection);

            // 2. 模型锁定设置 (可折叠)
            let lockSection = null;
            if (this.registry && this.registry.adapters) {
                const adaptersWithLock = this.registry.adapters;
                if (adaptersWithLock.length > 0) {
                    const lockContainer = createElement('div', {});
                    // 为每个站点生成配置行
                    adaptersWithLock.forEach((adapter) => {
                        const siteId = adapter.getSiteId();
                        const siteConfig = this.settings.modelLockConfig[siteId] || adapter.getDefaultLockSettings();

                        const row = createElement('div', {
                            className: 'site-lock-row',
                            style: 'display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--gh-hover, #f3f4f6);',
                        });

                        const leftCol = createElement('div', { style: 'display: flex; align-items: center; flex: 1; gap: 12px;' });
                        const nameLabel = createElement('div', { style: 'font-size: 14px; font-weight: 500; color: var(--gh-text, #374151); min-width: 80px;' }, adapter.getName());
                        const toggle = createElement('div', {
                            className: 'setting-toggle' + (siteConfig.enabled ? ' active' : ''),
                            style: 'transform: scale(0.8);',
                        });

                        leftCol.appendChild(nameLabel);
                        leftCol.appendChild(toggle);

                        const rightCol = createElement('div', {});
                        const keywordInput = createElement('input', {
                            type: 'text',
                            className: 'prompt-input-title',
                            value: siteConfig.keyword || '',
                            placeholder: this.t('modelKeywordPlaceholder'),
                            style: 'width: 80px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; text-align: center;',
                        });

                        const updateState = () => {
                            keywordInput.disabled = !siteConfig.enabled;
                            keywordInput.style.opacity = siteConfig.enabled ? '1' : '0.5';
                            keywordInput.style.cursor = siteConfig.enabled ? 'text' : 'not-allowed';
                            toggle.className = 'setting-toggle' + (siteConfig.enabled ? ' active' : '');
                        };
                        updateState();

                        toggle.addEventListener('click', (e) => {
                            e.stopPropagation();
                            siteConfig.enabled = !siteConfig.enabled;
                            this.settings.modelLockConfig[siteId] = siteConfig;
                            updateState();
                            this.saveSettings();
                            if (siteId === this.siteAdapter.getSiteId() && siteConfig.enabled) {
                                this.siteAdapter.lockModel(siteConfig.keyword);
                            }
                        });

                        keywordInput.addEventListener('change', () => {
                            siteConfig.keyword = keywordInput.value.trim();
                            this.settings.modelLockConfig[siteId] = siteConfig;
                            this.saveSettings();
                        });

                        rightCol.appendChild(keywordInput);
                        row.appendChild(leftCol);
                        row.appendChild(rightCol);
                        lockContainer.appendChild(row);
                    });

                    lockSection = this.createCollapsibleSection(this.t('modelLockTitle'), lockContainer);
                }
            }

            // 3. 页面宽度设置 (可折叠)
            const widthContainer = createElement('div', {});

            // 启用开关
            const enableWidthItem = createElement('div', { className: 'setting-item' });
            const enableWidthInfo = createElement('div', { className: 'setting-item-info' });
            enableWidthInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('enablePageWidth')));
            enableWidthInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('pageWidthDesc')));
            const enableToggle = createElement('div', {
                className: 'setting-toggle' + (this.settings.pageWidth && this.settings.pageWidth.enabled ? ' active' : ''),
                id: 'toggle-page-width',
            });
            enableToggle.addEventListener('click', () => {
                this.settings.pageWidth.enabled = !this.settings.pageWidth.enabled;
                enableToggle.classList.toggle('active', this.settings.pageWidth.enabled);
                this.saveSettings();
                if (this.widthStyleManager) {
                    this.widthStyleManager.updateConfig(this.settings.pageWidth);
                }
                showToast(this.settings.pageWidth.enabled ? this.t('settingOn') : this.t('settingOff'));
            });
            enableWidthItem.appendChild(enableWidthInfo);
            enableWidthItem.appendChild(enableToggle);
            widthContainer.appendChild(enableWidthItem);

            // 值设置
            const widthValueItem = createElement('div', { className: 'setting-item' });
            const widthValueInfo = createElement('div', { className: 'setting-item-info' });
            widthValueInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('widthValue')));

            const widthControls = createElement('div', { className: 'setting-controls' });
            const widthInput = createElement('input', {
                type: 'number',
                className: 'setting-select',
                id: 'width-value-input',
                value: this.settings.pageWidth ? this.settings.pageWidth.value : '70',
                style: 'width: 65px !important; min-width: 65px !important; text-align: right;',
            });
            const unitSelect = createElement('select', {
                className: 'setting-select',
                id: 'width-unit-select',
                style: 'width: 65px;',
            });
            ['%', 'px'].forEach((unit) => {
                const option = createElement('option', { value: unit }, unit);
                if (this.settings.pageWidth && this.settings.pageWidth.unit === unit) option.selected = true;
                unitSelect.appendChild(option);
            });

            const validateAndSave = () => {
                let val = parseFloat(widthInput.value);
                const unit = unitSelect.value;
                if (unit === '%') {
                    if (val > 100) val = 100;
                    if (val < 10) val = 10;
                } else {
                    if (val < 400) val = 400;
                }
                if (val !== parseFloat(widthInput.value)) widthInput.value = val;
                this.settings.pageWidth.value = val.toString();
                this.settings.pageWidth.unit = unit;
                this.saveSettings();
                if (this.widthStyleManager) this.widthStyleManager.updateConfig(this.settings.pageWidth);
            };

            let timeout;
            widthInput.addEventListener('input', () => {
                if (widthInput.value.length > 5) widthInput.value = widthInput.value.slice(0, 5);
                if (unitSelect.value === '%' && parseFloat(widthInput.value) > 100) widthInput.value = '100';
                else if (unitSelect.value === 'px' && parseFloat(widthInput.value) <= 100) widthInput.value = '1200';
                clearTimeout(timeout);
                timeout = setTimeout(validateAndSave, 500);
            });
            widthInput.addEventListener('change', validateAndSave);
            unitSelect.addEventListener('change', () => {
                if (unitSelect.value === '%' && parseFloat(widthInput.value) > 100) widthInput.value = '70';
                else if (unitSelect.value === 'px' && parseFloat(widthInput.value) <= 100) widthInput.value = '1200';
                validateAndSave();
                showToast(`${this.t('widthValue')}: ${widthInput.value}${unitSelect.value}`);
            });

            widthControls.appendChild(widthInput);
            widthControls.appendChild(unitSelect);
            widthValueItem.appendChild(widthValueInfo);
            widthValueItem.appendChild(widthControls);
            widthContainer.appendChild(widthValueItem);

            // 防止自动滚动（从其他设置移入）
            const scrollLockItem = createElement('div', { className: 'setting-item' });
            const scrollLockInfo = createElement('div', { className: 'setting-item-info' });
            scrollLockInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('preventAutoScrollLabel')));
            scrollLockInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('preventAutoScrollDesc')));

            const scrollLockToggle = createElement('div', {
                className: 'setting-toggle' + (this.settings.preventAutoScroll ? ' active' : ''),
                id: 'toggle-scroll-lock',
            });
            scrollLockToggle.addEventListener('click', () => {
                this.settings.preventAutoScroll = !this.settings.preventAutoScroll;
                scrollLockToggle.classList.toggle('active', this.settings.preventAutoScroll);
                this.saveSettings();
                if (this.scrollLockManager) {
                    this.scrollLockManager.setEnabled(this.settings.preventAutoScroll);
                }
                showToast(this.settings.preventAutoScroll ? this.t('settingOn') : this.t('settingOff'));
            });
            scrollLockItem.appendChild(scrollLockInfo);
            scrollLockItem.appendChild(scrollLockToggle);
            widthContainer.appendChild(scrollLockItem);

            const widthSection = this.createCollapsibleSection(this.t('pageDisplaySettings'), widthContainer);

            // 4. 界面排版 (可折叠)
            const layoutContainer = createElement('div', {});
            const tabDesc = createElement(
                'div',
                {
                    className: 'setting-item-desc',
                    style: 'padding: 0 12px 8px 12px; margin-bottom: 4px;',
                },
                this.t('tabOrderDesc'),
            );
            layoutContainer.appendChild(tabDesc);

            const currentOrder = this.settings.tabOrder || DEFAULT_TAB_ORDER;
            // 过滤掉 settings（已移到 header 按钮，不参与排序）
            const validOrder = currentOrder.filter((id) => TAB_DEFINITIONS[id] && id !== 'settings');

            validOrder.forEach((tabId, index) => {
                const def = TAB_DEFINITIONS[tabId];
                const item = createElement('div', { className: 'setting-item' });
                const info = createElement('div', { className: 'setting-item-info' });
                info.appendChild(createElement('div', { className: 'setting-item-label' }, this.t(def.labelKey)));

                const controls = createElement('div', { className: 'setting-controls' });

                // 特殊处理：如果是大纲 Tab，在排序按钮旁边添加开关
                if (tabId === 'outline') {
                    const outlineToggle = createElement('div', {
                        className: 'setting-toggle' + (this.settings.outline?.enabled ? ' active' : ''),
                        id: 'toggle-outline-inline',
                        style: 'transform: scale(0.8); margin-right: 12px;',
                        title: this.t('enableOutline'), // 添加提示
                    });
                    outlineToggle.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.settings.outline.enabled = !this.settings.outline.enabled;
                        outlineToggle.title = this.settings.outline.enabled ? this.t('disableOutline') : this.t('enableOutline');
                        outlineToggle.classList.toggle('active', this.settings.outline.enabled);
                        this.saveSettings();

                        const outlineTab = document.getElementById('outline-tab');
                        if (outlineTab) outlineTab.classList.toggle('hidden', !this.settings.outline.enabled);

                        if (!this.settings.outline.enabled && this.currentTab === 'outline') this.switchTab('settings');

                        // 更新自动更新状态
                        if (this.outlineManager) {
                            this.outlineManager.updateAutoUpdateState();
                        }

                        showToast(this.settings.outline.enabled ? this.t('settingOn') : this.t('settingOff'));
                    });
                    controls.appendChild(outlineToggle);
                }

                // 特殊处理：如果是提示词 Tab，在排序按钮旁边添加开关
                if (tabId === 'prompts') {
                    const promptsToggle = createElement('div', {
                        className: 'setting-toggle' + (this.settings.prompts?.enabled ? ' active' : ''),
                        id: 'toggle-prompts-inline',
                        style: 'transform: scale(0.8); margin-right: 12px;',
                        title: this.t('togglePrompts'),
                    });
                    promptsToggle.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.settings.prompts.enabled = !this.settings.prompts.enabled;
                        promptsToggle.classList.toggle('active', this.settings.prompts.enabled);
                        this.saveSettings();

                        const promptsTab = document.getElementById('prompts-tab');
                        if (promptsTab) promptsTab.classList.toggle('hidden', !this.settings.prompts.enabled);

                        if (!this.settings.prompts.enabled && this.currentTab === 'prompts') this.switchTab('settings');

                        showToast(this.settings.prompts.enabled ? this.t('settingOn') : this.t('settingOff'));
                    });
                    controls.appendChild(promptsToggle);
                }

                // 特殊处理：如果是会话 Tab，在排序按钮旁边添加开关
                if (tabId === 'conversations') {
                    // 确保 conversations 设置对象存在
                    if (!this.settings.conversations) {
                        this.settings.conversations = { enabled: true };
                    }
                    const conversationsToggle = createElement('div', {
                        className: 'setting-toggle' + (this.settings.conversations?.enabled !== false ? ' active' : ''),
                        id: 'toggle-conversations-inline',
                        style: 'transform: scale(0.8); margin-right: 12px;',
                        title: this.t('toggleConversations'),
                    });
                    conversationsToggle.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.settings.conversations.enabled = !this.settings.conversations.enabled;
                        conversationsToggle.classList.toggle('active', this.settings.conversations.enabled);
                        this.saveSettings();

                        const conversationsTab = document.getElementById('conversations-tab');
                        if (conversationsTab) conversationsTab.classList.toggle('hidden', !this.settings.conversations.enabled);

                        if (!this.settings.conversations.enabled && this.currentTab === 'conversations') this.switchTab('settings');

                        showToast(this.settings.conversations.enabled ? this.t('settingOn') : this.t('settingOff'));
                    });
                    controls.appendChild(conversationsToggle);
                }

                const upBtn = createElement('button', {
                    className: 'prompt-panel-btn',
                    style: 'background: var(--gh-hover, #f3f4f6); color: #4b5563; width: 32px; height: 32px; font-size: 16px; margin-right: 4px; border: 1px solid var(--gh-border, #e5e7eb);',
                    title: this.t('moveUp'),
                });
                upBtn.textContent = '⬆';
                upBtn.disabled = index === 0;

                const downBtn = createElement('button', {
                    className: 'prompt-panel-btn',
                    style: 'background: var(--gh-hover, #f3f4f6); color: #4b5563; width: 32px; height: 32px; font-size: 16px; border: 1px solid var(--gh-border, #e5e7eb);',
                    title: this.t('moveDown'),
                });
                downBtn.textContent = '⬇';
                downBtn.disabled = index === validOrder.length - 1;

                [upBtn, downBtn].forEach((btn) => {
                    if (btn.disabled) {
                        btn.style.opacity = '0.4';
                        btn.style.cursor = 'not-allowed';
                        btn.style.background = 'var(--gh-hover, #f3f4f6)';
                    } else {
                        btn.style.opacity = '1';
                        btn.style.cursor = 'pointer';
                        btn.onmouseover = () => {
                            btn.style.background = 'var(--gh-border, #e5e7eb)';
                            btn.style.color = '#111827';
                        };
                        btn.onmouseout = () => {
                            btn.style.background = 'var(--gh-hover, #f3f4f6)';
                            btn.style.color = '#4b5563';
                        };
                    }
                });

                upBtn.addEventListener('click', () => {
                    if (index > 0) {
                        const newOrder = [...validOrder];
                        [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                        this.settings.tabOrder = newOrder;
                        this.saveSettings();
                        this.createUI();
                        this.bindEvents();
                        this.switchTab('settings');
                    }
                });

                downBtn.addEventListener('click', () => {
                    if (index < validOrder.length - 1) {
                        const newOrder = [...validOrder];
                        [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
                        this.settings.tabOrder = newOrder;
                        this.saveSettings();
                        this.createUI();
                        this.bindEvents();
                        this.switchTab('settings');
                    }
                });

                controls.appendChild(upBtn);
                controls.appendChild(downBtn);

                item.appendChild(info);
                item.appendChild(controls);
                layoutContainer.appendChild(item);
            });

            const layoutSection = this.createCollapsibleSection(this.t('tabOrderSettings'), layoutContainer);

            // 4.2 会话设置
            const convSettingsContainer = createElement('div', {});

            // 同步时更新取消置顶开关
            const syncUnpinItem = createElement('div', { className: 'setting-item' });
            const syncUnpinInfo = createElement('div', { className: 'setting-item-info' });
            syncUnpinInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('conversationsSyncUnpinLabel')));
            syncUnpinInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('conversationsSyncUnpinDesc')));

            const syncUnpinToggle = createElement('div', {
                className: 'setting-toggle' + (this.settings.conversations?.syncUnpin ? ' active' : ''),
                id: 'toggle-sync-unpin',
            });
            syncUnpinToggle.addEventListener('click', () => {
                if (!this.settings.conversations) this.settings.conversations = {};
                this.settings.conversations.syncUnpin = !this.settings.conversations.syncUnpin;
                syncUnpinToggle.classList.toggle('active', this.settings.conversations.syncUnpin);
                this.saveSettings();
                showToast(this.settings.conversations.syncUnpin ? this.t('settingOn') : this.t('settingOff'));
            });
            syncUnpinItem.appendChild(syncUnpinInfo);
            syncUnpinItem.appendChild(syncUnpinToggle);
            convSettingsContainer.appendChild(syncUnpinItem);

            // 文件夹彩虹色开关
            const folderRainbowItem = createElement('div', { className: 'setting-item' });
            const folderRainbowInfo = createElement('div', { className: 'setting-item-info' });
            folderRainbowInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('folderRainbowLabel')));
            folderRainbowInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('folderRainbowDesc')));

            const folderRainbowToggle = createElement('div', {
                className: 'setting-toggle' + (this.settings.conversations?.folderRainbow !== false ? ' active' : ''),
                id: 'toggle-folder-rainbow',
            });
            folderRainbowToggle.addEventListener('click', () => {
                if (!this.settings.conversations) this.settings.conversations = {};
                this.settings.conversations.folderRainbow = !this.settings.conversations.folderRainbow;
                // 处理 undefined -> false 的情况（默认是 true）
                if (this.settings.conversations.folderRainbow === undefined) {
                    this.settings.conversations.folderRainbow = false;
                }
                folderRainbowToggle.classList.toggle('active', this.settings.conversations.folderRainbow !== false);
                this.saveSettings();
                // 刷新会话 UI
                if (this.conversationManager) this.conversationManager.createUI();
                showToast(this.settings.conversations.folderRainbow !== false ? this.t('settingOn') : this.t('settingOff'));
            });
            folderRainbowItem.appendChild(folderRainbowInfo);
            folderRainbowItem.appendChild(folderRainbowToggle);
            convSettingsContainer.appendChild(folderRainbowItem);

            const convSettingsSection = this.createCollapsibleSection(this.t('conversationsSettingsTitle'), convSettingsContainer, { defaultExpanded: false });

            // 4.5 阅读历史设置
            const anchorContainer = createElement('div', {});

            // 持久化开关
            const anchorPersistenceItem = createElement('div', { className: 'setting-item' });
            const anchorPersistenceInfo = createElement('div', { className: 'setting-item-info' });
            anchorPersistenceInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('readingHistoryPersistence')));
            anchorPersistenceInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('readingHistoryPersistenceDesc')));

            const anchorPersistenceToggle = createElement('div', {
                className: 'setting-toggle' + (this.settings.readingHistory.persistence ? ' active' : ''),
                id: 'toggle-anchor-persistence',
            });

            // 自动恢复开关
            const anchorAutoRestoreItem = createElement('div', { className: 'setting-item' });
            const anchorAutoRestoreInfo = createElement('div', { className: 'setting-item-info' });
            anchorAutoRestoreInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('autoRestore')));
            anchorAutoRestoreInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('autoRestoreDesc')));
            const anchorAutoRestoreToggle = createElement('div', {
                className: 'setting-toggle' + (this.settings.readingHistory.autoRestore ? ' active' : ''),
                id: 'toggle-anchor-auto-restore',
            });

            // 清理时间设置
            const anchorCleanupItem = createElement('div', { className: 'setting-item' });
            const anchorCleanupInfo = createElement('div', { className: 'setting-item-info' });
            anchorCleanupInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('readingHistoryCleanup')));
            anchorCleanupInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('readingHistoryCleanupDesc')));

            const anchorCleanupControls = createElement('div', { className: 'setting-controls' });
            const anchorCleanupInput = createElement('select', { className: 'setting-select' });

            // 填充清理选项
            const cleanupOptions = [
                { val: 1, label: `1 ${this.t('daysSuffix')}` },
                { val: 3, label: `3 ${this.t('daysSuffix')}` },
                { val: 7, label: `7 ${this.t('daysSuffix')}` },
                { val: 30, label: `30 ${this.t('daysSuffix')}` },
                { val: 90, label: `90 ${this.t('daysSuffix')}` },
                { val: -1, label: this.t('cleanupInfinite') },
            ];
            cleanupOptions.forEach((opt) => {
                const option = createElement('option', { value: opt.val }, opt.label);
                if (this.settings.readingHistory.cleanupDays == opt.val) option.selected = true;
                anchorCleanupInput.appendChild(option);
            });

            // 联动逻辑函数
            const updateDependency = (enabled) => {
                if (enabled) {
                    anchorAutoRestoreItem.style.opacity = '1';
                    anchorAutoRestoreItem.style.pointerEvents = 'auto';
                    anchorCleanupItem.style.opacity = '1';
                    anchorCleanupItem.style.pointerEvents = 'auto';
                } else {
                    anchorAutoRestoreItem.style.opacity = '0.5';
                    anchorAutoRestoreItem.style.pointerEvents = 'none';
                    anchorCleanupItem.style.opacity = '0.5';
                    anchorCleanupItem.style.pointerEvents = 'none';
                }
            };

            // 初始化联动
            updateDependency(this.settings.readingHistory.persistence);

            anchorPersistenceToggle.addEventListener('click', () => {
                this.settings.readingHistory.persistence = !this.settings.readingHistory.persistence;
                anchorPersistenceToggle.classList.toggle('active', this.settings.readingHistory.persistence);
                this.saveSettings();
                updateDependency(this.settings.readingHistory.persistence);
                showToast(this.settings.readingHistory.persistence ? this.t('settingOn') : this.t('settingOff'));
            });

            anchorAutoRestoreToggle.addEventListener('click', () => {
                this.settings.readingHistory.autoRestore = !this.settings.readingHistory.autoRestore;
                anchorAutoRestoreToggle.classList.toggle('active', this.settings.readingHistory.autoRestore);
                this.saveSettings();
                showToast(this.settings.readingHistory.autoRestore ? this.t('settingOn') : this.t('settingOff'));
            });

            anchorCleanupInput.addEventListener('change', () => {
                this.settings.readingHistory.cleanupDays = parseInt(anchorCleanupInput.value);
                this.saveSettings();
                showToast(`${this.t('readingHistoryCleanup')}: ${anchorCleanupInput.options[anchorCleanupInput.selectedIndex].text}`);
            });

            anchorPersistenceItem.appendChild(anchorPersistenceInfo);
            anchorPersistenceItem.appendChild(anchorPersistenceToggle);

            anchorAutoRestoreItem.appendChild(anchorAutoRestoreInfo);
            anchorAutoRestoreItem.appendChild(anchorAutoRestoreToggle);

            anchorCleanupControls.appendChild(anchorCleanupInput);
            anchorCleanupItem.appendChild(anchorCleanupInfo);
            anchorCleanupItem.appendChild(anchorCleanupControls);

            anchorContainer.appendChild(anchorPersistenceItem);
            anchorContainer.appendChild(anchorAutoRestoreItem);
            anchorContainer.appendChild(anchorCleanupItem);

            // showCollapsedAnchor has been moved to Panel Settings
            anchorContainer.appendChild(anchorPersistenceItem);
            anchorContainer.appendChild(anchorAutoRestoreItem);
            anchorContainer.appendChild(anchorCleanupItem);

            const anchorSection = this.createCollapsibleSection(this.t('readingNavigationSettings'), anchorContainer);

            // 5. 大纲详细设置
            const outlineSettingsContainer = createElement('div', {});

            // 自动更新开关
            const autoUpdateItem = createElement('div', { className: 'setting-item' });
            const autoUpdateInfo = createElement('div', { className: 'setting-item-info' });
            autoUpdateInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('outlineAutoUpdateLabel')));
            autoUpdateInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('outlineAutoUpdateDesc')));

            const autoUpdateToggle = createElement('div', {
                className: 'setting-toggle' + (this.settings.outline.autoUpdate ? ' active' : ''),
                id: 'toggle-outline-auto-update',
            });
            autoUpdateToggle.addEventListener('click', () => {
                this.settings.outline.autoUpdate = !this.settings.outline.autoUpdate;
                autoUpdateToggle.classList.toggle('active', this.settings.outline.autoUpdate);
                this.saveSettings();
                if (this.outlineManager) this.outlineManager.updateAutoUpdateState();
                showToast(this.settings.outline.autoUpdate ? this.t('settingOn') : this.t('settingOff'));
            });
            autoUpdateItem.appendChild(autoUpdateInfo);
            autoUpdateItem.appendChild(autoUpdateToggle);
            outlineSettingsContainer.appendChild(autoUpdateItem);

            // 更新间隔
            const updateIntervalItem = createElement('div', { className: 'setting-item' });
            const updateIntervalInfo = createElement('div', { className: 'setting-item-info' });
            updateIntervalInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('outlineUpdateIntervalLabel')));
            const updateIntervalControls = createElement('div', { className: 'setting-controls' });
            const updateIntervalInput = createElement('input', {
                type: 'number',
                className: 'setting-select',
                value: this.settings.outline.updateInterval,
                style: 'width: 60px !important; text-align: center;',
                min: 1,
            });
            updateIntervalInput.addEventListener('change', () => {
                let val = parseInt(updateIntervalInput.value, 10);
                if (val < 1) val = 1; // 最小 1 秒
                updateIntervalInput.value = val;
                this.settings.outline.updateInterval = val;
                this.saveSettings();
                // OutlineManager 在触发下一次更新时会自动使用新间隔
                showToast(this.t('outlineIntervalUpdated').replace('{val}', val));
            });
            updateIntervalControls.appendChild(updateIntervalInput);
            updateIntervalItem.appendChild(updateIntervalInfo);
            updateIntervalItem.appendChild(updateIntervalControls);
            outlineSettingsContainer.appendChild(updateIntervalItem);

            // 同步滚动开关
            const syncScrollItem = createElement('div', { className: 'setting-item' });
            const syncScrollInfo = createElement('div', { className: 'setting-item-info' });
            syncScrollInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('outlineSyncScrollLabel')));
            syncScrollInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('outlineSyncScrollDesc')));

            const syncScrollToggle = createElement('div', {
                className: 'setting-toggle' + (this.settings.outline.syncScroll ? ' active' : ''),
                id: 'toggle-outline-sync-scroll',
            });
            syncScrollToggle.addEventListener('click', () => {
                this.settings.outline.syncScroll = !this.settings.outline.syncScroll;
                syncScrollToggle.classList.toggle('active', this.settings.outline.syncScroll);
                this.saveSettings();
                if (this.outlineManager) this.outlineManager.updateSyncScrollState();
                showToast(this.settings.outline.syncScroll ? this.t('settingOn') : this.t('settingOff'));
            });
            syncScrollItem.appendChild(syncScrollInfo);
            syncScrollItem.appendChild(syncScrollToggle);
            outlineSettingsContainer.appendChild(syncScrollItem);

            const outlineSettingsSection = this.createCollapsibleSection(this.t('outlineSettings'), outlineSettingsContainer, { defaultExpanded: false });

            // 5.5 面板设置
            const panelSettingsContainer = createElement('div', {});

            // 5.5.1 默认显示面板开关
            const defaultPanelStateItem = createElement('div', { className: 'setting-item' });
            const defaultPanelStateInfo = createElement('div', { className: 'setting-item-info' });
            defaultPanelStateInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('defaultPanelStateLabel')));
            defaultPanelStateInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('defaultPanelStateDesc')));

            const defaultPanelStateToggle = createElement('div', {
                className: 'setting-toggle' + (this.settings.defaultPanelState ? ' active' : ''),
                id: 'toggle-default-panel-state',
            });
            defaultPanelStateToggle.addEventListener('click', () => {
                this.settings.defaultPanelState = !this.settings.defaultPanelState;
                defaultPanelStateToggle.classList.toggle('active', this.settings.defaultPanelState);
                this.saveSettings();
                showToast(this.settings.defaultPanelState ? this.t('settingOn') : this.t('settingOff'));
            });
            defaultPanelStateItem.appendChild(defaultPanelStateInfo);
            defaultPanelStateItem.appendChild(defaultPanelStateToggle);
            panelSettingsContainer.appendChild(defaultPanelStateItem);

            // 5.5.2 自动隐藏面板开关
            const autoHidePanelItem = createElement('div', { className: 'setting-item' });
            const autoHidePanelInfo = createElement('div', { className: 'setting-item-info' });
            autoHidePanelInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('autoHidePanelLabel')));
            autoHidePanelInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('autoHidePanelDesc')));

            const autoHidePanelToggle = createElement('div', {
                className: 'setting-toggle' + (this.settings.autoHidePanel ? ' active' : ''),
                id: 'toggle-auto-hide-panel',
            });
            autoHidePanelToggle.addEventListener('click', () => {
                this.settings.autoHidePanel = !this.settings.autoHidePanel;
                autoHidePanelToggle.classList.toggle('active', this.settings.autoHidePanel);
                this.saveSettings();
                showToast(this.settings.autoHidePanel ? this.t('settingOn') : this.t('settingOff'));
            });
            autoHidePanelItem.appendChild(autoHidePanelInfo);
            autoHidePanelItem.appendChild(autoHidePanelToggle);
            panelSettingsContainer.appendChild(autoHidePanelItem);

            // 5.5.3 边缘吸附隐藏开关
            const edgeSnapHideItem = createElement('div', { className: 'setting-item' });
            const edgeSnapHideInfo = createElement('div', { className: 'setting-item-info' });
            edgeSnapHideInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('edgeSnapHideLabel')));
            edgeSnapHideInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('edgeSnapHideDesc')));

            const edgeSnapHideToggle = createElement('div', {
                className: 'setting-toggle' + (this.settings.edgeSnapHide ? ' active' : ''),
                id: 'toggle-edge-snap-hide',
            });
            edgeSnapHideToggle.addEventListener('click', () => {
                this.settings.edgeSnapHide = !this.settings.edgeSnapHide;
                edgeSnapHideToggle.classList.toggle('active', this.settings.edgeSnapHide);
                this.saveSettings();
                // 如果关闭功能且当前处于吸附状态，则恢复面板
                if (!this.settings.edgeSnapHide && this.edgeSnapState) {
                    this.unsnap();
                }
                showToast(this.settings.edgeSnapHide ? this.t('settingOn') : this.t('settingOff'));
            });
            edgeSnapHideItem.appendChild(edgeSnapHideInfo);
            edgeSnapHideItem.appendChild(edgeSnapHideToggle);
            panelSettingsContainer.appendChild(edgeSnapHideItem);

            // 5.5.4 折叠面板按钮排序
            const collapsedBtnDesc = createElement(
                'div',
                {
                    className: 'setting-item-desc',
                    style: 'padding: 0 12px 8px 12px; margin-bottom: 4px;',
                },
                this.t('collapsedButtonsOrderDesc') || '调整折叠面板按钮的显示顺序',
            );
            panelSettingsContainer.appendChild(collapsedBtnDesc);

            const currentBtnOrder = this.settings.collapsedButtonsOrder || DEFAULT_COLLAPSED_BUTTONS_ORDER;

            currentBtnOrder.forEach((btnConfig, index) => {
                const def = COLLAPSED_BUTTON_DEFS[btnConfig.id];
                if (!def) return;

                const item = createElement('div', { className: 'setting-item' });
                const info = createElement('div', { className: 'setting-item-info' });
                const label = createElement('div', {
                    className: 'setting-item-label',
                    style: 'display: flex; align-items: center;',
                });
                const iconSpan = createElement('span', { style: 'display: inline-block; width: 24px; text-align: center; margin-right: 4px;' }, def.icon);
                const textSpan = createElement('span', {}, this.t(def.labelKey));
                label.appendChild(iconSpan);
                label.appendChild(textSpan);
                info.appendChild(label);

                const controls = createElement('div', { className: 'setting-controls' });

                // 可切换的按钮（anchor/theme）添加开关
                if (def.canToggle) {
                    const toggle = createElement('div', {
                        className: 'setting-toggle' + (btnConfig.enabled ? ' active' : ''),
                        style: 'transform: scale(0.8); margin-right: 12px;',
                    });
                    toggle.addEventListener('click', (e) => {
                        e.stopPropagation();
                        btnConfig.enabled = !btnConfig.enabled;
                        toggle.classList.toggle('active', btnConfig.enabled);
                        this.saveSettings();
                        this.createUI();
                        this.bindEvents();
                        this.switchTab('settings');
                        showToast(btnConfig.enabled ? this.t('settingOn') : this.t('settingOff'));
                    });
                    controls.appendChild(toggle);
                }

                // 上下移动按钮
                const upBtn = createElement('button', {
                    className: 'prompt-panel-btn',
                    style: 'background: var(--gh-hover, #f3f4f6); color: #4b5563; width: 32px; height: 32px; font-size: 16px; margin-right: 4px; border: 1px solid var(--gh-border, #e5e7eb);',
                    title: this.t('moveUp'),
                });
                upBtn.textContent = '⬆';
                upBtn.disabled = index === 0;

                const downBtn = createElement('button', {
                    className: 'prompt-panel-btn',
                    style: 'background: var(--gh-hover, #f3f4f6); color: #4b5563; width: 32px; height: 32px; font-size: 16px; border: 1px solid var(--gh-border, #e5e7eb);',
                    title: this.t('moveDown'),
                });
                downBtn.textContent = '⬇';
                downBtn.disabled = index === currentBtnOrder.length - 1;

                [upBtn, downBtn].forEach((btn) => {
                    if (btn.disabled) {
                        btn.style.opacity = '0.4';
                        btn.style.cursor = 'not-allowed';
                    } else {
                        btn.style.opacity = '1';
                        btn.style.cursor = 'pointer';
                        btn.onmouseover = () => {
                            btn.style.background = 'var(--gh-border, #e5e7eb)';
                            btn.style.color = '#111827';
                        };
                        btn.onmouseout = () => {
                            btn.style.background = 'var(--gh-hover, #f3f4f6)';
                            btn.style.color = '#4b5563';
                        };
                    }
                });

                upBtn.addEventListener('click', () => {
                    if (index > 0) {
                        const newOrder = [...currentBtnOrder];
                        [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
                        this.settings.collapsedButtonsOrder = newOrder;
                        this.saveSettings();
                        this.createUI();
                        this.bindEvents();
                        this.switchTab('settings');
                    }
                });

                downBtn.addEventListener('click', () => {
                    if (index < currentBtnOrder.length - 1) {
                        const newOrder = [...currentBtnOrder];
                        [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
                        this.settings.collapsedButtonsOrder = newOrder;
                        this.saveSettings();
                        this.createUI();
                        this.bindEvents();
                        this.switchTab('settings');
                    }
                });

                controls.appendChild(upBtn);
                controls.appendChild(downBtn);

                item.appendChild(info);
                item.appendChild(controls);
                panelSettingsContainer.appendChild(item);
            });

            const panelSettingsSection = this.createCollapsibleSection(this.t('panelSettingsTitle'), panelSettingsContainer, { defaultExpanded: false });

            // 6. 标签页设置
            const tabSettingsContainer = createElement('div', {});

            // 6.1 新标签页打开开关
            if (this.siteAdapter.supportsNewTab()) {
                const newTabItem = createElement('div', { className: 'setting-item' });
                const newTabInfo = createElement('div', { className: 'setting-item-info' });
                newTabInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('openNewTabLabel')));
                newTabInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('openNewTabDesc')));

                const newTabToggle = createElement('div', {
                    className: 'setting-toggle' + (this.settings.tabSettings?.openInNewTab ? ' active' : ''),
                    id: 'toggle-new-tab',
                });
                newTabToggle.addEventListener('click', () => {
                    this.settings.tabSettings.openInNewTab = !this.settings.tabSettings.openInNewTab;
                    newTabToggle.classList.toggle('active', this.settings.tabSettings.openInNewTab);
                    this.saveSettings();
                    this.createUI();
                    this.bindEvents();
                    if (this.currentTab === 'settings') {
                        this.switchTab('settings');
                    }
                    showToast(this.settings.tabSettings.openInNewTab ? this.t('settingOn') : this.t('settingOff'));
                });

                newTabItem.appendChild(newTabInfo);
                newTabItem.appendChild(newTabToggle);
                tabSettingsContainer.appendChild(newTabItem);
            }

            // 6.2 自动重命名标签页开关 (仅支持的站点显示)
            if (this.siteAdapter.supportsTabRename()) {
                const renameTabItem = createElement('div', { className: 'setting-item' });
                const renameTabInfo = createElement('div', { className: 'setting-item-info' });
                renameTabInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('autoRenameTabLabel')));
                renameTabInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('autoRenameTabDesc')));

                const renameTabToggle = createElement('div', {
                    className: 'setting-toggle' + (this.settings.tabSettings?.autoRenameTab ? ' active' : ''),
                    id: 'toggle-auto-rename-tab',
                });
                renameTabItem.appendChild(renameTabInfo);
                renameTabItem.appendChild(renameTabToggle);
                tabSettingsContainer.appendChild(renameTabItem);

                // 6.3 检测频率
                const intervalItem = createElement('div', { className: 'setting-item' });
                const intervalInfo = createElement('div', { className: 'setting-item-info' });
                intervalInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('renameIntervalLabel')));
                intervalInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('renameIntervalDesc')));

                const intervalControls = createElement('div', { className: 'setting-controls' });
                const intervalSelect = createElement('select', {
                    className: 'setting-select',
                    id: 'select-rename-interval',
                });
                const intervalOptions = [1, 3, 5, 10, 30, 60];
                intervalOptions.forEach((val) => {
                    const option = createElement('option', { value: val }, `${val} ${this.t('secondsSuffix')}`);
                    if (this.settings.tabSettings?.renameInterval === val) option.selected = true;
                    intervalSelect.appendChild(option);
                });
                intervalSelect.addEventListener('change', () => {
                    this.settings.tabSettings.renameInterval = parseInt(intervalSelect.value);
                    this.saveSettings();
                    if (this.tabRenameManager && this.tabRenameManager.isActive()) {
                        this.tabRenameManager.setInterval(this.settings.tabSettings.renameInterval);
                    }
                    showToast(`${this.t('renameIntervalLabel')}: ${intervalSelect.value}${this.t('secondsSuffix')}`);
                });

                intervalControls.appendChild(intervalSelect);
                intervalItem.appendChild(intervalInfo);
                intervalItem.appendChild(intervalControls);
                tabSettingsContainer.appendChild(intervalItem);

                // 定义状态更新函数
                const updateIntervalState = () => {
                    const isEnabled = this.settings.tabSettings.autoRenameTab;
                    intervalSelect.disabled = !isEnabled;
                    intervalItem.style.opacity = isEnabled ? '1' : '0.5';
                    intervalItem.style.pointerEvents = isEnabled ? 'auto' : 'none';
                };

                // 初始化状态
                updateIntervalState();

                // 绑定开关点击事件
                renameTabToggle.addEventListener('click', () => {
                    this.settings.tabSettings.autoRenameTab = !this.settings.tabSettings.autoRenameTab;
                    renameTabToggle.classList.toggle('active', this.settings.tabSettings.autoRenameTab);
                    this.saveSettings();

                    // 更新检测频率项状态
                    updateIntervalState();

                    // 启动/停止 TabRenameManager
                    if (this.tabRenameManager) {
                        if (this.settings.tabSettings.autoRenameTab) {
                            this.tabRenameManager.start();
                        } else {
                            this.tabRenameManager.stop();
                        }
                    }

                    showToast(this.settings.tabSettings.autoRenameTab ? this.t('settingOn') : this.t('settingOff'));
                });
            }

            // 6.4 显示生成状态 (showStatus)
            if (this.siteAdapter.supportsTabRename()) {
                const showStatusItem = createElement('div', { className: 'setting-item' });
                const showStatusInfo = createElement('div', { className: 'setting-item-info' });
                showStatusInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('showStatusLabel')));
                showStatusInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('showStatusDesc')));

                const showStatusToggle = createElement('div', {
                    className: 'setting-toggle' + (this.settings.tabSettings?.showStatus !== false ? ' active' : ''),
                    id: 'toggle-show-status',
                });
                showStatusToggle.addEventListener('click', () => {
                    this.settings.tabSettings.showStatus = !this.settings.tabSettings.showStatus;
                    showStatusToggle.classList.toggle('active', this.settings.tabSettings.showStatus);
                    this.saveSettings();
                    if (this.tabRenameManager) this.tabRenameManager.updateTabName(true);
                    showToast(this.settings.tabSettings.showStatus ? this.t('settingOn') : this.t('settingOff'));
                });

                showStatusItem.appendChild(showStatusInfo);
                showStatusItem.appendChild(showStatusToggle);
                tabSettingsContainer.appendChild(showStatusItem);
            }

            // 6.5 标题格式 (titleFormat)
            if (this.siteAdapter.supportsTabRename()) {
                const formatItem = createElement('div', { className: 'setting-item' });
                const formatInfo = createElement('div', { className: 'setting-item-info' });
                formatInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('titleFormatLabel')));
                formatInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('titleFormatDesc')));

                const formatInput = createElement('input', {
                    type: 'text',
                    className: 'prompt-input-title',
                    value: this.settings.tabSettings?.titleFormat || '{status}{title}',
                    style: 'width: 130px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;',
                });
                formatInput.addEventListener('change', () => {
                    this.settings.tabSettings.titleFormat = formatInput.value.trim() || '{status}{title}';
                    this.saveSettings();
                    if (this.tabRenameManager) this.tabRenameManager.updateTabName(true);
                });

                formatItem.appendChild(formatInfo);
                formatItem.appendChild(formatInput);
                tabSettingsContainer.appendChild(formatItem);
            }

            // 6.6 发送桌面通知 (showNotification)
            if (this.siteAdapter.supportsTabRename()) {
                const notificationItem = createElement('div', { className: 'setting-item' });
                const notificationInfo = createElement('div', { className: 'setting-item-info' });
                notificationInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('showNotificationLabel')));
                notificationInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('showNotificationDesc')));

                const notificationToggle = createElement('div', {
                    className: 'setting-toggle' + (this.settings.tabSettings?.showNotification ? ' active' : ''),
                    id: 'toggle-show-notification',
                });
                notificationToggle.addEventListener('click', () => {
                    this.settings.tabSettings.showNotification = !this.settings.tabSettings.showNotification;
                    notificationToggle.classList.toggle('active', this.settings.tabSettings.showNotification);
                    this.saveSettings();
                    showToast(this.settings.tabSettings.showNotification ? this.t('settingOn') : this.t('settingOff'));
                });

                notificationItem.appendChild(notificationInfo);
                notificationItem.appendChild(notificationToggle);
                tabSettingsContainer.appendChild(notificationItem);

                // 6.6.1 通知声音 (notificationSound)
                const soundItem = createElement('div', { className: 'setting-item' });
                const soundInfo = createElement('div', { className: 'setting-item-info' });
                soundInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('notificationSoundLabel')));
                soundInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('notificationSoundDesc')));

                const soundToggle = createElement('div', {
                    className: 'setting-toggle' + (this.settings.tabSettings?.notificationSound ? ' active' : ''),
                    id: 'toggle-notification-sound',
                });

                soundItem.appendChild(soundInfo);
                soundItem.appendChild(soundToggle);
                tabSettingsContainer.appendChild(soundItem);

                // 6.6.2 音量滑块 (notificationVolume)
                const volumeItem = createElement('div', { className: 'setting-item' });
                const volumeInfo = createElement('div', { className: 'setting-item-info' });
                volumeInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('notificationVolumeLabel')));

                const volumeControls = createElement('div', {
                    className: 'setting-controls',
                    style: 'display: flex; align-items: center; gap: 8px;',
                });
                const volumeSlider = createElement('input', {
                    type: 'range',
                    min: '0.1',
                    max: '1.0',
                    step: '0.1',
                    value: this.settings.tabSettings?.notificationVolume ?? 0.5,
                    style: 'width: 80px; cursor: pointer;',
                    id: 'slider-notification-volume',
                });
                const volumeDisplay = createElement(
                    'span',
                    {
                        style: 'min-width: 36px; text-align: right; font-size: 12px; color: var(--gh-text-secondary, #666);',
                    },
                    `${Math.round((this.settings.tabSettings?.notificationVolume ?? 0.5) * 100)}%`,
                );

                volumeSlider.addEventListener('input', () => {
                    const val = parseFloat(volumeSlider.value);
                    volumeDisplay.textContent = `${Math.round(val * 100)}%`;
                    this.settings.tabSettings.notificationVolume = val;
                    this.saveSettings();
                });

                volumeControls.appendChild(volumeSlider);
                volumeControls.appendChild(volumeDisplay);
                volumeItem.appendChild(volumeInfo);
                volumeItem.appendChild(volumeControls);
                tabSettingsContainer.appendChild(volumeItem);

                // 联动逻辑：音量滑块根据通知声音开关状态置灰
                const updateVolumeState = () => {
                    const isEnabled = this.settings.tabSettings.notificationSound;
                    volumeSlider.disabled = !isEnabled;
                    volumeItem.style.opacity = isEnabled ? '1' : '0.5';
                    volumeItem.style.pointerEvents = isEnabled ? 'auto' : 'none';
                };
                updateVolumeState();

                // 绑定通知声音开关点击事件
                soundToggle.addEventListener('click', () => {
                    this.settings.tabSettings.notificationSound = !this.settings.tabSettings.notificationSound;
                    soundToggle.classList.toggle('active', this.settings.tabSettings.notificationSound);
                    this.saveSettings();
                    updateVolumeState();
                    showToast(this.settings.tabSettings.notificationSound ? this.t('settingOn') : this.t('settingOff'));
                });

                // 6.6.3 前台时也通知 (notifyWhenFocused)
                const focusNotifyItem = createElement('div', { className: 'setting-item' });
                const focusNotifyInfo = createElement('div', { className: 'setting-item-info' });
                focusNotifyInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('notifyWhenFocusedLabel')));
                focusNotifyInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('notifyWhenFocusedDesc')));

                const focusNotifyToggle = createElement('div', {
                    className: 'setting-toggle' + (this.settings.tabSettings?.notifyWhenFocused ? ' active' : ''),
                    id: 'toggle-notify-when-focused',
                });
                focusNotifyToggle.addEventListener('click', () => {
                    this.settings.tabSettings.notifyWhenFocused = !this.settings.tabSettings.notifyWhenFocused;
                    focusNotifyToggle.classList.toggle('active', this.settings.tabSettings.notifyWhenFocused);
                    this.saveSettings();
                    showToast(this.settings.tabSettings.notifyWhenFocused ? this.t('settingOn') : this.t('settingOff'));
                });

                focusNotifyItem.appendChild(focusNotifyInfo);
                focusNotifyItem.appendChild(focusNotifyToggle);
                tabSettingsContainer.appendChild(focusNotifyItem);
            }

            // 6.7 自动窗口置顶 (autoFocus)
            if (this.siteAdapter.supportsTabRename()) {
                const autoFocusItem = createElement('div', { className: 'setting-item' });
                const autoFocusInfo = createElement('div', { className: 'setting-item-info' });
                autoFocusInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('autoFocusLabel')));
                autoFocusInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('autoFocusDesc')));

                const autoFocusToggle = createElement('div', {
                    className: 'setting-toggle' + (this.settings.tabSettings?.autoFocus ? ' active' : ''),
                    id: 'toggle-auto-focus',
                });
                autoFocusToggle.addEventListener('click', () => {
                    this.settings.tabSettings.autoFocus = !this.settings.tabSettings.autoFocus;
                    autoFocusToggle.classList.toggle('active', this.settings.tabSettings.autoFocus);
                    this.saveSettings();
                    showToast(this.settings.tabSettings.autoFocus ? this.t('settingOn') : this.t('settingOff'));
                });

                autoFocusItem.appendChild(autoFocusInfo);
                autoFocusItem.appendChild(autoFocusToggle);
                tabSettingsContainer.appendChild(autoFocusItem);
            }

            // 6.8 隐私模式 (privacyMode)
            if (this.siteAdapter.supportsTabRename()) {
                const privacyItem = createElement('div', { className: 'setting-item' });
                const privacyInfo = createElement('div', { className: 'setting-item-info' });
                privacyInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('privacyModeLabel')));
                privacyInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('privacyModeDesc')));

                const privacyToggle = createElement('div', {
                    className: 'setting-toggle' + (this.settings.tabSettings?.privacyMode ? ' active' : ''),
                    id: 'toggle-privacy-mode',
                });

                privacyItem.appendChild(privacyInfo);
                privacyItem.appendChild(privacyToggle);
                tabSettingsContainer.appendChild(privacyItem);

                // 6.9 伪装标题输入框 (privacyTitle)
                const privacyTitleItem = createElement('div', { className: 'setting-item' });
                const privacyTitleInfo = createElement('div', { className: 'setting-item-info' });
                privacyTitleInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('privacyTitleLabel')));

                const privacyTitleInput = createElement('input', {
                    type: 'text',
                    className: 'prompt-input-title',
                    value: this.settings.tabSettings?.privacyTitle || 'Google',
                    placeholder: this.t('privacyTitlePlaceholder'),
                    style: 'width: 100px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;',
                });
                privacyTitleInput.addEventListener('change', () => {
                    this.settings.tabSettings.privacyTitle = privacyTitleInput.value.trim() || 'Google';
                    this.saveSettings();
                    if (this.settings.tabSettings.privacyMode && this.tabRenameManager) {
                        this.tabRenameManager.updateTabName(true);
                    }
                });

                privacyTitleItem.appendChild(privacyTitleInfo);
                privacyTitleItem.appendChild(privacyTitleInput);
                tabSettingsContainer.appendChild(privacyTitleItem);

                // 定义状态更新函数（类似 renameInterval 的处理方式）
                const updatePrivacyTitleState = () => {
                    const isEnabled = this.settings.tabSettings.privacyMode;
                    privacyTitleInput.disabled = !isEnabled;
                    privacyTitleItem.style.opacity = isEnabled ? '1' : '0.5';
                    privacyTitleItem.style.pointerEvents = isEnabled ? 'auto' : 'none';
                };

                // 初始化状态
                updatePrivacyTitleState();

                // 绑定隐私模式开关点击事件
                privacyToggle.addEventListener('click', () => {
                    this.settings.tabSettings.privacyMode = !this.settings.tabSettings.privacyMode;
                    privacyToggle.classList.toggle('active', this.settings.tabSettings.privacyMode);
                    this.saveSettings();
                    if (this.tabRenameManager) this.tabRenameManager.updateTabName(true);
                    // 更新伪装标题项状态
                    updatePrivacyTitleState();
                    showToast(this.settings.tabSettings.privacyMode ? '🔒 ' + this.t('settingOn') : '🔓 ' + this.t('settingOff'));
                });
            }

            const tabSettingsSection = this.createCollapsibleSection(this.t('tabSettingsTitle'), tabSettingsContainer, { defaultExpanded: false });

            // 内容设置
            const exportContainer = createElement('div', {});

            // 水印移除开关
            const watermarkRemovalItem = createElement('div', { className: 'setting-item' });
            const watermarkRemovalInfo = createElement('div', { className: 'setting-item-info' });
            watermarkRemovalInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('watermarkRemovalLabel')));
            watermarkRemovalInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('watermarkRemovalDesc')));

            const watermarkRemovalToggle = createElement('div', {
                className: 'setting-toggle' + (this.settings.watermarkRemoval ? ' active' : ''),
                id: 'toggle-watermark-removal',
            });
            watermarkRemovalToggle.addEventListener('click', () => {
                this.settings.watermarkRemoval = !this.settings.watermarkRemoval;
                watermarkRemovalToggle.classList.toggle('active', this.settings.watermarkRemoval);
                this.saveSettings();
                // 根据设置启动或停止水印移除
                if (this.watermarkRemover) {
                    if (this.settings.watermarkRemoval) {
                        this.watermarkRemover.start();
                    } else {
                        this.watermarkRemover.stop();
                    }
                }
                showToast(this.settings.watermarkRemoval ? this.t('settingOn') : this.t('settingOff'));
            });
            watermarkRemovalItem.appendChild(watermarkRemovalInfo);
            watermarkRemovalItem.appendChild(watermarkRemovalToggle);
            exportContainer.appendChild(watermarkRemovalItem);

            // Base64 图片导出开关
            const base64ExportItem = createElement('div', { className: 'setting-item' });
            const base64ExportInfo = createElement('div', { className: 'setting-item-info' });
            base64ExportInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('exportImagesToBase64Label')));
            base64ExportInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('exportImagesToBase64Desc')));

            const base64ExportToggle = createElement('div', {
                // 默认为 false
                className: 'setting-toggle' + (this.settings.conversations?.exportImagesToBase64 ? ' active' : ''),
                id: 'toggle-export-base64',
            });
            base64ExportToggle.addEventListener('click', () => {
                if (!this.settings.conversations) this.settings.conversations = {};
                // Toggle logic
                const currentVal = !!this.settings.conversations.exportImagesToBase64;
                this.settings.conversations.exportImagesToBase64 = !currentVal;
                base64ExportToggle.classList.toggle('active', this.settings.conversations.exportImagesToBase64);
                this.saveSettings();
                showToast(this.settings.conversations.exportImagesToBase64 ? this.t('settingOn') : this.t('settingOff'));
            });

            base64ExportItem.appendChild(base64ExportInfo);
            base64ExportItem.appendChild(base64ExportToggle);
            exportContainer.appendChild(base64ExportItem);

            // 双击复制公式开关 (仅 Gemini 标准版显示)
            const isNonBusinessGemini = !location.host.includes('business');
            if (isNonBusinessGemini) {
                // 初始化默认值（双击复制公式默认开启）
                if (this.settings.formulaCopyEnabled === undefined) {
                    this.settings.formulaCopyEnabled = true;
                }
                if (this.settings.formulaDelimiterEnabled === undefined) {
                    this.settings.formulaDelimiterEnabled = true;
                }

                const formulaCopyItem = createElement('div', { className: 'setting-item' });
                const formulaCopyInfo = createElement('div', { className: 'setting-item-info' });
                formulaCopyInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('formulaCopyLabel')));
                formulaCopyInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('formulaCopyDesc')));

                const formulaCopyToggle = createElement('div', {
                    className: 'setting-toggle' + (this.settings.formulaCopyEnabled ? ' active' : ''),
                    id: 'toggle-formula-copy',
                });

                formulaCopyItem.appendChild(formulaCopyInfo);
                formulaCopyItem.appendChild(formulaCopyToggle);
                exportContainer.appendChild(formulaCopyItem);

                // 分隔符开关
                const delimiterItem = createElement('div', { className: 'setting-item' });
                const delimiterInfo = createElement('div', { className: 'setting-item-info' });
                delimiterInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('formulaDelimiterLabel')));
                delimiterInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('formulaDelimiterDesc')));

                const delimiterToggle = createElement('div', {
                    className: 'setting-toggle' + (this.settings.formulaDelimiterEnabled ? ' active' : ''),
                    id: 'toggle-formula-delimiter',
                });

                delimiterItem.appendChild(delimiterInfo);
                delimiterItem.appendChild(delimiterToggle);
                exportContainer.appendChild(delimiterItem);

                // 联动逻辑：根据公式复制开关状态更新分隔符开关可用性
                const updateDelimiterState = () => {
                    const isEnabled = this.settings.formulaCopyEnabled;
                    delimiterToggle.style.opacity = isEnabled ? '1' : '0.4';
                    delimiterToggle.style.pointerEvents = isEnabled ? 'auto' : 'none';
                    delimiterItem.style.opacity = isEnabled ? '1' : '0.5';
                };
                updateDelimiterState();

                // 公式复制开关点击事件
                formulaCopyToggle.addEventListener('click', () => {
                    this.settings.formulaCopyEnabled = !this.settings.formulaCopyEnabled;
                    formulaCopyToggle.classList.toggle('active', this.settings.formulaCopyEnabled);
                    this.saveSettings();
                    // 实时切换功能
                    if (this.settings.formulaCopyEnabled) {
                        this.copyManager.initFormulaCopy();
                    } else {
                        this.copyManager.destroyFormulaCopy();
                    }
                    // 更新分隔符开关状态
                    updateDelimiterState();
                    showToast(this.settings.formulaCopyEnabled ? this.t('settingOn') : this.t('settingOff'));
                });

                // 分隔符开关点击事件
                delimiterToggle.addEventListener('click', () => {
                    if (!this.settings.formulaCopyEnabled) return; // 防止在禁用状态下点击
                    this.settings.formulaDelimiterEnabled = !this.settings.formulaDelimiterEnabled;
                    delimiterToggle.classList.toggle('active', this.settings.formulaDelimiterEnabled);
                    this.saveSettings();
                    showToast(this.settings.formulaDelimiterEnabled ? this.t('settingOn') : this.t('settingOff'));
                });
            }

            // 表格复制 Markdown 开关（通用功能，两个版本都支持）
            // 初始化默认值
            if (this.settings.tableCopyEnabled === undefined) {
                this.settings.tableCopyEnabled = true;
            }

            const tableCopyItem = createElement('div', { className: 'setting-item' });
            const tableCopyInfo = createElement('div', { className: 'setting-item-info' });
            tableCopyInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('tableCopyLabel')));
            tableCopyInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('tableCopyDesc')));

            const tableCopyToggle = createElement('div', {
                className: 'setting-toggle' + (this.settings.tableCopyEnabled ? ' active' : ''),
                id: 'toggle-table-copy',
            });
            tableCopyToggle.addEventListener('click', () => {
                this.settings.tableCopyEnabled = !this.settings.tableCopyEnabled;
                tableCopyToggle.classList.toggle('active', this.settings.tableCopyEnabled);
                this.saveSettings();
                // 实时切换功能
                if (this.settings.tableCopyEnabled) {
                    this.copyManager.initTableCopy();
                } else {
                    this.copyManager.destroyTableCopy();
                }
                showToast(this.settings.tableCopyEnabled ? this.t('settingOn') : this.t('settingOff'));
            });

            tableCopyItem.appendChild(tableCopyInfo);
            tableCopyItem.appendChild(tableCopyToggle);
            exportContainer.appendChild(tableCopyItem);

            // Gemini 专属设置
            const isStandardGemini = this.siteAdapter instanceof GeminiAdapter;
            if (isStandardGemini) {
                // Markdown 加粗修复开关
                const mdFixSettings = GM_getValue(SETTING_KEYS.MARKDOWN_FIX, DEFAULT_MARKDOWN_FIX_SETTINGS);

                const mdFixItem = createElement('div', { className: 'setting-item' });
                const mdFixInfo = createElement('div', { className: 'setting-item-info' });
                mdFixInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('markdownFixLabel')));
                mdFixInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('markdownFixDesc')));

                const mdFixToggle = createElement('div', {
                    className: 'setting-toggle' + (mdFixSettings.enabled ? ' active' : ''),
                    id: 'toggle-markdown-fix',
                });
                mdFixToggle.addEventListener('click', () => {
                    mdFixSettings.enabled = !mdFixSettings.enabled;
                    mdFixToggle.classList.toggle('active', mdFixSettings.enabled);
                    GM_setValue(SETTING_KEYS.MARKDOWN_FIX, mdFixSettings);

                    // 实时切换
                    if (mdFixSettings.enabled) {
                        if (!this.markdownFixer) {
                            this.markdownFixer = new MarkdownFixer();
                        }
                        this.markdownFixer.start();
                    } else {
                        this.markdownFixer?.stop();
                    }

                    showToast(mdFixSettings.enabled ? this.t('settingOn') : this.t('settingOff'));
                });

                mdFixItem.appendChild(mdFixInfo);
                mdFixItem.appendChild(mdFixToggle);
                exportContainer.appendChild(mdFixItem);
            }

            const contentAndExportSection = this.createCollapsibleSection(this.t('contentExportSettingsTitle'), exportContainer, { defaultExpanded: false });

            //  其他设置
            const otherSettingsContainer = createElement('div', {});

            // Gemini Business 专属设置
            if (this.siteAdapter instanceof GeminiBusinessAdapter) {
                const clearItem = createElement('div', { className: 'setting-item' });
                const clearInfo = createElement('div', { className: 'setting-item-info' });
                clearInfo.appendChild(createElement('div', { className: 'setting-item-label' }, this.t('clearOnSendLabel')));
                clearInfo.appendChild(createElement('div', { className: 'setting-item-desc' }, this.t('clearOnSendDesc')));
                const toggle = createElement('div', {
                    className: 'setting-toggle' + (this.settings.clearTextareaOnSend ? ' active' : ''),
                    id: 'toggle-clear-on-send',
                });
                toggle.addEventListener('click', () => {
                    this.settings.clearTextareaOnSend = !this.settings.clearTextareaOnSend;
                    toggle.classList.toggle('active', this.settings.clearTextareaOnSend);
                    this.saveSettings();
                    showToast(this.settings.clearTextareaOnSend ? this.t('settingOn') : this.t('settingOff'));
                });
                clearItem.appendChild(clearInfo);
                clearItem.appendChild(toggle);
                otherSettingsContainer.appendChild(clearItem);
            }

            const otherSettingsSection = this.createCollapsibleSection(this.t('otherSettingsTitle'), otherSettingsContainer, { defaultExpanded: false });

            // 1. 通用设置（语言）- 已在上方添加
            // 2. 面板设置 (New)
            content.appendChild(panelSettingsSection);
            // 3. 界面排版
            content.appendChild(layoutSection);
            // 3.5. 会话设置
            content.appendChild(convSettingsSection);
            // 内容设置
            content.appendChild(contentAndExportSection);
            // 4. 标签页设置
            if (tabSettingsSection) content.appendChild(tabSettingsSection);
            // 5. 阅读导航
            content.appendChild(anchorSection);
            // 6. 大纲设置
            content.appendChild(outlineSettingsSection);
            // 7. 页面显示
            content.appendChild(widthSection);
            // 8. 模型锁定
            if (lockSection) content.appendChild(lockSection);

            // last: 其他设置
            content.appendChild(otherSettingsSection);

            container.appendChild(content);
        }

        togglePanel() {
            const panel = document.getElementById('gemini-helper-panel');
            const quickBtnGroup = document.getElementById('quick-btn-group');
            const toggleBtn = document.getElementById('toggle-panel');
            this.isCollapsed = !this.isCollapsed;

            if (this.isCollapsed) {
                // 折叠时隐藏触发条（如果有的话）
                this.hideEdgeTrigger();
                panel.classList.add('collapsed');
                if (quickBtnGroup) quickBtnGroup.classList.add('collapsed');
                if (toggleBtn) toggleBtn.textContent = '+';
            } else {
                // 展开面板时，如果处于边缘吸附状态，临时显示面板（保持 edgeSnapState 用于 mouseleave 恢复）
                if (this.edgeSnapState) {
                    panel.classList.remove('edge-snapped-left', 'edge-snapped-right');
                    this.hideEdgeTrigger();
                }
                panel.classList.remove('collapsed');
                if (quickBtnGroup) quickBtnGroup.classList.remove('collapsed');
                if (toggleBtn) toggleBtn.textContent = '−';
            }
        }

        // ==================== Auto-Resume & Anchor Logic ====================

        // 恢复阅读历史 (Auto-Resume)
        async restoreReadingProgress() {
            // 将 showToast 传给 manager 以显示加载进度
            const success = await this.readingProgressManager.restoreProgress((msg) => showToast(msg));

            const onRestorationComplete = () => {
                // 延迟一点开启记录，避开惯性滚动等干扰，确保后续的用户滚动能被正确记录
                // 使用 restartRecording 而非 startRecording，确保会话切换时重新绑定滚动容器
                setTimeout(() => {
                    this.readingProgressManager.restartRecording();
                }, 500);
            };

            if (success) {
                // 恢复成功，获取恢复的位置设为“初始锚点”
                const restoredTop = this.readingProgressManager.restoredTop;
                if (restoredTop !== undefined) {
                    this.anchorManager.setAnchor(restoredTop);
                }
                showToast(this.t('restoredPosition'));
            }

            // 无论成功失败，最后都开启记录
            onRestorationComplete();
        }

        // 清理过期阅读历史
        cleanupReadingHistory() {
            this.readingProgressManager.cleanup();
        }

        // 锚点按钮点击 (Back functionality)
        handleAnchorClick() {
            // 取消进行中的历史加载
            this.historyLoader.abort();
            if (this.anchorManager.hasAnchor()) {
                this.anchorManager.backToAnchor();
                showToast(this.t('jumpToAnchor'));
            } else {
                showToast('暂无阅读锚点 (点击顶部/底部按钮可自动生成)');
            }
        }

        // 更新锚点按钮状态 (UI)
        updateAnchorButtonState(hasAnchor) {
            [document.getElementById('quick-anchor-btn'), document.getElementById('scroll-anchor-btn')].forEach((btn) => {
                if (btn) {
                    if (hasAnchor) {
                        btn.style.opacity = '1';
                        btn.style.cursor = 'pointer';
                        btn.title = this.t('jumpToAnchor');
                    } else {
                        btn.style.opacity = '0.4';
                        btn.style.cursor = 'default';
                        btn.title = '暂无锚点';
                    }
                }
            });
        }

        // 滚动到页面顶部
        scrollToTop() {
            // 点击去顶部时，自动记录当前位置为锚点
            this.anchorManager.setAnchor(this.scrollManager.scrollTop);

            const container = this.scrollManager.container;
            if (!container) {
                // 容器不存在时，走原逻辑
                this.historyLoader.loadAllAndScrollTop();
                return;
            }

            // 检测是否在 Flutter 图文并茂模式
            const isFlutterView = container.tagName?.toLowerCase().startsWith('flt-');

            if (isFlutterView) {
                // Flutter 图文并茂：使用循环滚动确保真正到达顶部
                // transform: scale() 会导致 scrollTop 设置不准确
                const scrollStep = () => {
                    const before = container.scrollTop;
                    container.scrollTop = 0;
                    // 如果滚动位置还在变化，继续滚动
                    if (container.scrollTop < before) {
                        requestAnimationFrame(scrollStep);
                    }
                };
                scrollStep();
            } else {
                // 普通模式：加载全部历史记录并滚动到真正的顶部
                this.historyLoader.loadAllAndScrollTop();
            }
        }

        // 滚动到页面底部
        scrollToBottom() {
            // 取消进行中的历史加载
            this.historyLoader.abort();
            // 点击去底部时，自动记录当前位置为锚点
            this.anchorManager.setAnchor(this.scrollManager.scrollTop);

            const container = this.scrollManager.container;
            if (!container) return;

            // 检测是否在 Flutter 图文并茂模式（有 transform: scale 缩放）
            // 在这种模式下，scrollHeight 报告的值可能不准确
            const isFlutterView = container.tagName?.toLowerCase().startsWith('flt-');

            if (isFlutterView) {
                // Flutter 图文并茂：使用循环滚动确保真正触底
                // transform: scale() 会导致 scrollHeight 与实际滚动距离不匹配
                const scrollStep = () => {
                    const before = container.scrollTop;
                    container.scrollTop = container.scrollHeight;
                    // 如果滚动位置还在变化，继续滚动
                    if (container.scrollTop > before) {
                        requestAnimationFrame(scrollStep);
                    }
                };
                scrollStep();
            } else {
                // 普通模式：直接滚动
                this.scrollManager.scrollTo({ top: this.scrollManager.scrollHeight, behavior: 'smooth' });
            }
        }

        // ========== 边缘吸附功能方法 ==========

        // 吸附到边缘
        snapToEdge(edge) {
            const panel = document.getElementById('gemini-helper-panel');
            if (!panel) return;

            // 移除已有的吸附类
            panel.classList.remove('edge-snapped-left', 'edge-snapped-right');

            // 添加对应边缘的吸附类
            panel.classList.add(`edge-snapped-${edge}`);
            this.edgeSnapState = edge;

            // 显示触发条
            this.showEdgeTrigger(edge);
        }

        // 取消吸附
        unsnap() {
            const panel = document.getElementById('gemini-helper-panel');
            if (!panel) return;

            panel.classList.remove('edge-snapped-left', 'edge-snapped-right');
            this.edgeSnapState = null;

            // 隐藏触发条
            this.hideEdgeTrigger();
        }

        // 显示边缘触发条
        showEdgeTrigger(edge) {
            // 先移除已有的触发条
            this.hideEdgeTrigger();

            const trigger = createElement('div', {
                className: `edge-snap-trigger ${edge} visible`,
                id: 'edge-snap-trigger',
            });

            // 点击触发条临时显示面板（保持 edgeSnapState 用于 mouseleave 恢复）
            trigger.addEventListener('click', () => {
                const panel = document.getElementById('gemini-helper-panel');
                if (panel) {
                    panel.classList.remove('edge-snapped-left', 'edge-snapped-right');
                }
                this.hideEdgeTrigger();
            });

            document.body.appendChild(trigger);
        }

        // 隐藏边缘触发条
        hideEdgeTrigger() {
            const trigger = document.getElementById('edge-snap-trigger');
            if (trigger) {
                trigger.remove();
            }
        }

        // ========== 手动锚点功能方法 ==========

        // 设置手动锚点
        setAnchorManually() {
            this.savedAnchorTop = this.scrollManager.scrollTop;
            this.showAnchorMarker(this.savedAnchorTop);
            this.updateManualAnchorButtonState(true);
            showToast(this.t('setAnchorToast'));
        }

        // 返回手动锚点
        backToManualAnchor() {
            if (this.savedAnchorTop !== null) {
                const container = this.scrollManager.container;
                const targetTop = this.savedAnchorTop;

                // 检测是否在 Flutter 图文并茂模式
                const isFlutterView = container?.tagName?.toLowerCase().startsWith('flt-');

                if (isFlutterView && container) {
                    // Flutter 图文并茂：直接设置 scrollTop
                    // 由于锚点保存和恢复使用的是相同的坐标系，直接设置即可
                    container.scrollTop = targetTop;
                } else {
                    // 普通模式：平滑滚动
                    this.scrollManager.scrollTo({ top: targetTop, behavior: 'smooth' });
                }
                showToast(this.t('backToAnchor'));
            } else {
                showToast(this.t('noAnchor'));
            }
        }

        // 清除手动锚点
        clearAnchorManually() {
            this.savedAnchorTop = null;
            this.hideAnchorMarker();
            this.updateManualAnchorButtonState(false);
            showToast(this.t('clearAnchorToast'));
        }

        // 显示锚点标记
        showAnchorMarker(scrollTop) {
            // 先移除已有标记
            this.hideAnchorMarker();

            const container = this.scrollManager.container;
            if (!container) return;

            // 确保容器有 position 定位
            const containerStyle = window.getComputedStyle(container);
            if (containerStyle.position === 'static') {
                container.style.position = 'relative';
            }

            const marker = createElement('div', {
                className: 'manual-anchor-marker',
                id: 'manual-anchor-marker',
                style: `top: ${scrollTop}px;`,
            });

            container.appendChild(marker);
        }

        // 隐藏锚点标记
        hideAnchorMarker() {
            const marker = document.getElementById('manual-anchor-marker');
            if (marker) {
                marker.remove();
            }
        }

        // 更新手动锚点按钮状态
        updateManualAnchorButtonState(hasAnchor) {
            const backBtn = document.getElementById('manual-anchor-back-btn');
            if (backBtn) {
                if (hasAnchor) {
                    backBtn.classList.add('has-anchor');
                    backBtn.title = this.t('backToAnchor');
                } else {
                    backBtn.classList.remove('has-anchor');
                    backBtn.title = this.t('noAnchor');
                }
            }
        }

        refreshCategories() {
            const container = document.getElementById('prompt-categories');
            if (!container) return;
            const categories = this.getCategories();
            clearElement(container);
            container.appendChild(
                createElement(
                    'span',
                    {
                        className: 'category-tag active',
                        'data-category': 'all',
                    },
                    this.t('allCategory'),
                ),
            );
            categories.forEach((cat) => {
                container.appendChild(createElement('span', { className: 'category-tag', 'data-category': cat }, cat));
            });
            // 添加分类管理按钮
            const manageBtn = createElement(
                'button',
                {
                    className: 'category-manage-btn',
                    title: this.t('categoryManage'),
                },
                this.t('manageCategory'),
            );
            manageBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showCategoryModal();
            });
            container.appendChild(manageBtn);
        }

        // 显示分类管理弹窗
        showCategoryModal() {
            const categories = this.getCategories();
            const modal = createElement('div', { className: 'prompt-modal' });
            const modalContent = createElement('div', { className: 'prompt-modal-content category-modal-content' });

            const modalHeader = createElement('div', { className: 'prompt-modal-header' }, this.t('categoryManage'));
            modalContent.appendChild(modalHeader);

            const categoryList = createElement('div', { className: 'category-list' });

            if (categories.length === 0) {
                categoryList.appendChild(createElement('div', { className: 'category-empty' }, this.t('categoryEmpty')));
            } else {
                categories.forEach((cat) => {
                    const count = this.prompts.filter((p) => p.category === cat).length;
                    const item = createElement('div', { className: 'category-item' });

                    const info = createElement('div', { className: 'category-item-info' });
                    info.appendChild(createElement('span', { className: 'category-item-name' }, cat));
                    info.appendChild(createElement('span', { className: 'category-item-count' }, `${count} 个提示词`));

                    const actions = createElement('div', { className: 'category-item-actions' });
                    const renameBtn = createElement('button', { className: 'category-action-btn rename' }, this.t('rename'));
                    const deleteBtn = createElement('button', { className: 'category-action-btn delete' }, this.t('delete'));

                    renameBtn.addEventListener('click', () => {
                        const newName = window.prompt(this.t('newCategoryName'), cat);
                        if (newName && newName.trim() && newName !== cat) {
                            this.renameCategory(cat, newName.trim());
                            modal.remove();
                            this.showCategoryModal();
                        }
                    });

                    deleteBtn.addEventListener('click', () => {
                        if (confirm(this.t('confirmDeleteCategory'))) {
                            this.deleteCategory(cat);
                            modal.remove();
                            this.showCategoryModal();
                        }
                    });

                    actions.appendChild(renameBtn);
                    actions.appendChild(deleteBtn);
                    item.appendChild(info);
                    item.appendChild(actions);
                    categoryList.appendChild(item);
                });
            }

            modalContent.appendChild(categoryList);

            const btnGroup = createElement('div', { className: 'prompt-modal-btns' });
            const closeBtn = createElement('button', { className: 'prompt-modal-btn secondary' }, this.t('cancel'));
            closeBtn.addEventListener('click', () => modal.remove());
            btnGroup.appendChild(closeBtn);
            modalContent.appendChild(btnGroup);

            modal.appendChild(modalContent);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
            document.body.appendChild(modal);
        }

        // 重命名分类
        renameCategory(oldName, newName) {
            this.prompts.forEach((p) => {
                if (p.category === oldName) {
                    p.category = newName;
                }
            });
            this.savePrompts();
            this.refreshCategories();
            this.refreshPromptList();
            showToast(`分类已重命名为"${newName}"`);
        }

        // 删除分类（将关联提示词移至"未分类"）
        deleteCategory(name) {
            this.prompts.forEach((p) => {
                if (p.category === name) {
                    p.category = '未分类';
                }
            });
            this.savePrompts();
            this.refreshCategories();
            this.refreshPromptList();
            showToast(`分类"${name}"已删除`);
        }

        refreshPromptList(filter = '') {
            const container = document.getElementById('prompt-list');
            if (!container) return;
            const activeCategory = document.querySelector('.category-tag.active')?.dataset.category || 'all';
            let filteredPrompts = this.prompts;

            if (activeCategory !== 'all') filteredPrompts = filteredPrompts.filter((p) => p.category === activeCategory);
            if (filter) filteredPrompts = filteredPrompts.filter((p) => p.title.toLowerCase().includes(filter.toLowerCase()) || p.content.toLowerCase().includes(filter.toLowerCase()));

            clearElement(container);

            if (filteredPrompts.length === 0) {
                container.appendChild(createElement('div', { style: 'text-align: center; padding: 20px; color: #9ca3af;' }, '暂无提示词'));
                return;
            }

            filteredPrompts.forEach((prompt, index) => {
                const item = createElement('div', {
                    className: 'prompt-item',
                    draggable: 'false',
                    style: 'user-select: none;',
                });
                item.dataset.promptId = prompt.id;
                item.dataset.index = index;
                if (this.selectedPrompt?.id === prompt.id) item.classList.add('selected');

                const itemHeader = createElement('div', { className: 'prompt-item-header' });
                itemHeader.appendChild(createElement('div', { className: 'prompt-item-title' }, prompt.title));
                itemHeader.appendChild(createElement('span', { className: 'prompt-item-category' }, prompt.category || '未分类'));

                const itemContent = createElement('div', { className: 'prompt-item-content' }, prompt.content);
                const itemActions = createElement('div', { className: 'prompt-item-actions' });
                const dragBtn = createElement(
                    'button',
                    {
                        className: 'prompt-action-btn drag-prompt',
                        'data-id': prompt.id,
                        title: '拖动排序',
                    },
                    '☰',
                );
                dragBtn.style.cursor = 'grab';

                // 仅当按下拖拽按钮时才允许拖动
                dragBtn.addEventListener('mousedown', () => {
                    item.setAttribute('draggable', 'true');
                    // 监听全局鼠标释放，恢复不可拖动
                    const upHandler = () => {
                        item.setAttribute('draggable', 'false');
                        window.removeEventListener('mouseup', upHandler);
                    };
                    window.addEventListener('mouseup', upHandler);
                });

                itemActions.appendChild(dragBtn);
                itemActions.appendChild(
                    createElement(
                        'button',
                        {
                            className: 'prompt-action-btn copy-prompt',
                            'data-id': prompt.id,
                            title: '复制',
                        },
                        '📋',
                    ),
                );
                itemActions.appendChild(
                    createElement(
                        'button',
                        {
                            className: 'prompt-action-btn edit-prompt',
                            'data-id': prompt.id,
                            title: '编辑',
                        },
                        '✏',
                    ),
                );
                itemActions.appendChild(
                    createElement(
                        'button',
                        {
                            className: 'prompt-action-btn delete-prompt',
                            'data-id': prompt.id,
                            title: '删除',
                        },
                        '🗑',
                    ),
                );

                item.appendChild(itemHeader);
                item.appendChild(itemContent);
                item.appendChild(itemActions);

                item.addEventListener('click', (e) => {
                    if (!e.target.closest('.prompt-item-actions')) this.selectPrompt(prompt, item);
                });

                // 拖拽事件处理
                item.addEventListener('dragstart', (e) => {
                    item.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/html', item.innerHTML);
                });

                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const draggingItem = container.querySelector('.dragging');
                    if (draggingItem && draggingItem !== item) {
                        const rect = item.getBoundingClientRect();
                        const midpoint = rect.top + rect.height / 2;
                        if (e.clientY < midpoint) {
                            container.insertBefore(draggingItem, item);
                        } else {
                            container.insertBefore(draggingItem, item.nextSibling);
                        }
                    }
                });

                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                    item.setAttribute('draggable', 'false'); // 拖拽结束立即恢复
                    this.updatePromptOrder();
                });

                container.appendChild(item);
            });
        }

        // 更新提示词顺序
        updatePromptOrder() {
            const container = document.getElementById('prompt-list');
            const items = Array.from(container.querySelectorAll('.prompt-item'));
            const newOrder = items.map((item) => item.dataset.promptId);

            // 重新排列 prompts 数组
            const orderedPrompts = [];
            newOrder.forEach((id) => {
                const prompt = this.prompts.find((p) => p.id === id);
                if (prompt) orderedPrompts.push(prompt);
            });

            this.prompts = orderedPrompts;
            this.savePrompts();
            showToast(this.t('orderUpdated'));
        }

        selectPrompt(prompt, itemElement) {
            if (this.isScrolling) {
                showToast(this.t('scrolling'));
                return;
            }
            this.selectedPrompt = prompt;
            document.querySelectorAll('.prompt-item').forEach((item) => item.classList.remove('selected'));
            itemElement.classList.add('selected');

            // 显示当前提示词悬浮条
            const selectedBar = document.querySelector('.selected-prompt-bar');
            const selectedText = document.getElementById('selected-prompt-text');
            if (selectedBar && selectedText) {
                selectedText.textContent = prompt.title;
                selectedBar.classList.add('show');
            }

            // 先插入内容
            this.insertPromptToTextarea(prompt.content);
            showToast(`${this.t('inserted')}: ${prompt.title}`);

            // 多次延迟更新悬浮条位置，确保输入框高度完全更新
            // 第一次快速响应，后续作为补偿
            [50, 200, 400, 1200].forEach((delay) => {
                setTimeout(() => {
                    this.updateSelectedBarPosition();
                }, delay);
            });
        }

        insertPromptToTextarea(promptContent) {
            if (this.isScrolling) {
                showToast('页面正在滚动，请稍后再选择提示词');
                return;
            }
            const promiseOrResult = this.siteAdapter.insertPrompt(promptContent);

            // 处理异步返回 (Gemini Business 是异步的)
            if (promiseOrResult instanceof Promise) {
                promiseOrResult.then((success) => {
                    if (!success) {
                        showToast('未找到输入框，请点击输入框后重试');
                        // 再次尝试查找
                        this.siteAdapter.findTextarea();
                    }
                });
            } else if (!promiseOrResult) {
                showToast('未找到输入框，请点击输入框后重试');
                this.siteAdapter.findTextarea();
            }
        }

        clearSelectedPrompt() {
            this.selectedPrompt = null;
            document.querySelector('.selected-prompt-bar')?.classList.remove('show');
            document.querySelectorAll('.prompt-item').forEach((item) => item.classList.remove('selected'));
        }

        // 动态更新悬浮条位置（基于输入框容器位置）
        updateSelectedBarPosition() {
            const bar = document.querySelector('.selected-prompt-bar');
            const textarea = this.siteAdapter?.textarea;

            if (!bar) return;

            // 如果没有输入框引用或输入框不在 DOM 中，使用默认位置
            if (!textarea || !textarea.isConnected) {
                bar.style.bottom = '120px';
                return;
            }

            // 查找输入框的容器：向上遍历找到有边框的元素（Gemini 输入框容器有圆角边框）
            let inputContainer = textarea;
            let parent = textarea.parentElement;
            for (let i = 0; i < 10 && parent && parent !== document.body; i++) {
                const style = window.getComputedStyle(parent);
                // 查找有边框或圆角的容器
                if (style.borderRadius && parseFloat(style.borderRadius) > 0) {
                    inputContainer = parent;
                    break;
                }
                parent = parent.parentElement;
            }

            const containerRect = inputContainer.getBoundingClientRect();
            const viewportHeight = window.innerHeight;

            // 悬浮条显示在输入容器上方，保持 20px 间距
            const desiredBottom = viewportHeight - containerRect.top + 20;

            // 确保不会太靠近顶部（最小 50px 距顶），也不会太靠近底部
            const clampedBottom = Math.max(50, Math.min(desiredBottom, viewportHeight - 50));
            bar.style.bottom = clampedBottom + 'px';
        }

        showEditModal(prompt = null) {
            const isEdit = prompt !== null;
            const modal = createElement('div', { className: 'prompt-modal' });
            const modalContent = createElement('div', { className: 'prompt-modal-content' });

            const modalHeader = createElement('div', { className: 'prompt-modal-header' }, isEdit ? this.t('editPrompt') : this.t('addNewPrompt'));

            const titleGroup = createElement('div', { className: 'prompt-form-group' });
            titleGroup.appendChild(createElement('label', { className: 'prompt-form-label' }, this.t('title')));
            const titleInput = createElement('input', {
                className: 'prompt-form-input',
                type: 'text',
                value: isEdit ? prompt.title : '',
            });
            titleGroup.appendChild(titleInput);

            const categoryGroup = createElement('div', { className: 'prompt-form-group' });
            categoryGroup.appendChild(createElement('label', { className: 'prompt-form-label' }, this.t('category')));
            const categoryInput = createElement('input', {
                className: 'prompt-form-input',
                type: 'text',
                value: isEdit ? prompt.category || '' : '',
                placeholder: this.t('categoryPlaceholder'),
            });
            categoryGroup.appendChild(categoryInput);

            const contentGroup = createElement('div', { className: 'prompt-form-group' });
            contentGroup.appendChild(createElement('label', { className: 'prompt-form-label' }, this.t('content')));
            const contentTextarea = createElement('textarea', { className: 'prompt-form-textarea' });
            contentTextarea.value = isEdit ? prompt.content : '';
            contentGroup.appendChild(contentTextarea);

            const modalActions = createElement('div', { className: 'prompt-modal-actions' });
            const cancelBtn = createElement('button', { className: 'prompt-modal-btn secondary' }, this.t('cancel'));
            const saveBtn = createElement('button', { className: 'prompt-modal-btn primary' }, isEdit ? this.t('save') : this.t('add'));

            modalActions.appendChild(cancelBtn);
            modalActions.appendChild(saveBtn);

            modalContent.appendChild(modalHeader);
            modalContent.appendChild(titleGroup);
            modalContent.appendChild(categoryGroup);
            modalContent.appendChild(contentGroup);
            modalContent.appendChild(modalActions);
            modal.appendChild(modalContent);
            document.body.appendChild(modal);

            cancelBtn.addEventListener('click', () => modal.remove());
            saveBtn.addEventListener('click', () => {
                const title = titleInput.value.trim();
                const content = contentTextarea.value.trim();
                if (!title || !content) {
                    alert(this.t('fillTitleContent'));
                    return;
                }

                if (isEdit) {
                    this.updatePrompt(prompt.id, { title, category: categoryInput.value.trim(), content });
                    showToast(this.t('promptUpdated'));
                } else {
                    this.addPrompt({ title, category: categoryInput.value.trim(), content });
                    showToast(this.t('promptAdded'));
                }
                modal.remove();
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
        }

        findElementByComposedPath(e) {
            if (!e) return null;
            // 获取事件的完整传播路径（兼容没有 composedPath 的浏览器）
            const path = typeof e.composedPath === 'function' ? e.composedPath() : e.path || [];

            // 获取提交按钮选择器数组并合并成 selector 字符串
            const selectors = this.siteAdapter && typeof this.siteAdapter.getSubmitButtonSelectors === 'function' ? this.siteAdapter.getSubmitButtonSelectors() : [];
            const combinedSelector = selectors.length ? selectors.join(', ') : '';

            if (!combinedSelector) return null;

            // 查找路径中第一个符合条件的元素
            const foundElement = path.find((element) => element && element instanceof Element && typeof element.matches === 'function' && element.matches(combinedSelector));

            return foundElement || null;
        }

        bindEvents() {
            const searchInput = document.getElementById('prompt-search');
            if (searchInput) searchInput.addEventListener('input', (e) => this.refreshPromptList(e.target.value));

            const categories = document.getElementById('prompt-categories');
            if (categories) {
                categories.addEventListener('click', (e) => {
                    if (e.target.classList.contains('category-tag')) {
                        document.querySelectorAll('.category-tag').forEach((tag) => tag.classList.remove('active'));
                        e.target.classList.add('active');
                        this.refreshPromptList(document.getElementById('prompt-search')?.value || '');
                    }
                });
            }
            // 全局快捷键监听
            document.addEventListener('keydown', (e) => {
                // Alt + B: 滚动到底部
                if (e.altKey && (e.key === 'b' || e.key === 'B')) {
                    e.preventDefault(); // 阻止浏览器默认行为
                    this.scrollToBottom();
                }
                // Alt+Z 回到之前的锚点
                if (e.altKey && (e.key === 'z' || e.key === 'Z')) {
                    e.preventDefault();
                    this.handleAnchorClick();
                }
                // Alt+T (Top) 回顶部
                if (e.altKey && (e.key === 't' || e.key === 'T')) {
                    e.preventDefault();
                    this.scrollToTop();
                }
            });
            document.getElementById('add-prompt')?.addEventListener('click', () => this.showEditModal());
            document.getElementById('prompt-list')?.addEventListener('click', (e) => {
                if (e.target.classList.contains('edit-prompt')) {
                    const prompt = this.prompts.find((p) => p.id === e.target.dataset.id);
                    if (prompt) this.showEditModal(prompt);
                } else if (e.target.classList.contains('delete-prompt')) {
                    if (confirm(this.t('confirmDelete'))) {
                        this.deletePrompt(e.target.dataset.id);
                        showToast(this.t('deleted'));
                    }
                } else if (e.target.classList.contains('copy-prompt')) {
                    const prompt = this.prompts.find((p) => p.id === e.target.dataset.id);
                    if (prompt) {
                        navigator.clipboard
                            .writeText(prompt.content)
                            .then(() => {
                                showToast(this.t('copied'));
                            })
                            .catch(() => {
                                // 降级方案
                                const textarea = document.createElement('textarea');
                                textarea.value = prompt.content;
                                document.body.appendChild(textarea);
                                textarea.select();
                                document.execCommand('copy');
                                document.body.removeChild(textarea);
                                showToast(this.t('copied'));
                            });
                    }
                }
            });

            document.getElementById('clear-prompt')?.addEventListener('click', () => {
                this.clearSelectedPrompt();
                // 针对 Gemini Business，根据设置决定是否用零宽字符清空
                if (this.siteAdapter instanceof GeminiBusinessAdapter) {
                    if (this.settings.clearTextareaOnSend) {
                        this.siteAdapter.clearTextarea(); // 插入零宽字符
                    } else {
                        this.siteAdapter.clearTextareaNormal(); // 普通清空
                    }
                } else {
                    // 其他适配器调用各自的 clearTextarea 方法
                    this.siteAdapter.clearTextarea();
                }
                showToast(this.t('cleared'));
            });

            this.makeDraggable();

            // 2. 按钮点击监听
            document.addEventListener('click', (e) => {
                // 委托适配器检查是否为输入框，自动更新引用
                if (this.siteAdapter.isValidTextarea(e.target)) {
                    this.siteAdapter.textarea = e.target;
                } else {
                    const closest = e.target.closest('[contenteditable="true"], .ProseMirror, textarea');
                    if (closest && this.siteAdapter.isValidTextarea(closest)) {
                        this.siteAdapter.textarea = closest;
                    }
                }

                // 检测是否点击了发送按钮
                const found = this.findElementByComposedPath(e);
                let matched = !!found;
                // 如果 composedPath 没命中，尝试使用 closest 回退（兼容 Shadow DOM 之外的情况）
                if (!matched && e && e.target && typeof e.target.closest === 'function') {
                    const selectors = this.siteAdapter && typeof this.siteAdapter.getSubmitButtonSelectors === 'function' ? this.siteAdapter.getSubmitButtonSelectors() : [];
                    const combined = selectors.length ? selectors.join(', ') : '';
                    if (combined) {
                        try {
                            matched = !!e.target.closest(combined);
                        } catch (err) {
                            matched = false;
                        }
                    }
                }

                if (matched) {
                    // 如果有选中的提示词，清除悬浮条
                    if (this.selectedPrompt) {
                        setTimeout(() => {
                            this.clearSelectedPrompt();
                        }, 100);
                    }
                    // 针对 Gemini Business：无论是否使用提示词，发送后都修复中文输入
                    if (this.siteAdapter instanceof GeminiBusinessAdapter && this.settings.clearTextareaOnSend) {
                        setTimeout(() => {
                            this.siteAdapter.clearTextarea();
                        }, 200);
                    }
                }
            });

            // 3. 回车键发送监听
            document.addEventListener(
                'keydown',
                (e) => {
                    // 仅处理 Enter 键（不带 Shift 修饰符，避免干扰换行操作）
                    if (e.key !== 'Enter' || e.shiftKey) return;

                    // 使用 composedPath 检查事件源是否来自输入框（兼容 Shadow DOM）
                    const path = typeof e.composedPath === 'function' ? e.composedPath() : e.path || [];
                    const isFromTextarea = path.some((element) => element && element instanceof Element && this.siteAdapter.isValidTextarea(element));

                    if (!isFromTextarea) return;

                    // 清理逻辑
                    if (this.selectedPrompt) {
                        setTimeout(() => {
                            this.clearSelectedPrompt();
                        }, 100);
                    }
                    // 针对 Gemini Business：无论是否使用提示词，发送后都修复中文输入
                    if (this.siteAdapter instanceof GeminiBusinessAdapter && this.settings.clearTextareaOnSend) {
                        setTimeout(() => {
                            this.siteAdapter.clearTextarea();
                        }, 200);
                    }
                },
                true,
            ); // 使用捕获阶段确保在 Shadow DOM 场景下也能捕获

            document.getElementById('toggle-panel')?.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止冒泡，避免触发 auto-hide
                this.togglePanel();
            });

            // 4. 全局点击监听（处理自动隐藏）
            document.addEventListener('click', (e) => {
                // 如果是自动隐藏开启，且面板是展开的
                if (this.settings.autoHidePanel && !this.isCollapsed) {
                    const panel = document.getElementById('gemini-helper-panel');
                    const toggleBtn = document.getElementById('toggle-panel');
                    const quickBtnGroup = document.getElementById('quick-btn-group');

                    // 检查点击目标是否在面板外部
                    // 注意：需要排除 toggleBtn 和 quickBtnGroup，以及 panel 本身
                    // 同时排除面板内的任何元素
                    if (panel && !panel.contains(e.target) && !toggleBtn?.contains(e.target) && !quickBtnGroup?.contains(e.target)) {
                        // 额外的安全检查：确保不是点击了面板内的弹出层（如 modal）
                        // 通常 modal 是直接挂在 body 上的，所以如果 modal 打开时，点击 modal 内容不应该隐藏
                        // 但是 modal 通常覆盖全屏，点击 modal 遮罩通过 modal 自己的逻辑关闭。
                        // 这里主要关注点击页面其他部分。

                        this.togglePanel();
                    }
                }
            });

            this.makeDraggable();

            // 初始化 URL 监听 (处理 SPA 页面跳转)
            this.initUrlChangeObserver();

            // 窗口大小变化时更新悬浮条位置
            window.addEventListener('resize', () => {
                if (this.selectedPrompt) {
                    this.updateSelectedBarPosition();
                }
            });
        }

        initUrlChangeObserver() {
            let lastUrl = window.location.href;

            const checkUrl = () => {
                const currentUrl = window.location.href;
                if (currentUrl !== lastUrl) {
                    lastUrl = currentUrl;

                    // URL 变化时，先停止录制（防止错误覆盖新会话的持久化数据）
                    this.readingProgressManager.stopRecording();

                    // 重置内存中的锚点状态
                    this.anchorScrollTop = null;
                    this.anchorManager.reset();

                    // 会话切换时清除悬浮条和选中的提示词
                    this.clearSelectedPrompt();

                    // 会话切换时立即更新标签页标题
                    if (this.tabRenameManager && this.settings.tabSettings?.autoRenameTab) {
                        // 清除缓存的会话名称，强制从新会话获取
                        this.tabRenameManager.lastSessionName = null;
                        // 多次尝试更新，因为 Gemini 可能需要时间来更新页面标题
                        [300, 800, 1500].forEach((delay) => {
                            setTimeout(() => {
                                this.tabRenameManager.updateTabName(true);
                            }, delay);
                        });
                    }

                    // 给予页面渲染一点时间后尝试恢复
                    setTimeout(() => {
                        this.restoreReadingProgress();
                        // 切换会话后 textarea 引用可能失效，需要重新查找
                        this.siteAdapter.findTextarea();
                        // 仅在成功找到输入框时才清空，避免全选问题
                        if (this.siteAdapter.textarea) {
                            this.siteAdapter.clearTextarea();
                        }
                    }, 1500);
                }
            };

            // 1. 监听 popstate (后退/前进)
            window.addEventListener('popstate', checkUrl);

            // 2. Monkey patch pushState/replaceState
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;

            history.pushState = function () {
                originalPushState.apply(this, arguments);
                checkUrl();
            };

            history.replaceState = function () {
                originalReplaceState.apply(this, arguments);
                checkUrl();
            };

            // 3. 定时器兜底 (防止某些框架绕过 history API)
            // 同时用于检测 Sidebar Observer 的存活状态
            setInterval(() => {
                checkUrl();
                // 周期性检查 Observer 是否存活 (Zombie Check)
                if (this.conversationManager) {
                    this.conversationManager.checkObserverStatus();
                }
            }, 1000);
        }

        makeDraggable() {
            const panel = document.getElementById('gemini-helper-panel');
            const header = panel?.querySelector('.prompt-panel-header');
            if (!panel || !header) return;

            let isDragging = false;
            let offsetX = 0; // 鼠标相对于面板左上角的偏移
            let offsetY = 0;
            let hasDragged = false; // 标记是否曾经拖拽过（用于判断是否需要边界检测）

            header.addEventListener('mousedown', (e) => {
                if (e.target.closest('.prompt-panel-controls')) return;
                e.preventDefault(); // 阻止文本选中

                // 如果当前处于吸附状态，先取消吸附
                if (this.edgeSnapState) {
                    this.unsnap();
                }

                // 读取面板当前的实际位置
                const rect = panel.getBoundingClientRect();

                // 计算鼠标相对于面板左上角的偏移（在整个拖拽过程中保持不变）
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;

                // 首次拖拽时，将 CSS 定位从 right+transform 切换为 left+top
                // 这样后续拖拽就不会有跳动问题
                panel.style.left = rect.left + 'px';
                panel.style.top = rect.top + 'px';
                panel.style.right = 'auto'; // 清除 right 定位
                panel.style.transform = 'none'; // 清除 translateY(-50%)

                isDragging = true;
                hasDragged = true; // 标记已拖拽过
                // 拖动时禁止全局文本选中
                document.body.style.userSelect = 'none';
            });

            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    e.preventDefault();
                    // 直接计算面板左上角位置 = 鼠标位置 - 初始偏移
                    panel.style.left = e.clientX - offsetX + 'px';
                    panel.style.top = e.clientY - offsetY + 'px';
                }
            });

            document.addEventListener('mouseup', (e) => {
                if (isDragging) {
                    isDragging = false;
                    // 恢复文本选中
                    document.body.style.userSelect = '';

                    // 边缘吸附检测（仅当功能开启时）
                    if (this.settings.edgeSnapHide) {
                        const rect = panel.getBoundingClientRect();
                        const snapThreshold = 30; // 距离边缘30px时触发吸附

                        if (rect.left < snapThreshold) {
                            // 吸附到左边缘
                            this.snapToEdge('left');
                        } else if (window.innerWidth - rect.right < snapThreshold) {
                            // 吸附到右边缘
                            this.snapToEdge('right');
                        }
                    }
                }
            });

            // 边界检测：确保面板在视口内可见
            const clampToViewport = () => {
                // 跳过条件：未拖拽过 或 面板已收起 或 处于吸附状态
                if (!hasDragged || panel.classList.contains('collapsed') || this.edgeSnapState) return;

                const rect = panel.getBoundingClientRect();
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const margin = 10; // 边距

                let newLeft = parseFloat(panel.style.left);
                let newTop = parseFloat(panel.style.top);

                // 超出右边界
                if (rect.right > vw) newLeft = vw - rect.width - margin;
                // 超出下边界
                if (rect.bottom > vh) newTop = vh - rect.height - margin;
                // 超出左边界
                if (rect.left < 0) newLeft = margin;
                // 超出上边界
                if (rect.top < 0) newTop = margin;

                panel.style.left = newLeft + 'px';
                panel.style.top = newTop + 'px';
            };

            window.addEventListener('resize', clampToViewport);

            // 边缘吸附自动恢复：鼠标移出面板时，如果有记忆的吸附状态，恢复吸附
            panel.addEventListener('mouseleave', (e) => {
                // 条件检查：有吸附状态 + 面板未折叠 + 边缘吸附功能开启
                if (!this.edgeSnapState || this.isCollapsed || !this.settings.edgeSnapHide) return;

                // 排除：鼠标移到快捷按钮组
                const quickBtnGroup = document.getElementById('quick-btn-group');
                if (quickBtnGroup?.contains(e.relatedTarget)) return;

                // 恢复吸附 CSS 类和触发条
                panel.classList.add(`edge-snapped-${this.edgeSnapState}`);
                this.showEdgeTrigger(this.edgeSnapState);
            });
        }
    }

    function init() {
        try {
            console.log('Gemini Helper: Initializing...');
            // 初始化站点注册表
            const siteRegistry = new SiteRegistry();
            siteRegistry.register(new GeminiBusinessAdapter()); // 优先检测
            siteRegistry.register(new GeminiAdapter());

            const currentAdapter = siteRegistry.detect();

            if (!currentAdapter) {
                console.log('Gemini Helper: 未匹配到当前站点，跳过初始化。');
                return;
            }

            console.log(`Gemini Helper: 已匹配站点 - ${currentAdapter.getName()}`);

            setTimeout(() => {
                try {
                    console.log('Gemini Helper: Creating instance...');
                    window.geminiHelper = new GeminiHelper(siteRegistry);
                    console.log('Gemini Helper: Instance created successfully.');
                } catch (error) {
                    console.error('Gemini Helper: 启动失败 (Constructor Error)', error);
                }
            }, 2000);
        } catch (e) {
            console.error('Gemini Helper: 初始化失败 (Init Error)', e);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
