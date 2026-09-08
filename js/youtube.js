/**
 * js/youtube.js
 * YouTube IFrame Player API の制御および高精度再生同期マネージャー
 */

// ★ 先頭に export を追加しました
export class YouTubeManager {
  constructor() {
    this.player = null;
    this.isReady = false;
    this.isPlaying = false;
    
    this.baseVideoTime = 0;
    this.basePerfTime = 0;
    this.playbackRate = 1.0;
    
    this.onReadyCallback = null;
    this.onStateChangeCallback = null;
    this.onErrorCallback = null;
    this.syncIntervalId = null;
  }

  /**
   * YouTube API スクリプトを安全にロードする
   */
  loadAPI() {
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        resolve();
        return;
      }

      const previousCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (previousCallback) previousCallback();
        resolve();
      };

      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
    });
  }

  /**
   * プレイヤー初期化
   */
  async init(containerId, initialVideoId, onReady, onStateChange) {
    this.onReadyCallback = onReady;
    this.onStateChangeCallback = onStateChange;

    await this.loadAPI();

    this.player = new window.YT.Player(containerId, {
      height: '100%',
      width: '100%',
      videoId: initialVideoId,
      playerVars: {
        playsinline: 1,
        controls: 1,
        disablekb: 1,
        rel: 0,
        modestbranding: 1,
        enablejsapi: 1,
        origin: window.location.origin
      },
      events: {
        onReady: (event) => this._handlePlayerReady(event),
        onStateChange: (event) => this._handleStateChange(event),
        onError: (event) => {
          console.error('[YouTube Error]', event.data);
          if (this.onErrorCallback) this.onErrorCallback(event);
        }
      }
    });
  }

  _handlePlayerReady(event) {
    this.isReady = true;
    this.startSyncTimer();
    if (this.onReadyCallback) {
      this.onReadyCallback(event);
    }
  }

  _handleStateChange(event) {
    if (event.data === window.YT.PlayerState.PLAYING) {
      this.isPlaying = true;
      this.resetTimeAnchor();
    } else {
      this.isPlaying = false;
      if (this.player && typeof this.player.getCurrentTime === 'function') {
        this.baseVideoTime = this.player.getCurrentTime();
      }
      this.basePerfTime = performance.now();
    }

    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(event.data);
    }
  }

  resetTimeAnchor() {
    if (!this.player || typeof this.player.getCurrentTime !== 'function') return;
    this.baseVideoTime = this.player.getCurrentTime();
    this.basePerfTime = performance.now();
    if (typeof this.player.getPlaybackRate === 'function') {
      this.playbackRate = this.player.getPlaybackRate() || 1.0;
    }
  }

  startSyncTimer() {
    if (this.syncIntervalId) clearInterval(this.syncIntervalId);
    this.syncIntervalId = setInterval(() => {
      if (!this.isPlaying || !this.player || typeof this.player.getCurrentTime !== 'function') {
        return;
      }
      const ytTime = this.player.getCurrentTime();
      const internalTime = this.getCurrentTime();
      const diff = Math.abs(ytTime - internalTime);

      if (diff > 0.08) {
        this.resetTimeAnchor();
      }
    }, 250);
  }

  getCurrentTime() {
    if (!this.isReady || !this.player) return 0;
    if (!this.isPlaying) {
      return this.baseVideoTime;
    }
    const elapsed = (performance.now() - this.basePerfTime) / 1000;
    return this.baseVideoTime + elapsed * this.playbackRate;
  }

  play() {
    if (this.isReady && this.player && typeof this.player.playVideo === 'function') {
      this.player.playVideo();
    }
  }

  pause() {
    if (this.isReady && this.player && typeof this.player.pauseVideo === 'function') {
      this.player.pauseVideo();
    }
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seekTo(seconds) {
    if (this.isReady && this.player && typeof this.player.seekTo === 'function') {
      this.player.seekTo(seconds, true);
      this.baseVideoTime = seconds;
      this.basePerfTime = performance.now();
    }
  }

  loadVideoById(videoId) {
    if (!this.isReady || !this.player) return;
    this.pause();
    this.player.loadVideoById(videoId);
    this.baseVideoTime = 0;
    this.basePerfTime = performance.now();
  }

  static extractVideoId(input) {
    if (!input) return null;
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=[^#&?]*|&v=)([^#&?]*).*/;
    const match = trimmed.match(regExp);
    if (match) {
      const id = match[2] || match[1];
      const cleanId = id.replace(/.*watch\?v=/, '');
      if (cleanId.length === 11) return cleanId;
    }
    return null;
  }
}

export const youtubeManager = new YouTubeManager();
