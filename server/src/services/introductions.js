// Consent-based introductions (FR07): an approved investor requests, the
// graduate accepts or declines, and only an accepted introduction shares
// contact details — through one email to each party.
const env = require('../config/env');
const { enqueueEmail } = require('./mailer');

function investorSummary(user) {
  const p = user?.investorProfile;
  return {
    id: user?.id,
    name: user?.fullName,
    organisation: p?.organisation || null,
    investorType: p?.investorType || 'investor',
    website: p?.website || null,
    sectors: p?.sectors || [],
  };
}

/** Shape for the graduate: investor contact details only after acceptance. */
function forGraduate(i) {
  const accepted = i.status === 'accepted';
  return {
    id: i.id,
    status: i.status,
    message: i.message,
    requestedAt: i.createdAt,
    acceptedAt: i.acceptedAt,
    declinedAt: i.declinedAt,
    project: i.project ? { id: i.project.id, title: i.project.title, projectCode: i.project.projectCode, status: i.project.status } : undefined,
    investor: { ...investorSummary(i.investor), email: accepted ? i.investor?.email : null, phone: accepted ? i.investor?.phone : null },
    meeting: { investor: i.investorConfirmed, graduate: i.graduateConfirmed },
    investment: { investor: i.investmentInvestorConfirmed, graduate: i.investmentGraduateConfirmed, recordedAt: i.investmentRecordedAt },
  };
}

/** Shape for the investor: founder contact details only after acceptance. */
function forInvestor(i) {
  const accepted = i.status === 'accepted';
  const owner = i.project?.owner;
  return {
    id: i.id,
    status: i.status,
    message: i.message,
    requestedAt: i.createdAt,
    acceptedAt: i.acceptedAt,
    declinedAt: i.declinedAt,
    project: i.project
      ? { projectCode: i.project.projectCode, title: i.project.title, sector: i.project.sector, stage: i.project.stage, status: i.project.status, summary: i.project.summary }
      : undefined,
    founder: owner ? { name: owner.fullName, email: accepted ? owner.email : null, phone: accepted ? owner.phone : null } : null,
    meeting: { investor: i.investorConfirmed, graduate: i.graduateConfirmed },
    investment: { investor: i.investmentInvestorConfirmed, graduate: i.investmentGraduateConfirmed, recordedAt: i.investmentRecordedAt },
  };
}

function requestEmail({ introduction, project, graduate, investor }) {
  const org = investor.investorProfile?.organisation;
  return enqueueEmail({
    eventKey: `introduction-requested:${introduction.id}:${graduate.id}`,
    to: graduate.email,
    recipientId: graduate.id,
    introductionId: introduction.id,
    subject: `Introduction request for ${project.title}`,
    paragraphs: [
      `Hello ${graduate.fullName},`,
      `${investor.fullName}${org ? ` (${org})` : ''}, an approved investor on ALU Ventures, would like an introduction to discuss "${project.title}" (${project.projectCode}).`,
      introduction.message ? `Their message: "${introduction.message}"` : 'They did not include a message.',
      'Your contact details are not shared unless you accept. You can accept or decline from your dashboard.',
    ],
    cta: { label: 'Review & respond', url: `${env.clientUrl}/app/introductions` },
  });
}

// The dual introduction: one email to each party, sent only after acceptance.
async function introductionEmails({ introduction, project, graduate, investor }) {
  const org = investor.investorProfile?.organisation;
  const contact = (name, email, phone) => [`Name: ${name}`, `Email: ${email}`, ...(phone ? [`Phone: ${phone}`] : [])].join(' · ');
  await enqueueEmail({
    eventKey: `introduction-accepted:${introduction.id}:${investor.id}`,
    to: investor.email,
    recipientId: investor.id,
    introductionId: introduction.id,
    subject: `Introduction: ${project.title} (${project.projectCode})`,
    paragraphs: [
      `Hello ${investor.fullName},`,
      `${graduate.fullName} accepted your introduction request for "${project.title}". You can now contact the founder directly.`,
      `Founder contact — ${contact(graduate.fullName, graduate.email, graduate.phone)}`,
      'An introduction is not an investment commitment. After you meet, you can each confirm the follow-up on the platform.',
    ],
    cta: { label: 'View introduction', url: `${env.clientUrl}/app/introductions` },
  });
  await enqueueEmail({
    eventKey: `introduction-accepted:${introduction.id}:${graduate.id}`,
    to: graduate.email,
    recipientId: graduate.id,
    introductionId: introduction.id,
    subject: `Introduction: ${investor.fullName}${org ? ` (${org})` : ''}`,
    paragraphs: [
      `Hello ${graduate.fullName},`,
      `You accepted an introduction with ${investor.fullName}${org ? ` of ${org}` : ''} about "${project.title}".`,
      `Investor contact — ${contact(investor.fullName, investor.email, investor.phone)}${investor.investorProfile?.website ? ` · ${investor.investorProfile.website}` : ''}`,
      'After you meet, confirm the follow-up on the platform. If an investment is agreed, both of you confirm it and the administrator records it.',
    ],
    cta: { label: 'View introduction', url: `${env.clientUrl}/app/introductions` },
  });
}

function declinedEmail({ introduction, project, investor }) {
  return enqueueEmail({
    eventKey: `introduction-declined:${introduction.id}:${investor.id}`,
    to: investor.email,
    recipientId: investor.id,
    introductionId: introduction.id,
    subject: `Introduction request update: ${project.title}`,
    paragraphs: [
      `Hello ${investor.fullName},`,
      `The founder of "${project.title}" (${project.projectCode}) has declined the introduction request. No contact details were shared.`,
      'You can continue browsing other approved ventures on ALU Ventures.',
    ],
    cta: { label: 'Browse projects', url: `${env.clientUrl}/app/discover` },
  });
}

module.exports = { forGraduate, forInvestor, investorSummary, requestEmail, introductionEmails, declinedEmail };
