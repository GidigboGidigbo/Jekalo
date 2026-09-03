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
  nin: "NIN must be exactly 11 digits.",
  bvn: "BVN must be exactly 11 digits.",
  selfie: "Selfie must be a valid base64-encoded image string.",
};

const nameField = (msg) => z.string({ error: msg }).trim().min(2, msg);
const emailField = z
  .string({ error: MSG.email })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: MSG.email }));
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
  nin: z.string({ error: MSG.nin }).regex(/^\d{11}$/, MSG.nin).optional(),
  bvn: z.string({ error: MSG.bvn }).regex(/^\d{11}$/, MSG.bvn).optional(),
  selfie: z.string({ error: MSG.selfie }).min(100, MSG.selfie), // base64 images are typically > 100 chars
}).refine(
  (data) => (data.nin && !data.bvn) || (data.bvn && !data.nin),
  {
    message: "Either NIN or BVN must be provided, but not both.",
    path: ["nin"], // This sets which field the error is associated with
  }
);

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

export const verifyDriverSchema = z.object({
  driverLicense: z.string({ error: "Driver license image is required" }).min(100, "Driver license must be a valid base64 image"),
  selfie: z.string({ error: "Selfie image is required" }).min(100, "Selfie must be a valid base64 image"),
});
