// ==UserScript==
// @name         background-keep-alive
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  后台保活工具集：Web Worker 定时器、音频保活、网络请求监控
// @description:en  Background Keep-Alive Toolkit: Web Worker timer, Audio keep-alive, Network request monitor
// @author       urzeye
// @match        *://*/*
// @license      MIT
// ==/UserScript==

/**
 * ============================================================================
 * BackgroundKeepAlive Toolkit
 * ============================================================================
 * 解决浏览器后台标签页节流问题的通用工具集
 *
 * 包含三大模块：
 * 1. BackgroundTimer  - 基于 Web Worker 的保活定时器
 * 2. AudioKeepAlive   - 静音音频对抗 Chrome 5分钟强力休眠
 * 3. NetworkMonitor   - Hook Fetch/XHR 监控任务完成状态
 */

// ============================================================================
// 模块1: BackgroundTimer - Web Worker 保活定时器
// ============================================================================

/**
 * BackgroundTimer - 基于 Web Worker 的保活定时器
 *
 * 解决的问题：
 * 现代浏览器对后台标签页进行资源节流（Throttling），导致 setInterval 定时器
 * 被严重降频（从正常间隔变为 1 分钟甚至更长）。Web Worker 运行在独立线程中，
 * 不受此限制。
 *
 * @example
 * const timer = new BackgroundTimer(() => {
 *     console.log('后台心跳:', new Date().toTimeString());
 * }, 1000);
 * timer.start();
 */
class BackgroundTimer {
	/**
	 * @param {Function} callback - 定时回调函数
	 * @param {number} intervalMs - 定时间隔（毫秒），默认 1000ms
	 */
	constructor(callback, intervalMs = 1000) {
		this.callback = callback;
		this.intervalMs = intervalMs;
		this.worker = null;
		this.workerUrl = null;
		this._isRunning = false;
	}

	start() {
		if (this._isRunning) return;

		// 尝试使用 Web Worker（某些页面可能有 CSP 限制）
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
				if (e.data.type === 'tick' && typeof this.callback === 'function') {
					try { this.callback(e.data.timestamp); }
					catch (err) { console.error('[BackgroundTimer] Callback error:', err); }
				}
			};

			this.worker.onerror = (err) => console.error('[BackgroundTimer] Worker error:', err);
			this.worker.postMessage({ type: 'start' });
			this._useWorker = true;
		} catch (err) {
			// CSP 或其他限制导致 Worker 创建失败，回退到普通 setInterval
			console.warn('[BackgroundTimer] Worker creation failed (CSP?), falling back to setInterval:', err.message);
			this._fallbackTimerId = setInterval(() => {
				if (typeof this.callback === 'function') {
					try { this.callback(Date.now()); }
					catch (e) { console.error('[BackgroundTimer] Callback error:', e); }
				}
			}, this.intervalMs);
			this._useWorker = false;
		}

		this._isRunning = true;
	}

	stop() {
		if (!this._isRunning) return;

		if (this._useWorker) {
			// Worker 模式
			if (this.worker) {
				this.worker.postMessage({ type: 'stop' });
				this.worker.terminate();
				this.worker = null;
			}
			if (this.workerUrl) {
				URL.revokeObjectURL(this.workerUrl);
				this.workerUrl = null;
			}
		} else {
			// 回退模式
			if (this._fallbackTimerId) {
				clearInterval(this._fallbackTimerId);
				this._fallbackTimerId = null;
			}
		}

		this._isRunning = false;
	}

	setInterval(intervalMs) {
		this.intervalMs = intervalMs;
		if (!this._isRunning) return;

		if (this._useWorker && this.worker) {
			// Worker 模式：发送消息动态调整
			this.worker.postMessage({ type: 'setInterval', data: intervalMs });
		} else if (this._fallbackTimerId) {
			// 回退模式：重建定时器
			clearInterval(this._fallbackTimerId);
			this._fallbackTimerId = setInterval(() => {
				if (typeof this.callback === 'function') {
					try { this.callback(Date.now()); }
					catch (e) { console.error('[BackgroundTimer] Callback error:', e); }
				}
			}, intervalMs);
		}
	}

	isRunning() { return this._isRunning; }

	destroy() {
		this.stop();
		this.callback = null;
	}
}

// ============================================================================
// 模块2: AudioKeepAlive - 静音音频保活
// ============================================================================

/**
 * AudioKeepAlive - 使用静音音频对抗 Chrome 5分钟强力休眠
 *
 * 原理：浏览器通常不会节流正在播放音频的标签页（保证后台听歌体验）
 * 通过播放极低音量的音频，可以保持标签页活跃状态
 *
 * 注意：需要用户交互后才能启动（浏览器自动播放策略限制）
 *
 * @example
 * const audio = new AudioKeepAlive();
 * document.addEventListener('click', () => audio.start(), { once: true });
 */
class AudioKeepAlive {
	constructor() {
		this.audioCtx = null;
		this.oscillator = null;
		this.gainNode = null;
		this._isActive = false;
	}

	/**
	 * 启动音频保活
	 * @returns {boolean} 是否启动成功
	 */
	start() {
		if (this._isActive) return true;

		try {
			const AudioContext = window.AudioContext || window.webkitAudioContext;
			if (!AudioContext) {
				console.warn('[AudioKeepAlive] AudioContext not supported');
				return false;
			}

			this.audioCtx = new AudioContext();

			// 如果被挂起，尝试恢复
			if (this.audioCtx.state === 'suspended') {
				this.audioCtx.resume();
			}

			// 创建振荡器（产生音频信号）
			this.oscillator = this.audioCtx.createOscillator();
			this.oscillator.type = 'sine';
			this.oscillator.frequency.value = 1; // 极低频率，人耳几乎听不到

			// 创建增益节点（控制音量）
			this.gainNode = this.audioCtx.createGain();
			this.gainNode.gain.value = 0.0001; // 极低音量

			// 连接节点
			this.oscillator.connect(this.gainNode);
			this.gainNode.connect(this.audioCtx.destination);

			// 开始播放
			this.oscillator.start();
			this._isActive = true;

			console.log('[AudioKeepAlive] Started');
			return true;
		} catch (err) {
			console.error('[AudioKeepAlive] Start error:', err);
			return false;
		}
	}

	/**
	 * 停止音频保活
	 */
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
		console.log('[AudioKeepAlive] Stopped');
	}

	/**
	 * 获取运行状态
	 */
	isActive() { return this._isActive; }

	/**
	 * 销毁实例
	 */
	destroy() { this.stop(); }
}

// ============================================================================
// 模块3: NetworkMonitor - 网络请求监控
// ============================================================================

/**
 * NetworkMonitor - Hook Fetch/XHR 监控任务完成状态
 *
 * 核心算法：防抖 + 活跃计数器
 * 1. 记录当前活跃请求数
 * 2. 每次请求开始/结束都重置静默计时器
 * 3. 活跃数为 0 + 静默期结束 + DOM 验证通过 → 触发完成回调
 *
 * @example
 * const monitor = new NetworkMonitor({
 *     urlPatterns: ['batchexecute', 'stream/generate'],
 *     silenceThreshold: 3000,
 *     onComplete: () => console.log('任务完成'),
 *     domValidation: (ctx) => !document.querySelector('.stop-button')
 * });
 * monitor.start();
 */
class NetworkMonitor {
	/**
	 * @param {Object} options - 配置选项
	 * @param {string[]} options.urlPatterns - 要监控的 URL 模式（包含匹配）
	 * @param {number} options.silenceThreshold - 静默判定时间（毫秒），默认 3000
	 * @param {Function} options.onComplete - 任务完成回调
	 * @param {Function} [options.onStart] - 任务开始回调（可选）
	 * @param {Function} [options.domValidation] - DOM 二次验证函数（可选），返回 true 表示验证通过
	 */
	constructor(options = {}) {
		this.urlPatterns = options.urlPatterns || [];
		this.silenceThreshold = options.silenceThreshold || 3000;
		this.onComplete = options.onComplete || (() => { });
		this.onStart = options.onStart || null;
		this.domValidation = options.domValidation || null;

		this._activeCount = 0;
		this._silenceTimer = null;
		this._isMonitoring = false;
		this._originalFetch = null;
		this._originalXhrOpen = null;
		this._originalXhrSend = null;
		this._lastUrl = '';
		this._hasTriggeredStart = false;

		// 绑定方法
		this._hookedFetch = this._hookedFetch.bind(this);
	}

	/**
	 * 开始监控
	 */
	start() {
		if (this._isMonitoring) return;

		// Hook Fetch
		this._originalFetch = window.fetch;
		window.fetch = this._hookedFetch;

		// Hook XHR
		this._hookXHR();

		this._isMonitoring = true;
		console.log('[NetworkMonitor] Started monitoring (Fetch + XHR)');
	}

	/**
	 * 停止监控
	 */
	stop() {
		if (!this._isMonitoring) return;

		// 恢复原始 Fetch
		if (this._originalFetch) {
			window.fetch = this._originalFetch;
			this._originalFetch = null;
		}

		// 恢复原始 XHR
		this._unhookXHR();

		// 清理定时器
		if (this._silenceTimer) {
			clearTimeout(this._silenceTimer);
			this._silenceTimer = null;
		}

		this._isMonitoring = false;
		this._activeCount = 0;
		this._hasTriggeredStart = false;
		console.log('[NetworkMonitor] Stopped monitoring');
	}

	/**
	 * 获取当前是否空闲
	 */
	isIdle() { return this._activeCount === 0; }

	/**
	 * 获取当前活跃请求数
	 */
	getActiveCount() { return this._activeCount; }

	/**
	 * 销毁实例
	 */
	destroy() {
		this.stop();
		this.onComplete = null;
		this.onStart = null;
		this.domValidation = null;
	}

	/**
	 * 检查 URL 是否匹配监控模式
	 * @private
	 */
	_isTargetUrl(url) {
		if (!url || this.urlPatterns.length === 0) return false;
		return this.urlPatterns.some(pattern => url.includes(pattern));
	}

	/**
	 * 尝试触发完成回调
	 * @private
	 */
	_tryTriggerComplete() {
		if (this._activeCount > 0) return;

		// 构建上下文信息
		const ctx = {
			activeCount: this._activeCount,
			lastUrl: this._lastUrl,
			timestamp: Date.now()
		};

		// DOM 二次验证
		if (typeof this.domValidation === 'function') {
			try {
				const isValid = this.domValidation(ctx);
				if (!isValid) {
					// 验证未通过，延迟重试
					console.log('[NetworkMonitor] DOM validation failed, retrying...');
					this._silenceTimer = setTimeout(() => this._tryTriggerComplete(), 1000);
					return;
				}
			} catch (err) {
				console.error('[NetworkMonitor] DOM validation error:', err);
			}
		}

		// 触发完成回调
		console.log('[NetworkMonitor] Task complete');
		this._hasTriggeredStart = false;
		try {
			this.onComplete(ctx);
		} catch (err) {
			console.error('[NetworkMonitor] onComplete error:', err);
		}
	}

	/**
	 * Hook 后的 fetch 函数
	 * @private
	 */
	async _hookedFetch(...args) {
		const url = args[0] ? args[0].toString() : '';

		// 非目标请求，直接透传
		if (!this._isTargetUrl(url)) {
			return this._originalFetch(...args);
		}

		// 目标请求：开始计数
		this._activeCount++;
		this._lastUrl = url;

		// 清除静默计时器
		if (this._silenceTimer) {
			clearTimeout(this._silenceTimer);
			this._silenceTimer = null;
		}

		// 触发开始回调（仅首次）
		if (!this._hasTriggeredStart && typeof this.onStart === 'function') {
			this._hasTriggeredStart = true;
			try { this.onStart({ url, timestamp: Date.now() }); }
			catch (err) { console.error('[NetworkMonitor] onStart error:', err); }
		}

		try {
			const response = await this._originalFetch(...args);
			const clone = response.clone();

			// 在后台读取流
			this._readStream(clone).catch(() => { });

			return response;
		} catch (error) {
			// fetch 失败也要减计数
			this._decrementAndSchedule();
			throw error;
		}
	}

	/**
	 * 读取响应流
	 * @private
	 */
	async _readStream(response) {
		try {
			const reader = response.body.getReader();
			while (true) {
				const { done } = await reader.read();
				if (done) break;
			}
		} catch (err) {
			// 流读取错误，忽略
		} finally {
			this._decrementAndSchedule();
		}
	}

	/**
	 * 减少计数并调度静默计时器
	 * @private
	 */
	_decrementAndSchedule() {
		this._activeCount = Math.max(0, this._activeCount - 1);

		// 清除并重新设置静默计时器
		if (this._silenceTimer) {
			clearTimeout(this._silenceTimer);
		}
		this._silenceTimer = setTimeout(() => this._tryTriggerComplete(), this.silenceThreshold);
	}

	/**
	 * Hook XMLHttpRequest
	 * @private
	 */
	_hookXHR() {
		const self = this;
		this._originalXhrOpen = XMLHttpRequest.prototype.open;
		this._originalXhrSend = XMLHttpRequest.prototype.send;

		// Hook open 方法，记录 URL
		XMLHttpRequest.prototype.open = function (method, url, ...rest) {
			this._networkMonitorUrl = url ? url.toString() : '';
			return self._originalXhrOpen.call(this, method, url, ...rest);
		};

		// Hook send 方法，监控请求生命周期
		XMLHttpRequest.prototype.send = function (body) {
			const url = this._networkMonitorUrl || '';

			// 非目标请求，直接透传
			if (!self._isTargetUrl(url)) {
				return self._originalXhrSend.call(this, body);
			}

			// 目标请求：开始计数
			self._activeCount++;
			self._lastUrl = url;

			// 清除静默计时器
			if (self._silenceTimer) {
				clearTimeout(self._silenceTimer);
				self._silenceTimer = null;
			}

			// 触发开始回调（仅首次）
			if (!self._hasTriggeredStart && typeof self.onStart === 'function') {
				self._hasTriggeredStart = true;
				try { self.onStart({ url, timestamp: Date.now(), type: 'xhr' }); }
				catch (err) { console.error('[NetworkMonitor] onStart error:', err); }
			}

			// 监听请求完成
			const onComplete = () => {
				self._decrementAndSchedule();
			};

			this.addEventListener('load', onComplete);
			this.addEventListener('error', onComplete);
			this.addEventListener('abort', onComplete);
			this.addEventListener('timeout', onComplete);

			return self._originalXhrSend.call(this, body);
		};
	}

	/**
	 * 恢复原始 XMLHttpRequest
	 * @private
	 */
	_unhookXHR() {
		if (this._originalXhrOpen) {
			XMLHttpRequest.prototype.open = this._originalXhrOpen;
			this._originalXhrOpen = null;
		}
		if (this._originalXhrSend) {
			XMLHttpRequest.prototype.send = this._originalXhrSend;
			this._originalXhrSend = null;
		}
	}
}

// ============================================================================
// 导出到全局
// ============================================================================

if (typeof window !== 'undefined') {
	window.BackgroundTimer = BackgroundTimer;
	window.AudioKeepAlive = AudioKeepAlive;
	window.NetworkMonitor = NetworkMonitor;
}
