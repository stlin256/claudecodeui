# CloudCLI Harmony

[English](README.md) · **简体中文** · [繁體中文](README.zh-TW.md)

适用于 HarmonyOS 的 [CloudCLI](https://github.com/siteboon/claudecodeui) 原版远程界面客户端，由 [@stlin256](https://github.com/stlin256) 维护。

<img src="apps/harmony/entry/src/main/resources/rawfile/maintainer-avatar.png" width="64" height="64" alt="stlin256 的 GitHub 头像">

**移动端版本：** 0.2.0 · **Tag：** `harmony-v0.2.0` · **维护分支：** `codex/harmonyos-client` · **许可：** AGPL-3.0-or-later

## 功能

- ArkWeb 直接加载远端原版 CloudCLI，保留聊天、项目及工具界面，无需单独维护一套移动聊天 UI。
- 兼容官方账号密码、首次注册，以及通过登录网关使用的 Passkey / 指纹验证；身份服务源地址须明确配置。
- 三步连接引导：网页地址、登录方式、确认连接；网页加载失败后可重新配置。公开源码不含私人部署地址。
- 侧边栏注入应用设置：本机亮色 / 暗色 / 自动、连接与登录、退出登录和关于。
- 本机通知分为**待确认、任务失败、任务完成、其他消息**，支持“仅重要 / 全部 / 全部静音”预设。账户通知偏好与设备偏好同时生效，APP 关闭后仍按级别过滤。
- APP 层设置切页、弹窗、侧边栏和路由动画，尊重系统减少动态效果偏好，不逐条动画处理流式消息。
- 关于页显示项目、真实清单版本、维护者用户名和头像、仓库及 [Issue 反馈](https://github.com/stlin256/claudecodeui/issues/new/choose)。

系统栏始终保留安全区域，不提供全屏开关。

## 连接与登录

1. 输入 CloudCLI 的 **HTTPS 源地址**，例如 `https://cloudcli.example.com:9443`，不包含页面路径。
2. 选择“官方账号 / 密码”或“Passkey / 登录网关”。使用网关时，只添加实际登录跳转经过的 HTTPS 身份服务源地址；同源认证可留空。
3. 确认连接，在远端原版页面完成登录。APP 不保存网页登录密码或 Passkey 私钥。

在“应用设置 → 分级通知”允许系统通知，并选择事件类别。偏好只作用于本机，不会关闭其他设备通知；CloudCLI 原有账户事件开关仍会约束推送。

## CLI 构建

需要 DevEco Studio、HarmonyOS SDK 26 以及属于你自己的应用签名 Profile。最低支持 API 23。无需启动 IDE 图形界面。

```powershell
npm ci
powershell -ExecutionPolicy Bypass -File scripts/harmony/build.ps1 -BuildMode release
```

首次构建会生成被 Git 忽略的本地签名和运行配置。Profile 必须匹配应用 Bundle，并含 Push Kit 能力与 FIDO2 权限。详见 [构建及推送配置](apps/harmony/README.md)。

系统推送需要部署本 fork 服务端、开通应用 Push Kit，并配置存放在仓库外的项目级服务帐号 JSON。目前实测为**静默测试推送**；正式 `WORK` 分类仍需华为相应权益。通知级别开关不会替代云端分类申请或系统铃声、横幅权限。

## 维护与验证

- [上游来源与同步](apps/harmony/UPSTREAM.md)：保留上游完整历史，初始基线 v1.37.6；可在 Actions 手动运行 **Harmony upstream status** 查看上游差异。
- [验证记录与限制](apps/harmony/VALIDATION.md)。
- CI 覆盖 APP 桥接、设置、通知投递、原有前端测试、类型检查、lint 和网页 / 服务端构建。原生构建使用本机 SDK 与私有签名。
- 发布前暂存源码并运行 `node scripts/harmony/check-publication.mjs`，不要提交私人地址、签名、密钥、服务帐号、日志和截图。

升级请按本 fork 的合并、构建和部署流程操作。上游网页内置更新器面向官方包，不能维护移动端集成修改。

[上游原始 README](README.upstream.md) · [报告问题](https://github.com/stlin256/claudecodeui/issues/new/choose) · [维护者](https://github.com/stlin256)
