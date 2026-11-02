import type { RequestStatus } from '@/generated/prisma/enums';

export const STATUS_LABELS: Record<RequestStatus, string> = {
  RECEIVED: 'Received',
  UNDER_REVIEW: 'Under review',
  MORE_INFO_REQUIRED: 'More information required',
  QUOTATION_IN_PREPARATION: 'Quotation in preparation',
  QUOTATION_ISSUED: 'Quotation issued',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  CLOSED: 'Closed',
  EXPIRED: 'Expired',
};

/** Plain-language status text for customers. */
export const STATUS_CUSTOMER_TEXT: Record<RequestStatus, string> = {
  RECEIVED: 'We have received your request. A member of the team will review it shortly.',
  UNDER_REVIEW: 'The St. Chris team is reviewing your requirement.',
  MORE_INFO_REQUIRED: 'We need a little more information from you to continue.',
  QUOTATION_IN_PREPARATION: 'We are preparing a quotation for you.',
  QUOTATION_ISSUED: 'A quotation has been issued. Please review it and let us know your decision.',
  ACCEPTED: 'You have accepted the quotation. The team will confirm next steps.',
  IN_PROGRESS: 'The work for this request is in progress.',
  COMPLETED: 'This request has been completed.',
  DECLINED: 'This request or quotation was declined.',
  CANCELLED: 'This request was cancelled.',
  CLOSED: 'This request has been closed.',
  EXPIRED: 'This request expired without a decision.',
};

export const TERMINAL_STATUSES: RequestStatus[] = ['COMPLETED', 'DECLINED', 'CANCELLED', 'CLOSED', 'EXPIRED'];
export const OPEN_STATUSES: RequestStatus[] = [
  'RECEIVED', 'UNDER_REVIEW', 'MORE_INFO_REQUIRED', 'QUOTATION_IN_PREPARATION', 'QUOTATION_ISSUED', 'ACCEPTED', 'IN_PROGRESS',
];

/**
 * Allowed manual transitions. The lifecycle is the starting point from the brief and must be
 * confirmed with St. Chris's stakeholders; changing it means editing this map and the docs.
 */
export const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  RECEIVED: ['UNDER_REVIEW', 'MORE_INFO_REQUIRED', 'DECLINED', 'CANCELLED', 'CLOSED'],
  UNDER_REVIEW: ['MORE_INFO_REQUIRED', 'QUOTATION_IN_PREPARATION', 'DECLINED', 'CANCELLED', 'CLOSED'],
  MORE_INFO_REQUIRED: ['UNDER_REVIEW', 'QUOTATION_IN_PREPARATION', 'DECLINED', 'CANCELLED', 'CLOSED', 'EXPIRED'],
  QUOTATION_IN_PREPARATION: ['MORE_INFO_REQUIRED', 'QUOTATION_ISSUED', 'DECLINED', 'CANCELLED', 'CLOSED'],
  QUOTATION_ISSUED: ['QUOTATION_IN_PREPARATION', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'CLOSED'],
  ACCEPTED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'CLOSED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED', 'CLOSED'],
  COMPLETED: ['CLOSED'],
  DECLINED: ['UNDER_REVIEW', 'CLOSED'],
  CANCELLED: ['UNDER_REVIEW'],
  CLOSED: ['UNDER_REVIEW'],
  EXPIRED: ['UNDER_REVIEW', 'CLOSED'],
};

/** Statuses a person must give a reason for. */
export const REASON_REQUIRED: RequestStatus[] = ['DECLINED', 'CANCELLED', 'CLOSED'];

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Statuses the quotation workflow sets itself (through explicit staff or customer actions, never silently).
 * They cannot be chosen from the manual status menu.
 */
export const QUOTATION_DRIVEN: RequestStatus[] = ['QUOTATION_ISSUED', 'ACCEPTED'];

export const STATUS_TONE: Record<RequestStatus, 'neutral' | 'info' | 'warn' | 'good' | 'bad'> = {
  RECEIVED: 'info',
  UNDER_REVIEW: 'info',
  MORE_INFO_REQUIRED: 'warn',
  QUOTATION_IN_PREPARATION: 'info',
  QUOTATION_ISSUED: 'warn',
  ACCEPTED: 'good',
  IN_PROGRESS: 'good',
  COMPLETED: 'good',
  DECLINED: 'bad',
  CANCELLED: 'neutral',
  CLOSED: 'neutral',
  EXPIRED: 'neutral',
};
