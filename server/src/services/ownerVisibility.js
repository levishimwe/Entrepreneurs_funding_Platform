// Which archived projects leave their owner's pages.
//
// An administrator archives a project (for example after the owner asked for
// it to be removed). Nothing is deleted. The project disappears from the
// owner's "My projects", counts and activity summaries when it never had any
// investor or funding history:
//   - no introduction (requested, accepted or declined) on the project,
//   - no approved competition result,
//   - no funding recorded (funding_source), and it was not Fully Funded or at
//     the investor limit before it was archived.
// A project with any of that history stays visible to its owner with the
// "Archived" status, so introductions and funding are never hidden silently.
// Administrators always see every archived project (Projects → Archived) and
// can restore it.
const { Project, Introduction, CompetitionResult } = require('../models');

const FUNDED_BEFORE = ['funded', 'investor_limit_reached'];

/** Ids of the owner's archived projects that are hidden from the owner. */
async function hiddenArchivedIds(ownerId) {
  const archived = await Project.findAll({
    where: { ownerId, status: 'archived' },
    attributes: ['id', 'statusBeforeArchive', 'fundingSource'],
  });
  if (!archived.length) return [];
  const ids = archived.map((p) => p.id);
  const [intros, results] = await Promise.all([
    Introduction.findAll({ where: { projectId: ids }, attributes: ['projectId'] }),
    CompetitionResult.findAll({ where: { projectId: ids, status: 'approved' }, attributes: ['projectId'] }),
  ]);
  const withHistory = new Set([...intros, ...results].map((r) => r.projectId));
  return archived
    .filter((p) => !withHistory.has(p.id) && !p.fundingSource && !FUNDED_BEFORE.includes(p.statusBeforeArchive))
    .map((p) => p.id);
}

module.exports = { hiddenArchivedIds };
