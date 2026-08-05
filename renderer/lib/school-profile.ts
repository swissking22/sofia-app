/** School profile field options + IPC helpers. */

export interface SchoolProfile {
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
  | { ok: true; profile: SchoolProfile }
  | { ok: false; error: string }

export const SCHOOL_TYPES = ['Government', 'Mission', 'Private'] as const

export const EDUCATION_SYSTEMS = [
  'Cameroon Anglo-Saxon Secondary System',
] as const

export const SCHOOL_CATEGORIES = [
  'Day School',
  'Boarding School',
  'Day & Boarding',
] as const

export async function fetchSchoolProfile(): Promise<SchoolProfileResult> {
  return (await window.ipc.invoke('school:get-profile')) as SchoolProfileResult
}

export async function updateSchoolProfile(
  input: UpdateSchoolProfileInput
): Promise<SchoolProfileResult> {
  return (await window.ipc.invoke(
    'school:update-profile',
    input
  )) as SchoolProfileResult
}
