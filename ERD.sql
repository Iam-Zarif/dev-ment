CREATE TABLE users (
    id UUID PRIMARY KEY,
    legal_name VARCHAR(150) NOT NULL,
    email VARCHAR(320) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    google_sub VARCHAR(255) UNIQUE,
    email_verified_at TIMESTAMPTZ,
    role VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    image_url TEXT,
    last_login_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE companies (
    id UUID PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    domain VARCHAR(255) NOT NULL UNIQUE,
    website_url TEXT,
    logo_url TEXT,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE candidate_profiles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    phone VARCHAR(30),
    headline VARCHAR(180),
    bio TEXT,
    experience_years NUMERIC(4,1),
    skills JSONB,
    github_url TEXT,
    linkedin_url TEXT,
    portfolio_url TEXT,
    resume_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE recruiter_profiles (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    job_title VARCHAR(150),
    phone VARCHAR(30),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pricing_plans (
    id UUID PRIMARY KEY,
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    assessment_credits INTEGER NOT NULL,
    validity_days INTEGER NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payments (
    id UUID PRIMARY KEY,
    recruiter_id UUID NOT NULL REFERENCES recruiter_profiles(id) ON DELETE RESTRICT,
    plan_id UUID NOT NULL REFERENCES pricing_plans(id) ON DELETE RESTRICT,
    amount NUMERIC(10,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    stripe_checkout_session_id VARCHAR(255) UNIQUE,
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255),
    idempotency_key UUID NOT NULL UNIQUE,
    paid_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stripe_webhook_events (
    id UUID PRIMARY KEY,
    stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    event_type VARCHAR(120) NOT NULL,
    object_id VARCHAR(255),
    status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
    error_message TEXT,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE credit_grants (
    id UUID PRIMARY KEY,
    recruiter_id UUID NOT NULL REFERENCES recruiter_profiles(id) ON DELETE RESTRICT,
    plan_id UUID REFERENCES pricing_plans(id) ON DELETE RESTRICT,
    payment_id UUID UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
    source VARCHAR(30) NOT NULL,
    total_credits INTEGER NOT NULL,
    remaining_credits INTEGER NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE assessments (
    id UUID PRIMARY KEY,
    recruiter_id UUID NOT NULL REFERENCES recruiter_profiles(id) ON DELETE RESTRICT,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    credit_grant_id UUID REFERENCES credit_grants(id) ON DELETE RESTRICT,
    title VARCHAR(220) NOT NULL,
    job_role VARCHAR(180) NOT NULL,
    description_html TEXT,
    instructions_html TEXT,
    skills JSONB,
    difficulty VARCHAR(30) NOT NULL DEFAULT 'INTERMEDIATE',
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    application_deadline TIMESTAMPTZ,
    opens_at TIMESTAMPTZ,
    closes_at TIMESTAMPTZ,
    duration_minutes INTEGER NOT NULL,
    pass_percentage NUMERIC(5,2) NOT NULL DEFAULT 50,
    suspicious_threshold INTEGER NOT NULL DEFAULT 3,
    credit_consumed_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE questions (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    created_by_recruiter_id UUID NOT NULL REFERENCES recruiter_profiles(id) ON DELETE RESTRICT,
    type VARCHAR(30) NOT NULL,
    content_html TEXT NOT NULL,
    difficulty VARCHAR(30) NOT NULL DEFAULT 'INTERMEDIATE',
    default_marks NUMERIC(7,2) NOT NULL,
    evaluation_rubric TEXT,
    selection_mode VARCHAR(30),
    allowed_languages JSONB,
    starter_code JSONB,
    time_limit_ms INTEGER,
    memory_limit_kb INTEGER,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE question_options (
    id UUID PRIMARY KEY,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    option_html TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (question_id, sort_order)
);

CREATE TABLE coding_test_cases (
    id UUID PRIMARY KEY,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    input_text TEXT,
    expected_output TEXT NOT NULL,
    is_hidden BOOLEAN NOT NULL DEFAULT TRUE,
    weight NUMERIC(7,2) NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (question_id, sort_order)
);

CREATE TABLE assessment_questions (
    id UUID PRIMARY KEY,
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
    sort_order INTEGER NOT NULL,
    marks NUMERIC(7,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (assessment_id, question_id),
    UNIQUE (assessment_id, sort_order)
);

CREATE TABLE applications (
    id UUID PRIMARY KEY,
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE RESTRICT,
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL DEFAULT 'APPLIED',
    cover_note TEXT,
    reviewed_by_recruiter_id UUID REFERENCES recruiter_profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (assessment_id, candidate_id)
);

CREATE TABLE invitations (
    id UUID PRIMARY KEY,
    application_id UUID NOT NULL UNIQUE REFERENCES applications(id) ON DELETE RESTRICT,
    invited_by_recruiter_id UUID NOT NULL REFERENCES recruiter_profiles(id) ON DELETE RESTRICT,
    token_hash CHAR(64) NOT NULL UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    expires_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE attempts (
    id UUID PRIMARY KEY,
    invitation_id UUID NOT NULL UNIQUE REFERENCES invitations(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL DEFAULT 'IN_PROGRESS',
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    is_suspicious BOOLEAN NOT NULL DEFAULT FALSE,
    tab_switch_count INTEGER NOT NULL DEFAULT 0,
    evaluation_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    total_score NUMERIC(10,2),
    percentage NUMERIC(5,2),
    passed BOOLEAN,
    final_feedback TEXT,
    finalized_by_recruiter_id UUID REFERENCES recruiter_profiles(id) ON DELETE SET NULL,
    finalized_at TIMESTAMPTZ,
    result_released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE answers (
    id UUID PRIMARY KEY,
    attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    assessment_question_id UUID NOT NULL REFERENCES assessment_questions(id) ON DELETE RESTRICT,
    answer_text TEXT,
    code_answer TEXT,
    language VARCHAR(60),
    execution_status VARCHAR(30),
    judge_token VARCHAR(255),
    passed_test_cases INTEGER,
    total_test_cases INTEGER,
    execution_time_ms INTEGER,
    execution_memory_kb INTEGER,
    execution_result JSONB,
    auto_score NUMERIC(7,2),
    ai_suggested_score NUMERIC(7,2),
    manual_score NUMERIC(7,2),
    final_score NUMERIC(7,2),
    ai_feedback JSONB,
    ai_model VARCHAR(120),
    recruiter_feedback TEXT,
    evaluated_by_recruiter_id UUID REFERENCES recruiter_profiles(id) ON DELETE SET NULL,
    evaluated_at TIMESTAMPTZ,
    last_saved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (attempt_id, assessment_question_id)
);

CREATE TABLE answer_selected_options (
    answer_id UUID NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
    option_id UUID NOT NULL REFERENCES question_options(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (answer_id, option_id)
);

CREATE TABLE proctor_events (
    id UUID PRIMARY KEY,
    attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    client_event_id UUID NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (attempt_id, client_event_id)
);

CREATE TABLE notification_logs (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notification_type VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80),
    entity_id UUID,
    dedupe_key VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    sent_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(120) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id UUID,
    metadata JSONB,
    ip_address VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role_status
ON users(role, status);

CREATE INDEX idx_users_created_at
ON users(created_at);

CREATE INDEX idx_companies_name
ON companies(name);

CREATE INDEX idx_recruiter_profiles_company
ON recruiter_profiles(company_id);

CREATE INDEX idx_payments_recruiter_status
ON payments(recruiter_id, status);

CREATE INDEX idx_payments_created_at
ON payments(created_at);

CREATE INDEX idx_stripe_webhook_events_payment
ON stripe_webhook_events(payment_id);

CREATE INDEX idx_stripe_webhook_events_status
ON stripe_webhook_events(status);

CREATE INDEX idx_credit_grants_recruiter
ON credit_grants(recruiter_id);

CREATE INDEX idx_credit_grants_recruiter_expiry
ON credit_grants(recruiter_id, expires_at);

CREATE INDEX idx_assessments_recruiter_status
ON assessments(recruiter_id, status);

CREATE INDEX idx_assessments_company_status
ON assessments(company_id, status);

CREATE INDEX idx_assessments_status_created
ON assessments(status, created_at);

CREATE INDEX idx_assessments_application_deadline
ON assessments(application_deadline);

CREATE INDEX idx_questions_company
ON questions(company_id);

CREATE INDEX idx_questions_company_type
ON questions(company_id, type);

CREATE INDEX idx_questions_creator
ON questions(created_by_recruiter_id);

CREATE INDEX idx_question_options_question
ON question_options(question_id);

CREATE INDEX idx_coding_test_cases_question
ON coding_test_cases(question_id);

CREATE INDEX idx_assessment_questions_assessment
ON assessment_questions(assessment_id);

CREATE INDEX idx_assessment_questions_question
ON assessment_questions(question_id);

CREATE INDEX idx_applications_assessment_status
ON applications(assessment_id, status);

CREATE INDEX idx_applications_candidate_status
ON applications(candidate_id, status);

CREATE INDEX idx_invitations_status_expiry
ON invitations(status, expires_at);

CREATE INDEX idx_attempts_status_expiry
ON attempts(status, expires_at);

CREATE INDEX idx_answers_attempt
ON answers(attempt_id);

CREATE INDEX idx_answers_evaluator
ON answers(evaluated_by_recruiter_id);

CREATE INDEX idx_proctor_events_attempt
ON proctor_events(attempt_id);

CREATE INDEX idx_proctor_events_attempt_time
ON proctor_events(attempt_id, occurred_at);

CREATE INDEX idx_notification_logs_user
ON notification_logs(user_id);

CREATE INDEX idx_notification_logs_status
ON notification_logs(status);

CREATE INDEX idx_audit_logs_actor
ON audit_logs(actor_user_id);

CREATE INDEX idx_audit_logs_entity
ON audit_logs(entity_type, entity_id);

CREATE INDEX idx_audit_logs_created_at
ON audit_logs(created_at);