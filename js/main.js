/**
 * js/main.js
 * アプリケーションのエントリーポイント
 * モード切替、UI配線、およびメインゲームループを統括
 */

import { youtubeManager, YouTubeManager } from './youtube.js';
import { GameRenderer } from './renderer.js';
import { ChartEditor } from './editor.js';
import { GameEngine } from './game.js';

// 初期デフォルト譜面サンプル（外部埋め込みフリー動画 M2qS_P_c4B4 に変更）
const SAMPLE_CHART = {
  videoId: 'M2qS_P_c4B4',
  notes: [
    { time: 1.0, lane: 0 },
    { time: 1.4, lane: 1 },
    { time: 1.8, lane: 2 },
    { time: 2.2, lane: 3 },
    { time: 2.6, lane: 2 },
    { time: 3.0, lane: 1 },
    { time: 3.4, lane: 0 },
    { time: 3.8, lane: 1 },
    { time: 4.2, lane: 2 },
    { time: 4.6, lane: 3 },
    { time: 5.0, lane: 0 },
    { time: 5.3, lane: 1 },
    { time: 5.6, lane: 2 },
    { time: 6.0, lane: 3 }
  ]
};

class AppController {
  constructor() {
    this.currentMode = 'play'; // 'play' または 'editor'
    this.currentVideoId = SAMPLE_CHART.videoId;

    this.cacheDOMElements();
    this.initEngines();
    this.bindEvents();

    // サンプル譜面をロード
    this.editor.setNotes(SAMPLE_CHART.notes);
    this.game.loadChart(this.editor.getNotes());
    this.elements.chartJsonArea.value = this.editor.exportToJson(this.currentVideoId);

    // アプリケーションループ開始
    this.startMainLoop();
  }

  /**
   * DOM参照のキャッシュ
   */
  cacheDOMElements() {
    this.elements = {
      videoIdInput: document.getElementById('videoIdInput'),
      btnLoadVideo: document.getElementById('btnLoadVideo'),
      btnModePlay: document.getElementById('btnModePlay'),
      btnModeEditor: document.getElementById('btnModeEditor'),
      btnPlayPause: document.getElementById('btnPlayPause'),
      btnRestart: document.getElementById('btnRestart'),

      playInfoCard: document.getElementById('playInfoCard'),
      editorControlCard: document.getElementById('editorControlCard'),

      playbackTimeDisplay: document.getElementById('playbackTimeDisplay'),
      scoreDisplay: document.getElementById('scoreDisplay'),
      comboDisplay: document.getElementById('comboDisplay'),
      maxComboDisplay: document.getElementById('maxComboDisplay'),
      judgeText: document.getElementById('judgeText'),
      judgeDelta: document.getElementById('judgeDelta'),

      countPerfect: document.getElementById('countPerfect'),
      countGreat: document.getElementById('countGreat'),
      countGood: document.getElementById('countGood'),
      countMiss: document.getElementById('countMiss'),

      chartJsonArea: document.getElementById('chartJsonArea'),
      editorNoteCount: document.getElementById('editorNoteCount'),
      btnClearNotes: document.getElementById('btnClearNotes'),
      btnExportJson: document.getElementById('btnExportJson'),
      btnImportJson: document.getElementById('btnImportJson'),
      btnCopyJson: document.getElementById('btnCopyJson'),
      recordStatusBadge: document.getElementById('recordStatusBadge'),

      canvas: document.getElementById('gameCanvas')
    };
  }

  /**
   * 各サブモジュールの生成と結合
   */
  initEngines() {
    // 描画エンジン
    this.renderer = new GameRenderer(this.elements.canvas);

    // 譜面エディタ
    this.editor = new ChartEditor(youtubeManager);
    this.editor.onNoteCountChanged = (count) => {
      this.elements.editorNoteCount.textContent = count;
    };

    // ゲームエンジン
    this.game = new GameEngine(this.elements, this.renderer, youtubeManager);

    // YouTube APIの初期化
    youtubeManager.init(
      'youtubePlayer',
      this.currentVideoId,
      () => {
        console.log('[YouTube] Player is Ready');
      },
      (state) => {
        if (state === window.YT.PlayerState.PLAYING) {
          this.elements.btnPlayPause.textContent = 'Pause';
          if (this.currentMode === 'editor') {
            this.elements.recordStatusBadge.textContent = 'RECORDING ACTIVE';
            this.elements.recordStatusBadge.style.color = 'var(--accent-magenta)';
            this.elements.recordStatusBadge.style.borderColor = 'var(--accent-magenta)';
          }
        } else {
          this.elements.btnPlayPause.textContent = 'Play';
          if (this.currentMode === 'editor') {
            this.elements.recordStatusBadge.textContent = 'RECORD STANDBY';
            this.elements.recordStatusBadge.style.color = 'var(--accent-green)';
            this.elements.recordStatusBadge.style.borderColor = 'var(--accent-green)';
          }
        }
      }
    );
  }

  /**
   * 各種イベントリスナーの設定
   */
  bindEvents() {
    // 動画ID読み込み
    this.elements.btnLoadVideo.addEventListener('click', () => this.handleVideoLoad());
    this.elements.videoIdInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleVideoLoad();
    });

    // プレイヤー制御ボタン
    this.elements.btnPlayPause.addEventListener('click', () => youtubeManager.togglePlay());
    this.elements.btnRestart.addEventListener('click', () => {
      youtubeManager.seekTo(0);
      if (this.currentMode === 'play') {
        this.game.resetScore();
      }
    });

    // モード切替
    this.elements.btnModePlay.addEventListener('click', () => this.switchMode('play'));
    this.elements.btnModeEditor.addEventListener('click', () => this.switchMode('editor'));

    // エディタボタン群
    this.elements.btnClearNotes.addEventListener('click', () => {
      if (confirm('記録されているノーツをすべて消去しますか？')) {
        this.editor.clearNotes();
        this.elements.chartJsonArea.value = '';
      }
    });

    this.elements.btnExportJson.addEventListener('click', () => {
      const json = this.editor.exportToJson(this.currentVideoId);
      this.elements.chartJsonArea.value = json;
    });

    this.elements.btnImportJson.addEventListener('click', () => {
      const jsonStr = this.elements.chartJsonArea.value.trim();
      if (!jsonStr) {
        alert('譜面JSONを入力してください。');
        return;
      }
      const result = this.editor.importFromJson(jsonStr);
      if (result.success) {
        alert(`譜面を読み込みました（ノーツ数: ${result.count}）`);
        if (result.videoId && result.videoId !== this.currentVideoId) {
          if (confirm(`譜面に含まれる動画ID [${result.videoId}] を読み込みますか？`)) {
            this.elements.videoIdInput.value = result.videoId;
            this.handleVideoLoad();
          }
        }
        // ゲームエンジンにも同期
        this.game.loadChart(this.editor.getNotes());
      } else {
        alert(`エラー: ${result.error}`);
      }
    });

    this.elements.btnCopyJson.addEventListener('click', async () => {
      const json = this.editor.exportToJson(this.currentVideoId);
      this.elements.chartJsonArea.value = json;
      try {
        await navigator.clipboard.writeText(json);
        alert('譜面JSONをクリップボードにコピーしました！');
      } catch (err) {
        alert('コピーに失敗しました。テキストエリアから直接コピーしてください。');
      }
    });

    // キーボード入力（判定 / エディタ打刻）
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
  }

  handleVideoLoad() {
    const rawInput = this.elements.videoIdInput.value.trim();
    const videoId = YouTubeManager.extractVideoId(rawInput);
    if (!videoId) {
      alert('有効なYouTube動画IDまたはURLを入力してください。');
      return;
    }
    this.currentVideoId = videoId;
    youtubeManager.loadVideoById(videoId);
    if (this.currentMode === 'play') {
      this.game.resetScore();
    }
  }

  /**
   * モードの切り替え
   * @param {'play'|'editor'} mode 
   */
  switchMode(mode) {
    this.currentMode = mode;
    if (mode === 'play') {
      this.elements.btnModePlay.classList.add('active');
      this.elements.btnModeEditor.classList.remove('active');
      this.elements.playInfoCard.classList.remove('hidden');
      this.elements.editorControlCard.classList.add('hidden');

      // エディタのノーツをゲームへ同期してリセット
      this.game.loadChart(this.editor.getNotes());
    } else {
      this.elements.btnModePlay.classList.remove('active');
      this.elements.btnModeEditor.classList.add('active');
      this.elements.playInfoCard.classList.add('hidden');
      this.elements.editorControlCard.classList.remove('hidden');

      // 最新のJSONをテキストエリアに反映
      this.elements.chartJsonArea.value = this.editor.exportToJson(this.currentVideoId);
    }
  }

  handleKeyDown(e) {
    // 入力フォームやテキストエリア操作中は音ゲータップを無視
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    // スペースキーでの再生/停止トグル
    if (e.code === 'Space') {
      e.preventDefault();
      youtubeManager.togglePlay();
      return;
    }

    if (this.currentMode === 'play') {
      this.game.handleKeyDown(e.code);
    } else if (this.currentMode === 'editor') {
      const laneMap = { 'KeyD': 0, 'KeyF': 1, 'KeyJ': 2, 'KeyK': 3 };
      const lane = laneMap[e.code];
      if (lane !== undefined) {
        e.preventDefault();
        const recorded = this.editor.recordNote(lane);
        if (recorded) {
          this.renderer.triggerLaneFeedback(lane);
          // エディタのキーインジケータ発光
          const keyElem = document.querySelector(`.key-indicator[data-lane="${lane}"]`);
          if (keyElem) {
            keyElem.classList.add('active');
            setTimeout(() => keyElem.classList.remove('active'), 100);
          }
        }
      }
    }
  }

  handleKeyUp(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }
    if (this.currentMode === 'play') {
      this.game.handleKeyUp(e.code);
    }
  }

  /**
   * 毎フレーム実行されるメインループ
   */
  startMainLoop() {
    const loop = () => {
      const currentTime = youtubeManager.getCurrentTime();

      // 再生時間表示（分:秒.ミリ秒）
      this.updateTimeDisplay(currentTime);

      if (this.currentMode === 'play') {
        // ゲームプレイの更新と描画
        this.game.update(currentTime);
        this.renderer.render(currentTime, this.game.playableNotes, false);
      } else {
        // エディタモードの描画
        this.renderer.render(currentTime, this.editor.getNotes(), true);
      }

      requestAnimationFrame(loop);
    };

    requestAnimationFrame(loop);
  }

  updateTimeDisplay(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
    this.elements.playbackTimeDisplay.textContent = formatted;
  }
}

// アプリケーション起動
window.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
});