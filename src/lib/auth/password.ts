import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Hash de senha via scrypt nativo do Node — sem dependência nova (avaliado contra bcrypt/argon2;
 * scrypt já vem no runtime e é reconhecido como KDF seguro para senha, ver docs.nodejs.org/crypto).
 * Formato armazenado: "scrypt:{saltHex}:{hashHex}" — nunca a senha em texto puro, nunca logado.
 */

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(plainPassword: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(plainPassword, salt, KEY_LENGTH)) as Buffer;
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(plainPassword: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;
  const derivedKey = (await scryptAsync(plainPassword, salt, KEY_LENGTH)) as Buffer;
  return timingSafeEqual(derivedKey, expected);
}

/** Token de uso único (definição/redefinição de senha) — nunca a senha em si, só uma credencial de link. */
export function generateSetupToken(): string {
  return randomBytes(32).toString("base64url");
}
