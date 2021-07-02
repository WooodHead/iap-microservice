import { Database } from "./Database";
import { DummyDB } from "./DummyDB";
import { MySQL } from "./MySQL";

let db: Database = new DummyDB();

if (process.env.DATABASE_ENGINE === "mysql") {
  db = new MySQL();
}

export default db;
