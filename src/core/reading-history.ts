import type { SiteAdapter } from '~adapters/base';
import { STORAGE_KEYS, type Settings, getLocalData, setLocalData } from '~utils/storage';

export interface ReadingPosition {
  top: number;
  ts: number;
  type?: 'selector' | 'index';
  selector?: string;
  textSignature?: string;
  index?: number;
  offset?: number;
}

export class ReadingHistoryManager {
  private adapter: SiteAdapter;
  private settings: Settings['readingHistory'];

  private isRecording = false;
  private listeningContainer: Element | null = null;
  private scrollHandler: ((e: Event) => void) | null = null;
  private lastSaveTime = 0;

  public restoredTop: number | undefined;

  constructor(adapter: SiteAdapter, settings: Settings['readingHistory']) {
    this.adapter = adapter;
    this.settings = settings;
  }

  updateSettings(settings: Settings['readingHistory']) {
    this.settings = settings;
    if (!this.settings.persistence && this.isRecording) {
      this.stopRecording();
    } else if (this.settings.persistence && !this.isRecording) {
      this.startRecording();
    }
  }

  startRecording() {
    if (this.isRecording) return;
    this.isRecording = true;

    this.scrollHandler = (e: Event) => this.handleScroll();

    const container = this.adapter.getScrollContainer();
    if (container) {
      container.addEventListener('scroll', this.scrollHandler, {
        passive: true,
      });
      this.listeningContainer = container;
    }

    window.addEventListener('scroll', this.scrollHandler, {
      capture: true,
      passive: true,
    });
  }

  stopRecording() {
    if (!this.isRecording) return;
    this.isRecording = false;

    if (this.scrollHandler) {
      if (this.listeningContainer) {
        this.listeningContainer.removeEventListener('scroll', this.scrollHandler);
        this.listeningContainer = null;
      }
      window.removeEventListener('scroll', this.scrollHandler, {
        capture: true,
      });
      this.scrollHandler = null;
    }
  }

  restartRecording() {
    this.stopRecording();
    this.startRecording();
  }

  private handleScroll() {
    if (!this.settings.persistence) return;

    const now = Date.now();
    if (now - this.lastSaveTime > 1000) {
      this.saveProgress();
      this.lastSaveTime = now;
    }
  }

  private getKey(): string {
    const sessionId = this.adapter.getSessionId() || 'unknown';
    const siteId = this.adapter.getSiteId();
    return `${siteId}:${sessionId}`;
  }

  private async saveProgress() {
    if (!this.isRecording) return;
    if (this.adapter.isNewConversation()) return;

    const container = this.adapter.getScrollContainer();
    // Or window scrollY if container is document?
    // Adapter.getScrollContainer usually returns the scroller div.
    // If not found, use document logic?
    const scrollTop = container ? container.scrollTop : window.scrollY;

    if (scrollTop < 0) return;

    const key = this.getKey();

    let anchorInfo = {};
    try {
      if (this.adapter.getVisibleAnchorElement) {
        anchorInfo = this.adapter.getVisibleAnchorElement() || {};
      }
    } catch (e) {
      console.error('Error getting visible anchor:', e);
    }

    const data: ReadingPosition = {
      top: scrollTop,
      ts: Date.now(),
      ...anchorInfo,
    };

    const allData = await getLocalData<Record<string, ReadingPosition>>(
      STORAGE_KEYS.LOCAL.READING_HISTORY,
      {},
    );
    allData[key] = data;
    await setLocalData(STORAGE_KEYS.LOCAL.READING_HISTORY, allData);
  }

  async restoreProgress(onProgress?: (msg: string) => void): Promise<boolean> {
    if (!this.settings.autoRestore) return false;

    const key = this.getKey();
    const allData = await getLocalData<Record<string, ReadingPosition>>(
      STORAGE_KEYS.LOCAL.READING_HISTORY,
      {},
    );
    const data = allData[key];

    if (!data) return false;

    const scrollContainer = this.adapter.getScrollContainer() || document.documentElement; // Fallback

    return new Promise((resolve) => {
      let historyLoadAttempts = 0;
      const maxHistoryLoadAttempts = 5;
      let lastScrollHeight = 0;

      const tryScroll = async (attempts = 0) => {
        // Break infinite loop
        if (attempts > 30) {
          if (data.top !== undefined) {
            this.rawScroll(scrollContainer, data.top);
            this.restoredTop = data.top;
            resolve(true);
          } else {
            resolve(false);
          }
          return;
        }

        // 1. Precise restore via content anchor
        let contentRestored = false;
        if (data.type && this.adapter.restoreScroll) {
          try {
            contentRestored = await this.adapter.restoreScroll(data as any);
          } catch (e) {
            console.error(e);
          }
        }

        if (contentRestored) {
          this.restoredTop = (scrollContainer as HTMLElement).scrollTop || window.scrollY;
          resolve(true);
          return;
        }

        // 2. Load more history logic
        const currentScrollHeight = scrollContainer.scrollHeight;
        // const heightChanged = currentScrollHeight !== lastScrollHeight
        lastScrollHeight = currentScrollHeight;

        const hasContentAnchor = !!(data.type && (data.textSignature || data.selector));
        const needsMoreHistory =
          hasContentAnchor || (data.top !== undefined && currentScrollHeight < data.top);
        const canLoadMore = historyLoadAttempts < maxHistoryLoadAttempts;

        if (needsMoreHistory && canLoadMore) {
          if (onProgress)
            onProgress(`Loading history (${historyLoadAttempts + 1}/${maxHistoryLoadAttempts})...`);

          // Scroll to top to trigger lazy load
          this.rawScroll(scrollContainer, 0);

          historyLoadAttempts++;
          setTimeout(() => tryScroll(attempts + 1), 2000);
        } else if (data.top !== undefined && currentScrollHeight >= data.top) {
          this.rawScroll(scrollContainer, data.top);
          this.restoredTop = data.top;
          resolve(true);
        } else if (!canLoadMore && hasContentAnchor) {
          setTimeout(() => tryScroll(attempts + 1), 500);
        } else {
          resolve(false);
        }
      };

      tryScroll();
    });
  }

  private rawScroll(container: Element | HTMLElement, top: number) {
    if (container instanceof HTMLElement || container instanceof Element) {
      container.scrollTop = top;
      if (container === document.documentElement) {
        window.scrollTo(0, top);
      }
    } else {
      window.scrollTo(0, top);
    }
  }

  async cleanup() {
    // Daily cleanup logic
    // Use a separate key for last cleanup run time
    const CLEANUP_KEY = 'reading_history_cleanup_last_run';
    const lastRun = await getLocalData<number>(CLEANUP_KEY, 0);
    const now = Date.now();

    if (now - lastRun < 24 * 60 * 60 * 1000) return;

    const days = this.settings.cleanupDays || 7;
    if (days === -1) return;

    const expireTime = days * 24 * 60 * 60 * 1000;
    const allData = await getLocalData<Record<string, ReadingPosition>>(
      STORAGE_KEYS.LOCAL.READING_HISTORY,
      {},
    );

    let changed = false;
    Object.keys(allData).forEach((k) => {
      if (now - allData[k].ts > expireTime) {
        delete allData[k];
        changed = true;
      }
    });

    if (changed) {
      await setLocalData(STORAGE_KEYS.LOCAL.READING_HISTORY, allData);
    }
    await setLocalData(CLEANUP_KEY, now);
  }
}
