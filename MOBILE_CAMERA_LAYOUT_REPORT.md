# 移动端拍照页布局适配修复报告

## 1. 问题复现与量化方法
现象：移动端进入“拍照”页面后，拍照按钮在首屏底部被遮挡，需要手动下滑才能完整露出。

量化方式（已内置日志）：
- 打开拍照页面后，在控制台会输出：
  - `[CameraLayout] viewportHeight=... btnBottom=... overflowPx=... overflowRatio=...`
- 判定标准：
  - `overflowPx > 0` 表示按钮底部超出可视区域
  - 目标：`overflowPx = 0`，且按钮距底部（含安全区）≥ 8px（当前实现为 16px + safe-area）

## 2. 根因定位
根因组合：
- 使用 `100vh`（布局视口）计算页面高度：在 iOS Safari/部分 WebView 上，`100vh` 会包含动态工具栏区域，导致“视觉可视区域（visual viewport）”更小，从而出现底部元素被裁切。
- 拍照按钮采用绝对定位 `bottom: 40px`，叠加上述高度偏差后更容易溢出。
- 未启用 `viewport-fit=cover` 时，iPhone 刘海/底部 Home 指示条安全区无法通过 `env(safe-area-inset-*)` 正确参与布局。

## 3. 修复方案与实现要点
### 3.1 动态视口高度补偿（核心）
- 通过 `window.visualViewport.height`（若不可用则退回 `window.innerHeight`）计算真实可视高度，并写入 CSS 变量：
  - `--app-height`
  - 同步计算 `--header-h`、`--step-h`（根据元素是否隐藏取 offsetHeight）
- 使用这些变量替代 `100vh` 参与布局计算：
  - 页面最小高度、相机容器高度、loading/history 等区域高度统一使用 `calc(var(--app-height) - var(--header-h) - var(--step-h))`

实现位置：
- [app.js](file:///c:/Users/30558/Desktop/AI产品创造营/待部署/微课堂2/js/app.js)
- [style.css](file:///c:/Users/30558/Desktop/AI产品创造营/待部署/微课堂2/css/style.css)

### 3.2 安全区适配（iPhone 底部/顶部）
- `meta viewport` 增加 `viewport-fit=cover` 以启用安全区常量：
  - [index.html](file:///c:/Users/30558/Desktop/AI产品创造营/待部署/微课堂2/index.html)
- 顶部：header padding-top 加上 `env(safe-area-inset-top)`
- 底部：拍照按钮容器 bottom 使用 `calc(16px + env(safe-area-inset-bottom))`

## 4. 兼容性矩阵（建议最低版本）
说明：本方案不依赖 `100dvh/svh/lvh`，核心基于 `visualViewport`（优先）+ `innerHeight`（回退）+ safe-area env。

- iOS Safari：
  - 建议最低 iOS 13+
  - iOS 15+ 对动态工具栏变化更常见，本方案覆盖
- iOS 微信内置浏览器（WKWebView）：
  - 建议 iOS 13+
  - 若 `visualViewport` 不稳定，仍会回退 `innerHeight`，一般可满足“不遮挡”
- Android Chrome：
  - 建议 Android 8+ / Chrome 80+
  - `visualViewport` 通常可用
- Android 微信/华为浏览器：
  - 建议 Android 8+
  - 若存在极端机型差异，以回归用例验证为准

## 5. 真机验证清单（回归用例）
进入拍照页（点击“拍照识别”）后逐项检查：
- 首屏无需任何手动滚动，拍照按钮完整可见
- 竖屏/横屏切换后按钮仍完整可见
- 顶部地址栏收起/展开（滚动或轻触）后按钮仍完整可见
- iPhone 带 Home 指示条机型：按钮与底部安全区间距≥ 8px
- 微信内置浏览器：首次授权摄像头后，布局不跳动导致按钮被裁切

建议记录：
- 机型、系统版本、浏览器/内核版本
- 控制台 `[CameraLayout]` 输出（用于定量对比）

