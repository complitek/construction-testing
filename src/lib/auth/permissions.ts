import type { Role } from '@/lib/types'

export type Permission =
  | 'create_pour_log'
  | 'upload_combined_pdf'
  | 'confirm_ticket_match'
  | 'enter_break_results'
  | 'edit_pour_log'
  | 'download_report'
  | 'bulk_download'
  | 'manage_users'
  | 'manage_templates'

export const VALID_ROLES: Role[] = [
  'admin',
  'lab_tech', 'lab_manager', 'office_manager', 'field_tech',
  'concrete_qc_manager', 'qc_manager', 'alt_qc_manager',
]

const PERMISSIONS: Record<Permission, Role[]> = {
  create_pour_log:      ['admin', 'lab_tech', 'lab_manager', 'office_manager', 'field_tech'],
  upload_combined_pdf:  ['admin', 'lab_tech', 'lab_manager', 'office_manager'],
  confirm_ticket_match: ['admin', 'lab_tech', 'lab_manager', 'office_manager'],
  enter_break_results:  ['admin', 'lab_tech', 'lab_manager'],
  edit_pour_log:        ['admin', 'lab_manager'],
  download_report:      ['admin', 'lab_tech', 'lab_manager', 'office_manager', 'field_tech',
                         'concrete_qc_manager', 'qc_manager', 'alt_qc_manager'],
  bulk_download:        ['admin', 'lab_tech', 'lab_manager', 'office_manager', 'field_tech',
                         'concrete_qc_manager', 'qc_manager', 'alt_qc_manager'],
  manage_users:         ['admin', 'lab_manager'],
  manage_templates:     ['admin'],   // admin only
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSIONS[permission].includes(role)
}

export function isAdmin(role: Role | null | undefined): boolean {
  return role === 'admin'
}
