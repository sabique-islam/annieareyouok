export const CHECKPOINTS = [
  { category: "engine", itemName: "Oil leaks and seepage" },
  { category: "engine", itemName: "Cold start and idle" },
  { category: "engine", itemName: "Coolant condition" },
  { category: "transmission", itemName: "Gear engagement" },
  { category: "transmission", itemName: "Clutch or torque converter" },
  { category: "brakes", itemName: "Pad and shoe remaining" },
  { category: "brakes", itemName: "Brake fluid condition" },
  { category: "suspension", itemName: "Noise over bumps" },
  { category: "electrical", itemName: "Battery and charging" },
  { category: "body", itemName: "Panel gaps and paint depth" },
  { category: "interior", itemName: "Cabin wear and dampness" },
  { category: "tyres", itemName: "Tread depth" },
  { category: "underbody", itemName: "Floor and chassis corrosion" },
  { category: "underbody", itemName: "Exhaust leaks" },
];

export const RESULT_DEFAULTS = {
  pass: { score: 9, severity: "none" },
  advisory: { score: 6, severity: "minor" },
  fail: { score: 3, severity: "moderate" },
  not_tested: { score: 0, severity: "none" },
};
