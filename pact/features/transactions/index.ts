/**
 * Feature Module: Transactions
 * Responsible for end-to-end custom commerce transaction lifecycle, party roles, and activity audits.
 */

export interface TransactionViewState {
  activeTab: "agreement" | "milestones" | "evidence" | "audit";
}

