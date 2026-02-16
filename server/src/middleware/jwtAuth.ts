import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const TENANT_ID = process.env.AZURE_TENANT_ID ?? '';
const CLIENT_ID = process.env.AZURE_CLIENT_ID ?? '';
const CLAIM = process.env.ENTERPRISE_ID_CLAIM ?? 'preferred_username';

const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
});

function getSigningKey(header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    client.getSigningKey(header.kid, (err, key) => {
      if (err || !key) return reject(err ?? new Error('No key'));
      resolve(key.getPublicKey());
    });
  });
}

export interface TokenPayload {
  enterpriseId: string;
  oid?: string;
}

/**
 * JWT を検証し、Enterprise ID を返す。
 * 検証失敗時は null を返す。
 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) return null;

    const signingKey = await getSigningKey(decoded.header);

    const payload = jwt.verify(token, signingKey, {
      audience: CLIENT_ID,
      issuer: `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
      algorithms: ['RS256'],
    }) as jwt.JwtPayload;

    const enterpriseId = payload[CLAIM];
    if (typeof enterpriseId !== 'string' || !enterpriseId) return null;

    return {
      enterpriseId,
      oid: typeof payload.oid === 'string' ? payload.oid : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Authorization ヘッダーまたはクエリパラメータからトークンを取り出す。
 */
export function extractToken(
  authHeader?: string,
  queryToken?: string,
): string | null {
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  if (queryToken) {
    return queryToken;
  }
  return null;
}
