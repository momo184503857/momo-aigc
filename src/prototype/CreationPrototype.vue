<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDownToLine, ArrowUpRight, Check, ChevronDown, Clock3, Layers, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2, UserRound, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import CreationComposer from './CreationComposer.vue'
import CreationResults from './CreationResults.vue'
import { modeLabel, type ImageTask, type Round, type Scenario } from './model'
import { useCreationPrototype } from './useCreationPrototype'
import './studio.css'

const p = useCreationPrototype()
const { active, draft, state, ready, uploading, imageUrls, mobileTab, scenario, notice, storageWarning } = p
const dialog = ref<'history' | 'more' | 'account' | 'rename' | 'clear' | 'parameters' | 'preview' | null>(null)
let returnFocus: HTMLElement | null = null
watch(dialog, (value, old) => { if (value && !old) returnFocus = document.activeElement as HTMLElement }, { flush: 'sync' })
function restoreFocus(event: Event) { event.preventDefault(); returnFocus?.focus() }
const renameText = ref('')
const preview = ref<ImageTask | null>(null)
const parameters = ref<Round | null>(null)
const dialogOpen = computed({ get: () => dialog.value !== null, set: (value: boolean) => { if (!value) dialog.value = null } })
const running = computed(() => active.value.rounds.some(r => r.tasks.some(t => t.status === 'running')))
const scenarios: { id: Scenario; label: string }[] = [{ id: 'empty', label: '空白' }, { id: 'running', label: '生成中' }, { id: 'results', label: '多轮结果' }, { id: 'partial', label: '部分失败' }]
function openRename() { renameText.value = active.value.title; dialog.value = 'rename' }
function rename() { if (p.rename(renameText.value)) dialog.value = null }
function showPreview(task: ImageTask) { preview.value = task; dialog.value = 'preview' }
function showParameters(round: Round) { parameters.value = round; dialog.value = 'parameters' }
async function clear() { await p.clearData(); dialog.value = null }
function selectRecord(id: string) { p.selectRecord(id); dialog.value = null }
</script>

<template>
  <div class="creation-studio">
    <header class="studio-nav">
      <a href="#/prototype/create" class="studio-brand" aria-label="墨墨创作首页"><svg class="brand-symbol" viewBox="0 0 36 32" fill="none" aria-hidden="true"><path d="M5 26 11 7 18 23 29 6 31 26" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" /></svg><span>墨墨</span></a>
      <nav class="studio-navigation" aria-label="创作导航">
        <span class="current-nav" aria-current="page">创作</span>
        <Button variant="ghost" class="nav-history" aria-label="创作记录" @click="dialog = 'history'"><Clock3 :size="16" /><span>创作记录</span></Button>
        <Button variant="ghost" aria-label="更多功能" @click="dialog = 'more'"><span class="more-label">更多功能</span><MoreHorizontal :size="18" /></Button>
      </nav>
      <Button variant="ghost" size="icon" class="account-button" aria-label="账户" @click="dialog = 'account'"><UserRound :size="17" /></Button>
    </header>

    <div class="prototype-strip"><span class="prototype-label"><span class="tiny-dot" /> 设计预览 <span class="prototype-note">/ 仅本机保存</span></span><div class="scenario-switch" role="group" aria-label="原型场景"><span>场景</span><button v-for="item in scenarios" :key="item.id" type="button" :aria-pressed="scenario === item.id" @click="p.selectScenario(item.id)">{{ item.label }}</button></div></div>
    <div v-if="storageWarning" class="storage-warning" role="alert">{{ storageWarning }}</div>
    <div class="mobile-switch" role="group" aria-label="工作区域"><button :aria-pressed="mobileTab === 'input'" @click="mobileTab = 'input'">创作输入</button><button :aria-pressed="mobileTab === 'results'" @click="mobileTab = 'results'">生成结果 <span>{{ active.rounds.reduce((count, r) => count + r.tasks.length, 0) }}</span></button></div>

    <main class="studio-workspace" :data-mobile-tab="mobileTab">
      <CreationComposer :mode="active.mode" :draft="draft" :image-urls="imageUrls" :uploading="uploading" :ready="ready" @mode="p.setMode" @upload="p.upload" @generate="p.generate" />
      <div class="results-workspace">
        <div class="creation-heading"><div><h2 class="results-title">创作结果</h2><div class="creation-name"><span>{{ active.title }}</span><button type="button" aria-label="重命名创作" @click="openRename"><Pencil :size="13" /></button><span class="round-total">{{ active.rounds.length }} 轮</span></div></div><Button variant="outline" class="new-creation" :disabled="!ready || uploading" @click="p.addRecord()"><Plus :size="15" /><span>新建创作</span></Button></div>
        <div v-if="running && scenario === 'running'" class="simulation-hint"><span>生成中场景已暂停，方便查看界面。</span><button @click="p.finishDemo">完成演示 <ArrowUpRight :size="13" /></button></div>
        <CreationResults :key="active.id" :creation="active" :uploading="uploading" @preview="showPreview" @parameters="showParameters" @reuse="p.reuse" @retry="p.retry" @reference="p.useAsReference" @download="p.download" @example="p.selectScenario('results')" />
      </div>
    </main>
    <div v-if="notice" class="studio-toast" role="status"><Check :size="15" /><span>{{ notice }}</span><button aria-label="关闭通知" @click="notice = ''"><X :size="14" /></button></div>

    <Dialog v-model:open="dialogOpen">
      <DialogContent class="studio-dialog" :class="{ 'studio-preview-dialog': dialog === 'preview', 'studio-history-dialog': dialog === 'history' }" @close-auto-focus="restoreFocus">
        <template v-if="dialog === 'history'">
          <DialogHeader><DialogTitle>创作记录</DialogTitle><DialogDescription>每个想法都有自己的空间。记录仅保存在当前浏览器。</DialogDescription></DialogHeader>
          <div class="history-list"><button v-for="record in state.creations" :key="record.id" :aria-current="record.id === active.id ? 'true' : undefined" @click="selectRecord(record.id)"><span class="history-icon"><Layers :size="18" /></span><span><strong>{{ record.title }}</strong><small>{{ record.rounds.length }} 轮创作 · {{ new Date(record.createdAt).toLocaleDateString('zh-CN') }}</small></span><Check v-if="record.id === active.id" :size="16" /><ChevronDown v-else :size="15" class="history-arrow" /></button></div>
          <div class="dialog-footer"><Button variant="ghost" :disabled="uploading" @click="dialog = 'clear'"><Trash2 :size="14" />清空演示数据</Button><Button :disabled="uploading" @click="p.addRecord(); dialog = null"><Plus :size="14" />新建创作</Button></div>
        </template>
        <template v-else-if="dialog === 'rename'"><DialogHeader><DialogTitle>给灵感起个名字</DialogTitle><DialogDescription>一个容易找到、属于这次创作的名字。</DialogDescription></DialogHeader><form @submit.prevent="rename"><label for="creation-name" class="sr-only">创作名称</label><Input id="creation-name" v-model="renameText" maxlength="60" autofocus /><div class="dialog-footer"><Button type="button" variant="ghost" @click="dialog = null">取消</Button><Button type="submit" :disabled="!renameText.trim()">保存名称</Button></div></form></template>
        <template v-else-if="dialog === 'clear'"><DialogHeader><DialogTitle>清空演示数据？</DialogTitle><DialogDescription>此操作会移除本原型的创作记录和上传图片。现有业务的任务、素材和登录信息不受影响。</DialogDescription></DialogHeader><div class="dialog-footer"><Button variant="ghost" @click="dialog = 'history'">保留记录</Button><Button :disabled="uploading" @click="clear">清空演示数据</Button></div></template>
        <template v-else-if="dialog === 'preview' && preview"><DialogHeader><DialogTitle>摄影示例</DialogTitle><DialogDescription>Unsplash 摄影素材，仅作界面演示，不是实际生成结果。</DialogDescription></DialogHeader><img class="preview-image" :src="preview.source" alt="摄影示例大图" /><div class="dialog-footer"><Button variant="outline" @click="p.download(preview!)"><ArrowDownToLine :size="15" />下载图片</Button><Button :disabled="uploading" @click="p.useAsReference(preview!); dialog = null">用作参考 <ArrowUpRight :size="15" /></Button></div></template>
        <template v-else-if="dialog === 'parameters' && parameters"><DialogHeader><DialogTitle>这一轮的创作参数</DialogTitle><DialogDescription>{{ modeLabel(parameters.mode) }} · {{ new Date(parameters.createdAt).toLocaleString('zh-CN') }}</DialogDescription></DialogHeader><dl class="parameter-details"><dt>画面描述</dt><dd>{{ parameters.params.prompt || '未填写' }}</dd><dt>模型 / 比例 / 数量</dt><dd>{{ parameters.params.model }} / {{ parameters.params.ratio }} / {{ parameters.params.count }} 张</dd><dt>分辨率</dt><dd>{{ parameters.params.resolution }}</dd><dt>不希望出现的内容</dt><dd>{{ parameters.params.negative || '未填写' }}</dd><dt>参考图片</dt><dd>{{ parameters.params.references.map(r => r.name).join('、') || '未添加' }}</dd></dl><Button @click="p.reuse(parameters!); dialog = null"><RotateCcw :size="15" />复用这组参数</Button></template>
        <template v-else-if="dialog === 'account' || dialog === 'more'"><DialogHeader><DialogTitle>{{ dialog === 'account' ? '一个轻盈的创作空间' : '更多可能，留给下一步' }}</DialogTitle><DialogDescription>{{ dialog === 'account' ? '当前是本地设计原型，无需登录，不读取账号或积分数据。' : '这一轮专注于自由生图、快捷模式与结果查看。其他功能仍保留在现有产品中。' }}</DialogDescription></DialogHeader><p class="scope-copy">{{ dialog === 'account' ? '你上传的图片与创作记录保存在当前浏览器。清理浏览器数据或换设备后，这些记录不会同步。' : 'AI 摄影、AI 画布、AI 买家秀、批量工具、素材库与学习内容，将在核心体验确认后逐步适配。' }}</p><Button variant="outline" @click="dialog = null">回到创作</Button></template>
      </DialogContent>
    </Dialog>
  </div>
</template>
