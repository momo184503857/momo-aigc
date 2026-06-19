import { use } from 'echarts/core'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  ToolboxComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent,
  GraphicComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
// ECharts 6 把 `grid.containLabel` 重构为 `grid.outerBounds` 机制；
// 旧写法需显式注册 LegacyGridContainLabel 才能继续生效（否则降级并打印警告）。
import { LegacyGridContainLabel } from 'echarts/features'

use([
  LineChart,
  BarChart,
  PieChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  ToolboxComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent,
  GraphicComponent,
  CanvasRenderer,
  LegacyGridContainLabel,
])
