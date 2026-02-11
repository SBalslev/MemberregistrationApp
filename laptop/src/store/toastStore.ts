/**
 * Toast notification store using Zustand.
 * Manages global toast notifications for user feedback.
 */

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  onUndo?: () => void;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));

    // Auto-remove after duration (default 4 seconds)
    const duration = toast.duration ?? 4000;
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export interface ToastOptions {
  duration?: number;
  onUndo?: () => void;
}

// Convenience functions for showing toasts
export function showToast(message: string, type: ToastType = 'info', durationOrOptions?: number | ToastOptions) {
  const opts = typeof durationOrOptions === 'number' ? { duration: durationOrOptions } : durationOrOptions;
  // Undo-capable toasts get longer duration by default (8s)
  const duration = opts?.duration ?? (opts?.onUndo ? 8000 : undefined);
  useToastStore.getState().addToast({ message, type, duration, onUndo: opts?.onUndo });
}

export function showSuccess(message: string, durationOrOptions?: number | ToastOptions) {
  showToast(message, 'success', durationOrOptions);
}

export function showError(message: string, duration?: number) {
  showToast(message, 'error', duration ?? 6000);
}

export function showWarning(message: string, duration?: number) {
  showToast(message, 'warning', duration);
}

export function showInfo(message: string, duration?: number) {
  showToast(message, 'info', duration);
}
