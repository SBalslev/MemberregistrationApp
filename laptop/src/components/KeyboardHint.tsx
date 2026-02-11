/**
 * Keyboard Hint Component.
 * Displays keyboard shortcut hints in a subtle, accessible way.
 */

interface KeyboardHintProps {
  keys: string;
  className?: string;
}

/**
 * Displays a keyboard shortcut hint.
 * Use inside buttons or alongside labels to indicate shortcuts.
 *
 * @example
 * <button>
 *   Gem <KeyboardHint keys="Ctrl+S" />
 * </button>
 */
export function KeyboardHint({ keys, className = '' }: KeyboardHintProps) {
  // Parse keys into individual key parts
  const keyParts = keys.split('+').map((key) => key.trim());

  return (
    <span
      className={`inline-flex items-center gap-0.5 ml-2 text-xs opacity-60 ${className}`}
      aria-hidden="true"
    >
      <span className="sr-only">Tastaturgenvej:</span>
      {keyParts.map((key, index) => (
        <span key={index}>
          {index > 0 && <span className="mx-0.5">+</span>}
          <kbd className="px-1.5 py-0.5 bg-black/10 rounded text-[10px] font-mono font-medium">
            {key}
          </kbd>
        </span>
      ))}
    </span>
  );
}

/**
 * Common keyboard shortcut constants for consistency.
 */
export const SHORTCUTS = {
  SAVE: 'Ctrl+S',
  CLOSE: 'Esc',
  CONFIRM: 'Enter',
} as const;
