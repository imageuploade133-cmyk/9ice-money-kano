import { verifyAdminAuth } from "./admin-auth";
import { NextResponse } from "next/server";

import {
  ROLE_DEFAULT_PERMISSIONS,
  hasAdminPermission
} from "./admin-permissions-client";

export {
  type PermissionDefinition,
  CPANEL_PERMISSIONS_CATALOG,
  ROLE_DEFAULT_PERMISSIONS,
  hasAdminPermission
} from "./admin-permissions-client";

/**
 * Server-side helper to authenticate the request and enforce a specific admin permission.
 */
export async function requireAdminPermission(
  req: Request,
  requiredPermission: string
): Promise<{
  auth?: { uid: string; isAdmin: boolean; email?: string; role?: string; permissions?: string[] };
  authorized: boolean;
  response?: NextResponse;
}> {
  try {
    const auth = await verifyAdminAuth(req);

    if (!auth.isAdmin) {
      return {
        authorized: false,
        response: NextResponse.json(
          { error: "Forbidden", message: "Administrative authentication required." },
          { status: 403 }
        ),
      };
    }

    const role = (auth.role || "").toLowerCase();
    const roleDefaults = ROLE_DEFAULT_PERMISSIONS[role] || [];
    const permissions = Array.isArray(auth.permissions) && auth.permissions.length > 0
      ? auth.permissions
      : roleDefaults;

    const isAuthorized = role === "super_admin" || permissions.includes("*") || permissions.includes(requiredPermission);

    if (!isAuthorized) {
      return {
        authorized: false,
        response: NextResponse.json(
          {
            error: "Forbidden",
            message: `Access Denied: You do not have permission ('${requiredPermission}') to access this resource.`,
          },
          { status: 403 }
        ),
      };
    }

    return { auth, authorized: true };
  } catch (err: any) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Unauthorized", message: err.message || "Authentication failed." },
        { status: 401 }
      ),
    };
  }
}
