<template>
  <PageLayout title="成套提示词" subtitle="主题库选主题 → 自动组装 5 张成套提示词 → 复制到任意生图工具使用">
    <template #extra>
      <el-button @click="router.push('/themes')">去主题库换主题</el-button>
    </template>

    <!-- 未选择主题：空态引导 -->
    <div v-if="!theme" class="sp-empty">
      <el-empty description="还没有选择主题">
        <el-button type="primary" @click="router.push('/themes')">去主题库选择</el-button>
      </el-empty>
    </div>

    <el-card v-else shadow="never" class="sp-card" v-loading="!assetsReady">
      <!-- 主题信息头 -->
      <div class="sp-theme-head">
        <img
          v-if="theme.cover_url"
          class="sp-cover"
          :src="theme.cover_url"
          alt="主题主图"
          @error="retryOnError($event, theme.cover_url)"
        />
        <div v-else class="sp-cover sp-cover-placeholder">
          <el-icon size="28"><Picture /></el-icon>
        </div>
        <div class="sp-theme-meta">
          <div class="sp-theme-name">
            {{ theme.name }}
            <el-tag v-if="theme.is_global" type="warning" size="small">官方</el-tag>
            <el-tag v-else-if="theme.is_mine" size="small" effect="plain" :type="theme.is_public ? 'success' : 'info'">
              {{ theme.is_public ? '公开' : '私有' }}
            </el-tag>
          </div>
          <div class="sp-meta-row">
            <span class="sp-meta-label">季节</span>
            <span>{{ seasonText }}</span>
          </div>
          <div v-if="theme.path" class="sp-meta-row">
            <span class="sp-meta-label">动线</span>
            <span>{{ theme.path }}</span>
          </div>
          <div class="sp-meta-row">
            <span class="sp-meta-label">点位</span>
            <span>{{ pointCount }} 个画面{{ theme.points.length ? '' : '（主题未配置点位，按默认 5 张组装）' }}</span>
          </div>
        </div>
      </div>

      <el-divider />

      <!-- Prompt 预览与复制（外层 v-else 已保证 theme 非空） -->
      <PromptPreview
        v-if="assetsReady"
        :result="assembleResult!"
        :locks="lockSelections"
        :include-common="includeCommon"
        @update:locks="lockSelections = $event"
        @update:include-common="includeCommon = $event"
      />
    </el-card>
  </PageLayout>
</template>

<script setup lang="ts">
/**
 * SuitePromptPage - 成套提示词（成套生图·轻量版）。
 * 从主题库选择主题后进入：自动按主题点位/动线组装 5 张画面的提示词，
 * 支持逐条开关/改文、复制单张或全部；无上传、无生成流程。
 * 主题经 sessionStorage['sp_theme_handoff'] 传入（主题库页面写入）。
 */
import { ref, computed, onMounted, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { Picture } from '@element-plus/icons-vue'
import PageLayout from '@/components/PageLayout.vue'
import PromptPreview from '@/components/sg/PromptPreview.vue'
import { useAssetLibrary } from '@/composables/useAssetLibrary'
import { useImageRetry } from '@/composables/useImageRetry'
import { sgApi, toPromptEntry, type SgLockTemplate } from '@/services/sgApi'
import type { ThemeItem } from '@/services/themeLibraryApi'
import type { AssembleContext, AssembleResult, LockSelection } from '@/utils/promptEngine'
import { assemble } from '@/utils/promptEngine'

defineOptions({ name: 'SuitePromptPage' })

const router = useRouter()
const { retryOnError } = useImageRetry()

const HANDOFF_KEY = 'sp_theme_handoff'

/** 内置动态点位条目（有存储三字段时停用并隐藏，避免与存储文案重复） */
const BUILTIN_POINT_KEYS = ['pose.node', 'pose.scene', 'camera.shot']

// ── 主题（由主题库页面带入） ──
const theme = ref<ThemeItem | null>(null)

/** 初始锁定开关：服装四层描述默认关；有存储三字段时内置点位条目一并停用 */
function initialLocks(hasDetails: boolean): LockSelection[] {
  const locks: LockSelection[] = [{ key: 'garment.detail', enabled: false }]
  if (hasDetails) {
    for (const k of BUILTIN_POINT_KEYS) locks.push({ key: k, enabled: false })
  }
  return locks
}

const lockSelections = ref<LockSelection[]>(initialLocks(false))

/** 公共提示词是否拼入最终提示词（默认关 = 每张完整提示词只保留差异部分） */
const includeCommon = ref(false)

const locksLib = useAssetLibrary<SgLockTemplate>('lock-templates')
const assetsReady = ref(false)

function consumeHandoff() {
  const raw = sessionStorage.getItem(HANDOFF_KEY)
  if (!raw) return
  // handoff 保留不清除：刷新页面后仍能恢复当前主题，直到从主题库带入新主题被覆盖
  try {
    const t = JSON.parse(raw) as ThemeItem
    if (t && t.id && t.name) {
      theme.value = t
      lockSelections.value = initialLocks(Boolean(t.point_details?.length))
      sgApi.reportAssetUse('themes', t.id)
    }
  } catch { /* 忽略非法 handoff */ }
}

onMounted(async () => {
  consumeHandoff()
  await locksLib.load()
  assetsReady.value = true
})
// 页面被 keep-alive 缓存时，再次从主题库进入靠 onActivated 消费新 handoff
onActivated(consumeHandoff)

const seasonText = computed(() => (theme.value?.season.length ? theme.value.season.join(' ') : '全季'))
const pointDetails = computed(() =>
  (theme.value?.point_details || []).filter((d) => d.name || d.scene || d.pose || d.camera))
const pointCount = computed(() => pointDetails.value.length || theme.value?.points.length || 5)

// ── 组装：无 persona / 无服装上传数据，仅主题插值 ──
// 有存储点位字段时点位部分逐张用存储值（不再动态填充）；无字段（专家页衍生等）走动态兜底
const assembleResult = computed<AssembleResult | null>(() => {
  const t = theme.value
  if (!t) return null
  const details = pointDetails.value
  const ctx: AssembleContext = {
    theme: {
      name: t.name,
      season: t.season,
      path: t.path,
      points: t.points,
    },
    garment: { mainUrl: '', detailUrls: [], features: {}, detail4: {} },
    model: '',
    feature: 'suite',
  }
  const base = assemble(
    locksLib.list.value.map(toPromptEntry),
    lockSelections.value,
    ctx,
    details.length || t.points.length || 5,
  )
  if (!details.length) {
    // 无存储点位：走引擎动态兜底；公共开关关闭时最终提示词仅保留差异部分
    return includeCommon.value ? base : { ...base, fullTexts: [...base.pointTexts] }
  }

  // 存储三字段模式：以主题数据为准渲染点位差异，隐藏内置动态点位条目
  const hidden = new Set(BUILTIN_POINT_KEYS)
  const usedEntries = base.usedEntries.filter((e) => !hidden.has(e.key))
  const pointTexts = details.map((d, i) => [
    d.name ? `【本张点位 ${i + 1}/${details.length}】${d.name}` : '',
    d.scene ? `【本张场景锁定·必须严格遵守】${d.scene}` : '',
    d.pose ? `【人物姿势】${d.pose}` : '',
    d.camera ? `【机位构图】${d.camera}` : '',
    base.pointTexts[i] || '',
  ].filter(Boolean).join('\n'))
  const fullTexts = pointTexts.map((p) =>
    [includeCommon.value ? base.commonText : '', p].filter(Boolean).join('\n'))
  return { ...base, pointTexts, fullTexts, usedEntries }
})
</script>

<style scoped>
.sp-empty {
  padding: var(--momo-space-16) 0;
}

.sp-card {
  display: flex;
  flex-direction: column;
}

.sp-theme-head {
  display: flex;
  gap: var(--momo-space-4);
  align-items: flex-start;
}

.sp-cover {
  width: 120px;
  height: 150px;
  flex-shrink: 0;
  object-fit: cover;
  border-radius: var(--momo-radius-md);
  background: var(--momo-color-bg-muted);
}

.sp-cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--momo-color-text-placeholder);
}

.sp-theme-meta {
  display: flex;
  flex-direction: column;
  gap: var(--momo-space-2);
  min-width: 0;
}

.sp-theme-name {
  display: flex;
  align-items: center;
  gap: var(--momo-space-2);
  font-size: 16px;
  font-weight: 600;
  color: var(--momo-color-text);
}

.sp-meta-row {
  display: flex;
  gap: var(--momo-space-3);
  font-size: 13px;
  line-height: 1.6;
  color: var(--momo-color-text-secondary);
}

.sp-meta-label {
  flex-shrink: 0;
  color: var(--momo-color-text-tertiary);
}
</style>
