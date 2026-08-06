import { randomUUID } from 'node:crypto'
import type { SeedContext } from './context'
import { baseFields, runInTransaction } from './helpers'

const DEPT_NAMES = ['General', 'Commercial', 'Technical', 'Science'] as const

const LEVELS = [
  { name: 'Form 1', category: 'lower_secondary', sort_order: 1 },
  { name: 'Form 2', category: 'lower_secondary', sort_order: 2 },
  { name: 'Form 3', category: 'lower_secondary', sort_order: 3 },
  { name: 'Form 4', category: 'lower_secondary', sort_order: 4 },
] as const

const SECTIONS = [
  { name: 'General', description: 'General academic stream' },
  { name: 'Commercial', description: 'Business and commercial studies' },
  { name: 'Technical', description: 'Technical and vocational studies' },
] as const

/** Academic years, terms, departments, levels, sections, and classes. */
export function seedAcademics(ctx: SeedContext): void {
  const { db } = ctx
  const now = new Date().toISOString()

  runInTransaction(db, () => {
    const yearInsert = db.prepare(`
      INSERT INTO academic_years (
        id, school_id, name, start_date, end_date, is_current,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @name, @start_date, @end_date, 1,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)
    const termInsert = db.prepare(`
      INSERT INTO academic_terms (
        id, academic_year_id, name, term_number, start_date, end_date,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @academic_year_id, @name, @term_number, @start_date, @end_date,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)
    const deptInsert = db.prepare(`
      INSERT INTO departments (
        id, school_id, name,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @name,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)
    const levelInsert = db.prepare(`
      INSERT INTO academic_levels (
        id, school_id, name, short_name, category, is_active, sort_order,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @name, @short_name, @category, 1, @sort_order,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)
    const sectionInsert = db.prepare(`
      INSERT INTO sections (
        id, school_id, name, description, is_active,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @school_id, @name, @description, 1,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    const classInsert = db.prepare(`
      INSERT INTO classes (
        id, name, school_id, level, form_key, stream,
        academic_level_id, section_id, specialization_id, capacity, is_active,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @name, @school_id, @level, @form_key, @stream,
        @academic_level_id, @section_id, NULL, @capacity, 1,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    try {
      db.exec(`ALTER TABLE classes ADD COLUMN class_teacher_id TEXT`)
    } catch {
      /* ok */
    }

    for (const school of ctx.schools) {
      const yearId = randomUUID()
      yearInsert.run({
        ...baseFields(now),
        id: yearId,
        school_id: school.id,
        name: '2025/2026',
        start_date: '2025-09-01',
        end_date: '2026-06-30',
      })
      ctx.years.set(school.id, yearId)

      const termIds: string[] = []
      const termDefs = [
        { name: 'Term 1', n: 1, start: '2025-09-01', end: '2025-12-15' },
        { name: 'Term 2', n: 2, start: '2026-01-07', end: '2026-03-28' },
        { name: 'Term 3', n: 3, start: '2026-04-14', end: '2026-06-30' },
      ]
      for (const t of termDefs) {
        const tid = randomUUID()
        termInsert.run({
          ...baseFields(now),
          id: tid,
          academic_year_id: yearId,
          name: t.name,
          term_number: t.n,
          start_date: t.start,
          end_date: t.end,
        })
        termIds.push(tid)
      }
      ctx.terms.set(school.id, termIds)

      const deptMap = new Map<string, string>()
      for (const name of DEPT_NAMES) {
        const id = randomUUID()
        deptInsert.run({
          ...baseFields(now),
          id,
          school_id: school.id,
          name,
        })
        deptMap.set(name, id)
      }
      ctx.departments.set(school.id, deptMap)

      const levelMap = new Map<string, string>()
      for (const level of LEVELS) {
        const id = randomUUID()
        levelInsert.run({
          ...baseFields(now),
          id,
          school_id: school.id,
          name: level.name,
          short_name: level.name.replace('Form ', 'F'),
          category: level.category,
          sort_order: level.sort_order,
        })
        levelMap.set(level.name, id)
      }
      ctx.levels.set(school.id, levelMap)

      const sectionMap = new Map<string, string>()
      for (const section of SECTIONS) {
        const id = randomUUID()
        sectionInsert.run({
          ...baseFields(now),
          id,
          school_id: school.id,
          name: section.name,
          description: section.description,
        })
        sectionMap.set(section.name, id)
      }
      ctx.sections.set(school.id, sectionMap)

      // Class roster tuned for demo
      const classDefs: Array<{
        name: string
        level: string
        section: string
        dept: string
      }> = [
        { name: 'Form 1 A', level: 'Form 1', section: 'General', dept: 'General' },
        { name: 'Form 1 B', level: 'Form 1', section: 'General', dept: 'General' },
        {
          name: 'Form 2 Commercial',
          level: 'Form 2',
          section: 'Commercial',
          dept: 'Commercial',
        },
        {
          name: 'Form 3 Technical',
          level: 'Form 3',
          section: 'Technical',
          dept: 'Technical',
        },
        { name: 'Form 4 Science', level: 'Form 4', section: 'General', dept: 'Science' },
      ]

      for (const c of classDefs) {
        const id = randomUUID()
        const academic_level_id = levelMap.get(c.level)!
        const section_id = sectionMap.get(c.section)!
        classInsert.run({
          ...baseFields(now),
          id,
          name: c.name,
          school_id: school.id,
          level: c.level,
          form_key: c.level.toLowerCase().replace(/\s+/g, '_'),
          stream: c.section.toLowerCase(),
          academic_level_id,
          section_id,
          capacity: 45,
        })
        ctx.classes.push({
          id,
          school_id: school.id,
          name: c.name,
          level: c.level,
          academic_level_id,
          department_id: deptMap.get(c.dept) ?? null,
          section_id,
        })
      }
    }
  })

  console.log(`  Classes: ${ctx.classes.length}`)
}
