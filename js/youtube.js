/**
 * js/youtube.js
 * YouTube IFrame Player API の制御および高精度再生同期マネージャー
 */

class YouTubeManager {
  constructor() {
    this.player = null;
    this.isReady = false;
    this.isPlaying = false;
    
    // 高精度タイムキーパー用変数
    this.baseVideoTime = 0;
    this.basePerfTime = 0;
    this.playbackRate = 1.0;
    
    // イベントコールバック
    this.onReadyCallback = null;
    this.onStateChangeCallback = null;
    this.onErrorCallback = null;

    // ドリフト補正用ポーリングID
    this.syncIntervalId = null;
  }

  /**
   * YouTube APIの初期化
   * @param {string} containerId - iframeを埋め込む要素のID
   * @param {string} initialVideoId - 初期表示するYouTube動画ID
   * @param {Function} onReady - 準備完了時コールバック
   * @param {Function} onStateChange - 状態変更時コールバック
   */
  init(containerId, initialVideoId, onReady, onStateChange) {
    this.onReadyCallback = onReady;
    this.onStateChangeCallback = onStateChange;

    const setupPlayer = () => {
      this.player = new window.YT.Player(containerId, {
        height: '100%',
        width: '100%',
        videoId: initialVideoId,
        playerVars: {
          playsinline: 1,
          controls: 1,
          disablekb: 1,       // ゲームキー(D,F,J,K)との競合を防ぐためYTのキー操作を無効化
          rel: 0,
          modestbranding: 1
        },
        events: {
          onReady: (event) => this._handlePlayerReady(event),
          onStateChange: (event) => this._handleStateChange(event),
          onError: (event) => {
            if (this.onErrorCallback) this.onErrorCallback(event);
          }
        }
      });
    };

    // YouTube APIのスクリプトロード待機
    if (window.YT && window.YT.Player) {
      setupPlayer();
    } else {
      window.onYouTubeIframeAPIReady = setupPlayer;
    }
  }

  _handlePlayerReady(event) {
    this.isReady = true;
    this.startSyncTimer();
    if (this.onReadyCallback) {
      this.onReadyCallback(event);
    }
  }

  _handleStateChange(event) {
    // YT.PlayerState: UNSTARTED(-1), ENDED(0), PLAYING(1), PAUSED(2), BUFFERING(3), CUED(5)
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

  /**
   * 現在の動画再生時間とブラウザの内部高精度時間を同期するアンカーを更新
   */
  resetTimeAnchor() {
    if (!this.player || typeof this.player.getCurrentTime !== 'function') return;
    this.baseVideoTime = this.player.getCurrentTime();
    this.basePerfTime = performance.now();
    if (typeof this.player.getPlaybackRate === 'function') {
      this.playbackRate = this.player.getPlaybackRate() || 1.0;
    }
  }

  /**
   * 定期的なドリフト（時間のズレ）検知と補正
   */
  startSyncTimer() {
    if (this.syncIntervalId) clearInterval(this.syncIntervalId);
    this.syncIntervalId = setInterval(() => {
      if (!this.isPlaying || !this.player || typeof this.player.getCurrentTime !== 'function') {
        return;
      }
      const ytTime = this.player.getCurrentTime();
      const internalTime = this.getCurrentTime();
      const diff = Math.abs(ytTime - internalTime);

      // ズレが80ms以上生じた場合、内部時計をYouTube側に再アンカーする
      if (diff > 0.08) {
        this.resetTimeAnchor();
      }
    }, 250);
  }

  /**
   * サブフレーム精度の現在の動画時間を取得（秒単位、浮動小数点）
   * @returns {number}
   */
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

  /**
   * 入力文字列（URLまたは動画ID）から有効な11桁のYouTube Video IDを取り出す
   * @param {string} input 
   * @returns {string|null}
   */
  static extractVideoId(input) {
    if (!input) return null;
    const trimmed = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = trimmed.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }
}

export const youtubeManager = new YouTubeManager();