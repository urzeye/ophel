// Optimized for TypeScript and Plasmo (MV3)

export class BackgroundTimer {
  private callback: ((ts: number) => void) | null;
  private intervalMs: number;
  private worker: Worker | null = null;
  private workerUrl: string | null = null;
  private _isRunning = false;
  private _fallbackTimerId: NodeJS.Timeout | null = null;

  constructor(callback: (ts: number) => void, intervalMs = 1000) {
    this.callback = callback;
    this.intervalMs = intervalMs;
  }

  start() {
    if (this._isRunning) return;

    try {
      const workerScript = `
                let timerId = null;
                let interval = ${this.intervalMs};

                self.onmessage = function(e) {
                    const { type, data } = e.data;
                    switch (type) {
                        case 'start':
                            if (timerId) clearInterval(timerId);
                            timerId = setInterval(() => {
                                self.postMessage({ type: 'tick', timestamp: Date.now() });
                            }, interval);
                            break;
                        case 'stop':
                            if (timerId) { clearInterval(timerId); timerId = null; }
                            break;
                        case 'setInterval':
                            interval = data;
                            if (timerId) {
                                clearInterval(timerId);
                                timerId = setInterval(() => {
                                    self.postMessage({ type: 'tick', timestamp: Date.now() });
                                }, interval);
                            }
                            break;
                    }
                };
            `;

      const blob = new Blob([workerScript], { type: 'application/javascript' });
      this.workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(this.workerUrl);

      this.worker.onmessage = (e) => {
        if (e.data.type === 'tick' && this.callback) {
          try {
            this.callback(e.data.timestamp);
          } catch (err) {
            console.error('[BackgroundTimer] Callback error:', err);
          }
        }
      };

      this.worker.onerror = (err) => console.error('[BackgroundTimer] Worker error:', err);
      this.worker.postMessage({ type: 'start' });
    } catch (err) {
      console.warn(
        '[BackgroundTimer] Worker creation failed (CSP?), falling back to setInterval:',
        err,
      );
      this._fallbackTimerId = setInterval(() => {
        if (this.callback) {
          try {
            this.callback(Date.now());
          } catch (e) {
            console.error('[BackgroundTimer] Callback error:', e);
          }
        }
      }, this.intervalMs);
    }

    this._isRunning = true;
  }

  stop() {
    if (!this._isRunning) return;

    if (this.worker) {
      this.worker.postMessage({ type: 'stop' });
      this.worker.terminate();
      this.worker = null;
    }
    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }

    if (this._fallbackTimerId) {
      clearInterval(this._fallbackTimerId);
      this._fallbackTimerId = null;
    }

    this._isRunning = false;
  }
}

export class AudioKeepAlive {
  private audioCtx: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;
  private _isActive = false;

  start(): boolean {
    if (this._isActive) return true;

    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return false;

      this.audioCtx = new AudioContext();

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.oscillator = this.audioCtx.createOscillator();
      this.oscillator.type = 'sine';
      this.oscillator.frequency.value = 1;

      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 0.0001;

      this.oscillator.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);

      this.oscillator.start();
      this._isActive = true;
      return true;
    } catch (err) {
      console.error('[AudioKeepAlive] Start error:', err);
      return false;
    }
  }

  stop() {
    if (!this._isActive) return;

    try {
      if (this.oscillator) {
        this.oscillator.stop();
        this.oscillator.disconnect();
        this.oscillator = null;
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
      if (this.audioCtx) {
        this.audioCtx.close();
        this.audioCtx = null;
      }
    } catch (err) {
      console.error('[AudioKeepAlive] Stop error:', err);
    }
    this._isActive = false;
  }
}
