/**
 * usePromptLibrary - 提示词库共享逻辑
 *
 * 供「提示词库页面」与「自由生图提示词弹窗」复用，统一处理：
 *   - 数据加载（list）
 *   - 模糊搜索（匹配标题 + 正文）
 *   - 仅看收藏（开关）
 *   - 收藏置顶排序（is_starred DESC）
 *   - 分页
 *   - 收藏切换（乐观更新，失败回滚）
 *
 * 每次调用返回一个独立实例，调用方各管各的过滤/分页状态。
 */
import { ref, computed, watch } from 'vue'
import { promptLibraryApi } from '@/services/promptLibraryApi'
import type { PromptLibraryItem } from '@/services/promptLibraryApi'
import { useUiFeedback } from './useUiFeedback'

export function usePromptLibrary(options?: { pageSize?: number }) {
  const pageSize = options?.pageSize ?? 10
  const { error: showError } = useUiFeedback()

  const items = ref<PromptLibraryItem[]>([])
  const loading = ref(false)

  // 筛选条件
  const keyword = ref('')
  const activeTag = ref<string | undefined>(undefined)
  const onlyFavorites = ref(false)

  // 分页
  const page = ref(1)

  /** 所有标签（由当前数据聚合） */
  const allTags = computed(() => {
    const tagSet = new Set<string>()
    for (const item of items.value) for (const tag of item.tags) tagSet.add(tag)
    return Array.from(tagSet).sort()
  })

  /** 应用筛选后的完整列表（未分页）：标签 → 仅看收藏 → 模糊搜索 → 收藏置顶排序 */
  const filteredItems = computed(() => {
    const kw = keyword.value.trim().toLowerCase()
    const list = items.value.filter((item) => {
      if (activeTag.value && !item.tags.includes(activeTag.value)) return false
      if (onlyFavorites.value && !item.is_starred) return false
      if (kw) {
        const hit =
          item.name.toLowerCase().includes(kw) ||
          item.content.toLowerCase().includes(kw)
        if (!hit) return false
      }
      return true
    })
    return list
  })

  /** 分页后的当前页条目 */
  const displayItems = computed(() => {
    const start = (page.value - 1) * pageSize
    return filteredItems.value.slice(start, start + pageSize)
  })

  /** 过滤后总数（供分页器使用） */
  const total = computed(() => filteredItems.value.length)

  // 筛选条件变化时重置回首页
  watch([keyword, activeTag, onlyFavorites], () => {
    page.value = 1
  })

  /** 拉取当前用户的全部提示词 */
  async function load() {
    loading.value = true
    try {
      const res = await promptLibraryApi.list()
      items.value = res.data.data || []
    } catch {
      items.value = []
    } finally {
      loading.value = false
    }
  }

  /** 切换收藏：乐观更新，失败回滚 */
  async function toggleFavorite(item: PromptLibraryItem) {
    const prev = item.is_starred
    item.is_starred = !prev
    try {
      await promptLibraryApi.setFavorite(item.id, !prev)
    } catch (e) {
      item.is_starred = prev
      showError(e, '操作失败')
    }
  }

  return {
    // state
    items,
    loading,
    keyword,
    activeTag,
    onlyFavorites,
    page,
    pageSize,
    // computed
    allTags,
    filteredItems,
    displayItems,
    total,
    // actions
    load,
    toggleFavorite,
  }
}
