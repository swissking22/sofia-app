import { isIncompleteStudentProfile } from '../../main/domain/student-profile'

describe('isIncompleteStudentProfile', () => {
  it('is complete when gender, DOB, and guardian phone are set', () => {
    expect(
      isIncompleteStudentProfile({
        gender: 'Male',
        date_of_birth: '2010-01-01',
        guardian_phone: '670000001',
      })
    ).toBe(false)
  })

  it('flags missing gender, DOB, or guardian phone', () => {
    expect(
      isIncompleteStudentProfile({
        gender: null,
        date_of_birth: '2010-01-01',
        guardian_phone: '670000001',
      })
    ).toBe(true)
    expect(
      isIncompleteStudentProfile({
        gender: 'Female',
        date_of_birth: '  ',
        guardian_phone: '670000001',
      })
    ).toBe(true)
    expect(
      isIncompleteStudentProfile({
        gender: 'Female',
        date_of_birth: '2010-01-01',
        guardian_phone: null,
      })
    ).toBe(true)
  })
})
