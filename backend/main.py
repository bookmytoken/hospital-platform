from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Import database engine and Base for table creation
from backend.database import engine, Base

# Import routers
from backend.routes.hospital_routes import router as hospital_router
from backend.routes.doctor_routes import router as doctor_router
from backend.routes.appointment_routes import router as appointment_router
from backend.routes.auth_routes import router as auth_router
from backend.routes.admin_routes import router as admin_router

# Create database tables (if they don't exist yet)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Hospital SaaS Platform API", version="1.0.0")

@app.on_event("startup")
def create_default_super_admin():
    from backend.database import SessionLocal
    from backend.models.staff import HospitalStaff
    from backend.services.auth_service import hash_password
    
    db = SessionLocal()
    try:
        # Check if any super admin exists
        super_admin = db.query(HospitalStaff).filter(HospitalStaff.role == 'super_admin').first()
        if not super_admin:
            print("No super_admin found. Creating default: admin@medibook.com / admin123")
            default_admin = HospitalStaff(
                hospital_id=None,
                name="System Super Admin",
                email="admin@medibook.com",
                password_hash=hash_password("admin123"),
                role="super_admin"
            )
            db.add(default_admin)
            db.commit()
    finally:
        db.close()

# Setup CORS (configure appropriately for production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(hospital_router)
app.include_router(doctor_router)
app.include_router(appointment_router)
app.include_router(auth_router)
app.include_router(admin_router)

# Serve frontend static files
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/app", StaticFiles(directory=frontend_path, html=True), name="frontend")

@app.get("/")
def read_root():
    return FileResponse(os.path.join(frontend_path, "user.html"))
