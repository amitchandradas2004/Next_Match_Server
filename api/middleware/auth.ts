import { Response, NextFunction } from "express";
import { Request } from "express";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "../index";

export interface AuthenticatedRequest extends Request {
  user?: {
    _id: ObjectId;
    name: string;
    email: string;
    image?: string;
    createdAt: Date;
    updatedAt: Date;
  };
  userId?: ObjectId;
}

function extractSessionToken(cookieHeader: string): string | undefined {
  const cookies = cookieHeader.split(";").reduce((acc, c) => {
    const idx = c.indexOf("=");
    if (idx === -1) return acc;
    const key = c.slice(0, idx).trim();
    const val = c.slice(idx + 1).trim();
    if (key && val) acc[key] = val;
    return acc;
  }, {} as Record<string, string>);

  const rawValue = cookies["better-auth.session_token"];
  if (!rawValue) return undefined;

  // Cookie values arrive URL-encoded (e.g. %2B for '+', %3D for '=')
  const decoded = decodeURIComponent(rawValue);

  // Better Auth format is "<token>.<hmac_signature>" — we only need the token part
  return decoded.split(".")[0];
}

export async function protect(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).split(".")[0];
    } else if (req.headers.cookie) {
      token = extractSessionToken(req.headers.cookie);
    }

    if (!token) {
      res.status(401).json({ message: "Unauthorized: No token provided" });
      return;
    }

    const db = await connectToDatabase();

    const session = await db.collection("session").findOne({ token });

    if (!session) {
      res.status(401).json({ message: "Unauthorized: Invalid session token" });
      return;
    }

    if (new Date(session.expiresAt) < new Date()) {
      res.status(401).json({ message: "Unauthorized: Session has expired" });
      return;
    }

    const userIdObj =
      typeof session.userId === "string" ? new ObjectId(session.userId) : session.userId;
    const user = await db.collection("user").findOne({ _id: userIdObj });

    if (!user) {
      res.status(401).json({ message: "Unauthorized: User not found" });
      return;
    }

    req.user = user as any;
    req.userId = user._id;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ message: "Internal server error during authentication" });
  }
}