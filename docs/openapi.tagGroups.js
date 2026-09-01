// Centralized tag groups for the Scalar sidebar. Single source of truth —
// doc modules must NOT define their own x-tagGroups, mirroring the resource
// layout of the routes/ directory.
export const tagGroups = [
  { name: "Users", tags: ["Users"] },
  { name: "Vehicles", tags: ["Vehicles"] },
  { name: "Addresses", tags: ["Addresses"] },
  { name: "Rides", tags: ["Rides"] },
  { name: "Rentals", tags: ["Rentals"] },
  { name: "Payments", tags: ["Payments"] },
  { name: "Bank Accounts", tags: ["Bank Accounts"] },
];