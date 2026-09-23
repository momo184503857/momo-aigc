<script setup lang="ts">
import { Aperture } from '@lucide/vue'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

defineProps<{
  subtitle: string
}>()
</script>

<template>
  <div class="bg-muted/50 flex min-h-svh w-full items-center justify-center p-4">
    <Card class="w-full max-w-[400px] py-8 shadow-md">
      <CardHeader class="items-center text-center">
        <span class="bg-primary text-primary-foreground mx-auto mb-1 flex size-10 items-center justify-center rounded-lg">
          <Aperture class="size-5" />
        </span>
        <CardTitle class="text-xl font-semibold">墨墨 AI 生图</CardTitle>
        <CardDescription>{{ subtitle }}</CardDescription>
      </CardHeader>
      <CardContent>
        <slot />
      </CardContent>
    </Card>
  </div>
</template>
