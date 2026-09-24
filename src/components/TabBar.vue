<script setup lang="ts">
import { X } from '@lucide/vue'
import { useTabStore } from '@/stores/tabs'
import { Button, ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '@/components/design-system'
const tabs = useTabStore()
</script>
<template><nav class="ds-tabbar" aria-label="已打开页面"><ContextMenu v-for="tab in tabs.tabs" :key="tab.id"><ContextMenuTrigger as-child><div class="ds-open-tab"><Button size="sm" :variant="tab.id === tabs.activeTabId ? 'secondary' : 'ghost'" :aria-current="tab.id === tabs.activeTabId ? 'page' : undefined" @click="tabs.setActiveTab(tab.id)"><component :is="tab.icon" />{{ tab.title }}</Button><Button v-if="tab.closable" variant="ghost" size="icon-xs" :aria-label="`关闭${tab.title}页签`" @click="tabs.removeTab(tab.id)"><X /></Button></div></ContextMenuTrigger><ContextMenuContent><ContextMenuItem @select="tabs.removeTab(tab.id)">关闭</ContextMenuItem><ContextMenuItem @select="tabs.removeOtherTabs(tab.id)">关闭其他</ContextMenuItem><ContextMenuItem @select="tabs.removeAllClosable()">关闭所有</ContextMenuItem></ContextMenuContent></ContextMenu></nav></template>
