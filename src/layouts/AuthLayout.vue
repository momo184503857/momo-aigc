<script setup lang="ts">
</script>

<template>
  <div class="auth-layout">
    <div class="auth-card">
      <div class="auth-header">
        <h1 class="auth-title">墨墨 AI 生图</h1>
        <p class="auth-subtitle">内部图像生成调用面板</p>
      </div>
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.auth-layout {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-bg-color-page);
}

.auth-card {
  width: 400px;
  padding: 40px;
  background: var(--el-bg-color);
  border-radius: var(--tf-card-radius, 12px);
  box-shadow: var(--el-box-shadow);
}

.auth-header {
  text-align: center;
  margin-bottom: 32px;
}

.auth-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 8px;
}

.auth-subtitle {
  font-size: var(--momo-font-size-base);
  color: var(--el-text-color-secondary);
}
</style>
