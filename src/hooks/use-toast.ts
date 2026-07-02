import * as React from 'react'

const TOAST_LIMIT = 5
const TOAST_REMOVE_DELAY = 5000

type ToastVariant = 'default' | 'destructive'

export interface Toast {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  open: boolean
}

type ToastInput = Omit<Toast, 'id' | 'open'>

type Action =
  | { type: 'ADD_TOAST'; toast: Toast }
  | { type: 'UPDATE_TOAST'; toast: Partial<Toast> & { id: string } }
  | { type: 'DISMISS_TOAST'; toastId?: string }
  | { type: 'REMOVE_TOAST'; toastId?: string }

interface State {
  toasts: Toast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

function addToRemoveQueue(toastId: string, dispatch: React.Dispatch<Action>) {
  if (toastTimeouts.has(toastId)) return
  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({ type: 'REMOVE_TOAST', toastId })
  }, TOAST_REMOVE_DELAY)
  toastTimeouts.set(toastId, timeout)
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }
    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }
    case 'DISMISS_TOAST': {
      const { toastId } = action
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined ? { ...t, open: false } : t
        ),
      }
    }
    case 'REMOVE_TOAST':
      if (action.toastId === undefined) return { ...state, toasts: [] }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

const listeners: Array<React.Dispatch<Action>> = []
let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => listener(action))
}

function toast(input: ToastInput) {
  const id = genId()
  const newToast: Toast = { ...input, id, open: true }
  dispatch({ type: 'ADD_TOAST', toast: newToast })
  setTimeout(() => {
    dispatch({ type: 'DISMISS_TOAST', toastId: id })
  }, TOAST_REMOVE_DELAY)
  return {
    id,
    dismiss: () => dispatch({ type: 'DISMISS_TOAST', toastId: id }),
    update: (props: Partial<Toast>) =>
      dispatch({ type: 'UPDATE_TOAST', toast: { ...props, id } }),
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    const listener: React.Dispatch<Action> = () => {
      setState({ ...memoryState })
    }
    listeners.push(listener)
    return () => {
      const index = listeners.indexOf(listener)
      if (index > -1) listeners.splice(index, 1)
    }
  }, [])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  }
}

export { useToast, toast }
