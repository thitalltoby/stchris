import { describe, it, expect } from 'vitest';
import { TRANSITIONS, canTransition, REASON_REQUIRED, QUOTATION_DRIVEN, STATUS_LABELS, STATUS_CUSTOMER_TEXT, TERMINAL_STATUSES } from '@/lib/workflow';
import type { RequestStatus } from '@/generated/prisma/enums';

const all = Object.keys(TRANSITIONS) as RequestStatus[];

describe('request workflow', () => {
  it('has a label, customer text and transition list for every status', () => {
    for (const s of all) {
      expect(STATUS_LABELS[s], s).toBeTruthy();
      expect(STATUS_CUSTOMER_TEXT[s], s).toBeTruthy();
    }
  });

  it('only allows transitions to known statuses and never to itself', () => {
    for (const [from, tos] of Object.entries(TRANSITIONS)) {
      for (const to of tos) {
        expect(all, `${from} -> ${to}`).toContain(to);
        expect(to).not.toBe(from);
      }
    }
  });

  it('follows the happy path', () => {
    const path: RequestStatus[] = ['RECEIVED', 'UNDER_REVIEW', 'QUOTATION_IN_PREPARATION', 'QUOTATION_ISSUED', 'ACCEPTED', 'IN_PROGRESS', 'COMPLETED'];
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i]!, path[i + 1]!), `${path[i]} -> ${path[i + 1]}`).toBe(true);
  });

  it('forbids skipping the review or going straight to completed', () => {
    expect(canTransition('RECEIVED', 'COMPLETED')).toBe(false);
    expect(canTransition('RECEIVED', 'QUOTATION_ISSUED')).toBe(false);
    expect(canTransition('UNDER_REVIEW', 'ACCEPTED')).toBe(false);
  });

  it('lets terminal statuses be reopened only deliberately', () => {
    for (const s of TERMINAL_STATUSES) expect(TRANSITIONS[s].length).toBeGreaterThan(0);
    expect(canTransition('COMPLETED', 'IN_PROGRESS')).toBe(false);
  });

  it('requires a reason for declining, cancelling and closing, and these are reachable', () => {
    expect(REASON_REQUIRED).toEqual(expect.arrayContaining(['DECLINED', 'CANCELLED', 'CLOSED']));
  });

  it('marks quotation-driven statuses', () => {
    expect(QUOTATION_DRIVEN).toEqual(['QUOTATION_ISSUED', 'ACCEPTED']);
  });
});
