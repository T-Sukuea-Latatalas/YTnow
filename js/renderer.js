/**
 * js/renderer.js
 * 音楽ゲーム画面（Canvas）の描画ロジック
 */

export class GameRenderer {
  /**
   * @param {HTMLCanvasElement} canvas 
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // レーン定義 (4レーン)
    this.laneCount = 4;
    this.laneColors = [
      '#00f0ff', // Lane 0: Cyan
      '#0088ff', // Lane 1: Blue
      '#ff007b', // Lane 2: Magenta
      '#ffb700'  // Lane 3: Yellow
    ];

    // ゲームプレイ設定
    this.approachTime = 1.2; // ノーツが出現してから判定ラインに達するまでの秒数（スクロール速度）
    this.hitPositionRatio = 0.85; // 判定ラインのY座標比率（Canvas全高に対する位置）
    this.noteHeight = 18;

    // キー押下フィードバック用（各レーンの発光時間管理）
    this.laneLightIntensity = [0, 0, 0, 0];

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * Canvasの物理解像度とCSS描画解像度を同期（DPIスケール対応）
   */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.width = rect.width;
    this.height = rect.height;

    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);

    this.ctx.setTransform(1, 0, 0, 1, 0, 0); // リセット
    this.ctx.scale(dpr, dpr);

    this.laneWidth = this.width / this.laneCount;
    this.judgeY = this.height * this.hitPositionRatio;
  }

  /**
   * キーが押された際にレーンをフラッシュさせる
   * @param {number} laneIndex (0 - 3)
   */
  triggerLaneFeedback(laneIndex) {
    if (laneIndex >= 0 && laneIndex < this.laneCount) {
      this.laneLightIntensity[laneIndex] = 1.0;
    }
  }

  /**
   * メインレンダリング
   * @param {number} currentTime - 現在の動画再生時間（秒）
   * @param {Array<{time: number, lane: number, hit?: boolean}>} notes - ノーツ配列
   * @param {boolean} isEditorMode - エディタモード中フラグ
   */
  render(currentTime, notes, isEditorMode = false) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. 背景・レーン枠の描画
    this._renderLanes(ctx);

    // 2. キー押下フィードバック（レーンビーム）描画
    this._renderLaneBeams(ctx);

    // 3. 判定ラインの描画
    this._renderJudgeLine(ctx, isEditorMode);

    // 4. ノーツの描画
    this._renderNotes(ctx, currentTime, notes);

    // 5. エディタモード時の現在時間グリッドライン描画
    if (isEditorMode) {
      this._renderEditorGuide(ctx);
    }
  }

  _renderLanes(ctx) {
    ctx.save();
    for (let i = 0; i <= this.laneCount; i++) {
      const x = i * this.laneWidth;
      ctx.strokeStyle = (i === 0 || i === this.laneCount) 
        ? 'rgba(255, 255, 255, 0.25)' 
        : 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = (i === 0 || i === this.laneCount) ? 2 : 1;

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    ctx.restore();
  }

  _renderLaneBeams(ctx) {
    ctx.save();
    for (let i = 0; i < this.laneCount; i++) {
      const alpha = this.laneLightIntensity[i];
      if (alpha > 0.01) {
        const x = i * this.laneWidth;
        const grad = ctx.createLinearGradient(0, this.judgeY, 0, 0);
        grad.addColorStop(0, this.laneColors[i] + Math.floor(alpha * 120).toString(16).padStart(2, '0'));
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        ctx.fillRect(x, 0, this.laneWidth, this.judgeY);

        // 減衰
        this.laneLightIntensity[i] *= 0.85;
      } else {
        this.laneLightIntensity[i] = 0;
      }
    }
    ctx.restore();
  }

  _renderJudgeLine(ctx, isEditorMode) {
    ctx.save();
    const y = this.judgeY;

    // 判定ラインの発光
    ctx.strokeStyle = isEditorMode ? '#ff007b' : '#00f0ff';
    ctx.lineWidth = 4;
    ctx.shadowColor = isEditorMode ? '#ff007b' : '#00f0ff';
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(this.width, y);
    ctx.stroke();

    // 判定枠（下部レシーバー）
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, y, this.width, this.height - y);
    ctx.restore();
  }

  _renderNotes(ctx, currentTime, notes) {
    if (!notes || notes.length === 0) return;

    ctx.save();
    const minVisibleTime = currentTime - 0.2; // 判定ライン通過後少し残す
    const maxVisibleTime = currentTime + this.approachTime; // 画面上端から出現

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      
      // 画面外のノーツはスキップ
      if (note.time < minVisibleTime || note.time > maxVisibleTime) continue;
      // すでにヒット済みのノーツは描画しない（エディタモードでは常に確認のため薄く描画）
      if (note.hit) continue;

      const timeDiff = note.time - currentTime; // 判定線到達まであと何秒か
      // y座標算出: 到達時にちょうど judgeY となる
      const y = this.judgeY - (timeDiff / this.approachTime) * this.judgeY;
      const x = note.lane * this.laneWidth;
      const padding = 4;
      const w = this.laneWidth - padding * 2;
      const h = this.noteHeight;
      const color = this.laneColors[note.lane];

      // ノーツ本体の描画（ネオン風ブロック）
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;

      // 角丸長方形
      this._drawRoundedRect(ctx, x + padding, y - h / 2, w, h, 4);
      ctx.fill();

      // ノーツの光沢ハイライト
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      this._drawRoundedRect(ctx, x + padding + 3, y - h / 2 + 2, w - 6, h / 3, 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _renderEditorGuide(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 0, 123, 0.7)';
    ctx.font = 'bold 12px "Share Tech Mono"';
    ctx.fillText('RECORDING MARKER', 10, this.judgeY - 8);
    ctx.restore();
  }

  _drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  setApproachTime(seconds) {
    this.approachTime = Math.max(0.5, Math.min(3.0, seconds));
  }
}