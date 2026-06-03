import * as crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getDb } from './db';

// JWT Secret - fallback configuration. Ideally set process.env.JWT_SECRET in .env
const JWT_SECRET = process.env.JWT_SECRET || 'pogodex-fallback-super-secret-key-12345';

// Base64Url helper functions
function base64url(buf: Buffer): string {
  return buf.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64urlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Signs a JWT token containing a payload
 */
export function signJwt(payload: any): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64url(Buffer.from(JSON.stringify(header)));
  const encodedPayload = base64url(Buffer.from(JSON.stringify({ 
    ...payload, 
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days expiration
  })));
  
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(signatureInput).digest();
  const encodedSignature = base64url(signature);
  
  return `${signatureInput}.${encodedSignature}`;
}

/**
 * Verifies a local JWT token and returns payload if valid
 */
export function verifyJwt(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [header, payload, signature] = parts;
    const signatureInput = `${header}.${payload}`;
    const expectedSignature = base64url(
      crypto.createHmac('sha256', JWT_SECRET).update(signatureInput).digest()
    );
    
    if (signature !== expectedSignature) return null;
    
    const decodedPayload = JSON.parse(base64urlDecode(payload));
    if (decodedPayload.exp && decodedPayload.exp < Date.now()) {
      return null; // Expired
    }
    
    return decodedPayload;
  } catch (err) {
    return null;
  }
}

/**
 * Verifies Google ID Token via Google's tokeninfo endpoint
 */
export async function verifyGoogleToken(idToken: string): Promise<any | null> {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.warn('[Auth] GOOGLE_CLIENT_ID is not configured. Google token verification will fail.');
      return null;
    }

    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    
    // Perform standard fetch (node 18+)
    const response = await fetch(url);
    if (!response.ok) {
      console.error('[Auth] Google token verification API returned status:', response.status);
      return null;
    }
    
    const payload = await response.json() as any;
    
    // Crucial: verify audience matches our GOOGLE_CLIENT_ID
    if (payload.aud !== clientId) {
      console.error('[Auth] Token audience mismatch! Target client ID:', clientId, 'Token client ID:', payload.aud);
      return null;
    }
    
    return payload; // Returns sub, email, name, picture, etc.
  } catch (err) {
    console.error('[Auth] Error verifying Google token:', err);
    return null;
  }
}

// Request extension to store auth info
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    name: string;
    googleSubId?: string;
    isAdmin?: number;
  };
}

/**
 * Optional Auth middleware: attaches authenticated user payload to req.user if token is present, but doesn't block.
 */
export function attachUser(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const decoded = verifyJwt(token);
    if (decoded) {
      (req as AuthenticatedRequest).user = decoded;
    }
  }
  next();
}

/**
 * Required Auth middleware: blocks request if valid JWT is missing
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Autenticazione richiesta' });
  }
  
  const token = authHeader.substring(7);
  const decoded = verifyJwt(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Token non valido o scaduto' });
  }
  
  (req as AuthenticatedRequest).user = decoded;
  next();
}

/**
 * Helper per verificare se la richiesta proviene da localhost (loopback)
 */
export function isLocalRequest(req: Request): boolean {
  const ip = req.ip || req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.includes('localhost');
}

/**
 * Middleware di autorizzazione amministratore: consente l'accesso libero da localhost
 * oppure richiede autenticazione ed il ruolo admin = 1 nel database.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // 1. Se è una richiesta da localhost, salta ogni controllo (dev convenience)
  if (isLocalRequest(req)) {
    return next();
  }

  // 2. Altrimenti, richiede autenticazione
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Autenticazione richiesta' });
  }

  const token = authHeader.substring(7);
  const decoded = verifyJwt(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Token non valido o scaduto' });
  }

  try {
    const db = await getDb();
    const user = await db.get('SELECT isAdmin FROM users WHERE id = ?', decoded.id);
    if (!user || user.isAdmin !== 1) {
      return res.status(403).json({ error: 'Accesso Negato: Console di Amministrazione riservata agli amministratori.' });
    }

    (req as AuthenticatedRequest).user = {
      ...decoded,
      isAdmin: user.isAdmin
    };
    next();
  } catch (err) {
    console.error('[Auth] Errore verifica ruolo admin:', err);
    res.status(500).json({ error: 'Errore interno del server' });
  }
}

