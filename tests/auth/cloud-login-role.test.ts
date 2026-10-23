import { mapCloudAuthRole } from '../../main/services/cloud-login'

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
})
