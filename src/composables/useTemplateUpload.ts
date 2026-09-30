import { ref } from 'vue'
import { ossApi } from '@/services/ossApi'
import { templateApi } from '@/services/templateApi'
import { useUiFeedback } from '@/composables/useUiFeedback'

export function useTemplateUpload(onUploaded: () => Promise<void>) {
  const uploading = ref(false)
  const { success, warning, error } = useUiFeedback()

  function handleUpload() {
    if (uploading.value) return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp'
    input.multiple = true
    input.onchange = async () => {
      const files = Array.from(input.files || [])
      if (!files.length || uploading.value) return
      uploading.value = true
      let uploaded = 0
      try {
        for (const file of files) {
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            warning(`${file.name} 格式不支持，请选择 PNG / JPG / WebP 图片`)
            continue
          }
          if (file.size > 10 * 1024 * 1024) {
            warning(`${file.name} 超过 10MB，已跳过`)
            continue
          }
          try {
            const image = new Image()
            const localUrl = URL.createObjectURL(file)
            try {
              await new Promise<void>((resolve, reject) => {
                image.onload = () => resolve()
                image.onerror = () => reject(new Error('图片加载失败'))
                image.src = localUrl
              })
            } finally {
              URL.revokeObjectURL(localUrl)
            }
            const { objectKey, publicUrl, ossBucket } = await ossApi.upload(file, 'templates')
            await templateApi.create({
              name: file.name.replace(/\.[^.]+$/, ''),
              oss_bucket: ossBucket,
              oss_object_key: objectKey,
              public_url: publicUrl,
              original_filename: file.name,
              mime_type: file.type,
              size_bytes: file.size,
              width: image.naturalWidth,
              height: image.naturalHeight,
            })
            uploaded++
          } catch (e: unknown) {
            error(`${file.name}: ${e instanceof Error ? e.message : '上传失败'}`)
          }
        }
        if (uploaded > 0) {
          success(`成功上传 ${uploaded} 张图片`)
          await onUploaded()
        }
      } finally {
        uploading.value = false
      }
    }
    input.click()
  }

  return { uploading, handleUpload }
}
