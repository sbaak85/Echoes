# Echoes Beyond the Stars — Movement Lab

以 `map_test01` 為場景的 HTML5 八方向角色移動測試。

## 操作

- `WASD` 或方向鍵：八方向移動
- 觸控裝置：上半部點擊可指定移動／互動；下半部按住並推移可使用暫態虛擬搖桿移動。
- 鍵盤移動時，左下角會顯示並同步點亮 WASD 提示。
- 右上角 `齒輪` 或手把 `START`：開啟遊戲內「選項」視窗
- 選項視窗分為畫面／音效／操作／進階頁籤；可調整對話文字大小、BGM、
  移動速度、角色尺寸與碰撞輔助。行動裝置預設使用「大」對話文字。
- 「操作」頁可關閉虛擬游標控制；關閉後右搖桿不再控制遊戲內游標，
  實體滑鼠仍可正常使用，手把輸入期間會暫時隱藏實體游標。
- 選項開啟時，手把十字鍵上下選擇、左右調整，A 確認、B 關閉；左搖桿仍可移動角色。
- 選項視窗固定為螢幕高度 60%，設定較多時可在內容區捲動；手把以 LB／RB 切換頁籤。

## 系統內容

- 八方向角色圖片自動切換
- 放開按鍵後保留最後面向
- 斜向移動速度正規化
- 角色圓形碰撞、場景不規則多邊形／圓形碰撞與牆面滑動
- 中央平台與兩側入口相連的 NavMesh
- 平滑鏡頭跟隨及世界邊界限制

## Audio Event 管理

- 所有遊戲音效事件集中在 `app/audio-event-manager.ts` 的
  `AUDIO_EVENT_CONFIG`。
- 每個事件會記錄觸發時機、原始素材路徑、瀏覽器播放路徑、音量、
  延遲秒數、是否循環，以及依個別 MP3 總長百分比計算的 FadeIn／FadeOut；
  `loop` 省略時預設為單次播放。
- 可由 `MapEditor/MapEditor.exe` 上方的「Audio 音效」開啟管理視窗，
  直接輸入後按「儲存到 TS」，不需要手動編輯 TypeScript。
- 也可直接執行 `AudioEventManager/AudioEventManager.exe`，不需要先開啟
  MapEditor；兩個入口共用相同管理視窗與設定。
- 原始素材路徑可留空；「遊戲 MP3 路徑」右側的 `▶` 可直接試聽第一個
  MP3，播放中再次按下即可停止。
- 「原始素材」右側也有 `▶` 試聽按鈕；未填原始素材時按鈕會自動停用。
- 更換素材時，將瀏覽器需要的 MP3 放入 `public/audio/`，再修改該事件的
  `sourceAssetPaths` 與 `sources`。BGM 可在 `sources` 依播放順序列出多首。

## 網頁版本

- GitHub Pages：<https://sbaak85.github.io/Echoes/>
- 推送到 `main` 後，GitHub Actions 會自動重新建立並更新網頁。

## 地圖編輯器

- 執行檔與所有編輯器相關檔案集中於 `MapEditor/`。
- 使用 `MapEditor/MapEditor.exe` 啟動 Windows 地圖編輯器。
- 編輯器與遊戲共用 `public/maps` 內的場景圖片及 JSON。
