// Response shapes for projects. Public responses carry only the approved,
// consented summary — never documents, flags or review notes (FR06, FR14).

function publicProject(p) {
  return {
    projectCode: p.projectCode,
    title: p.title,
    type: p.type,
    sector: p.sector,
    stage: p.stage,
    country: p.country,
    summary: p.summary,
    description: p.description,
    companyName: p.type === 'company' ? p.companyName : null,
    fundingSought: p.fundingSought,
    status: p.status,
    approvedAt: p.approvedAt,
    founder: p.owner
      ? {
          name: p.owner.fullName,
          cohortYear: p.owner.graduateProfile?.cohortYear ?? null,
          program: p.owner.graduateProfile?.program ?? null,
        }
      : null,
  };
}

function documentSummary(d) {
  return {
    id: d.id,
    kind: d.kind,
    originalName: d.originalName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    status: d.status,
    uploadedAt: d.createdAt,
  };
}

// What the owning graduate sees: their own record and evidence list, without
// the OCR flag (a preliminary administrative signal).
function ownerProject(p) {
  return {
    id: p.id,
    projectCode: p.projectCode,
    title: p.title,
    type: p.type,
    sector: p.sector,
    suggestedSector: p.suggestedSector,
    stage: p.stage,
    country: p.country,
    summary: p.summary,
    description: p.description,
    companyName: p.companyName,
    companyNumber: p.companyNumber,
    relationshipToCompany: p.relationshipToCompany,
    ideaDeclaration: p.ideaDeclaration,
    fundingSought: p.fundingSought,
    publicationConsent: p.publicationConsent,
    status: p.status,
    similarityStatus: p.similarityStatus,
    similarityMatches: (p.similarityMatches || []).map(({ projectCode, title, sector, score }) => ({
      projectCode,
      title,
      sector,
      score,
    })),
    clarificationRequestedAt: p.clarificationRequestedAt,
    clarificationText: p.clarificationText,
    clarificationSubmittedAt: p.clarificationSubmittedAt,
    reviewNote: p.reviewNote,
    submittedAt: p.submittedAt,
    approvedAt: p.approvedAt,
    updatedAt: p.updatedAt,
    documents: (p.documents || []).map(documentSummary),
  };
}

module.exports = { publicProject, ownerProject, documentSummary };
