/** User management API (TECHNICAL_PLAN §4.3): GET/POST /users, PATCH /users/{id}. ADMIN only. */
import type { Role } from "@/app/session";
import { usersMock } from "@/mocks/users";
import type { Audited, ListQueryParams, Page } from "./types";

export type UserStatus = "active" | "inactive" | "all";

export interface UserFilters extends ListQueryParams {
  q?: string;
  /** Comma-separated roles. */
  role?: string;
  status?: UserStatus;
}

export interface UserItem {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  /** Failed sign-ins since the last success or lock (§4.2: 5 attempts lock the account). */
  failed_login_count: number;
  /** Set while the account is locked out; null otherwise. */
  locked_until: string | null;
  last_login_at: string | null;
  version: number;
}

export type User = UserItem & Omit<Audited, "version">;

export interface UserCreateInput {
  email: string;
  full_name: string;
  role: Role;
  /** Initial password, at least 12 characters (§4.2). */
  password: string;
}

/** Email is the sign-in name and stays fixed. */
export interface UserUpdateInput {
  full_name?: string;
  role?: Role;
  is_active?: boolean;
  version: number;
}

export const PASSWORD_MIN_LENGTH = 12;

export const usersApi = {
  list: (f: UserFilters): Promise<Page<UserItem>> => usersMock.list(f),
  get: (id: string): Promise<User> => usersMock.get(id),
  create: (input: UserCreateInput): Promise<User> => usersMock.create(input),
  update: (id: string, patch: UserUpdateInput): Promise<User> => usersMock.update(id, patch),
};
