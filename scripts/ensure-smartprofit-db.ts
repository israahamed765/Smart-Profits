import pg from "pg";
import { databaseUrl } from "@/server/db/postgres";

async function main() {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL missing");
  const admin = url.replace(/\/[^/]+$/, "/postgres");
  const client = new pg.Client({ connectionString: admin, connectionTimeoutMillis: 4000 });
  await client.connect();
  const dbs = await client.query("SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY 1");
  console.log(JSON.stringify({ databases: dbs.rows.map((row) => row.datname) }));
  if (!dbs.rows.some((row) => row.datname === "smartprofit")) {
    await client.query("CREATE DATABASE smartprofit");
    console.log("created database smartprofit");
  } else {
    console.log("database smartprofit already exists");
  }
  await client.end();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
