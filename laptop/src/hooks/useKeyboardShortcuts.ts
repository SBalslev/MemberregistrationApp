/**
 * Custom hook for handling keyboard shortcuts.
 * Provides consistent keyboard navigation across the app.
 */

import { useEffect, useCallback } from 'react';

interface KeyboardShortcutOptions {
  onEscape?: () => void;
  onSave?: () => void;  // Ctrl+S / Cmd+S
  onEnter?: () => void; // Enter to confirm (when not in textarea/input)
  enabled?: boolean;
}

/**
 * Hook to handle common keyboard shortcuts in dialogs and forms.
 *
 * @param options - Callback functions for different shortcuts
 * @example
 * useKeyboardShortcuts({
 *   onEscape: () => setIsOpen(false),
 *   onSave: () => handleSave(),
 * });
 */
export function useKeyboardShortcuts(options: KeyboardShortcutOptions) {
  const { onEscape, onSave, onEnter, enabled = true } = options;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Escape to close
    if (event.key === 'Escape' && onEscape) {
      event.preventDefault();
      onEscape();
      return;
    }

    // Ctrl+S / Cmd+S to save
    if ((event.ctrlKey || event.metaKey) && event.key === 's' && onSave) {
      event.preventDefault();
      onSave();
      return;
    }

    // Enter to confirm (only when not in a form input that uses Enter)
    if (event.key === 'Enter' && onEnter) {
      const target = event.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isTextarea = tagName === 'textarea';
      const isInput = tagName === 'input';
      const inputType = isInput ? (target as HTMLInputElement).type : '';

      // Don't trigger onEnter for textareas or text inputs (they need Enter for their own purposes)
      // But do trigger for buttons, selects, etc.
      if (!isTextarea && (!isInput || inputType === 'submit' || inputType === 'button')) {
        event.preventDefault();
        onEnter();
      }
    }
  }, [enabled, onEscape, onSave, onEnter]);

  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [enabled, handleKeyDown]);
}

/**
 * Hook specifically for dialog keyboard handling.
 * Provides Escape to close and Ctrl+S to save.
 */
export function useDialogKeyboard(
  isOpen: boolean,
  onClose: () => void,
  onSave?: () => void
) {
  useKeyboardShortcuts({
    onEscape: onClose,
    onSave,
    enabled: isOpen,
  });
}
