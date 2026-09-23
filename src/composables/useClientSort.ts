import { computed, ref, type ComputedRef, type Ref } from 'vue'

/**
 * 表格客户端排序，替代原 el-table-column 的 sortable 默认行为：
 * 点击表头循环 升序 → 降序 → 取消（取消即回到数据源顺序），空值恒排末尾。
 */
export function useClientSort<T>(source: () => T[]): {
  sortField: Ref<string>
  sortOrder: Ref<'asc' | 'desc'>
  handleSort: (key?: string) => void
  sorted: ComputedRef<T[]>
} {
  const sortField = ref('')
  const sortOrder = ref<'asc' | 'desc'>('asc')

  function handleSort(key?: string) {
    if (!key) return
    if (sortField.value !== key) {
      sortField.value = key
      sortOrder.value = 'asc'
    } else if (sortOrder.value === 'asc') {
      sortOrder.value = 'desc'
    } else {
      sortField.value = ''
      sortOrder.value = 'asc'
    }
  }

  const sorted = computed<T[]>(() => {
    const list = source()
    const key = sortField.value
    if (!key) return list
    const dir = sortOrder.value === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const av = (a as Record<string, unknown>)[key]
      const bv = (b as Record<string, unknown>)[key]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      if (av == null || bv == null) {
        if (av == null && bv == null) return 0
        return av == null ? 1 : -1
      }
      return String(av).localeCompare(String(bv), 'zh-Hans-CN') * dir
    })
  })

  return { sortField, sortOrder, handleSort, sorted }
}
