export interface IsolatedDemoAccount {
  id: string;
  aliasId: "hardcoded-buyer-uuid-1" | "hardcoded-seller-uuid-2";
  email: string;
  fullName: string;
  role: "buyer" | "seller";
  roleLabel: "BUYER" | "SELLER";
}

export const DEMO_BUYER_UUID = "11111111-1111-4111-8111-111111111101";
export const DEMO_SELLER_UUID = "22222222-2222-4222-8222-222222222202";

/**
 * Strictly isolated hackathon demo accounts.
 * Buyer and Seller map to two completely distinct auth users and two distinct profile rows.
 */
export const DEMO_ACCOUNTS: Record<"buyer" | "seller", IsolatedDemoAccount> = {
  buyer: {
    id: DEMO_BUYER_UUID,
    aliasId: "hardcoded-buyer-uuid-1",
    email: "buyer@pact.demo",
    fullName: "Alex Rivera",
    role: "buyer",
    roleLabel: "BUYER",
  },
  seller: {
    id: DEMO_SELLER_UUID,
    aliasId: "hardcoded-seller-uuid-2",
    email: "seller@pact.demo",
    fullName: "Elena Vance Studio",
    role: "seller",
    roleLabel: "SELLER",
  },
};

export function getDemoAccountByRole(role: "buyer" | "seller"): IsolatedDemoAccount {
  return DEMO_ACCOUNTS[role];
}

export function getDemoPassword(): string {
  return process.env.DEMO_ACCOUNT_PASSWORD || "PactHackathon#2026";
}

export function resolveDemoAccountByEmail(
  email: string | null | undefined
): IsolatedDemoAccount | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (normalized === DEMO_ACCOUNTS.buyer.email.toLowerCase()) {
    return DEMO_ACCOUNTS.buyer;
  }
  if (normalized === DEMO_ACCOUNTS.seller.email.toLowerCase()) {
    return DEMO_ACCOUNTS.seller;
  }
  return null;
}

