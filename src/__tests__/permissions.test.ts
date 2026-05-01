import { describe, it, expect } from 'vitest'
import { hasPermission } from '@/lib/auth/permissions'

describe('hasPermission', () => {
  it('allows lab_tech to create pour log', () => {
    expect(hasPermission('lab_tech', 'create_pour_log')).toBe(true)
  })
  it('denies concrete_qc_manager from creating pour log', () => {
    expect(hasPermission('concrete_qc_manager', 'create_pour_log')).toBe(false)
  })
  it('allows only lab_manager to edit pour log', () => {
    expect(hasPermission('lab_manager', 'edit_pour_log')).toBe(true)
    expect(hasPermission('lab_tech', 'edit_pour_log')).toBe(false)
    expect(hasPermission('office_manager', 'edit_pour_log')).toBe(false)
  })
  it('allows lab_tech and lab_manager to enter break results', () => {
    expect(hasPermission('lab_tech', 'enter_break_results')).toBe(true)
    expect(hasPermission('lab_manager', 'enter_break_results')).toBe(true)
    expect(hasPermission('office_manager', 'enter_break_results')).toBe(false)
  })
  it('allows all roles to download reports', () => {
    const allRoles = ['lab_tech', 'lab_manager', 'office_manager', 'field_tech',
      'concrete_qc_manager', 'qc_manager', 'alt_qc_manager'] as const
    allRoles.forEach(role => {
      expect(hasPermission(role, 'download_report')).toBe(true)
    })
  })
})
