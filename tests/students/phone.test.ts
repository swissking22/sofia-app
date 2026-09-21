import { normalizeCameroonPhone } from '../../main/domain/phone'

describe('normalizeCameroonPhone', () => {
  it('accepts 9-digit national numbers starting with 6 or 2', () => {
    expect(normalizeCameroonPhone('670000001')).toBe('670000001')
    expect(normalizeCameroonPhone('222000001')).toBe('222000001')
    expect(normalizeCameroonPhone('670 00 00 01')).toBe('670000001')
  })

  it('strips country code and leading zero', () => {
    expect(normalizeCameroonPhone('+237670000001')).toBe('670000001')
    expect(normalizeCameroonPhone('237670000001')).toBe('670000001')
    expect(normalizeCameroonPhone('00237670000001')).toBe('670000001')
    expect(normalizeCameroonPhone('0670000001')).toBe('670000001')
  })

  it('returns null for empty and invalid for bad values', () => {
    expect(normalizeCameroonPhone('')).toBe(null)
    expect(normalizeCameroonPhone('   ')).toBe(null)
    expect(normalizeCameroonPhone('12345')).toBe('invalid')
    expect(normalizeCameroonPhone('770000001')).toBe('invalid')
    expect(normalizeCameroonPhone('+237 770000001')).toBe('invalid')
  })
})
