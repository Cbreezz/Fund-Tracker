import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  anomaliesTable,
  constituenciesTable,
  projectsTable,
  sourceRecordsTable,
} from "@workspace/db";
import {
  GetAnomaliesQueryParams,
  GetAnomaliesResponse,
  GetDashboardSummaryResponse,
  GetFilterOptionsResponse,
  GetProjectParams,
  GetProjectResponse,
  GetProjectsQueryParams,
  GetProjectsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

type ProjectRow = typeof projectsTable.$inferSelect & {
  constituencyName: string;
  county: string;
};

const sectorOrder = ["EDUCATION", "WATER", "ROADS", "HEALTH", "AGRICULTURE", "SECURITY", "OTHER"] as const;
const severityOrder = ["HIGH", "MEDIUM", "LOW"] as const;

async function loadProjectRows(): Promise<ProjectRow[]> {
  return db
    .select({
      id: projectsTable.id,
      constituencyId: projectsTable.constituencyId,
      ward: projectsTable.ward,
      title: projectsTable.title,
      normalizedTitle: projectsTable.normalizedTitle,
      sector: projectsTable.sector,
      fiscalYear: projectsTable.fiscalYear,
      approvedAmount: projectsTable.approvedAmount,
      status: projectsTable.status,
      constituencyName: constituenciesTable.name,
      county: constituenciesTable.county,
    })
    .from(projectsTable)
    .innerJoin(constituenciesTable, eq(projectsTable.constituencyId, constituenciesTable.id))
    .orderBy(asc(projectsTable.fiscalYear), asc(projectsTable.title));
}

function highestSeverity(severities: string[]): "LOW" | "MEDIUM" | "HIGH" | null {
  return severityOrder.find((severity) => severities.includes(severity)) ?? null;
}

async function loadDerivedData() {
  const [projects, records, anomalies] = await Promise.all([
    loadProjectRows(),
    db.select().from(sourceRecordsTable),
    db.select().from(anomaliesTable),
  ]);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const recordsByProject = new Map<number, (typeof records)[number][]>();
  for (const record of records) {
    const list = recordsByProject.get(record.projectId) ?? [];
    list.push(record);
    recordsByProject.set(record.projectId, list);
  }
  const anomaliesByProject = new Map<number, (typeof anomalies)[number][]>();
  for (const anomaly of anomalies) {
    const list = anomaliesByProject.get(anomaly.projectId) ?? [];
    list.push(anomaly);
    anomaliesByProject.set(anomaly.projectId, list);
  }
  return { projects, projectById, recordsByProject, anomaliesByProject };
}

function toAnomaly(anomaly: (typeof anomaliesTable)["$inferSelect"], projectById: Map<number, ProjectRow>) {
  const project = projectById.get(anomaly.projectId);
  return {
    id: anomaly.id,
    projectId: anomaly.projectId,
    projectTitle: project?.title ?? "Unknown project",
    constituencyName: project?.constituencyName ?? "Unknown constituency",
    type: anomaly.type,
    severity: anomaly.severity,
    detail: anomaly.detail,
    detectedAt: anomaly.detectedAt,
  };
}

function toListItem(
  project: ProjectRow,
  records: (typeof sourceRecordsTable)["$inferSelect"][],
  anomalies: (typeof anomaliesTable)["$inferSelect"][],
) {
  const budgetRecord = records.find((record) => record.origin === "BUDGET_OFFICE");
  return {
    id: project.id,
    title: project.title,
    constituencyName: project.constituencyName,
    county: project.county,
    ward: project.ward,
    sector: project.sector,
    fiscalYear: project.fiscalYear,
    approvedAmount: project.approvedAmount,
    disbursedAmount: budgetRecord?.amount ?? 0,
    status: project.status,
    anomalyCount: anomalies.length,
    highestSeverity: highestSeverity(anomalies.map((anomaly) => anomaly.severity)),
  };
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const { projects, recordsByProject, anomaliesByProject } = await loadDerivedData();
  const items = projects.map((project) =>
    toListItem(project, recordsByProject.get(project.id) ?? [], anomaliesByProject.get(project.id) ?? []),
  );
  const totalApprovedAmount = items.reduce((sum, item) => sum + item.approvedAmount, 0);
  const totalDisbursedAmount = items.reduce((sum, item) => sum + item.disbursedAmount, 0);
  const totalConfirmedCompleteAmount = projects.reduce((sum, project) => {
    const auditor = (recordsByProject.get(project.id) ?? []).find((record) => record.origin === "AUDITOR");
    return sum + (auditor?.status === "COMPLETE" ? auditor.amount ?? 0 : 0);
  }, 0);
  const sectorBreakdown = sectorOrder
    .map((sector) => {
      const sectorItems = items.filter((item) => item.sector === sector);
      return {
        sector,
        approvedAmount: sectorItems.reduce((sum, item) => sum + item.approvedAmount, 0),
        projectCount: sectorItems.length,
        anomalyCount: sectorItems.reduce((sum, item) => sum + item.anomalyCount, 0),
      };
    })
    .filter((entry) => entry.projectCount > 0);
  const severityBreakdown = ["LOW", "MEDIUM", "HIGH"].map((severity) => ({
    severity,
    count: items.reduce(
      (count, item) =>
        count + (anomaliesByProject.get(item.id) ?? []).filter((anomaly) => anomaly.severity === severity).length,
      0,
    ),
  }));
  res.json(
    GetDashboardSummaryResponse.parse({
      totalApprovedAmount,
      totalDisbursedAmount,
      totalConfirmedCompleteAmount,
      flaggedAnomalies: items.reduce((sum, item) => sum + item.anomalyCount, 0),
      projectCount: items.length,
      completionRate: totalApprovedAmount ? (totalConfirmedCompleteAmount / totalApprovedAmount) * 100 : 0,
      sectorBreakdown,
      severityBreakdown,
    }),
  );
});

router.get("/projects", async (req, res): Promise<void> => {
  const parsed = GetProjectsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { projects, recordsByProject, anomaliesByProject } = await loadDerivedData();
  const items = projects
    .filter((project) => !parsed.data.ward || project.ward === parsed.data.ward)
    .filter((project) => !parsed.data.sector || project.sector === parsed.data.sector)
    .filter((project) => parsed.data.fiscalYear === undefined || project.fiscalYear === parsed.data.fiscalYear)
    .filter((project) => !parsed.data.status || project.status === parsed.data.status)
    .map((project) =>
      toListItem(project, recordsByProject.get(project.id) ?? [], anomaliesByProject.get(project.id) ?? []),
    );
  res.json(GetProjectsResponse.parse(items));
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const parsed = GetProjectParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { projectById, recordsByProject, anomaliesByProject } = await loadDerivedData();
  const project = projectById.get(parsed.data.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const records = recordsByProject.get(project.id) ?? [];
  const projectAnomalies = anomaliesByProject.get(project.id) ?? [];
  const auditor = records.find((record) => record.origin === "AUDITOR");
  const response = {
    ...toListItem(project, records, projectAnomalies),
    normalizedTitle: project.normalizedTitle,
    confirmedCompleteAmount: auditor?.status === "COMPLETE" ? auditor.amount ?? 0 : 0,
    sources: records.map((record) => ({
      id: record.id,
      origin: record.origin,
      reportedTitle: record.reportedTitle,
      amount: record.amount,
      date: record.date,
      status: record.status,
      notes: record.notes,
      hasTitleMismatch: record.reportedTitle.toLowerCase() !== project.normalizedTitle.toLowerCase(),
      hasAmountMismatch:
        record.amount !== null &&
        record.origin !== "AUDITOR" &&
        Math.abs(record.amount - project.approvedAmount) > Math.max(project.approvedAmount * 0.05, 1),
    })),
    anomalies: projectAnomalies.map((anomaly) => toAnomaly(anomaly, projectById)),
  };
  res.json(GetProjectResponse.parse(response));
});

router.get("/anomalies", async (req, res): Promise<void> => {
  const parsed = GetAnomaliesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { projectById } = await loadDerivedData();
  const rows = await db.select().from(anomaliesTable).orderBy(asc(anomaliesTable.detectedAt));
  const filtered = rows
    .filter((anomaly) => !parsed.data.severity || anomaly.severity === parsed.data.severity)
    .filter((anomaly) => !parsed.data.type || anomaly.type === parsed.data.type)
    .sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))
    .map((anomaly) => toAnomaly(anomaly, projectById));
  res.json(GetAnomaliesResponse.parse(filtered));
});

router.get("/filters/options", async (_req, res): Promise<void> => {
  const { projects } = await loadProjectRows().then((rows) => ({ projects: rows }));
  const [anomalies] = await Promise.all([db.select().from(anomaliesTable)]);
  res.json(
    GetFilterOptionsResponse.parse({
      wards: [...new Set(projects.map((project) => project.ward))].sort(),
      sectors: [...new Set(projects.map((project) => project.sector))],
      fiscalYears: [...new Set(projects.map((project) => project.fiscalYear))].sort((a, b) => b - a),
      statuses: [...new Set(projects.map((project) => project.status))],
      anomalyTypes: [...new Set(anomalies.map((anomaly) => anomaly.type))],
      severities: ["LOW", "MEDIUM", "HIGH"],
    }),
  );
});

export default router;