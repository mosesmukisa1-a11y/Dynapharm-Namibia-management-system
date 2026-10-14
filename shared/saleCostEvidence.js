const known = (value, approvedZero) => value != null && value !== '' &&
  Number.isFinite(Number(value)) && (Number(value) > 0 || (Number(value) === 0 && approvedZero === true));

export function classifySaleCostEvidence({ originalReceivedDPC, originalReceivedCost, zeroCostApproved = false, estimated = false }) {
  const dp = known(originalReceivedDPC, zeroCostApproved);
  const cost = known(originalReceivedCost, zeroCostApproved);
  if (dp && cost) return 'original';
  if (dp || cost) return 'partial';
  return estimated ? 'estimated' : 'missing';
}
