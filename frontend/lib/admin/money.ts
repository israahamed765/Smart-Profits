export function formatUsd(n: number) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
}

export function formatUsdPrecise(n: number, digits = 1) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatCount(n: number) {
  return Math.round(n).toLocaleString("en-US");
}
