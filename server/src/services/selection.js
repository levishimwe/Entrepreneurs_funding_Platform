// Automatic selection for an opportunity, built only on what staff set on the
// opportunity form and what an applicant's approved project records:
//   1. eligibility per criterion (sectors, project type, stage, graduating
//      cohort range; an empty criterion accepts everyone);
//   2. not eligible → Not selected, with the reason in plain words;
//   3. eligible and within the number of places (or no limit) → Selected;
//   4. eligible but more applicants than places → the earliest applications
//      fill the places; the rest are "Over capacity, staff decision needed"
//      and are never rejected automatically.
// The motivation text is shown to staff but never scored or judged.
// Applications already decided (Selected or Not selected, including manual
// overrides) are never changed by a run; Selected ones take up places.
const { Op } = require('sequelize');
const env = require('../config/env');
const { sequelize, Application, Project, User, GraduateProfile } = require('../models');
const { enqueueEmail } = require('./mailer');
const audit = require('./audit');

const OPEN = ['submitted', 'shortlisted'];
const TYPE_LABEL = { idea: 'Idea stage', company: 'Registered company' };

/** One line per criterion: passed or failed, in plain words. */
function criteriaChecks(opportunity, project, applicant) {
  const c = opportunity.criteria || {};
  const cohort = applicant.graduateProfile?.cohortYear || null;
  const checks = [];
  checks.push(
    c.sectors?.length
      ? { id: 'sector', label: 'Sector', passed: c.sectors.includes(project.sector), detail: c.sectors.includes(project.sector) ? `${project.sector} is one of the chosen sectors.` : 'Sector does not match this opportunity.' }
      : { id: 'sector', label: 'Sector', passed: true, detail: 'All sectors accepted.' }
  );
  checks.push(
    c.projectTypes?.length
      ? {
          id: 'type',
          label: 'Project type',
          passed: c.projectTypes.includes(project.type),
          detail: c.projectTypes.includes(project.type) ? `${TYPE_LABEL[project.type]} is accepted.` : `Project type does not match this opportunity (open to ${c.projectTypes.map((t) => TYPE_LABEL[t].toLowerCase()).join(' and ')} only).`,
        }
      : { id: 'type', label: 'Project type', passed: true, detail: 'All project types accepted.' }
  );
  checks.push(
    c.stages?.length
      ? { id: 'stage', label: 'Stage', passed: c.stages.includes(project.stage), detail: c.stages.includes(project.stage) ? `${project.stage} is one of the chosen stages.` : 'Stage does not match this opportunity.' }
      : { id: 'stage', label: 'Stage', passed: true, detail: 'All stages accepted.' }
  );
  const min = c.minCohortYear || null;
  const max = c.maxCohortYear || null;
  if (!min && !max) checks.push({ id: 'cohort', label: 'Graduating cohort', passed: true, detail: 'All cohorts accepted.' });
  else {
    const passed = Boolean(cohort) && (!min || cohort >= min) && (!max || cohort <= max);
    const range = min && max ? `${min} to ${max}` : min ? `${min} onwards` : `up to ${max}`;
    checks.push({
      id: 'cohort',
      label: 'Graduating cohort',
      passed,
      detail: passed ? `Class of ${cohort} is within ${range}.` : cohort ? `Graduating cohort ${cohort} is outside ${range}.` : `No graduating cohort recorded (open to ${range}).`,
    });
  }
  return checks;
}

const PROPOSED_LABEL = { selected: 'Selected', not_selected: 'Not selected', over_capacity: 'Over capacity, staff decision needed', decided: 'Already decided' };

function selectedNote(rank, capacity) {
  return capacity
    ? `Meets every eligibility criterion for this opportunity and applied in time for one of the ${capacity} places (position ${rank} by application time).`
    : 'Meets every eligibility criterion for this opportunity.';
}

async function loadApplications(opportunityId) {
  return Application.findAll({
    where: { opportunityId },
    include: [
      { model: Project, as: 'project' },
      { model: User, as: 'applicant', attributes: ['id', 'fullName', 'email'], include: [{ model: GraduateProfile, as: 'graduateProfile', attributes: ['cohortYear', 'program'] }] },
    ],
    order: [
      ['submittedAt', 'ASC'],
      ['id', 'ASC'],
    ],
  });
}

/** The proposal for every application. Changes nothing. */
async function previewSelection(opportunity) {
  const applications = await loadApplications(opportunity.id);
  const capacity = opportunity.capacity || null;
  const alreadySelected = applications.filter((a) => a.status === 'selected').length;
  const placesLeft = capacity === null ? null : Math.max(0, capacity - alreadySelected);

  const rows = applications.map((a) => {
    const checks = criteriaChecks(opportunity, a.project, a.applicant);
    return { a, checks, eligible: checks.every((c) => c.passed), open: OPEN.includes(a.status) };
  });
  const eligibleOpen = rows.filter((r) => r.open && r.eligible); // already in application-time order
  const fits = placesLeft === null || eligibleOpen.length <= placesLeft;

  let rank = alreadySelected;
  for (const r of rows) {
    if (!r.open) {
      r.proposed = 'decided';
      r.reason = `Already ${r.a.status === 'selected' ? 'selected' : 'not selected'}; a run never changes it.`;
    } else if (!r.eligible) {
      r.proposed = 'not_selected';
      r.reason = r.checks.filter((c) => !c.passed).map((c) => c.detail).join(' ');
    } else if (fits || rank < capacity) {
      rank += 1;
      r.rank = rank;
      r.proposed = 'selected';
      r.reason = selectedNote(rank, capacity);
    } else {
      r.proposed = 'over_capacity';
      r.reason = `Eligible, but all ${capacity} places are filled by earlier applications. Staff decision needed.`;
    }
  }
  const counts = { selected: 0, not_selected: 0, over_capacity: 0, decided: 0 };
  rows.forEach((r) => (counts[r.proposed] += 1));
  return {
    capacity,
    alreadySelected,
    placesLeft,
    counts,
    rows: rows.map((r) => ({
      applicationId: r.a.id,
      status: r.a.status,
      submittedAt: r.a.submittedAt,
      applicant: { id: r.a.applicant.id, name: r.a.applicant.fullName, cohortYear: r.a.applicant.graduateProfile?.cohortYear || null },
      project: { id: r.a.project.id, title: r.a.project.title, sector: r.a.project.sector, stage: r.a.project.stage, type: r.a.project.type },
      checks: r.checks,
      eligible: r.eligible,
      proposed: r.proposed,
      proposedLabel: PROPOSED_LABEL[r.proposed],
      reason: r.reason,
      rank: r.rank || null,
      motivation: r.a.motivation,
    })),
  };
}

// Decision emails (also used by the manual decision route). Each is queued
// once per application and decision: the event key repeats on a re-run.
const DECISION_EMAIL = {
  shortlisted: (o, a) => ({
    subject: `Shortlisted: ${o.title}`,
    paragraphs: [`Good news — your project "${a.project.title}" has been shortlisted for ${o.title}.`, `Note from the ALU team: ${a.decisionNote}`, 'We will contact you with the next steps.'],
  }),
  selected: (o, a) => ({
    subject: `Selected: ${o.title}`,
    paragraphs: [
      `Congratulations — your project "${a.project.title}" has been selected for ${o.title}.`,
      `Note from the ALU team: ${a.decisionNote}`,
      o.applicationInstructions ? `Next steps: ${o.applicationInstructions}` : 'The ALU team will contact you with the next steps.',
    ],
  }),
  not_selected: (o, a) => ({
    subject: `Update on your application: ${o.title}`,
    paragraphs: [`Thank you for applying to ${o.title} with "${a.project.title}". Your application was not selected this time.`, `Feedback: ${a.decisionNote}`],
  }),
};

function queueDecisionEmail(opportunity, application, decision, { eventKey, correction = false } = {}) {
  const mail = DECISION_EMAIL[decision](opportunity, application);
  return enqueueEmail({
    eventKey: eventKey || `application-${decision}:${application.id}:${application.applicant.id}`,
    to: application.applicant.email,
    recipientId: application.applicant.id,
    applicationId: application.id,
    subject: correction ? `Correction: ${mail.subject}` : mail.subject,
    paragraphs: [
      `Hello ${application.applicant.fullName},`,
      ...(correction ? ['The ALU team has corrected the result of your application. This replaces the earlier result.'] : []),
      ...mail.paragraphs,
    ],
    cta: { label: 'View your applications', url: `${env.clientUrl}/app/opportunities` },
  });
}

/**
 * Applies the proposal. `choices` lets staff pick among eligible open
 * applicants ({ [applicationId]: 'selected' | 'over_capacity' }); ineligible
 * applicants can only be changed later with an override and a reason.
 * Only applications still undecided are touched, so confirming twice changes
 * nothing and queues nothing new.
 */
async function confirmSelection(opportunity, actor, { choices = {} } = {}) {
  const preview = await previewSelection(opportunity);
  const now = new Date();
  const applied = [];
  await sequelize.transaction(async (transaction) => {
    for (const row of preview.rows) {
      if (row.proposed === 'decided') continue;
      let result = row.proposed;
      const choice = choices[row.applicationId];
      if (row.eligible && (choice === 'selected' || choice === 'over_capacity')) result = choice;
      if (result === 'over_capacity') continue; // stays undecided, flagged for staff
      const note = result === 'selected' ? (row.proposed === 'selected' ? row.reason : 'Meets every eligibility criterion; chosen by staff from the applicants over capacity.') : row.reason;
      const [count] = await Application.update(
        { status: result, decisionNote: note, decidedBy: actor.id, decidedAt: now },
        { where: { id: row.applicationId, status: { [Op.in]: OPEN } }, transaction }
      );
      if (!count) continue;
      applied.push({ id: row.applicationId, result });
      await audit.record(
        {
          actorId: actor.id,
          action: `application.${result}`,
          entityType: 'application',
          entityId: row.applicationId,
          reason: note,
          metadata: {
            opportunityId: opportunity.id,
            projectId: row.project.id,
            automatic: row.proposed === result,
            chosenByStaff: row.proposed !== result,
            checks: row.checks.map((c) => ({ id: c.id, passed: c.passed })),
            notified: true,
          },
        },
        { transaction }
      );
    }
    await audit.record(
      {
        actorId: actor.id,
        action: 'opportunity.selection_confirmed',
        entityType: 'opportunity',
        entityId: opportunity.id,
        metadata: {
          capacity: preview.capacity,
          selected: applied.filter((x) => x.result === 'selected').length,
          notSelected: applied.filter((x) => x.result === 'not_selected').length,
          overCapacity: preview.rows.filter((r) => r.proposed === 'over_capacity' && choices[r.applicationId] !== 'selected').length,
        },
      },
      { transaction }
    );
  });

  // Emails after the decisions are stored; the event key keeps each one single.
  if (applied.length) {
    const rows = await Application.findAll({
      where: { id: applied.map((x) => x.id) },
      include: [
        { model: Project, as: 'project', attributes: ['id', 'title'] },
        { model: User, as: 'applicant', attributes: ['id', 'fullName', 'email'] },
      ],
    });
    for (const a of rows) await queueDecisionEmail(opportunity, a, a.status);
  }
  return { applied, preview: await previewSelection(opportunity) };
}

module.exports = { OPEN, criteriaChecks, previewSelection, confirmSelection, queueDecisionEmail, DECISION_EMAIL, PROPOSED_LABEL };
