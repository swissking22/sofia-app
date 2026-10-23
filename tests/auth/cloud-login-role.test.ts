import {
  isTeacherDesktopBlocked,
  mapCloudAuthRole,
  TEACHER_DESKTOP_LOGIN_ERROR,
} from '../../main/services/cloud-login'

describe('mapCloudAuthRole', () => {
  it('accepts desktop Auth roles including bursar and board', () => {
    expect(mapCloudAuthRole('admin')).toBe('admin')
    expect(mapCloudAuthRole('secretary')).toBe('secretary')
    expect(mapCloudAuthRole('teacher')).toBe('teacher')
    expect(mapCloudAuthRole('bursar')).toBe('bursar')
    expect(mapCloudAuthRole('Bursar')).toBe('bursar')
    expect(mapCloudAuthRole('board')).toBe('board')
  })

  it('rejects unknown or empty roles', () => {
    expect(mapCloudAuthRole(null)).toBeNull()
    expect(mapCloudAuthRole('')).toBeNull()
    expect(mapCloudAuthRole('principal')).toBeNull()
    expect(mapCloudAuthRole('unknown')).toBeNull()
  })

  it('flags teacher for desktop login block while keeping admin roles open', () => {
    expect(isTeacherDesktopBlocked('teacher')).toBe(true)
    expect(isTeacherDesktopBlocked('Teacher')).toBe(true)
    expect(isTeacherDesktopBlocked('admin')).toBe(false)
    expect(isTeacherDesktopBlocked('secretary')).toBe(false)
    expect(isTeacherDesktopBlocked('bursar')).toBe(false)
    expect(isTeacherDesktopBlocked('board')).toBe(false)
    expect(TEACHER_DESKTOP_LOGIN_ERROR).toMatch(/mobile app/i)
  })
})
