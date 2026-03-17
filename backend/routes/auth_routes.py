from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from backend.database import get_db
from backend.models.staff import HospitalStaff
from backend.services.auth_service import verify_password, create_access_token, SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from pydantic import BaseModel
from datetime import timedelta
from jose import JWTError, jwt

router = APIRouter(prefix="/auth", tags=["auth"])

from typing import Optional

# User login schema (raw json option)
class LoginRequest(BaseModel):
    email: str
    password: str

# Expected response 
class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    hospital_id: Optional[int] = None

# We also need OAuth2PasswordBearer as our auth scheme for the dependency check
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

@router.post("/login", response_model=TokenResponse)
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(HospitalStaff).filter(HospitalStaff.email == login_data.email).first()
    
    # Check if user exists and password is correct
    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Block login if staff account is deactivated
    if hasattr(user, 'is_active') and not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated. Please contact your administrator."
        )

    # Block login if the hospital is deactivated (for non-super-admins)
    if user.role != "super_admin" and user.hospital:
        from backend.models.hospital import Hospital
        if hasattr(user.hospital, 'is_active') and not user.hospital.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This hospital has been deactivated. Please contact the platform administrator."
            )
    
    # Create valid JWT token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "hospital_id": user.hospital_id}, 
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "hospital_id": user.hospital_id
    }

# Dependency to check user token validity
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(HospitalStaff).filter(HospitalStaff.email == email).first()
    if user is None:
        raise credentials_exception
        
    return user
