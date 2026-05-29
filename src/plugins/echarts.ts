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
])
