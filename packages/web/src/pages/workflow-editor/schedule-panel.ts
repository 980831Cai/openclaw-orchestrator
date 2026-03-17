export interface AutoCollapseSectionScrollState {
  enabled: boolean
  expanded: boolean
  currentScrollTop: number
  previousScrollTop: number
  clientHeight?: number
  scrollHeight?: number
}

export interface AutoCollapseSectionWheelState {
  enabled: boolean
  expanded: boolean
  deltaY: number
  atTop?: boolean
  atBottom?: boolean
}

const AUTO_COLLAPSE_DELTA = 10
const SCROLL_EDGE_THRESHOLD = 8

export interface ScrollEdgeState {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}

export interface WorkflowPanelSectionState {
  scheduleExpanded: boolean
  logsExpanded: boolean
}

export interface WorkflowPanelSectionBoundaryState extends WorkflowPanelSectionState {
  scheduleEnabled: boolean
  deltaY: number
  atTop: boolean
  atBottom: boolean
}

export function isNearTop(scrollTop: number): boolean {
  return scrollTop <= SCROLL_EDGE_THRESHOLD
}

export function isNearBottom(state: ScrollEdgeState): boolean {
  return state.scrollTop + state.clientHeight >= state.scrollHeight - SCROLL_EDGE_THRESHOLD
}

export function getNextSectionExpandedFromWheelDelta(state: AutoCollapseSectionWheelState): boolean {
  if (!state.enabled) {
    return false
  }

  const reachedBottom = state.atBottom ?? true
  const reachedTop = state.atTop ?? true

  if (state.deltaY >= AUTO_COLLAPSE_DELTA && reachedBottom) {
    return true
  }

  if (state.deltaY <= -AUTO_COLLAPSE_DELTA && reachedTop) {
    return false
  }

  return state.expanded
}

export function getNextAutoCollapseSectionExpanded(state: AutoCollapseSectionScrollState): boolean {
  if (!state.enabled) {
    return false
  }

  const delta = state.currentScrollTop - state.previousScrollTop
  const canMeasureBottom =
    typeof state.clientHeight === 'number' && typeof state.scrollHeight === 'number'

  return getNextSectionExpandedFromWheelDelta({
    enabled: state.enabled,
    expanded: state.expanded,
    deltaY: delta,
    atTop: delta <= -AUTO_COLLAPSE_DELTA ? isNearTop(state.currentScrollTop) : undefined,
    atBottom: delta >= AUTO_COLLAPSE_DELTA && canMeasureBottom
      ? isNearBottom({
          scrollTop: state.currentScrollTop,
          clientHeight: state.clientHeight!,
          scrollHeight: state.scrollHeight!,
        })
      : undefined,
  })
}

export type SchedulePanelScrollState = AutoCollapseSectionScrollState

export function getNextSchedulePanelExpanded(state: SchedulePanelScrollState): boolean {
  return getNextAutoCollapseSectionExpanded(state)
}

export function getNextConfigPanelScrollTop(currentScrollTop: number, deltaY: number, maxScrollTop = Number.POSITIVE_INFINITY): number {
  return Math.min(Math.max(0, currentScrollTop + deltaY), Math.max(0, maxScrollTop))
}

export function getNextWorkflowPanelSections(state: WorkflowPanelSectionBoundaryState): WorkflowPanelSectionState {
  let scheduleExpanded = state.scheduleEnabled ? state.scheduleExpanded : false
  let logsExpanded = state.logsExpanded

  if (state.deltaY >= AUTO_COLLAPSE_DELTA && state.atBottom) {
    if (state.scheduleEnabled && !scheduleExpanded) {
      scheduleExpanded = true
    } else if (!logsExpanded) {
      logsExpanded = true
    }
  }

  if (state.deltaY <= -AUTO_COLLAPSE_DELTA && state.atTop) {
    if (logsExpanded) {
      logsExpanded = false
    } else if (state.scheduleEnabled && scheduleExpanded) {
      scheduleExpanded = false
    }
  }

  return {
    scheduleExpanded,
    logsExpanded,
  }
}
