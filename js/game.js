/**
 * js/game.js
 * 判定ロジック、スコア計算、キー入力判定およびステータス管理
 */

export const JUDGMENT_WINDOW = {
  PERFECT: 0.050, // ±50ms
  GREAT: 0.100,   // ±100ms
  GOOD: 0.150,    // ±150ms
  MISS: 0.200     // 150ms超〜200ms
};

export class GameEngine {
  /**
   * @param {Object} uiElements - DOM参照オブジェクト
   * @param {GameRenderer} renderer 
   * @param {Object} youtubeManager 
   */
  constructor(uiElements, renderer, youtubeManager) {
    this.ui = uiElements;
    this.renderer = renderer;
    this.yt = youtubeManager;

    // ゲーム内ノーツ（ヒット判定フラグを含む）
    this.playableNotes = [];

    // スコアリング指標
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.stats = { perfect: 0, great: 0, good: 0, miss: 0 };

    // キー割り当て
    this.keyMap = {
      'KeyD': 0,
      'KeyF': 1,
      'KeyJ': 2,
      'KeyK': 3
    };

    // レーンごとのキー押下状態（長押し対策用）
    this.isKeyPressed = [false, false, false, false];

    // 直前の動画再生時間（巻き戻し検知用）
    this.lastProcessedTime = 0;

    this.onJudgeCallback = null;
  }

  /**
   * 譜面データをゲーム用ステートとしてロード
   * @param {Array<{time: number, lane: number}>} notes 
   */
  loadChart(notes) {
    this.playableNotes = notes.map((n, index) => ({
      id: index,
      time: n.time,
      lane: n.lane,
      hit: false,
      missed: false
    }));
    this.resetScore();
  }

  resetScore() {
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.stats = { perfect: 0, great: 0, good: 0, miss: 0 };
    
    // ヒット状態をすべてクリア
    for (const n of this.playableNotes) {
      n.hit = false;
      n.missed = false;
    }

    this.updateScoreUI();
    this._setJudgeUI('READY', 'ready', '±0ms');
  }

  /**
   * ユーザーが動画を巻き戻した/シークした場合のステート再同期
   */
  handleSeek(targetTime) {
    for (const note of this.playableNotes) {
      if (note.time >= targetTime - JUDGMENT_WINDOW.GOOD) {
        note.hit = false;
        note.missed = false;
      }
    }
  }

  /**
   * キー押下処理（プレイモード時）
   * @param {string} code - KeyboardEvent.code
   */
  handleKeyDown(code) {
    const lane = this.keyMap[code];
    if (lane === undefined) return;

    // 長押しによる連続発火を抑制
    if (this.isKeyPressed[lane]) return;
    this.isKeyPressed[lane] = true;

    // レーンフィードバック
    this.renderer.triggerLaneFeedback(lane);
    this._highlightLaneKey(lane, true);

    const currentTime = this.yt.getCurrentTime();

    // 該当レーン内で、判定範囲内にあり、かつ最も現在時刻に近い未処理ノーツを探索
    let targetNote = null;
    let minDiff = Infinity;

    for (let i = 0; i < this.playableNotes.length; i++) {
      const note = this.playableNotes[i];
      if (note.lane !== lane || note.hit || note.missed) continue;

      const diff = Math.abs(note.time - currentTime);
      if (diff <= JUDGMENT_WINDOW.MISS) {
        if (diff < minDiff) {
          minDiff = diff;
          targetNote = note;
        }
      }
    }

    if (targetNote) {
      const delta = currentTime - targetNote.time; // 正: 遅い, 負: 早い
      const absDiff = Math.abs(delta);
      const deltaMs = Math.round(delta * 1000);
      const deltaText = `${deltaMs >= 0 ? '+' : ''}${deltaMs}ms`;

      if (absDiff <= JUDGMENT_WINDOW.PERFECT) {
        this._applyJudgment('PERFECT', 'perfect', deltaText, targetNote);
      } else if (absDiff <= JUDGMENT_WINDOW.GREAT) {
        this._applyJudgment('GREAT', 'great', deltaText, targetNote);
      } else if (absDiff <= JUDGMENT_WINDOW.GOOD) {
        this._applyJudgment('GOOD', 'good', deltaText, targetNote);
      } else {
        this._applyJudgment('MISS', 'miss', deltaText, targetNote, true);
      }
    }
  }

  handleKeyUp(code) {
    const lane = this.keyMap[code];
    if (lane !== undefined) {
      this.isKeyPressed[lane] = false;
      this._highlightLaneKey(lane, false);
    }
  }

  /**
   * 毎フレーム呼び出される見逃し（Pass MISS）判定処理
   * @param {number} currentTime 
   */
  update(currentTime) {
    // 巻き戻しが発生したかを監視
    if (currentTime < this.lastProcessedTime - 0.5) {
      this.handleSeek(currentTime);
    }
    this.lastProcessedTime = currentTime;

    // 判定ラインを通り過ぎてGOOD判定枠を超えたノーツをMISS処理
    for (let i = 0; i < this.playableNotes.length; i++) {
      const note = this.playableNotes[i];
      if (!note.hit && !note.missed && (currentTime - note.time) > JUDGMENT_WINDOW.GOOD) {
        note.missed = true;
        this.combo = 0;
        this.stats.miss++;
        this._setJudgeUI('MISS', 'miss', 'LATE PASS');
        this.updateScoreUI();
      }
    }
  }

  _applyJudgment(text, typeClass, deltaText, note, isMiss = false) {
    if (isMiss) {
      note.missed = true;
      this.combo = 0;
      this.stats.miss++;
    } else {
      note.hit = true;
      this.combo++;
      if (this.combo > this.maxCombo) {
        this.maxCombo = this.combo;
      }
      this.stats[typeClass]++;

      // 1,000,000点満点換算の加算
      const totalNotes = Math.max(1, this.playableNotes.length);
      const baseNoteScore = 1000000 / totalNotes;
      const multipliers = { perfect: 1.0, great: 0.7, good: 0.4 };
      this.score += Math.round(baseNoteScore * (multipliers[typeClass] || 0));
    }

    this._setJudgeUI(text, typeClass, deltaText);
    this.updateScoreUI();

    if (this.onJudgeCallback) {
      this.onJudgeCallback(text, deltaText);
    }
  }

  _setJudgeUI(text, className, deltaText) {
    if (!this.ui.judgeText || !this.ui.judgeDelta) return;
    this.ui.judgeText.textContent = text;
    this.ui.judgeText.className = `judge-text ${className} bump`;
    this.ui.judgeDelta.textContent = deltaText;

    // アニメーション再トリガー
    setTimeout(() => {
      if (this.ui.judgeText) {
        this.ui.judgeText.classList.remove('bump');
      }
    }, 200);
  }

  updateScoreUI() {
    if (this.ui.scoreDisplay) {
      this.ui.scoreDisplay.textContent = String(this.score).padStart(7, '0');
    }
    if (this.ui.comboDisplay) {
      this.ui.comboDisplay.textContent = String(this.combo);
    }
    if (this.ui.maxComboDisplay) {
      this.ui.maxComboDisplay.textContent = String(this.maxCombo);
    }
    if (this.ui.countPerfect) this.ui.countPerfect.textContent = this.stats.perfect;
    if (this.ui.countGreat) this.ui.countGreat.textContent = this.stats.great;
    if (this.ui.countGood) this.ui.countGood.textContent = this.stats.good;
    if (this.ui.countMiss) this.ui.countMiss.textContent = this.stats.miss;
  }

  _highlightLaneKey(lane, isActive) {
    const keyElem = document.querySelector(`.key-indicator[data-lane="${lane}"]`);
    if (keyElem) {
      if (isActive) keyElem.classList.add('active');
      else keyElem.classList.remove('active');
    }
  }
}