// Initial schema — mirrors the two ERD views in docs/proposal.md (Figures 3 and 4)
// plus the supporting tables the proposal mentions but omits from the diagrams
// (authentication tokens, sector keyword map, platform settings).
const { DataTypes } = require('sequelize');

const id = () => ({ type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true });
const fk = (table, column, allowNull = false) => ({
  type: DataTypes.BIGINT.UNSIGNED,
  allowNull,
  references: { model: table, key: column },
  onUpdate: 'CASCADE',
  onDelete: 'RESTRICT',
});
const timestamps = () => ({
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
});

const PROJECT_STATUSES = [
  'pending_review',
  'revision_required',
  'similarity_flagged',
  'approved',
  'funded',
  'investor_limit_reached',
  'rejected',
  'archived',
];

module.exports = {
  PROJECT_STATUSES,

  async up({ context: qi }) {
    await qi.createTable('users', {
      id: id(),
      email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(255), allowNull: false },
      full_name: { type: DataTypes.STRING(150), allowNull: false },
      role: { type: DataTypes.ENUM('graduate', 'investor', 'admin', 'staff'), allowNull: false },
      status: {
        type: DataTypes.ENUM('pending_email', 'pending_review', 'active', 'rejected', 'suspended'),
        allowNull: false,
        defaultValue: 'pending_email',
      },
      email_verified_at: { type: DataTypes.DATE, allowNull: true },
      theme: { type: DataTypes.ENUM('light', 'dark', 'system'), allowNull: false, defaultValue: 'light' },
      // Incremented on password change to invalidate every existing session (FR12, NFR02).
      token_version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      photo_key: { type: DataTypes.STRING(255), allowNull: true },
      ...timestamps(),
    });

    await qi.createTable('graduate_profiles', {
      user_id: { ...fk('users', 'id'), primaryKey: true },
      cohort_year: { type: DataTypes.SMALLINT.UNSIGNED, allowNull: true },
      program: { type: DataTypes.STRING(150), allowNull: true },
      verification_status: {
        type: DataTypes.ENUM('pending_review', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending_review',
      },
      bio: { type: DataTypes.TEXT, allowNull: true },
      ...timestamps(),
    });

    await qi.createTable('investor_profiles', {
      user_id: { ...fk('users', 'id'), primaryKey: true },
      investor_type: { type: DataTypes.ENUM('investor', 'sponsor'), allowNull: false, defaultValue: 'investor' },
      organisation: { type: DataTypes.STRING(150), allowNull: false },
      website: { type: DataTypes.STRING(255), allowNull: true },
      sectors: { type: DataTypes.JSON, allowNull: true },
      bio: { type: DataTypes.TEXT, allowNull: true },
      ...timestamps(),
    });

    await qi.createTable('projects', {
      id: id(),
      owner_id: fk('users', 'id'),
      project_code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
      title: { type: DataTypes.STRING(200), allowNull: false },
      type: { type: DataTypes.ENUM('idea', 'company'), allowNull: false },
      sector: { type: DataTypes.STRING(80), allowNull: false },
      suggested_sector: { type: DataTypes.STRING(80), allowNull: true },
      stage: { type: DataTypes.STRING(60), allowNull: false },
      company_name: { type: DataTypes.STRING(200), allowNull: true },
      company_number: { type: DataTypes.STRING(60), allowNull: true, unique: true },
      relationship_to_company: { type: DataTypes.STRING(120), allowNull: true },
      idea_declaration: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      summary: { type: DataTypes.STRING(500), allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: false },
      funding_sought: { type: DataTypes.STRING(120), allowNull: true },
      publication_consent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: DataTypes.ENUM(...PROJECT_STATUSES), allowNull: false, defaultValue: 'pending_review' },
      // Status to return to when an archived record is restored.
      status_before_archive: { type: DataTypes.ENUM(...PROJECT_STATUSES), allowNull: true },
      similarity_status: {
        type: DataTypes.ENUM('none', 'flagged', 'clarified', 'cleared'),
        allowNull: false,
        defaultValue: 'none',
      },
      similarity_score: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      similarity_matches: { type: DataTypes.JSON, allowNull: true },
      clarification_requested_at: { type: DataTypes.DATE, allowNull: true },
      clarification_text: { type: DataTypes.TEXT, allowNull: true },
      clarification_submitted_at: { type: DataTypes.DATE, allowNull: true },
      review_note: { type: DataTypes.TEXT, allowNull: true },
      submitted_at: { type: DataTypes.DATE, allowNull: true },
      approved_at: { type: DataTypes.DATE, allowNull: true },
      closed_at: { type: DataTypes.DATE, allowNull: true },
      ...timestamps(),
    });
    await qi.addIndex('projects', ['status']);
    await qi.addIndex('projects', ['owner_id']);

    await qi.createTable('documents', {
      id: id(),
      uploader_id: fk('users', 'id'),
      // Null for account-level evidence such as the degree certificate.
      project_id: fk('projects', 'id', true),
      kind: {
        type: DataTypes.ENUM(
          'degree_certificate',
          'rdb_certificate',
          'revenue_document',
          'rra_certificate',
          'supporting_document'
        ),
        allowNull: false,
      },
      storage_key: { type: DataTypes.STRING(255), allowNull: false },
      original_name: { type: DataTypes.STRING(255), allowNull: false },
      mime_type: { type: DataTypes.STRING(60), allowNull: false },
      size_bytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
      extraction_json: { type: DataTypes.JSON, allowNull: true },
      // Preliminary OCR flag — never a final decision.
      flag: { type: DataTypes.ENUM('likely_valid', 'suspicious'), allowNull: true },
      status: {
        type: DataTypes.ENUM('processing', 'processed', 'failed'),
        allowNull: false,
        defaultValue: 'processing',
      },
      ...timestamps(),
    });

    // MySQL forbids CHECK constraints on columns with FK referential actions
    // (including ON UPDATE CASCADE), so the review target FKs use RESTRICT.
    const targetFk = (table) => ({ ...fk(table, 'id', true), onUpdate: 'RESTRICT' });
    await qi.createTable('reviews', {
      id: id(),
      reviewer_id: fk('users', 'id'),
      subject_user_id: targetFk('users'),
      project_id: targetFk('projects'),
      document_id: targetFk('documents'),
      decision: {
        type: DataTypes.ENUM(
          'approve',
          'reject',
          'request_revision',
          'clear_similarity',
          'request_document',
          'mark_funded',
          'archive',
          'restore',
          'publish',
          'close'
        ),
        allowNull: false,
      },
      reason: { type: DataTypes.TEXT, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    // "A review references exactly one user, project or document, enforced by a constraint."
    await qi.sequelize.query(
      'ALTER TABLE reviews ADD CONSTRAINT reviews_exactly_one_target CHECK (' +
        '(subject_user_id IS NOT NULL) + (project_id IS NOT NULL) + (document_id IS NOT NULL) = 1)'
    );

    await qi.createTable('introductions', {
      id: id(),
      project_id: fk('projects', 'id'),
      investor_id: fk('users', 'id'),
      status: {
        type: DataTypes.ENUM('requested', 'accepted', 'declined'),
        allowNull: false,
        defaultValue: 'requested',
      },
      message: { type: DataTypes.TEXT, allowNull: true },
      accepted_at: { type: DataTypes.DATE, allowNull: true },
      declined_at: { type: DataTypes.DATE, allowNull: true },
      // Confirmed follow-up meeting, recorded separately by each party.
      investor_confirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      graduate_confirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Confirmed investment outcome — separate from the introduction itself (FR07, FR13).
      investment_investor_confirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      investment_graduate_confirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      investment_recorded_at: { type: DataTypes.DATE, allowNull: true },
      investment_recorded_by: fk('users', 'id', true),
      ...timestamps(),
    });
    await qi.addConstraint('introductions', {
      fields: ['investor_id', 'project_id'],
      type: 'unique',
      name: 'introductions_investor_project_uq',
    });

    await qi.createTable('opportunities', {
      id: id(),
      created_by: fk('users', 'id'),
      title: { type: DataTypes.STRING(200), allowNull: false },
      type: { type: DataTypes.ENUM('hackathon', 'grant', 'competition', 'other'), allowNull: false },
      organiser: { type: DataTypes.STRING(150), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: false },
      // { sectors: [], projectTypes: [], stages: [], cohortYears: [], notes: "" }
      criteria: { type: DataTypes.JSON, allowNull: false },
      application_instructions: { type: DataTypes.TEXT, allowNull: true },
      prize: { type: DataTypes.STRING(150), allowNull: true },
      deadline: { type: DataTypes.DATE, allowNull: false },
      status: {
        type: DataTypes.ENUM('pending_review', 'published', 'closed', 'archived'),
        allowNull: false,
        defaultValue: 'pending_review',
      },
      published_at: { type: DataTypes.DATE, allowNull: true },
      ...timestamps(),
    });

    await qi.createTable('applications', {
      id: id(),
      project_id: fk('projects', 'id'),
      opportunity_id: fk('opportunities', 'id'),
      applicant_id: fk('users', 'id'),
      decided_by: fk('users', 'id', true),
      status: {
        type: DataTypes.ENUM('submitted', 'shortlisted', 'selected', 'not_selected'),
        allowNull: false,
        defaultValue: 'submitted',
      },
      motivation: { type: DataTypes.TEXT, allowNull: true },
      decision_note: { type: DataTypes.TEXT, allowNull: true },
      submitted_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      decided_at: { type: DataTypes.DATE, allowNull: true },
      ...timestamps(),
    });
    await qi.addConstraint('applications', {
      fields: ['project_id', 'opportunity_id'],
      type: 'unique',
      name: 'applications_project_opportunity_uq',
    });

    // Persistent email outbox with retry status (FR10).
    await qi.createTable('notifications', {
      id: id(),
      recipient_id: fk('users', 'id', true),
      introduction_id: fk('introductions', 'id', true),
      application_id: fk('applications', 'id', true),
      event_key: { type: DataTypes.STRING(191), allowNull: false, unique: true },
      to_email: { type: DataTypes.STRING(254), allowNull: false },
      subject: { type: DataTypes.STRING(255), allowNull: false },
      body_text: { type: DataTypes.TEXT, allowNull: false },
      body_html: { type: DataTypes.TEXT, allowNull: true },
      status: { type: DataTypes.ENUM('pending', 'sent', 'failed'), allowNull: false, defaultValue: 'pending' },
      attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      next_attempt_at: { type: DataTypes.DATE, allowNull: true },
      last_error: { type: DataTypes.TEXT, allowNull: true },
      preview_url: { type: DataTypes.STRING(255), allowNull: true },
      sent_at: { type: DataTypes.DATE, allowNull: true },
      read_at: { type: DataTypes.DATE, allowNull: true },
      ...timestamps(),
    });
    await qi.addIndex('notifications', ['status', 'next_attempt_at']);

    await qi.createTable('audit_logs', {
      id: id(),
      actor_id: fk('users', 'id', true),
      action: { type: DataTypes.STRING(80), allowNull: false },
      entity_type: { type: DataTypes.STRING(40), allowNull: false },
      entity_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
      reason: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.JSON, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await qi.addIndex('audit_logs', ['entity_type', 'entity_id']);

    // Supporting table omitted from the ERD: hashed OTP / reset codes.
    await qi.createTable('auth_tokens', {
      id: id(),
      user_id: fk('users', 'id'),
      purpose: { type: DataTypes.ENUM('email_verification', 'password_reset'), allowNull: false },
      code_hash: { type: DataTypes.STRING(255), allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      used_at: { type: DataTypes.DATE, allowNull: true },
      created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await qi.addIndex('auth_tokens', ['user_id', 'purpose']);

    // Administrator-maintained keyword map for rule-based sector suggestion (FR15).
    await qi.createTable('sector_keywords', {
      id: id(),
      sector: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      keywords: { type: DataTypes.JSON, allowNull: false },
      ...timestamps(),
    });

    // Configuration data such as the similarity threshold (FR16).
    await qi.createTable('settings', {
      key: { type: DataTypes.STRING(80), primaryKey: true },
      value: { type: DataTypes.JSON, allowNull: false },
      updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
  },

  async down({ context: qi }) {
    for (const table of [
      'settings',
      'sector_keywords',
      'auth_tokens',
      'audit_logs',
      'notifications',
      'applications',
      'opportunities',
      'introductions',
      'reviews',
      'documents',
      'projects',
      'investor_profiles',
      'graduate_profiles',
      'users',
    ]) {
      await qi.dropTable(table);
    }
  },
};
