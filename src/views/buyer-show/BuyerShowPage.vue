<script setup lang="ts">
/**
 * BuyerShowPage — AI 买家秀的三块工作台共用一个页头。
 *
 * IA：这张页只有三种意图——做（选商品图 + 素材生成买家秀）、查（我之前跑的任务）、
 * 攒（可复用的素材库）。三者互斥且切换频繁，所以把它们做成页面级 tab 导航，
 * 而不是三张卡片或三段折叠内容；面板自身的工具栏/列表由各自组件负责。
 *
 * 页头只承载标题 + 一句话说明当前 tab 在做什么，不重复面板内已有的操作按钮；
 * tab 栏吸顶，因为面板很长时切换目标需要常驻可达。
 *
 * 业务口径不变：activeTab 仍是本地状态，history / library 两个面板保持 v-if 懒挂载，
 * 未激活时不挂载、不请求。
 */
import { ref, computed } from 'vue'
import { DsScrollPage as PageLayout } from '@/components/design-system'
import MaterialLibrary from '@/components/buyer-show/MaterialLibrary.vue'
import MakeBuyerShowPanel from './MakeBuyerShowPanel.vue'
import BuyerShowHistoryPanel from './BuyerShowHistoryPanel.vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/design-system/primitives/tabs'
import { Wand2, Archive, Library } from '@lucide/vue'

defineOptions({ name: 'BuyerShow' })

const activeTab = ref<'make' | 'history' | 'library'>('make')

// 仅 UI：tab 说明文案，让页头那句话跟着当前视图走，避免三段说明挤在标题下
const tabHint = computed(() =>
  activeTab.value === 'make'
    ? '上传商品图、挑素材与场景，生成买家秀成图。'
    : activeTab.value === 'history'
      ? '查看已提交任务的进度与产出，可重新下载或再次生成。'
      : '维护可复用的背景、模特与服饰素材，生成时从这里挑。',
)
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>AI 买家秀</h2>
      <p class="text-muted-foreground mt-1 max-w-3xl text-sm leading-normal">{{ tabHint }}</p>
    </template>

    <Tabs v-model="activeTab">
      <!-- 页面级导航：吸顶 + 下划线，替代原来浮在内容里的一枚胶囊 tabs -->
      <div class="bg-background sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-1 border-b pb-1">
        <TabsList variant="line" class="h-8">
          <TabsTrigger value="make"><Wand2 />制作买家秀</TabsTrigger>
          <TabsTrigger value="history"><Archive />任务历史</TabsTrigger>
          <TabsTrigger value="library"><Library />素材库</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="make">
        <MakeBuyerShowPanel />
      </TabsContent>
      <TabsContent value="history">
        <BuyerShowHistoryPanel v-if="activeTab === 'history'" />
      </TabsContent>
      <TabsContent value="library">
        <MaterialLibrary v-if="activeTab === 'library'" />
      </TabsContent>
    </Tabs>
  </PageLayout>
</template>
