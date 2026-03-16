# Hospital SaaS Platform - Phase 1 Foundation

This is the backend foundational application built with Python, FastAPI, and PostgreSQL.

## How to run the application

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Make sure you have PostgreSQL running and update `backend/database.py` with your credentials.

3. Start the FastAPI server using Uvicorn:
   ```bash
   uvicorn backend.main:app --reload
   ```

The API docs will be available at `http://localhost:8000/docs`.
