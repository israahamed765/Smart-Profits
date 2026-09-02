import { normalizeMobile } from "@/frontend/lib/phone";

export type RegisterErrorCode =
  | "fullName"
  | "storeName"
  | "email"
  | "emailInvalid"
  | "phone"
  | "password"
  | "terms"
  | "emailTaken"
  | "phoneTaken"
  | "server"
  | "unavailable";

export class RegisterError extends Error {
  code: RegisterErrorCode;

  constructor(code: RegisterErrorCode, message?: string) {
    super(message || code);
    this.name = "RegisterError";
    this.code = code;
  }
}

export class RegisterValidationErrors extends Error {
  errors: RegisterError[];

  constructor(errors: RegisterError[]) {
    super(errors.map((error) => error.code).join(","));
    this.name = "RegisterValidationErrors";
    this.errors = errors;
  }
}

export function isRegisterError(error: unknown): error is RegisterError {
  return error instanceof RegisterError;
}

export function isRegisterValidationErrors(error: unknown): error is RegisterValidationErrors {
  return error instanceof RegisterValidationErrors;
}

export function validateRegisterForm(input: {
  fullName: string;
  storeName: string;
  email: string;
  phoneRaw: string;
  password: string;
  accepted: boolean;
}): RegisterError[] {
  const errors: RegisterError[] = [];
  const fullName = input.fullName.trim();
  const storeName = input.storeName.trim();
  const email = input.email.trim();
  const phone = normalizeMobile(input.phoneRaw);
  const password = input.password;

  if (!fullName || fullName.length < 2) errors.push(new RegisterError("fullName"));
  if (!storeName || storeName.length < 2) errors.push(new RegisterError("storeName"));
  if (!email) errors.push(new RegisterError("email"));
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(new RegisterError("emailInvalid"));
  if (!phone) errors.push(new RegisterError("phone"));
  if (password.length < 6) errors.push(new RegisterError("password"));
  if (!input.accepted) errors.push(new RegisterError("terms"));
  return errors;
}

export function mapRegisterApiError(status: number, message: string): RegisterError {
  const text = message.trim();
  if (status === 409 && text.includes("البريد")) return new RegisterError("emailTaken", text);
  if (status === 409 && text.includes("الجوال")) return new RegisterError("phoneTaken", text);
  if (text.includes("رقم الجوال") || text.includes("جوال")) return new RegisterError("phone", text);
  if (text.includes("الاسم")) return new RegisterError("fullName", text);
  if (text.includes("اسم المتجر")) return new RegisterError("storeName", text);
  if (text.includes("بريداً") || text.includes("البريد")) return new RegisterError("emailInvalid", text);
  if (text.includes("كلمة المرور")) return new RegisterError("password", text);
  if (status === 503 || status === 0) return new RegisterError("unavailable", text);
  return new RegisterError("server", text || undefined);
}

export function mapRegisterApiCodes(status: number, codes: string[], message: string): RegisterValidationErrors {
  const known = codes.filter((code): code is RegisterErrorCode =>
    [
      "fullName",
      "storeName",
      "email",
      "emailInvalid",
      "phone",
      "password",
      "terms",
      "emailTaken",
      "phoneTaken",
      "server",
      "unavailable",
    ].includes(code),
  );
  if (!known.length) {
    return new RegisterValidationErrors([mapRegisterApiError(status, message)]);
  }
  return new RegisterValidationErrors(known.map((code) => new RegisterError(code)));
}

const REGISTER_ERROR_KEYS: Record<RegisterErrorCode, string> = {
  fullName: "auth.register.error.fullName",
  storeName: "auth.register.error.storeName",
  email: "auth.register.error.email",
  emailInvalid: "auth.register.error.emailInvalid",
  phone: "auth.register.error.phone",
  password: "auth.register.error.password",
  terms: "auth.register.error.terms",
  emailTaken: "auth.register.error.emailTaken",
  phoneTaken: "auth.register.error.phoneTaken",
  server: "auth.register.error.server",
  unavailable: "auth.register.error.unavailable",
};

export function registerErrorMessage(
  t: (key: string) => string,
  error: RegisterError,
) {
  if (error.code === "server" && error.message && error.message !== "server") {
    return error.message;
  }
  return t(REGISTER_ERROR_KEYS[error.code]);
}
