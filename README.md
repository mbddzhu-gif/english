# 麦包AI - 拍照识物学英语

## 品牌资源
- Logo SVG：`assets/maibao-logo.svg`

## Loading 文案池维护规范
- 文案池文件：`constants/loadingTips.js`
- 取样方式：使用 `crypto.getRandomValues`（若不可用则回退）生成随机序列，并限制连续重复不超过 3 次
- 版式约束：Loading 文案容器最大宽度约等于 22 个汉字宽度（`max-width: 22em`），小屏自动换行

## 动画变量说明
- 呼吸灯动画：`@keyframes fadeBreath`（仅透明度变化，周期 2.4s，ease-in-out）

## 测试
```bash
npm test
```

