import { describe, it, expect } from 'vitest';
import { ROLE_PERMISSIONS, PERMISSIONS, STAFF_ROLES, type Permission } from '@/lib/permissions';
import { assertCan, staffRequestScope, customerRequestScope } from '@/server/rbac';
import { AppError } from '@/server/errors';

const user = (role: Parameters<typeof assertCan>[0]['role'], id = 'u1') => ({ id, name: 'T', email: 't@example.test', role });
const has = (role: keyof typeof ROLE_PERMISSIONS, p: Permission) => ROLE_PERMISSIONS[role].includes(p);

describe('role permissions', () => {
  it('gives the super admin everything and customers no staff permission', () => {
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).toHaveLength(PERMISSIONS.length);
    expect(ROLE_PERMISSIONS.CUSTOMER).toEqual([]);
    expect(STAFF_ROLES).not.toContain('CUSTOMER');
  });

  it('keeps user, settings, integration and audit powers with the super admin only', () => {
    for (const p of ['user.manage', 'settings.manage', 'integration.manage', 'audit.view'] as const) {
      for (const r of STAFF_ROLES.filter((r) => r !== 'SUPER_ADMIN')) expect(has(r, p), `${r} ${p}`).toBe(false);
    }
  });

  it('separates preparing, approving and issuing quotations', () => {
    expect(has('COMMERCIAL', 'quotation.create')).toBe(true);
    expect(has('COMMERCIAL', 'quotation.approve')).toBe(false);
    expect(has('APPROVER', 'quotation.approve')).toBe(true);
    expect(has('APPROVER', 'quotation.create')).toBe(false);
    expect(has('OPS_ADMIN', 'quotation.create')).toBe(false);
  });

  it('limits operations staff to assigned requests', () => {
    expect(has('OPS_STAFF', 'request.view.assigned')).toBe(true);
    expect(has('OPS_STAFF', 'request.view.all')).toBe(false);
    expect(has('OPS_STAFF', 'request.assign')).toBe(false);
  });
});

describe('assertCan', () => {
  it('passes when allowed and throws FORBIDDEN otherwise', () => {
    expect(() => assertCan(user('SUPER_ADMIN'), 'user.manage')).not.toThrow();
    try {
      assertCan(user('COMMERCIAL'), 'user.manage');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('FORBIDDEN');
    }
  });
});

describe('request scopes', () => {
  it('gives every request to people who can view all', () => {
    expect(staffRequestScope(user('OPS_ADMIN'))).toEqual({});
    expect(staffRequestScope(user('COMMERCIAL'))).toEqual({});
  });
  it('limits assigned-only staff to their own requests', () => {
    expect(staffRequestScope(user('OPS_STAFF', 'abc'))).toEqual({ assigneeId: 'abc' });
  });
  it('limits customers to their own user or linked requests', () => {
    const s = JSON.stringify(customerRequestScope('cust-1'));
    expect(s).toContain('cust-1');
  });
  it('fails closed: a role with no request permission matches nothing', () => {
    expect(staffRequestScope(user('CUSTOMER'))).toEqual({ id: '__none__' });
  });
});
