# CloudCLI Harmony

[English](README.md) · [简体中文](README.zh-CN.md) · **繁體中文**

適用於 HarmonyOS 的 [CloudCLI](https://github.com/siteboon/claudecodeui) 原版遠端介面客戶端，由 [@stlin256](https://github.com/stlin256) 維護。

<img src="apps/harmony/entry/src/main/resources/rawfile/maintainer-avatar.png" width="64" height="64" alt="stlin256 的 GitHub 頭像">

**行動版：** 0.2.0 · **Tag：** `harmony-v0.2.0` · **分支：** `codex/harmonyos-client` · **授權：** AGPL-3.0-or-later

## 功能

- ArkWeb 直接載入遠端原版 CloudCLI，保留聊天、專案及工具介面。
- 支援官方帳號密碼、首次註冊，以及登入閘道的 Passkey / 指紋驗證。身分服務來源必須明確設定。
- 三步連線引導、載入失敗後重新設定；公開程式碼不含私人部署位址。
- 側邊欄的應用程式設定包含本機亮色 / 暗色 / 自動、連線與登入、登出及關於。
- 通知分成**待確認、工作失敗、工作完成、其他訊息**，可選「僅重要 / 全部 / 全部靜音」。帳戶與裝置偏好同時生效，程式關閉後仍會依類別過濾。
- 設定、對話框、側邊欄與路由動畫由 APP 注入；尊重減少動態效果偏好，不逐則動畫處理串流訊息。
- 關於頁顯示專案、實際版本、維護者名稱與頭像、原始碼及 [Issue 回報](https://github.com/stlin256/claudecodeui/issues/new/choose)。

系統列保留安全區域，沒有全螢幕開關。

## 連線與建置

1. 輸入 CloudCLI 的 HTTPS 來源，例如 `https://cloudcli.example.com:9443`，不含網頁路徑。
2. 選擇官方密碼或 Passkey 閘道。閘道只需加入實際重新導向的 HTTPS 身分服務來源；同來源驗證可留空。
3. 確認連線，在原版頁面登入。APP 不儲存網頁密碼或 Passkey 私鑰。

在「應用設定 → 分級通知」允許本機通知並選擇事件類別；其他裝置不受影響，帳戶事件設定仍然有效。

安裝 DevEco Studio、HarmonyOS SDK 26 並準備自己的應用簽署 Profile，最低支援 API 23。可完全透過 CLI 建置：

```powershell
npm ci
powershell -ExecutionPolicy Bypass -File scripts/harmony/build.ps1 -BuildMode release
```

首次建置產生的本機簽署與執行設定會被 Git 忽略。Profile 需匹配 Bundle、Push Kit 能力及 FIDO2 權限。詳見 [建置與推播設定](apps/harmony/README.md)。

推播需要此 fork 的伺服器、Push Kit 及存放在倉庫外的專案級服務帳號 JSON。目前驗證為**靜默測試推播**；正式 `WORK` 分類需申請華為對應權益。事件開關不會取得雲端分類或系統鈴聲、橫幅權限。

## 維護

[上游同步流程](apps/harmony/UPSTREAM.md) 保留完整歷史及 v1.37.6 初始基線。Actions 的 **Harmony upstream status** 可手動比較上游更新；[驗證記錄](apps/harmony/VALIDATION.md) 列出測試與限制。

CI 執行橋接、設定、通知與前端測試，以及型別、lint 和網頁 / 伺服器建置。原生建置使用本機 SDK 與私有簽署。發布前執行 `node scripts/harmony/check-publication.mjs`，不提交私人位址、憑證、金鑰、日誌與截圖。

更新請使用 fork 的合併及建置流程；上游內建更新器面向官方套件，無法保留行動版整合。

[上游原始 README](README.upstream.md) · [回報問題](https://github.com/stlin256/claudecodeui/issues/new/choose) · [維護者](https://github.com/stlin256)
