import type { QuotationStatus } from '@/generated/prisma/enums';

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  ISSUED: 'Issued',
  VIEWED: 'Viewed by customer',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  WITHDRAWN: 'Withdrawn',
  SUPERSEDED: 'Superseded',
};
