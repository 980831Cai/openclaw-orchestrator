import { useMemo, useState, type ReactNode } from 'react'

import { Crosshair, Maximize2 } from 'lucide-react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnConnect,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { cn } from '@/lib/utils'
import { EDGE_STYLE } from '@/pages/workflow-editor/graph'
import { workflowNodeTypes } from '@/pages/workflow-editor/shared'
import type { WorkflowNodeType } from '@/types'

import { DRAG_MIME_TYPE } from './WorkflowNodePalette'

interface WorkflowCanvasProps {
  nodes: Node[]
  edges: Edge[]
  selectedNodeId?: string | null
  onNodesChange: (changes: NodeChange[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: OnConnect
  onEdgeUpdateStart: () => void
  onEdgeUpdate: (oldEdge: Edge, connection: Connection) => void
  onEdgeUpdateEnd: (_event: unknown, edge: Edge) => void
  onNodeSelect: (nodeId: string | null) => void
  onCreateNodeAt: (type: WorkflowNodeType, position?: { x: number; y: number }) => void
  overlay?: ReactNode
}

export function WorkflowCanvas({
  nodes,
  edges,
  selectedNodeId,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onEdgeUpdateStart,
  onEdgeUpdate,
  onEdgeUpdateEnd,
  onNodeSelect,
  onCreateNodeAt,
  overlay,
}: WorkflowCanvasProps) {
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const decoratedNodes = useMemo(
    () => nodes.map((node) => ({ ...node, selected: selectedNodeId === node.id })),
    [nodes, selectedNodeId],
  )

  return (
    <div className="relative h-full overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#090D1B]">
      <ReactFlow
        nodes={decoratedNodes}
        edges={edges}
        onInit={setFlowInstance}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeUpdateStart={onEdgeUpdateStart}
        onEdgeUpdate={onEdgeUpdate}
        onEdgeUpdateEnd={onEdgeUpdateEnd}
        onNodeClick={(_, node) => onNodeSelect(node.id)}
        onPaneClick={() => onNodeSelect(null)}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDragActive(true)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragActive(false)
          const droppedType = event.dataTransfer.getData(DRAG_MIME_TYPE) || event.dataTransfer.getData('text/plain')
          if (!flowInstance || !droppedType) return
          const position = flowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
          onCreateNodeAt(droppedType as WorkflowNodeType, position)
        }}
        nodeTypes={workflowNodeTypes}
        defaultEdgeOptions={{ style: EDGE_STYLE, reconnectable: 'source' }}
        edgesUpdatable
        fitView
        className="workflow-studio-canvas"
      >
        <Background color="#A5B4FC12" gap={24} size={1} />
        <Controls className="!rounded-2xl !border !border-white/10 !bg-[#11172BCC] !backdrop-blur-xl [&>button]:!border-white/10 [&>button]:!bg-[#11172B] [&>button]:!text-white/60" />
        <MiniMap nodeColor="#6366F1" maskColor="#050816AA" className="!rounded-2xl !border !border-white/10 !bg-[#11172BCC] !backdrop-blur-xl" />
      </ReactFlow>

      <div
        className={cn(
          'pointer-events-none absolute inset-3 rounded-[22px] border border-dashed border-cyan-400/0 bg-cyan-400/0 transition-all duration-200',
          dragActive && 'border-cyan-400/45 bg-cyan-400/6',
        )}
      />

      <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
        <div className="workflow-frost-panel flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-slate-300/80">
          <Crosshair className="h-3.5 w-3.5 text-cyan-300/80" /> 将节点拖到画布任意位置创建
          <span className="mx-1 h-4 w-px bg-white/10" />
          <Maximize2 className="h-3.5 w-3.5 text-violet-300/80" /> 支持缩放、平移、连线与重连
        </div>
      </div>

      {overlay ? <div className="pointer-events-none absolute inset-0 z-10">{overlay}</div> : null}
    </div>
  )
}
