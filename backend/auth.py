"""JWT auth helpers and routes for the Restaurant POS."""
import os
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Request, Depends, Response
from pydantic import BaseModel, EmailStr, Field
import uuid

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 12  # 12h: long shifts in restaurants


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


# --- Pydantic schemas ---
class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str


class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: str = "waiter"  # admin | cashier | waiter


# --- Dependency ---
async def get_current_user(request: Request) -> dict:
    db = request.app.state.db
    token: Optional[str] = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_roles(*roles: str):
    async def _checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return _checker


# --- Routes ---
auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


@auth_router.post("/login")
async def login(payload: LoginIn, response: Response, request: Request):
    db = request.app.state.db
    email = payload.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], user["email"], user["role"])
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=False, samesite="lax",
        max_age=ACCESS_TOKEN_MINUTES * 60, path="/",
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"], "email": user["email"],
            "name": user["name"], "role": user["role"],
        },
    }


@auth_router.post("/logout")
async def logout(response: Response, _: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@auth_router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(id=user["id"], email=user["email"], name=user["name"], role=user["role"])


# --- User management (admin) ---
users_router = APIRouter(prefix="/api/users", tags=["users"])


@users_router.get("", response_model=List[UserOut])
async def list_users(request: Request, _: dict = Depends(require_roles("admin"))):
    db = request.app.state.db
    items = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return [UserOut(**u) for u in items]


@users_router.post("", response_model=UserOut)
async def create_user(payload: UserCreate, request: Request, _: dict = Depends(require_roles("admin"))):
    db = request.app.state.db
    email = payload.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already exists")
    if payload.role not in ("admin", "cashier", "waiter"):
        raise HTTPException(400, "Invalid role")
    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": payload.name,
        "role": payload.role,
        "password_hash": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return UserOut(id=doc["id"], email=doc["email"], name=doc["name"], role=doc["role"])


@users_router.delete("/{user_id}")
async def delete_user(user_id: str, request: Request, current: dict = Depends(require_roles("admin"))):
    db = request.app.state.db
    if user_id == current["id"]:
        raise HTTPException(400, "Cannot delete your own account")
    res = await db.users.delete_one({"id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "User not found")
    return {"ok": True}
