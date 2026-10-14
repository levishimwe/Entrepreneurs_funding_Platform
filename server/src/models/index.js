// Sequelize models for the schema created in src/migrations. Migrations own the
// DDL; these definitions only describe the tables to the ORM (never sync()).
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { PROJECT_STATUSES } = require('../migrations/20261002-001-initial-schema');

const ID = { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true };
const REF = { type: DataTypes.BIGINT.UNSIGNED };

const User = sequelize.define(
  'User',
  {
    id: ID,
    email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false, field: 'password_hash' },
    fullName: { type: DataTypes.STRING(150), allowNull: false, field: 'full_name' },
    phone: { type: DataTypes.STRING(20) },
    role: { type: DataTypes.ENUM('graduate', 'investor', 'admin', 'staff'), allowNull: false },
    status: {
      type: DataTypes.ENUM('pending_email', 'pending_review', 'active', 'rejected', 'suspended'),
      defaultValue: 'pending_email',
    },
    emailVerifiedAt: { type: DataTypes.DATE, field: 'email_verified_at' },
    theme: { type: DataTypes.ENUM('light', 'dark', 'system'), defaultValue: 'light' },
    tokenVersion: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0, field: 'token_version' },
    photoKey: { type: DataTypes.STRING(255), field: 'photo_key' },
  },
  { tableName: 'users' }
);

const GraduateProfile = sequelize.define(
  'GraduateProfile',
  {
    userId: { ...REF, primaryKey: true, field: 'user_id' },
    cohortYear: { type: DataTypes.SMALLINT.UNSIGNED, field: 'cohort_year' },
    program: DataTypes.STRING(150),
    verificationStatus: {
      type: DataTypes.ENUM('pending_review', 'approved', 'rejected'),
      defaultValue: 'pending_review',
      field: 'verification_status',
    },
    bio: DataTypes.TEXT,
  },
  { tableName: 'graduate_profiles' }
);

const InvestorProfile = sequelize.define(
  'InvestorProfile',
  {
    userId: { ...REF, primaryKey: true, field: 'user_id' },
    investorType: {
      type: DataTypes.ENUM('investor', 'sponsor'),
      defaultValue: 'investor',
      field: 'investor_type',
    },
    organisation: { type: DataTypes.STRING(150), allowNull: false },
    website: DataTypes.STRING(255),
    sectors: DataTypes.JSON,
    bio: DataTypes.TEXT,
  },
  { tableName: 'investor_profiles' }
);

const Project = sequelize.define(
  'Project',
  {
    id: ID,
    ownerId: { ...REF, allowNull: false, field: 'owner_id' },
    projectCode: { type: DataTypes.STRING(20), allowNull: false, unique: true, field: 'project_code' },
    title: { type: DataTypes.STRING(200), allowNull: false },
    type: { type: DataTypes.ENUM('idea', 'company'), allowNull: false },
    sector: { type: DataTypes.STRING(80), allowNull: false },
    suggestedSector: { type: DataTypes.STRING(80), field: 'suggested_sector' },
    stage: { type: DataTypes.STRING(60), allowNull: false },
    country: { type: DataTypes.STRING(60), allowNull: false, defaultValue: 'Rwanda' },
    companyName: { type: DataTypes.STRING(200), field: 'company_name' },
    companyNumber: { type: DataTypes.STRING(60), unique: true, field: 'company_number' },
    relationshipToCompany: { type: DataTypes.STRING(120), field: 'relationship_to_company' },
    ideaDeclaration: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'idea_declaration' },
    summary: { type: DataTypes.STRING(500), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    fundingSought: { type: DataTypes.STRING(120), field: 'funding_sought' },
    publicationConsent: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'publication_consent' },
    status: { type: DataTypes.ENUM(...PROJECT_STATUSES), defaultValue: 'pending_review' },
    statusBeforeArchive: { type: DataTypes.ENUM(...PROJECT_STATUSES), field: 'status_before_archive' },
    similarityStatus: {
      type: DataTypes.ENUM('none', 'flagged', 'clarified', 'cleared'),
      defaultValue: 'none',
      field: 'similarity_status',
    },
    similarityScore: { type: DataTypes.DECIMAL(5, 2), field: 'similarity_score' },
    similarityMatches: { type: DataTypes.JSON, field: 'similarity_matches' },
    clarificationRequestedAt: { type: DataTypes.DATE, field: 'clarification_requested_at' },
    clarificationText: { type: DataTypes.TEXT, field: 'clarification_text' },
    clarificationSubmittedAt: { type: DataTypes.DATE, field: 'clarification_submitted_at' },
    reviewNote: { type: DataTypes.TEXT, field: 'review_note' },
    submittedAt: { type: DataTypes.DATE, field: 'submitted_at' },
    approvedAt: { type: DataTypes.DATE, field: 'approved_at' },
    closedAt: { type: DataTypes.DATE, field: 'closed_at' },
  },
  { tableName: 'projects' }
);

const Document = sequelize.define(
  'Document',
  {
    id: ID,
    uploaderId: { ...REF, allowNull: false, field: 'uploader_id' },
    projectId: { ...REF, field: 'project_id' },
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
    storageKey: { type: DataTypes.STRING(255), allowNull: false, field: 'storage_key' },
    originalName: { type: DataTypes.STRING(255), allowNull: false, field: 'original_name' },
    mimeType: { type: DataTypes.STRING(60), allowNull: false, field: 'mime_type' },
    sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'size_bytes' },
    extractionJson: { type: DataTypes.JSON, field: 'extraction_json' },
    flag: DataTypes.ENUM('likely_valid', 'suspicious'),
    status: { type: DataTypes.ENUM('processing', 'processed', 'failed'), defaultValue: 'processing' },
  },
  { tableName: 'documents' }
);

const Review = sequelize.define(
  'Review',
  {
    id: ID,
    reviewerId: { ...REF, allowNull: false, field: 'reviewer_id' },
    subjectUserId: { ...REF, field: 'subject_user_id' },
    projectId: { ...REF, field: 'project_id' },
    documentId: { ...REF, field: 'document_id' },
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
    reason: DataTypes.TEXT,
  },
  { tableName: 'reviews', updatedAt: false }
);

const Introduction = sequelize.define(
  'Introduction',
  {
    id: ID,
    projectId: { ...REF, allowNull: false, field: 'project_id' },
    investorId: { ...REF, allowNull: false, field: 'investor_id' },
    status: { type: DataTypes.ENUM('requested', 'accepted', 'declined'), defaultValue: 'requested' },
    message: DataTypes.TEXT,
    acceptedAt: { type: DataTypes.DATE, field: 'accepted_at' },
    declinedAt: { type: DataTypes.DATE, field: 'declined_at' },
    investorConfirmed: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'investor_confirmed' },
    graduateConfirmed: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'graduate_confirmed' },
    investmentInvestorConfirmed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'investment_investor_confirmed',
    },
    investmentGraduateConfirmed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'investment_graduate_confirmed',
    },
    investmentRecordedAt: { type: DataTypes.DATE, field: 'investment_recorded_at' },
    investmentRecordedBy: { ...REF, field: 'investment_recorded_by' },
  },
  { tableName: 'introductions' }
);

const Opportunity = sequelize.define(
  'Opportunity',
  {
    id: ID,
    createdBy: { ...REF, allowNull: false, field: 'created_by' },
    title: { type: DataTypes.STRING(200), allowNull: false },
    type: { type: DataTypes.ENUM('hackathon', 'grant', 'competition', 'other'), allowNull: false },
    organiser: DataTypes.STRING(150),
    description: { type: DataTypes.TEXT, allowNull: false },
    criteria: { type: DataTypes.JSON, allowNull: false },
    applicationInstructions: { type: DataTypes.TEXT, field: 'application_instructions' },
    prize: DataTypes.STRING(150),
    deadline: { type: DataTypes.DATE, allowNull: false },
    status: {
      type: DataTypes.ENUM('pending_review', 'published', 'closed', 'archived'),
      defaultValue: 'pending_review',
    },
    publishedAt: { type: DataTypes.DATE, field: 'published_at' },
  },
  { tableName: 'opportunities' }
);

const Application = sequelize.define(
  'Application',
  {
    id: ID,
    projectId: { ...REF, allowNull: false, field: 'project_id' },
    opportunityId: { ...REF, allowNull: false, field: 'opportunity_id' },
    applicantId: { ...REF, allowNull: false, field: 'applicant_id' },
    decidedBy: { ...REF, field: 'decided_by' },
    status: {
      type: DataTypes.ENUM('submitted', 'shortlisted', 'selected', 'not_selected'),
      defaultValue: 'submitted',
    },
    motivation: DataTypes.TEXT,
    decisionNote: { type: DataTypes.TEXT, field: 'decision_note' },
    submittedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'submitted_at' },
    decidedAt: { type: DataTypes.DATE, field: 'decided_at' },
  },
  { tableName: 'applications' }
);

const Notification = sequelize.define(
  'Notification',
  {
    id: ID,
    recipientId: { ...REF, field: 'recipient_id' },
    introductionId: { ...REF, field: 'introduction_id' },
    applicationId: { ...REF, field: 'application_id' },
    eventKey: { type: DataTypes.STRING(191), allowNull: false, unique: true, field: 'event_key' },
    toEmail: { type: DataTypes.STRING(254), allowNull: false, field: 'to_email' },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    bodyText: { type: DataTypes.TEXT, allowNull: false, field: 'body_text' },
    bodyHtml: { type: DataTypes.TEXT, field: 'body_html' },
    status: { type: DataTypes.ENUM('pending', 'sent', 'failed'), defaultValue: 'pending' },
    attempts: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
    nextAttemptAt: { type: DataTypes.DATE, field: 'next_attempt_at' },
    lastError: { type: DataTypes.TEXT, field: 'last_error' },
    previewUrl: { type: DataTypes.STRING(255), field: 'preview_url' },
    sentAt: { type: DataTypes.DATE, field: 'sent_at' },
    readAt: { type: DataTypes.DATE, field: 'read_at' },
  },
  { tableName: 'notifications' }
);

const AuditLog = sequelize.define(
  'AuditLog',
  {
    id: ID,
    actorId: { ...REF, field: 'actor_id' },
    action: { type: DataTypes.STRING(80), allowNull: false },
    entityType: { type: DataTypes.STRING(40), allowNull: false, field: 'entity_type' },
    entityId: { ...REF, field: 'entity_id' },
    reason: DataTypes.TEXT,
    metadata: DataTypes.JSON,
  },
  { tableName: 'audit_logs', updatedAt: false }
);

const AuthToken = sequelize.define(
  'AuthToken',
  {
    id: ID,
    userId: { ...REF, allowNull: false, field: 'user_id' },
    purpose: { type: DataTypes.ENUM('email_verification', 'password_reset'), allowNull: false },
    codeHash: { type: DataTypes.STRING(255), allowNull: false, field: 'code_hash' },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
    attempts: { type: DataTypes.INTEGER.UNSIGNED, defaultValue: 0 },
    usedAt: { type: DataTypes.DATE, field: 'used_at' },
  },
  { tableName: 'auth_tokens', updatedAt: false }
);

const SectorKeyword = sequelize.define(
  'SectorKeyword',
  {
    id: ID,
    sector: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    keywords: { type: DataTypes.JSON, allowNull: false },
  },
  { tableName: 'sector_keywords' }
);

const Setting = sequelize.define(
  'Setting',
  {
    key: { type: DataTypes.STRING(80), primaryKey: true },
    value: { type: DataTypes.JSON, allowNull: false },
  },
  { tableName: 'settings', createdAt: false }
);

// --- Associations ---
User.hasOne(GraduateProfile, { foreignKey: 'userId', as: 'graduateProfile' });
GraduateProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasOne(InvestorProfile, { foreignKey: 'userId', as: 'investorProfile' });
InvestorProfile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasMany(Project, { foreignKey: 'ownerId', as: 'projects' });
Project.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

Project.hasMany(Document, { foreignKey: 'projectId', as: 'documents' });
Document.belongsTo(Project, { foreignKey: 'projectId', as: 'project' });
User.hasMany(Document, { foreignKey: 'uploaderId', as: 'documents' });
Document.belongsTo(User, { foreignKey: 'uploaderId', as: 'uploader' });

Review.belongsTo(User, { foreignKey: 'reviewerId', as: 'reviewer' });
Project.hasMany(Review, { foreignKey: 'projectId', as: 'reviews' });

Project.hasMany(Introduction, { foreignKey: 'projectId', as: 'introductions' });
Introduction.belongsTo(Project, { foreignKey: 'projectId', as: 'project' });
Introduction.belongsTo(User, { foreignKey: 'investorId', as: 'investor' });

Opportunity.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
Opportunity.hasMany(Application, { foreignKey: 'opportunityId', as: 'applications' });
Application.belongsTo(Opportunity, { foreignKey: 'opportunityId', as: 'opportunity' });
Application.belongsTo(Project, { foreignKey: 'projectId', as: 'project' });
Application.belongsTo(User, { foreignKey: 'applicantId', as: 'applicant' });
Application.belongsTo(User, { foreignKey: 'decidedBy', as: 'decider' });

AuditLog.belongsTo(User, { foreignKey: 'actorId', as: 'actor' });

module.exports = {
  sequelize,
  User,
  GraduateProfile,
  InvestorProfile,
  Project,
  Document,
  Review,
  Introduction,
  Opportunity,
  Application,
  Notification,
  AuditLog,
  AuthToken,
  SectorKeyword,
  Setting,
  PROJECT_STATUSES,
};
