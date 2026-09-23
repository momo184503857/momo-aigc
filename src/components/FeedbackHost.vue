<script setup lang="ts">
/**
 * 全局反馈宿主：Toast（vue-sonner）+ 确认/输入对话框。
 * 必须挂载在两个入口的根组件（App.vue / AdminApp.vue）内。
 */
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Toaster } from '@/components/ui/sonner'
import { feedbackDialog, settleFeedbackDialog } from '@/composables/useUiFeedback'
</script>

<template>
  <Toaster position="top-center" :close-button="true" />

  <AlertDialog
    :open="feedbackDialog.open"
    @update:open="(open: boolean) => { if (!open) settleFeedbackDialog(null) }"
  >
    <AlertDialogContent class="sm:max-w-md">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ feedbackDialog.title }}</AlertDialogTitle>
        <AlertDialogDescription class="text-left whitespace-pre-line">
          {{ feedbackDialog.message }}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <Input
        v-if="feedbackDialog.mode === 'prompt'"
        v-model="feedbackDialog.input"
        :placeholder="feedbackDialog.inputPlaceholder"
        @keyup.enter="settleFeedbackDialog(feedbackDialog.input)"
      />

      <AlertDialogFooter>
        <Button variant="outline" @click="settleFeedbackDialog(null)">
          {{ feedbackDialog.cancelText }}
        </Button>
        <Button
          :variant="feedbackDialog.destructive ? 'destructive' : 'default'"
          @click="settleFeedbackDialog(feedbackDialog.input)"
        >
          {{ feedbackDialog.confirmText }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
