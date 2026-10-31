const SPEC = [
  { role: "admin", fullName: "Project Admin", email: "DEMO_ADMIN_EMAIL", password: "DEMO_ADMIN_PASSWORD" },
  { role: "inspector", fullName: "Lead Inspector", email: "DEMO_INSPECTOR_EMAIL", password: "DEMO_INSPECTOR_PASSWORD" },
  { role: "inspector", fullName: "Field Inspector", email: "DEMO_FIELD_EMAIL", password: "DEMO_FIELD_PASSWORD" },
  { role: "buyer", fullName: "Dealer Buyer", email: "DEMO_BUYER_EMAIL", password: "DEMO_BUYER_PASSWORD" },
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

export function demoUsers() {
  return SPEC.map((row) => ({
    role: row.role,
    fullName: row.fullName,
    email: required(row.email),
    password: required(row.password),
  }));
}

export function demoCredentials(role) {
  const user = demoUsers().find((row) => row.role === role);
  if (!user) throw new Error("Unknown demo role.");
  return { email: user.email, password: user.password };
}
