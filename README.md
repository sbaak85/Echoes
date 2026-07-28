# Echoes Beyond the Stars — Movement Lab

以 `map_test01` 為場景的 HTML5 八方向角色移動測試。

## 操作

- `WASD` 或方向鍵：八方向移動
- `Debug`：開啟角色與場景 Collision 虛線描繪
- Debug 選單內可調整角色移動速度與顯示尺寸

## 系統內容

- 八方向角色圖片自動切換
- 放開按鍵後保留最後面向
- 斜向移動速度正規化
- 角色圓形碰撞、場景不規則多邊形／圓形碰撞與牆面滑動
- 中央平台與兩側入口相連的 NavMesh
- 平滑鏡頭跟隨及世界邊界限制

## 網頁版本

- GitHub Pages：<https://sbaak85.github.io/Echoes/>
- 推送到 `main` 後，GitHub Actions 會自動重新建立並更新網頁。
