/**
 * Quick Fee Payment Dialog.
 * Allows recording a fee payment for a member before consolidating into a transaction.
 */

import { useState } from 'react';
import { X, CreditCard, Banknote, Building2 } from 'lucide-react';
import type { Member } from '../../types/entities';
import type { PaymentMethod, MemberType, FeeRate } from '../../types';
import { PAYMENT_METHOD_LABELS, MEMBER_TYPE_LABELS } from '../../types';

interface QuickFeePaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payment: {
    memberId: string;
    amount: number;
    paymentDate: string;
    paymentMethod: PaymentMethod;
    notes: string | null;
  }) => void;
  members: Member[];
  feeRates: FeeRate[];
  year: number;
  preselectedMemberId?: string | null;
}

export function QuickFeePaymentDialog({
  isOpen,
  onClose,
  onSave,
  members,
  feeRates,
  year,
  preselectedMemberId,
}: QuickFeePaymentDialogProps) {
  // Helper to get default amount for a member
  const getDefaultAmount = (selectedMemberId: string | null | undefined) => {
    if (!selectedMemberId) return 0;
    const member = members.find(m => m.membershipId === selectedMemberId);
    if (!member) return 0;
    const memberType = (member.memberType as MemberType) ?? 'ADULT';
    const feeRate = feeRates.find(r => r.memberType === memberType && r.fiscalYear === year);
    return feeRate?.feeAmount ?? 0;
  };

  const [memberId, setMemberId] = useState('');
  const [amount, setAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [notes, setNotes] = useState('');

  // Track previous isOpen to detect dialog opening
  const [wasOpen, setWasOpen] = useState(false);

  // Reset form when dialog opens
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    setMemberId(preselectedMemberId ?? '');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('CASH');
    setNotes('');
    setAmount(getDefaultAmount(preselectedMemberId));
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  // Update amount when member changes (during dialog interaction)
  const handleMemberChange = (newMemberId: string) => {
    setMemberId(newMemberId);
    setAmount(getDefaultAmount(newMemberId));
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId || amount <= 0) return;

    onSave({
      memberId,
      amount,
      paymentDate,
      paymentMethod,
      notes: notes.trim() || null,
    });
    onClose();
  };

  const selectedMember = members.find(m => m.membershipId === memberId);
  const selectedMemberType = (selectedMember?.memberType as MemberType) ?? 'ADULT';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold text-gray-900">
                Registrer kontingentbetaling
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Member Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Medlem
              </label>
              <select
                value={memberId}
                onChange={(e) => handleMemberChange(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Vælg medlem...</option>
                {members
                  .filter(m => m.status === 'ACTIVE')
                  .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
                  .map((member) => (
                    <option key={member.membershipId} value={member.membershipId}>
                      {member.firstName} {member.lastName}
                    </option>
                  ))}
              </select>
              {selectedMember && (
                <p className="mt-1 text-xs text-gray-500">
                  Type: {MEMBER_TYPE_LABELS[selectedMemberType]}
                </p>
              )}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Beløb
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  DKK
                </span>
              </div>
            </div>

            {/* Payment Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Betalingsdato
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Betalingsmetode
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('CASH')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                    paymentMethod === 'CASH'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Banknote className="w-5 h-5" />
                  <span className="font-medium">{PAYMENT_METHOD_LABELS.CASH}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('BANK')}
                  className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-colors ${
                    paymentMethod === 'BANK'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Building2 className="w-5 h-5" />
                  <span className="font-medium">{PAYMENT_METHOD_LABELS.BANK}</span>
                </button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bemærkninger (valgfrit)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="F.eks. betalt for 2 år"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
              <p>
                Denne betaling registreres som afventende og kan konsolideres til en transaktion senere.
              </p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annuller
              </button>
              <button
                type="submit"
                disabled={!memberId || amount <= 0}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Registrer betaling
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
