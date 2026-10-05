import { resolveNestedBackHref } from '../../renderer/lib/nested-back'

describe('resolveNestedBackHref', () => {
  it('returns null for top-level hubs', () => {
    expect(resolveNestedBackHref('/home')).toBeNull()
    expect(resolveNestedBackHref('/students')).toBeNull()
    expect(resolveNestedBackHref('/finance/billing')).toBeNull()
    expect(resolveNestedBackHref('/students/id-cards')).toBeNull()
  })

  it('resolves entity detail and action pages', () => {
    expect(
      resolveNestedBackHref('/students/a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    ).toBe('/students')
    expect(resolveNestedBackHref('/students/create')).toBe('/students')
    expect(resolveNestedBackHref('/staff/teachers/create')).toBe(
      '/staff/teachers'
    )
    expect(resolveNestedBackHref('/academic/attendance/take')).toBe(
      '/academic/attendance'
    )
  })

  it('uses special parents for designer, print, and results settings', () => {
    expect(
      resolveNestedBackHref('/students/id-cards/designer/tpl-12345678')
    ).toBe('/students/id-cards/templates')
    expect(resolveNestedBackHref('/students/id-cards/templates/new')).toBe(
      '/students/id-cards/templates'
    )
    expect(resolveNestedBackHref('/students/id-cards/issued')).toBe(
      '/students/id-cards'
    )
    expect(
      resolveNestedBackHref('/academic/results/calculation-settings')
    ).toBe('/academic/results')
    expect(resolveNestedBackHref('/academic/results/coefficients')).toBe(
      '/academic/results'
    )
    expect(
      resolveNestedBackHref('/documents/print/doc-abcdefgh')
    ).toBe('/students/documents')
  })

  it('ignores query and hash', () => {
    expect(resolveNestedBackHref('/students/create?foo=1#bar')).toBe(
      '/students'
    )
  })
})
