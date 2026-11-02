'use client';

import { Icon } from './Icon';
import { track } from './track';

/** A click-to-chat link. WhatsApp opens with the message ready; nothing is sent until the visitor presses send. */
export function WhatsAppButton({ number, message, label = 'Chat on WhatsApp', where, className = 'btn btn-outline' }: { number: string; message: string; label?: string; where: string; className?: string }) {
  const digits = number.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return (
    <a className={className} href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" onClick={() => track('whatsapp_click', { where })}>
      <Icon name="whatsapp" size={18} />{label}<span className="sr-only"> (opens WhatsApp in a new tab)</span>
    </a>
  );
}
