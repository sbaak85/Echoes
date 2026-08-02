export type AudioEventDefinition = {
  /** 給製作端閱讀的事件名稱。 */
  label: string;
  /** 明確記錄遊戲在什麼時機呼叫這個聲音事件。 */
  trigger: string;
  /** 專案內原始 MP3 素材位置，方便日後追查與替換；原檔刪除後可留空。 */
  sourceAssetPaths: readonly string[];
  /** 瀏覽器實際載入的位置；多個檔案會依序播放。 */
  sources: readonly string[];
  /** 0 到 1。例：0.5 = 50%。 */
  volume: number;
  /** 每次事件成立後延遲幾秒才開始播放。 */
  delaySeconds: number;
  /** 省略時預設單次；BGM、腳步、打字音等持續聲音設為 true。 */
  loop?: boolean;
};

/**
 * Echoes 全部 Audio Event 的集中設定。
 *
 * 日後要換 MP3、調音量、延遲或 Loop，優先只修改這裡。
 * 若新增全新的事件，先在這裡登記，再於遊戲事件成立處呼叫：
 * audioEvents.play("事件名稱", { restart: true });
 */
export const AUDIO_EVENT_CONFIG = (
  /* AUDIO_EVENT_CONFIG_START */
  {
    "bgm": {
      "label": "場景背景音樂",
      "trigger": "遊戲畫面初始化後立即請求播放；若瀏覽器尚未允許音訊，首次鍵盤／左鍵輸入時重試；頁面切回前景時恢復；每首結束後自動切換下一首。",
      "sourceAssetPaths": [
        "Assets/Audio/異星長夜 (1).mp3",
        "Assets/Audio/異星長夜.mp3"
      ],
      "sources": [
        "./audio/alien-night-1.mp3",
        "./audio/alien-night-2.mp3"
      ],
      "volume": 0.35,
      "delaySeconds": 0,
      "loop": true
    },
    "footsteps": {
      "label": "草地腳步",
      "trigger": "角色產生實際移動速度時開始；角色停止、視窗失焦或頁面進入背景時暫停。",
      "sourceAssetPaths": [
        "Assets/Audio/芝生の上を歩く.mp3"
      ],
      "sources": [
        "./audio/grass-footsteps.mp3"
      ],
      "volume": 0.5,
      "delaySeconds": 0,
      "loop": true
    },
    "dialogueTyping": {
      "label": "對話文字打字效果",
      "trigger": "每個對話文字頁開始逐字顯示時從頭播放；文字未完成時循環；刷完、快速補完、切頁或關閉對話時停止並歸零。",
      "sourceAssetPaths": [
        "Assets/Audio/打字效果音_#4-1785390293018.mp3"
      ],
      "sources": [
        "./audio/dialogue-typing-4.mp3"
      ],
      "volume": 0.5,
      "delaySeconds": 0,
      "loop": true
    },
    "interactionAccepted": {
      "label": "互動指令成立",
      "trigger": "左鍵點擊或手把 A 新按下，且系統找到互動區並成功建立可達互動指令的當下播放。",
      "sourceAssetPaths": [
        "Assets/Audio/互動操作音_#1-1785307011343.mp3"
      ],
      "sources": [
        "./audio/interaction-success-1.mp3"
      ],
      "volume": 1,
      "delaySeconds": 0
    },
    "dialogueOpened": {
      "label": "對話視窗展開",
      "trigger": "對話視窗 UI 實際建立並展開時播放。",
      "sourceAssetPaths": [
        "Assets/Audio/互動啟動音__#4-1785307003422.mp3"
      ],
      "sources": [
        "./audio/dialogue-open-4.mp3"
      ],
      "volume": 1,
      "delaySeconds": 0
    },
    "uiInput": {
      "label": "介面輸入點擊",
      "trigger": "玩家點擊背包內的操作按鈕、道具頁籤、換頁箭頭、道具格或其右鍵選單；點擊快捷工具格或其右鍵選單；展開／收折任務、生存計量、小地圖；以及開啟／關閉背包或 Options 介面時播放。只要 Click 成立就播放，不要求操作成功。",
      "sourceAssetPaths": [
        "Assets/Audio/InPut.mp3"
      ],
      "sources": [
        "./audio/ui-input.mp3"
      ],
      "volume": 0.7,
      "delaySeconds": 0
    },
    "worldItemLanded": {
      "label": "場上道具觸地",
      "trigger": "互動獎勵、Debug 生成或背包丟棄的道具完成主要拋物線，第一次碰到場上地面的瞬間播放一次；飛行途中、後續小彈跳與滑動階段不重複播放。",
      "sourceAssetPaths": [
        "Assets/Audio/Drop.mp3"
      ],
      "sources": [
        "./audio/world-item-drop.mp3"
      ],
      "volume": 0.85,
      "delaySeconds": 0
    },
    "worldItemPickedUp": {
      "label": "場上道具拾取成功",
      "trigger": "玩家成功拾取固定場景道具或場上 Spawn／背包丟棄的道具，且道具數量已加入背包並從場上移除後播放一次；只有接觸、點擊失敗、重複拾取或背包數量未增加時不播放。",
      "sourceAssetPaths": [
        "Assets/Audio/Pick.mp3"
      ],
      "sources": [
        "./audio/world-item-pickup.mp3"
      ],
      "volume": 0.9,
      "delaySeconds": 0
    }
  }
  /* AUDIO_EVENT_CONFIG_END */
) as const satisfies Record<string, AudioEventDefinition>;

export type AudioEventName = keyof typeof AUDIO_EVENT_CONFIG;

type AudioEventRuntime = {
  audio: HTMLAudioElement;
  definition: AudioEventDefinition;
  delayResolve: (() => void) | null;
  delayTimerId: number | null;
  endedHandler: () => void;
  pendingPlay: Promise<void> | null;
  requestId: number;
  sourceIndex: number;
};

type PlayOptions = {
  /** true 會先停止、歸零，再依設定延遲播放。 */
  restart?: boolean;
};

type StopOptions = {
  /** 預設歸零；false 只暫停，之後可由原位置繼續。 */
  reset?: boolean;
};

function clampVolume(value: number) {
  return Math.min(1, Math.max(0, value));
}

export class AudioEventManager {
  private disposed = false;
  private readonly runtimes = new Map<AudioEventName, AudioEventRuntime>();

  constructor() {
    (
      Object.entries(AUDIO_EVENT_CONFIG) as Array<
        [AudioEventName, AudioEventDefinition]
      >
    ).forEach(([eventName, definition]) => {
      const audio = new Audio(definition.sources[0]);
      audio.preload = "auto";
      audio.volume = clampVolume(definition.volume);
      audio.loop = Boolean(definition.loop && definition.sources.length === 1);

      const runtime: AudioEventRuntime = {
        audio,
        definition,
        delayResolve: null,
        delayTimerId: null,
        endedHandler: () => {},
        pendingPlay: null,
        requestId: 0,
        sourceIndex: 0,
      };

      runtime.endedHandler = () => {
        if (
          this.disposed ||
          !runtime.definition.loop ||
          runtime.definition.sources.length <= 1
        ) {
          return;
        }
        runtime.sourceIndex =
          (runtime.sourceIndex + 1) % runtime.definition.sources.length;
        runtime.audio.src = runtime.definition.sources[runtime.sourceIndex];
        runtime.audio.load();
        void runtime.audio.play().catch(() => {
          // 瀏覽器若暫時禁止播放，下一次輸入／切回前景會重新請求。
        });
      };

      audio.addEventListener("ended", runtime.endedHandler);
      this.runtimes.set(eventName, runtime);
    });
  }

  getAudio(eventName: AudioEventName) {
    return this.getRuntime(eventName).audio;
  }

  getDefinition(eventName: AudioEventName) {
    return this.getRuntime(eventName).definition;
  }

  setVolume(eventName: AudioEventName, volume: number) {
    this.getRuntime(eventName).audio.volume = clampVolume(volume);
  }

  play(eventName: AudioEventName, options: PlayOptions = {}) {
    const runtime = this.getRuntime(eventName);
    if (this.disposed) return Promise.resolve();

    if (options.restart) {
      this.cancelPendingPlay(runtime);
      runtime.audio.pause();
      runtime.audio.currentTime = 0;
    } else {
      if (!runtime.audio.paused) return Promise.resolve();
      if (runtime.pendingPlay) return runtime.pendingPlay;
    }

    const requestId = ++runtime.requestId;
    const pendingPlay = this.startPlayback(runtime, requestId);
    runtime.pendingPlay = pendingPlay;
    const clearPendingPlay = () => {
      if (runtime.pendingPlay === pendingPlay) runtime.pendingPlay = null;
    };
    void pendingPlay.then(clearPendingPlay, clearPendingPlay);
    return pendingPlay;
  }

  stop(eventName: AudioEventName, options: StopOptions = {}) {
    const runtime = this.getRuntime(eventName);
    this.cancelPendingPlay(runtime);
    runtime.audio.pause();
    if (options.reset ?? true) runtime.audio.currentTime = 0;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.runtimes.forEach((runtime) => {
      this.cancelPendingPlay(runtime);
      runtime.audio.removeEventListener("ended", runtime.endedHandler);
      runtime.audio.pause();
      runtime.audio.currentTime = 0;
    });
    this.runtimes.clear();
  }

  private async startPlayback(
    runtime: AudioEventRuntime,
    requestId: number,
  ) {
    const delayMilliseconds = Math.max(
      0,
      runtime.definition.delaySeconds * 1000,
    );
    if (delayMilliseconds > 0) {
      await new Promise<void>((resolve) => {
        runtime.delayResolve = resolve;
        runtime.delayTimerId = window.setTimeout(() => {
          runtime.delayTimerId = null;
          runtime.delayResolve = null;
          resolve();
        }, delayMilliseconds);
      });
    }

    if (this.disposed || runtime.requestId !== requestId) return;
    await runtime.audio.play();
  }

  private cancelPendingPlay(runtime: AudioEventRuntime) {
    runtime.requestId += 1;
    if (runtime.delayTimerId !== null) {
      window.clearTimeout(runtime.delayTimerId);
      runtime.delayTimerId = null;
    }
    runtime.delayResolve?.();
    runtime.delayResolve = null;
    runtime.pendingPlay = null;
  }

  private getRuntime(eventName: AudioEventName) {
    const runtime = this.runtimes.get(eventName);
    if (!runtime) {
      throw new Error(`Unknown audio event: ${eventName}`);
    }
    return runtime;
  }
}
