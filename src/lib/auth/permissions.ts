import type { Role } from '@/lib/types'

type Permission =
  | 'create_pour_log'
  | 'upload_combined_pdf'
  | 'confirm_ticket_match'
  | 'enter_break_results'
  | 'edit_pour_log'
  | 'download_report'
  | 'bulk_download'
  | 'manage_users'

const PERMISSIONS: Record<Permission, Role[]> = {
  create_pour_log: ['lab_tech', 'lab_manager', 'office_manager', 'field_tech'],
  upload_combined_pdf: ['lab_tech', 'lab_manager', 'office_manager'],
  confirm_ticket_match: ['lab_tech', 'lab_manager', 'office_manager'],
  enter_break_results: ['lab_tech', 'lab_manager'],
  edit_pour_log: ['lab_manager'],
  download_report: ['lab_tech', 'lab_manager', 'office_manager', 'field_tech',
    'concrete_qc_manager', 'qc_manager', 'alt_qc_manager'],
  bulk_download: ['lab_tech', 'lab_manager', 'office_manager', 'field_tech',
    'concrete_qc_manager', 'qc_manager', 'alt_qc_manager'],
  manage_users: ['lab_manager'],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSIONS[permission].includes(role)
}
