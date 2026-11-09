# V2EX Ease

V2EX 浏览增强 Chrome 插件（Manifest V3，无依赖、无构建）。

## 功能

- **@用户悬浮**：鼠标移到回复里的 `@某人`，显示此人在这一楼之前的所有回复，跨分页也可用。
- **楼层悬浮**：鼠标移到 `#26` 这类楼层引用，显示该楼内容。
- **base64 解码**：回复/正文中的 base64 直接显示解码结果（悬停看原文），解码结果中的 http(s) 链接可点击并在新标签页打开。
- **头像信息卡**：点击头像显示会员编号、注册时间、签名、简介等；Ctrl/Shift/中键点击仍跳转主页。
- **隐藏广告**：隐藏站方插入在回复列表、正文与附言之间的 Google 广告。

支持 `v2ex.com`、`v2ex.co` 及其子域名（如 `www.v2ex.com`、`global.v2ex.co`）。

## 安装

1. 打开 `chrome://extensions`，开启右上角「开发者模式」。
2. 点「加载已解压的扩展程序」，选择本目录。
3. 更新代码后，在扩展页点刷新按钮，再刷新 V2EX 页面。

## 资源占用

- 全局只有一个事件委托和一个复用的浮层，悬浮 250ms 后才触发。
- 话题回复通过 V2EX 公开接口 `/api/replies/show.json` 一次取全，缓存在当前标签页的 sessionStorage（只存纯文本），离开话题即清空。
- 头像信息优先复用已加载的回复数据，否则调 `/api/members/show.json`，同一用户每页只查一次。
- 公开接口限额：每 IP 每小时 600 次。

## 打包发布

修改 `manifest.json` 的 `version`，推送同名 tag（如 `v1.0.1`），GitHub Actions（`.github/workflows/build.yml`）会自动打包 `v2ex-ease-<版本>.zip` 并创建 Release。tag 与 manifest 版本不一致时构建失败。

## 测试

```bash
node b64.test.js
```
