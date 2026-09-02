import { eq, sql } from "drizzle-orm";
import {
  db,
  anomaliesTable,
  constituenciesTable,
  projectsTable,
  sourceRecordsTable,
} from "@workspace/db";
import { logger } from "./lib/logger";

async function seed() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(constituenciesTable);
  if (Number(count) > 0) {
    logger.info("Fund Tracker seed data already exists");
    return;
  }

  const [kisumuEast, nyakach, mwingiWest, kajiadoNorth] = await db
    .insert(constituenciesTable)
    .values([
      { name: "Kisumu East", county: "Kisumu" },
      { name: "Nyakach", county: "Kisumu" },
      { name: "Mwingi West", county: "Kitui" },
      { name: "Kajiado North", county: "Kajiado" },
    ])
    .returning();

  const projects = await db
    .insert(projectsTable)
    .values([
      {
        constituencyId: kisumuEast.id,
        ward: "Kolwa Central",
        title: "Miwani Primary School Classrooms",
        normalizedTitle: "Miwani Primary School Classrooms",
        sector: "EDUCATION",
        fiscalYear: 2023,
        approvedAmount: 2400000,
        status: "COMPLETE",
      },
      {
        constituencyId: nyakach.id,
        ward: "North Nyakach",
        title: "Kanyakwar Borehole Rehabilitation",
        normalizedTitle: "Kanyakwar Borehole Rehabilitation",
        sector: "WATER",
        fiscalYear: 2023,
        approvedAmount: 3200000,
        status: "IN_PROGRESS",
      },
      {
        constituencyId: mwingiWest.id,
        ward: "Kyuso",
        title: "Ahero–Awasi Access Road",
        normalizedTitle: "Ahero Awasi Access Road",
        sector: "ROADS",
        fiscalYear: 2024,
        approvedAmount: 8200000,
        status: "IN_PROGRESS",
      },
      {
        constituencyId: kajiadoNorth.id,
        ward: "Olkiramatian",
        title: "Kibwezi Health Centre Maternity Wing",
        normalizedTitle: "Kibwezi Health Centre Maternity Wing",
        sector: "HEALTH",
        fiscalYear: 2024,
        approvedAmount: 6100000,
        status: "COMPLETE",
      },
      {
        constituencyId: mwingiWest.id,
        ward: "Migwani",
        title: "Migwani Market Shed",
        normalizedTitle: "Migwani Market Shed",
        sector: "AGRICULTURE",
        fiscalYear: 2022,
        approvedAmount: 1850000,
        status: "STALLED",
      },
    ])
    .returning();

  await db.insert(sourceRecordsTable).values([
    { projectId: projects[0].id, origin: "FUND_COMMITTEE", reportedTitle: "Miwani Primary School 2 New Classrooms", amount: 2400000, date: "2023-09-18", status: "COMPLETE", notes: "Committee report marks practical completion." },
    { projectId: projects[0].id, origin: "BUDGET_OFFICE", reportedTitle: "Miwani Primary School Classrooms", amount: 2400000, date: "2023-08-04", status: "DISBURSED", notes: "Full approved allocation released." },
    { projectId: projects[0].id, origin: "AUDITOR", reportedTitle: "Miwani PS Classroom Block", amount: 2400000, date: "2024-02-16", status: "COMPLETE", notes: "Physical verification completed." },
    { projectId: projects[1].id, origin: "FUND_COMMITTEE", reportedTitle: "Kanyakwar Borehole", amount: 3200000, date: "2023-11-02", status: "IN_PROGRESS", notes: "Pump installation pending." },
    { projectId: projects[1].id, origin: "BUDGET_OFFICE", reportedTitle: "Kanyakwar Borehole Rehabilitation", amount: 2100000, date: "2023-10-20", status: "DISBURSED", notes: "Partial release recorded." },
    { projectId: projects[1].id, origin: "AUDITOR", reportedTitle: "Kanyakwar Water Point", amount: null, date: "2024-05-10", status: "NO RECORD", notes: "No completion evidence found in audit schedule." },
    { projectId: projects[2].id, origin: "FUND_COMMITTEE", reportedTitle: "Ahero Awasi Road Improvement", amount: 8200000, date: "2024-02-12", status: "IN_PROGRESS", notes: "Works reported at 58 percent." },
    { projectId: projects[2].id, origin: "BUDGET_OFFICE", reportedTitle: "Ahero–Awasi Access Road", amount: 7500000, date: "2024-01-18", status: "DISBURSED", notes: "Release is below approved amount." },
    { projectId: projects[2].id, origin: "AUDITOR", reportedTitle: "Awasi Ahero Road", amount: 7500000, date: "2024-09-03", status: "IN_PROGRESS", notes: "Site visit found works ongoing." },
    { projectId: projects[3].id, origin: "FUND_COMMITTEE", reportedTitle: "Kibwezi Health Centre Maternity Unit", amount: 6100000, date: "2024-04-09", status: "COMPLETE", notes: "Unit handed over to facility." },
    { projectId: projects[3].id, origin: "BUDGET_OFFICE", reportedTitle: "Kibwezi Health Centre Maternity Wing", amount: 6100000, date: "2024-03-22", status: "DISBURSED", notes: "Full allocation released." },
    { projectId: projects[3].id, origin: "AUDITOR", reportedTitle: "Kibwezi HC Maternity Wing", amount: 6100000, date: "2024-08-14", status: "COMPLETE", notes: "Operational and in use at audit date." },
    { projectId: projects[4].id, origin: "FUND_COMMITTEE", reportedTitle: "Migwani Open Air Market Shed", amount: 1850000, date: "2022-11-15", status: "STALLED", notes: "Construction stopped after foundation works." },
    { projectId: projects[4].id, origin: "BUDGET_OFFICE", reportedTitle: "Migwani Market Shed", amount: 1850000, date: "2022-08-02", status: "DISBURSED", notes: "Full allocation marked as disbursed." },
    { projectId: projects[4].id, origin: "AUDITOR", reportedTitle: "Migwani Market Shade", amount: null, date: "2023-06-19", status: "NO RECORD", notes: "Auditor could not verify completion." },
  ]);

  await db.insert(anomaliesTable).values([
    { projectId: projects[0].id, type: "DUPLICATE_NAME", severity: "LOW", detail: "The three sources refer to the same classroom block using three different titles.", detectedAt: "2024-02-16" },
    { projectId: projects[1].id, type: "DISBURSED_NO_COMPLETION", severity: "HIGH", detail: "KSh 2.1M is recorded as disbursed, but the auditor has no completion evidence for the borehole.", detectedAt: "2024-05-10" },
    { projectId: projects[1].id, type: "AMOUNT_MISMATCH", severity: "MEDIUM", detail: "The budget office records KSh 2.1M against a KSh 3.2M approved allocation.", detectedAt: "2024-05-10" },
    { projectId: projects[2].id, type: "AMOUNT_MISMATCH", severity: "HIGH", detail: "The budget office reports KSh 7.5M disbursed, KSh 700K below the approved amount.", detectedAt: "2024-09-03" },
    { projectId: projects[2].id, type: "TIMING_GAP", severity: "MEDIUM", detail: "The auditor's September site visit still found works in progress after the January disbursement.", detectedAt: "2024-09-03" },
    { projectId: projects[4].id, type: "DISBURSED_NO_COMPLETION", severity: "HIGH", detail: "The full KSh 1.85M allocation is marked disbursed, but no completed market shed was verified.", detectedAt: "2023-06-19" },
    { projectId: projects[4].id, type: "DUPLICATE_NAME", severity: "LOW", detail: "The committee and auditor use different names for the market structure, making reconciliation harder.", detectedAt: "2023-06-19" },
  ]);

  logger.info({ projectCount: projects.length }, "Seeded Fund Tracker example data");
}

seed()
  .catch((error) => {
    logger.error({ err: error }, "Failed to seed Fund Tracker data");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$client.end();
  });