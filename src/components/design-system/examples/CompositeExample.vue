<script setup lang="ts">
import { PenLine, Image, BookOpen } from '@lucide/vue'
import { computed, ref } from 'vue'
import * as U from '..'
import { sampleImage } from './sample'
const props = defineProps<{ family: string; state: string }>()
const fileControl = ref<InstanceType<typeof U.DsFileInput>>()
const pickerOpen = ref(false)
const keyword = ref('')
const imageSelected = ref(false)
const prompt = ref('柔和自然光，保留商品细节')
const model = ref('standard')
const ratio = ref('1:1')
const resolution = ref('1K')
const count = ref<number | undefined>(2)
const fileNames = ref<string[]>([])
const message = ref('')
const status = computed(() => props.state === 'error' ? 'failed' : props.state === 'loading' ? 'running' : props.state === 'empty' ? 'pending' : 'done')
</script>
<template>
  <U.DsCascaderPicker v-if="family === 'cascader-picker'" v-model="keyword" :disabled="state === 'disabled'" :options="state === 'empty' ? [] : [{value:'all',label:'全部功能'},{value:'free',label:'自由生图'},{value:'quick',label:'快速生图',children:[{value:'clothes',label:'换衣服'},{value:'face',label:'换脸'}]}]" @change="message = '已选择：' + $event" />
  <div v-if="family === 'canvas-controls'" class="relative h-40"><U.DsCanvasControls @zoom-in="message = '放大（模拟）'" @zoom-out="message = '缩小（模拟）'" @fit="message = '适配（模拟）'" /></div>
  <U.DsSearchInput v-if="family === 'search-input'" v-model="keyword" aria-label="搜索示例" :disabled="state === 'disabled'" />
  <div v-if="family === 'file-input'"><U.DsFileInput ref="fileControl" accept="image/*" :disabled="state === 'disabled'" @change="message = '文件已选择（模拟）'" /><U.Button :disabled="state === 'disabled'" @click="fileControl?.click()">选择文件（模拟）</U.Button></div>
  <div v-if="family === 'scroll-page'" class="ds-stack">
    <U.DsScrollPage title="无分隔线、内容边缘对齐" :dividers="false" inset-content><p>内容区与底部动作区左右对齐。</p><template #footer><U.Button>保存（模拟）</U.Button></template></U.DsScrollPage>
    <U.DsScrollPage title="列表页面"><template #filters><U.Input aria-label="页面筛选示例" /></template><p>滚动内容区域</p><template #footer><U.Button>保存（模拟）</U.Button></template></U.DsScrollPage>
  </div>
  <U.DsField v-if="family === 'password-input'" v-slot="field" label="密码示例" :error="state === 'error' ? '请输入有效密码' : undefined">
    <U.DsPasswordInput :id="field.id" v-model="keyword" :aria-describedby="field.describedby" :aria-invalid="field.invalid" :disabled="state === 'disabled' || state === 'loading'" autocomplete="new-password" />
  </U.DsField>
  <U.DsBrandLogo v-if="family === 'brand-logo'" />
  <U.DsAuthPanel v-if="family === 'auth-panel'" subtitle="认证面板示例"><p class="ds-caption">此处展示业务表单，不发送认证请求。</p></U.DsAuthPanel>
  <div v-if="family === 'text-picker'">
    <U.Button variant="outline" @click="pickerOpen = true">选择文本（模拟）</U.Button>
    <U.DsTextPicker v-model:open="pickerOpen" :items="state === 'empty' ? [] : [{id:'sample',title:'商品摄影',content:'柔和自然光，保留商品细节',tags:['摄影'],starred:true}]" :tags="['摄影']" :total="state === 'empty' ? 0 : 1" :page-size="8" :loading="state === 'loading'" :empty="state === 'empty'" @select="message = '已选择：' + $event; pickerOpen = false" @favorite="message = '收藏事件：' + $event" />
  </div>
  <U.DsNavigationDock v-if="family === 'navigation-dock'" :items="[{path:'/create',title:'创作工作台',icon:PenLine,active:true},{path:'/results',title:'生图记录',icon:Image},{path:'/prompts',title:'提示词库',icon:BookOpen}]" @navigate="message = '导航事件：' + $event" />
  <U.DsNavigationDock v-if="family === 'navigation-dock'" orientation="horizontal" label="资产分类示例" :items="[{path:'/results',title:'生图记录',icon:Image,active:true},{path:'/templates',title:'模板图库',icon:Image},{path:'/prompts',title:'提示词库',icon:BookOpen}]" @navigate="message = '分类切换：' + $event" />
  <U.DsPage v-if="family === 'page'" title="页面外壳" description="标题、筛选、主体与动作栏"><template #filters><U.DsToolbar v-model="keyword" /></template><U.DsNotice title="内容区"  /><template #footer><U.DsActionBar label="保存配置" /></template></U.DsPage>
  <div v-else-if="family === 'linked-panel'" class="ds-stack">
    <div class="w-40"><U.DsUpload variant="tile" label="来源图片" :disabled="state === 'disabled'" @select="message = '已选择来源图片（仅示例）'" /></div>
    <U.DsLinkedPanel title="关联内容" anchor-label="来源图片" :anchor-offset="80" class="mt-4 w-full">
      <template #actions><U.Button variant="ghost" :disabled="state === 'disabled'" @click="message = '打开内容库（模拟）'">内容库</U.Button></template>
      <p v-if="state === 'empty'" class="ds-caption">暂无关联内容</p>
      <p v-else-if="state === 'loading'" class="ds-caption" role="status">正在加载关联内容…</p>
      <p v-else-if="state === 'error'" class="ds-caption" role="alert">加载失败，请重试</p>
      <U.Button v-else variant="outline" :disabled="state === 'disabled'" @click="message = '已应用到来源图片（模拟）'">应用示例内容</U.Button>
    </U.DsLinkedPanel>
  </div>
  <U.DsSection v-else-if="family === 'section'" title="参数分区" ><p>标准模型 · 1K</p></U.DsSection>
  <U.DsField v-else-if="family === 'field'" v-slot="field" label="生成描述" help="说明主体、场景与构图" :error="state === 'error' ? '请补充主体描述' : undefined"><U.Textarea :id="field.id" v-model="prompt" :aria-invalid="field.invalid" :aria-describedby="field.describedby" /></U.DsField>
  <U.DsToolbar v-else-if="family === 'toolbar'" v-model="keyword" :selected-count="2" @search="message = '已筛选（模拟）'" @reset="keyword = ''" />
  <U.DsUpload v-else-if="family === 'upload'" :disabled="state === 'disabled'" :busy="state === 'loading'" :error="state === 'error' ? '图片格式不支持，请重新选择' : undefined" @select="fileNames = $event.map(f => f.name)"><p v-for="name in fileNames" :key="name" class="ds-caption">{{ name }}（仅本地选择，未上传）</p></U.DsUpload>
  <U.DsImageCard v-else-if="family === 'image-card'" selectable v-model:selected="imageSelected" :src="state === 'empty' ? undefined : sampleImage" :loading="state === 'loading'" title="服装参考图" @download="message = '下载事件（模拟）'" @edit="message = '重新编辑事件（模拟）'" @detail="message = '详情事件（模拟）'" />
  <div v-else-if="family === 'status'" class="ds-row"><U.DsStatus v-for="s in (['pending','running','done','failed','cancelled'] as const)" :key="s" :status="s" /></div>
  <U.DsTaskCard v-else-if="family === 'task-card'" title="商品主图 · 第 1 批次" :status="status" :progress="45" :error="state === 'error' ? '服务暂时不可用，请重试' : undefined" @retry="message = '已重试（模拟）'" @reuse="message = '已复用（模拟）'"><p class="ds-caption">标准模型 · 1K · 4:3</p></U.DsTaskCard>
  <U.DsActionBar v-else-if="family === 'action-bar'" :busy="state === 'loading'" :disabled="state === 'disabled'" reason="预计生成 2 张" @submit="message = '生成动作已触发（模拟）'" />
  <U.DsNotice v-else-if="family === 'notice'" title="状态说明" :error="state === 'error'" description="说明发生了什么，并提供可恢复的下一步。" />
  <U.DsNode v-else-if="family === 'node'" title="AI 图像处理" :status="status"><U.Button variant="outline" size="sm">查看节点</U.Button></U.DsNode>
  <div v-else-if="family === 'parameters'" class="ds-stack"><U.DsField v-slot="field" label="模型"><U.Select v-model="model"><U.SelectTrigger :id="field.id"><U.SelectValue /></U.SelectTrigger><U.SelectContent><U.SelectItem value="standard">标准模型（模拟）</U.SelectItem><U.SelectItem value="detail">细节模型（模拟）</U.SelectItem></U.SelectContent></U.Select></U.DsField><U.DsField v-slot="field" label="生成数量"><U.UiNumberInput :id="field.id" v-model="count" :min="1" :max="8" /></U.DsField></div>
  <div v-else-if="family === 'data-state'" class="ds-stack"><U.UiEmptyState v-if="state === 'empty'" title="暂无数据" description="调整筛选条件后重试" /><U.Skeleton v-else-if="state === 'loading'" class="h-20" /><U.DsNotice v-else-if="state === 'error'" title="加载失败" error description="网络异常，请重新加载" /><U.Table v-else><U.TableHeader><U.TableRow><U.TableHead>任务</U.TableHead><U.TableHead>结果</U.TableHead></U.TableRow></U.TableHeader><U.TableBody><U.TableRow><U.TableCell>任务一</U.TableCell><U.TableCell>已完成</U.TableCell></U.TableRow></U.TableBody></U.Table></div>
  <U.DsStudio v-if="family === 'studio'"><U.DsSection title="创作参数"><U.Input v-model="prompt" aria-label="创作描述示例" /></U.DsSection><U.DsImageCard :src="sampleImage" title="创作结果示例" /></U.DsStudio>
  <U.DsParameterPanel v-if="family === 'parameter-panel'" label="生成图片 · 0.20 积分（模拟）" :disabled="state === 'disabled'" :busy="state === 'loading'" @submit="message = '生成事件（模拟）'">
    <div class="ds-parameter"><span class="ds-caption">模型</span><U.Select v-model="model"><U.SelectTrigger aria-label="模型"><U.SelectValue /></U.SelectTrigger><U.SelectContent><U.SelectItem value="standard">标准模型</U.SelectItem></U.SelectContent></U.Select></div>
    <div class="ds-parameter"><span class="ds-caption">画面比例</span><U.Select v-model="ratio"><U.SelectTrigger aria-label="画面比例"><U.SelectValue /></U.SelectTrigger><U.SelectContent><U.SelectItem value="1:1">1:1</U.SelectItem><U.SelectItem value="3:4">3:4</U.SelectItem></U.SelectContent></U.Select></div>
    <div class="ds-parameter"><span class="ds-caption">生成数量</span><U.UiNumberInput v-model="count" :min="1" :max="5" aria-label="生成数量" /></div>
    <div class="ds-parameter"><span class="ds-caption">分辨率</span><U.Select v-model="resolution"><U.SelectTrigger aria-label="分辨率"><U.SelectValue /></U.SelectTrigger><U.SelectContent><U.SelectItem value="1K">1K</U.SelectItem><U.SelectItem value="2K">2K</U.SelectItem></U.SelectContent></U.Select></div>
  </U.DsParameterPanel>
  <U.DsResultGroup v-if="family === 'result-group'" label="今日 12:30"><U.DsImageCard v-for="i in 5" :key="i" :src="sampleImage" :title="`示例 ${i}`" /></U.DsResultGroup>
  <U.DsReferenceImage v-if="family === 'reference-image'" :src="sampleImage" label="参考图示例" @remove="message = '移除事件（模拟）'" @preview="message = '预览事件（模拟）'" />
  <U.DsNotice v-if="message" :title="message" />
</template>
