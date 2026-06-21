import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ENCRYPTION_PREFIX = "enc:v1:";

function getEncryptionKey(): Buffer | null {
  const raw = process.env.SECRETS_ENC_KEY?.trim();
  if (!raw) {
    return null;
  }

  return createHash("sha256").update(raw).digest();
}

export function isEncryptedSecretValue(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX);
}

export function encryptSecretValue(plaintext: string): string {
  const key = getEncryptionKey();
  if (!(key && plaintext)) {
    return plaintext;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecretValue(value: string): string {
  if (!isEncryptedSecretValue(value)) {
    return value;
  }

  const key = getEncryptionKey();
  if (!key) {
    throw new Error("SECRETS_ENC_KEY is required to decrypt stored secrets");
  }

  const payload = value.slice(ENCRYPTION_PREFIX.length);
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!(ivPart && tagPart && dataPart)) {
    throw new Error("Invalid encrypted secret format");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

export function verifyHmacSha256Hex(
  payload: string,
  secret: string,
  signatureHex: string,
): boolean {
  const expected = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  const received = signatureHex.replace(/^sha256=/i, "").trim();

  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}
