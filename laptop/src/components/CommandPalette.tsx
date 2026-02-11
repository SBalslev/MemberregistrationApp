/**
 * Command Palette (Ctrl+K) - global search and action launcher.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  LayoutDashboard, Users, BarChart3, Activity, Search, GraduationCap,
  Package, Wallet, Laptop, Settings, Plus, CreditCard, RefreshCw,
  Download, ArrowRight, Command,
} from 'lucide-react';
import { useAppStore } from '../store';
import { getAllMembers } from '../database';
import type { Member } from '../types';

interface CommandItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  section: string;
  onExecute: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { setCurrentPage, setSelectedMember } = useAppStore();

  // Load members lazily when palette opens
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    if (isOpen) {
      setMembers(getAllMembers());
      setQuery('');
      setSelectedIndex(0);
      // Focus input after render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const navigate = useCallback((page: string) => {
    setCurrentPage(page);
    onClose();
  }, [setCurrentPage, onClose]);

  // Build command list
  const staticCommands: CommandItem[] = useMemo(() => [
    // Navigation
    { id: 'nav-dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Navigation', onExecute: () => navigate('dashboard') },
    { id: 'nav-members', label: 'Medlemmer', icon: Users, section: 'Navigation', onExecute: () => navigate('members') },
    { id: 'nav-statistics', label: 'Statistik', icon: BarChart3, section: 'Navigation', onExecute: () => navigate('statistics') },
    { id: 'nav-activity', label: 'Aktivitet', icon: Activity, section: 'Navigation', onExecute: () => navigate('member-activity') },
    { id: 'nav-dgi', label: 'DGI søgning', icon: Search, section: 'Navigation', onExecute: () => navigate('minidraet-search') },
    { id: 'nav-trainers', label: 'Trænere', icon: GraduationCap, section: 'Navigation', onExecute: () => navigate('trainers') },
    { id: 'nav-equipment', label: 'Udstyr', icon: Package, section: 'Navigation', onExecute: () => navigate('equipment') },
    { id: 'nav-finance', label: 'Økonomi', icon: Wallet, section: 'Navigation', onExecute: () => navigate('finance') },
    { id: 'nav-devices', label: 'Enheder', icon: Laptop, section: 'Navigation', onExecute: () => navigate('devices') },
    { id: 'nav-settings', label: 'Indstillinger', icon: Settings, section: 'Navigation', onExecute: () => navigate('settings') },
    // Actions
    { id: 'act-add-member', label: 'Tilføj medlem', sublabel: 'Opret nyt medlem', icon: Plus, section: 'Handlinger', onExecute: () => navigate('members') },
    { id: 'act-new-transaction', label: 'Ny transaktion', sublabel: 'Opret finansiel postering', icon: Wallet, section: 'Handlinger', onExecute: () => navigate('finance') },
    { id: 'act-record-fee', label: 'Registrer kontingent', sublabel: 'Registrer kontingentbetaling', icon: CreditCard, section: 'Handlinger', onExecute: () => navigate('finance') },
    { id: 'act-sync', label: 'Synkroniser enheder', sublabel: 'Push data til tablets', icon: RefreshCw, section: 'Handlinger', onExecute: () => navigate('devices') },
    { id: 'act-backup', label: 'Eksporter backup', sublabel: 'Download databasekopi', icon: Download, section: 'Handlinger', onExecute: () => navigate('settings') },
  ], [navigate]);

  // Filter commands + members based on query
  const filteredCommands = useMemo(() => {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return staticCommands;

    const matchingCommands = staticCommands.filter((cmd) =>
      cmd.label.toLowerCase().includes(lowerQuery) ||
      (cmd.sublabel && cmd.sublabel.toLowerCase().includes(lowerQuery))
    );

    // Add member results if query is 2+ chars
    const matchingMembers: CommandItem[] = lowerQuery.length >= 2
      ? members
          .filter((m) =>
            `${m.firstName} ${m.lastName}`.toLowerCase().includes(lowerQuery) ||
            (m.membershipId && m.membershipId.toLowerCase().includes(lowerQuery))
          )
          .slice(0, 8)
          .map((m) => ({
            id: `member-${m.internalId}`,
            label: `${m.firstName} ${m.lastName}`,
            sublabel: m.membershipId || 'Prøvemedlem',
            icon: Users,
            section: 'Medlemmer',
            onExecute: () => {
              setSelectedMember(m);
              navigate('members');
            },
          }))
      : [];

    return [...matchingCommands, ...matchingMembers];
  }, [query, staticCommands, members, navigate, setSelectedMember]);

  // Clamp selected index
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filteredCommands[selectedIndex];
      if (cmd) cmd.onExecute();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  if (!isOpen) return null;

  // Group commands by section
  const sections = new Map<string, CommandItem[]>();
  for (const cmd of filteredCommands) {
    if (!sections.has(cmd.section)) sections.set(cmd.section, []);
    sections.get(cmd.section)!.push(cmd);
  }

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-50" onKeyDown={handleKeyDown}>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Palette */}
      <div className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">
        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <Command className="w-5 h-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søg efter sider, handlinger eller medlemmer..."
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
          />
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-xs text-gray-400 bg-gray-100 rounded">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {filteredCommands.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              Ingen resultater for "{query}"
            </div>
          ) : (
            Array.from(sections.entries()).map(([section, commands]) => (
              <div key={section}>
                <div className="px-4 py-1.5 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {section}
                </div>
                {commands.map((cmd) => {
                  const idx = flatIndex++;
                  const isSelected = idx === selectedIndex;
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      data-selected={isSelected}
                      onClick={() => cmd.onExecute()}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{cmd.label}</div>
                        {cmd.sublabel && (
                          <div className="text-xs text-gray-500 truncate">{cmd.sublabel}</div>
                        )}
                      </div>
                      {isSelected && <ArrowRight className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded mr-1">↑↓</kbd>
            naviger
            <kbd className="px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded ml-2 mr-1">↵</kbd>
            åbn
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded mr-1">Ctrl+K</kbd>
            søg
          </span>
        </div>
      </div>
    </div>
  );
}
