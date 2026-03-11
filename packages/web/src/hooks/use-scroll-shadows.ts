import { useEffect, useState } from 'react'

interface ScrollShadowState {
  showTop: boolean
  showRight: boolean
  showBottom: boolean
  showLeft: boolean
}

const INITIAL_STATE: ScrollShadowState = {
  showTop: false,
  showRight: false,
  showBottom: false,
  showLeft: false,
}

export function useScrollShadows<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [state, setState] = useState<ScrollShadowState>(INITIAL_STATE)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const update = () => {
      const nextState: ScrollShadowState = {
        showTop: element.scrollTop > 4,
        showRight: element.scrollLeft + element.clientWidth < element.scrollWidth - 4,
        showBottom: element.scrollTop + element.clientHeight < element.scrollHeight - 4,
        showLeft: element.scrollLeft > 4,
      }

      setState((prev) => {
        if (
          prev.showTop === nextState.showTop
          && prev.showRight === nextState.showRight
          && prev.showBottom === nextState.showBottom
          && prev.showLeft === nextState.showLeft
        ) {
          return prev
        }
        return nextState
      })
    }

    update()
    element.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    return () => {
      element.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [ref])

  return state
}
