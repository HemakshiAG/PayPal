/**
 * Transaction Aggregate Domain Types
 */

import { ProfileRow, TransactionStatus, ParticipantRole } from "./database";
import { UserProfile } from "./user";
import { AgreementVersion } from "./agreement";
import { Milestone } from "./milestone";

export type { TransactionStatus, ParticipantRole };

export interface TransactionParticipant {
  id: string;
  transactionId: string;
  userId: string;
  role: ParticipantRole;
  joinedAt: string;
  profile?: ProfileRow;
}

export interface TransactionItem {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: TransactionStatus;
  creatorId: string;
  inviteCode: string;
  totalAmount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  participants: TransactionParticipant[];
  buyer?: ProfileRow | null;
  seller?: ProfileRow | null;
  currentUserRole?: ParticipantRole | null;
}

export interface TransactionSummary {
  id: string;
  title: string;
  status: TransactionStatus;
  buyer: UserProfile;
  seller: UserProfile;
  activeAgreementVersion?: AgreementVersion;
  latestAgreementVersionNumber: number;
  milestones: Milestone[];
  totalValue: number;
  currency: string;
  evidenceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MessageItem {
  id: string;
  transactionId: string;
  senderId: string;
  content: string;
  createdAt: string;
  sender?: ProfileRow;
}
