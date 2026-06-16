<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Coin } from '@element-plus/icons-vue'
import PageLayout from '@/components/PageLayout.vue'

defineOptions({ name: 'UserSettings' })

const router = useRouter()
</script>

<template>
  <PageLayout>
    <template #header><h2>个人设置</h2></template>

    <div class="placeholder-card">
      <el-icon size="40" color="var(--el-color-primary)"><Coin /></el-icon>
      <h3 class="ph-title">Key 与额度管理已迁移</h3>
      <p class="ph-desc">
        个人 API Key、平台/个人 Key 模式切换、余额查询等功能，已统一移至「我的额度」页面。请前往该页面进行配置。
      </p>
      <el-button type="primary" size="large" @click="router.push('/my-quota')">前往我的额度</el-button>
      <p class="ph-future">更多账户设置（修改密码 / 昵称）即将推出</p>
    </div>
  </PageLayout>
</template>

<style scoped>
.placeholder-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--momo-radius-md, 10px);
  padding: 48px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.ph-title {
  margin: 16px 0 8px 0;
  font-size: var(--momo-font-size-lg);
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.ph-desc {
  margin: 0 0 24px 0;
  max-width: 420px;
  font-size: var(--momo-font-size-base);
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
.ph-future {
  margin: 20px 0 0 0;
  font-size: var(--momo-font-size-sm);
  color: var(--el-text-color-placeholder);
}
</style>
