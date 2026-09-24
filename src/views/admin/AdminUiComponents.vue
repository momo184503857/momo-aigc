<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search, Sun, Moon, ArrowUpRight, CircleHelp } from '@lucide/vue'
import * as U from '@/components/design-system'
import registry from '@/components/design-system/registry.json'
import PrimitiveExample from '@/components/design-system/examples/PrimitiveExample.vue'
import ExtendedExample from '@/components/design-system/examples/ExtendedExample.vue'
import CompositeExample from '@/components/design-system/examples/CompositeExample.vue'
import { sampleImage } from '@/components/design-system/examples/sample'
const mode = ref<U.ThemeMode>('light')
const density = ref<'comfortable' | 'compact'>('comfortable')
const category = ref('设计基础')
const search = ref('')
const state = ref('default')
const categories = ['设计基础', '基础组件', '扩展组件', '公共组合', '页面模式']
const group = ref('全部')
const groups = ["基础元素", "筛选与搜索", "表单与输入", "选择器", "上传与文件", "列表与卡片", "标识与切换", "层级结构", "媒体与图表", "弹窗与抽屉", "气泡与提示", "消息通知", "加载与状态", "导航"]
const groupCount = (name: string) => registry.filter(item => item.group === name).length
const filtered = computed(() => registry.filter(item => (group.value !== '全部' ? item.group === group.value : (!search.value ? item.category === category.value : true)) && `${item.title} ${item.id}`.toLowerCase().includes(search.value.toLowerCase())))
const tones = [{ name: '品牌 / 主操作', variable: '--primary' }, { name: '页面背景', variable: '--background' }, { name: '内容表面', variable: '--card' }, { name: '成功', variable: '--success' }, { name: '警告', variable: '--warning' }, { name: '危险', variable: '--destructive' }]
const states = [{value:'default',label:'默认'},{value:'loading',label:'加载中'},{value:'disabled',label:'禁用'},{value:'error',label:'错误'},{value:'empty',label:'空态'},{value:'long',label:'长内容'}]
</script>
<template>
  <U.DsThemeProvider :mode="mode" :density="density">
    <U.TooltipProvider :delay-duration="150">
    <U.DsPage title="UI 组件库">
      <template #actions><U.Button variant="outline" @click="mode = mode === 'light' ? 'dark' : 'light'"><Moon v-if="mode === 'light'" /><Sun v-else />{{ mode === 'light' ? '切换深色' : '切换浅色' }}</U.Button><U.Button variant="outline" @click="density = density === 'compact' ? 'comfortable' : 'compact'">{{ density === 'compact' ? '紧凑密度' : '舒适密度' }}</U.Button></template>
      <template #filters><div class="ds-row"><Search class="size-4" /><U.Input v-model="search" aria-label="搜索组件" placeholder="搜索组件名称，例如 按钮、dialog…" /><U.Select v-model="state"><U.SelectTrigger aria-label="示例状态"><U.SelectValue /></U.SelectTrigger><U.SelectContent><U.SelectItem v-for="s in states" :key="s.value" :value="s.value">{{ s.label }}</U.SelectItem></U.SelectContent></U.Select></div><nav class="ds-row" aria-label="组件分类"><U.Button v-for="c in categories" :key="c" :variant="category === c && !search ? 'default' : 'outline'" :aria-pressed="category === c && !search" @click="category = c; search = ''; group = '全部'">{{ c }}</U.Button></nav></template>
      <nav class="ds-category-nav" aria-label="组件功能分类"><U.Button v-for="g in groups" :key="g" :variant="group === g ? 'default' : 'ghost'" size="sm" @click="group = g; category = '扩展组件'; search = ''">{{ g }} · {{ groupCount(g) }}</U.Button></nav>
      <template v-if="category === '设计基础' && !search">
        <div class="ds-grid"><U.DsSection title="01 / 品牌与语义"><U.DsBrandLogo /><div class="ds-palette"><div v-for="tone in tones" :key="tone.variable" class="ds-stack"><div class="ds-swatch" :style="{ background: `var(${tone.variable})` }" /><span class="ds-heading">{{ tone.name }}</span></div></div></U.DsSection><U.DsSection title="02 / 信息层级"><h2 class="ds-title">标题文字</h2><p class="ds-heading">小标题文字</p><p>正文文字 · 14px</p><p class="ds-caption">辅助文字 · 12px</p><div class="ds-row"><U.Button>主要操作<ArrowUpRight /></U.Button><U.Button variant="outline">次要操作</U.Button><U.Button variant="link">文字链接</U.Button></div></U.DsSection><U.DsSection title="03 / 空间与形状"><p>间距：4 / 8 / 12 / 16 / 20 / 24 / 32</p><p>基础／按钮／输入框 10px · 图片 12px · 卡片 18px</p><p>舒适控件 36px · 紧凑控件 32px</p><div class="ds-panel">内容表面与细边框</div></U.DsSection></div>
      </template>
      <template v-else-if="category === '页面模式' && !search"><div class="ds-grid"><U.DsSection title="创作工作台"><CompositeExample family="upload" :state="state" /><CompositeExample family="parameters" :state="state" /><CompositeExample family="action-bar" :state="state" /></U.DsSection><U.DsSection title="图片资源库"><U.DsImageCard :src="sampleImage" title="自然光服装主图" /><CompositeExample family="task-card" :state="state" /></U.DsSection><U.DsSection title="管理列表"><CompositeExample family="toolbar" :state="state" /><CompositeExample family="data-state" :state="state" /><PrimitiveExample family="pagination" :state="state" /></U.DsSection><U.DsSection title="画布通用界面"><CompositeExample family="node" :state="state" /><PrimitiveExample family="toggle-group" :state="state" /></U.DsSection></div></template>
      <template v-else><U.UiEmptyState v-if="!filtered.length" title="没有匹配组件" description="换个关键词，或切换分类查看" /><div class="ds-grid"><U.DsSection v-for="item in filtered" :key="item.id" :title="item.title"><div class="ds-sample"><PrimitiveExample v-if="item.example === 'primitive'" :family="item.family" :state="state" /><ExtendedExample v-else-if="item.example === 'extended'" :family="item.family" :state="state" /><CompositeExample v-else :family="item.family" :state="state" /></div><template #actions><U.Tooltip><U.TooltipTrigger as-child><U.Button variant="ghost" size="icon-sm" :aria-label="`${item.title}使用说明`"><CircleHelp class="size-4" /></U.Button></U.TooltipTrigger><U.TooltipContent side="top"><div class="ds-stack"><code>{{ item.id }}</code><code>@/components/design-system/{{ item.source }}</code><p>{{ item.contract }}</p><p>事件：{{ item.events }}</p><p>{{ item.usage }}</p></div></U.TooltipContent></U.Tooltip></template></U.DsSection></div></template>
    </U.DsPage>
    </U.TooltipProvider>
  </U.DsThemeProvider>
</template>
