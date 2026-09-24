<script setup lang="ts">
import {ref,computed} from 'vue'
import * as U from '..'
import {sampleImage} from './sample'
import type {DsTreeNode} from '../extended/tree'
const props=defineProps<{family:string;state:string}>()
const disabled=computed(()=>props.state==='disabled')
const value=ref('')
const path=ref<string[]>([])
const chips=ref<string[]>(['all'])
const rating=ref(3)
const current=ref(0)
const form=ref<Record<string,string>>({name:'',email:''})
const color=ref(getComputedStyle(document.querySelector('.ds-theme') || document.documentElement).getPropertyValue('--ds-orange').trim())
const notice=ref('')
const unread=ref(true)
const visible=ref(true)
const options=[{value:'all',label:'全部'},{value:'done',label:'已完成'},{value:'running',label:'生成中'}]
const tree:DsTreeNode[]=[{id:'clothes',label:'服装',children:[{id:'dress',label:'连衣裙'},{id:'shirt',label:'衬衫'}]},{id:'accessory',label:'配饰',children:[{id:'bag',label:'包袋'}]}]
const items=[{id:'1',title:'商品主图',description:'标准模型 · 1K'},{id:'2',title:'细节特写',description:'高清模型 · 2K'}]
const messages=ref<{id:string;role:'user'|'assistant';content:string}[]>([{id:'1',role:'assistant',content:'请描述你希望生成的图片。'}])
function send(text:string){messages.value.push({id:String(Date.now()),role:'user',content:text});messages.value.push({id:String(Date.now()+1),role:'assistant',content:'已收到。这是本地模拟回复，没有调用模型。'})}
</script>
<template><div class="ds-stack">
<U.DsLink v-if="family==='link'" href="https://example.com" external :disabled="disabled">查看文档</U.DsLink>
<U.DsFilterChips v-else-if="family==='filter'" v-model="chips" :options="options" />
<U.DsSearch v-else-if="family==='search'" v-model="value" :disabled="disabled" :loading="state==='loading'" @search="notice=`查询：${$event}`" />
<U.DsForm v-else-if="family==='form'" v-model="form" :disabled="disabled" :busy="state==='loading'" :fields="[{name:'name',label:'商品名称',required:true},{name:'email',label:'通知邮箱',type:'email'}]" @submit="notice='表单校验通过（模拟）'" />
<U.DsRate v-else-if="family==='rate'" v-model="rating" :disabled="disabled" />
<U.DsAutoComplete v-else-if="family==='autocomplete'" v-model="value" :options="[{value:'自然光',label:'自然光'},{value:'自然背景',label:'自然背景'},{value:'棚拍',label:'棚拍'}]" :disabled="disabled" />
<U.DsCascader v-else-if="family==='cascader'" v-model="path" :options="tree" :disabled="disabled" />
<U.DsTreeSelect v-else-if="family==='tree-select'" v-model="value" :nodes="tree" :disabled="disabled" />
<U.DsTree v-else-if="family==='tree'" v-model="value" :nodes="tree" :disabled="disabled" />
<U.DsDatePicker v-else-if="family==='date-picker'" v-model="value" :disabled="disabled" />
<U.DsTimePicker v-else-if="family==='time-picker'" v-model="value" :disabled="disabled" />
<U.DsColorPicker v-else-if="family==='color-picker'" v-model="color" :disabled="disabled" />
<template v-else-if="family==='file'"><U.DsFileItem v-if="visible" name="商品素材说明.pdf" :size="24576" status="已就绪" removable :disabled="disabled" @remove="visible=false" @open="notice='文件查看事件（模拟）'" /><U.Button v-else variant="outline" @click="visible=true">恢复示例文件</U.Button></template>
<U.DsList v-else-if="family==='list'" :items="state==='empty'?[]:items" :loading="state==='loading'"><template #actions="{item}"><U.Button variant="outline" size="sm" @click="notice=item.title">查看</U.Button></template></U.DsList>
<U.DsDescriptions v-else-if="family==='descriptions'" :items="[{label:'模型',value:'标准生图模型'},{label:'数量',value:4},{label:'分辨率',value:'2K'}]" />
<U.DsStatistic v-else-if="family==='statistic'" title="本月生成数量" :value="1286" suffix="张" :loading="state==='loading'" />
<U.DsQuote v-else-if="family==='quote'" author="创作说明">保持主体清晰，让图片本身成为信息中心。</U.DsQuote>
<U.DsTimeline v-else-if="family==='timeline'" :items="[{id:'1',title:'提交任务',time:'10:00',status:'已完成'},{id:'2',title:'生成图片',time:'10:01',description:'图片生成完成'},{id:'3',title:'保存结果',status:'等待处理'}]" />
<U.DsCarousel v-else-if="family==='carousel'" v-model="current" :items="state==='empty'?[]:[{src:sampleImage,alt:'商品正面'},{src:sampleImage,alt:'商品背面'}]" />
<U.DsVideo v-else-if="family==='video'" title="视频" :poster="sampleImage" />
<U.DsChat v-else-if="family==='chat'" :messages="messages" :busy="state==='loading'" :disabled="disabled" @send="send" />
<U.DsChart v-else-if="family==='chart'" title="最近生成量" :type="current?'line':'bar'" :items="state==='empty'?[]:[{label:'周一',value:24},{label:'周二',value:42},{label:'周三',value:32}]" :loading="state==='loading'" :error="state==='error'?'图表加载失败':undefined" @retry="notice='重试事件（模拟）'" />
<U.Button v-if="family==='chart'" variant="outline" @click="current=current?0:1">切换折线 / 柱形</U.Button>
<U.DsPopconfirm v-else-if="family==='popconfirm'" title="移除这条记录？" description="确认后将移除这条记录。" @confirm="notice='已确认（模拟）'" @cancel="notice='已取消'"><U.Button variant="destructive">移除记录</U.Button></U.DsPopconfirm>
<template v-else-if="family==='notification'"><U.DsNotification v-if="visible" title="批次已完成" description="4 张图片已准备就绪" :unread="unread" closable @read="unread=false" @close="visible=false" /><U.Button v-else variant="outline" @click="visible=true;unread=true">恢复通知</U.Button></template>
<U.DsResult v-else-if="family==='result'" :title="state==='error'?'操作未完成':'批次处理完成'" :status="state==='error'?'error':'success'" description="4 张图片已生成，可继续创建新任务。"><template #actions><U.Button variant="outline" @click="notice='继续操作（模拟）'">继续操作</U.Button></template></U.DsResult>
<U.DsSteps v-else-if="family==='steps'" v-model="current" :items="[{title:'选择素材',description:'上传参考图'},{title:'配置参数',description:'选择模型与尺寸'},{title:'生成结果',description:'预览并下载'}]" />
<template v-else-if="family==='anchor'"><U.DsAnchor :items="[{id:'ds-anchor-target',label:'跳转到说明'}]" /><p id="ds-anchor-target" tabindex="-1">锚点目标：跳转不改变应用 Hash 路由。</p></template>
<U.DsBackTop v-else-if="family==='backtop'" :target="null" />
<template v-else-if="family==='skip-link'"><U.DsSkipLink target-id="ds-skip-target" /><p id="ds-skip-target" tabindex="-1">主要内容区域</p></template>
<U.DsNotice v-if="notice" :title="notice" />
</div></template>
