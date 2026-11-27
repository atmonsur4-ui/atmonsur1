// Password hashing (scrypt, built into Node) and random tokens. No external crypto dependency.
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

const scryptAsync = (password: string, salt: Buffer, len: number) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, len, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))))

/** Returns "scrypt:<salt>:<hash>" (base64url). */
export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 32)
  return ['scrypt', salt.toString('base64url'), hash.toString('base64url')].join(':')
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64url'), expected.length)
  return timingSafeEqual(actual, expected)
}

export const randomToken = () => randomBytes(32).toString('base64url')
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
