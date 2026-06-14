import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  keyLength: 64,
};

type ScryptParams = Pick<typeof SCRYPT_PARAMS, "N" | "r" | "p">;

function scryptAsync(password: string, salt: string, keyLength: number, params: ScryptParams) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, params, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = await scryptAsync(password, salt, SCRYPT_PARAMS.keyLength, SCRYPT_PARAMS);

  return [
    "scrypt",
    SCRYPT_PARAMS.N,
    SCRYPT_PARAMS.r,
    SCRYPT_PARAMS.p,
    salt,
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [algorithm, n, r, p, salt, hash] = passwordHash.split("$");

  if (algorithm !== "scrypt" || !n || !r || !p || !salt || !hash) {
    return false;
  }

  const params = {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  };

  if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) {
    return false;
  }

  try {
    const expected = Buffer.from(hash, "base64url");
    const actual = await scryptAsync(password, salt, expected.length, params);

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
