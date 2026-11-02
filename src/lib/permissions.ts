import type { Role } from '@/generated/prisma/enums';

/**
 * Permission matrix. Enforced on the server for every protected operation
 * (see src/server/rbac.ts). Hiding a button is never the security mechanism.
 */
export const PERMISSIONS = [
  'request.view.all', // every request
  'request.view.assigned', // only requests assigned to the user
  'request.assign',
  'request.status',
  'request.note',
  'request.close',
  'customer.view',
  'customer.edit',
  'task.manage',
  'quotation.view',
  'quotation.create',
  'quotation.submit',
  'quotation.approve',
  'quotation.issue',
  'quotation.recordResponse', // record a customer's phone, paper, email or in-person answer on their behalf
  'report.view',
  'service.manage',
  'catalogue.manage', // categories, products, sizes, price book
  'content.manage',
  'user.manage',
  'settings.manage',
  'integration.manage',
  'audit.view',
  'journal.write', // create and edit own drafts, submit for publishing
  'journal.publish', // publish, schedule, archive and delete any article
  'social.manage', // connect and disconnect social accounts
  'social.publish', // choose channels and send or retry social posts
  'media.manage', // media centre entries, galleries
  'profile.manage', // executive profile, career timeline, GeePee feature entries
  'division.manage',
  'opportunity.manage',
  'staffportal.manage', // staff announcements, circulars, documents, directory
  'analytics.view',
  'seo.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = [...PERMISSIONS] as Permission[];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ALL,
  OPS_ADMIN: [
    'request.view.all', 'request.assign', 'request.status', 'request.note', 'request.close',
    'customer.view', 'customer.edit', 'task.manage', 'quotation.view', 'report.view',
    'service.manage', 'catalogue.manage', 'content.manage', 'division.manage', 'opportunity.manage', 'analytics.view', 'staffportal.manage',
  ],
  OPS_STAFF: ['request.view.assigned', 'request.status', 'request.note', 'customer.view', 'task.manage'],
  COMMERCIAL: [
    'request.view.all', 'request.note', 'customer.view', 'customer.edit', 'task.manage',
    'quotation.view', 'quotation.create', 'quotation.submit', 'quotation.issue', 'quotation.recordResponse', 'report.view', 'catalogue.manage',
  ],
  APPROVER: ['request.view.all', 'customer.view', 'quotation.view', 'quotation.approve', 'report.view'],
  CONTENT_MANAGER: [
    'journal.write', 'journal.publish', 'social.publish', 'media.manage', 'profile.manage', 'division.manage', 'opportunity.manage',
    'content.manage', 'analytics.view', 'seo.manage',
  ],
  COMMUNICATIONS: [
    'journal.write', 'journal.publish', 'social.manage', 'social.publish', 'media.manage', 'staffportal.manage', 'analytics.view',
    'request.view.assigned', 'request.note', 'request.status',
  ],
  STAFF_MEMBER: [],
  CUSTOMER: [],
};

/** Roles that use the operations console. STAFF_MEMBER is an employee who only uses the staff portal. */
export const STAFF_ROLES: Role[] = ['SUPER_ADMIN', 'OPS_ADMIN', 'OPS_STAFF', 'COMMERCIAL', 'APPROVER', 'CONTENT_MANAGER', 'COMMUNICATIONS'];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  OPS_ADMIN: 'Operations Admin',
  OPS_STAFF: 'Operations Staff',
  COMMERCIAL: 'Commercial Staff',
  APPROVER: 'Approver',
  CONTENT_MANAGER: 'Content Manager',
  COMMUNICATIONS: 'Communications Team',
  STAFF_MEMBER: 'Staff Member',
  CUSTOMER: 'Customer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SUPER_ADMIN: 'Full system administration: users, permissions, configuration, integrations and the audit log.',
  OPS_ADMIN: 'Broad operational access: assignment, workflow, customers, services, content and reporting. Cannot manage users or settings.',
  OPS_STAFF: 'Works the requests assigned to them: status updates, notes and follow-ups.',
  COMMERCIAL: 'Customer and commercial access: creates, submits and issues quotations once approved.',
  APPROVER: 'Reviews quotations awaiting approval and approves or rejects them within their limit.',
  CONTENT_MANAGER: 'Writes and publishes the journal, media centre, executive profile, divisions and opportunities, and manages SEO. Can send posts to connected social accounts.',
  COMMUNICATIONS: 'Journal, media centre, social account connections and publishing, and staff announcements. Sees only the requests assigned to them.',
  STAFF_MEMBER: 'Staff portal only: announcements, circulars, directory and approved documents. No access to customer data or the console.',
  CUSTOMER: 'Portal access to their own company’s requests, documents and quotations.',
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}

/** Anyone who works for St. Chris: the operations roles plus staff-portal-only employees. */
export function isInternal(role: Role): boolean {
  return role !== 'CUSTOMER';
}
