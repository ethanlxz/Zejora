# Zejora

Zejora is a calm academic productivity system for organizing subjects, coursework, deadlines, and progress. It combines a FastAPI and SQLite backend with a responsive HTML, CSS, and vanilla JavaScript interface.

## Features

- Subject and task CRUD with explicit cascade confirmation
- Today, seven-day, overdue, urgent, and completed task states
- Subject focus mode and responsive task groups
- Live completion, workload, and eight-week trend charts
- Browser-timezone-aware date grouping with UTC storage
- Accessible dialogs, empty states, validation, and reduced-motion support

## Run locally

1. Create and activate a virtual environment:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

2. Install dependencies:

   ```powershell
   python -m pip install -r requirements.txt
   ```

3. Start the development server:

   ```powershell
   python -m uvicorn app.main:app --reload
   ```

4. Open `http://127.0.0.1:8000`. API documentation is available at `http://127.0.0.1:8000/docs`.

The SQLite database is created automatically as `zejora.db` in the project root.

## Tests

```powershell
python -m pytest
```

Tests use a temporary SQLite database and cover API CRUD, validation, completion transitions, deadline classification, cascade behavior, timezone handling, and analytics.

## Structure

```text
app/                 FastAPI application, ORM models, schemas, and time logic
static/              Landing page, dashboard, styles, and vanilla JavaScript
tests/               API and business-logic tests
requirements.txt     Runtime and test dependencies
```
