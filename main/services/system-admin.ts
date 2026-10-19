import {
  type AccountStatus,
  type PasswordPolicy,
  accountAllowsLogin,
  assertRestoreConfirmation,
  buildPermissionMatrix,
  inferCoarseRole,
  isLockedOut,
  nextLockout,
  validatePassword,
} from "../domain/system-admin";

export class SystemAdminService {
  createUser(input: {
    email: string;
    first_name: string;
    last_name: string;
    role_id: string;
    school_id: string;
    permission_names: string[];
    password: string;
    policy?: PasswordPolicy;
  }): {
    email: string;
    display_name: string;
    role: "admin" | "secretary" | "teacher" | "board" | "bursar";
    status: AccountStatus;
  } {
    const email = input.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("A valid email is required.");
    if (!input.first_name.trim() || !input.last_name.trim()) {
      throw new Error("First and last name are required.");
    }
    if (!input.role_id) throw new Error("A role is required.");
    if (!input.school_id) throw new Error("Users must belong to a school.");
    const err = validatePassword(input.password, input.policy);
    if (err) throw new Error(err);
    return {
      email,
      display_name: `${input.first_name.trim()} ${input.last_name.trim()}`,
      role: inferCoarseRole(input.permission_names),
      status: "active",
    };
  }

  deactivate(status: AccountStatus): AccountStatus {
    if (status === "inactive") return "inactive";
    return "inactive";
  }

  assertLogin(input: {
    status: AccountStatus | string;
    locked_until: string | null;
    failed_count: number;
    passwordOk: boolean;
    maxAttempts: number;
    lockMinutes: number;
  }):
    | { ok: true; failed: number; locked_until: null }
    | {
        ok: false;
        error: string;
        failed: number;
        locked_until: string | null;
      } {
    if (!accountAllowsLogin(input.status)) {
      return {
        ok: false,
        error: "This account is not active.",
        failed: input.failed_count,
        locked_until: input.locked_until,
      };
    }
    if (isLockedOut(input.locked_until)) {
      return {
        ok: false,
        error:
          "Account is locked after too many failed sign-ins. Try again later.",
        failed: input.failed_count,
        locked_until: input.locked_until,
      };
    }
    if (!input.passwordOk) {
      const next = nextLockout(
        input.failed_count,
        input.maxAttempts,
        input.lockMinutes,
      );
      return {
        ok: false,
        error: "Invalid email or password.",
        failed: next.failed,
        locked_until: next.locked_until,
      };
    }
    return { ok: true, failed: 0, locked_until: null };
  }

  matrix(
    permissions: Array<{
      id: string;
      name: string;
      label: string;
      module_key: string;
      module_label: string;
    }>,
    roles: Array<{ id: string; permission_ids: string[] }>,
  ) {
    return buildPermissionMatrix(permissions, roles);
  }

  confirmRestore(phrase: string): void {
    assertRestoreConfirmation(phrase);
  }
}
