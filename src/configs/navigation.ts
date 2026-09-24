import type { Component } from 'vue'
import { PenLine, Sparkles, Camera, ShoppingBag, Wrench, Workflow, LayoutTemplate, BookOpen, FolderOpen, Award, NotebookPen, GraduationCap, Layers, Image, Coins, TrendingUp, Wallet, Settings, Users, ScrollText, Blocks } from '@lucide/vue'
export interface NavigationItem { path: string; title: string; icon: Component; componentName: string }
const item = (path: string, title: string, icon: Component, componentName: string): NavigationItem => ({ path, title, icon, componentName })
export const creationModes = [
 item('/free-gen','自由生图',PenLine,'FreeGen'), item('/workspace','快速生图',Sparkles,'Workspace'),
 item('/photography','AI摄影',Camera,'Photography'), item('/buyer-show','AI买家秀',ShoppingBag,'BuyerShow'), item('/toolbox','批量工具',Wrench,'ToolboxPage'),
]
export const resourceItems = [item('/templates','模板图库',LayoutTemplate,'TemplatesPage'),item('/prompts','提示词库',BookOpen,'PromptLibraryPage'),item('/themes','主题库',FolderOpen,'ThemeLibraryPage'),item('/works','作品库',Award,'WorksGalleryPage')]
export const assistantItems = [item('/prompt-workshop','提示词工坊',NotebookPen,'PromptWorkshopPage'),item('/expert','提示词专家',GraduationCap,'ExpertPage'),item('/suite-prompt','成套提示词',Layers,'SuitePromptPage')]
export const accountItems = [item('/settings','个人设置',Settings,'UserSettings'),item('/my-quota','我的额度',Coins,'MyQuota'),item('/my-consumption','我的消耗',TrendingUp,'MyConsumption'),item('/pricing','计费说明',Wallet,'Pricing')]
export const canvasItem = item('/canvas-projects','AI画布',Workflow,'CanvasProjects')
export const resultsItem = item('/results','生图记录',Image,'ResultsPage')
export const adminSections = [
 {title:'用户与运行',items:[item('/admin/users','用户管理',Users,'AdminUsers'),item('/admin/dashboard','生图日志',ScrollText,'AdminDashboard')]},
 {title:'内容与素材',items:[item('/admin/templates','模板管理',LayoutTemplate,'AdminTemplates'),item('/admin/feature-prompts','功能提示词',PenLine,'AdminFeaturePrompts'),item('/admin/photography','AI摄影配置',Camera,'AdminPhotography'),item('/admin/works','作品库管理',Award,'AdminWorks'),item('/admin/prompt-cases','提示词案例',Image,'AdminPromptCases'),item('/admin/prompt-modules','提示词模块',Blocks,'AdminPromptModules'),item('/admin/sg-assets','成套生图资产',Layers,'AdminSuiteAssets')]},
 {title:'系统与规范',items:[item('/admin/ai-config','配置',Settings,'AdminAiConfig'),item('/admin/ui-components','UI 组件库',Blocks,'AdminUiComponents')]},
]
const detailItems = [item('/toolbox/batch-clothes-swap','批量换姿势',Wrench,'BatchClothesSwapPage'),item('/toolbox/batch-pose-swap','批量换衣服',Wrench,'BatchPoseSwapPage'),item('/toolbox/batch-spreadsheet','批量传表格做图',Wrench,'BatchSpreadsheetPage'),item('/toolbox/batch-face-swap','批量换脸',Wrench,'BatchFaceSwapPage')]
export const navigationItems = [...detailItems,...creationModes,...resourceItems,...assistantItems,...accountItems,canvasItem,resultsItem,...adminSections.flatMap(s=>s.items)]
export const routeMetaMap = Object.fromEntries(navigationItems.map(i=>[i.path,i]))
export const isCreationPath = (path: string) => creationModes.some(i=>path===i.path || path.startsWith(i.path+'/'))
export const canonicalAdminPath = (path: string) => path.startsWith('/admin/') ? path : `/admin${path}`
