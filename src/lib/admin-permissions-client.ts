export interface PermissionDefinition {
  key: string;
  label: string;
  category: string;
  description: string;
}

export const CPANEL_PERMISSIONS_CATALOG: PermissionDefinition[] = [
  // System Overview
  { key: "metrics.view", label: "View Metrics & Operations", category: "System Overview", description: "Access dashboard system counts and aggregate balances" },
  { key: "admins.view", label: "View Administrators", category: "Admin Management", description: "Access administrative staff directory" },
  { key: "admins.manage", label: "Manage Administrators", category: "Admin Management", description: "Create, edit roles/permissions, and disable administrative accounts" },

  // User Management
  { key: "users.view", label: "View Users Directory", category: "User Management", description: "Search and view registered customer accounts" },
  { key: "users.manage", label: "Manage Users & Balances", category: "User Management", description: "Create accounts, update roles, or adjust user balances" },
  { key: "kyc.view", label: "View KYC Submissions", category: "User Management", description: "Access customer identity verification queue" },
  { key: "kyc.manage", label: "Approve / Reject KYC", category: "User Management", description: "Approve or reject customer KYC document submissions" },
  { key: "freeze.manage", label: "Account Freeze & Security", category: "User Management", description: "Freeze or unfreeze customer accounts and set notices" },
  { key: "limits.manage", label: "Account Limits Manager", category: "User Management", description: "Configure daily and transaction velocity caps" },
  { key: "virtual_accounts.view", label: "View Virtual Accounts", category: "User Management", description: "Search users and inspect virtual account details" },
  { key: "virtual_accounts.manage", label: "Manage Virtual Accounts", category: "User Management", description: "Securely replace and retire customer virtual accounts" },

  // Branding & Customization
  { key: "branding.manage", label: "Branding & App Config", category: "Branding", description: "Update platform titles, logos, and support details" },
  { key: "feature_toggle.manage", label: "Service Feature Controls", category: "Branding", description: "Enable or disable core application features (Bills, Transfer, Store, etc.)" },
  { key: "communication.branding.manage", label: "Communication & Email Branding", category: "Branding", description: "Manage Email & WhatsApp OTP templates, sender settings, and Welcome email branding" },
  { key: "banners.manage", label: "Slide Banners Manager", category: "Branding", description: "Upload and manage promotional slides across app routes" },
  { key: "bank_logos.manage", label: "Bank Logos Manager", category: "Branding", description: "Manage and repair high-res financial institution logos" },
  { key: "bill_logos.manage", label: "Bill Logos Manager", category: "Branding", description: "Manage biller and network operator brand logos" },
  { key: "whatsapp.manage", label: "WhatsApp Link & Device", category: "Branding", description: "Connect and monitor Baileys WhatsApp integration" },
  { key: "email_connect.manage", label: "Email Connect Gateway", category: "Branding", description: "Configure and test Email API keys & external gateway integration" },

  // Finance & Operations
  { key: "vtu.manage", label: "VTU Markups & Pricing", category: "Finance", description: "Set network airtime/data pricing markups" },
  { key: "exchange_rates.manage", label: "Exchange Rates & Swap Fees", category: "Finance", description: "Configure USD/NGN/XOF rates, live world dollar rate mode, and currency swap fees" },
  { key: "investments.manage", label: "Fixed Deposits & Yields", category: "Finance", description: "Manage investment interest rates and user portfolios" },
  { key: "deposit.manage", label: "Capital Deposit Tool", category: "Finance", description: "Atomically deposit capital into customer wallets" },
  { key: "wallet.deductions.manage", label: "Global Wallet Deductions", category: "Finance", description: "Execute global wallet service/maintenance fee deductions and debt recovery" },

  // E-Commerce Store
  { key: "store.view", label: "View E-Store Directory", category: "Store", description: "Access store products, orders, categories, and stock" },
  { key: "store.manage", label: "Manage Store Products & Orders", category: "Store", description: "Add/edit products, fulfill orders, and manage inventory" },

  // Estate Marketplace
  { key: "estate.view", label: "View Estate Directory", category: "Estate", description: "Access property listings, sellers, and inquiry logs" },
  { key: "estate.manage", label: "Manage Estate & Approvals", category: "Estate", description: "Approve/reject property listings, manage sellers, categories, and settings" },

  // Audit & History
  { key: "user_history.view", label: "User History & Audit Inspector", category: "Audit", description: "Inspect comprehensive user audit ledgers and activity" },
];

export const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  super_admin: ["*"],
  admin: [
    "metrics.view", "admins.view", "users.view", "users.manage",
    "virtual_accounts.view", "virtual_accounts.manage",
    "kyc.view", "kyc.manage", "freeze.manage", "limits.manage",
    "branding.manage", "feature_toggle.manage", "communication.branding.manage", "banners.manage", "bank_logos.manage", "bill_logos.manage",
    "whatsapp.manage", "email_connect.manage", "vtu.manage", "exchange_rates.manage", "investments.manage", "deposit.manage", "wallet.deductions.manage",
    "store.view", "store.manage", "estate.view", "estate.manage", "user_history.view"
  ],
  support: ["metrics.view", "users.view", "kyc.view", "store.view", "user_history.view"],
  finance: ["metrics.view", "users.view", "vtu.manage", "investments.manage", "deposit.manage", "user_history.view"],
  kyc_admin: ["metrics.view", "users.view", "kyc.view", "kyc.manage", "user_history.view"],
  read_only: ["metrics.view", "admins.view", "users.view", "kyc.view", "store.view", "user_history.view"],
};

/**
 * Checks if an administrator account has permission for a specific feature key.
 */
export function hasAdminPermission(
  adminDoc: { role?: string; permissions?: string[] } | null | undefined,
  requiredPermission: string
): boolean {
  if (!adminDoc) return false;

  const role = (adminDoc.role || "").toLowerCase();
  if (role === "super_admin") return true;

  const roleDefaults = ROLE_DEFAULT_PERMISSIONS[role] || [];
  const permissions = Array.isArray(adminDoc.permissions) && adminDoc.permissions.length > 0
    ? adminDoc.permissions
    : roleDefaults;

  if (permissions.includes("*")) return true;

  return permissions.includes(requiredPermission);
}
