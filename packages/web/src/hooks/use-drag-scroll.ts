import { useEffect, useRef, useState } from 'react'

const INTERACTIVE_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[data-no-drag-scroll="true"]',
].join(',')

export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const dragStateRef = useRef({
    pointerDown: false,
    dragging: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  })
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const target = event.target
      if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) {
        return
      }

      dragStateRef.current = {
        pointerDown: true,
        dragging: false,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
      }
      setDragging(false)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStateRef.current.pointerDown) return

      const deltaX = event.clientX - dragStateRef.current.startX
      const deltaY = event.clientY - dragStateRef.current.startY
      if (!dragStateRef.current.dragging && Math.abs(deltaX) + Math.abs(deltaY) < 6) {
        return
      }

      dragStateRef.current.dragging = true
      if (!dragging) {
        setDragging(true)
      }

      element.scrollLeft = dragStateRef.current.scrollLeft - deltaX
      element.scrollTop = dragStateRef.current.scrollTop - deltaY
      event.preventDefault()
    }

    const handlePointerUp = () => {
      if (!dragStateRef.current.pointerDown) return
      dragStateRef.current.pointerDown = false
      dragStateRef.current.dragging = false
      setDragging(false)
    }

    element.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      element.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [dragging])

  return { ref, dragging }
}
