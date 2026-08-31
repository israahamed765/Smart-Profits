export type ColumnRole =
  | "date"
  | "product"
  | "sku"
  | "quantity"
  | "sellingPrice"
  | "costPrice"
  | "revenue"
  | "expense"
  | "category"
  | "expenseType"
  | "notes";

export type CurrencyCode = "SAR" | "USD" | "AED" | "JOD" | "ILS";

export type FinancialBucket = "revenue" | "opex" | "salaries" | "cogs" | "waste";

export type TaxonomySide = "revenue" | "opex";

export interface TaxonomyEntry {
  key: string;
  term: string;
  side: TaxonomySide;
  bucket: FinancialBucket;
  updatedAt: string;
}

export type TaxonomyMap = Record<string, TaxonomyEntry>;

export interface ColumnMapping {
  date?: string;
  product?: string;
  sku?: string;
  quantity?: string;
  sellingPrice?: string;
  costPrice?: string;
  revenue?: string;
  expense?: string;
  category?: string;
  expenseType?: string;
  notes?: string;
}

export interface MappingResult {
  mapping: ColumnMapping;
  scores: Partial<Record<ColumnRole, number>>;
  headers: string[];
  unmappedHeaders: string[];
  warnings: string[];
}

export interface Transaction {
  date: Date | null;
  product: string;
  sku: string;
  quantity: number;
  sellingPrice: number;
  costPrice: number;
  revenue: number;
  /** Client/file amount before canonicalization. Never use for KPIs when sellingPrice is present. */
  sourceRevenue?: number;
  expense: number;
  category: string;
  expenseType: string;
  notes: string;
  sourceSheet?: string;
  bucket?: FinancialBucket;
  originalAmount?: number;
  confidence?: number;
  needsReview?: boolean;
  classifyTerm?: string;
  classifyTermKey?: string;
}

export type SheetRole = "detail" | "summary" | "empty" | "skipped";

export interface SheetScan {
  name: string;
  role: SheetRole;
  rows: number;
  validRows: number;
  reason?: string;
  revenue?: number;
  expenses?: number;
  netProfit?: number;
}

export interface ParseResult {
  transactions: Transaction[];
  mapping: MappingResult;
  fileName: string;
  sheetName?: string;
  sheets?: SheetScan[];
  rowCount: number;
  skippedRows: number;
  warnings: string[];
  cleaning: CleaningReport;
}

export interface CleaningReport {
  sourceRows: number;
  validRows: number;
  skippedRows: number;
  columnsDetected: number;
  columnsMapped: number;
  valuesFixed: number;
  duplicatesRemoved: number;
  reviewNeeded: number;
}

export interface AppSettings {
  storeName: string;
  ownerName: string;
  defaultCurrency: CurrencyCode;
  rent: number;
  salaries: number;
  utilities: number;
  otherOpex: number;
  opexIncludedInFile: boolean;
  opexSetupCompleted: boolean;
}

export interface MonthlyPoint {
  key: string;
  label: string;
  year: number;
  month: number;
  revenue: number;
  cogs: number;
  opex: number;
  salaries: number;
  waste: number;
  expenses: number;
  netProfit: number;
}

export interface ExpenseSlice {
  name: string;
  value: number;
  color: string;
}

export interface ProductStat {
  name: string;
  revenue: number;
  quantity: number;
  lastSale: string | null;
  status: "rising" | "stable" | "declining";
  changePct: number;
}

export interface StagnantItem {
  name: string;
  daysStagnant: number;
  lastRevenue: number;
  suggestedAction: "discount20" | "liquidate" | "review";
}

export interface ProductPerformance {
  name: string;
  saleCount: number;
  quantity: number;
  revenue: number;
  cogs: number;
  profit: number;
  margin: number;
  isLoss: boolean;
}

export interface ProductHighlights {
  catalog: ProductPerformance[];
  highestSales: ProductPerformance | null;
  lowestSales: ProductPerformance | null;
  mostProfitable: ProductPerformance | null;
  lossMakers: ProductPerformance[];
}

export interface BucketTotals {
  revenue: number;
  opex: number;
  salaries: number;
  cogs: number;
  waste: number;
  expenses: number;
  netProfit: number;
}

export interface FinancialKPIs {
  totalRevenue: number;
  totalCogs: number;
  totalOpex: number;
  totalSalaries: number;
  totalWaste: number;
  totalExpenses: number;
  netProfit: number;
  profitMargin: number;
  healthScore: number;
  healthLabel: string;
  revenueChangePct: number;
  expenseChangePct: number;
  profitChangePct: number;
}

export interface ForecastPoint {
  key: string;
  label: string;
  actualRevenue?: number;
  actualExpenses?: number;
  actualProfit?: number;
  predictedRevenue?: number;
  predictedExpenses?: number;
  predictedProfit?: number;
  isForecast: boolean;
}

export type AlertSeverity = "high" | "medium" | "low" | "positive";

export interface RiskAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  recommendation: string;
  value?: number;
}

export interface AiRecommendation {
  id: string;
  title: string;
  body: string;
  tone: "positive" | "warning";
  actionLabel: string;
  actionHref: string;
}

export interface ActionLogEntry {
  id: string;
  fileId: string;
  fileName: string;
  recommendationId: string;
  title: string;
  body: string;
  actionLabel: string;
  appliedAt: string;
  status: "applied" | "reviewed";
}

export interface WorkspaceFileMeta {
  id: string;
  fileName: string;
  uploadedAt: string;
  rowCount: number;
  isDemo: boolean;
}

export interface ForecastResult {
  nextMonthRevenue: number;
  nextMonthExpenses: number;
  nextMonthProfit: number;
  revenueSlope: number;
  expenseSlope: number;
  willLoseNextMonth: boolean;
  series: ForecastPoint[];
  alerts: RiskAlert[];
  recommendations: AiRecommendation[];
}

export interface AnalysisResult {
  kpis: FinancialKPIs;
  monthlySeries: MonthlyPoint[];
  bucketTotals: BucketTotals;
  sheetMetrics: SheetScan[];
  expenseBreakdown: ExpenseSlice[];
  topProducts: ProductStat[];
  stagnantInventory: StagnantItem[];
  productHighlights: ProductHighlights;
  forecast: ForecastResult;
  advisor: AdvisorReport;
  mapping: MappingResult;
  warnings: string[];
  fileName: string;
  rowCount: number;
  analyzedAt: string;
  pendingClassifications: ClassificationPrompt[];
}

export interface ClassificationPrompt {
  key: string;
  term: string;
  amount: number;
  count: number;
  confidence: number;
  sheet?: string;
}

export type FindingTone = "good" | "warn" | "bad";

export interface HealthFinding {
  id: string;
  tone: FindingTone;
  title: string;
  detail: string;
}

export interface StoreHealth {
  score: number;
  label: string;
  tone: FindingTone;
  headline: string;
  daysUntilProblem: number | null;
  findings: HealthFinding[];
}

export interface TodayAction {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  reason: string;
  href: string;
}

export interface ProfitLeak {
  id: string;
  product: string;
  revenue: number;
  profit: number;
  issue: string;
  suggestion: string;
  extraProfitIfFixed: number;
}

export interface InventoryAdvice {
  product: string;
  estimatedStock: number;
  dailyVelocity: number;
  daysUntilStockout: number | null;
  unitProfit: number;
  decision: "order_now" | "dont_buy" | "watch";
  reason: string;
}

export interface PriceAdvice {
  product: string;
  currentPrice: number;
  cost: number;
  margin: number;
  suggestedMin: number;
  suggestedMax: number;
  caution: string;
}

export interface ScenarioPoint {
  revenue: number;
  profit: number;
}

export interface ProfitScenarios {
  worst: ScenarioPoint;
  expected: ScenarioPoint;
  best: ScenarioPoint;
}

export interface RiskAxis {
  id: string;
  label: string;
  level: "high" | "medium" | "low" | "good";
  reason: string;
}

export interface PlanWeek {
  week: number;
  title: string;
  tasks: string[];
}

export interface AdvisorReport {
  health: StoreHealth;
  todayActions: TodayAction[];
  leaks: ProfitLeak[];
  inventory: InventoryAdvice[];
  pricing: PriceAdvice[];
  scenarios: ProfitScenarios;
  risks: RiskAxis[];
  plan: PlanWeek[];
}

export interface WhatIfResult {
  product: string;
  currentPrice: number;
  newPrice: number;
  currentUnitProfit: number;
  newUnitProfit: number;
  monthlyQty: number;
  currentMonthlyProfit: number;
  newMonthlyProfit: number;
  delta: number;
  verdict: string;
  verdictKey: "sim.v.ok" | "sim.v.belowCost" | "sim.v.thin" | "sim.v.down" | "sim.v.raise";
}

export class FileParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileParseError";
  }
}
