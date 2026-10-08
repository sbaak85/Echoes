# Echoes Audio Event Manager

`AudioEventManager.exe` 是獨立的遊戲音效事件設定工具，不需要先啟動
MapEditor。

它會讀寫專案根目錄下的 `app/audio-event-manager.ts`。最上層分為
「Audio Event」、「星際牌音效」、「BGM 管理」與「Line SE 管理」頁籤。
「星際牌音效」集中列出 `starCards` 系列事件與音效池成員，一般 Audio Event 清單不再重複列出。
兩個音效頁籤共用儲存流程，切換會保留未儲存修改及各自選取的事件。Audio Event 可調整事件名稱、
觸發說明、原始素材路徑、遊戲 MP3 路徑、音量、延遲、Loop，以及
FadeIn／FadeOut。FadeIn／FadeOut 皆以個別 MP3 總長的百分比計算；例如
3 秒音檔設定 FadeOut 15%，會在最後 0.45 秒由設定音量淡出至靜音。原始素材
路徑是選填資料，可完全留空；原始素材與遊戲 MP3 欄位右側的 `📂` 可在
Windows 檔案總管中選取第一個檔案，`▶` 則可立即預覽。原始素材欄空白時，
其檔案總管與預覽按鈕都會停用。

「BGM 管理」內另分為：

- `BGM 素材庫`：登記 Track ID、多首 MP3 播放清單、基礎音量、Loop，
  以及換回該 Track 時是否記住先前進度。`default` 是一般場景預設曲目。
- `BGM 控制規則`：依 Quest、Stage、OBJ、小遊戲、章節、場景、對話 Line ID 或特殊事件
  的狀態調整音量、暫時靜音或換 Track。`switch` 會先將舊 Track 依 FadeOut
  淡出，再將新 Track 依 FadeIn 淡入；`fade` 則讓舊 Track 淡出與新 Track
  淡入同時進行（Crossfade）。優先權數字愈大愈優先；FadeOut／FadeIn 以秒
  計算。「觸發類型」與「狀態」下拉選單使用中文顯示，儲存時
  仍會寫回程式所需的英文內部值；「進行中或已完成」即對應
`active|completed`。規則解除後可選擇續播、重播或回到預設 Track。

`pause` 會依 FadeOut 秒數淡出後暫停媒體播放，保留位置；與僅降音量的
`mute` 不同。植物解謎的 `intro` 先以 1.5 秒暫停地圖曲，藤蔓首次到位後
才切至 `playing`，以 1.5 秒淡入 `Sombra_Forest_BGM`（Track 基礎音量 70%，
仍乘上玩家 BGM 音量）。成功對話 `chapter04-section-99` 完整播完後或中途返回解除規則，以 1.5 秒交叉淡化
並續播地圖曲。低優先權的地圖音量規則不覆蓋高優先權的小遊戲曲；更高優先權
的死亡等靜音事件仍生效。

「Line SE 管理」可用對話腳本的完整 Line ID 綁定單句音效，並設定音量、
播放延遲、FadeIn／FadeOut 秒數與 Loop。每筆設定可分別選擇切到下一句時
「自然播完」或「停止」；預設為自然播完。自然播完不會強制切斷單次音效，
Loop 則會在切句時解除循環並讓當前這一輪播至結尾；選擇停止時，會依該列
FadeOut 秒數淡出後停止。這些判斷只在 Line ID 真正切換時執行一次。

規則是收到狀態變更事件時才重算，不會在遊戲每一幀反覆掃描。特殊事件可用：

```ts
window.dispatchEvent(new CustomEvent("echoes:bgm-control", {
  detail: { eventId: "event-id", state: "triggered" },
}));
```

若事件要明確結束，傳入 `active: false`；也可在規則的「持續秒數」設定自動解除。

儲存時只會替換 TypeScript 內有標記的設定區塊。上一版檔案會備份到
`AudioEventManager/runtime/audio-event-manager.ts.bak`。

請讓整個 `AudioEventManager` 資料夾保持在 Echoes 專案根目錄下。
MapEditor 內的「Audio 音效」按鈕會開啟相同的共用管理視窗。
