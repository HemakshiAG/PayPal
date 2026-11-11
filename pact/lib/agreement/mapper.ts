import type {
  AgreementApproval,
  AgreementSection,
  AgreementVersion,
} from "@/types/agreement";

export function mapRawAgreementVersion(
  v: Record<string, unknown>
): AgreementVersion {
  const rawApprovals =
    (v.agreement_approvals as Array<Record<string, unknown>>) || [];
  const approvals: AgreementApproval[] = rawApprovals.map((a) => {
    const prof = a.profiles as unknown as {
      full_name: string | null;
      avatar_url: string | null;
    } | null;
    return {
      id: a.id as string,
      agreementVersionId: a.agreement_version_id as string,
      transactionId: a.transaction_id as string,
      userId: a.user_id as string,
      role: a.role as "buyer" | "seller",
      contentHash: a.content_hash as string,
      approvedAt: a.approved_at as string,
      profile: prof
        ? { fullName: prof.full_name, avatarUrl: prof.avatar_url }
        : undefined,
    };
  });

  const buyerApp = approvals.find((a) => a.role === "buyer");
  const sellerApp = approvals.find((a) => a.role === "seller");

  return {
    id: v.id as string,
    transactionId: v.transaction_id as string,
    versionNumber: Number(v.version_number) || 1,
    contentHash: v.content_hash as string,
    title: v.title as string,
    sections: Array.isArray(v.sections)
      ? (v.sections as AgreementSection[])
      : [],
    status: v.status as "draft" | "active" | "superseded" | "cancelled",
    createdBy: v.created_by as string,
    createdAt: v.created_at as string,
    approvals,
    buyerApproved: Boolean(buyerApp),
    sellerApproved: Boolean(sellerApp),
    isMutuallyApproved: Boolean(buyerApp && sellerApp),
  };
}

