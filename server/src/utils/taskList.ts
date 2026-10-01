import { isStoredUrl } from './storage.js'

export const USER_TASK_PAGE_SIZE_MAX = 50
export const ADMIN_TASK_PAGE_SIZE_MAX = 100
export const TASK_PAGE_MAX = 1_000_000

export function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return Math.min(max, parsed)
}

/**
 * Task-list projection. Intentionally excludes all fields capable of retaining
 * embedded image data or verbose diagnostics. Full records remain available
 * from GET /api/tasks/:id.
 */
export function taskListSelect(alias = 't'): string {
  return `
    ${alias}.id,
    ${alias}.user_id,
    ${alias}.toapis_task_id,
    ${alias}.client_business_id,
    ${alias}.model,
    SUBSTR(COALESCE(${alias}.prompt, ''), 1, 500) AS prompt,
    CASE WHEN LENGTH(COALESCE(${alias}.prompt, '')) > 500 THEN 1 ELSE 0 END AS prompt_truncated,
    ${alias}.size,
    ${alias}.resolution,
    ${alias}.aspect_ratio,
    ${alias}.n,
    ${alias}.template_image_ids,
    ${alias}.input_image_urls,
    ${alias}.result_image_urls,
    ${alias}.status,
    ${alias}.progress,
    ${alias}.error_code,
    SUBSTR(COALESCE(${alias}.error_message, ''), 1, 500) AS error_message,
    ${alias}.created_at,
    ${alias}.updated_at,
    ${alias}.completed_at,
    ${alias}.expires_at,
    ${alias}.feature_id,
    ${alias}.points_cost,
    ${alias}.points_balance_after,
    ${alias}.suite_id,
    ${alias}.point_index,
    ${alias}.task_no,
    ${alias}.logical_model_id,
    ${alias}.remark
  `
}

function parseArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function parseTaskListRow(row: any): any {
  const parsed = { ...row }
  parsed.prompt_truncated = Boolean(parsed.prompt_truncated)
  parsed.template_image_ids = parseArray(parsed.template_image_ids)
    .filter((id) => Number.isSafeInteger(Number(id)))
  parsed.input_image_urls = parseArray(parsed.input_image_urls).filter(isStoredUrl)
  parsed.result_image_urls = parseArray(parsed.result_image_urls).filter(isStoredUrl)
  parsed.aspectRatio = parsed.aspect_ratio
  delete parsed.aspect_ratio
  parsed.suiteId = parsed.suite_id
  parsed.pointIndex = parsed.point_index
  delete parsed.suite_id
  delete parsed.point_index
  return parsed
}
