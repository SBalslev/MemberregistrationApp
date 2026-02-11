/**
 * Reusable confirmation dialog component.
 * Use for delete confirmations and other destructive actions.
 *
 * Keyboard shortcuts:
 * - Escape: Close dialog
 * - Enter: Confirm action
 */

import { AlertTriangle, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useKeyboardShortcuts, useFocusTrap } from '../hooks';
import { KeyboardHint, SHORTCUTS } from './KeyboardHint';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Bekræft',
  cancelText = 'Annuller',
  variant = 'danger',
}: ConfirmDialogProps) {
  // Keyboard shortcuts: Escape to close, Enter to confirm
  useKeyboardShortcuts({
    onEscape: onClose,
    onEnter: () => {
      onConfirm();
      onClose();
    },
    enabled: isOpen,
  });

  // Focus trap to keep keyboard navigation within the dialog
  const dialogRef = useFocusTrap<HTMLDivElement>({ enabled: isOpen });

  if (!isOpen) return null;

  const variantStyles = {
    danger: {
      icon: 'text-red-600 bg-red-100',
      button: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    },
    warning: {
      icon: 'text-yellow-600 bg-yellow-100',
      button: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
    },
    info: {
      icon: 'text-blue-600 bg-blue-100',
      button: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    },
  };

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-500"
            aria-label="Luk dialog"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Content */}
          <div className="flex gap-4">
            {/* Icon */}
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${styles.icon}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>

            {/* Text */}
            <div className="flex-1">
              <h3 id="confirm-dialog-title" className="text-lg font-semibold text-gray-900">{title}</h3>
              <div className="mt-2 text-sm text-gray-600">{message}</div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              {cancelText}
              <KeyboardHint keys={SHORTCUTS.CLOSE} />
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 ${styles.button}`}
            >
              {confirmText}
              <KeyboardHint keys={SHORTCUTS.CONFIRM} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
