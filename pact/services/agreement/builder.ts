/**
 * PACT Grouped Agreement Compiler & Versioning Service
 * Phase 4: Grouped Agreement Builder & Immutable SHA-256 Versioning Engine
 *
 * NON-NEGOTIABLE SAFETY CONSTRAINTS:
 * - Rule 8: AI-extracted terms retain citations and origin tags.
 * - Rule 9: Every agreement modification creates a new version. Never silently overwrite an approved version.
 * - Rule 10: Both parties must approve the same exact agreement version before it becomes active.
 * - Rule 12: Clear non-escrow compliance notice included in Section 13.
 */

import {
  AgreementSection,
  AgreementItem,
  AgreementVersion,
  SectionDiff,
} from "@/types/agreement";
import {
  ExtractedTermRow,
  ScenarioRow,
  ScenarioResolutionRow,
} from "@/types/database";

export interface TransactionSummaryForAgreement {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  totalAmount: number;
  currency: string;
}

/**
 * Standard 13 PACT Contract Section Metadata
 */
export const CONTRACT_SECTIONS_SPEC = [
  {
    number: 1,
    id: "scope_of_work",
    title: "1. Scope of Work & Commercial Deliverables",
    description: "Definition of bespoke deliverables, creative brief requirements, and agreed end-products.",
  },
  {
    number: 2,
    id: "technical_specifications",
    title: "2. Technical & Material Standards",
    description: "Dimensions, material grades, hardware specifications, and craftsmanship tolerances.",
  },
  {
    number: 3,
    id: "financial_milestones",
    title: "3. Financial Terms & Milestone Schedule",
    description: "Contract sum, currency, upfront deposit, and milestone release triggers.",
  },
  {
    number: 4,
    id: "delivery_timeline",
    title: "4. Delivery Schedule & Deadlines",
    description: "Milestone progression schedules, final consignment dispatch, and transit tracking.",
  },
  {
    number: 5,
    id: "inspection_acceptance",
    title: "5. Inspection & Acceptance Testing",
    description: "Inspection window duration, proof verification in Evidence Vault, and acceptance criteria.",
  },
  {
    number: 6,
    id: "contingency_timeline",
    title: "6. Contingency Protocol: Timeline Delays",
    description: "Agreed protocols, notices, and compensation formulas if production schedules slip.",
  },
  {
    number: 7,
    id: "contingency_material",
    title: "7. Contingency Protocol: Material Stockouts",
    description: "Approved substitute procedures and cost absorption rules for supply shortages.",
  },
  {
    number: 8,
    id: "contingency_scope",
    title: "8. Contingency Protocol: Scope & Revisions",
    description: "Permitted review iterations, change order rates, and labor adjustment schedules.",
  },
  {
    number: 9,
    id: "contingency_quality",
    title: "9. Contingency Protocol: Quality & Finish Variances",
    description: "Remedy procedures, free alteration provisions, or settlement credits for deviations.",
  },
  {
    number: 10,
    id: "cancellation_force_majeure",
    title: "10. Cancellation & Mutual Settlement",
    description: "Work-in-progress audits, sunk material reimbursements, and fair termination terms.",
  },
  {
    number: 11,
    id: "intellectual_property",
    title: "11. Intellectual Property & Commercial Rights",
    description: "Title transfer upon final milestone settlement and seller portfolio display rights.",
  },
  {
    number: 12,
    id: "warranties_representations",
    title: "12. Warranties & Representation",
    description: "Material authenticity guarantees, non-infringement warranties, and quality assurances.",
  },
  {
    number: 13,
    id: "non_escrow_notice",
    title: "13. Milestone Disbursement & Non-Escrow Disclosure",
    description: "Mandatory statutory notice governing milestone payment coordination through PayPal Developer Sandbox.",
  },
];

/**
 * Compiles confirmed terms and resolved scenarios into the canonical 13 PACT contract sections.
 */
export function compileAgreementSections(
  tx: TransactionSummaryForAgreement,
  confirmedTerms: ExtractedTermRow[],
  scenarios: Array<ScenarioRow & { scenario_resolutions?: ScenarioResolutionRow[] }>
): AgreementSection[] {
  const currencySymbol = tx.currency === "INR" ? "₹" : "$";

  // Group terms by category
  const specTerms = confirmedTerms.filter((t) => t.category === "specification");
  const finTerms = confirmedTerms.filter((t) => t.category === "financial");
  const timeTerms = confirmedTerms.filter((t) => t.category === "timeline");
  const condTerms = confirmedTerms.filter((t) => t.category === "condition");

  // Helper to extract resolved scenario
  const getResolvedScenario = (cat: string) => {
    return scenarios.find((s) => s.category === cat && s.status === "resolved");
  };

  const sections: AgreementSection[] = [];

  // Section 1: Scope of Work & Deliverables
  const scopeItems: AgreementItem[] = [
    {
      id: "scope-primary",
      title: "Primary Deliverable Commission",
      content: `${tx.title}: ${tx.description || "Custom commissioned item crafted according to specifications mutually agreed in negotiation chat."}`,
      origin: "confirmed_term",
    },
  ];
  specTerms.forEach((t) => {
    scopeItems.push({
      id: `scope-${t.id}`,
      title: t.term_key,
      content: t.term_value,
      origin: "confirmed_term",
      sourceId: t.id,
      sourceSnippet: t.term_value,
    });
  });

  sections.push({
    sectionNumber: 1,
    sectionId: "scope_of_work",
    title: CONTRACT_SECTIONS_SPEC[0].title,
    description: CONTRACT_SECTIONS_SPEC[0].description,
    items: scopeItems,
  });

  // Section 2: Technical & Material Standards
  const techItems: AgreementItem[] = [];
  if (specTerms.length > 0) {
    specTerms.forEach((t) => {
      techItems.push({
        id: `tech-${t.id}`,
        title: `${t.term_key} Standards`,
        content: `Deliverable shall conform strictly to confirmed specification: ${t.term_value}. Any deviation exceeds acceptable commercial tolerance unless formally amended.`,
        origin: "confirmed_term",
        sourceId: t.id,
      });
    });
  } else {
    techItems.push({
      id: "tech-std-1",
      title: "Standard Commercial Craftsmanship",
      content: "All components, finishing, and packaging shall conform to industry-standard custom artisan benchmarks for the commissioned category.",
      origin: "standard_provision",
    });
  }

  sections.push({
    sectionNumber: 2,
    sectionId: "technical_specifications",
    title: CONTRACT_SECTIONS_SPEC[1].title,
    description: CONTRACT_SECTIONS_SPEC[1].description,
    items: techItems,
  });

  // Section 3: Financial Terms & Milestone Schedule
  const finItems: AgreementItem[] = [
    {
      id: "fin-total",
      title: "Total Contract Value",
      content: `The agreed commercial consideration for the commissioned work is ${currencySymbol}${tx.totalAmount.toLocaleString()} ${tx.currency}, payable across defined milestones.`,
      origin: "confirmed_term",
    },
  ];
  finTerms.forEach((t) => {
    finItems.push({
      id: `fin-${t.id}`,
      title: t.term_key,
      content: `Confirmed financial provision: ${t.term_value}.`,
      origin: "confirmed_term",
      sourceId: t.id,
    });
  });

  sections.push({
    sectionNumber: 3,
    sectionId: "financial_milestones",
    title: CONTRACT_SECTIONS_SPEC[2].title,
    description: CONTRACT_SECTIONS_SPEC[2].description,
    items: finItems,
  });

  // Section 4: Delivery Schedule & Deadlines
  const timeItems: AgreementItem[] = [];
  if (timeTerms.length > 0) {
    timeTerms.forEach((t) => {
      timeItems.push({
        id: `time-${t.id}`,
        title: t.term_key,
        content: `Target milestone completion: ${t.term_value}. Transit carrier tracking shall be uploaded to the transaction feed upon dispatch.`,
        origin: "confirmed_term",
        sourceId: t.id,
      });
    });
  } else {
    timeItems.push({
      id: "time-std-1",
      title: "Estimated Delivery Interval",
      content: "Seller shall produce and dispatch deliverables within the timeline established in project communications, subject to agreed contingency protocols.",
      origin: "standard_provision",
    });
  }

  sections.push({
    sectionNumber: 4,
    sectionId: "delivery_timeline",
    title: CONTRACT_SECTIONS_SPEC[3].title,
    description: CONTRACT_SECTIONS_SPEC[3].description,
    items: timeItems,
  });

  // Section 5: Inspection & Acceptance Testing
  sections.push({
    sectionNumber: 5,
    sectionId: "inspection_acceptance",
    title: CONTRACT_SECTIONS_SPEC[4].title,
    description: CONTRACT_SECTIONS_SPEC[4].description,
    items: [
      {
        id: "insp-window",
        title: "48-Hour Inspection Window",
        content: "Buyer is granted a 48-hour inspection period following verified carrier delivery to review goods against contracted specifications.",
        origin: "standard_provision",
      },
      {
        id: "insp-vault",
        title: "Evidence Vault Verification",
        content: "Any claims of dimensional variance, finish defects, or transit damage must be recorded with time-stamped visual proofs in the PACT Evidence Vault during the inspection window.",
        origin: "standard_provision",
      },
    ],
  });

  // Sections 6-9: Contingency Protocols (from Phase 3 Resolved Scenarios)
  const contingencyConfigs = [
    { num: 6, id: "contingency_timeline", cat: "timeline_delay", defaultTitle: "Timeline Delay Contingency Protocol", defaultBody: "If fabrication delays occur, Seller shall give 48h advance notice. Parties grant up to 4 calendar days extension with complimentary courier upgrade." },
    { num: 7, id: "contingency_material", cat: "material_shortage", defaultTitle: "Material Shortage Contingency Protocol", defaultBody: "If primary raw material is unavailable, Seller shall present equivalent grade swatch for Buyer approval with zero price alteration." },
    { num: 8, id: "contingency_scope", cat: "scope_dispute", defaultTitle: "Scope & Revision Contingency Protocol", defaultBody: "Buyer is entitled to 1 minor finishing adjustment. Additional structural modifications require a written change order and milestone adjustment." },
    { num: 9, id: "contingency_quality", cat: "quality_rejection", defaultTitle: "Quality Tolerance Contingency Protocol", defaultBody: "In the event of verified craftsmanship defect, Seller shall provide complimentary alteration or a 15% settlement credit upon mutual approval." },
  ];

  contingencyConfigs.forEach((cfg) => {
    const resolvedScen = getResolvedScenario(cfg.cat);
    const activeRes = resolvedScen?.scenario_resolutions?.[0];

    const content = activeRes
      ? `Mutually Agreed Contingency: ${activeRes.agreed_action} (Price Impact: ${activeRes.price_impact_type} ${currencySymbol}${activeRes.price_impact_value}, Timeline Delay: +${activeRes.timeline_impact_days} days).`
      : cfg.defaultBody;

    sections.push({
      sectionNumber: cfg.num,
      sectionId: cfg.id,
      title: CONTRACT_SECTIONS_SPEC[cfg.num - 1].title,
      description: CONTRACT_SECTIONS_SPEC[cfg.num - 1].description,
      items: [
        {
          id: `cont-${cfg.id}`,
          title: resolvedScen ? resolvedScen.title : cfg.defaultTitle,
          content,
          origin: resolvedScen ? "agreed_contingency" : "standard_provision",
          sourceId: resolvedScen?.id,
        },
      ],
    });
  });

  // Section 10: Cancellation & Mutual Settlement
  const cancelScen = getResolvedScenario("cancellation");
  const cancelRes = cancelScen?.scenario_resolutions?.[0];
  sections.push({
    sectionNumber: 10,
    sectionId: "cancellation_force_majeure",
    title: CONTRACT_SECTIONS_SPEC[9].title,
    description: CONTRACT_SECTIONS_SPEC[9].description,
    items: [
      {
        id: "cancel-terms",
        title: cancelScen ? cancelScen.title : "Mutual Cancellation Terms",
        content: cancelRes
          ? `Agreed Cancellation Protocol: ${cancelRes.agreed_action}.`
          : "If cancelled prior to dispatch, verified sunk raw material costs already cut/allocated are deducted from deposit; unspent milestone balance is returned to Buyer.",
        origin: cancelScen ? "agreed_contingency" : "standard_provision",
      },
    ],
  });

  // Section 11: Intellectual Property & Commercial Rights
  sections.push({
    sectionNumber: 11,
    sectionId: "intellectual_property",
    title: CONTRACT_SECTIONS_SPEC[10].title,
    description: CONTRACT_SECTIONS_SPEC[10].description,
    items: [
      {
        id: "ip-transfer",
        title: "Title & Rights Transfer",
        content: "Title and commercial usage rights in physical deliverables and custom designs transfer to Buyer upon full settlement of all scheduled milestone payments.",
        origin: "standard_provision",
      },
      {
        id: "ip-portfolio",
        title: "Creator Portfolio Display",
        content: "Seller retains the non-exclusive moral right to photograph and exhibit non-confidential deliverables in artistic and commercial portfolios.",
        origin: "standard_provision",
      },
    ],
  });

  // Section 12: Warranties & Representation
  sections.push({
    sectionNumber: 12,
    sectionId: "warranties_representations",
    title: CONTRACT_SECTIONS_SPEC[11].title,
    description: CONTRACT_SECTIONS_SPEC[11].description,
    items: [
      {
        id: "war-authenticity",
        title: "Authenticity & Non-Infringement",
        content: "Seller warrants that all custom work is authentic, original, free from third-party liens, and utilizes high-grade materials as represented.",
        origin: "standard_provision",
      },
      ...condTerms.map((t) => ({
        id: `cond-${t.id}`,
        title: t.term_key,
        content: t.term_value,
        origin: "confirmed_term" as const,
        sourceId: t.id,
      })),
    ],
  });

  // Section 13: Milestone Disbursement & Non-Escrow Disclosure (Rule 12 Compliance)
  sections.push({
    sectionNumber: 13,
    sectionId: "non_escrow_notice",
    title: CONTRACT_SECTIONS_SPEC[12].title,
    description: CONTRACT_SECTIONS_SPEC[12].description,
    items: [
      {
        id: "statutory-non-escrow",
        title: "Statutory Non-Escrow Compliance Notice (Rule 12)",
        content:
          "PACT coordinates milestone payments using verified PayPal Developer Sandbox server events. PACT does not act as an escrow agent, fiduciary holder, or banking custodian. Milestone transactions do not constitute an escrow account. Milestone authorizations and disbursements occur directly between the buyer and seller via PayPal's payment network upon mutual deliverable sign-off.",
        origin: "standard_provision",
      },
      {
        id: "statutory-cryptographic",
        title: "Cryptographic Agreement Binding (Rule 9 & 10)",
        content:
          "This agreement version is immutably serialized and fingerprinted with a canonical SHA-256 hash. Any subsequent modification requires creating version N+1. Activation occurs solely upon dual mutual approval of the identical cryptographic fingerprint.",
        origin: "standard_provision",
      },
    ],
  });

  return sections;
}

/**
 * Computes section-by-section diffs between two agreement versions.
 */
export function computeVersionDiffs(
  oldVersion: AgreementVersion,
  newVersion: AgreementVersion
): SectionDiff[] {
  const diffs: SectionDiff[] = [];

  const oldMap = new Map(oldVersion.sections.map((s) => [s.sectionId, s]));

  for (const newSec of newVersion.sections) {
    const oldSec = oldMap.get(newSec.sectionId);
    if (!oldSec) {
      diffs.push({
        sectionNumber: newSec.sectionNumber,
        sectionId: newSec.sectionId,
        title: newSec.title,
        type: "added",
        newText: newSec.items.map((i) => `• ${i.title}: ${i.content}`).join("\n"),
      });
    } else {
      const oldText = oldSec.items.map((i) => `• ${i.title}: ${i.content}`).join("\n");
      const newText = newSec.items.map((i) => `• ${i.title}: ${i.content}`).join("\n");
      if (oldText !== newText) {
        diffs.push({
          sectionNumber: newSec.sectionNumber,
          sectionId: newSec.sectionId,
          title: newSec.title,
          type: "modified",
          oldText,
          newText,
        });
      } else {
        diffs.push({
          sectionNumber: newSec.sectionNumber,
          sectionId: newSec.sectionId,
          title: newSec.title,
          type: "unchanged",
        });
      }
    }
  }

  return diffs;
}

