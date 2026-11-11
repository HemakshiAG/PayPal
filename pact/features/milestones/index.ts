/**
 * Feature Module: Milestones
 * Responsible for milestone progress tracking, submission of deliverable proofs, and PayPal payment release triggers.
 */

export interface MilestoneProgressSummary {
  totalMilestones: number;
  completedMilestones: number;
  totalFundedAmount: number;
  totalReleasedAmount: number;
}

