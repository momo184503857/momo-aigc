<script setup lang="ts">
import { computed, ref } from 'vue'
import * as U from '..'
import { toast } from 'vue-sonner'
import { useDesignSystem } from '../context'
const { toastId } = useDesignSystem()
import { sampleImage } from './sample'
const props = defineProps<{ family: string; state: string }>()
const disabled = computed(() => props.state === 'disabled' || props.state === 'loading')
const text = ref('示例内容')
const checked = ref(true)
const selected = ref('one')
const number = ref<number | undefined>(2)
const values = ref([45])
const date = ref<[Date, Date] | null>(null)
const page = ref(1)
const size = ref(20)
const preview = ref(false)
const notice = ref(false)
</script>
<template>
  <div class="ds-stack">
    <div v-if="family === 'button'" class="ds-row"><U.Button v-for="variant in (['default','outline','secondary','ghost','destructive','link'] as const)" :key="variant" :variant="variant" :disabled="disabled"><U.Spinner v-if="state === 'loading'" />{{ variant }}</U.Button><U.Button size="sm">小按钮</U.Button><U.Button size="lg">大按钮</U.Button></div>
    <U.DsField v-else-if="['input','textarea','label'].includes(family)" v-slot="field" label="提示词" :error="state === 'error' ? '请填写提示词' : undefined" help="描述希望生成的内容" required><U.Textarea v-if="family === 'textarea'" :id="field.id" v-model="text" :aria-invalid="field.invalid" :aria-describedby="field.describedby" :disabled="disabled" /><U.Input v-else :id="field.id" v-model="text" :aria-invalid="field.invalid" :aria-describedby="field.describedby" :disabled="disabled" /></U.DsField>
    <div v-else-if="family === 'checkbox'" class="ds-row"><U.Checkbox id="ds-checkbox-demo" v-model="checked" :disabled="disabled" /><U.Label for="ds-checkbox-demo">保留原始构图</U.Label></div>
    <div v-else-if="family === 'switch'" class="ds-row"><U.Switch id="ds-switch-demo" v-model="checked" :disabled="disabled" /><U.Label for="ds-switch-demo">自动保存</U.Label></div>
    <U.RadioGroup v-else-if="family === 'radio-group'" v-model="selected" :disabled="disabled"><div v-for="(label, i) in ['标准','高清']" :key="label" class="ds-row"><U.RadioGroupItem :id="`ds-radio-${i}`" :value="i ? 'two' : 'one'" /><U.Label :for="`ds-radio-${i}`">{{ label }}</U.Label></div></U.RadioGroup>
    <U.Select v-else-if="family === 'select'" v-model="selected" :disabled="disabled"><U.SelectTrigger aria-label="分辨率"><U.SelectValue /></U.SelectTrigger><U.SelectContent><U.SelectItem value="one">标准 1K</U.SelectItem><U.SelectItem value="two">高清 2K</U.SelectItem></U.SelectContent></U.Select>
    <U.Slider v-else-if="family === 'slider'" v-model="values" :disabled="disabled" aria-label="创意强度" />
    <U.UiNumberInput v-else-if="family === 'number'" v-model="number" :min="1" :max="8" :disabled="disabled" aria-label="生成数量" />
    <U.UiDateRangePicker v-else-if="family === 'date'" v-model="date" :disabled="disabled" />
    <div v-else-if="family === 'badge'" class="ds-row"><U.Badge>品牌</U.Badge><U.Badge variant="secondary">次要</U.Badge><U.Badge variant="destructive">失败</U.Badge><U.Badge variant="outline">轮廓</U.Badge></div>
    <U.Alert v-else-if="family === 'alert'" :variant="state === 'error' ? 'destructive' : 'default'"><U.AlertTitle>操作提示</U.AlertTitle><U.AlertDescription>此处只演示状态，不会操作真实数据。</U.AlertDescription></U.Alert>
    <U.Card v-else-if="family === 'card'"><U.CardHeader><U.CardTitle>生成参数</U.CardTitle><U.CardDescription>标准内容表面</U.CardDescription></U.CardHeader><U.CardContent>标准模型 · 1K</U.CardContent><U.CardFooter><U.Button variant="outline">查看配置</U.Button></U.CardFooter></U.Card>
    <U.Avatar v-else-if="family === 'avatar'"><U.AvatarFallback>墨</U.AvatarFallback></U.Avatar>
    <U.Progress v-else-if="family === 'progress'" :model-value="45" aria-label="生成进度" />
    <U.Spinner v-else-if="family === 'spinner'" aria-label="加载中" />
    <U.Skeleton v-else-if="family === 'skeleton'" class="h-20 w-full" />
    <U.Separator v-else-if="family === 'separator'" />
    <U.Empty v-else-if="family === 'empty'"><U.EmptyHeader><U.EmptyTitle>暂无结果</U.EmptyTitle><U.EmptyDescription>生成后的图片会显示在这里。</U.EmptyDescription></U.EmptyHeader><U.EmptyContent><U.Button variant="outline">添加素材</U.Button></U.EmptyContent></U.Empty>
    <U.UiEmptyState v-else-if="family === 'empty-state'" title="暂无任务" description="选择素材后即可创建任务。" />
    <U.Table v-else-if="family === 'table'"><U.TableHeader><U.TableRow><U.TableHead>任务</U.TableHead><U.TableHead>状态</U.TableHead></U.TableRow></U.TableHeader><U.TableBody><U.TableRow><U.TableCell>{{ state === 'long' ? '这是一个用于检查长内容换行和容器边界的任务名称'.repeat(4) : '商品素材生成' }}</U.TableCell><U.TableCell><U.DsStatus :status="state === 'error' ? 'failed' : 'done'" /></U.TableCell></U.TableRow></U.TableBody></U.Table>
    <U.UiPagination v-else-if="family === 'pagination'" v-model:current-page="page" v-model:page-size="size" :total="128" :disabled="disabled" />
    <U.Tabs v-else-if="family === 'tabs'" default-value="one"><U.TabsList><U.TabsTrigger value="one">参数</U.TabsTrigger><U.TabsTrigger value="two">结果</U.TabsTrigger></U.TabsList><U.TabsContent value="one">参数内容</U.TabsContent><U.TabsContent value="two">结果内容</U.TabsContent></U.Tabs>
    <U.Toggle v-else-if="family === 'toggle'" :disabled="disabled" aria-label="切换选中">选中</U.Toggle>
    <U.ToggleGroup v-else-if="family === 'toggle-group'" type="single" default-value="grid" :disabled="disabled"><U.ToggleGroupItem value="grid">网格</U.ToggleGroupItem><U.ToggleGroupItem value="list">列表</U.ToggleGroupItem></U.ToggleGroup>
    <U.Breadcrumb v-else-if="family === 'breadcrumb'"><U.BreadcrumbList><U.BreadcrumbItem><U.BreadcrumbLink href="#">组件库</U.BreadcrumbLink></U.BreadcrumbItem><U.BreadcrumbSeparator /><U.BreadcrumbItem><U.BreadcrumbPage>导航组件</U.BreadcrumbPage></U.BreadcrumbItem></U.BreadcrumbList></U.Breadcrumb>
    <U.Collapsible v-else-if="family === 'collapsible'"><U.CollapsibleTrigger as-child><U.Button variant="outline">展开高级参数</U.Button></U.CollapsibleTrigger><U.CollapsibleContent>高级参数内容，重复点击可收起。</U.CollapsibleContent></U.Collapsible>
    <U.ScrollArea v-else-if="family === 'scroll-area'" class="h-40"><p v-for="i in 20" :key="i">第 {{ i }} 条模拟记录</p><U.ScrollBar /></U.ScrollArea>
    <U.Dialog v-else-if="family === 'dialog'"><U.DialogTrigger as-child><U.Button variant="outline">打开对话框</U.Button></U.DialogTrigger><U.DialogContent><U.DialogTitle>编辑参数</U.DialogTitle><U.DialogDescription>修改名称后保存。</U.DialogDescription><U.Input v-model="text" aria-label="参数名称" /><U.DialogFooter><U.DialogClose as-child><U.Button>完成</U.Button></U.DialogClose></U.DialogFooter></U.DialogContent></U.Dialog>
    <U.AlertDialog v-else-if="family === 'alert-dialog'"><U.AlertDialogTrigger as-child><U.Button variant="destructive">危险操作示例</U.Button></U.AlertDialogTrigger><U.AlertDialogContent><U.AlertDialogTitle>确认删除？</U.AlertDialogTitle><U.AlertDialogDescription>模拟确认，不会删除真实内容。</U.AlertDialogDescription><U.AlertDialogFooter><U.AlertDialogCancel>取消</U.AlertDialogCancel><U.AlertDialogAction>确认</U.AlertDialogAction></U.AlertDialogFooter></U.AlertDialogContent></U.AlertDialog>
    <U.Sheet v-else-if="family === 'sheet'"><U.SheetTrigger as-child><U.Button variant="outline">打开抽屉</U.Button></U.SheetTrigger><U.SheetContent><U.SheetHeader><U.SheetTitle>任务详情</U.SheetTitle><U.SheetDescription>这是抽屉示例</U.SheetDescription></U.SheetHeader><p>任务参数与结果</p></U.SheetContent></U.Sheet>
    <U.Popover v-else-if="family === 'popover'"><U.PopoverTrigger as-child><U.Button variant="outline">参数浮层</U.Button></U.PopoverTrigger><U.PopoverContent><U.PopoverTitle>快速设置</U.PopoverTitle><U.Input v-model="text" aria-label="快速设置值" /></U.PopoverContent></U.Popover>
    <U.TooltipProvider v-else-if="family === 'tooltip'"><U.Tooltip><U.TooltipTrigger as-child><U.Button variant="outline">悬停或聚焦</U.Button></U.TooltipTrigger><U.TooltipContent>查看帮助</U.TooltipContent></U.Tooltip></U.TooltipProvider>
    <U.HoverCard v-else-if="family === 'hover-card'"><U.HoverCardTrigger as-child><U.Button variant="link">素材说明</U.Button></U.HoverCardTrigger><U.HoverCardContent>商品素材信息</U.HoverCardContent></U.HoverCard>
    <U.DropdownMenu v-else-if="family === 'dropdown-menu'"><U.DropdownMenuTrigger as-child><U.Button variant="outline">更多操作</U.Button></U.DropdownMenuTrigger><U.DropdownMenuContent><U.DropdownMenuLabel>模拟操作</U.DropdownMenuLabel><U.DropdownMenuItem @select="notice = true">复制参数</U.DropdownMenuItem><U.DropdownMenuSeparator /><U.DropdownMenuItem disabled>不可用操作</U.DropdownMenuItem></U.DropdownMenuContent></U.DropdownMenu>
    <U.ContextMenu v-else-if="family === 'context-menu'"><U.ContextMenuTrigger><div class="ds-sample">在这里右键打开菜单</div></U.ContextMenuTrigger><U.ContextMenuContent><U.ContextMenuItem @select="notice = true">复制</U.ContextMenuItem><U.ContextMenuItem>查看详情</U.ContextMenuItem></U.ContextMenuContent></U.ContextMenu>
    <U.SidebarProvider v-else-if="family === 'sidebar'" class="min-h-0"><U.SidebarMenu><U.SidebarMenuItem><U.SidebarMenuButton :is-active="true">创作工作台</U.SidebarMenuButton></U.SidebarMenuItem><U.SidebarMenuItem><U.SidebarMenuButton>生图记录</U.SidebarMenuButton></U.SidebarMenuItem></U.SidebarMenu></U.SidebarProvider>
    <div v-else-if="family === 'image-preview'"><U.Button variant="outline" @click="preview = true">打开图片预览</U.Button><U.UiImagePreview v-model="preview" :url="[sampleImage, sampleImage]" /></div>
    <div v-else-if="family === 'sonner'"><U.Button variant="outline" @click="toast.success('操作已完成（模拟）', { toasterId: toastId })">显示通知</U.Button></div>
    <U.DsNotice v-if="notice" title="操作已完成（模拟）" description="没有请求业务接口"><U.Button variant="ghost" @click="notice = false">关闭通知</U.Button></U.DsNotice>
  </div>
</template>
