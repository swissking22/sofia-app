import { ipcMain } from 'electron'
import { getSession } from '../auth'
import type { Repositories } from '../db/repositories'
import type {
  CommunicationSaveInput,
  CommunicationSetupDto,
} from '../db/repositories/communication.repository'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

function resolveSchool(repos: Repositories) {
  const session = getSession()
  if (session?.schoolId) {
    const bySession = repos.schools.findById(session.schoolId)
    if (bySession) return bySession
  }
  return repos.schools.findLatest() ?? undefined
}

export function registerCommunicationIpc(repos: Repositories): void {
  ipcMain.handle(
    'communication:get-setup',
    (): Result<CommunicationSetupDto> => {
      const school = resolveSchool(repos)
      if (!school) {
        return {
          ok: false,
          error: 'No school found. Complete registration first.',
        }
      }
      return {
        ok: true,
        data: repos.communication.getSetupDto(school.id, school.name),
      }
    }
  )

  ipcMain.handle(
    'communication:save-setup',
    (_e, input: CommunicationSaveInput): Result<CommunicationSetupDto> => {
      const school = resolveSchool(repos)
      if (!school) return { ok: false, error: 'No school found.' }

      try {
        if (input.channel_sms) {
          if (!input.sms_provider?.trim()) {
            return { ok: false, error: 'Select an SMS provider to enable SMS.' }
          }
          if (!input.sms_sender_name?.trim()) {
            return {
              ok: false,
              error: 'Sender name is required when SMS is enabled.',
            }
          }
        }

        if (
          !input.channel_sms &&
          !input.channel_email &&
          !input.channel_internal
        ) {
          return {
            ok: false,
            error: 'Enable at least one notification channel.',
          }
        }

        return {
          ok: true,
          data: repos.communication.saveSetup(school.id, school.name, input),
        }
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : 'Could not save communication settings.',
        }
      }
    }
  )
}
