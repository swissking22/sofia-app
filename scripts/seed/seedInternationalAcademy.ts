import { randomUUID } from 'node:crypto'
import type { SeedContext } from './context'
import { baseFields, runInTransaction } from './helpers'
import {
  cameroonStandardSecondary20,
  hashConfig,
} from '../../main/domain/results-calculation'
import { calculateClassResults } from '../../main/services/results/result-calculation.service'

export function seedInternationalAcademy(ctx: SeedContext): void {
  const { db } = ctx
  const now = new Date().toISOString()

  runInTransaction(db, () => {
    // 1. Find International Academy of Excellence school
    const school = db
      .prepare(`SELECT * FROM schools WHERE name = ? OR short_code = ?`)
      .get('International Academy of Excellence', 'IAE') as
      | { id: string; name: string }
      | undefined

    if (!school) {
      console.log('International Academy of Excellence school record not found. Skipping.');
      return
    }

    const schoolId = school.id

    // 2. Academic Year 2026/2027
    let year = db
      .prepare(`SELECT * FROM academic_years WHERE school_id = ? AND name = ?`)
      .get(schoolId, '2026/2027') as { id: string } | undefined

    if (!year) {
      const yearId = randomUUID()
      db.prepare(`
        INSERT INTO academic_years (
          id, school_id, name, start_date, end_date, is_current,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @school_id, @name, @start_date, @end_date, 1,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )
      `).run({
        ...baseFields(now),
        id: yearId,
        school_id: schoolId,
        name: '2026/2027',
        start_date: '2026-09-01',
        end_date: '2027-06-30',
      })
      year = { id: yearId }
    }

    // 3. Academic Terms
    const termNames = ['First Term', 'Second Term', 'Third Term']
    let firstTermId = ''
    for (let t = 0; t < termNames.length; t++) {
      const tName = termNames[t]
      let termRow = db
        .prepare(`SELECT * FROM academic_terms WHERE academic_year_id = ? AND name = ?`)
        .get(year.id, tName) as { id: string } | undefined
      if (!termRow) {
        const tId = randomUUID()
        db.prepare(`
          INSERT INTO academic_terms (
            id, academic_year_id, name, term_number, start_date, end_date,
            created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (
            @id, @academic_year_id, @name, @term_number, @start_date, @end_date,
            @created_at, @updated_at, @deleted_at, @sync_status, @version
          )
        `).run({
          ...baseFields(now),
          id: tId,
          academic_year_id: year.id,
          name: tName,
          term_number: t + 1,
          start_date: t === 0 ? '2026-09-01' : t === 1 ? '2027-01-05' : '2027-04-10',
          end_date: t === 0 ? '2026-12-18' : t === 1 ? '2027-03-26' : '2027-06-25',
        })
        termRow = { id: tId }
      }
      if (t === 0) firstTermId = termRow.id
    }

    // 4. Department
    let dept = db
      .prepare(`SELECT * FROM departments WHERE school_id = ? AND name = ?`)
      .get(schoolId, 'General') as { id: string } | undefined
    if (!dept) {
      const deptId = randomUUID()
      db.prepare(`
        INSERT INTO departments (
          id, school_id, name,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @school_id, @name,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )
      `).run({
        ...baseFields(now),
        id: deptId,
        school_id: schoolId,
        name: 'General',
      })
      dept = { id: deptId }
    }

    // 5. Level Form 5 & Class Form 5A
    let level = db
      .prepare(`SELECT * FROM academic_levels WHERE school_id = ? AND name = ?`)
      .get(schoolId, 'Form 5') as { id: string } | undefined
    if (!level) {
      const levelId = randomUUID()
      db.prepare(`
        INSERT INTO academic_levels (
          id, school_id, name, short_name, category, is_active, sort_order,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @school_id, @name, @short_name, 'upper_secondary', 1, 5,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )
      `).run({
        ...baseFields(now),
        id: levelId,
        school_id: schoolId,
        name: 'Form 5',
        short_name: 'F5',
      })
      level = { id: levelId }
    }

    let classRow = db
      .prepare(`SELECT * FROM classes WHERE school_id = ? AND name = ?`)
      .get(schoolId, 'Form 5A') as { id: string } | undefined
    if (!classRow) {
      const cId = randomUUID()
      db.prepare(`
        INSERT INTO classes (
          id, name, school_id, level, form_key, stream,
          academic_level_id, section_id, specialization_id, capacity, is_active,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @name, @school_id, 'Form 5', 'form_5', 'A',
          @academic_level_id, NULL, NULL, 40, 1,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )
      `).run({
        ...baseFields(now),
        id: cId,
        name: 'Form 5A',
        school_id: schoolId,
        academic_level_id: level.id,
      })
      classRow = { id: cId }
    }

    // 6. Subjects & Coefficients
    const subjectDefs = [
      { name: 'Mathematics', code: 'MATH', coeff: 5 },
      { name: 'English Language', code: 'ENG', coeff: 4 },
      { name: 'Physics', code: 'PHY', coeff: 4 },
      { name: 'Chemistry', code: 'CHE', coeff: 4 },
      { name: 'Biology', code: 'BIO', coeff: 3 },
      { name: 'History', code: 'HIS', coeff: 2 },
      { name: 'Geography', code: 'GEO', coeff: 2 },
    ]

    const subjectList: Array<{ id: string; name: string; coeff: number }> = []

    for (const def of subjectDefs) {
      let subj = db
        .prepare(`SELECT * FROM subjects WHERE school_id = ? AND name = ?`)
        .get(schoolId, def.name) as { id: string } | undefined

      if (!subj) {
        const sId = randomUUID()
        db.prepare(`
          INSERT INTO subjects (
            id, school_id, name, class_id, department_id, coefficient,
            created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (
            @id, @school_id, @name, @class_id, @department_id, @coefficient,
            @created_at, @updated_at, @deleted_at, @sync_status, @version
          )
        `).run({
          ...baseFields(now),
          id: sId,
          school_id: schoolId,
          class_id: classRow.id,
          name: def.name,
          department_id: dept.id,
          coefficient: def.coeff,
        })
        subj = { id: sId }
      }

      subjectList.push({ id: subj.id, name: def.name, coeff: def.coeff })

      // Subject coefficient override
      const coeffExisting = db
        .prepare(
          `SELECT id FROM result_subject_coefficients WHERE school_id = ? AND subject_id = ? AND class_id = ?`
        )
        .get(schoolId, subj.id, classRow.id)

      if (!coeffExisting) {
        db.prepare(`
          INSERT INTO result_subject_coefficients (
            id, school_id, subject_id, class_id, academic_level_id, academic_year_id,
            coefficient, created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (
            @id, @school_id, @subject_id, @class_id, @academic_level_id, @academic_year_id,
            @coefficient, @created_at, @updated_at, @deleted_at, @sync_status, @version
          )
        `).run({
          ...baseFields(now),
          id: randomUUID(),
          school_id: schoolId,
          subject_id: subj.id,
          class_id: classRow.id,
          academic_level_id: level.id,
          academic_year_id: year.id,
          coefficient: def.coeff,
        })
      }
    }

    // 7. Active Calculation Profile
    const config = cameroonStandardSecondary20({
      ca_weight: 40,
      exam_weight: 60,
      pass_mark: 10,
      rounding: { places: 2, half: 'standard' },
      sequence_method: 'simple_average',
    })

    let profile = db
      .prepare(
        `SELECT id FROM result_calculation_profiles WHERE school_id = ? AND status = 'active'`
      )
      .get(schoolId) as { id: string } | undefined

    if (!profile) {
      const pId = randomUUID()
      const cfgHash = hashConfig(config)
      db.prepare(`
        INSERT INTO result_calculation_profiles (
          id, school_id, name, description, period_mode, status, academic_year_id,
          created_by, created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @school_id, @name, @description, 'term', 'active', @academic_year_id,
          NULL, @created_at, @updated_at, @deleted_at, @sync_status, @version
        )
      `).run({
        ...baseFields(now),
        id: pId,
        school_id: schoolId,
        name: 'Cameroon Secondary Standard (40% CA + 60% Exam)',
        description: 'Official standard: CA 40%, Exam 60%, Pass Mark 10/20, Rounding 2 decimals',
        academic_year_id: year.id,
      })

      db.prepare(`
        INSERT INTO result_calculation_profile_versions (
          id, school_id, profile_id, version_number, config_json, config_hash,
          created_by, created_at
        ) VALUES (
          @id, @school_id, @profile_id, 1, @config_json, @config_hash,
          NULL, @created_at
        )
      `).run({
        id: randomUUID(),
        school_id: schoolId,
        profile_id: pId,
        config_json: JSON.stringify(config),
        config_hash: cfgHash,
        created_at: now,
      })

      profile = { id: pId }
    }

    // 8. 32 Students in Form 5A (starting with Olivia Wilson)
    const studentNames = [
      { name: 'Olivia Wilson', code: 'IAE-2026-001', gender: 'female' },
      { name: 'John Doe', code: 'IAE-2026-002', gender: 'male' },
      { name: 'Samuel Eto', code: 'IAE-2026-003', gender: 'male' },
      { name: 'Brenda Fomuso', code: 'IAE-2026-004', gender: 'female' },
      { name: 'David Tabi', code: 'IAE-2026-005', gender: 'male' },
      { name: 'Christelle Mengue', code: 'IAE-2026-006', gender: 'female' },
      { name: 'Paul Biya Jr.', code: 'IAE-2026-007', gender: 'male' },
      { name: 'Nadine Kamga', code: 'IAE-2026-008', gender: 'female' },
      { name: 'Eric Song', code: 'IAE-2026-009', gender: 'male' },
      { name: 'Grace Mbarga', code: 'IAE-2026-010', gender: 'female' },
      { name: 'Victor Ndifor', code: 'IAE-2026-011', gender: 'male' },
      { name: 'Sandra Abena', code: 'IAE-2026-012', gender: 'female' },
      { name: 'Kevin Nkem', code: 'IAE-2026-013', gender: 'male' },
      { name: 'Diane Fon', code: 'IAE-2026-014', gender: 'female' },
      { name: 'Alain Fotso', code: 'IAE-2026-015', gender: 'male' },
      { name: 'Esther Njoh', code: 'IAE-2026-016', gender: 'female' },
      { name: 'Roland Ashu', code: 'IAE-2026-017', gender: 'male' },
      { name: 'Fabiola Ateba', code: 'IAE-2026-018', gender: 'female' },
      { name: 'George Enow', code: 'IAE-2026-019', gender: 'male' },
      { name: 'Miriam Sali', code: 'IAE-2026-020', gender: 'female' },
      { name: 'Boris Tchinda', code: 'IAE-2026-021', gender: 'male' },
      { name: 'Carine Ndam', code: 'IAE-2026-022', gender: 'female' },
      { name: 'Daniel Bate', code: 'IAE-2026-023', gender: 'male' },
      { name: 'Judith Eyong', code: 'IAE-2026-024', gender: 'female' },
      { name: 'Arthur Bell', code: 'IAE-2026-025', gender: 'male' },
      { name: 'Ruth Mbah', code: 'IAE-2026-026', gender: 'female' },
      { name: 'Brian Manga', code: 'IAE-2026-027', gender: 'male' },
      { name: 'Solange Kome', code: 'IAE-2026-028', gender: 'female' },
      { name: 'Franklyn Chi', code: 'IAE-2026-029', gender: 'male' },
      { name: 'Honorine Voma', code: 'IAE-2026-030', gender: 'female' },
      { name: 'Gaston Ngu', code: 'IAE-2026-031', gender: 'male' },
      { name: 'Vera Wache', code: 'IAE-2026-032', gender: 'female' },
    ]

    const studentRows: Array<{ id: string; name: string; code: string }> = []

    let seqNum = 1
    for (const def of studentNames) {
      let st = db
        .prepare(`SELECT * FROM students WHERE school_id = ? AND student_code = ?`)
        .get(schoolId, def.code) as { id: string } | undefined

      if (!st) {
        const sId = randomUUID()
        db.prepare(`
          INSERT INTO students (
            id, name, class_id, school_id, student_code, admission_year,
            academic_level_id, sequence_number, gender, date_of_birth,
            admission_type, status,
            created_at, updated_at, deleted_at, sync_status, version
          ) VALUES (
            @id, @name, @class_id, @school_id, @student_code, 2026,
            @academic_level_id, @sequence_number, @gender, '2009-01-01',
            'regular', 'active',
            @created_at, @updated_at, @deleted_at, @sync_status, @version
          )
        `).run({
          ...baseFields(now),
          id: sId,
          name: def.name,
          class_id: classRow.id,
          school_id: schoolId,
          student_code: def.code,
          academic_level_id: level.id,
          sequence_number: seqNum++,
          gender: def.gender,
        })
        st = { id: sId }
      }
      studentRows.push({ id: st.id, name: def.name, code: def.code })
    }

    // 9. Prepare scores lookup
    const scoresLookup = new Map<
      string,
      {
        sequences: Array<{ name: string; raw: number; max: number; status?: 'recorded' | 'absent' }>
        exam: { raw: number; max: number; status?: 'recorded' | 'absent' } | null
      }
    >()

    // Realistic score distributions for 32 students
    for (let sIdx = 0; sIdx < studentRows.length; sIdx++) {
      const student = studentRows[sIdx]
      const isOlivia = student.code === 'IAE-2026-001'
      const isFailing = sIdx >= 27 // last 5 students fail (< 10)

      for (const subj of subjectList) {
        let seq1 = 12
        let seq2 = 14
        let seq3 = 13
        let exam = 14

        if (isOlivia) {
          if (subj.name === 'Mathematics') {
            seq1 = 12
            seq2 = 15
            seq3 = 14
            exam = 16
          } else if (subj.name === 'English Language') {
            seq1 = 14
            seq2 = 13
            seq3 = 15
            exam = 13.17
          } else if (subj.name === 'Physics') {
            seq1 = 15
            seq2 = 14
            seq3 = 14
            exam = 14.20
          } else if (subj.name === 'Chemistry') {
            seq1 = 14
            seq2 = 15
            seq3 = 13
            exam = 14.17
          } else if (subj.name === 'Biology') {
            seq1 = 13
            seq2 = 14
            seq3 = 14
            exam = 13.20
          } else if (subj.name === 'History') {
            seq1 = 12
            seq2 = 12
            seq3 = 12
            exam = 12.00
          } else if (subj.name === 'Geography') {
            seq1 = 14
            seq2 = 14
            seq3 = 15
            exam = 14.80
          }
        } else if (isFailing) {
          // 6 to 9.5
          seq1 = 7 + (sIdx % 3)
          seq2 = 6 + (sIdx % 4)
          seq3 = 8 + (sIdx % 2)
          exam = 7.5 + (sIdx % 3)
        } else {
          // Passing students: 10.5 to 17
          const base = 11 + ((sIdx * 3 + subj.name.length) % 6)
          seq1 = Math.min(20, base + ((sIdx % 3) - 1))
          seq2 = Math.min(20, base + ((sIdx % 2) === 0 ? 1 : -1))
          seq3 = Math.min(20, base)
          exam = Math.min(20, base + 1)
        }

        scoresLookup.set(`${student.id}:${subj.id}`, {
          sequences: [
            { name: 'Sequence 1', raw: seq1, max: 20, status: 'recorded' },
            { name: 'Sequence 2', raw: seq2, max: 20, status: 'recorded' },
            { name: 'Sequence 3', raw: seq3, max: 20, status: 'recorded' },
          ],
          exam: { raw: exam, max: 20, status: 'recorded' },
        })
      }
    }

    // 10. Coefficients map
    const coeffMap = new Map<string, number>()
    for (const s of subjectList) {
      coeffMap.set(s.id, s.coeff)
    }

    // 11. Run calculation engine!
    const outcome = calculateClassResults({
      classId: classRow.id,
      termId: firstTermId,
      academicYearId: year.id,
      config,
      students: studentRows.map((s) => ({ id: s.id, name: s.name, student_code: s.code })),
      subjects: subjectList.map((s) => ({ id: s.id, name: s.name })),
      coefficientsMap: coeffMap,
      scoresLookup,
    })

    // 12. Persist Result Run
    let run = db
      .prepare(
        `SELECT id FROM result_runs WHERE class_id = ? AND (term_id = ? OR (term_id IS NULL AND ? IS NULL))`
      )
      .get(classRow.id, firstTermId, firstTermId) as { id: string } | undefined

    const runId = run?.id ?? randomUUID()
    if (!run) {
      db.prepare(`
        INSERT INTO result_runs (
          id, school_id, class_id, term_id, academic_year_id, status, computed_at,
          created_at, updated_at, deleted_at, sync_status, version
        ) VALUES (
          @id, @school_id, @class_id, @term_id, @academic_year_id, 'computed', @computed_at,
          @created_at, @updated_at, @deleted_at, @sync_status, @version
        )
      `).run({
        ...baseFields(now),
        id: runId,
        school_id: schoolId,
        class_id: classRow.id,
        term_id: firstTermId,
        academic_year_id: year.id,
        computed_at: now,
      })
    } else {
      db.prepare(`
        UPDATE result_runs SET status = 'computed', computed_at = @computed_at, updated_at = @updated_at
        WHERE id = @id
      `).run({
        id: runId,
        computed_at: now,
        updated_at: now,
      })
      // Clear old rows for fresh seeded run
      db.prepare(`DELETE FROM result_subject_rows WHERE result_run_id = ?`).run(runId)
      db.prepare(`DELETE FROM result_student_summaries WHERE result_run_id = ?`).run(runId)
    }

    // Insert subject rows
    const insertRowStmt = db.prepare(`
      INSERT INTO result_subject_rows (
        id, result_run_id, student_id, subject_id,
        ca_score, exam_score, total, grade,
        sequence_scores_json, ca_average, subject_mark, coefficient, weighted_mark, remark,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @result_run_id, @student_id, @subject_id,
        @ca_score, @exam_score, @total, @grade,
        @sequence_scores_json, @ca_average, @subject_mark, @coefficient, @weighted_mark, @remark,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    for (const studentResult of outcome.student_results) {
      for (const sub of studentResult.subject_results) {
        insertRowStmt.run({
          ...baseFields(now),
          id: randomUUID(),
          result_run_id: runId,
          student_id: studentResult.student_id,
          subject_id: sub.subject_id,
          ca_score: sub.ca_average ?? 0,
          exam_score: sub.exam_raw ?? 0,
          total: sub.subject_mark ?? 0,
          grade: sub.grade,
          sequence_scores_json: JSON.stringify(
            sub.sequence_details.map((d) => ({
              name: d.name,
              raw: d.raw,
              max: d.max,
              normalized: d.normalized,
              status: d.status,
              included: d.included,
            }))
          ),
          ca_average: sub.ca_average,
          subject_mark: sub.subject_mark,
          coefficient: sub.coefficient,
          weighted_mark: sub.weighted_mark ?? 0,
          remark: sub.remark,
        })
      }
    }

    // Insert student summaries
    const insertSummaryStmt = db.prepare(`
      INSERT INTO result_student_summaries (
        id, result_run_id, student_id, average, total, grade, position, remark,
        promotion_outcome, gpa, failed_subjects,
        total_coefficients, total_weighted_marks, passed_subjects, status,
        created_at, updated_at, deleted_at, sync_status, version
      ) VALUES (
        @id, @result_run_id, @student_id, @average, @total, @grade, @position, @remark,
        @promotion_outcome, @gpa, @failed_subjects,
        @total_coefficients, @total_weighted_marks, @passed_subjects, @status,
        @created_at, @updated_at, @deleted_at, @sync_status, @version
      )
    `)

    for (const studentResult of outcome.student_results) {
      insertSummaryStmt.run({
        ...baseFields(now),
        id: randomUUID(),
        result_run_id: runId,
        student_id: studentResult.student_id,
        average: studentResult.term_average_rounded ?? studentResult.term_average ?? 0,
        total: studentResult.total_weighted_marks,
        grade: studentResult.grade,
        position: studentResult.position,
        remark: studentResult.remark,
        promotion_outcome: studentResult.promotion_outcome,
        gpa: studentResult.gpa,
        failed_subjects: studentResult.failed_subjects,
        total_coefficients: studentResult.total_coefficients,
        total_weighted_marks: studentResult.total_weighted_marks,
        passed_subjects: studentResult.passed_subjects,
        status: studentResult.status,
      })
    }

    console.log(
      `[sofia:seed] Seeded International Academy of Excellence Form 5A: 32 students, 7 subjects, active 40/60 formula, run_id: ${runId}`
    )
  })
}
