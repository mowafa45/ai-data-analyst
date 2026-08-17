# AI Data Analyst

> Upload a spreadsheet. Chat with it. Get dashboards, forecasts, and business insights — automatically.

An AI-powered analytics platform that turns raw CSV/Excel files into an interactive data assistant: natural-language chat over your data, auto-generated dashboards, ML-based forecasting, and plain-English business insights.

**Stack:** Next.js 14 · TypeScript · FastAPI · Python 3.11 · PostgreSQL · Redis · Claude (Anthropic API)

<!-- Add a screenshot or short GIF of the app here — this is the first thing reviewers look at.
![App screenshot](docs/screenshot.png)
-->

---

## Features

| Feature | Description |
|---|---|
| **File Upload** | CSV, XLSX, XLS up to 100 MB with automatic column type detection |
| **AI Chat** | Conversational analytics over your dataset, powered by Claude, with session memory |
| **Auto Dashboard** | KPI cards, revenue charts, category breakdowns, and regional heatmaps generated without manual setup |
| **AI Insights** | Auto-generated, plain-English summaries of what's happening in the data |
| **Forecasting** | Time-series forecasting via Prophet, XGBoost, and Linear Regression, with confidence intervals |
| **Recommendations** | Actionable suggestions derived from detected patterns |
| **Export** | PDF reports, Excel summaries, and PNG chart exports |
| **Dark / Light Mode** | Full theme support across the UI |

## Architecture

```
┌─────────────────────────────────────┐
│  Next.js 14 Frontend (Vercel)        │
│  TypeScript · Tailwind · Recharts    │
│  shadcn/ui · Framer Motion           │
└────────────────┬──────────────────────┘
                  │ REST + SSE
┌────────────────▼──────────────────────┐
│  FastAPI Backend (Railway/Render)     │
│  Python 3.11 · Pandas · Polars        │
│  Scikit-learn · Prophet · XGBoost     │
└──────┬──────────────────┬───────────────┘
       │                  │
┌──────▼──────┐  ┌────────▼────────┐
│ PostgreSQL  │  │   Redis Cache   │
│ (sessions)  │  │  (datasets)     │
└─────────────┘  └─────────────────┘
```

## Project Structure

```
ai-data-analyst/
├── frontend/                 # Next.js 14 app
│   ├── src/
│   │   ├── app/               # App Router pages
│   │   ├── components/        # React components
│   │   │   ├── dashboard/     # Dashboard widgets
│   │   │   ├── chat/          # Chat interface
│   │   │   ├── upload/        # File upload
│   │   │   └── forecast/      # Forecasting views
│   │   ├── lib/                # Utilities & API client
│   │   └── types/              # TypeScript types
│   └── public/
├── backend/                  # FastAPI app
│   ├── main.py                 # Entry point
│   ├── routers/                # API route handlers
│   ├── services/                # Business logic
│   │   ├── data_service.py         # Data processing
│   │   ├── ai_service.py           # Claude integration
│   │   ├── forecast_service.py     # ML forecasting
│   │   └── insight_service.py      # Auto-insights
│   ├── models/                  # Pydantic schemas
│   └── utils/                    # Shared utilities
└── docker-compose.yml         # Local dev stack
```

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL 15+
- Redis 7+
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Clone the repo

```bash
git clone https://github.com/YOUR-USERNAME/ai-data-analyst.git
cd ai-data-analyst
```

### 2. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # then fill in your own values — see below
uvicorn main:app --reload --port 8000
```

### 3. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env.local    # then fill in your own values — see below
npm run dev
```

The app will be available at `http://localhost:3000`, with the API at `http://localhost:8000`.

### Or, with Docker

```bash
docker-compose up --build
```

## Environment Variables

Copy each `.env.example` to `.env` (backend) / `.env.local` (frontend) and fill in your own values. **Never commit these files** — they're already excluded via `.gitignore`.

**Backend (`backend/.env`)**
```
ENVIRONMENT=development
SECRET_KEY=your-own-random-secret
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/dataanalyst
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-...
MAX_FILE_SIZE_MB=100
SESSION_TTL_HOURS=24
CORS_ORIGINS=["http://localhost:3000"]
FORECAST_HORIZON_DAYS=180
MIN_ROWS_FOR_FORECAST=30
```

**Frontend (`frontend/.env.local`)**
```
NEXT_PUBLIC_API_URL=http://localhost:8000
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...   # optional, remove Clerk imports if unused
CLERK_SECRET_KEY=sk_...                     # optional
```

## Deployment

**Frontend → Vercel**
```bash
cd frontend
npx vercel --prod
```

**Backend → Railway**
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

## Roadmap

- [ ] Multi-file / multi-sheet joins
- [ ] Scheduled report emails
- [ ] Role-based access control for shared workspaces


## Author

Built by **[Mohamed Wafa]** 
