import { z } from "zod";

const MSG = {
  firstName: "First name must be at least 2 characters.",
  lastName: "Last name must be at least 2 characters.",
  email: "A valid email address is required.",
  phoneRequired: "Phone number is required.",
  phoneString: "Phone number must be a string.",
  password:
    "Password must be at least 8 characters and contain both letters and numbers.",
  profilePicture: "Profile picture must be a URL string or null.",
};

const nameField = (msg) => z.string({ error: msg }).trim().min(2, msg);
const emailField = z
  .string({ error: MSG.email })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: MSG.email }))
  // The pipe is a transformation; give the OpenAPI generator the type it emits.
  .openapi({ type: "string", format: "email", description: MSG.email, example: "rider@example.com" });
const profilePictureField = z.url({ error: MSG.profilePicture }).nullish();

export const registerSchema = z.object({
  firstName: nameField(MSG.firstName),
  lastName: nameField(MSG.lastName),
  email: emailField,
  phoneNumber: z.string({ error: MSG.phoneRequired }).min(1, MSG.phoneRequired),
  password: z
    .string({ error: MSG.password })
    .min(8, MSG.password)
    .regex(/^(?=.*[A-Za-z])(?=.*\d)/, MSG.password),
  profilePicture: profilePictureField,
});

export const loginSchema = z.object({
  identifier: z
    .string({ error: "Email or phone number is required." })
    .min(1, "Email or phone number is required."),
  password: z.string({ error: "Password is required." }).min(1, "Password is required."),
});

export const updateProfileSchema = z.object({
  firstName: nameField(MSG.firstName).optional(),
  lastName: nameField(MSG.lastName).optional(),
  email: emailField.optional(),
  phoneNumber: z.string({ error: MSG.phoneString }).optional(),
  profilePicture: profilePictureField,
});
