// Response shapes for projects. Public responses carry only the approved,
// consented summary — never documents, flags, review notes or the project
// code (FR06, FR14). The code is the founder's to share: the public reaches a
// venture by its id, and only someone who already holds the code can look it
// up on the Verify page.
const crypto = require('crypto');
const { serializeResult } = require('./results');

// The optional background image is public only while the project is
// "Approved and Seeking Investment" and its owner consented to publication.
// Investors, the owner and administrators load it through their own routes.
const isImagePublic = (p) => Boolean(p.imageKey) && p.status === 'approved' && Boolean(p.publicationConsent);
const IMAGE_ROUTE = {
  public: (id) => `/api/public/projects/${id}/image`,
  investor: (id) => `/api/investor/projects/${id}/image`,
  owner: (id) => `/api/projects/${id}/image`,
  admin: (id) => `/api/admin/projects/${id}/image`,
};
// The version changes whenever the image does, so browsers never show a stale one.
function projectImageUrl(p, scope) {
  if (!p.imageKey || (scope === 'public' && !isImagePublic(p))) return null;
  return `${IMAGE_ROUTE[scope](p.id)}?v=${crypto.createHash('sha256').update(p.imageKey).digest('hex').slice(0, 12)}`;
}

function publicProject(p) {
  return {
    id: p.id,
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
    imageUrl: projectImageUrl(p, 'public'),
    founder: p.owner
      ? {
          name: p.owner.fullName,
          cohortYear: p.owner.graduateProfile?.cohortYear ?? null,
          program: p.owner.graduateProfile?.program ?? null,
          // Anonymous visitors see initials: the public image is for signed-in
          // investors and sponsors only, and the account photo is private.
          photoUrl: null,
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
    // Other founders' codes are theirs to share, so matches carry no code.
    similarityMatches: (p.similarityMatches || []).map(({ title, sector, score }) => ({
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
    imageUrl: projectImageUrl(p, 'owner'),
    documents: (p.documents || []).map(documentSummary),
    funding: p.fundingSource ? { source: p.fundingSource, name: p.fundingName, amount: p.fundingAmount === null ? null : Number(p.fundingAmount), currency: p.fundingCurrency } : null,
    competitionResults: (p.competitionResults || []).map((r) => serializeResult(r)),
  };
}

module.exports = { publicProject, ownerProject, documentSummary, projectImageUrl, isImagePublic };
