/**
 * js/editor.js
 * 譜面作成（エディタ）モードの管理、ノーツの記録およびJSON入出力
 */

export class ChartEditor {
  constructor(youtubeManager) {
    this.yt = youtubeManager;
    this.notes = [];
    this.onNoteCountChanged = null; // ノーツ数更新時の通知コールバック
  }

  /**
   * 現在の再生位置にノーツを記録
   * @param {number} lane (0 - 3)
   * @returns {boolean} 記録に成功したかどうか
   */
  recordNote(lane) {
    if (!this.yt.isReady) return false;

    // 現在の再生時間を取得（ミリ秒単位で丸める）
    const currentTime = Math.round(this.yt.getCurrentTime() * 1000) / 1000;

    // 0秒未満の不正打刻は無視
    if (currentTime < 0) return false;

    // 同一レーンで極端に近接（50ms以内）する打刻チャタリングを排除
    const isDuplicate = this.notes.some(n => 
      n.lane === lane && Math.abs(n.time - currentTime) < 0.05
    );
    if (isDuplicate) return false;

    // ノーツ追加
    this.notes.push({
      time: currentTime,
      lane: lane
    });

    // 時間順にソート
    this.notes.sort((a, b) => a.time - b.time);

    if (this.onNoteCountChanged) {
      this.onNoteCountChanged(this.notes.length);
    }
    return true;
  }

  /**
   * 現在の譜面をJSON文字列としてエクスポート
   * @param {string} videoId 
   * @returns {string}
   */
  exportToJson(videoId = '') {
    const chartData = {
      videoId: videoId,
      version: '1.0.0',
      totalNotes: this.notes.length,
      notes: this.notes.map(n => ({
        time: Number(n.time.toFixed(3)),
        lane: n.lane
      }))
    };
    return JSON.stringify(chartData, null, 2);
  }

  /**
   * JSONテキストから譜面データをパース・検証してロード
   * @param {string} jsonString 
   * @returns {{ success: boolean, count: number, videoId?: string, error?: string }}
   */
  importFromJson(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data || !Array.isArray(data.notes)) {
        return { success: false, count: 0, error: 'JSONの形式が正しくありません (notes配列が必要です)' };
      }

      // バリデーションと正規化
      const parsedNotes = [];
      for (const item of data.notes) {
        if (typeof item.time === 'number' && typeof item.lane === 'number') {
          if (item.lane >= 0 && item.lane <= 3 && item.time >= 0) {
            parsedNotes.push({
              time: Math.round(item.time * 1000) / 1000,
              lane: Math.floor(item.lane)
            });
          }
        }
      }

      parsedNotes.sort((a, b) => a.time - b.time);
      this.notes = parsedNotes;

      if (this.onNoteCountChanged) {
        this.onNoteCountChanged(this.notes.length);
      }

      return {
        success: true,
        count: this.notes.length,
        videoId: data.videoId || null
      };
    } catch (e) {
      return { success: false, count: 0, error: `JSONパース失敗: ${e.message}` };
    }
  }

  clearNotes() {
    this.notes = [];
    if (this.onNoteCountChanged) {
      this.onNoteCountChanged(0);
    }
  }

  getNotes() {
    return this.notes;
  }

  setNotes(notes) {
    this.notes = [...notes].sort((a, b) => a.time - b.time);
    if (this.onNoteCountChanged) {
      this.onNoteCountChanged(this.notes.length);
    }
  }
}