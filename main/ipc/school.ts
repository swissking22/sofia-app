import { ipcMain } from 'electron'
import type { Repositories } from '../db/repositories'
import type { School } from '../db/types'
import {
  assetToDataUrl,
  saveSchoolAsset,
} from '../helpers/school-assets'
import {
  getSession,
  updateSessionSchoolName,
} from '../auth'

/** Profile shape returned to the renderer (paths → data URLs). */
export interface SchoolProfileDto {
  id: string
  name: string
  email: string
  phone: string | null
  country: string | null
  address: string | null
  school_code: string
  short_code: string
  school_type: string | null
  education_system: string | null
  school_category: string | null
  region: string | null
  division: string | null
  subdivision: string | null
  website: string | null
  logo_url: string | null
  stamp_url: string | null
  signature_url: string | null
}

export interface UpdateSchoolProfileInput {
  name: string
  email: string
  phone?: string | null
  country?: string | null
  address?: string | null
  short_code?: string | null
  school_type?: string | null
  education_system?: string | null
  school_category?: string | null
  region?: string | null
  division?: string | null
  subdivision?: string | null
  website?: string | null
  logoBase64?: string | null
  logoMimeType?: string
  stampBase64?: string | null
  stampMimeType?: string
  signatureBase64?: string | null
  signatureMimeType?: string
}

export type SchoolProfileResult =
  | { ok: true; profile: SchoolProfileDto }
  | { ok: false; error: string }

function toProfileDto(school: School): SchoolProfileDto {
  return {
    id: school.id,
    name: school.name,
    email: school.email,
    phone: school.phone,
    country: school.country,
    address: school.address,
    school_code: school.school_code,
    short_code: school.short_code,
    school_type: school.school_type,
    education_system: school.education_system,
    school_category: school.school_category,
    region: school.region,
    division: school.division,
    subdivision: school.subdivision,
    website: school.website,
    logo_url: assetToDataUrl(school.logo_path),
    stamp_url: assetToDataUrl(school.stamp_path),
    signature_url: assetToDataUrl(school.principal_signature_path),
  }
}

function resolveSchool(repos: Repositories): School | undefined {
  const session = getSession()
  if (session?.schoolId) {
    const bySession = repos.schools.findById(session.schoolId)
    if (bySession) return repos.schools.ensureSchoolCode(bySession)
  }
  const latest = repos.schools.findLatest()
  return latest ? repos.schools.ensureSchoolCode(latest) : undefined
}

export function registerSchoolIpc(repos: Repositories): void {
  ipcMain.handle('school:get-profile', (): SchoolProfileResult => {
    const school = resolveSchool(repos)
    if (!school) {
      return { ok: false, error: 'No school found. Complete registration first.' }
    }
    return { ok: true, profile: toProfileDto(school) }
  })

  ipcMain.handle(
    'school:update-profile',
    (_event, input: UpdateSchoolProfileInput): SchoolProfileResult => {
      const school = resolveSchool(repos)
      if (!school) {
        return {
          ok: false,
          error: 'No school found. Complete registration first.',
        }
      }

      const name = input.name?.trim() || school.name
      if (!name) {
        return { ok: false, error: 'School name is required.' }
      }

      const phone = input.phone?.trim() || null
      const address = input.address?.trim() || null

      let logo_path = school.logo_path
      let stamp_path = school.stamp_path
      let principal_signature_path = school.principal_signature_path

      try {
        if (input.logoBase64) {
          logo_path = saveSchoolAsset(
            'logo',
            input.logoBase64,
            input.logoMimeType ?? 'image/png'
          )
        }
        if (input.stampBase64) {
          stamp_path = saveSchoolAsset(
            'stamp',
            input.stampBase64,
            input.stampMimeType ?? 'image/png'
          )
        }
        if (input.signatureBase64) {
          principal_signature_path = saveSchoolAsset(
            'signature',
            input.signatureBase64,
            input.signatureMimeType ?? 'image/png'
          )
        }
      } catch {
        return { ok: false, error: 'Could not save one of the branding assets.' }
      }

      try {
        const updated = repos.schools.update(school.id, {
          name,
          email: input.email?.trim().toLowerCase() || '',
          phone,
          country: input.country?.trim() || null,
          address,
          short_code: input.short_code?.trim() || school.short_code,
          school_type: input.school_type?.trim() || null,
          education_system: input.education_system?.trim() || null,
          school_category: input.school_category?.trim() || null,
          region: input.region?.trim() || null,
          division: input.division?.trim() || null,
          subdivision: input.subdivision?.trim() || null,
          website: input.website?.trim() || null,
          logo_path,
          stamp_path,
          principal_signature_path,
        })

        if (!updated) {
          return { ok: false, error: 'Failed to update school profile.' }
        }

        if (name !== school.name) {
          updateSessionSchoolName(name)
        }

        return { ok: true, profile: toProfileDto(updated) }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Failed to update school profile.',
        }
      }
    }
  )
}
