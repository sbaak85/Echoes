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
  /** 大於 0 時，聲音開始播放後由靜音平滑淡入至設定音量。 */
  fadeInSeconds?: number;
  /** 大於 0 時，聲音結束前由設定音量平滑淡出至靜音。 */
  fadeOutSeconds?: number;
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
    "frequencyCoarseTick": {
      "label": "調頻粗調刻度切換",
      "trigger": "調頻小遊戲的預調輪盤實際切換至另一格頻段刻度時播放一次；停留在同一格不重複播放，且不再播放一般 Input 音效。",
      "sourceAssetPaths": [
        "Assets/Audio/刻度.mp3"
      ],
      "sources": [
        "./audio/frequency-coarse-tick.mp3"
      ],
      "volume": 0.72,
      "delaySeconds": 0
    },
    "frequencyFineFar": {
      "label": "調頻微調－遠離目標",
      "trigger": "玩家持續調整微調頻率時循環播放；接近度低於 20% 時主導，20% 至 80% 之間與接近音軌降低音量後交叉淡化，停止調整或關閉視窗時暫停。播放中音量會在小聲與正常之間柔和往返。",
      "sourceAssetPaths": [
        "Assets/Audio/調頻遠離.mp3"
      ],
      "sources": [
        "./audio/frequency-fine-far.mp3"
      ],
      "volume": 0.58,
      "delaySeconds": 0,
      "loop": true
    },
    "frequencyFineNear": {
      "label": "調頻微調－接近目標",
      "trigger": "玩家持續調整微調頻率時循環播放；接近度高於 80% 時主導，20% 至 80% 之間與遠離音軌降低音量後交叉淡化。播放中音量會在小聲、正常與較大聲之間柔和往返，且愈接近命中整體愈大聲。",
      "sourceAssetPaths": [
        "Assets/Audio/調頻接近.mp3"
      ],
      "sources": [
        "./audio/frequency-fine-near.mp3"
      ],
      "volume": 0.78,
      "delaySeconds": 0,
      "loop": true
    },
    "frequencyLocked": {
      "label": "調頻精準命中並鎖定",
      "trigger": "調頻達到可命中範圍後，玩家按下鎖定頻率按鈕或手把 RT 的當下播放一次；非命中鎖定只播放一般 Input 音效。",
      "sourceAssetPaths": [
        "Assets/Audio/調頻成功.mp3"
      ],
      "sources": [
        "./audio/frequency-lock-success.mp3"
      ],
      "volume": 1,
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
    },
    "questCompleted": {
      "label": "任務完成提示",
      "trigger": "任務提示 UI 開始播放綠色 COMPLETE 底光與外框擴散演出的瞬間播放一次。",
      "sourceAssetPaths": [
        "Assets/Audio/任務成功.mp3"
      ],
      "sources": [
        "./audio/quest-complete.mp3"
      ],
      "volume": 1,
      "delaySeconds": 0
    },
    "questStarted": {
      "label": "任務開始或更新",
      "trigger": "任務提示 UI 接取新任務，或開始切換到下一任務階段並播放 NEXT 演出的瞬間播放一次。",
      "sourceAssetPaths": [
        "Assets/Audio/任務開始.mp3"
      ],
      "sources": [
        "./audio/quest-start.mp3"
      ],
      "volume": 1,
      "delaySeconds": 0
    },
    "generatorStartup1": {
      "label": "發電機成功啟動－第一段",
      "trigger": "電力分配小遊戲的供電組合正確，玩家按下「確認供電」並正式進入成功啟動流程的當下播放；失敗組合、切換設備或重複輸入不播放。",
      "sourceAssetPaths": [
        "Assets/Audio/發電機啟動1.mp3"
      ],
      "sources": [
        "./audio/generator-startup-1.mp3"
      ],
      "volume": 1,
      "delaySeconds": 0,
      "fadeInSeconds": 0.3,
      "fadeOutSeconds": 0.3
    },
    "generatorStartup2": {
      "label": "發電機成功啟動－第二段",
      "trigger": "電力分配小遊戲成功啟動流程成立後 1 秒播放；與第一段共用同一次成功事件，失敗時不排程。",
      "sourceAssetPaths": [
        "Assets/Audio/發電機啟動2.mp3"
      ],
      "sources": [
        "./audio/generator-startup-2.mp3"
      ],
      "volume": 0.8,
      "delaySeconds": 1,
      "fadeInSeconds": 0.3,
      "fadeOutSeconds": 0.3
    },
    "generatorRunning": {
      "label": "發電機成功啟動－運作聲",
      "trigger": "電力分配小遊戲成功啟動流程成立後 1.5 秒播放；與前兩段共用同一次成功事件，失敗時不排程。",
      "sourceAssetPaths": [
        "Assets/Audio/發電機運作.mp3"
      ],
      "sources": [
        "./audio/generator-running.mp3"
      ],
      "volume": 0.7,
      "delaySeconds": 1.5,
      "fadeInSeconds": 0.3,
      "fadeOutSeconds": 0.3
    }
  }
  /* AUDIO_EVENT_CONFIG_END */
) as const satisfies Record<string, AudioEventDefinition>;

export type AudioEventName = keyof typeof AUDIO_EVENT_CONFIG;

export type FrequencyFineAudioMix = {
  farVolume: number;
  nearVolume: number;
};

/**
 * 將調頻接近度轉成兩條循環音軌的即時音量。
 * 0~20% 由遠離音主導、80~100% 由接近音主導，中間以 Smoothstep
 * 交叉淡化；phase 以 0~1 循環，提供持續調整時的柔和呼吸感。
 */
export function getFrequencyFineAudioMix(
  strength: number,
  phase: number,
): FrequencyFineAudioMix {
  const closeness = Math.min(1, Math.max(0, strength / 100));
  const rawBlend = Math.min(1, Math.max(0, (closeness - 0.2) / 0.6));
  const nearWeight = rawBlend * rawBlend * (3 - 2 * rawBlend);
  const farWeight = 1 - nearWeight;
  const wave = (Math.sin(phase * Math.PI * 2) + 1) / 2;
  const farPulse = 0.35 + wave * 0.65;
  const nearPulse = 0.28 + wave * 0.97;
  const proximityBoost = 0.45 + closeness * 0.55;

  return {
    farVolume: clampVolume(
      AUDIO_EVENT_CONFIG.frequencyFineFar.volume * farWeight * farPulse,
    ),
    nearVolume: clampVolume(
      AUDIO_EVENT_CONFIG.frequencyFineNear.volume *
        nearWeight *
        nearPulse *
        proximityBoost,
    ),
  };
}

type AudioEventRuntime = {
  audio: HTMLAudioElement;
  definition: AudioEventDefinition;
  delayResolve: (() => void) | null;
  delayTimerId: number | null;
  fadeFrameId: number | null;
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
        fadeFrameId: null,
        endedHandler: () => {},
        pendingPlay: null,
        requestId: 0,
        sourceIndex: 0,
      };

      runtime.endedHandler = () => {
        if (runtime.fadeFrameId !== null) {
          window.cancelAnimationFrame(runtime.fadeFrameId);
          runtime.fadeFrameId = null;
        }
        runtime.audio.volume = clampVolume(runtime.definition.volume);
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
    // Stopping an event is intentionally idempotent. React development mode
    // can dispose an AudioEventManager while an earlier play promise is still
    // settling; that late cleanup must not throw and interrupt unrelated UI
    // cleanup such as ending a story SKIP transition.
    const runtime = this.runtimes.get(eventName);
    if (!runtime || this.disposed) return;
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
    const fadeInMilliseconds = Math.max(
      0,
      (runtime.definition.fadeInSeconds ?? 0) * 1000,
    );
    const fadeOutMilliseconds = Math.max(
      0,
      (runtime.definition.fadeOutSeconds ?? 0) * 1000,
    );
    const targetVolume = clampVolume(runtime.definition.volume);
    if (fadeInMilliseconds > 0) runtime.audio.volume = 0;
    await runtime.audio.play();
    if (
      (fadeInMilliseconds > 0 || fadeOutMilliseconds > 0) &&
      !this.disposed &&
      runtime.requestId === requestId
    ) {
      this.startVolumeEnvelope(
        runtime,
        requestId,
        targetVolume,
        fadeInMilliseconds,
        fadeOutMilliseconds,
      );
    }
  }

  private startVolumeEnvelope(
    runtime: AudioEventRuntime,
    requestId: number,
    targetVolume: number,
    fadeInMilliseconds: number,
    fadeOutMilliseconds: number,
  ) {
    const smoothstep = (progress: number) =>
      progress * progress * (3 - 2 * progress);
    const updateVolume = () => {
      if (this.disposed || runtime.requestId !== requestId) return;
      const playbackMilliseconds = runtime.audio.currentTime * 1000;
      const fadeInProgress = fadeInMilliseconds > 0
        ? Math.min(1, Math.max(0, playbackMilliseconds / fadeInMilliseconds))
        : 1;
      const remainingMilliseconds = Number.isFinite(runtime.audio.duration)
        ? Math.max(0, runtime.audio.duration * 1000 - playbackMilliseconds)
        : Number.POSITIVE_INFINITY;
      const fadeOutProgress = fadeOutMilliseconds > 0
        ? Math.min(1, Math.max(0, remainingMilliseconds / fadeOutMilliseconds))
        : 1;
      runtime.audio.volume = clampVolume(
        targetVolume * smoothstep(fadeInProgress) * smoothstep(fadeOutProgress),
      );
      if (!runtime.audio.ended && !runtime.audio.paused) {
        runtime.fadeFrameId = window.requestAnimationFrame(updateVolume);
      } else {
        runtime.fadeFrameId = null;
      }
    };
    runtime.fadeFrameId = window.requestAnimationFrame(updateVolume);
  }

  private cancelPendingPlay(runtime: AudioEventRuntime) {
    runtime.requestId += 1;
    if (runtime.fadeFrameId !== null) {
      window.cancelAnimationFrame(runtime.fadeFrameId);
      runtime.fadeFrameId = null;
    }
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
