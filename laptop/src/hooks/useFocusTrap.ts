/**
 * Focus Trap Hook.
 * Traps keyboard focus within a container element for accessibility.
 * Essential for modal dialogs to prevent users from tabbing outside.
 */

import { useEffect, useRef, useCallback } from 'react';

const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface UseFocusTrapOptions {
  /** Whether the focus trap is active */
  enabled?: boolean;
  /** Return focus to this element when trap is disabled */
  returnFocusTo?: HTMLElement | null;
}

/**
 * Hook to trap focus within a container element.
 *
 * @example
 * function Modal({ isOpen, onClose }) {
 *   const containerRef = useFocusTrap<HTMLDivElement>({ enabled: isOpen });
 *
 *   return (
 *     <div ref={containerRef} role="dialog">
 *       ...modal content...
 *     </div>
 *   );
 * }
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
  options: UseFocusTrapOptions = {}
) {
  const { enabled = true, returnFocusTo } = options;
  const containerRef = useRef<T>(null);
  const previousActiveElement = useRef<Element | null>(null);

  // Store the previously focused element when trap is enabled
  useEffect(() => {
    if (enabled) {
      previousActiveElement.current = document.activeElement;
    }
  }, [enabled]);

  // Focus the first focusable element when trap is enabled
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);

    if (focusableElements.length > 0) {
      // Small delay to ensure the DOM is ready
      requestAnimationFrame(() => {
        focusableElements[0].focus();
      });
    }
  }, [enabled]);

  // Return focus when trap is disabled
  useEffect(() => {
    if (enabled) return;

    const elementToFocus = returnFocusTo || previousActiveElement.current;
    if (elementToFocus && elementToFocus instanceof HTMLElement) {
      elementToFocus.focus();
    }
  }, [enabled, returnFocusTo]);

  // Handle Tab key to trap focus
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled || event.key !== 'Tab' || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS);

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Shift+Tab on first element -> go to last
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    }
    // Tab on last element -> go to first
    else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }, [enabled]);

  // Add/remove event listener
  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, handleKeyDown]);

  return containerRef;
}
