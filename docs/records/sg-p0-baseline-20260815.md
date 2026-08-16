# suite-gen P0 分模型基线话术（v0）

> 日期：2026-08-15 ｜ 状态：**v0 已入库，待真实生图校准**
> 入库脚本：`scripts/seed-p0-baselines.ts`（幂等守卫 `system_config.seed_sg_p0_v1`）
> 引擎支持：`promptEngine.assemble` 已实现分模型优先级合并（私有+专属 > 私有 > 全局专属 > 全局通用 > 内置），单测 3 项专项断言通过（test-promptEngine.ts 合计 44/44）

## 一、背景

工作台 V10.0 的锁定话术为豆包 Seedream 调教。momoaigc 使用 ToAPIs 通道的 gpt-image-2 与 Gemini 系模型，两模型对指令的遵循特性不同，需要分模型基线：

| 特性 | gpt-image-2 | Gemini 系 |
|---|---|---|
| 负面指令（"禁止X"）遵循 | 可靠 | 较弱，易正负混淆 |
| 超长模板注意力 | 稳定 | 随长度稀释 |
| 策略 | 沿用工作台原文句式 | 改写为**正向表述 + 压缩篇幅** |

## 二、v0 入库清单（8 条）

| 模板键 | 模型 | 版本要点 |
|---|---|---|
| garment.color-lock | Gemini ×3 | 正向化："色彩必须逐区域复刻参考图…" |
| garment.color-lock | gpt-image-2 | 工作台原文（禁止自动调色/色相漂移…） |
| neg.hand | Gemini ×3 | 正向化："每只手完整呈现五根手指，指节自然弯曲" |
| neg.hand | gpt-image-2 | 工作台原文（禁六指/扭曲/反转/折断） |
| garment.acc-lock | Gemini ×3 | 正向化："配饰完整原样呈现：款式颜色位置一致" |
| garment.acc-lock | gpt-image-2 | 原文 + 丝巾规则澄清 |
| identity.real-skin | Gemini ×3 | 压缩至 1/3 篇幅 |
| garment.restore | Gemini ×3 | 压缩 + 正向化 |

其余 14 条种子模板保持通用版（models=[]，两模型共用）。管理员可在「管理后台 → 成套生图资产 → 锁定模板」继续调优。

## 三、校准流程（待有效 Key 后执行）

1. `npx tsx scripts/run-m6-suite.ts --key <ToAPIs Key>` — 自动生成参考图并跑双模型各 1 套（5 点位），产出 `docs/records/sg-m6-materials-<日期>.md`
2. 按材料清单逐张评审 M6-01~06（服装还原/一致性/连续性/翻车率）
3. 翻车项定位到模板键 → 在后台改对应模型版本 content → 复跑该点位验证 → 结论沉淀回本文档（v1）
