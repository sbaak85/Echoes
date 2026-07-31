# 道具資料庫與玩家背包狀態

## 資料位置

- `app/item-database.ts`
  - 遊戲全部道具的中央資料表。
  - 固定保留 100 個編號欄位。
  - 第 1～20 欄已建立原本背包介面中的 20 項道具。
  - 第 21～100 欄目前為空，可直接逐項加入新道具。
  - 每項道具可設定名稱、圖示符號、分類、說明、單件重量與是否可使用。
  - `inventoryRules` 管理是否可轉移、是否可丟棄，以及每一格的堆疊數量。
- `app/world-item-placements.ts`
  - 管理放置在地圖上的可拾取道具。
  - 目前在 `map_test01` 放置一個「藍色晶體碎片」。

## 玩家初始持有道具

測試用初始存檔只放入以下六種道具：

- 醫療包 ×2
- 淨水瓶 ×3
- 緊急口糧 ×4
- 繩索 ×1
- 照明燈 ×1
- 飛船導航資料 ×1

其餘資料庫內的道具雖然已建立，但玩家沒有持有，因此不會出現在背包中。  
藍色晶體碎片初始數量為 0；拾取地圖上的晶體後會變為 1。

## 保存內容

- 玩家真實道具數量：`echoes:player-inventory:v1`
- 已拾取的地圖道具：`echoes:collected-world-items:v1`
- 玩家丟棄在場上的動態道具：`echoes:dropped-world-items:v1`

以上狀態都保存在瀏覽器本機儲存中。重新載入遊戲後，道具數量、固定物件是否已被拾取，以及玩家丟棄在場上的物件都會保留。

若要重新測試第一次拾取，可在瀏覽器開發者工具執行：

```js
localStorage.removeItem("echoes:player-inventory:v1");
localStorage.removeItem("echoes:collected-world-items:v1");
localStorage.removeItem("echoes:dropped-world-items:v1");
location.reload();
```
