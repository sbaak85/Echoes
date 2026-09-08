import { GamepadHint } from "../gamepad-button-icon";

export default function DialogueCurrentPreview() {
  return (
    <main
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: "#071019",
        color: "#f3f7ed",
        fontFamily: '"Microsoft JhengHei", sans-serif',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            'linear-gradient(rgba(2, 8, 12, 0.14), rgba(2, 8, 12, 0.28)), url("/maps/map_test01.png") center 60% / cover no-repeat',
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 28,
          left: 32,
          display: "grid",
          gap: 4,
          color: "rgba(225, 238, 232, 0.82)",
          fontSize: 12,
          letterSpacing: "0.12em",
          textShadow: "0 2px 8px #000",
        }}
      >
        <strong style={{ color: "#ffe36a", fontSize: 16 }}>目前 Pull 版本</strong>
        <span>正式遊戲正在使用的 dialogue-box 樣式</span>
      </div>

      <div className="dialogue-history-trigger" aria-hidden="true">
        <GamepadHint text="按 [LT] 回顧訊息" />
      </div>

      <section
        className="dialogue-box dialogue-size-medium"
        aria-label="目前正式遊戲對話視窗外觀"
      >
        <strong className="dialogue-speaker">Sbaak</strong>
        <span className="dialogue-text">
          準備一些補給與工具吧，{"\n"}最重要的是把訊號探測儀帶上。
        </span>
        <span className="dialogue-next" aria-hidden="true" />
      </section>
    </main>
  );
}
