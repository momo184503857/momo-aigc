# momo-aigc UI 迁移指南：Element Plus → shadcn-vue

本文件是把 Element Plus(EP) 组件迁移到 shadcn-vue 的标准食谱。**只允许修改 UI 层**，严禁改动业务逻辑。

## 硬性规则

1. **禁止改动**：API 地址/参数/返回值处理、数据结构、路由、权限、登录逻辑、表单提交逻辑、上传逻辑、AI 调用逻辑、组件的 props/emits 名字与语义、defineExpose 暴露的方法、watcher/onMounted 等生命周期逻辑。
2. script 中唯一允许动的部分：import 语句（图标库、UI 组件、`useUiFeedback`）、以及纯 UI 的响应式变量（如弹窗 visible 的绑定方式适配）。其余逐字保留。
3. `<script setup>` 的顶层注释（文件头功能说明）必须保留。
4. 模板中的中文文案逐字保留；按钮上的图标可以换 Lucide 等价图标，但同一业务含义全项目用同一图标。
5. 不要 `npm install`、不要运行 `vue-tsc`/`tsc`/`vite build`（由协调者统一验证）。只做文件编辑。
6. 旧 EP 相关的 scoped CSS（如 `var(--el-*)`、`.el-*` 深选择器）随组件迁移一并删除；通用样式改用 Tailwind 类表达。
7. Tailwind v4 语法；项目已有语义 token，颜色一律用语义类：`bg-background bg-card bg-muted bg-secondary text-foreground text-muted-foreground border-border bg-primary text-primary-foreground bg-destructive text-destructive text-success bg-success text-warning`；价格红用 `text-(--momo-color-price)`。不要写死十六进制。
8. reka-ui 的 SelectRoot/DialogRoot 等根组件 `inheritAttrs:false`，宿主传给组件的 `class` 不会自动落到 DOM：包装类组件需 `defineOptions({ inheritAttrs: false })` + 把 `useAttrs().class` 绑到真正渲染的元素上（参考 `src/components/ModelChannelSelect.vue` 现成做法）。
9. 交互状态必须保留：loading（按钮禁用+旋转图标）、disabled、empty（`UiEmptyState`）。

## 先读这些参考文件（已迁移完成，模仿它们）

- `src/components/ModelChannelSelect.vue` — Select 包装、class 透传
- `src/components/ui/UiPagination.vue` — Select + Pagination 用法
- `src/components/ui/UiEmptyState.vue` — 空状态
- `src/components/FeedbackHost.vue` — AlertDialog + Button + Input
- `src/layouts/MainLayout.vue` — Tailwind 类风格、`cn()`、Lucide 图标
- `src/components/ui/button/index.ts` — Button 的 variant/size 全集
- `src/components/ui/badge/index.ts` — Badge variant 全集
- `src/components/ui/alert/index.ts` — Alert variant

## 组件映射食谱

所有 shadcn 组件从 `@/components/ui/<name>` 导入。图标统一 `import { Xxx } from '@lucide/vue'`（**不要** lucide-vue-next，本项目包名是 `@lucide/vue`）。

### el-button → Button

```vue
<Button>主操作</Button>                            <!-- type="primary" -->
<Button variant="outline">次要</Button>           <!-- 默认/plain -->
<Button variant="secondary">灰底</Button>
<Button variant="ghost">幽灵</Button>             <!-- text 按钮 -->
<Button variant="link">链接</Button>
<Button variant="destructive">危险</Button>       <!-- type="danger" 实心 -->
<Button size="sm">小</Button>                     <!-- size="small" -->
<Button size="lg">大</Button>                     <!-- size="large" -->
<Button size="icon"><X /></Button>                <!-- circle 图标按钮 -->
```

- `:icon="Download"` → 图标作为子节点放文字前：`<Button><Download />下载</Button>`（Button 样式自动给 svg size-4）。
- `:loading="saving"` → `:disabled="saving"` + 前置 `<LoaderCircle class="animate-spin" />`（**必须**保留 loading 态，禁用原 disabled 表达式时与 loading 做 `||` 合并）。
- `text type="danger"` → `variant="ghost" class="text-destructive hover:text-destructive"`。
- `native-type="submit"` → `type="submit"`。
- round → `class="rounded-full"`。

### el-input → Input / el-input type="textarea" → Textarea

```vue
<Input v-model="form.name" placeholder="…" />
<Textarea v-model="form.prompt" :rows="4" placeholder="…" />
```

- v-model 直接可用（`update:modelValue` 值为 `string | number`）。
- `clearable`：搜索框场景用下面的「搜索框标准写法」，其他场景若原来依赖 clearable，用相对定位 + 条件渲染的 clear 按钮实现。
- `size="small"` → `class="h-7 text-[0.8rem]"`（或直接默认 h-8，按密度需要）。
- 前后图标：`relative` 容器 + 绝对定位图标 + `pl-8`/`pr-8`。
- `:disabled`、`:readonly`、`type="password"`、`maxlength`、`show-word-limit`（用 `maxlength` + 右下角 `text-xs text-muted-foreground` 计数）均用原生属性表达。

搜索框标准写法：

```vue
<div class="relative w-56">
  <Search class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
  <Input v-model="keyword" placeholder="搜索…" class="pl-8" @keyup.enter="handleSearch" />
</div>
```

### el-input-number → UiNumberInput

`import { UiNumberInput } from '@/components/ui'`；`v-model`、`min`、`max`、`step`、`disabled` 同名保留。不确定值允许 `undefined`。

### el-select → Select

值必须是 string；数字/枚举值在边界处用 `String()`/`Number()` 转换（参考 ModelChannelSelect）。

```vue
<Select :model-value="String(value)" @update:model-value="onChange(String($event))">
  <SelectTrigger class="w-40">
    <SelectValue placeholder="请选择" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem v-for="opt in options" :key="opt.value" :value="String(opt.value)">
      {{ opt.label }}
    </SelectItem>
  </SelectContent>
</Select>
```

- trigger 默认 `w-fit`，务必按原宽度补 `class="w-XX"` 或 `w-full`。
- 需要自定义触发器显示内容时，在 SelectTrigger 里直接写（不要用 SelectValue），选中态数据从现有响应式变量取（见 ModelChannelSelect）。
- `filterable` 无对应物：去掉即可（模型/选项列表不长）；保留 placeholder/disabled 行为。
- `multiple` 无对应物：遇到时改用 Checkbox 组或保留原语义用 Popover+Checkbox 列表；若文件里出现先标记 `// TODO(multiple-select)` 再按语义实现。

### el-radio-group / el-radio-button → ToggleGroup

```vue
<ToggleGroup
  type="single" variant="outline"
  :model-value="resolution"
  @update:model-value="(v) => { if (v) { resolution = String(v); handleResolutionChange() } }"
>
  <ToggleGroupItem v-for="r in availableResolutions" :key="r" :value="r">{{ r }}</ToggleGroupItem>
</ToggleGroup>
```

- ToggleGroup 取消选择会 emit 空值，必须 `if (v)` 守卫（EP radio 不可取消选中）。
- 真正的单选列表（非分段按钮）用 `RadioGroup`/`RadioGroupItem`（`@/components/ui/radio-group`）。

### el-checkbox → Checkbox

```vue
<Checkbox :model-value="row.selected" @update:model-value="(v) => row.selected = v === true" />
<label class="text-sm">启用</label>
```

- reka Checkbox 的 model 是 `CheckedState`（`boolean | 'indeterminate'`），比较时用 `v === true` 归一化。

### el-switch → Switch

`<Switch :model-value="enabled" @update:model-value="(v: boolean) => ..." />`

### el-tag → Badge

variant 映射：`type="primary"`→默认、`info`→`secondary`、`danger`→`destructive`、`success`→`success`、`warning`→`warning`（success/warning variant 已内置 status 语义色，直接用）：

```vue
<Badge>默认</Badge>
<Badge variant="secondary">info</Badge>
<Badge variant="destructive">危险</Badge>
<Badge variant="success">成功</Badge>
<Badge variant="warning">警告</Badge>
```

其他状态色可用 `_colors.css` 里的 status 语义对（running/rejected/cancelled）做 class 覆盖。`size="small"` 忽略（Badge 本来紧凑）。

### el-alert → Alert

```vue
<Alert>
  <Info />
  <AlertTitle>标题</AlertTitle>
  <AlertDescription>内容</AlertDescription>
</Alert>
```

- `type="error"` → `variant="destructive"`；`type="warning"` → `variant="warning"`（已内置）；`type="success"` → default + `<CircleCheck class="text-success" />`；info → default。
- `:closable="false"` 忽略（默认不可关）。有 `show-icon` 时放 Lucide 图标在最前。

### el-dialog → Dialog

```vue
<Dialog :open="visible" @update:open="(v) => (visible = v)">
  <DialogContent class="sm:max-w-lg">
    <DialogHeader>
      <DialogTitle>标题</DialogTitle>
      <DialogDescription v-if="…">副标题</DialogDescription>
    </DialogHeader>
    …body…
    <DialogFooter>
      <Button variant="outline" @click="visible = false">取消</Button>
      <Button @click="onConfirm">确定</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- `v-model="visible"` → `:open` + `@update:open`；若原来是 `v-model:visible` 的自定义组件 prop 保持 prop 接口不变，只改内部实现。
- `width="600px"` → `class="sm:max-w-xl"`（`sm:max-w-md/lg/xl/2xl` 选接近档）。
- 内容超高的用 `DialogScrollContent`。
- `:close-on-click-modal="false"` → `@pointer-down-outside.prevent`（DialogContent 支持）；`:close-on-press-escape="false"` → `@escape-key-down.prevent`。
- `destroy-on-close` → 给内容根节点加 `v-if="visible"`。

### el-message-box / ElMessageBox → useUiFeedback（已完成封装）

```ts
import { useUiFeedback, confirmDialog, promptDialog } from '@/composables/useUiFeedback'
const { success, error, warning, info, confirmDanger } = useUiFeedback()
await confirmDialog('确定执行？', '标题', { confirmText: '确定' })   // 取消会 throw（try/catch 捕获）
await confirmDanger({ message: '删除后不可恢复', confirmText: '删除' })
const { value } = await promptDialog('请输入备注', '备注', { inputValue: row.remark })
```

- `ElMessage.success/error/warning` → `success()/error()/warning()`；`error(err, '兜底文案')` 会自动走 `translateError`。
- ElMessageBox 的 `.catch(() => {})` 语义不变（取消即 throw）。

### el-table → Table

```vue
<div class="overflow-auto rounded-lg border">
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead class="w-10">
          <Checkbox :model-value="allChecked" @update:model-value="toggleAll" />
        </TableHead>
        <TableHead>名称</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="row in rows" :key="row.id" :data-state="row.selected && 'selected'">
        <TableCell><Checkbox :model-value="row.selected" @update:model-value="(v) => row.selected = v === true" /></TableCell>
        <TableCell class="max-w-40 truncate" :title="row.name">{{ row.name }}</TableCell>
      </TableRow>
    </TableBody>
  </Table>
</div>
```

- `show-overflow-tooltip` → `truncate` + 原生 `title` 属性。
- selection 列 → Checkbox（表头全选用 computed get/set 或 `:model-value="allSelected"` + 更新函数）。
- 空数据 → `<TableEmpty :colspan="N"><UiEmptyState title="暂无数据" /></TableEmpty>`。
- loading → 用 `v-if="loading"` 显示若干行 `<Skeleton class="h-8 w-full" />`（放 TableCell colspan）。
- 行内操作按钮 → `Button variant="ghost" size="sm"`。
- `el-table` 的 `height`/`max-height` 固定滚动 → 外层 div `overflow-auto max-h-…`。

### el-pagination → UiPagination

```vue
<UiPagination
  v-model:current-page="page"
  v-model:page-size="pageSize"
  :total="total"
  @current-change="load"
  @size-change="load"
/>
```

已在 `@/components/ui` 导出；保持原事件名。

### el-progress → Progress

`<Progress :model-value="percent" />`（0-100）。

### el-tooltip → 原生 title 或 Tooltip

- 简单悬停提示：**直接用原生 `title` 属性**（零成本）。
- 复杂内容（多行、富格式）且页面在 MainLayout（有 SidebarProvider=TooltipProvider）内才用 `Tooltip/TooltipTrigger/TooltipContent`；登录页/管理端无 Provider，需自包 `TooltipProvider` 或改用 title。

### el-popover → Popover

```vue
<Popover>
  <PopoverTrigger as-child><Button variant="ghost" size="icon"><Ellipsis /></Button></PopoverTrigger>
  <PopoverContent class="w-56">…</PopoverContent>
</Popover>
```

### el-dropdown → DropdownMenu

```vue
<DropdownMenu>
  <DropdownMenuTrigger as-child><Button variant="ghost" size="icon"><Ellipsis /></Button></DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem @click="onEdit">编辑</DropdownMenuItem>
    <DropdownMenuItem class="text-destructive" @click="onDelete">删除</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### el-tabs → Tabs

```vue
<Tabs v-model="activeTab">
  <TabsList>
    <TabsTrigger value="a">标签A</TabsTrigger>
  </TabsList>
  <TabsContent value="a">…</TabsContent>
</Tabs>
```

只有标签头（内容自渲染）时可省略 TabsContent。type="card"/"border-card" 风格差异忽略，用默认。

### el-form / el-form-item → 布局原语

不用引入 Form 库。统一写法：

```vue
<div class="grid gap-1.5">
  <Label for="name">名称</Label>
  <Input id="name" v-model="form.name" />
  <p v-if="errors.name" class="text-destructive text-xs">{{ errors.name }}</p>
</div>
```

`label-width` 布局用 `grid grid-cols-[100px_1fr] items-center gap-x-3 gap-y-4` 之类的 Tailwind 网格；垂直表单用 `flex flex-col gap-4`。原 `el-form` 只有一处用了 `:rules`（PromptLibraryPage），改成提交时手动校验（保持相同的提示文案）。

### el-empty → UiEmptyState

`<UiEmptyState title="暂无数据" description="…" />`（`@/components/ui` 导出）。需要操作按钮放默认插槽。

### el-image / 预览 → img + UiImagePreview

```vue
<img :src="url" class="media-tile size-20 cursor-zoom-in" @click="preview.open(url)" />
<UiImagePreview v-model="preview.visible.value" :url="preview.url.value" />
```

项目已有 `useImagePreview` composable（`src/composables/useImagePreview.ts`），先看它再写。`media-tile` 是全局 utility（tailwind.css 定义）。

### el-skeleton → Skeleton

`<Skeleton class="h-4 w-32" />` 循环若干行。

### el-scrollbar → 原生 overflow

`class="overflow-auto"`（全局滚动条样式已在 global.css 收口）。不要引 ScrollArea 除非原组件真有特殊滚动行为。

### el-divider → Separator

`<Separator />` / `<Separator orientation="vertical" class="h-4" />`。

### el-drawer → Sheet

`Sheet/SheetContent side="right"/SheetHeader/SheetTitle/SheetFooter`。

### el-card → 谨慎使用

只有独立语义块才用 `Card/CardHeader/CardTitle/CardContent`。普通分组用 `surface` utility（tailwind.css 定义的 `.surface`）或直接留白分隔。

### el-icon 包装 → 直接用 Lucide 组件

`<el-icon><Search /></el-icon>` → `<Search class="size-4" />`。

## 图标映射（@element-plus/icons-vue → @lucide/vue）

常用：Download→Download, Upload→Upload, Document→FileText, DocumentCopy→Copy, Delete→Trash2, Refresh→RefreshCw, RefreshLeft→RotateCcw, MagicStick→Wand2, Box→Archive, Plus→Plus, Minus→Minus, Search→Search, Close→X, Check→Check, Edit→Pencil, EditPen→Pencil, ArrowLeft→ArrowLeft, ArrowRight→ArrowRight, Back→ArrowLeft, Right→ChevronRight, ArrowDown→ChevronDown, CaretTop→ChevronUp, CaretBottom→ChevronDown, Top→ArrowUp, Bottom→ArrowDown, Fold→ChevronsLeft, Expand→ChevronsRight, Setting→Settings, Tools→Wrench, Operation→SlidersHorizontal, User→User, Lock→Lock, Key→Key, View→Eye, Hide→EyeOff, CopyDocument→Copy, Picture→Image, PictureFilled→Image, ZoomIn→ZoomIn, ZoomOut→ZoomOut, FullScreen→Maximize2, Crop→Crop, Scissors→Scissors, Loading→LoaderCircle(加 animate-spin), Clock→Clock, Calendar→Calendar, Timer→Timer, List→List, Menu→Menu, Grid→LayoutGrid, Star→Star, StarFilled→Star, Collection→Library, PriceTag→Tag, Tag→Tag, Link→Link, Share→Share2, Bell→Bell, Message→MessageSquare, ChatDotRound→MessageCircle, Promotion→Send, Warning→TriangleAlert, WarningFilled→TriangleAlert, InfoFilled→Info, QuestionFilled→CircleHelp, CircleCheck→CircleCheck, CircleCheckFilled→CircleCheck, CircleClose→CircleX, SuccessFilled→CircleCheck, CirclePlus→CirclePlus, Remove→CircleX, MoreFilled→Ellipsis, More→EllipsisVertical, Filter→Filter, Sort→ArrowUpDown, Rank→ArrowUpDown, Folder→Folder, FolderOpened→FolderOpen, FolderAdd→FolderPlus, Files→Files, UploadFilled→Upload, Download→Download, DataAnalysis→ChartColumn, Histogram→ChartColumn, DataLine→ChartLine, TrendCharts→TrendingUp, PieChart→PieChart, Monitor→Monitor, Iphone→Smartphone, Platform→Monitor, Connection→Unplug/Link2, Wallet→Wallet, Coin→Coins, CreditCard→CreditCard, ShoppingCart→ShoppingCart, Goods→Package, Shop→Store, Present→Gift, Medal→Medal, Trophy→Trophy, Compass→Compass, Aim→Crosshair, Position→MapPin, Location→MapPin, Switch→ArrowLeftRight, Guide→Compass, Help→CircleHelp, Notebook→Notebook, Reading→BookOpen, Avatar→CircleUser, House→Home, FirstAidKit→Cross, Paperclip→Paperclip, Lightning→Zap, Sunny→Sun, Moon→Moon, Brush→Paintbrush, Palette→Palette, Magic→Wand2。

表中找不到的：到 `node_modules/@lucide/vue/dist/esm/icons/` 目录名里挑语义最接近的，保持克制（同含义同图标）。

## CSS 清理规则

- scoped style 里只保留 Tailwind 表达不了的（如 `text-wrap: balance`、复杂动画、对子组件的 `:deep()` 微调）。
- `var(--el-text-color-primary)` → `var(--momo-color-text)`；`--el-text-color-regular` → `var(--momo-color-text-secondary)`；`--el-text-color-secondary` → `var(--momo-color-text-tertiary)`；`--el-text-color-placeholder` → `var(--momo-color-text-placeholder)`；`--el-color-primary` → `var(--momo-color-brand)`；`--el-color-danger` → `var(--momo-color-danger)`；`--el-border-color*` → `var(--momo-color-border*)`。更优先：直接用 Tailwind 语义类替代整段 CSS。
- 魔法数字颜色 → 语义 token。
- 删除迁移后不再使用的 class 与 import。

## 完成后自查（每个文件）

1. 文件内不再出现 `el-`、`element-plus`、`@element-plus`、`ElMessage`、`ElMessageBox`、`--el-`。
2. script 业务逻辑 diff 仅有 import 与纯 UI 变量变化。
3. 无未使用的 import/变量。
