import { createHash } from "node:crypto";

export const initialSchema = `
    CREATE TABLE IF NOT EXISTS admins(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,ordinal BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE);
    CREATE TABLE IF NOT EXISTS admin_sessions(hash TEXT PRIMARY KEY,admin_id TEXT REFERENCES admins(id),csrf TEXT,expires BIGINT);
    CREATE TABLE IF NOT EXISTS apps(id TEXT PRIMARY KEY,owner TEXT REFERENCES admins(id),name TEXT NOT NULL,draft TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,published INTEGER,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,app_id TEXT REFERENCES apps(id),name TEXT,kind TEXT,config TEXT);
    CREATE TABLE IF NOT EXISTS releases(id TEXT PRIMARY KEY,app_id TEXT REFERENCES apps(id),version INTEGER,document TEXT,checksum TEXT,created TEXT,UNIQUE(app_id,version));
    CREATE TABLE IF NOT EXISTS runtime_keys(id TEXT PRIMARY KEY,app_id TEXT REFERENCES apps(id),label TEXT,hash TEXT UNIQUE,prefix TEXT,revoked INTEGER NOT NULL DEFAULT 0,created TEXT);
    CREATE TABLE IF NOT EXISTS runtime_users(id TEXT PRIMARY KEY,app_id TEXT REFERENCES apps(id),email TEXT,password TEXT,name TEXT,verified INTEGER NOT NULL DEFAULT 0,UNIQUE(app_id,email));
    CREATE TABLE IF NOT EXISTS runtime_sessions(id TEXT PRIMARY KEY,app_id TEXT REFERENCES apps(id),user_id TEXT REFERENCES runtime_users(id),refresh TEXT,expires BIGINT);
    CREATE TABLE IF NOT EXISTS spent_refresh(hash TEXT PRIMARY KEY,session_id TEXT,expires BIGINT);
    CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,app_id TEXT REFERENCES apps(id),user_id TEXT,purpose TEXT,code TEXT,expires BIGINT,attempts INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,app_id TEXT REFERENCES apps(id),content TEXT,created TEXT);
    CREATE TABLE IF NOT EXISTS invites(hash TEXT PRIMARY KEY,email TEXT,expires BIGINT,used INTEGER NOT NULL DEFAULT 0,created_by TEXT);
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,app_id TEXT,actor TEXT,event TEXT,created TEXT);


      CREATE TABLE IF NOT EXISTS commerce_products(app_id TEXT REFERENCES apps(id),id TEXT,name TEXT,description TEXT,category TEXT,price INTEGER NOT NULL CHECK(price>=0),stock INTEGER NOT NULL CHECK(stock>=0),image TEXT,PRIMARY KEY(app_id,id));
      CREATE TABLE IF NOT EXISTS commerce_cart_versions(app_id TEXT,user_id TEXT,version INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(app_id,user_id));
      CREATE TABLE IF NOT EXISTS commerce_cart(app_id TEXT,user_id TEXT,product_id TEXT,quantity INTEGER NOT NULL CHECK(quantity>0),PRIMARY KEY(app_id,user_id,product_id));
      CREATE TABLE IF NOT EXISTS commerce_orders(id TEXT PRIMARY KEY,app_id TEXT REFERENCES apps(id),user_id TEXT,total INTEGER,currency TEXT,status TEXT,mode TEXT,checkout_key TEXT,fingerprint TEXT,address TEXT,items TEXT,session_id TEXT,created TEXT,UNIQUE(app_id,user_id,checkout_key));
      CREATE TABLE IF NOT EXISTS commerce_events(id TEXT PRIMARY KEY,created BIGINT);
      CREATE TABLE IF NOT EXISTS commerce_notifications(id TEXT PRIMARY KEY,app_id TEXT,user_id TEXT,title TEXT,body TEXT,screen_id TEXT,order_id TEXT,created TEXT,read INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS push_devices(app_id TEXT,user_id TEXT,token_hash TEXT,token TEXT,platform TEXT,updated BIGINT,PRIMARY KEY(app_id,token_hash));
    
CREATE TABLE IF NOT EXISTS oauth_attempts(state_hash TEXT PRIMARY KEY,app_id TEXT,config TEXT,expires BIGINT,handoff_hash TEXT UNIQUE,handoff TEXT);
      CREATE TABLE IF NOT EXISTS oauth_identities(app_id TEXT,provider TEXT,subject TEXT,user_id TEXT,PRIMARY KEY(app_id,provider,subject));
CREATE TABLE IF NOT EXISTS http_services(app_id TEXT,id TEXT,config TEXT,PRIMARY KEY(app_id,id));
CREATE TABLE IF NOT EXISTS push_delivery(notification_id TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,next_attempt BIGINT NOT NULL DEFAULT 0,completed INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS push_sessions(app_id TEXT,token_hash TEXT,session_id TEXT,PRIMARY KEY(app_id,token_hash));
`;
export const platformSchema = `
CREATE TABLE IF NOT EXISTS ai_credentials(owner TEXT REFERENCES admins(id),provider TEXT,config TEXT,PRIMARY KEY(owner,provider));
CREATE TABLE IF NOT EXISTS code_modules(app_id TEXT REFERENCES apps(id),id TEXT,kind TEXT,source TEXT,revision INTEGER NOT NULL DEFAULT 1,published_source TEXT,published_revision INTEGER,PRIMARY KEY(app_id,id));
CREATE TABLE IF NOT EXISTS app_links(app_id TEXT PRIMARY KEY REFERENCES apps(id),config TEXT);
CREATE TABLE IF NOT EXISTS notification_destinations(notification_id TEXT PRIMARY KEY,query TEXT NOT NULL DEFAULT '{}');
`;

export const migrations = [
  { version: 1, name: "studio-foundation", sql: initialSchema },
  { version: 2, name: "platform-extensions", sql: platformSchema },
  {
    version: 3,
    name: "generic-notifications",
    sql: `
    ALTER TABLE commerce_notifications RENAME TO notifications;
    CREATE VIEW commerce_notifications AS SELECT * FROM notifications;
  `,
  },
  {
    version: 4,
    name: "release-dependencies",
    sql: `
    CREATE TABLE release_dependencies(app_id TEXT NOT NULL REFERENCES apps(id),version INTEGER NOT NULL,config TEXT NOT NULL,PRIMARY KEY(app_id,version));
  `,
  },
];

// Called under the store's transaction and schema-specific advisory lock.
export async function applyMigrations(query) {
  await query(
    `CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,name TEXT NOT NULL,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  for (const migration of migrations) {
    const checksum = createHash("sha256").update(migration.sql).digest("hex");
    const row = (
      await query("SELECT checksum FROM schema_migrations WHERE version=$1", [
        migration.version,
      ])
    ).rows[0];
    if (row) {
      if (row.checksum !== checksum)
        throw new Error(
          `Database migration ${migration.version} has changed after application.`,
        );
      continue;
    }
    await query(migration.sql);
    await query(
      "INSERT INTO schema_migrations(version,name,checksum) VALUES($1,$2,$3)",
      [migration.version, migration.name, checksum],
    );
  }
}
