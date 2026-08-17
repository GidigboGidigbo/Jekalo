import { z } from "zod";

const MSG = {
  first_name: "First name must be at least 2 characters.",
  last_name: "Last name must be at least 2 characters.",
  email: "A valid email address is required.",
  phone_required: "Phone number is required.",
  phone_string: "Phone number must be a string.",
  password:
    "Password must be at least 8 characters and contain both letters and numbers.",
  profile_picture: "Profile picture must be a URL string or null.",
};

const nameField = (msg) => z.string({ error: msg }).trim().min(2, msg);
const emailField = z
  .string({ error: MSG.email })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: MSG.email }));
const profilePictureField = z.url({ error: MSG.profile_picture }).nullish();

export const registerSchema = z.object({
  first_name: nameField(MSG.first_name),
  last_name: nameField(MSG.last_name),
  email: emailField,
  phone_number: z.string({ error: MSG.phone_required }).min(1, MSG.phone_required),
  password: z
    .string({ error: MSG.password })
    .min(8, MSG.password)
    .regex(/^(?=.*[A-Za-z])(?=.*\d)/, MSG.password),
  profile_picture: profilePictureField,
});

export const loginSchema = z.object({
  identifier: z
    .string({ error: "Email or phone number is required." })
    .min(1, "Email or phone number is required."),
  password: z.string({ error: "Password is required." }).min(1, "Password is required."),
});

export const updateProfileSchema = z.object({
  first_name: nameField(MSG.first_name).optional(),
  last_name: nameField(MSG.last_name).optional(),
  email: emailField.optional(),
  phone_number: z.string({ error: MSG.phone_string }).optional(),
  profile_picture: profilePictureField,
});
