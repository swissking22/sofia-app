import {
  classListFilename,
  classListToCsv,
  classListsToCsv,
  sexAbbreviation,
} from '../../main/domain/class-list'

describe('class list helpers', () => {
  it('abbreviates sex to M/F', () => {
    expect(sexAbbreviation('Male')).toBe('M')
    expect(sexAbbreviation('female')).toBe('F')
    expect(sexAbbreviation('m')).toBe('M')
    expect(sexAbbreviation(null)).toBe('')
  })

  it('builds CSV with index, name, and sex', () => {
    const csv = classListToCsv([
      {
        student_code: 'SCH-001',
        name: 'Doe, Jane',
        gender: 'Female',
        date_of_birth: '2010-05-01',
        guardian_name: 'Parent "A"',
        guardian_phone: '677000000',
        residence_type: 'day',
      },
    ])
    expect(csv).toContain('Index,Name,Sex')
    expect(csv).toContain('1,"Doe, Jane",F')
  })

  it('builds a combined CSV for all classes', () => {
    const csv = classListsToCsv([
      {
        class_name: 'Form 1 A',
        students: [
          {
            student_code: 'A1',
            name: 'Ada',
            gender: 'Female',
            date_of_birth: null,
            guardian_name: null,
            guardian_phone: null,
            residence_type: 'day',
          },
        ],
      },
      {
        class_name: 'Form 1 B',
        students: [
          {
            student_code: 'B1',
            name: 'Ben',
            gender: 'Male',
            date_of_birth: null,
            guardian_name: null,
            guardian_phone: null,
            residence_type: 'day',
          },
        ],
      },
    ])
    expect(csv).toContain('Class,Index,Name,Sex')
    expect(csv).toContain('Form 1 A,1,Ada,F')
    expect(csv).toContain('Form 1 B,1,Ben,M')
  })

  it('names the file after the class', () => {
    expect(classListFilename('Form 1 A')).toBe('Form 1 A class list.csv')
    expect(classListFilename('Form 1/A')).toBe('Form 1 A class list.csv')
    expect(classListFilename('All classes')).toBe('All classes class list.csv')
  })
})
