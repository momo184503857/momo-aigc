<script setup lang="ts">
/**
 * 旧「ToAPIs 共享 Key 管理」页 —— AI 接入体系重构后退役（迁移一个版本后删除）。
 *
 * 共享 Key 已迁移为 toapis 平台渠道的主 Key，请到「配置」页管理：
 * 渠道管理 → ToAPIs → Key 管理。旧 system_config.toapis_api_key 保留只读用于回滚。
 */
defineOptions({ name: 'AdminToApisKey' })
import { useRouter } from 'vue-router'
import { Right } from '@element-plus/icons-vue'
import PageLayout from '@/components/PageLayout.vue'

const router = useRouter()
</script>

<template>
  <PageLayout>
    <template #header><h2>API Key 管理（已迁移）</h2></template>

    <el-result
      icon="info"
      title="ToAPIs 共享 Key 已迁移"
      sub-title="AI 接入体系重构后，共享 Key 由「配置」页的 toapis 平台渠道统一管理（渠道管理 → ToAPIs → Key 管理）。本页保留一个版本用于过渡，随后删除。"
    >
      <template #extra>
        <el-button type="primary" :icon="Right" @click="router.push('/admin/ai-config')">
          前往「配置」页管理渠道与 Key
        </el-button>
      </template>
    </el-result>
  </PageLayout>
</template>
