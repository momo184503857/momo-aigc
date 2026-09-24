<script setup lang="ts">
import { Palette } from '@lucide/vue'
import { Button, Popover, PopoverTrigger, PopoverContent, PopoverTitle, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/design-system'
import { useAppearanceStore } from '@/stores/appearance'
const appearance = useAppearanceStore()
</script>
<template><Popover><PopoverTrigger as-child><Button variant="ghost" size="sm" aria-label="外观设置"><Palette /><span>外观</span></Button></PopoverTrigger><PopoverContent><PopoverTitle>外观设置</PopoverTitle><div class="ds-stack"><Label>颜色模式</Label><Select v-model="appearance.mode"><SelectTrigger aria-label="颜色模式"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="light">浅色</SelectItem><SelectItem value="dark">深色</SelectItem></SelectContent></Select><Label>界面密度</Label><Select v-model="appearance.density"><SelectTrigger aria-label="界面密度"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="comfortable">舒适</SelectItem><SelectItem value="compact">紧凑</SelectItem></SelectContent></Select></div></PopoverContent></Popover></template>
