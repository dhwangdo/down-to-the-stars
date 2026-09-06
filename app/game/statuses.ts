export type OpposingStatus = {
  resistance: number;
  vulnerability: number;
};

export function addResistance(status: OpposingStatus, amount: number): OpposingStatus {
  const balance = status.resistance + amount - status.vulnerability;
  return { resistance: Math.max(0, balance), vulnerability: Math.max(0, -balance) };
}

export function addVulnerability(status: OpposingStatus, amount: number): OpposingStatus {
  const balance = status.resistance - status.vulnerability - amount;
  return { resistance: Math.max(0, balance), vulnerability: Math.max(0, -balance) };
}

export function vulnerabilityMultiplier(vulnerability: number) {
  return vulnerability > 0 ? 2 : 1;
}

export function decayThenAddVulnerability(status: OpposingStatus, amount: number): OpposingStatus {
  return addVulnerability({
    resistance: Math.max(0, status.resistance - 1),
    vulnerability: Math.max(0, status.vulnerability - 1),
  }, amount);
}
