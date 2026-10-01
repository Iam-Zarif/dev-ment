# 💻 Dev-ment — Developer Assessment Platform

A full-stack platform where recruiters design technical assessments, candidates apply and attempt exams, and receive AI-assisted evaluations.

---

## 📦 Submission Details

```
Project Name    : Developer Assessment Platform
Backend Repo    : https://github.com/Iam-Zarif/dev-ment
Live API        : https://dev-ment.vercel.app
API Docs        : https://github.com/Iam-Zarif/dev-ment/tree/main/docs/postman
Demo Video      : [Add your video link here]
Admin Email     : admin@mostofafatin.com
Admin Password  : admin@mostofafatin.com
```

---

## 📋 Project Overview

**Dev-ment** enables recruiters to create technical assessments and candidates to apply, attempt, and receive evaluated results through an automated, proctored platform.

**3 User Roles:**
- **Recruiter**: Create assessments, manage applications, evaluate submissions, purchase credits
- **Candidate**: Browse assessments, apply, attempt exams, view results
- **Admin**: Manage users, verify companies, grant credits, monitor platform

---

## 👤 Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@mostofafatin.com | admin@mostofafatin.com |
| **Recruiter** | recruiter@devment.com | *(Set during seed)* |
| **Candidate** | candidate@devment.com | *(Set during seed)* |

> Run `npm run seed` to populate demo data

---

## � API Documentation

**Postman Collections**: [docs/postman](docs/postman)  
**ERD**: [docs/database/devment-erd.sql](docs/database/devment-erd.sql)

**Available Endpoints:**
- `/auth/*` - Authentication & social login
- `/admin/*` - Admin operations
- `/recruiter/*` - Recruiter features
- `/candidate/*` - Candidate features
- `/assessment/*` - Assessment management
- `/application/*` - Application workflows
- `/evaluation/*` - Evaluation operations
- `/payment/*` - Payment processing
- `/profile/*` - User profile management

---

## �🔄 Main Business Flow

```
1. Recruiter creates Questions in Question Bank
    ↓
2. Recruiter creates Assessment (Draft)
    ↓
3. Recruiter attaches & reorders Questions
    ↓
4. Recruiter Publishes Assessment (1 credit consumed)
    ↓
5. Candidate browses & Applies (Status: APPLIED)
    ↓
6. Recruiter Shortlists Candidate (Status: SHORTLISTED)
    ↓
7. Recruiter Sends Invitation (BullMQ + Redis Queue → Email)
    ↓
8. Candidate Accepts Invitation (Status: INVITED → ACCEPTED)
    ↓
9. Candidate Starts Attempt (Status: IN_PROGRESS)
    ↓
10. Answers Auto-saved + Proctor Events Recorded
    ↓
11. Candidate Submits Attempt (Status: SUBMITTED)
    ↓
12. Evaluation:
    - MCQ: Automatic
    - Text/Code: Manual by Recruiter
    ↓
13. Recruiter Finalizes & Releases Result
    ↓
14. Candidate Views Released Result
```

---

## 📝 Assessment Draft Autosave API

The assessment builder supports incomplete draft persistence so the frontend can autosave while a recruiter is still filling out the form.

- `POST /api/v1/assessments/draft` — creates an incomplete draft; all assessment fields are optional.
- `PATCH /api/v1/assessments/:id/draft` — partially syncs draft fields. Use `saveMode: "AUTO"` for debounced autosave and `saveMode: "MANUAL"` for the explicit **Save Draft** button.
- `GET /api/v1/assessments/:id` — resumes the draft with questions and returns `publishReadiness`.
- `POST /api/v1/assessments/:id/publish` — publishes only when strict completeness checks pass; otherwise returns structured validation errors.

Autosave responses include `saveState` with `state`, `mode`, and `savedAt`, allowing the UI to show states such as **Saving...** and **Saved**. Automatic syncs do not create repetitive audit rows; manual saves are audited.

---

## 🛠️ Tech Stack

**Backend**
- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **ORM**: Prisma
- **Database**: PostgreSQL (Neon)
- **Queue**: BullMQ with Redis
- **Authentication**: JWT
- **Payment**: Stripe
- **Email**: Nodemailer
- **File Storage**: Cloudinary
- **Linting**: Biome
- **Testing**: Vitest

---

## 📦 Project Structure

```
src/
├── app/
│   ├── modules/          # Feature modules (admin, auth, assessment, etc.)
│   └── routes/           # API routes
├── config/               # Configuration files
├── lib/                  # External services (Prisma, Redis, Stripe, Email, etc.)
├── shared/               # Shared utilities, middlewares, types
├── seed/                 # Database seeders
├── jobs/                 # Scheduled jobs (attempt expiry, plan expiry)
└── templates/            # Email & assessment templates

prisma/
└── schema/               # Database schema files
```

---

## 🚀 Getting Started

### Installation
```bash
npm install
```

### Environment Setup
Copy `.env.example` to `.env` and configure:
- Database connection (PostgreSQL)
- Redis connection
- JWT secrets
- Third-party APIs (Google, Stripe, Cloudinary)
- Email credentials

### Development
```bash
# Start development server
npm run dev

# Run database migrations
npm run prisma:migrate

# Open Prisma Studio
npm run prisma:studio

# Lint & format code
npm run check
```

### Build & Deploy
```bash
# Build for production
npm run build

# Start production server
npm start
```