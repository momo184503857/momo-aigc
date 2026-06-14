<script setup lang="ts">
/**
 * BuyerShowPage — AI 买家秀页面。
 * 顶部两个 Tab：制作买家秀（MakeBuyerShowPanel） + 素材库（MaterialLibrary）。
 */
import { ref } from 'vue'
import PageLayout from '@/components/PageLayout.vue'
import MaterialLibrary from '@/components/buyer-show/MaterialLibrary.vue'
import MakeBuyerShowPanel from './MakeBuyerShowPanel.vue'

defineOptions({ name: 'BuyerShow' })

const activeTab = ref<'make' | 'library'>('make')
</script>

<template>
  <PageLayout>
    <template #header>
      <h2>AI 买家秀</h2>
    </template>

    <el-tabs v-model="activeTab">
      <el-tab-pane label="制作买家秀" name="make">
        <MakeBuyerShowPanel />
      </el-tab-pane>
      <el-tab-pane label="素材库" name="library" lazy>
        <MaterialLibrary />
      </el-tab-pane>
    </el-tabs>
  </PageLayout>
</template>
