import {
  compareClassesByStructure,
  sectionSortRank,
  sortClassesByStructure,
} from '../../main/domain/class-order'

describe('class structure order', () => {
  it('ranks sections General → Commercial → Technical', () => {
    expect(sectionSortRank('General')).toBe(0)
    expect(sectionSortRank('commercial')).toBe(1)
    expect(sectionSortRank('Technical')).toBe(2)
    expect(sectionSortRank('Arts')).toBe(50)
  })

  it('orders Form 1 before Form 2, and General before Technical', () => {
    const sorted = sortClassesByStructure([
      {
        name: 'Form 2 Electrical',
        level_sort_order: 2,
        section_name: 'Technical',
      },
      {
        name: 'Form 1 A',
        level_sort_order: 1,
        section_name: 'General',
      },
      {
        name: 'Form 1 Commercial A',
        level_sort_order: 1,
        section_name: 'Commercial',
      },
      {
        name: 'Form 1 Welding',
        level_sort_order: 1,
        section_name: 'Technical',
      },
      {
        name: 'Form 2 A',
        level_sort_order: 2,
        section_name: 'General',
      },
    ])
    expect(sorted.map((c) => c.name)).toEqual([
      'Form 1 A',
      'Form 1 Commercial A',
      'Form 1 Welding',
      'Form 2 A',
      'Form 2 Electrical',
    ])
  })

  it('compares equal keys by class name', () => {
    expect(
      compareClassesByStructure(
        { name: 'Form 1 B', level_sort_order: 1, section_name: 'General' },
        { name: 'Form 1 A', level_sort_order: 1, section_name: 'General' }
      )
    ).toBeGreaterThan(0)
  })
})
